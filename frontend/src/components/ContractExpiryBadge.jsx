import styles from "../assets/contractExpiry.module.css";
import { describeContractExpiry } from "../utils/contractExpiry.js";

/**
 * "N days left" on a contract, in one place.
 *
 * Every surface that shows a contract uses this, so the wording and the colour
 * rules cannot drift apart between the admin's Contracts page, the teacher's
 * Students page, the student Dashboard, the student Calendar and the student
 * account page.
 *
 * Renders nothing when there is no deadline, rather than a placeholder - a
 * package created before contracts had a term and no package at all look
 * identical in this data, and inventing a value would mislead.
 *
 * @param {object} props
 * @param {string|Date|null} props.expiresAt the contract deadline
 * @param {string} [props.size] "sm" for a dense table cell, default for a card
 * @param {boolean} [props.showDate] also render the exact date
 */
export default function ContractExpiryBadge({ expiresAt, size = "md", showDate = false }) {
  const info = describeContractExpiry(expiresAt);
  if (info.state === "none") return null;

  return (
    <span
      className={`${styles.badge} ${styles[info.tone]} ${size === "sm" ? styles.sm : ""}`}
      title={info.detail}
    >
      {info.label}
      {showDate && <span className={styles.date}>{info.detail}</span>}
    </span>
  );
}