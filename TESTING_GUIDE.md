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
5. Test "Reject" button with another request

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
- [ ] Reject button marks request as "declined"
- [ ] Both parties can approve/reject (permission check)
- [ ] Notification count decrements after approval
- [ ] Resolved date displays after action

### Admin Panel
- [ ] Reschedule requests visible but not editable
- [ ] Status shown clearly (badge format)
- [ ] Filter by status works correctly
- [ ] No action buttons available
- [ ] Can view all request details

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

### Reject Reschedule Request
```bash
POST http://localhost:3001/api/calendar/reschedule-requests/1/reject
Body: { "user_id": 1 }
```

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
