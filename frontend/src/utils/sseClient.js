import { readSessionToken } from "./apiAuth.js";
import { createFrameParser } from "./sseParser.js";

/**
 * A minimal EventSource replacement built on fetch, so the request can carry
 * the session token.
 *
 * EventSource cannot set request headers, which is the whole reason these two
 * streams were the last unguarded routes in the app: the token can only go in
 * the URL, and Railway logs request URLs.
 *
 * Implements the slice of the EventSource API the app actually uses:
 * addEventListener / removeEventListener / close / onerror, with handlers
 * receiving `{ data }`. It is not a general SSE client - there is no
 * Last-Event-ID replay, which this backend does not use.
 *
 * Reconnection is opt-in via reconnectMs, because the two call sites want
 * different things: ChatPanel tears the stream down when it errors, while the
 * calendar relies on EventSource reconnecting after a dropped connection.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {number} [options.reconnectMs] Reconnect after an unexpected drop. 0 disables.
 * @param {() => void} [options.onOpen]
 */
export function openSseStream(url, { reconnectMs = 0, onOpen } = {}) {
  const listeners = new Map();
  let controller = null;
  let closed = false;
  let attempts = 0;

  const api = {
    onerror: null,

    addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
    },

    removeEventListener(name, handler) {
      listeners.get(name)?.delete(handler);
    },

    close() {
      closed = true;
      try {
        controller?.abort();
      } catch {
        // Already torn down.
      }
    },
  };

  const emit = (name, data) => {
    for (const handler of [...(listeners.get(name) || [])]) {
      try {
        handler({ data });
      } catch (err) {
        console.error(`SSE handler for "${name}" failed:`, err);
      }
    }
  };

  const raiseError = (err) => {
    emit("error", "");
    if (typeof api.onerror === "function") api.onerror(err);
  };

  const parser = createFrameParser((eventName, data) => emit(eventName, data));

  const scheduleReconnect = () => {
    if (closed || !reconnectMs) return;
    attempts += 1;
    // Capped backoff, so a server restart does not turn into a reconnect storm.
    const delay = Math.min(reconnectMs * attempts, 30000);
    setTimeout(() => {
      if (!closed) run();
    }, delay);
  };

  const run = async () => {
    if (closed) return;
    controller = new AbortController();

    try {
      const headers = { Accept: "text/event-stream" };
      const token = readSessionToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(url, { headers, signal: controller.signal });

      if (!response.ok) {
        // A 401 here means the session expired; the axios interceptor already
        // handles the sign-in redirect, so there is nothing useful to do but
        // report and stop rather than reconnect in a loop.
        if (response.status === 401) {
          closed = true;
          raiseError(new Error("Session expired"));
          return;
        }
        raiseError(new Error(`Stream failed with ${response.status}`));
        scheduleReconnect();
        return;
      }

      attempts = 0;
      if (typeof onOpen === "function") onOpen();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }

      // Clean end of stream - the server closed it.
      if (!closed) {
        raiseError(new Error("Stream closed by server"));
        scheduleReconnect();
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error("SSE stream error:", err);
      raiseError(err);
      scheduleReconnect();
    }
  };

  run();

  return api;
}