/**
 * The closing review of a finished contract.
 *
 * A contract is finished when every class has been used. At that point both
 * people get one review:
 *   - the teacher scores the student on the five level criteria and the level is
 *     computed from those scores, never picked by hand;
 *   - the student rates the teacher on five teaching criteria.
 *
 * The page is deliberately separate from the calendar. The old flow interrupted
 * the teacher in the last class with a proficiency dropdown. A closing review is
 * not part of a lesson, and it should not depend on which class happens to be the
 * last one.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import styles from "../assets/contractReview.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";
import {
  LEVEL_EVALUATION_CRITERIA,
  LEVEL_SCORE_MAX,
  LEVEL_SCORE_MIN,
  LEVEL_SCORE_SCALE,
  computeProficiencyLevel,
  createEmptyLevelScores,
  formatComputedLevel,
} from "../utils/proficiencyEvaluation.js";
import {
  REVIEW_SCORE_MAX,
  REVIEW_SCORE_MIN,
  REVIEW_SCORE_SCALE,
  STUDENT_REVIEW_CRITERIA,
  averageReviewScores,
  createEmptyReviewScores,
} from "../utils/contractReview.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import { readStoredUser } from "../utils/sessionUser.js";

const API = API_BASE_URL;

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function Stars({ value, label }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className={styles.stars} aria-label={label || `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={star <= rounded ? styles.starOn : styles.starOff}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </span>
  );
}

function ScoreChips({ criteria, scores }) {
  if (!scores) return null;
  return (
    <div className={styles.scoreChips}>
      {criteria.map(({ key, shortLabel, label }) => (
        <span key={key} className={styles.scoreChip}>
          {shortLabel || label}: <strong>{scores[key]}</strong>/{LEVEL_SCORE_MAX}
        </span>
      ))}
    </div>
  );
}

function ReviewBlock({ title, review, kind, emptyText }) {
  if (!review) {
    return (
      <div className={styles.reviewBlock}>
        <div className={styles.reviewBlockHead}>
          <h4>{title}</h4>
          <span className={styles.notYet}>Not submitted</span>
        </div>
        <p className={styles.reviewEmpty}>{emptyText}</p>
      </div>
    );
  }

  const criteria =
    kind === "teacher" ? LEVEL_EVALUATION_CRITERIA : STUDENT_REVIEW_CRITERIA;
  const submittedOn = formatDate(review.submitted_at);

  return (
    <div className={styles.reviewBlock}>
      <div className={styles.reviewBlockHead}>
        <h4>{title}</h4>
        <span className={styles.submittedOn}>{submittedOn}</span>
      </div>

      <div className={styles.reviewRatingRow}>
        <Stars value={review.average} label={`${Number(review.average || 0).toFixed(1)} out of 5`} />
        <strong>{Number(review.average || 0).toFixed(1)} / 5</strong>
        {kind === "teacher" && review.computed_level ? (
          <span className={styles.levelPill}>
            Level: {formatComputedLevel(review.computed_level)}
          </span>
        ) : null}
      </div>

      <ScoreChips criteria={criteria} scores={review.scores} />

      {review.comments ? (
        <p className={styles.reviewComment}>{review.comments}</p>
      ) : (
        <p className={styles.reviewEmpty}>No written comment.</p>
      )}
    </div>
  );
}

export default function ContractReview() {
  const { notify } = useNotification() || {};
  const navigate = useNavigate();
  const user = readStoredUser() || {};
  const currentUserId = user.id ?? user.user_id ?? user.userId ?? null;
  const role = String(user.role || "").toLowerCase();
  const isTeacher = role === "teacher";

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeReview, setActiveReview] = useState(null);
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = async () => {
    if (!currentUserId || !["teacher", "student"].includes(role)) return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await axios.get(`${API}/api/contract-reviews`);
      setReviews(response.data?.reviews || []);
    } catch (err) {
      console.error(err);
      setReviews([]);
      setLoadError(err?.response?.data?.message || "Could not load contract reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !currentUserId) {
      navigate("/");
      return;
    }
    if (!["teacher", "student"].includes(role)) {
      navigate(role === "admin" ? "/AdminDashboard" : "/");
      return;
    }
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, role]);

  const pendingCount = useMemo(
    () => reviews.filter((review) => review.pending_for_you).length,
    [reviews]
  );

  const orderedReviews = useMemo(
    () =>
      [...reviews].sort((a, b) => {
        if (a.pending_for_you !== b.pending_for_you) return a.pending_for_you ? -1 : 1;
        const aTime = new Date(a.completed_at || 0).getTime() || 0;
        const bTime = new Date(b.completed_at || 0).getTime() || 0;
        return bTime - aTime;
      }),
    [reviews]
  );

  const computedLevel = useMemo(
    () => (isTeacher && activeReview ? computeProficiencyLevel(scores) : null),
    [activeReview, isTeacher, scores]
  );

  const studentAverage = useMemo(
    () => (!isTeacher && activeReview ? averageReviewScores(scores) : null),
    [activeReview, isTeacher, scores]
  );

  const criteria = isTeacher ? LEVEL_EVALUATION_CRITERIA : STUDENT_REVIEW_CRITERIA;
  const scoreScale = isTeacher ? LEVEL_SCORE_SCALE : REVIEW_SCORE_SCALE;
  const scoreMin = isTeacher ? LEVEL_SCORE_MIN : REVIEW_SCORE_MIN;
  const scoreMax = isTeacher ? LEVEL_SCORE_MAX : REVIEW_SCORE_MAX;
  const canSubmit = isTeacher ? Boolean(computedLevel) : studentAverage != null;

  const openReview = (review) => {
    setActiveReview(review);
    setScores(isTeacher ? createEmptyLevelScores() : createEmptyReviewScores());
    setComments("");
    setFormError("");
  };

  const closeReview = () => {
    if (submitting) return;
    setActiveReview(null);
    setScores({});
    setComments("");
    setFormError("");
  };

  const updateScore = (key, value) => {
    setScores((current) => ({ ...current, [key]: value }));
  };

  const submitReview = async () => {
    if (!activeReview) return;
    if (!canSubmit) {
      setFormError(
        isTeacher
          ? "Score all five criteria before submitting the final evaluation."
          : "Rate all five criteria before submitting your feedback."
      );
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const endpoint = isTeacher ? "teacher" : "student";
      const response = await axios.post(
        `${API}/api/contract-reviews/${activeReview.package_id}/${endpoint}`,
        { scores, comments }
      );

      notify?.(
        response.data?.message ||
          (isTeacher ? "Final evaluation submitted." : "Thank you for rating your teacher."),
        "success"
      );
      setActiveReview(null);
      setScores({});
      setComments("");
      await loadReviews();
    } catch (err) {
      setFormError(err?.response?.data?.message || "Could not submit your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.kicker}>{isTeacher ? "Closing evaluation" : "Your feedback"}</p>
          <h1>{isTeacher ? "Contract reviews" : "How were your classes?"}</h1>
          <p className={styles.heroText}>
            {isTeacher
              ? "When a student finishes every class in their contract, score their final level and leave feedback. The proficiency level is worked out from the five criteria, so it is a judgement you can explain rather than a level you pick by hand."
              : "When your contract is complete, tell us how your teacher did. Your rating helps JEN Academia keep every class useful and kind."}
          </p>
          {!loading && reviews.length > 0 ? (
            <div className={styles.heroStats}>
              <span className={styles.statPill}>
                {pendingCount > 0
                  ? `${pendingCount} waiting for you`
                  : "You are all caught up"}
              </span>
              <span className={styles.statMuted}>
                {reviews.length} completed contract{reviews.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
        </header>

        {loadError ? <div className={styles.errorBanner}>{loadError}</div> : null}

        {loading ? (
          <div className={styles.loadingCard}>Loading contract reviews...</div>
        ) : loadError ? null : reviews.length === 0 ? (
          <section className={styles.emptyCard}>
            <span className={styles.emptyIcon} aria-hidden="true">📝</span>
            <h2>No completed contracts yet</h2>
            <p>
              This page opens when every class in a contract has been used. Then both
              the teacher and the student can review each other.
            </p>
          </section>
        ) : (
          <div className={styles.reviewList}>
            {orderedReviews.map((review) => {
              const otherName = isTeacher ? review.student_name : review.teacher_name;
              const otherLabel = isTeacher ? "Student" : "Teacher";
              const statusLabel = review.pending_for_you
                ? "Waiting for you"
                : review.review_complete
                  ? "Complete"
                  : `Waiting for ${otherName}`;

              return (
                <article key={review.review_id} className={styles.reviewCard}>
                  <div className={styles.reviewHead}>
                    <div className={styles.person}>
                      <span className={styles.avatar} aria-hidden="true">
                        {initials(otherName)}
                      </span>
                      <div>
                        <p className={styles.personRole}>{otherLabel}</p>
                        <h2 className={styles.personName}>{otherName}</h2>
                        <p className={styles.personMeta}>
                          {review.total_classes} class{review.total_classes === 1 ? "" : "es"} completed
                          {review.completed_at ? ` · ${formatDate(review.completed_at)}` : ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`${styles.statusPill} ${
                        review.pending_for_you
                          ? styles.statusPending
                          : review.review_complete
                            ? styles.statusComplete
                            : styles.statusWaiting
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className={styles.progressTrack} aria-hidden="true">
                    <span className={styles.progressFill} style={{ width: "100%" }} />
                  </div>

                  <div className={styles.reviewActions}>
                    {review.pending_for_you ? (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => openReview(review)}
                      >
                        {isTeacher ? "Score final level" : "Rate your teacher"}
                      </button>
                    ) : (
                      <span className={styles.actionNote}>
                        {review.review_complete
                          ? "Both of you have submitted a review."
                          : "Your review is in. The other review will appear here when it is submitted."}
                      </span>
                    )}
                  </div>

                  <div className={styles.reviewGrid}>
                    <ReviewBlock
                      title={isTeacher ? "Your evaluation of the student" : "Teacher's evaluation"}
                      review={review.teacher_review}
                      kind="teacher"
                      emptyText={
                        isTeacher && !review.teacher_review
                          ? "Score the five level criteria to update the student's proficiency level."
                          : "The teacher has not submitted the final evaluation yet."
                      }
                    />
                    <ReviewBlock
                      title={isTeacher ? "Student's feedback" : "Your rating of the teacher"}
                      review={review.student_review}
                      kind="student"
                      emptyText={
                        !isTeacher && !review.student_review
                          ? "Rate the five teaching criteria and leave a comment."
                          : "The student has not submitted their rating yet."
                      }
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {activeReview ? (
        <ModalPortal>
          <div className={styles.modalBackdrop} onClick={closeReview}>
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="contract-review-title"
              className={styles.modal}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHead}>
                <div>
                  <p className={styles.modalKicker}>
                    {isTeacher ? "Final level evaluation" : "Teacher rating"}
                  </p>
                  <h2 id="contract-review-title">
                    {isTeacher
                      ? `How did ${activeReview.student_name} finish?`
                      : `How were your classes with ${activeReview.teacher_name}?`}
                  </h2>
                  <p className={styles.modalSub}>
                    {isTeacher
                      ? "Score each criterion from 1 to 5. The proficiency level is computed from the scores."
                      : "Rate each part of the teaching from 1 to 5. Your teacher sees your feedback."}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={closeReview}
                  aria-label="Close review"
                  disabled={submitting}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.criteriaList}>
                  {criteria.map((criterion) => {
                    const selected = scores?.[criterion.key] ?? null;
                    return (
                      <fieldset key={criterion.key} className={styles.criterion}>
                        <legend>{criterion.label}</legend>
                        <p>{criterion.hint}</p>
                        <div className={styles.scoreScale}>
                          {scoreScale.map((score) => {
                            const active = selected === score;
                            return (
                              <label
                                key={score}
                                className={`${styles.scoreOption} ${
                                  active ? styles.scoreOptionActive : ""
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`contract-score-${criterion.key}`}
                                  value={score}
                                  checked={active}
                                  onChange={() => updateScore(criterion.key, score)}
                                  className={styles.scoreInput}
                                />
                                {score}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>

                <label className={styles.commentField}>
                  <span>Comments (optional)</span>
                  <textarea
                    value={comments}
                    onChange={(event) => setComments(event.target.value)}
                    rows={4}
                    maxLength={4000}
                    placeholder={
                      isTeacher
                        ? "What should the student practise next? What improved?"
                        : "What did your teacher do well? What could be even better?"
                    }
                  />
                </label>

                <div className={styles.previewBox} role="status" aria-live="polite">
                  {isTeacher ? (
                    computedLevel ? (
                      <>
                        <span>Computed proficiency level</span>
                        <strong>{formatComputedLevel(computedLevel.level)}</strong>
                        <small>{computedLevel.reason}</small>
                      </>
                    ) : (
                      <span>
                        Score all five criteria to see the level ({scoreMin}-{scoreMax}).
                      </span>
                    )
                  ) : studentAverage != null ? (
                    <>
                      <span>Overall rating</span>
                      <strong>{studentAverage.toFixed(1)} / 5</strong>
                      <Stars
                        value={studentAverage}
                        label={`${studentAverage.toFixed(1)} out of 5`}
                      />
                    </>
                  ) : (
                    <span>Rate all five criteria to see your overall rating.</span>
                  )}
                </div>

                {formError ? <div className={styles.formError}>{formError}</div> : null}

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeReview}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={submitReview}
                    disabled={submitting || !canSubmit}
                  >
                    {submitting
                      ? "Submitting..."
                      : isTeacher
                        ? "Submit final evaluation"
                        : "Submit rating"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </ModalPortal>
      ) : null}
    </main>
  );
}
