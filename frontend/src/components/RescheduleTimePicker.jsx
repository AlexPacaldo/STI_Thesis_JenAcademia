import { useId, useState } from "react";
import { rankBookingTimes } from "../utils/bookingTimes.js";
import { describeTimeDistance, humanTime, minutesToTime, timeToMinutes } from "../utils/classTime.js";
import styles from "../assets/studentKid.module.css";

export default function RescheduleTimePicker({ date, times, selectedTime, duration, timezone, loading, onPick }) {
  const inputId = useId();
  const [preferredTime, setPreferredTime] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(3);
  const ranked = rankBookingTimes(times, search);
  const endTime = time => humanTime(minutesToTime(timeToMinutes(time) + duration));
  const exact = ranked.some(time => timeToMinutes(time) === timeToMinutes(search));

  return (
    <div className={styles.preferredTimes}>
      <p className={styles.timeOfDay}>{duration}-minute class · Times in {timezone.replaceAll("_", " ")}</p>
      <form className={styles.preferredTimeForm} onSubmit={event => {
        event.preventDefault();
        setSearch(preferredTime);
        setLimit(3);
      }}>
        <label htmlFor={inputId}>Preferred start time</label>
        <div className={styles.preferredTimeControls}>
          <input id={inputId} type="time" required step="60" value={preferredTime}
            disabled={!date} className={styles.otherTimeInput}
            onChange={event => setPreferredTime(event.target.value)} />
          <button type="submit" className={styles.changeBtn} disabled={!date || loading || !preferredTime}>Find times</button>
        </div>
      </form>
      <p role="status" className={styles.timeOfDay}>
        {!date ? "Choose a new date first."
          : loading ? "Checking available times…"
          : search ? !ranked.length ? "No free times on this day. Please choose another day."
            : exact ? `${humanTime(search)} is available. Select a time below.`
              : `${humanTime(search)} isn't available. Here are the closest available times on this day.`
          : "Enter your preferred start time to find available times nearby."}
      </p>
      {selectedTime && times.includes(selectedTime) && (
        <p className={styles.timeOfDay}>Selected: <strong>{humanTime(selectedTime)}–{endTime(selectedTime)}</strong></p>
      )}
      {search && !loading && ranked.length > 0 && (
        <div className={styles.timeGrid}>
          {ranked.slice(0, limit).map(time => (
            <button key={time} type="button" aria-pressed={selectedTime === time}
              className={`${styles.timeCard} ${selectedTime === time ? styles.timeCardActive : ""}`}
              onClick={() => onPick(time)}>
              <span className={styles.timeText}>{humanTime(time)}</span>
              <span className={styles.timeOfDay}>to {endTime(time)}</span>
              <span className={styles.timeOfDay}>{describeTimeDistance(search, time)}</span>
            </button>
          ))}
        </div>
      )}
      {search && !loading && ranked.length > limit && (
        <button type="button" className={styles.otherTimeToggle} onClick={() => setLimit(value => value + 3)}>Show more times</button>
      )}
    </div>
  );
}
