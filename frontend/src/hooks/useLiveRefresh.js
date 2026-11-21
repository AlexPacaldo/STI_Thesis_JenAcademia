import { useEffect, useRef } from "react";

export default function useLiveRefresh(callback, { intervalMs = 15_000, enabled = true } = {}) {
  const callbackRef = useRef(callback);
  const runningRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;

    const refresh = async () => {
      if (document.visibilityState === "hidden" || runningRef.current) return;

      runningRef.current = true;
      try {
        await callbackRef.current();
      } catch (error) {
        console.error("Automatic data update failed:", error);
      } finally {
        runningRef.current = false;
      }
    };

    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const intervalId = window.setInterval(() => void refresh(), intervalMs);

    window.addEventListener("focus", refreshOnVisible);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnVisible);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [enabled, intervalMs]);
}
