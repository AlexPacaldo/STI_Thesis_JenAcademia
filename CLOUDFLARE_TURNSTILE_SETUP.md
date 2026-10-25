# Cloudflare Turnstile setup

Turnstile protects the public JEN Academia contact form. The browser displays
the widget, but the backend verifies each one-time token with Cloudflare before
it sends an email. The contact endpoint also limits submissions to 10 per
client per 15 minutes by default.

## 1. Create a Turnstile widget

1. Sign in to the Cloudflare dashboard and open **Turnstile**.
2. Add a widget for the JEN Academia website. **Managed** mode is a good
   starting point.
3. Add every hostname that serves the public website, such as
   `jenacademia.com` and `www.jenacademia.com`.
4. For local development, also add `localhost` if you want to test the widget
   at `http://localhost:5173`.
5. Copy both the **site key** and **secret key**.

## 2. Configure the frontend

For local development, create `frontend/.env` from `frontend/.env.example` and
set:

```dotenv
VITE_TURNSTILE_SITE_KEY=your_public_site_key
```

For production, set `VITE_TURNSTILE_SITE_KEY` in the frontend hosting
environment, then rebuild and redeploy the frontend. The site key is public and
is intended to be included in the browser bundle.

## 3. Configure the backend

Set this variable in `backend/.env` for local development and in the backend
hosting environment for production:

```dotenv
TURNSTILE_SECRET_KEY=your_private_secret_key
```

Restart or redeploy the backend after changing its environment variables. Never
put the secret key in frontend configuration, source code, or a committed
`.env` file.

## 4. Test the form

1. Open the public homepage and scroll to the contact form.
2. Complete the Turnstile check.
3. Submit a test message and confirm it is received by the configured contact
   inbox.
4. Try submitting without completing the check. The form should not send.
5. Confirm the backend rejects a request with an invalid token.

Turnstile tokens are short-lived and single-use. The widget resets after each
submission, including failed submissions, so complete the check again before
retrying.

## If verification is unavailable

The contact form fails closed when either key is missing or Cloudflare cannot
verify a token. It displays an email fallback instead; visitors can still reach
JEN Academia at `jenacademia31@gmail.com`.

The backend accepts only successful verification responses for the `contact`
action. Cloudflare enforces the hostnames configured on the widget. Contact
rate limits can be adjusted with `CONTACT_RATE_WINDOW_MS` and
`CONTACT_RATE_MAX` on the backend; defaults are 900000 ms and 10 requests.
