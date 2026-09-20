import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { fixWebmDuration } from "@fix-webm-duration/fix";
import { API_BASE_URL } from "../utils/api.js";

export default function useClassRecording({ teacherId, notify, onUploaded }) {
  const [session, setSession] = useState(null);
  const recorderRef = useRef(null);
  const callbackRef = useRef(onUploaded);
  useEffect(() => { callbackRef.current = onUploaded; }, [onUploaded]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    recorder?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  const busy = session?.status === "recording" || session?.status === "uploading" || session?.status === "starting";
  useEffect(() => {
    if (!busy && !session?.blob) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, session?.blob]);

  const upload = async (classId, blob, durationSeconds) => {
    setSession({ classId, blob, durationSeconds, status: "uploading" });
    try {
      const form = new FormData();
      form.append("teacher_id", teacherId);
      form.append("duration_seconds", durationSeconds);
      // Codec parameters from MediaRecorder can be invalid in multipart headers.
      // Normalize on upload so retrying an already-captured blob also works.
      const mediaType = blob.type.split(";")[0].trim().toLowerCase() || "video/webm";
      const uploadBlob = blob.slice(0, blob.size, mediaType);
      form.append("recording", uploadBlob, `class-${classId}-recording.${mediaType === "video/mp4" ? "mp4" : "webm"}`);
      const response = await axios.post(`${API_BASE_URL}/api/calendar/classes/${classId}/recording`, form);
      setSession(null);
      callbackRef.current(classId, response.data?.verification);
      notify?.("Class recording uploaded.", "success");
    } catch (error) {
      setSession({ classId, blob, durationSeconds, status: "failed" });
      const backendDetail = error.response?.data?.error;
      const reason = (backendDetail && error.response?.data?.message)
        ? `${error.response.data.message} ${backendDetail}`
        : (error.response?.data?.message || (error.response
          ? `Recording upload failed (HTTP ${error.response.status}). Retry before leaving Calendar.`
          : "Could not reach the server. Retry the recording upload before leaving Calendar."));
      notify?.(reason, "error");
    }
  };

  const start = async (classId) => {
    if (session) return;
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      notify?.("Screen recording is not supported in this browser.", "error");
      return;
    }
    setSession({ classId, status: "starting" });
    notify?.("Select the meeting tab and enable tab audio. Keep Calendar open until the recording uploads.", "info");
    let stream;
    try {
      // Reduce capture size before encoding, avoiding a second compression pass.
      // Keep the selected surface's aspect ratio within a 360p bounding box.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 360, max: 360 },
          frameRate: { ideal: 5, max: 5 },
        },
        audio: true,
      });
      const recorder = new MediaRecorder(stream, {
        ...(MediaRecorder.isTypeSupported("video/webm") ? { mimeType: "video/webm" } : {}),
        videoBitsPerSecond: 200_000,
        audioBitsPerSecond: 32_000,
      });
      recorderRef.current = recorder;
      await axios.post(`${API_BASE_URL}/api/calendar/classes/${classId}/recording-start`, { teacher_id: teacherId });
      const captureStarted = performance.now();
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const durationSeconds = (performance.now() - captureStarted) / 1000;
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        if (!blob.size) {
          setSession(null);
          notify?.("No recording was captured. Please try again.", "error");
          return;
        }

        let uploadBlob = blob;
        if ((blob.type || "").includes("webm")) {
          try {
            uploadBlob = await fixWebmDuration(blob, durationSeconds * 1000, { logger: false });
          } catch {
            uploadBlob = blob;
          }
        }

        upload(classId, uploadBlob, durationSeconds);
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state === "recording") recorder.stop();
      });
      recorder.start(1000);
      setSession({ classId, status: "recording" });
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setSession(null);
      notify?.("Recording permission was cancelled or recording could not start.", "warning");
    }
  };

  const stop = () => {
    if (recorderRef.current?.state === "recording") {
      setSession((current) => ({ ...current, status: "uploading" }));
      recorderRef.current.stop();
    }
  };
  return { session, start, stop, discardFailed: () => { if (session?.status === "failed") setSession(null); }, retry: () => session?.blob && upload(session.classId, session.blob, session.durationSeconds) };
}
