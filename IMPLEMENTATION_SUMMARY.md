# Reschedule Notification System - Implementation Summary

## Overview
Implemented a complete notification and approval system for reschedule requests where:
- Students/teachers are notified when someone requests to reschedule a class
- Approval/rejection happens directly through notifications (not admin panel)
- System automatically detects and shows booked dates to prevent double-booking
- Admin can only view reschedule request details (no approval rights)

---

## Backend Changes

### 1. **Updated Reschedule Request Creation** ([server.js](backend/server.js#L453-L501))
   - Modified `POST /api/calendar/reschedule-request` endpoint
   - Automatically creates a notification when a reschedule request is made
   - Notification is sent to the counterparty (teacher if student requests, student if teacher requests)
   - Includes request details in the notification message

### 2. **New: Get Booked Dates Endpoint** ([server.js](backend/server.js#L503-L520))
   - `GET /api/calendar/booked-dates/:user_id`
   - Returns all booked dates/times for a specific user (teacher or student)
   - Used by frontend to filter available slots for rescheduling
   - Retrieves only scheduled/active classes

### 3. **New: User Reschedule Requests Endpoint** ([server.js](backend/server.js#L522-L548))
   - `GET /api/calendar/my-reschedule-requests/:user_id`
   - Gets pending reschedule requests that user needs to approve/reject
   - Filters out requests from the user themselves (only shows requests where someone else is requesting)
   - Returns detailed class and requester information

### 4. **New: Approve Reschedule Endpoint** ([server.js](backend/server.js#L550-L578))
   - `POST /api/calendar/reschedule-requests/:id/approve`
   - Allows users (teacher or student) to approve reschedule requests directly
   - Includes authorization check (only class participants can approve)
   - Updates request status and timestamp

### 5. **New: Reject Reschedule Endpoint** ([server.js](backend/server.js#L580-L608))
   - `POST /api/calendar/reschedule-requests/:id/reject`
   - Allows users to reject reschedule requests
   - Same authorization as approve endpoint
   - Updates request status to "declined"

### 6. **Removed Admin Approval** ([server.js](backend/server.js#L638-L642))
   - Removed `PUT /api/admin/reschedule-requests/:id` endpoint functionality
   - Admin can still view requests but cannot approve/reject them
   - Added comment explaining the change

---

## Frontend Changes

### 1. **New: NotificationPanel Component** ([NotificationPanel.jsx](frontend/src/components/NotificationPanel.jsx))
   - Dedicated sliding panel for reschedule notifications
   - Features:
     - Displays all pending reschedule requests
     - Shows class name, requester, original time, requested time, and reason
     - Approve/Reject buttons for each request
     - Real-time status updates
   - Calls new backend endpoints to fetch and manage requests

### 2. **New: NotificationPanel Styles** ([notificationPanel.module.css](frontend/src/assets/notificationPanel.module.css))
   - Sliding panel that opens from the right side
   - Beautiful card-based layout for each request
   - Color-coded status badges (pending, approved, rejected)
   - Responsive button styles with hover effects
   - Overlay that closes panel on click outside

### 3. **Updated Header Component** ([Header.jsx](frontend/src/components/Header.jsx))
   - Added notification bell icon (🔔) in navbar
   - Shows unread/pending reschedule request count
   - Bell appears for both students and teachers
   - Clicking bell opens NotificationPanel
   - Auto-polls for new notifications every 30 seconds
   - Features:
     - Imports axios for API calls
     - Fetches pending reschedule requests
     - Displays count badge next to bell icon
     - Integrated NotificationPanel component

### 4. **Updated Header Styles** ([header.module.css](frontend/src/assets/header.module.css))
   - Added `.notificationBell` button styles
   - Added `.badge` styles for notification count
   - Bell icon with hover effects
   - Red badge with count display

### 5. **Enhanced Calendar Component** ([Calendar.jsx](frontend/src/pages/Calendar.jsx))
   - Added booked dates state to track user's existing bookings
   - New helper functions:
     - `getBookedTimesForDate()` - shows which times are already booked
     - `isDateTimeBooked()` - checks if a specific slot is taken
   - Reschedule form enhancements:
     - Shows warning if selected date/time is already booked
     - Displays list of booked times for selected date
     - Shows "✓ All times available" message when no conflicts
     - Disables Send button if choosing already-booked slot
     - Validates date/time availability before submission
   - Fetches booked dates when user role/ID changes

### 6. **Updated AdminDashboard** ([AdminDashboard.jsx](frontend/src/pages/AdminDashboard.jsx))
   - Removed Approve/Decline action buttons
   - Reschedule requests now show in read-only mode
   - Displays:
     - Request status (Pending/Approved/Declined)
     - Resolved date if applicable
   - Admin can still view all details but cannot modify status
   - Keeps ability to filter requests by status

---

## User Experience Flow

### Student/Teacher Requesting Reschedule:
1. Opens Calendar page
2. Selects a class to reschedule
3. Clicks "Request for Reschedule"
4. Form shows:
   - New date picker (shows booked dates as warnings)
   - New time picker (validates availability)
   - Reason field
5. Submits request → notification sent to counterparty
6. Gets success message

### Teacher/Student Receiving Request:
1. Sees notification bell with count in header
2. Clicks bell to open NotificationPanel
3. Views request details:
   - Who requested
   - Original time
   - Requested new time
   - Reason
4. Clicks "Approve" or "Reject"
5. Request status updates immediately

### Admin Viewing Requests:
1. Goes to Admin Dashboard
2. Navigates to Reschedule Requests tab
3. Can filter by status (All/Pending/Approved/Rejected)
4. Sees detailed information but no approval buttons
5. Can only view, not modify requests

---

## Database Impact
- No new tables required
- Uses existing:
  - `reschedule_requests` table
  - `classes` table
  - `users` table
  - (Assumes `notifications` table exists for notification storage)

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/calendar/reschedule-request` | Create reschedule request (+ auto notification) |
| GET | `/api/calendar/booked-dates/:user_id` | Get user's booked dates/times |
| GET | `/api/calendar/my-reschedule-requests/:user_id` | Get pending requests user can approve/reject |
| POST | `/api/calendar/reschedule-requests/:id/approve` | Approve request (user) |
| POST | `/api/calendar/reschedule-requests/:id/reject` | Reject request (user) |
| GET | `/api/admin/reschedule-requests` | View all requests (admin, read-only) |

---

## Key Features
✅ Automatic notifications on reschedule requests  
✅ Self-service approval/rejection via notifications  
✅ Booked date detection and warning system  
✅ Prevention of double-booking  
✅ Admin visibility without approval rights  
✅ Real-time notification count in header  
✅ Beautiful sliding notification panel  
✅ Responsive design  
✅ Error handling and validation  
✅ Toast notifications for user feedback  

---

## Testing Recommendations
1. Test reschedule request creation → notification generation
2. Test approval/rejection flows
3. Test booked date filtering on reschedule form
4. Test notification count updates
5. Test admin view (read-only mode)
6. Test multi-user scenarios
7. Test edge cases (fully booked dates, past dates, etc.)

---

## Notes
- Notifications require a working `notifications` table in the database
- The system uses real-time polling (30 seconds) for notification updates
- Consider adding email notifications as future enhancement
- The approval/rejection can be done from either party's notification panel
