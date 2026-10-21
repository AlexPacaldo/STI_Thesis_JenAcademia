# Railway Migration

This repo is an isolated monorepo:

- Backend service root directory: `/backend`
- Frontend service root directory: `/frontend`
- Database service: Railway MySQL

## Backend

1. Create a new Railway project.
2. Add a MySQL database service.
3. Add a backend service from this GitHub repo.
4. Set the backend service root directory to `/backend`.
5. If Railway does not auto-detect it, set the config file path to `/backend/railway.json`.
6. In the backend service variables, add:

```env
MYSQL_URL=${{MySQL.MYSQL_URL}}
CHAT_ENCRYPTION_KEY=replace_with_a_long_random_secret
DB_CONNECTION_LIMIT=5
```

Use the exact MySQL service name Railway shows in your canvas. If it is named `mysql` instead of `MySQL`, the reference becomes `${{mysql.MYSQL_URL}}`.

## Which Websites May Call the API

The backend refuses requests from a website that is not on its list, and the refusal happens **in the browser**: the API answers correctly and the browser throws the answer away. The visitor sees "Failed to fetch" and the only trace is a CORS error in the console.

The list always includes:

- `https://jenacademia.com` and `https://www.jenacademia.com` — the live site
- `https://jenacademia.vercel.app` — the earlier deployment
- `http://localhost:5173` — local development

To add another, set `CORS_ORIGINS` in the backend service variables with a comma-separated list. It **adds** to the list above rather than replacing it:

```env
CORS_ORIGINS=https://staging.jenacademia.com,https://new.jenacademia.com
```

The list is printed when the backend starts, so you can check it without opening a browser console:

```txt
[cors] Allowed origins: https://jenacademia.com, https://www.jenacademia.com, ...
```

If the site is on a domain that is not on that line, this is why nothing loads.

## Email

The app sends three emails: an account setup invite, a password reset link, and a message from the contact form.

### Railway blocks SMTP below the Pro plan

Outbound SMTP (ports 25, 465 and 587) is **disabled on Railway's Free, Trial and Hobby plans**. It is only available on Pro and above. The block drops packets instead of refusing them, so the connection does not fail — it hangs until it times out, and the visitor sees "Server error. Please try again later." after a quarter of a minute.

That is not a password that needs fixing. The port is closed from the outside.

Two ways out:

1. **Use the HTTPS mail API** (works on every plan, port 443). This is the recommended route. Add to the backend service variables:

   ```env
   MAIL_TRANSPORT=api
   MAIL_API_PROVIDER=resend
   MAIL_API_KEY=re_your_key_here
   MAIL_API_FROM=academy@jenacademia.com
   ```

   - `MAIL_API_PROVIDER` is `resend` or `postmark`.
   - `MAIL_API_FROM` must be a domain the provider has verified for that account. With Resend, add the domain in the dashboard and put the DNS records it gives you in your DNS host. Until the domain is verified, Resend's shared `onboarding@resend.dev` sender will only deliver to the address that owns the API key.
   - `MAIL_API_FROM_NAME` sets the name the recipient sees. It defaults to "JEN Academia".

2. **Upgrade to the Pro plan** and redeploy the backend service. Then plain SMTP works and no code change is needed:

   ```env
   SMTP_HOST=smtp.your-provider.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=academy@your-domain.com
   SMTP_PASS=your-app-password
   SMTP_FROM=academy@your-domain.com
   SMTP_FROM_NAME=JEN Academia
   ```

   - `SMTP_PORT` 587 is STARTTLS (the usual), 465 is implicit TLS with `SMTP_SECURE=true`.
   - `SMTP_FROM` defaults to `SMTP_USER`, and `SMTP_FROM_NAME` defaults to `JEN Academia`.
   - Gmail needs an **app password**, not the account password: turn on 2-Step Verification, then create one at <https://myaccount.google.com/apppasswords>.

The backend prints one line at start-up saying what it will do:

```txt
[mail] Resend over HTTPS as academy@jenacademia.com
[mail] SMTP smtp.your-provider.com:587 as academy@your-domain.com
```

`CONTACT_FORM_TO` is where the contact form sends, whichever transport is in use. It defaults to the address the website publishes as "Email us".

If it says `not configured`, the three emails above are not being sent. The account setup invite route still returns the invite link, the password reset still answers as if it worked, and the contact form answers "not configured" — so nothing fails loudly, and a broken mail server can sit there for a week unnoticed. That line is the only place it shows up.

**Leave `SMTP_REDIRECT_TO` unset.** It is a development setting that sends every email to one address instead of to the person it is addressed to. The server warns loudly at start-up when it is on.

### Which transport is used

`MAIL_TRANSPORT` decides:

| `MAIL_TRANSPORT` | What happens |
| --- | --- |
| `auto` (default) | The HTTPS mail API when `MAIL_API_KEY` is set, otherwise SMTP. |
| `api` | The HTTPS mail API only. |
| `smtp` | SMTP only. |

The default is `auto` because the HTTPS mail API is the one that works from every host. Set `MAIL_TRANSPORT=smtp` to force SMTP on a Pro plan.

## Uploads

The app stores uploaded assignments, profile images, lessons, and book covers on disk. Attach a Railway volume to the backend service and mount it at:

```txt
/app/uploads
```

Then set:

```env
UPLOAD_ROOT=/app/uploads
```

The backend also reads Railway's automatic `RAILWAY_VOLUME_MOUNT_PATH`, so `UPLOAD_ROOT` is optional if the volume is mounted directly to the directory you want to use for uploads.

Without a volume, uploads can disappear when Railway replaces the container.

## Database Import From Clever Cloud

Export the current Clever Cloud database:

```bash
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF -h CLEVER_HOST -P CLEVER_PORT -u CLEVER_USER -p CLEVER_DATABASE > jen_academia.sql
```

Import it into Railway MySQL:

```bash
mysql -h "$MYSQLHOST" -P "$MYSQLPORT" -u "$MYSQLUSER" -p"$MYSQLPASSWORD" "$MYSQLDATABASE" < jen_academia.sql
```

You can get these values from the Railway MySQL service Variables tab, or run the command inside a linked Railway shell so the variables are already available.

## Frontend on Vercel

The Vercel frontend must point to the Railway backend, not your local backend. In the Vercel project settings, add this environment variable:

```env
VITE_API_URL=https://your-backend-domain.up.railway.app
```

Redeploy the Vercel frontend after changing it. Without this variable, the frontend falls back to `http://localhost:3001`, which can make uploads hit the backend running on your PC.

## Frontend on Railway

If you also move the frontend to Railway:

1. Add a frontend service from the same GitHub repo.
2. Set the root directory to `/frontend`.
3. Generate a public domain for the backend service.
4. Set this frontend variable:

```env
VITE_API_URL=https://your-backend-domain.up.railway.app
```

Then redeploy the frontend.

## Render Cutover

After Railway deploys successfully:

1. Open `https://your-backend-domain.up.railway.app/healthz`.
2. Confirm login and file upload work from the frontend.
3. Update any frontend, DNS, or environment variables that still point to Render.
4. Keep Render and Clever Cloud running until you verify the Railway database has the expected data.
