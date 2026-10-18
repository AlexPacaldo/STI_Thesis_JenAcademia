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