import { useEffect, useRef, useState } from "react";
import styles from "./CriteriaChipField.module.css";
import { isSelectedValue, CUSTOM_OPTION_VALUE } from "../utils/matchingCriteria.js";
import ModalPortal from "../utils/ModalPortal.jsx";

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
 * !! The text box is a DIALOGUE, not an inline input. Inlined it rendered in the
 * !! Calendar's ~300px sidebar, where a 60-character field is a few words wide and
 * !! the chips above it are pushed around. A student cannot describe a goal
 * !! properly in a box that narrow, so the feature was present and unusable.
 * !! Clicking Others opens a centred dialog with room to write, on all three
 * !! forms, because it is the same component.
 *
 * Ticking Others does not select it. The value is committed when the dialog is
 * saved, so an empty box can never leave a selection behind - a sentinel with no
 * text reaches the scorer, matches no teacher, and then reports as a criterion
 * the student failed. criteriaWithCustom strips it again on submit as a second
 * line of defence.
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
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  const selectedValues = Array.isArray(selected) ? selected : [];
  const customSelected = selectedValues.includes(CUSTOM_OPTION_VALUE);
  const hasCustomText = Boolean(String(customValue || "").trim());

  // Focus the box as soon as the dialog opens, so it can be typed into without
  // first hunting for the cursor.
  useEffect(() => {
    if (customOpen) inputRef.current?.focus();
  }, [customOpen]);

  // Escape closes, and discards rather than silently keeping a half-typed value.
  useEffect(() => {
    if (!customOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setCustomOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customOpen]);

  function openCustomDialog() {
    setDraft(String(customValue || ""));
    setCustomOpen(true);
  }

  function commitCustom() {
    const text = draft.trim();
    if (!text) return;
    onCustomChange?.(text);
    // Text first, then the tick. The parent may check whether a box has content
    // before honouring the tick, so doing it the other way round would drop the
    // selection it was just asked to add.
    if (!customSelected) onToggle?.(CUSTOM_OPTION_VALUE);
    setCustomOpen(false);
  }

  function clearCustom() {
    // Untick discards the text with it, so it cannot linger invisibly and then
    // reappear as a criterion nobody can see.
    onCustomChange?.("");
    if (customSelected) onToggle?.(CUSTOM_OPTION_VALUE);
    setCustomOpen(false);
  }

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
                onChange={() => (customSelected ? clearCustom() : openCustomDialog())}
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

      {/* What was chosen, shown compactly. Not an input - clicking the chip
          reopens the dialog to edit it. */}
      {allowCustom && hasCustomText ? (
        <button
          type="button"
          onClick={openCustomDialog}
          style={{
            marginTop: 6,
            padding: "4px 8px",
            border: "1px solid #d9e2d9",
            borderRadius: 6,
            background: "#f4f8f5",
            color: "#3c5a48",
            fontSize: "0.82em",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={`${legend}: ${customValue} - click to change`}
        >
          Others: {String(customValue).trim()}
        </button>
      ) : null}

      {customOpen ? (
        <ModalPortal>
          <div
            onClick={() => setCustomOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1200,
              background: "rgba(15, 25, 20, 0.45)",
              display: "grid",
              placeItems: "center",
              padding: 20,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${legend}: other`}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 460,
                background: "#fff",
                borderRadius: 14,
                border: "1px solid #d9e2d9",
                padding: "22px 22px 18px",
                boxShadow: "0 18px 44px rgba(0, 0, 0, 0.22)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  color: "#1d3a2c",
                }}
              >
                {legend}: something else
              </h3>
              <p style={{ margin: "0 0 14px 0", fontSize: "0.88em", color: "#4b5f55", lineHeight: 1.5 }}>
                Describe it in your own words. The academy matches on this text too,
                so the more specific you are the better the match.
              </p>

              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                maxLength={MAX_CUSTOM_LENGTH}
                placeholder="e.g. Prepare for a job interview in three months"
                onKeyDown={(e) => {
                  // Enter submits, Shift+Enter is a newline. A textarea's default
                  // is the opposite, which is a reliable way to lose what someone
                  // just typed.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitCustom();
                  }
                }}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #cbd5cd",
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: "0.95em",
                  resize: "vertical",
                }}
              />

              <div
                style={{
                  marginTop: 6,
                  fontSize: "0.78em",
                  color: draft.trim().length >= MAX_CUSTOM_LENGTH ? "#8c2020" : "#6b7d73",
                }}
              >
                {draft.trim().length}/{MAX_CUSTOM_LENGTH}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                {hasCustomText ? (
                  <button
                    type="button"
                    onClick={clearCustom}
                    style={{
                      padding: "9px 14px",
                      border: "1px solid #e0b4b4",
                      borderRadius: 8,
                      background: "#fff",
                      color: "#8c2020",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                ) : null}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setCustomOpen(false)}
                  style={{
                    padding: "9px 14px",
                    border: "1px solid #cbd5cd",
                    borderRadius: 8,
                    background: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitCustom}
                  disabled={!draft.trim()}
                  style={{
                    padding: "9px 14px",
                    border: "none",
                    borderRadius: 8,
                    background: draft.trim() ? "#1d3a2c" : "#aab6ae",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: draft.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  {customSelected ? "Save" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </fieldset>
  );
}