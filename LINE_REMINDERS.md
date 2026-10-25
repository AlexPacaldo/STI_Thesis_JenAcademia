# LINE Reminders

JEN Academia sends class reminders and scheduling alerts over **LINE** instead of
SMS. Most students already have LINE open, the school pays nothing per message,
and there is no per-country SMS routing to get wrong.

This document covers setup, the linking flow students see, the messages that are
sent, message quota, local testing, and what to check when something does not
arrive.

---

## What gets sent

| Reminder | Who receives it | When |
| --- | --- | --- |
| Class starting soon | Student **and** teacher | 30 and 10 minutes before the class start time |
| Reschedule requested | The other party (the person who must approve) | Immediately when a request is made |
| Reschedule approved | The person who asked | Immediately when approved |
| Reschedule declined | The person who asked | Immediately when declined, with the reason |
| Reschedule still waiting | The person who must approve | Once, after `LINE_PENDING_NUDGE_MINUTES` (default 2 hours), as long as the class has not started |
| Contract expiring | The student | When an active class package expires within 7 days |

Every message contains a link back to the calendar so the recipient can act
without hunting through the app.

Users can pause LINE messages without unlinking their account, and can
disconnect LINE entirely, from **Account → LINE reminders**.

---

## One-time setup

### 1. Create a LINE Official Account

1. Go to <https://manager.line.biz> and sign in with a personal LINE account.
2. Create an Official Account for the school (the name students will see).
3. Keep the account; it is the thing students add as a friend.

### 2. Create a Messaging API channel

