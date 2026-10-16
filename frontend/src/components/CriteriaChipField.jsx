import styles from "./CriteriaChipField.module.css";

/**
 * One multi-select criteria field, rendered as checkbox chips.
 *
 * Shared by the Create Student, Create Teacher and Calendar contract-request
 * forms so all three look and behave identically - which is the point, because
 * the matcher compares these values against each other.
 *
 * Uses native checkboxes (visually hidden, not replaced) so keyboard and
 * screen-reader behaviour comes for free. Each chip shows a check when selected.
 */
export default function CriteriaChipField({
  legend,
  hint,
  options = [],
  selected = [],
  onToggle,
  emptyMessage,
  name,
  id,
}) {
  const selectedValues = Array.isArray(selected) ? selected : [];
  const isSelected = (value) => selectedValues.includes(value);

  return (
    <fieldset className={styles.field} id={id}>
      <legend className={styles.label}>{legend}</legend>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {options.length ? (
        <div className={styles.chips}>
          {options.map(([value, label]) => {
            const active = isSelected(value);
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
                <span className={styles.mark} aria-hidden="true">{active ? "✓" : ""}</span>
                <span className={styles.chipText}>{label}</span>
                <span className={styles.srOnly}>{active ? ", selected" : ""}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className={styles.empty}>{emptyMessage}</p>
      )}
    </fieldset>
  );
}
