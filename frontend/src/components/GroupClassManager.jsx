import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../utils/api.js";
import { convertDateTime, DEFAULT_TIMEZONE, humanTime } from "../utils/timezone.js";
import { describeTimeDistance, minutesToTime, timeToMinutes } from "../utils/classTime.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import styles from "./GroupClassManager.module.css";

const API = `${API_BASE_URL}/api/calendar`;
const statusText = { pending: "Waiting for students", approved: "Confirmed", declined: "Declined", cancelled: "Cancelled", expired: "Expired", invalidated: "Booking changed" };
function momentLabel(date, time, source, viewer) {
  const converted = convertDateTime(date, time, source || DEFAULT_TIMEZONE, viewer || DEFAULT_TIMEZONE);
  const label = new Date(`${converted.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${label}, ${humanTime(converted.time)}`;
}

export default function GroupClassManager({ userId, role, viewerTimezone, selectedClass, selectedStarted, peers = [], refreshToken, onUpdated, onReservationsChanged, onSelectParticipant }) {
  const [proposals, setProposals] = useState([]);
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [proposalClass, setProposalClass] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [partnerId, setPartnerId] = useState("");
  const [date, setDate] = useState("");
  const [preferred, setPreferred] = useState("");
  const [times, setTimes] = useState([]);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState("");
  const [teacherTimezone, setTeacherTimezone] = useState(DEFAULT_TIMEZONE);
  const closeRef = useRef(null);
  const version = useRef(0);
  const listVersion = useRef(0);
  const load = useCallback(async () => {
    const request = ++listVersion.current;
    try {
      const { data } = await axios.get(`${API}/group-class-proposals`);
      if (request === listVersion.current) { setProposals(data.proposals || []); setListError(""); }
    } catch { if (request === listVersion.current) setListError("Group invitations could not be loaded. Please retry."); }
  }, []);
  useEffect(() => { void load(); }, [load, userId, refreshToken]);
  useEffect(() => {
    const expiry = Math.min(...proposals.filter(proposal => proposal.status === "pending")
      .map(proposal => new Date(proposal.expires_at).getTime()).filter(time => time > Date.now()));
    if (!Number.isFinite(expiry)) return;
    const timer = window.setTimeout(() => { void load(); onReservationsChanged?.(); }, Math.max(100, expiry - Date.now() + 100));
    return () => window.clearTimeout(timer);
  }, [proposals, load, onReservationsChanged]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);
  useEffect(() => {
    if (!open || !proposalClass) return;
    version.current++;
    const controller = new AbortController();
    setError(""); setCandidates([]); setPartnerId(""); setTimes([]); setChosen("");
    setDate(proposalClass.source_scheduled_date || proposalClass.scheduled_date);
    setPreferred(String(proposalClass.source_start_time || proposalClass.start_time || "").slice(0, 5));
    axios.get(`${API}/group-class-candidates/${proposalClass.id || proposalClass.class_id}`, { signal: controller.signal })
      .then(({ data }) => { setCandidates(data.candidates || []); setTeacherTimezone(data.teacher_timezone || DEFAULT_TIMEZONE); })
      .catch(err => { if (!axios.isCancel(err)) setError(err.response?.data?.message || "Unable to load eligible classes."); });
    closeRef.current?.focus();
    return () => { controller.abort(); };
  }, [open, proposalClass]); // The selected booking anchors this proposal.
  useEffect(() => {
    if (!open) return;
    const key = event => { if (event.key === "Escape" && !busy) setOpen(false); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, busy]);
  const resetTimes = () => { version.current++; setTimes([]); setChosen(""); setError(""); };
  const classIds = () => [Number(proposalClass.id || proposalClass.class_id), Number(partnerId)];
  const partner = candidates.find(candidate => String(candidate.class_id) === partnerId);
  const canPropose = role === "teacher" && selectedClass && !selectedStarted && selectedClass.status === "scheduled";
  const pending = proposals.filter(proposal => proposal.status === "pending");
  const respond = async (proposal, action) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const { data } = await axios.post(`${API}/group-class-proposals/${proposal.proposal_id}/respond`, { action });
      setMessage(data.message); await load(); onUpdated();
    } catch (err) { setMessage(err.response?.data?.message || "Unable to respond. Please retry."); await load(); }
    finally { setBusy(false); }
  };
  const findTimes = async event => {
    event.preventDefault(); if (busy) return;
    const request = ++version.current;
    setBusy(true); setError(""); setChosen("");
    try {
      const { data } = await axios.post(`${API}/group-class-options`, { class_ids: classIds(), scheduled_date: date, preferred_time: preferred });
      if (request === version.current) { setTimes(data.times || []); if (!data.times?.length) setError("No shared times are available on this date. Choose another day."); }
    } catch (err) { if (request === version.current) setError(err.response?.data?.message || "Unable to find shared times."); }
    finally { setBusy(false); }
  };
  const propose = async () => {
    if (busy || !chosen || !partnerId) return;
    setBusy(true); setError("");
    try {
      await axios.post(`${API}/group-class-proposals`, { class_ids: classIds(), scheduled_date: date, start_time: chosen });
      setOpen(false); setMessage("Invitation sent to both students. Original bookings stay reserved until both accept.");
      await load(); onUpdated();
    } catch (err) { setError(err.response?.data?.message || "Unable to send the invitation."); }
    finally { setBusy(false); }
  };
  return (
    <section className={styles.manager} aria-label="Group classes">
      <div className={styles.toolbar}>
        <details className={styles.invitations}>
          <summary>Group invitations{pending.length ? ` (${pending.length})` : ""}</summary>
          {listError && <p role="alert">{listError} <button type="button" onClick={load}>Retry</button></p>}
          {!proposals.length && !listError && <p>No group invitations yet.</p>}
          {proposals.map(proposal => {
            const me = proposal.members.find(member => Number(member.student_id) === Number(userId));
            return <article key={proposal.proposal_id} className={styles.invitation}>
              <div className={styles.row}><strong>{proposal.members.map(member => member.student_name).join(" + ")}</strong><span className={styles.badge}>{statusText[proposal.status] || proposal.status}</span></div>
              <p className={styles.muted}>{proposal.class_name} · Teacher {proposal.teacher_name}</p>
              <p>{momentLabel(proposal.scheduled_date, proposal.start_time, proposal.teacher_timezone, viewerTimezone)} · {proposal.duration} minutes</p>
              {proposal.members.filter(member => member.original_date).map(member => <p key={member.student_id} className={styles.muted}>{role === "teacher" ? `${member.student_name}'s original class: ` : "Your original class: "}{momentLabel(member.original_date, member.original_time, proposal.teacher_timezone, viewerTimezone)}</p>)}
              {proposal.status === "pending" && <>
                <p>Both students must accept. Each student keeps one class reservation; there is no extra class charge.</p>
                <p className={styles.muted}>Respond by {new Date(proposal.expires_at).toLocaleString()}. Original bookings stay reserved while waiting.</p>
                <p>{proposal.members.map(member => `${member.student_name}: ${member.response === "accepted" ? "accepted" : "waiting"}`).join(" · ")}</p>
                <div className={styles.actions}>
                  {role === "teacher" ? <button disabled={busy} onClick={() => respond(proposal, "cancel")}>Cancel invitation</button> : <>
                    <button className={styles.primary} disabled={busy || me?.response === "accepted"} onClick={() => respond(proposal, "accept")}>{me?.response === "accepted" ? "Accepted - waiting" : "Accept group class"}</button>
                    <button disabled={busy} onClick={() => respond(proposal, "decline")}>Keep my current class</button>
                  </>}
                </div>
              </>}
              {["declined", "cancelled", "expired", "invalidated"].includes(proposal.status) && <p className={styles.muted}>This invitation did not change your bookings.</p>}
            </article>;
          })}
        </details>
        {canPropose && <button className={styles.propose} onClick={() => { setProposalClass({ ...selectedClass }); setOpen(true); }}>{selectedClass.group_session_id ? "Propose new group time" : "Propose group class"}</button>}
      </div>
      {message && <p role="status" className={styles.message}>{message}</p>}
      {selectedClass?.group_session_id && <div className={styles.groupInfo}>
        <strong>Group class · shared classroom</strong>
        <p>{role === "teacher" ? "Starting and ending apply to the shared session. The class summary and evidence are shared; attendance, class credits, and private remarks stay separate. Select a student to manage their record." : "Your attendance and class allowance are tracked separately. Ask your teacher if you need a different group time."}</p>
        {role === "teacher" && <div className={styles.actions}>{peers.map(peer => <button key={peer.id || peer.class_id}
          aria-pressed={String(peer.id || peer.class_id) === String(selectedClass.id || selectedClass.class_id)}
          onClick={() => onSelectParticipant(peer.id || peer.class_id)}>{peer.studentFullName || peer.studentName || "Student"}</button>)}</div>}
      </div>}
      {open && <ModalPortal><div className={styles.overlay}>
        <div role="dialog" aria-modal="true" aria-labelledby="group-proposal-title" className={styles.dialog}
          onKeyDown={event => {
            if (event.key !== "Tab") return;
            const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }}>
          <div className={styles.row}><h2 id="group-proposal-title">Propose a group class</h2><button ref={closeRef} disabled={busy} onClick={() => setOpen(false)} aria-label="Close group proposal">Close</button></div>
          <p>Invite two students to share a {proposalClass.duration}-minute class. Their existing bookings change only after both accept.</p>
          <p className={styles.muted}>Selected class: {proposalClass.studentFullName || proposalClass.studentName} · {momentLabel(proposalClass.source_scheduled_date || proposalClass.scheduled_date, proposalClass.source_start_time || proposalClass.start_time, teacherTimezone, viewerTimezone)}</p>
          <form onSubmit={findTimes} className={styles.form}>
            <label>Other student's booked class<select required disabled={busy} value={partnerId} onChange={event => { setPartnerId(event.target.value); resetTimes(); }}>
              <option value="">Choose a class</option>
              {candidates.map(candidate => <option key={candidate.class_id} value={candidate.class_id}>{candidate.student_name} · {momentLabel(candidate.scheduled_date, candidate.start_time, teacherTimezone, viewerTimezone)}</option>)}
            </select></label>
            {!candidates.length && <p className={styles.muted}>Eligible classes must have the same teacher, course, and duration.</p>}
            {partner && <p className={styles.muted}>Both students will be asked to approve the shared lesson, even if their time stays the same.</p>}
            <div className={styles.fields}>
              <label>Proposed date<input type="date" required disabled={busy} value={date} onChange={event => { setDate(event.target.value); resetTimes(); }} /></label>
              <label>Preferred start time<input type="time" required step="60" disabled={busy} value={preferred} onChange={event => { setPreferred(event.target.value); resetTimes(); }} /></label>
            </div>
            <p className={styles.muted}>Times in {teacherTimezone.replaceAll("_", " ")}. We check the teacher's breaks and both students' bookings.</p>
            <button disabled={busy || !partnerId} type="submit">{busy ? "Please wait…" : "Find shared times"}</button>
          </form>
          <div role="status">{error && <p className={styles.error}>{error}</p>}</div>
          {times.length > 0 && <div className={styles.options}>{times.map(time => <button key={time} disabled={busy} aria-pressed={chosen === time} onClick={() => setChosen(time)}>
            <strong>{humanTime(time)} to {humanTime(minutesToTime(timeToMinutes(time) + Number(proposalClass.duration)))}</strong>
            <span>{describeTimeDistance(preferred, time)}</span>
          </button>)}</div>}
          {chosen && <p>Proposed group: {momentLabel(date, chosen, teacherTimezone, viewerTimezone)}. The invitation expires within 24 hours or 15 minutes before the earliest affected class, whichever comes first.</p>}
          <button className={styles.primary} disabled={busy || !chosen || !partnerId} onClick={propose}>Send invitation to both students</button>
        </div>
      </div></ModalPortal>}
    </section>
  );
}
