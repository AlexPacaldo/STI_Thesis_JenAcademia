# Quick Start & Testing Guide

## System Requirements
- Backend running on `http://localhost:3001`
- Frontend running on `http://localhost:3000` (or dev server)
- MySQL database with `notifications` table (should already exist)

## Key Components Added

### Backend Files Modified
- `backend/server.js` - Added notification endpoints and booked date detection

### Frontend Components Added
- `frontend/src/components/NotificationPanel.jsx` - New notification panel
- `frontend/src/assets/notificationPanel.module.css` - Panel styles

### Frontend Components Modified
- `frontend/src/components/Header.jsx` - Added notification bell
- `frontend/src/assets/header.module.css` - Added bell button styles
- `frontend/src/pages/Calendar.jsx` - Added booked date filtering
- `frontend/src/pages/AdminDashboard.jsx` - Removed approve/reject buttons

---

## How to Test

### Test 1: Reschedule Notification Flow
1. Log in as **Student A**
2. Go to Calendar page
3. Select a scheduled class
4. Click "Request for Reschedule"
5. Fill in form:
   - Select a date without conflicts (green indicator)
   - Select an available time
   - Add reason (e.g., "Need to reschedule due to personal reasons")
6. Click "Send Request"
7. See success notification
8. Log out

### Test 2: Teacher/Student Receives Notification
1. Log in as **Teacher** (who has the class)
2. Look at header - should see notification bell with count
3. Click bell to open notification panel
4. Should see the reschedule request from Student A with:
   - Class name
   - Requester name
   - Original date/time
   - Requested date/time
   - Reason

### Test 3: Approve/Reject Request
1. In notification panel (from Test 2)
2. Click "Approve" button
3. Should see success notification: "Reschedule request approved!"
4. Request card should disappear or show "Approved" status
5. Test "Decline" button with another request
6. The decline dialog asks for a reason - the "Decline" button stays disabled
   until at least 5 characters are typed
7. Log in as the requester and open the bell: the notification says who
   declined it and shows the reason

The rules that decide what a valid reason is, and how the message is worded,
are checked on their own:

```bash
node --test backend/rescheduleRequestFlow.test.js
```

### Test 4: Booked Date Detection
1. Log in as **Student B**
2. Go to Calendar
3. Select another class they have
4. Click "Request for Reschedule"
5. Select date that already has a booking
6. Notice:
   - Yellow warning shows "⚠️ Booked times: [time]"
   - Or green message "✓ All times available"
7. Try to select already booked time
8. Red error message appears: "This time slot is already booked"
9. Submit button is disabled for booked slots

### Test 5: Admin View (Read-Only)
1. Log in as **Admin**
2. Go to Admin Dashboard
3. Click "Reschedule Requests" tab
4. Should see all reschedule requests
5. Can filter by status (All/Pending/Approved/Declined)
6. **No Approve/Reject buttons** - only status display
7. Can see who requested, when, and current status

---

## Expected Behavior Checklist

### Notification System
- [ ] Notification bell appears in header for students and teachers
- [ ] Badge shows count of pending requests
- [ ] Clicking bell opens notification panel
- [ ] Panel slides in from right side
- [ ] Notification count updates when new requests come in
- [ ] Panel shows detailed request information

### Reschedule Form
- [ ] Shows current class details
- [ ] Date picker allows future dates
- [ ] Shows warning for booked dates
- [ ] Time input validates against booked times
- [ ] Submit button disabled for booked slots
- [ ] Error messages appear for conflicts
- [ ] Success message on submission

### Approval/Rejection
- [ ] Approve button marks request as "approved"
- [ ] Decline button asks for a reason and refuses to go through without one
- [ ] The requester is told who declined it and why, in their notification
- [ ] The reason is stored on the request and shown in the admin request list
- [ ] Both parties can approve/reject (permission check)
- [ ] Notification count decrements after approval
- [ ] Resolved date displays after action

### Admin Panel
- [ ] Reschedule requests visible but not editable
- [ ] Status shown clearly (badge format)
- [ ] Filter by status works correctly
- [ ] No action buttons available
- [ ] Can view all request details

### Contract Requests (student asks, asks again, changes their mind)
- [ ] "Request an extension" creates a request and the admin's bell shows it once
- [ ] Asking again while it is pending says the request was UPDATED, not sent twice
- [ ] The admin's bell still shows one entry for the request, not one per submission
- [ ] The admin can see the student's reason, and the earlier versions of it
- [ ] "Withdraw this request" removes it from the admin's queue
- [ ] Withdrawing twice is refused, and says the request was already answered
- [ ] A new contract request and an extension request are separate, and can both be pending
- [ ] A declined request can be asked again; an approved one offers nothing further
- [ ] The request queue never shows two pending requests of the same kind for one student

