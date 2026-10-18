/**
 * How long a student contract has left, in words.
 *
 * Shared by every surface that shows one - admin Contracts, Teacher Students,
 * the student Dashboard, the student Calendar and the student account page - so
 * the same contract reads the same way everywhere, and so the wording and the
 * colour rules live in one place instead of five.
 *
 * Days are rounded UP. The deadline is a datetime (purchase time plus three
 * months), so at 22:00 on the final day "0 days left" would be technically
 * correct and completely useless to read.
 */

const MS_PER_DAY = 86400000;

// Matches CONTRACT_EXPIRY_WARNING_DAYS on the server, which is how far ahead the
// student is notified. Inside this window the badge is amber, so the number on
// screen and the warning they already received agree.
export const EXPIRY_SOON_DAYS = 14;

/**
 * @param {string|Date|null} expiresAt
 * @param {Date} [now] injected so the result is testable
 * @returns {{state: string, daysLeft: number|null, label: string, detail: string, tone: string}}
 *   state is "none" | "expired" | "today" | "soon" | "ok"
 */
export function describeContractExpiry(expiresAt, now = new Date()) {
  // No deadline means there is nothing to say. Deliberately not "Not set" as a
  // label: a package created before the term existed and one with no package at
  // all look identical in this data, and inventing a value would be worse than
  // showing nothing.
  if (!expiresAt) {
    return { state: "none", daysLeft: null, label: "", detail: "", tone: "muted" };
  }

  const when = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(when.getTime())) {
    return { state: "none", daysLeft: null, label: "", detail: "", tone: "muted" };
  }

  const daysLeft = Math.ceil((when.getTime() - now.getTime()) / MS_PER_DAY);
  const pretty = when.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (daysLeft < 0) {
    return {
      state: "expired",
      daysLeft,
      label: "Expired",
      detail: `Contract ended ${pretty}`,
      tone: "danger",
    };
  }

  if (daysLeft === 0) {
    return {
      state: "today",
      daysLeft,
      label: "Expires today",
      detail: `Contract ends ${pretty}`,
      tone: "danger",
    };
  }

  if (daysLeft === 1) {
    return {
      state: "soon",
      daysLeft,
      label: "1 day left",
      detail: `Contract ends ${pretty}`,
      tone: "warn",
    };
  }

  if (daysLeft <= EXPIRY_SOON_DAYS) {
    return {
      state: "soon",
      daysLeft,
      label: `${daysLeft} days left`,
      detail: `Contract ends ${pretty}`,
      tone: "warn",
    };
  }

  return {
    state: "ok",
    daysLeft,
    label: `${daysLeft} days left`,
    detail: `Contract ends ${pretty}`,
    tone: "ok",
  };
}

/**
 * The whole contract as one object, for a page that shows it in full.
 *
 * A contract has two independent limits - classes and time - and a status that
 * can contradict the date. The date alone is not enough to decide what to show:
 *
 *   - status "expired" with a future deadline. Possible if the server marked it
 *     early, and it must read as expired. Trusting the date here would tell a
 *     student they have time they do not have.
 *   - status "cancelled" with a deadline still in the future. The date is
 *     meaningless for a cancelled contract, so it must not be presented as
 *     something the student can rely on.
 *   - status "active" with a deadline in the past. The server's sweep normally
 *     prevents this, but if it happens the date is the truth.
 *
 * So status is checked first, then the date, and "cancelled" never inherits a
 * days-left figure at all.
 *
 * Lives here rather than inline in a component so the decision is testable and
 * so another page asking the same question gets the same answer.
 *
 * @param {object} contract
 * @param {*} [contract.packageId] absent means the student has no contract
 * @param {string} [contract.status] "active" | "expired" | "cancelled"
 * @param {string|Date|null} [contract.expiresAt]
 * @param {number} [contract.totalClasses]
 * @param {number} [contract.classesUsed]
 * @param {number} [contract.classesLeft]
 * @param {Date} [now] injected so the result is testable - the second parameter,
 *   matching describeContractExpiry and describeContractBalance rather than
 *   being buried in the object, where it reads as contract data.
 */
export function describeStudentContract({
  packageId = null,
  status = "active",
  expiresAt = null,
  totalClasses = null,
  classesUsed = null,
  classesLeft = null,
} = {}, now = new Date()) {
  // No package at all. Distinct from an expired one, and it has to render as its
  // own thing - a student with no contract needs to be told so, not shown an
  // empty card that looks broken.
  if (packageId == null) {
    return { state: "none", expiry: describeContractExpiry(null, now), total: null, used: null, left: null };
  }

  const total = totalClasses == null ? null : Number(totalClasses) || 0;
  const used = classesUsed == null ? 0 : Number(classesUsed) || 0;
  const left = classesLeft == null
    ? (total == null ? null : Math.max(0, total - used))
    : Math.max(0, Number(classesLeft) || 0);

  const expiry = describeContractExpiry(expiresAt, now);
  const normalized = String(status || "active").toLowerCase();

  if (normalized === "cancelled") {
    // The deadline is dropped rather than shown in a muted style. A cancelled
    // contract has no end date the student should plan around, and printing one
    // invites them to book right up to it.
    return { state: "cancelled", expiry: { ...expiry, daysLeft: null }, total, used, left: null };
  }

  if (normalized === "expired") {
    return { state: "expired", expiry, total, used, left };
  }

  // Active: the date decides, so a deadline that has already passed still reads
  // as expired even if the sweep has not got to it yet.
  const state = expiry.state === "none" ? "ok" : expiry.state === "today" ? "soon" : expiry.state;
  return { state, expiry, total, used, left };
}

/**
 * Classes still available, and whether they are at risk of being lost.
 *
 * The two limits are independent, so this answers "how much can they still book"
 * rather than restating either one - a contract with two classes and three days
 * left needs the number that matters, which is both.
 */
export function describeContractBalance({ classesLeft = 0, expiresAt = null, now = new Date() } = {}) {
  const left = Math.max(0, Number(classesLeft) || 0);
  const expiry = describeContractExpiry(expiresAt, now);

  const atRisk =
    left > 0 && (expiry.state === "expired" || expiry.state === "today" || expiry.state === "soon");

  return {
    classesLeft: left,
    expiry,
    atRisk,
    // Said plainly only when it is true, because "at risk" on every contract
    // would be noise the admin learns to ignore.
    note: atRisk
      ? `${left} class${left === 1 ? "" : "es"} left and the contract ${expiry.state === "expired" ? "has ended" : expiry.state === "today" ? "ends today" : `ends in ${expiry.daysLeft} day${expiry.daysLeft === 1 ? "" : "s"}`}.`
      : "",
  };
}