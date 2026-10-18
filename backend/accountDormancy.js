// accountDormancy.js
/**
 * Automatic archiving of accounts nobody has used in a long time.
 *
 * !! Why the clock starts at the END OF THE CONTRACT, not at the last class.
 * !!
 * !! A student can attend nothing for a whole term and still be a customer: work,
 * !! travel, exams. The paid classes are sitting in their package the entire time.
 * !! Counting from the last class would archive people in the middle of the thing
 * !! they paid for. Counting from the contract end asks the real question - has
 * !! this relationship ended, or are they just quiet inside it?
 *
 * !! The thresholds below are deliberately lopsided. Archiving too late costs a
 * !! dormant row in a list. Archiving too early signs a real person out of classes
 * !! they paid for, and quietly reassigns their teacher's students. Those are not
 * !! comparable, so every number here leans late.
 *
 * There is no `last_login` column in this schema and never has been, so "last
 * activity" is derived from what actually happened: classes taught or attended,
 * the contract deadline, requests the person sent, and the availability a teacher
 * marked. An admin's own account is never a candidate - see `isExempt`.
 */

import { CONTRACT_TERM_MONTHS } from "./contractTerms.js";

/**
 * A student whose contract has ENDED is dormant after one further contract term.
 *
 * Written as term x 30 rather than the literal 90 so the intent survives a change
 * to the contract length: this is "one more term of silence after the last one
 * ended", and a hard-coded 90 would quietly stop meaning that.
 */
export const STUDENT_DORMANT_DAYS_AFTER_CONTRACT = CONTRACT_TERM_MONTHS * 30;

/**
 * A student who never bought a contract gets longer still.
 *
 * There is no paid balance to protect and no relationship to lose, but there is
 * also no signal that they ever wanted one - the 180 days is here to catch
 * accounts that were opened by someone who was never going to sign up, not to
 * hurry along somebody who is merely deciding.
 */
export const STUDENT_DORMANT_DAYS_NO_CONTRACT = 180;

/**
 * Teachers are held to a shorter fuse than students.
 *
 * An idle teacher is not just a dormant account - they are the reason a student
 * cannot be matched. Archiving one does not reduce the admin's work, it moves it
 * onto the Students With No Teacher queue. Sixty days is long enough to cover a
 * quiet spell and short enough that a teacher who has genuinely left is not
 * holding their old students for months.
 */
export const TEACHER_DORMANT_DAYS = 60;

