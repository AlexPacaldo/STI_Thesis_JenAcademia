import axios from "axios";

/**
 * Session token storage and the axios hook that presents it.
 *
 * The backend only accepts a signed bearer token on admin routes. Without this
 * header a signed-in admin is treated exactly like an anonymous caller, so the
 * interceptor is installed once at start-up rather than per call site.
 *
 * Kept out of sessionUser.js deliberately: that file caches who the user is,
 * which is presentation state, whereas this is a credential. Keeping them apart
 * means clearing one does not silently leave the other behind.
 */

const TOKEN_KEY = "jen-academia.session-token";

export function readSessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function storeSessionToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, String(token));
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // A browser refusing storage still works for this request; the user simply
    // has to sign in again next time.
  }
}

export function clearSessionToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing useful to do if storage is unavailable.
  }
}

/**
 * Attach the bearer token to every outgoing request, and drop it when the
 * server says the session is no longer valid.
 *
 * The response handler only acts on 401 from admin routes, and deliberately
 * leaves `state.user` alone: clearing that here would fight with whatever the
 * app decides to do about an expired session.
 */
export function installAuthInterceptor({ onUnauthorized } = {}) {
  axios.interceptors.request.use((config) => {
    const token = readSessionToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401) {
        clearSessionToken();
        if (typeof onUnauthorized === "function") onUnauthorized();
      }
      return Promise.reject(error);
    }
  );
}