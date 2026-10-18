import styles from "./CriteriaChipField.module.css";
import { isSelectedValue, CUSTOM_OPTION_VALUE } from "../utils/matchingCriteria.js";

/**
 * One multi-select criteria field, rendered as checkbox chips.
 *
 * Shared by the Create Student, Create Teacher and Calendar contract-request
 * forms so all three look and behave identically - which is the point, because
 * the matcher compares these values against each other.
 *
 * !! That identical behaviour includes the "Others" box. This component accepted
 * !! allowCustom for a long time while the student's contract-request form never
 * !! passed it, so a student could not describe a goal the vocabulary did not
 * !! have while an admin could. The prop being optional is what allowed that to
 * !! go unnoticed; it is still optional, but all three forms now pass it.
 *
 * Uses native checkboxes (visually hidden, not replaced) so keyboard and
 * screen-reader behaviour comes for free. Each chip shows a check when selected.
 */

// Re-exported so callers can keep importing it from here.
export { CUSTOM_OPTION_VALUE };

export default function CriteriaChipField({
  legend,
  hint,
  options = [],
  selected = [],
  onToggle,
  emptyMessage,
  name,
  id,
  prominent = false,
  allowCustom = false,
  customValue = "",
  onCustomChange,
}) {
  const selectedValues = Array.isArray(selected) ? selected : [];
  const customSelected = selectedValues.includes(CUSTOM_OPTION_VALUE);

  return (
    <fieldset className={styles.field} id={id}>
      <legend className={prominent ? `${styles.label} ${styles.labelProminent}` : styles.label}>
        {legend}
      </legend>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {options.length || allowCustom ? (
        <div className={styles.chips}>
          {options.map(([value, label]) => {
            const active = isSelectedValue(selectedValues, value);
            return (
              <label
                key={value}
                className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              >
                <input
                  type="checkbox"
                  name={name}
                  value={value}
                  checked={active}
                  onChange={() => onToggle(value)}
                  className={styles.input}
                />
                <span className={styles.mark} aria-hidden="true" />
                <span className={styles.chipText}>{label}</span>
                <span className={styles.srOnly}>{active ? ", selected" : ""}</span>
              </label>
            );
          })}
          {allowCustom ? (
            <label
              className={`${styles.chip} ${customSelected ? styles.chipActive : ""}`}
            >
              <input
                type="checkbox"
                name={name}
                value={CUSTOM_OPTION_VALUE}
                checked={customSelected}
                onChange={() => onToggle(CUSTOM_OPTION_VALUE)}
                className={styles.input}
              />
              <span className={styles.mark} aria-hidden="true" />
              <span className={styles.chipText}>Others</span>
              <span className={styles.srOnly}>{customSelected ? ", selected" : ""}</span>
            </label>
          ) : null}
        </div>
      ) : (
        <p className={styles.empty}>{emptyMessage}</p>
      )}
      {allowCustom && customSelected ? (
        <div className={styles.customInput}>
          <input
            type="text"
            value={customValue}
            onChange={(e) => onCustomChange?.(e.target.value)}
            placeholder="Describe it"
            aria-label={`${legend}: other`}
            maxLength={60}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
