import { Fragment, useMemo, useState } from "react";
import { BOOKING, CONFIRM } from "../utils/studentCopy.js";
import {
  describeTimeDistance,
  describeTimeOfDay,
  formatLongDate,
  humanTime,
  isPartOfDay,
  minutesToTime,
  timeToMinutes,
} from "../utils/classTime.js";
import styles from "../assets/studentKid.module.css";

/**
 * The booking wizard.
 *
 * !! A lot of the students on this app are children. The old booking form was
 * !! a form for an adult who is reading carefully: a row of days, a grid of
 * !! times, a list of picks and two mode buttons, all on one screen, all at
 * !! once. A child sees a wall and picks nothing.
 * !!
 * !! This is the same booking, told one question at a time:
 * !!
 * !!   1. Which day?        - big cards, one word each
 * !!   2. Which time?       - big buttons, the time in big letters
 * !!   3. Is this right?    - the class, in full, before anything is booked
 * !!
 * !! Everything else follows from that. One question on the screen. Every
 * !! button big enough for a small finger. Every button saying what it does.
 * !! The step the student is on, so they know the screen is not the end of
 * !! it.
 * !!
 * !! Nothing here decides anything. The wizard draws the screens and tells
 * !! the Calendar what was pressed; the Calendar still owns the classes, the
 * !! limits and the booking itself.
 */

/** The screens, in order, for each way of booking. */
const MANUAL_STEPS = ["choose", "day", "time", "check"];
const WEEKLY_STEPS = ["choose", "weekday", "weektime", "found", "check"];

/**
 * The days of the week, Monday first.
 *
 * Monday first because that is the order a school week runs in, and a child
 * counts days from Monday.
 */
const WEEKDAY_CARDS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

/**
 * The three parts of the day a student can ask for.
 *
 * !! A native time picker asks a child to read a clock face he cannot read
 * !! yet, and it asks him to read a number he has to compare against another
 * !! number. "Morning" is one word and it cannot be got wrong. So the three
 * !! big buttons are the three parts of the day, and the "Another time"
 * !! picker is there for the student who wants something more exact.
 */
const TIME_PARTS = ["morning", "afternoon", "evening"];

/** Where the "back" button goes from each screen. */
const PREVIOUS_STEP = {
  day: "choose",
  time: "day",
  check: "time",
  weekday: "choose",
  weekdaytime: "weekday",
  found: "weektime",
};