---

## Contract Request Flow

A student can have **one request with the admin at a time** - a new contract, or
an extension. Asking again while one is pending is a **revision** of that request,
not a second one. Asking for the **other kind** is refused, because the two
contradict each other: a new contract replaces the contract the unused classes
are on, so approving one undoes what the other is asking to preserve.

| The student does | What happens |
|---|---|
| Sends a request | A pending request is created, and each admin is notified once |
| Sends it again | The same request is revised. The earlier version is kept, the revision count goes up, and the admin's notification is updated in place - one bell entry, still unread |
| Sends the other kind | **Refused.** The button for the other route is disabled, and the student is told to withdraw the request they already sent |
| Withdraws it | The request is marked withdrawn, it leaves the queue, and the admin's notification is read rather than deleted |
| The admin decides | The request is approved or declined. A decline can be asked again |

The rule is enforced in three places, so it cannot be worked around: the
database has a unique key over a generated column, the student's row is locked
for the length of the request, and the route refuses a second kind outright.

### Checks

```bash
node backend/contractRequestFlow.test.js --test          # the rules
node scripts/test-student-rules.mjs                      # which asks are allowed
node scripts/test-contract-request-flow.mjs               # what the student is offered
node scripts/test-contract-request-migration.mjs          # the schema, on a scratch table
node scripts/test-contract-request-e2e.mjs                # the whole thing, over HTTP
node scripts/test-student-copy.mjs                       # the words the student reads
node scripts/test-calendar-roles.mjs                     # the page, in a real browser
```

The end-to-end check starts the backend on its own port, creates a student of
its own, drives the real routes, and removes everything it created.

The browser sweep needs a driver:

```bash
npm i -D puppeteer-core
```

It drives Edge, checks the student's booking form, the teacher's grid and
availability manager, and the admin's calendar, and reads nothing it does not
create. Without the driver it skips and passes, so it never blocks a commit.

---

## Troubleshooting

### Notification Bell Not Showing
- Check if user is logged in (stores in localStorage)
- Check if user role is "student" or "teacher"
- Check browser console for errors

### Booked Dates Not Showing
- Verify `GET /api/calendar/booked-dates/:user_id` endpoint returns data
- Check database has classes with status='scheduled'
- Clear browser cache and reload

### Notifications Not Appearing
- Check if `notifications` table exists in database
- Verify notification creation endpoint is called successfully
- Check backend logs for errors

### Approve/Reject Not Working
- Verify user has permission (must be class participant)
- Check console for HTTP errors
- Verify request is in "pending" status
- A decline that answers `400` was sent without a usable reason - the backend
  wants at least 5 characters

---

## API Testing (Using curl/Postman)

### Get Booked Dates
```bash
GET http://localhost:3001/api/calendar/booked-dates/1
```

### Get My Reschedule Requests
```bash
GET http://localhost:3001/api/calendar/my-reschedule-requests/1
```

### Approve Reschedule Request
```bash
POST http://localhost:3001/api/calendar/reschedule-requests/1/approve
Body: { "user_id": 1 }
```

### Decline Reschedule Request
```bash
POST http://localhost:3001/api/calendar/reschedule-requests/1/reject
Body: { "user_id": 1, "reason": "I already have a class booked that day" }
```

`reason` is required: at least 5 characters, at most 500. Without one the
route answers `400` and the request stays pending.

### Get Admin View
```bash
GET http://localhost:3001/api/admin/reschedule-requests
GET http://localhost:3001/api/admin/reschedule-requests?status=pending
```

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Notification panel blank | No pending requests | Create a reschedule request first |
| Bell not showing count | API not returning data | Check backend endpoint response |
| "Not authorized" error | User not class participant | Verify user_id in token/auth |
| Dates showing as booked | Include booked classes | Check bookedDates state in Calendar |
| Admin can see approve buttons | Old code cached | Clear browser cache, rebuild frontend |

---

## Next Steps / Enhancements
1. Add email notifications when requests are made
2. Add auto-approval for certain date changes
3. Add calendar event creation for approved reschedules
4. Add request expiration (auto-decline after X days)
5. Add teacher preferences for reschedule windows
6. Add student-to-student swap functionality
7. Add analytics dashboard for reschedule patterns
