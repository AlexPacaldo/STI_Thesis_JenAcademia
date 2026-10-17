/**
 * Server-sent events frame parsing.
 *
 * Deliberately dependency-free and free of any browser or Vite API, so it can be
 * unit tested from a plain node script. Live chat and the calendar both depend
 * on this, and neither can be verified by an anonymous probe - the failures that
 * matter are a frame arriving split across two network reads, or an event
 * silently delivered under the wrong name.
 */

/**
 * @param {(eventName: string, data: string) => void} onEvent
 */
export function createFrameParser(onEvent) {
  let buffer = "";

  const parseFrame = (frame) => {
    // A frame is a list of "field: value" lines. The event type defaults to
    // "message" when no event: line is present. Lines starting with a colon are
    // comments, which servers use as keep-alives.
    let eventName = "message";
    const dataLines = [];

    for (const rawLine of frame.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }

    if (!dataLines.length) return;
    onEvent(eventName, dataLines.join("\n"));
  };

  return {
    /** Feed the next decoded chunk of the response body. */
    push(chunk) {
      buffer += chunk;

      // Normalise CRLF to LF before looking for frame boundaries, or a stream
      // sent with Windows line endings would never match "\n\n" and every event
      // would be silently dropped. Done over the whole buffer rather than per
      // chunk so a \r ending one read and a \n starting the next still pair up.
      if (buffer.includes("\r")) buffer = buffer.replace(/\r\n/g, "\n");

      // Frames are separated by a blank line. The remainder is kept, because a
      // frame can straddle two network reads and dropping it would lose a chat
      // message with no error anywhere.
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        parseFrame(frame);
      }
    },

    /** Anything left when the stream ends without a trailing blank line. */
    flush() {
      const tail = buffer.trim();
      buffer = "";
      if (tail) parseFrame(tail);
    },
  };
}