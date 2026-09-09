import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";
import { readStoredUser } from "../utils/sessionUser.js";

const API = API_BASE_URL;

const getUserId = (user) => user?.id || user?.user_id || user?.userId;

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const buildJitsiMeetingUrl = (classLink, jwt) => {
  try {
    const url = new URL(classLink);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.searchParams.delete("embed");
    if (jwt) url.searchParams.set("jwt", jwt);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

export default function Classroom() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const user = readStoredUser();
  const userId = getUserId(user);
  const role = String(user?.role || "").toLowerCase();
  const isTeacher = role === "teacher";
  const isStudent = role === "student";

  const [classInfo, setClassInfo] = useState(null);
  const [verification, setVerification] = useState(null);
  const [jitsiJwt, setJitsiJwt] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasConsented, setHasConsented] = useState(false);
  const [summary, setSummary] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState("");
  const [recordingStartedAt, setRecordingStartedAt] = useState(null);
  const [isEndingClass, setIsEndingClass] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const screenStreamRef = useRef(null);

  const jitsiUrl = useMemo(
    () => buildJitsiMeetingUrl(classInfo?.class_link, jitsiJwt),
    [classInfo?.class_link, jitsiJwt]
  );

  const loadClassroom = async () => {
    if (!classId || !userId) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/api/calendar/classes/${classId}/classroom`, {
        params: { user_id: userId },
      });
      setClassInfo(response.data?.class || null);
      setJitsiJwt(response.data?.jitsi_jwt || "");
      const loadedVerification = response.data?.verification || null;
      setVerification(loadedVerification);
      setSummary(loadedVerification?.summary || "");
      setHasConsented(Boolean(
        (isTeacher && loadedVerification?.teacher_recording_consent_at) ||
        (isStudent && loadedVerification?.student_recording_consent_at)
      ));
    } catch (err) {
      notify?.(err?.response?.data?.message || "Unable to load classroom", "error");
      navigate("/Calendar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) {
      navigate("/login", { replace: true });
      return;
    }
    loadClassroom();
  }, [classId, userId]);

  useEffect(() => () => {
    if (recordingPreviewUrl) URL.revokeObjectURL(recordingPreviewUrl);
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, [recordingPreviewUrl]);

  const acceptConsentAndJoin = async () => {
    if (!classInfo?.class_id) return;
    setIsJoining(true);
    try {
      const endpoint = isTeacher ? "start" : "join";
      const payload = isTeacher
        ? { teacher_id: userId, recording_consent: true }
        : { student_id: userId, recording_consent: true };
      const response = await axios.post(`${API}/api/calendar/classes/${classInfo.class_id}/${endpoint}`, payload);
      setVerification(response.data?.verification || null);
      setHasConsented(true);
      notify?.("Consent recorded. You may now enter the classroom.", "success");
    } catch (err) {
      notify?.(err?.response?.data?.message || "Unable to join classroom", "error");
    } finally {
      setIsJoining(false);
    }
  };

  const uploadRecording = async (blob) => {
    if (!blob || !classInfo?.class_id || !isTeacher) return;

    setIsUploadingRecording(true);
    try {
      const formData = new FormData();
      formData.append("teacher_id", userId);
      formData.append("recording", blob, `class-${classInfo.class_id}-recording.webm`);
      const response = await axios.post(`${API}/api/calendar/classes/${classInfo.class_id}/recording`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setVerification(response.data?.verification || null);
      notify?.("Class recording uploaded.", "success");
    } catch (err) {
      notify?.(err?.response?.data?.message || "Unable to upload recording", "error");
    } finally {
      setIsUploadingRecording(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      notify?.("Screen recording is not supported in this browser.", "error");
      return;
    }

    notify?.("Select the Jitsi meeting tab and enable tab audio. Keep this classroom page open until the recording uploads.", "info");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      screenStreamRef.current = stream;
      recordedChunksRef.current = [];

      const recorderOptions = MediaRecorder.isTypeSupported?.("video/webm")
        ? { mimeType: "video/webm" }
        : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        setRecordingBlob(blob);
        if (recordingPreviewUrl) URL.revokeObjectURL(recordingPreviewUrl);
        setRecordingPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        await uploadRecording(blob);
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      });
      recorder.start(1000);
      setRecordingStartedAt(new Date());
      setIsRecording(true);
      notify?.("Recording started. Keep this classroom page open until the upload finishes.", "success");
    } catch (err) {
      notify?.("Recording permission was cancelled or blocked.", "warning");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const endClass = async () => {
    if (!summary.trim()) {
      notify?.("Please add a class summary before ending the class.", "error");
      return;
    }
    if (isRecording) {
      notify?.("Stop the recording first so it can upload.", "warning");
      return;
    }
    if (!verification?.recording_url && !recordingBlob) {
      notify?.("Please record and upload the class before ending it.", "error");
      return;
    }

    setIsEndingClass(true);
    try {
      const formData = new FormData();
      formData.append("teacher_id", userId);
      formData.append("summary", summary);
      const endResponse = await axios.post(`${API}/api/calendar/classes/${classInfo.class_id}/end`, formData);
      setVerification(endResponse.data?.verification || null);
      if (endResponse.data?.verification?.verification_status === "verified") {
        await axios.put(`${API}/api/calendar/classes/${classInfo.class_id}/complete`, {
          teacher_id: userId,
        });
        notify?.("Class recording verified and class completed.", "success");
        navigate("/Calendar");
      } else {
        notify?.("Class ended and sent for review.", "warning");
      }
    } catch (err) {
      notify?.(err?.response?.data?.message || "Unable to end class", "error");
    } finally {
      setIsEndingClass(false);
    }
  };

  if (loading) {
    return <main style={{ padding: 24 }}>Loading classroom...</main>;
  }

  if (!classInfo) {
    return <main style={{ padding: 24 }}>Classroom unavailable.</main>;
  }

  if (!hasConsented && (isTeacher || isStudent)) {
    return (
      <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
        <section style={{ width: "min(620px, 100%)", background: "#fff", border: "1px solid #d8e3dc", borderRadius: 10, padding: 24, boxShadow: "0 18px 48px rgba(15, 23, 42, 0.12)" }}>
          <h1 style={{ margin: "0 0 10px", fontSize: "1.35rem", color: "#15382d" }}>Recording Consent</h1>
          <p style={{ margin: "0 0 16px", color: "#475467", lineHeight: 1.6 }}>
            This class may be recorded for attendance verification. The recording can be viewed by the admin, assigned teacher, and assigned student, and it will be deleted automatically after 7 days.
          </p>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, marginBottom: 18, background: "#f8fafc" }}>
            <strong style={{ display: "block", marginBottom: 4 }}>{classInfo.class_name || "Class"}</strong>
            <span style={{ color: "#667085", fontSize: "0.9rem" }}>{classInfo.scheduled_date} / {classInfo.start_time} - {classInfo.end_time}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={() => navigate("/Calendar")} style={{ border: "1px solid #cfd8dc", background: "#fff", borderRadius: 8, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={acceptConsentAndJoin} disabled={isJoining} style={{ border: "none", background: "#2f4d3e", color: "#fff", borderRadius: 8, padding: "10px 16px", fontWeight: 800, cursor: isJoining ? "not-allowed" : "pointer" }}>
              {isJoining ? "Joining..." : "I Consent and Join"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "calc(100vh - 80px)", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 24, padding: 16, background: "#f6faf7" }}>
      <section style={{ flex: "1 1 280px", minWidth: 0, padding: "16px 0" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "1.35rem", color: "#15382d", overflowWrap: "anywhere" }}>{classInfo.class_name || "Class"}</h1>
        <p style={{ color: "#667085", margin: "0 0 20px" }}>{classInfo.scheduled_date} / {classInfo.start_time} - {classInfo.end_time}</p>
        {jitsiUrl ? (
          <a href={jitsiUrl} target="_blank" rel="noopener noreferrer" aria-label="Open Meeting (new tab)" style={{ display: "inline-block", background: "#2f4d3e", color: "#fff", borderRadius: 8, padding: "12px 18px", fontWeight: 700, textDecoration: "none" }}>
            Open Meeting
          </a>
        ) : (
          <p role="alert" style={{ color: "#b42318" }}>Meeting link unavailable.</p>
        )}
      </section>

      {isTeacher && (
        <aside style={{ flex: "0 1 340px", width: "100%", minWidth: 0, boxSizing: "border-box", padding: 16, height: "fit-content" }}>
          <h2 style={{ margin: "0 0 4px", color: "#15382d", fontSize: "1.05rem" }}>{classInfo.class_name || "Class"}</h2>
          <p style={{ margin: "0 0 14px", color: "#667085", fontSize: "0.86rem" }}>
            Recording expires {formatDateTime(verification?.recording_expires_at)}
          </p>

          <div style={{ display: "grid", gap: 8, marginBottom: 14, fontSize: "0.85rem", color: "#344054" }}>
            <div><strong>Teacher start:</strong> {formatDateTime(verification?.teacher_started_at)}</div>
            <div><strong>Student joined:</strong> {formatDateTime(verification?.student_joined_at)}</div>
            <div><strong>Status:</strong> {verification?.verification_status || "pending"}</div>
            <div><strong>Recording:</strong> {verification?.recording_url ? "Uploaded" : isUploadingRecording ? "Uploading..." : "Required"}</div>
          </div>

          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {!isRecording ? (
              <button type="button" onClick={startRecording} disabled={isUploadingRecording} style={{ border: "none", background: "#1864ab", color: "#fff", borderRadius: 8, padding: "11px 14px", fontWeight: 800, cursor: isUploadingRecording ? "not-allowed" : "pointer" }}>
                Start Recording
              </button>
            ) : (
              <button type="button" onClick={stopRecording} style={{ border: "none", background: "#b42318", color: "#fff", borderRadius: 8, padding: "11px 14px", fontWeight: 800, cursor: "pointer" }}>
                Stop Recording
              </button>
            )}
            {recordingStartedAt && (
              <span style={{ color: "#667085", fontSize: "0.78rem" }}>Started {formatDateTime(recordingStartedAt)}</span>
            )}
          </div>

          {recordingPreviewUrl && (
            <video src={recordingPreviewUrl} controls style={{ width: "100%", borderRadius: 8, background: "#111827", marginBottom: 14 }} />
          )}

          <label style={{ display: "grid", gap: 6, color: "#344054", fontSize: "0.85rem", fontWeight: 700, marginBottom: 14 }}>
            Class summary
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={5}
              placeholder="Write at least one complete sentence about what happened in class."
              style={{ width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cfd8dc", borderRadius: 8, fontFamily: "inherit", resize: "vertical" }}
            />
          </label>

          <button type="button" onClick={endClass} disabled={isEndingClass || isUploadingRecording || isRecording} style={{ width: "100%", border: "none", background: "#2e7d32", color: "#fff", borderRadius: 8, padding: "12px 14px", fontWeight: 800, cursor: (isEndingClass || isUploadingRecording || isRecording) ? "not-allowed" : "pointer", opacity: (isEndingClass || isUploadingRecording || isRecording) ? 0.6 : 1 }}>
            {isEndingClass ? "Ending..." : "End, Verify & Complete"}
          </button>
        </aside>
      )}
    </main>
  );
}
