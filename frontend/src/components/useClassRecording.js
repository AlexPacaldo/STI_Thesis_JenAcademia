import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { fixWebmDuration } from "@fix-webm-duration/fix";
import { API_BASE_URL } from "../utils/api.js";

export default function useClassRecording({ teacherId, notify, onUploaded }) {
  const [session, setSession] = useState(null);
  // Set when the browser ended the capture on its own (the teacher clicked
  // "Stop sharing", or the shared tab/window closed) while the recorder was
  // still running. Kept separate from `session` because the session is cleared
  // once the upload finishes, and the teacher still needs to see why the video
  // is only a few seconds long.
  const [earlyStop, setEarlyStop] = useState(null);
  const recorderRef = useRef(null);
  // True only when the stop came from the Stop Recording button (or the page
  // going away). Everything else - the teacher clicking "Stop sharing", the
  // shared tab closing - is the browser ending the capture on its own.
  const stopRequestedRef = useRef(false);
  const callbackRef = useRef(onUploaded);
  useEffect(() => { callbackRef.current = onUploaded; }, [onUploaded]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      // Leaving the page is not a failed share, so don't warn about it.
      stopRequestedRef.current = true;
      recorder.stop();
    }
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
      const backendDetail = typeof error.response?.data?.error === "string"
        ? error.response.data.error
        : (error.response?.data?.error?.message || "");
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
    setEarlyStop(null);
    stopRequestedRef.current = false;
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

      // The capture can end without the teacher asking for it: Chrome stops the
      // share when "Stop sharing" is clicked, or when the shared tab or window
      // closes. Before this was silent, so the class carried on for another
      // half hour while the only proof was a two-second video that the admin
      // then had to reject. `shareEndedEarly` travels with the upload so the
      // Calendar page can say what happened.
      let shareEndedEarly = false;
      const videoTrack = stream.getVideoTracks()[0];
      const noteShareEnded = () => {
        if (shareEndedEarly) return;
        shareEndedEarly = true;
        notify?.(
          "Screen sharing stopped, so the recording ended early. If the class is still running, start a new recording.",
          "warning"
        );
      };
      videoTrack?.addEventListener("ended", () => {
        // !! Chrome stops the MediaRecorder itself once every track has ended,
        // !! and it does that before this listener runs, so `recorder.state` is
        // !! already "inactive" here. Keying off it meant the unexpected stop
        // !! was never noticed. Whether we asked for the stop is the fact that
        // !! actually distinguishes the two cases.
        if (stopRequestedRef.current) return;
        noteShareEnded();
        if (recorder.state === "recording") recorder.stop();
      });

      await axios.post(`${API_BASE_URL}/api/calendar/classes/${classId}/recording-start`, { teacher_id: teacherId });
      if (videoTrack?.readyState === "ended") {
        // The share ended during the request above, before the recorder was
        // running. Starting it now would only capture nothing.
        stream.getTracks().forEach((track) => track.stop());
        setSession(null);
        noteShareEnded();
        setEarlyStop({ classId, durationSeconds: 0 });
        return;
      }
      const captureStarted = performance.now();
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        // Read the track state before stopping the tracks below, which would
        // make it "ended" regardless of why the recording finished.
        const endedByBrowser = !stopRequestedRef.current && videoTrack?.readyState === "ended";
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

        if (endedByBrowser) noteShareEnded();
        if (shareEndedEarly) {
          setEarlyStop({ classId, durationSeconds });
        }
        upload(classId, uploadBlob, durationSeconds);
      };
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
      stopRequestedRef.current = true;
      setSession((current) => ({ ...current, status: "uploading" }));
      recorderRef.current.stop();
    }
  };
  return { session, earlyStop, start, stop, discardFailed: () => { if (session?.status === "failed") setSession(null); }, retry: () => session?.blob && upload(session.classId, session.blob, session.durationSeconds) };
}
