# Group class proposals

Teachers open an existing class and choose **Propose group class**. They select a second student's booked lesson, find a shared time, select a result, and send an invitation. The first version supports two students, one occurrence, and matching teacher, course, and duration.

Both students respond in **Calendar → Group invitations**. The original bookings remain reserved until both accept. Declining, cancelling, expiry, changes to an original booking, or an invalid final schedule keep the originals unchanged. Invitations expire within 24 hours or 15 minutes before the earliest original/proposed lesson, whichever occurs first. Pending proposals temporarily reserve the proposed interval.

## Compatibility

- `group_class_sessions` owns the shared session and meeting link. The original `classes` IDs remain each student's participation records. Conversion moves these records in one transaction and does not create extra student bookings or deduct extra class allowances.
- Proposal member snapshots preserve the original times and package IDs for audit. Package eligibility and conflicts are checked again before conversion.
- Teacher calendar lists collapse participant bookings into one displayed group. Raw caches retain every participant and temporary reservation for conflict checking.
- Attendance, joining consent, class completion, contract charging, and private teacher remarks remain per student. Starting/ending the shared lesson and its evidence apply to the linked session. An absent student is never verified because another student attended.
- Both students must join and consent before group recording starts. Evidence file cleanup preserves files still referenced by another participant.
- Ordinary rescheduling cannot move only one group participant. The teacher uses **Propose new group time**, which requires approval from the same two students.
- Existing one-to-one classes remain ungrouped and use their existing booking, classroom, evidence, and completion paths.

## Database preparation

The existing startup migration runner creates the three group tables and adds nullable `classes.group_session_id` with an index. No existing bookings are converted during migration. If preparation fails, group routes return 503 and individual scheduling continues using the existing schema.

No production data or deployment is required by the unit tests. The service tests use a transactional database double; live MySQL locking/migration and full browser acceptance testing are separate checks.

## Validation

```powershell
cd backend
npm.cmd test
cd ..
node scripts/test-group-class-display.mjs
node scripts/test-group-class-render.mjs
node scripts/test-booking-route.mjs
node scripts/test-booking-times.mjs
node scripts/test-availability-editing.mjs
cd frontend
npm.cmd run build
```