1. Go to the [LINE Developers console](https://developers.line.biz/console/).
2. Create a provider (or reuse one), then **Create a Messaging API channel**.
3. Choose the Official Account you just made.
4. In the channel's **Messaging API** tab, copy:
   - **Channel access token (long-lived)** → `LINE_CHANNEL_ACCESS_TOKEN`
   - **Channel secret** → `LINE_CHANNEL_SECRET`
   - **Basic ID** (looks like `@123abcd`) → `LINE_BOT_BASIC_ID`

### 3. Turn the bot's auto-replies off

In the Messaging API tab, set:

- **Use webhook**: ON
- **Webhook URL**: `https://<your-backend-host>/api/line/webhook`
- **Auto-reply messages**: OFF
- **Greeting messages**: OFF

If auto-reply is left on, the bot answers every linking code with canned text
and the student never finds out whether it worked.

Verify the webhook with the **Verify** button. A correct URL answers `200`.

### 4. Set the environment variables

In `backend/.env` (see `backend/.env.example` for the annotated block):

```dotenv
LINE_CHANNEL_ACCESS_TOKEN=<long-lived channel access token>
LINE_CHANNEL_SECRET=<channel secret>
LINE_BOT_BASIC_ID=@123abcd
LINE_BOT_ADD_FRIEND_URL=
LINE_LINK_SECRET=<optional; falls back to SESSION_SECRET>

LINE_CLASS_REMINDER_MINUTES=30,10
LINE_PENDING_NUDGE_MINUTES=120
```

`LINE_CLASS_REMINDER_MINUTES` is a comma-separated list of minutes before the
start. Values that are not positive whole numbers are ignored.

### 5. Run the database migration

The code expects six columns on `users` and a `line_reminder_log` table. Run the
idempotent migration once per database:

```bash
cd backend
node add-line-reminders.js
```

It is safe to run twice. `Database.sql` already contains the same schema for a
from-scratch restore.

### 6. Restart the backend

At start-up the log prints either:

```
[line] LINE reminders are ready (webhook: /api/line/webhook)
```

or a warning naming the variable that is missing. If reminders are not
configured, the Account page still loads; the LINE card simply explains that
the admin needs to finish setup.

---

## How a student links LINE

1. Sign in and open **Account**.
2. Find the **LINE reminders** card and press **Connect LINE**.
3. A six-digit code appears. It expires after 10 minutes and works once.
4. Press the add-friend link (or search the Basic ID) in LINE, then send the
   six-digit code to the chat.
5. The card notices the link within about five seconds and shows **Connected**.

The code is stored only as an HMAC hash. The plain code is never written to the
database, so a database dump cannot be replayed to hijack an account. Codes are
rate-limited per LINE user, and a wrong code does not reveal whether an account
exists.

One LINE account may be linked to more than one JEN Academia account (for
example a parent and a student sharing a phone). The opposite is not true: one
JEN Academia account holds exactly one LINE user id.

### Unlinking and pausing

- **Pause** keeps the link but stops every LINE message.
- **Disconnect** clears the stored LINE id. The student can link again later.

If a student blocks the Official Account, LINE rejects the push. The reminder is
logged as attempted and no retry storm follows; the Account page still shows the
link, so the fix is to unblock the account in LINE or reconnect.

---

## Message quota

The LINE free plan allows a limited number of **push** messages per month
(currently 200 on the entry plan; check the LINE Official Account pricing page,
because LINE changes it). Replies to a user's own message are free, but all the
reminders here are pushes.

Rough monthly cost with the defaults:

- Each class sends **2 messages per person** (30-minute and 10-minute).
- A student with 8 classes a month costs about 16 messages; a teacher with 40
  classes costs about 80.
- Reschedule alerts add one message per request, plus one result message.

With the free plan full, pushes fail. The app logs the failure and keeps going;
it never blocks a class or a reschedule because LINE refused a message. If the
school outgrows the free tier, either upgrade the plan or set
`LINE_CLASS_REMINDER_MINUTES=10` to drop the earlier reminder.

The database deduplicates before sending: a row in `line_reminder_log` is
reserved with `INSERT IGNORE` **before** the push. Two overlapping sweeps, a
restart, or a second server instance cannot double-send the same reminder. If a
push then fails, the reservation is released so the next sweep can retry.

---

## Local testing

LINE cannot reach `localhost`. Use a tunnel:

```bash
# any of these works; ngrok is the usual choice
ngrok http 3000
```

Then set the webhook URL to `https://<tunnel-host>/api/line/webhook`, send a
message to the Official Account, and watch the backend log.

To test without sending anything to LINE, the reminder logic is covered by:

```bash
cd backend
node --test line.test.js lineReminders.test.js
```

The tests cover signature verification, code hashing and expiry, timezone
conversion, reminder-offset selection, message text, and the sweep's
deduplication.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Card says LINE is not available | `LINE_CHANNEL_ACCESS_TOKEN` missing | Set it and restart |
| Card says the webhook secret is missing | `LINE_CHANNEL_SECRET` missing | Set it and restart |
| Code never links | Webhook URL wrong, or "Use webhook" off | Verify the URL in the LINE console |
| Code links, then messages do not arrive | Student blocked the account, or plan quota exhausted | Unblock in LINE / check quota in the console |
| Webhook returns `401` | Body was parsed before signature check, or wrong channel secret | Confirm the secret; the server verifies the raw request bytes |
| `line_reminder_log` errors at start-up | Migration not run | `node add-line-reminders.js` |
| Times look wrong | Class times are stored as wall-clock in the **teacher's** timezone | Set the teacher's timezone on their account; each recipient sees their own local time |

Webhook deliveries are answered `200` before the events are processed, so LINE
does not retry an event that was already handled. Failures are logged rather
than surfaced to the sender.

---

## Files

| File | Purpose |
| --- | --- |
| `backend/line.js` | Messaging API client, signature check, link-code helpers |
| `backend/lineReminders.js` | Timezone maths, message builders, reminder sweep |
| `backend/add-line-reminders.js` | Idempotent schema migration |
| `backend/line.test.js` | Transport and linking tests |
| `backend/lineReminders.test.js` | Reminder and timezone tests |
| `frontend/src/components/LineConnectCard.jsx` | Account-page linking UI |
