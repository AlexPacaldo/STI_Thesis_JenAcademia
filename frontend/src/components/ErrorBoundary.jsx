import { Component } from "react";

/**
 * Stops a crash in one screen from becoming a blank page.
 *
 * !! Added after the Calendar threw
 * !!
 * !!     ReferenceError: Cannot access 'ht' before initialization
 * !!
 * !! on every render, and the whole application went to a white error screen
 * !! with a minified variable name that pointed at nothing useful. A student
 * !! with a crash on the Calendar could not reach the Dashboard, the Assignments
 * !! or anything else, because one component's bad day was the entire site's.
 * !!
 * !! That class of bug is invisible to everything else in this repo. The bundler
 * !! builds clean, and the tests pass, because they exercise the pure helpers and
 * !! never evaluate a component's declaration order. Only running it finds it -
 * !! so the defence belongs at the boundary, where a mistake is contained rather
 * !! than merely discouraged.
 *
 * A class component because React has no hook equivalent: there is no way to
 * catch an error during render from a function component.
 *
 * Once caught, it holds the error rather than re-throwing on every subsequent
 * render, and offers a way out. "Go back" rather than a bare reload, because
 * reload loses whatever the student had on screen and lands them on the same
 * broken route.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    // Navigating to a different route clears the error, so one bad screen does
    // not keep the student stuck on it after they have moved on.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    // Kept visible on purpose. The production response is a generic "Server
    // error", which is why a broken endpoint once cost a screenshot and a log
    // file to diagnose; the browser console is the first place this is knowable.
    console.error("Unhandled error in the UI:", error, info?.componentStack);
  }

  handleRetry() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "60vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            border: "1px solid #e0b4b4",
            background: "#fdf6f6",
            borderRadius: 14,
            padding: "28px 26px",
          }}
        >
          <h2 style={{ margin: "0 0 10px 0", fontSize: "1.25rem", color: "#8c2020" }}>
            This screen could not be displayed
          </h2>

          <p style={{ margin: "0 0 14px 0", color: "#5b3b3b", fontSize: "0.95em", lineHeight: 1.55 }}>
            Something on this page failed to load. The rest of the site still
            works - try again, or go back and pick something else.
          </p>

          <pre
            style={{
              margin: "0 0 16px 0",
              padding: 10,
              background: "rgba(0,0,0,0.05)",
              borderRadius: 8,
              fontSize: "0.8em",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#6b3030",
              maxHeight: 140,
              overflow: "auto",
            }}
          >
            {String(error?.message || error)}
          </pre>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                padding: "9px 16px",
                border: "none",
                borderRadius: 8,
                background: "#8c2020",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {this.props.onBack ? (
              <button
                type="button"
                onClick={this.props.onBack}
                style={{
                  padding: "9px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Go back
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}