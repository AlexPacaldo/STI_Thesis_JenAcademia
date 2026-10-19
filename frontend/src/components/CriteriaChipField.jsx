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
 * !! An "Others" dialog was tried here and reverted. The cramped input was a
 * !! symptom, not the disease: the whole contract-request form was rendering
 * !! inside the Calendar's ~300px sidebar, so every field in it was narrow.
 * !! Lifting the form into a window fixes all of them at once, and putting this
 * !! one field in a dialog while its four siblings stayed crammed made the form
 * !! feel like it belonged to two different screens.
 *
 * !! The sentinel is NOT stripped when the box is empty. Doing that here meant
 * !! reading a sibling state value during the toggle, and the component commits
 * !! text before asking to add the tick - so the handler saw the previous text
 * !! and removed the selection it had just been given. criteriaWithCustom
 * !! strips it at merge time instead: once, for every form, where it is the
 * !! value that actually matters.
 *
 * Uses native checkboxes (visually hidden, not replaced) so keyboard and
 * screen-reader behaviour comes for free. Each chip shows a check when selected.
 */

// Re-exported so callers can keep importing it from here.
export { CUSTOM_OPTION_VALUE };

const MAX_CUSTOM_LENGTH = 60;


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
  othersLabel = "Others",
  customPlaceholder = "Describe it in your own words",
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
              <span className={styles.chipText}>{othersLabel}</span>
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
            placeholder={customPlaceholder}
            aria-label={`${legend}: other`}
            maxLength={MAX_CUSTOM_LENGTH}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