export default function StudentBookingWizard({
  teacherName = "",
  courseName = "",
  classDuration = 50,
  hasNoClassesLeft = false,
  isSubmitting = false,
  error = "",
  onClearError = () => {},

  days = [],
  availability = {},
  availabilityLoading = false,

  // The month the days come from, and the arrows that move it.
  //
  // !! The wizard draws the screens and tells the Calendar what was pressed.
  // !! It does not keep the month - the Calendar does, because the Calendar
  // !! knows where the student's plan ends and the wizard does not.
  monthName = "",
  canGoPreviousMonth = false,
  canGoNextMonth = false,
  onPreviousMonth = () => {},
  onNextMonth = () => {},

  selectedDate = "",
  onPickDate = () => {},

  timeSlots = [],
  timesLoading = false,
  isTimeBooked = () => false,

  selections = [],
  isSelected = () => false,
  onPickTime = () => {},

  applyMode = "manual",
  onApplyModeChange = () => {},

  weeklyWeekdays = [],
  onToggleWeekday = () => {},
  weeklyTime = "",
  onWeeklyTimeChange = () => {},

  suggestions = [],
  suggestionsTotal = 0,
  onAddSuggestion = () => {},
  onRemoveSelection = () => {},
  onAddAllSuggestions = () => {},
  onFindTimes = () => {},

  onBook = () => {},
  onCancel = () => {},
}) {
  const [step, setStep] = useState("choose");
  const [showOtherTime, setShowOtherTime] = useState(false);
  const [finding, setFinding] = useState(false);

  const weekly = applyMode === "weekly";
  const steps = weekly ? WEEKLY_STEPS : MANUAL_STEPS;
  const visibleSteps = steps.filter((name) => name !== "choose");
  const stepNumber = Math.max(0, visibleSteps.indexOf(step)) + 1;
  const stepTotal = visibleSteps.length;

  // Where "back" goes from here.
  //
  // !! The two ways of booking have different shapes, so the last screen goes
  // !! back to a different place in each: from the check of a one-off class
  // !! to the times, and from the check of a weekly class to the list of
  // !! times that were found.
  const previousStep = weekly && step === "check" ? "found" : PREVIOUS_STEP[step] || "choose";

  // The class a student is booking, once they have picked one.
  const picked = selections[0] || null;

  /**
   * The end of a class, so the summary can say "8:15 AM - 9:05 AM".
   */
  const endTimeFor = (time) => {
    const start = timeToMinutes(time);
    if (start == null) return "";
    return minutesToTime(start + Number(classDuration || 0));
  };

  const goTo = (next) => {
    onClearError();
    setStep(next);
  };

  /**
   * Changing between "one time" and "every week" starts the other one over.
   *
   * The two ways of booking keep different things - a chosen day and time,
   * or a chosen set of days - and carrying one into the other confuses the
   * student about what they have already picked.
   */
  const chooseMode = (mode) => {
    if (mode === applyMode) {
      goTo(mode === "weekly" ? "weekday" : "day");
      return;
    }
    onApplyModeChange(mode);
    onClearError();
    setShowOtherTime(false);
    setStep(mode === "weekly" ? "weekday" : "day");
  };

  /**
   * Find the times for the chosen days.
   *
   * The search belongs to the Calendar - it knows the teacher's plan and the
   * student's limit. The wizard waits for the answer and moves on when the
   * times arrive.
   */
  const handleFindTimes = async () => {
    if (finding) return;
    setFinding(true);
    try {
      const found = await onFindTimes();
      if (found) goTo("found");
    } finally {
      setFinding(false);
    }
  };

  /**
   * Open and close the "another time" picker.
   *
   * !! Whatever was chosen is cleared when the panel opens, and an exact time
   * !! is cleared when the panel closes. A time that is on a hidden input is
   * !! a time the student cannot see, and the screen must not quietly book
   * !! for a choice they cannot see.
   */
  const toggleOtherTime = () => {
    if (showOtherTime) {
      if (!isPartOfDay(weeklyTime)) onWeeklyTimeChange("");
      setShowOtherTime(false);
      return;
    }
    setShowOtherTime(true);
    onWeeklyTimeChange("");
  };

  /* ------------------------------------------------------------- the days */

  const dayStatus = (key) => {
    const status = availability ? availability[key] : undefined;
    if (status === "available") return "free";
    if (status === "unavailable") return "busy";
    return "none";
  };

  const freeDays = useMemo(
    () => days.filter((day) => dayStatus(day.key) === "free").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, availability]
  );

  /* ------------------------------------------------------- the day screen */

  /**
   * The month the days come from, and the arrows that move it.
   *
   * !! The strip of days used to stop a fortnight from today, so a student
   * !! whose plan runs for three months was shown two weeks of a
   * !! three-month plan - and a free Saturday in November was a day they
   * !! could not see and did not know they could have. The arrows move a
   * !! month at a time, and they stop at the end of the plan, because a day
   * !! past it is a day they cannot book.
   *
   * !! It is on the screen even when the month has nothing in it. A student
   * !! whose teacher's November is empty has to be able to reach December
   * !! without closing the window.
   */
  const renderMonthBar = () => (
    <div className={styles.monthBar}>
      <button
        type="button"
        className={styles.monthBtn}
        onClick={onPreviousMonth}
        disabled={!canGoPreviousMonth}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className={styles.monthName}>{monthName}</span>
      <button
        type="button"
        className={styles.monthBtn}
        onClick={onNextMonth}
        disabled={!canGoNextMonth}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );

  const renderDayStep = () => {
    if (availabilityLoading) {
      return (
        <>
          {renderMonthBar()}
          <div className={styles.loading} aria-hidden="true">
            {days.slice(0, 7).map((day) => (
              <div key={day.key} className={styles.loadingCard} />
            ))}
          </div>
        </>
      );
    }

    // A month with no days in it at all - past the end of the plan, or before
    // today. Different from a month whose days are all busy.
    if (!days.length) {
      return (
        <>
          {renderMonthBar()}
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">📅</span>
            <span>{BOOKING.noDaysInThisMonth}</span>
          </div>
        </>
      );
    }

    // A month the teacher has nothing free in. Another month may have
    // something, so this says so instead of sending the student away.
    if (freeDays === 0) {
      return (
        <>
          {renderMonthBar()}
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">🔍</span>
            <span>{BOOKING.noFreeDaysThisMonth}</span>
          </div>
        </>
      );
    }

    return (
      <>
        {renderMonthBar()}
        <div className={styles.dayGrid}>
          {days.map((day) => {
            const status = dayStatus(day.key);
            const active = day.key === selectedDate;
            const off = status !== "free";
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => onPickDate(day.key)}
                disabled={off}
                aria-pressed={active}
                title={
                  status === "free"
                    ? "Your teacher is free on this day"
                    : status === "busy"
                      ? "Your teacher is busy on this day"
                      : "Your teacher has no classes set for this day"
                }
                className={`${styles.dayCard} ${active ? styles.dayCardActive : ""} ${off ? styles.dayCardOff : ""}`}
              >
                <span className={styles.dayName}>{day.weekday}</span>
                <span className={styles.dayNumber}>{day.dayNumber}</span>
                <span className={styles.dayMonth}>{day.month}</span>
                <span
                  className={`${styles.dayBadge} ${
                    status === "free"
                      ? styles.dayBadgeFree
                      : status === "busy"
                        ? styles.dayBadgeBusy
                        : styles.dayBadgeNone
                  }`}
                >
                  {status === "free" ? BOOKING.free : status === "busy" ? BOOKING.busy : BOOKING.noTimes}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  /* ------------------------------------------------------ the time screen */

  const renderTimeStep = () => {
    const status = selectedDate ? dayStatus(selectedDate) : "none";

    if (status === "busy") {
      return (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">🚫</span>
          <span>{BOOKING.teacherBusyDay}</span>
        </div>
      );
    }

    if (timesLoading) {
      return (
        <div className={styles.loading} aria-hidden="true">
          {timeSlots.slice(0, 4).map((time) => (
            <div key={time} className={styles.loadingCard} />
          ))}
        </div>
      );
    }

    if (!timeSlots.length) {
      return (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">⏰</span>
          <span>{status === "none" ? BOOKING.noTimesThatDay : BOOKING.noFreeTimes}</span>
        </div>
      );
    }

    return (
      <div className={styles.timeGrid}>
        {timeSlots.map((time) => {
          const booked = isTimeBooked(time);
          const active = picked && picked.date === selectedDate && picked.time === time;
          return (
            <button
              key={time}
              type="button"
              onClick={() => onPickTime(selectedDate, time)}
              disabled={booked}
              aria-pressed={active}
              className={`${styles.timeCard} ${active ? styles.timeCardActive : ""} ${booked ? styles.timeCardOff : ""}`}
            >
              <span className={styles.timeText}>{humanTime(time)}</span>
              {" "}
              {booked ? (
                <span className={styles.timeTaken}>{BOOKING.taken}</span>
              ) : (
                <span className={styles.timeOfDay}>{describeTimeOfDay(time)}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  /* ------------------------------------------------- the days-of-week screen */

  const renderWeekdayStep = () => (
    <div className={styles.weekdayGrid}>
      {WEEKDAY_CARDS.map((weekday) => {
        const active = weeklyWeekdays.includes(weekday.value);
        return (
          <button
            key={weekday.value}
            type="button"
            onClick={() => onToggleWeekday(weekday.value)}
            aria-pressed={active}
            className={`${styles.weekdayCard} ${active ? styles.weekdayCardActive : ""}`}
          >
            <span className={styles.weekdayName}>{weekday.label}</span>
            <span className={styles.weekdayTick}>{active ? "✓" : ""}</span>
          </button>
        );
      })}
    </div>
  );

  /* ---------------------------------------------------- the time-of-day screen */

  const renderWeektimeStep = () => {
    return (
      <>
        <div className={styles.partGrid}>
          {TIME_PARTS.map((part) => {
            const active = weeklyTime === part;
            return (
              <button
                key={part}
                type="button"
                onClick={() => {
                  onWeeklyTimeChange(part);
                  setShowOtherTime(false);
                }}
                aria-pressed={active}
                className={`${styles.partCard} ${active ? styles.partCardActive : ""}`}
              >
                <span className={styles.partName}>{BOOKING[part]}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.otherTime}>
          <button
            type="button"
            onClick={toggleOtherTime}
            className={`${styles.otherTimeToggle} ${showOtherTime ? styles.otherTimeToggleActive : ""}`}
          >
            {BOOKING.anotherTime}
          </button>
          {showOtherTime && (
            <input
              type="time"
              className={styles.otherTimeInput}
              value={isPartOfDay(weeklyTime) ? "" : weeklyTime}
              onChange={(event) => onWeeklyTimeChange(event.target.value)}
              aria-label={BOOKING.whatTime}
            />
          )}
        </div>
      </>
    );
  };

  /* ------------------------------------------------- the times we found screen */

  const renderFoundStep = () => {
    if (finding) {
      return (
        <div className={styles.loading} aria-hidden="true">
          {suggestions.slice(0, 4).map((suggestion) => (
            <div key={`${suggestion.date}-${suggestion.time}`} className={styles.loadingCard} />
          ))}
        </div>
      );
    }

    if (!suggestions.length) {
      return (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">🔍</span>
          <span>{BOOKING.noTimesFound}</span>
        </div>
      );
    }

    // What the student asked for, said the way they asked for it.
    //
    // !! When they asked for a part of the day, the answer is the name of
    // !! that part - "Morning" - and every time under it is a morning time.
    // !! When they asked for an exact time, the answer is that time and how
    // !! far off it is.
    const partLabel = isPartOfDay(weeklyTime) ? BOOKING[weeklyTime] : "";

    return (
      <>
        {suggestionsTotal > suggestions.length && (
          <p className={styles.info}>{BOOKING.moreTimes(suggestionsTotal)}</p>
        )}
        <div className={styles.foundList}>
          {suggestions.map((suggestion) => {
            const active = isSelected(suggestion.date, suggestion.time);
            const distance = describeTimeDistance(suggestion.requested_time, suggestion.time);
            return (
              <div key={`${suggestion.date}-${suggestion.time}`} className={`${styles.foundCard} ${active ? styles.foundCardActive : ""}`}>
                <div>
                  <div className={styles.foundDate}>{formatLongDate(suggestion.date)}</div>
                  <div className={styles.foundTime}>
                    {humanTime(suggestion.time)}
                    {endTimeFor(suggestion.time) ? ` - ${humanTime(endTimeFor(suggestion.time))}` : ""}
                  </div>
                  {partLabel && <div className={styles.foundNote}>{partLabel}</div>}
                  {!partLabel && suggestion.requested_time && (
                    <div className={styles.foundNote}>
                      {BOOKING.preferred} {humanTime(suggestion.requested_time)}
                      {distance ? ` · ${distance}` : ""}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => (active ? onRemoveSelection(suggestion.date, suggestion.time) : onAddSuggestion(suggestion))}
                  aria-pressed={active}
                  className={`${styles.foundBtn} ${active ? styles.foundBtnDone : ""}`}
                >
                  {active ? BOOKING.remove : BOOKING.add}
                </button>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  /* ------------------------------------------------------- the last screen */

  const renderCheckStep = () => {
    if (!selections.length) {
      return (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">📝</span>
          <span>{BOOKING.pickTimeFirst}</span>
        </div>
      );
    }

    return (
      <div className={styles.summary}>
        {selections.length === 1 ? (
          <>
            <div className={styles.summaryRow}>
              <span className={styles.summaryIcon} aria-hidden="true">📅</span>
              <div>
                <div className={styles.summaryLabel}>{BOOKING.dayLabel}</div>
                <div className={styles.summaryValue}>{formatLongDate(selections[0].date)}</div>
              </div>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryIcon} aria-hidden="true">⏰</span>
              <div>
                <div className={styles.summaryLabel}>{BOOKING.timeLabel}</div>
                <div className={styles.summaryValue}>
                  {humanTime(selections[0].time)}
                  {endTimeFor(selections[0].time) ? ` - ${humanTime(endTimeFor(selections[0].time))}` : ""}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.summaryList}>
            <div className={styles.summaryLabel}>{CONFIRM.classes(selections.length)}</div>
            {selections.map((slot) => (
              <div key={`${slot.date}-${slot.time}`} className={styles.summaryItem}>
                <div>
                  <div className={styles.foundDate}>{formatLongDate(slot.date)}</div>
                  <div className={styles.foundTime}>
                    {humanTime(slot.time)}
                    {endTimeFor(slot.time) ? ` - ${humanTime(endTimeFor(slot.time))}` : ""}
                  </div>
                </div>
                {/* The way back out of a class that is already in the list.
                    !! A student who added four times and then wants three of
                    !! them should not have to go back two screens to take one
                    !! away. */}
                <button
                  type="button"
                  className={styles.summaryRemove}
                  onClick={() => onRemoveSelection(slot.date, slot.time)}
                >
                  {BOOKING.remove}
                </button>
              </div>
            ))}
          </div>
        )}

        {teacherName && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryIcon} aria-hidden="true">📚</span>
            <div>
              <div className={styles.summaryLabel}>{CONFIRM.teacher}</div>
              <div className={styles.summaryValue}>{teacherName}</div>
            </div>
          </div>
        )}

        {courseName && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryIcon} aria-hidden="true">🎯</span>
            <div>
              <div className={styles.summaryLabel}>{BOOKING.course}</div>
              <div className={styles.summaryValue}>
                {courseName} · {CONFIRM.minutesEach(classDuration)}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ---------------------------------------------------------- the questions */

  let question = BOOKING.howToBook;
  let help = "";
  let body = null;

  if (step === "choose") {
    body = (
      <div className={styles.optionGrid}>
        <button
          type="button"
          onClick={() => chooseMode("manual")}
          aria-pressed={applyMode === "manual"}
          className={`${styles.choiceCard} ${applyMode === "manual" ? styles.choiceCardActive : ""}`}
        >
          <span className={styles.choiceIcon} aria-hidden="true">📅</span>
          <span className={styles.choiceTitle}>{BOOKING.oneTime}</span>
          <span className={styles.choiceText}>{BOOKING.oneTimeHelp}</span>
        </button>
        <button
          type="button"
          onClick={() => chooseMode("weekly")}
          aria-pressed={applyMode === "weekly"}
          className={`${styles.choiceCard} ${applyMode === "weekly" ? styles.choiceCardActive : ""}`}
        >
          <span className={styles.choiceIcon} aria-hidden="true">🔁</span>
          <span className={styles.choiceTitle}>{BOOKING.everyWeek}</span>
          <span className={styles.choiceText}>{BOOKING.everyWeekHelp}</span>
        </button>
      </div>
    );
  } else if (step === "day") {
    question = BOOKING.whichDay;
    help = BOOKING.dayHelp;
    body = renderDayStep();
  } else if (step === "time") {
    question = BOOKING.whichTime;
    help = BOOKING.timeHelp;
    body = (
      <>
        <div className={styles.pickedDay}>
          <span className={styles.pickedDayText}>📅 {formatLongDate(selectedDate)}</span>
          <button type="button" className={styles.changeBtn} onClick={() => goTo("day")}>
            {BOOKING.change}
          </button>
        </div>
        {renderTimeStep()}
      </>
    );
  } else if (step === "weekday") {
    question = BOOKING.whichDays;
    help = BOOKING.daysHelp;
    body = renderWeekdayStep();
  } else if (step === "weektime") {
    question = BOOKING.whatTime;
    help = BOOKING.timeOfDayHelp;
    body = renderWeektimeStep();
  } else if (step === "found") {
    question = BOOKING.foundTimes(suggestions.length);
    help = BOOKING.foundTimesHelp;
    body = (
      <>
        {renderFoundStep()}
        {suggestions.length > 1 && (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost} ${styles.btnWide}`}
            onClick={onAddAllSuggestions}
            disabled={isSubmitting}
          >
            {BOOKING.addAll}
          </button>
        )}
      </>
    );
  } else {
    question = CONFIRM.bookingTitle;
    help = CONFIRM.bookingHelp;
    body = renderCheckStep();
  }

  /* ----------------------------------------------------------- the buttons */

  const isLast = step === "check";
  const canGoNext = (() => {
    if (step === "day") return Boolean(selectedDate);
    if (step === "time") return Boolean(picked);
    if (step === "weekday") return weeklyWeekdays.length > 0;
    if (step === "weektime") return Boolean(weeklyTime);
    if (step === "found") return selections.length > 0;
    if (step === "check") return selections.length > 0 && !hasNoClassesLeft;
    return false;
  })();

  const handleNext = () => {
    if (step === "weektime") {
      handleFindTimes();
      return;
    }
    if (step === "day") {
      goTo("time");
      return;
    }
    if (step === "time") {
      goTo("check");
      return;
    }
    if (step === "weekday") {
      goTo("weektime");
      return;
    }
    if (step === "found") {
      goTo("check");
      return;
    }
  };

  const nextLabel = (() => {
    if (isLast) {
      return isSubmitting ? BOOKING.booking : selections.length > 1 ? BOOKING.bookMany(selections.length) : BOOKING.bookOne;
    }
    if (step === "weektime") return finding ? BOOKING.findingTimes : BOOKING.findTimes;
    return BOOKING.next;
  })();

  return (
    <div className={styles.wizard}>
      <div className={styles.head}>
        <div className={styles.headRow}>
          <h2 className={styles.title}>{BOOKING.title}</h2>
          {/* A way out that is always there.
              !!
              !! A child who has gone down the wrong path needs to be able to
              !! get out of it without understanding what "back" means. This
              !! button is on every screen of the wizard, and it is the only
              !! thing on the screen that is not a step forward. */}
          <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
            {BOOKING.cancel}
          </button>
        </div>
        <p className={styles.intro}>
          {teacherName ? BOOKING.intro(teacherName) : BOOKING.noTeacher}
        </p>
      </div>

      {step !== "choose" && (
        <>
          <div className={styles.steps}>
            {Array.from({ length: stepTotal }, (unused, index) => (
              <Fragment key={index}>
                <span
                  className={`${styles.stepDot} ${
                    index + 1 < stepNumber
                      ? styles.stepDotDone
                      : index + 1 === stepNumber
                        ? styles.stepDotNow
                        : ""
                  }`}
                >
                  {index + 1 < stepNumber ? "✓" : index + 1}
                </span>
                {index + 1 < stepTotal && (
                  <span className={`${styles.stepLine} ${index + 1 < stepNumber ? styles.stepLineDone : ""}`} />
                )}
              </Fragment>
            ))}
          </div>
          <p className={styles.stepCount}>{BOOKING.stepOf(stepNumber, stepTotal)}</p>
        </>
      )}

      <div>
        <h3 className={styles.question}>{question}</h3>
        {help && <p className={styles.help}>{help}</p>}
      </div>

      {body}

      {error && (
        <div className={styles.error}>
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {step !== "choose" && (
        <div className={styles.footer}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => goTo(previousStep)}
            disabled={isSubmitting}
          >
            ← {BOOKING.back}
          </button>
          {isLast ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={onBook}
              disabled={isSubmitting || !canGoNext}
            >
              {nextLabel}
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleNext}
              disabled={!canGoNext || finding}
            >
              {nextLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}