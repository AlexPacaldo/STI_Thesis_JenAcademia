# Scheduling and attendance rules

- A scheduled class opens 30 minutes before its scheduled start. Students can
  join and record their attendance before the teacher arrives. There is no
  15-minute attendance cutoff or automatic no-show conversion.
- An unstarted class closes at its scheduled end. Once the teacher starts,
  participants can join or rejoin until the teacher ends the session. Closed,
  cancelled, completed, no-show and incomplete sessions reject entry.
- The five-minute start-screenshot window begins when both the teacher and
  student are present: the later of teacher start and student attendance.
  Screenshots uploaded before that point or more than five minutes later do
  not qualify for automatic verification. Administrator and student review
  screens apply the same rule.
- Recording attendance closes individual rescheduling and group conversion
  for that booking. Pending approvals recheck this rule under a transaction
  lock. If a student joins and the teacher never arrives, an administrator
  can mark the verification incomplete to release the booking credit.
- Booking and rescheduling require a future start time. The full lesson must
  fit within its original active contract, including the lesson's end time.
  Approval rechecks the original contract rather than using a newer package.
  New contracts receive their expiry at creation; legacy missing deadlines use
  the standard three-calendar-month term.
- Only the other participant can approve or decline a reschedule request.
  The requester can cancel their own request.
- Individual booking and rescheduling compare occupied intervals as real
  instants in each teacher's timezone, including adjacent calendar dates.
  Back-to-back lessons are allowed; overlapping lessons are refused.
- Verified duration begins when both participants are present. Waiting for the
  other participant does not count toward the minimum duration. This applies
  independently to each student in a group. Short sessions can be submitted
  for administrator review instead of being automatically verified.
- Unresolved past bookings retain their credit reservations until resolved.
  Date and month views keep these bookings accessible. Active sessions remain
  in the upcoming list even when they cross midnight.
- Entry and manual no-show timing use the class/profile timezone rather than
  the device timezone. A teacher can mark a student absent only after the
  scheduled end and only if the student has not recorded attendance.
- Completing or approving an old booking uses the contract that existed when
  it was booked, never a newer replacement contract. Teacher completion
  requires that original contract to remain active; an administrator can
  resolve an expired original contract with remaining allowance.
- Consuming the penultimate credit leaves the contract active. Consuming its
  final credit expires it. The legacy manual credit-debit endpoint is limited
  to administrators; student attendance alone never consumes a credit.

## Local verification

Run the backend unit suite with `node --test` from `backend`, and run:

```text
node scripts/test-class-entry.mjs
node scripts/test-scheduling-lifecycle.mjs
node scripts/test-booking-route.mjs
node scripts/test-reschedule-boundaries.mjs
node scripts/test-booking-times.mjs
node scripts/test-availability-editing.mjs
```

Build the frontend with `npm run build` from `frontend`.

The route regression tests use isolated database doubles and exercise the real
handlers. The optional `node scripts/test-scheduling-mysql.mjs` integration test
replays the production attendance/credit SQL and concurrent locks against
uniquely named scratch tables, which it removes afterward. It does not modify
application records or send notifications.

These checks do not replace browser/video-provider testing. Verify student-first
entry, late-class rejoining, and manual administrator resolution in staging
before deployment.