/** How the sweep is described in the UI and the logs. */
export const DORMANCY_REASONS = {
  studentContractEnded: "contract ended, no activity since",
  studentNoContract: "account never converted to a contract",
  teacherInactive: "no classes taught or availability marked",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How many days of silence a role needs before its clock runs out.
 *
 * A student is judged on their contract when they have one and on their sign-up
 * date when they do not - the same distinction the threshold names above.
 */
export function dormancyThresholdDays(candidate) {
  if (candidate.role === "teacher") return TEACHER_DORMANT_DAYS;
  return candidate.has_contract ? STUDENT_DORMANT_DAYS_AFTER_CONTRACT : STUDENT_DORMANT_DAYS_NO_CONTRACT;
}

export function dormancyReasonKey(candidate) {
  if (candidate.role === "teacher") return "teacherInactive";
  return candidate.has_contract ? "studentContractEnded" : "studentNoContract";
}

/**
 * Anything that makes an account ineligible no matter how quiet it has been.
 *
 * These are not severity settings, they are facts about the account. A student
 * holding unused classes is someone with money on the account, and archiving them
 * is not a tidiness judgement - it is taking away something they bought.
 */
export function blockingReason(candidate) {
  if (candidate.unused_classes > 0) return "has paid classes left to use";
  if (candidate.pending_contract_requests > 0) return "has a contract request awaiting a decision";
  if (candidate.pending_reschedule_requests > 0) return "has a reschedule request awaiting a decision";
  if (candidate.future_classes > 0) return "has an upcoming class";
  if (candidate.future_availability > 0) return "has marked future availability";
  // A teacher is still someone else's teacher while their student is still
  // paying. Archiving them here would strand that student with nobody.
  if (candidate.role === "teacher" && candidate.paying_students > 0) {
    return "still teaches students with an active contract";
  }
  return null;
}

/**
 * Should this account be archived right now?
 *
 * Pure, and deliberately so. The whole policy - thresholds, ordering of the
 * exclusions, what counts as activity - is testable without a database, which is
 * the only practical way to test the cases that matter: the ones where a paying
 * student is quiet for a year and must NOT be archived.
 *
 * Returns a decision rather than a boolean so the caller can log why.
 */
export function evaluateDormancy(candidate, now = new Date()) {
  const role = candidate.role;

  if (role !== "student" && role !== "teacher") {
    return { eligible: false, reason: "not an archivable role" };
  }

  const blocker = blockingReason(candidate);
  if (blocker) {
    return { eligible: false, reason: blocker };
  }

  const lastActivity = toDate(candidate.last_activity);
  if (!lastActivity) {
    return { eligible: false, reason: "no activity recorded" };
  }

  const thresholdDays = dormancyThresholdDays(candidate);
  const quietDays = Math.floor((now.getTime() - lastActivity.getTime()) / MS_PER_DAY);

  if (quietDays < thresholdDays) {
    return {
      eligible: false,
      reason: `only ${quietDays} days quiet, needs ${thresholdDays}`,
      quietDays,
      thresholdDays,
    };
  }

  return {
    eligible: true,
    reason: DORMANCY_REASONS[dormancyReasonKey(candidate)],
    quietDays,
    thresholdDays,
    dormantSince: lastActivity,
  };
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Read every account that could plausibly be dormant, with the activity and the
 * blocking facts needed to decide.
 *
 * One query, not a query per account. The exclusions are correlated subqueries
 * rather than follow-up reads so the decision for a given account is made from a
 * single consistent snapshot - otherwise an account can be judged against a
 * package that was written a moment after the class count was read.
 */
export async function findDormancyCandidates(pool) {
  const [rows] = await pool.query(
    `SELECT u.user_id,
            u.role,
            u.first_name,
            u.last_name,
            u.email,
            u.created_at,
            GREATEST(
              u.created_at,
              COALESCE((SELECT MAX(c.scheduled_date) FROM classes c WHERE c.student_id = u.user_id), u.created_at),
              COALESCE((SELECT MAX(c.scheduled_date) FROM classes c WHERE c.teacher_id = u.user_id), u.created_at),
              COALESCE((SELECT MAX(sc.expires_at) FROM student_class_packages sc WHERE sc.student_id = u.user_id), u.created_at),
              COALESCE((SELECT MAX(rr.requested_at) FROM reschedule_requests rr WHERE rr.requested_by_id = u.user_id), u.created_at),
              COALESCE((SELECT MAX(cr.requested_at) FROM student_contract_requests cr WHERE cr.student_id = u.user_id), u.created_at),
              COALESCE((SELECT MAX(ta.available_date) FROM teacher_availability ta WHERE ta.teacher_id = u.user_id), u.created_at)
            ) AS last_activity,
            EXISTS(SELECT 1 FROM student_class_packages sc
                    WHERE sc.student_id = u.user_id AND sc.expires_at IS NOT NULL) AS has_contract,
            COALESCE((SELECT SUM(sc.classes_left) FROM student_class_packages sc
                      WHERE sc.student_id = u.user_id AND sc.status = 'active'), 0) AS unused_classes,
            (SELECT COUNT(*) FROM student_contract_requests cr
              WHERE cr.student_id = u.user_id AND cr.status = 'pending') AS pending_contract_requests,
            (SELECT COUNT(*) FROM reschedule_requests rr
              WHERE rr.requested_by_id = u.user_id AND rr.status = 'pending') AS pending_reschedule_requests,
            (SELECT COUNT(*) FROM classes c
              WHERE (c.student_id = u.user_id OR c.teacher_id = u.user_id)
                AND c.scheduled_date >= CURDATE()
                AND c.status = 'scheduled') AS future_classes,
            (SELECT COUNT(*) FROM teacher_availability ta
              WHERE ta.teacher_id = u.user_id AND ta.available_date >= CURDATE()) AS future_availability,
            (SELECT COUNT(*) FROM student_profiles sp
               JOIN student_class_packages sc ON sc.student_id = sp.student_id AND sc.status = 'active'
              WHERE sp.assigned_teacher_id = u.user_id AND sc.classes_left > 0) AS paying_students
     FROM users u
     WHERE u.status = 'active'
       AND u.role IN ('student', 'teacher')`
  );

  return rows;
}

/**
 * Decide, then archive whatever is eligible.
 *
 * Reports both lists on purpose. `archived` alone would hide the near misses,
 * and the accounts that were *not* archived because they are paying customers are
 * the interesting ones - they are the rule doing its job.
 */
export async function archiveDormantAccounts(pool, { now = new Date() } = {}) {
  const candidates = await findDormancyCandidates(pool);
  const archived = [];
  const skipped = [];

  for (const candidate of candidates) {
    const decision = evaluateDormancy(candidate, now);
    const who = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email;

    if (!decision.eligible) {
      skipped.push({ user_id: candidate.user_id, role: candidate.role, name: who, reason: decision.reason });
      continue;
    }

    await pool.query(
      `UPDATE users
       SET status = 'archived', archived_at = ?, archived_reason = ?
       WHERE user_id = ? AND status = 'active'`,
      [now, decision.reason, candidate.user_id]
    );

    archived.push({
      user_id: candidate.user_id,
      role: candidate.role,
      name: who,
      reason: decision.reason,
      quietDays: decision.quietDays,
      thresholdDays: decision.thresholdDays,
    });
  }

  return { archived, skipped, scanned: candidates.length };
}