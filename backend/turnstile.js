const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "contact";
const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
const TURNSTILE_VERIFY_TIMEOUT_MS = 5000;

export async function verifyTurnstileToken({ token, secret, fetchImpl = fetch }) {
  const verificationSecret = String(secret || "").trim();
  if (!verificationSecret) return { status: "misconfigured" };

  const responseToken = String(token || "").trim();
  if (!responseToken || responseToken.length > TURNSTILE_TOKEN_MAX_LENGTH) {
    return { status: "invalid" };
  }

  let response;
  try {
    response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: verificationSecret,
        response: responseToken,
      }),
      signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
    });
  } catch {
    return { status: "unavailable" };
  }

  if (!response.ok) return { status: "unavailable" };

  let result;
  try {
    result = await response.json();
  } catch {
    return { status: "unavailable" };
  }

  if (result?.success !== true || result?.action !== TURNSTILE_ACTION) {
    return { status: "invalid" };
  }

  return { status: "verified" };
}
