# JEN Academia — features and system rules

Source inventory updated 25 November 2026 against the current repository. This describes the current repository, including local changes. It is not a certification of the deployed website or a comparison against the thesis transcript, which was not provided. Features listed as API support, interface rules, or configuration dependent should retain those qualifications in a thesis checklist.

## Role boundaries

| Role | Scope |
|---|---|
| Visitor | Public information, contact form, sign-in, password recovery, account invitation setup. |
| Student | Own learning, assigned teacher, own contracts, bookings, attendance, assignments, remarks, books, reviews and communication. |
| Teacher | Own availability, assigned students, own classes, attendance evidence, assignments, remarks, distributed books and contract evaluations. |
| Administrator | School oversight, teacher/student onboarding, contracts, account management, material management and verification decisions. |
| Super administrator | Administrator permissions plus creation of other administrators. Stored as an admin account with an additional privilege flag. |

## Visitor / public website

### Information module

- View the school landing page, learning services, course information, tutor-matching explanation, trial/enrollment process and contact information.
- Follow contact, email and social links.
- Read the enrollment sequence: contact the school; complete the trial and contract process; receive an administrator-created account; book classes.
- Course and matching catalogs reference Online English, Conversational English, Travel English, Business English, Job Interview, IELTS, TOEIC, OPIc and News. Available course records come from the database.
- The public page's claims about pricing, trials and verified tutors are information; they do not themselves implement checkout, trial booking or a tutor credential-verification workflow.

### Contact module

- Submit name, email and message to the school.
- Name, valid email and message are required; message maximum is 2,000 characters.
- Contact submission is rate limited; the default is 10 requests per 15 minutes per limiter identity.
- Anti-bot verification is configuration dependent.
- Email delivery requires the school's mail configuration; delivery failure is reported.

### Authentication and recovery module

- Sign in using email and password; choose whether to stay signed in.
- Redirect to the dashboard for the authenticated role.
- Show incorrect credentials, temporary lockout, archived-account and setup-link errors.
- Account lockout begins after five failed sign-in attempts for 30 seconds. Every three further failed attempts triggers a longer lockout: 45 seconds, 60 seconds, 3 minutes and then 5 minutes; later lockouts remain at 5 minutes. Network sign-in limiter defaults to 100 attempts per 15 minutes; deployment settings may override these values.
- Request a password-reset email. The response does not disclose whether an eligible email account exists.
- Open and validate a password-reset link; set a new password.
- Reset links expire after one hour, are stored as hashes, are single use, and older unused reset links are invalidated when replaced.
- Student and teacher accounts are created by an administrator; there is no public self-registration screen.
- Accept a setup invitation, validate its token and set the initial password.
- Account invitations default to 24-hour expiry, configurable by deployment.
- Invitation renewal replaces unused older links. Completed invitations cannot be reused.

## Shared authenticated modules

### Navigation and session module

- Role-specific sidebar, dashboard links, account menu, sign-out, notification drawer and chat launcher.
- Responsive navigation and layouts for smaller screens.
- Protected page access; a role visiting another role's page is redirected to its own dashboard.
- Incomplete profiles are directed to Account setup before ordinary use.
- Students must complete LINE linking before normal student-page access. Staff do not have this requirement.
- Pending required contract reviews direct the participant to Contract Reviews before continuing ordinary navigation.
- Default server session lifetime is 12 hours, configurable. The interface additionally applies five-hour inactivity handling when Stay signed in is not selected.
- Successful sign-in revokes earlier active sessions for that account: a newer login supersedes the previous session.
- Archived accounts cannot sign in or continue normal access; account status is rechecked.
- Invalid or expired authentication ends the local session. Incorrect current-password confirmation during a profile update is a field/action error and must not end the session.
- Lazy-loaded pages have loading/error handling.
- First Steps and Calendar guides support step navigation, dismissal/reopening and saved progress.

### My Account module

- View account identity, role, profile image, names, email, country, birthday, timezone and existing contact details.
- View role-specific learning/teaching information, including student course/teacher/package/proficiency information where available.
- Complete first-time setup through the setup steps.
- Edit supported personal details and timezone; confirm sensitive detail changes with the current password.
- First name is required; last name is optional on the self-service profile form.
- Name validation allows Unicode letters and combining marks, spaces, periods, apostrophes and hyphens; rejects numbers, emoji and other inappropriate characters. Maximum 100 characters per name field.
- Validate birthday and timezone inputs.
- Email is read-only in self-service Account; an administrator corrects it through Account Management.
- Existing phone information is retained read-only in the current Account workflow.
- Change password using current password, new password and confirmation; show/hide password controls.
- Password minimum is eight characters; the password-change endpoint also limits the value to 72 UTF-8 bytes.
- Upload/select a profile photo, use the camera when available, crop/reposition/zoom, preview and save.
- Accepted profile source formats: JPG/JPEG, PNG, WebP and GIF. The interface accepts source images up to 10 MiB before processing; the server accepts a processed upload up to 2 MiB and checks format/MIME/signature consistency.
- Invalid image formats, oversized files, decoding failures, camera errors and save failures have error handling.
- Teachers can update whether they teach children.

### Notifications module

- Open the bell drawer and view unread counts, dated notifications and related actions.
- Filter All, New times, Homework, Teacher notes, News and Reminders.
- Load notification pages; the current drawer requests 15 records per page.
- Mark individual notifications read, mark all read, remove a notification and clear notifications.
- Follow links to the relevant class, request, assignment, remark, book, availability date or contract review.
- Accept or decline eligible incoming reschedule requests from notifications.
- Reschedule decline requires a reason, with a 5–500-character rule in the request flow.
- Availability notices identify the teacher's date, working hours, timezone and break, rather than only saying availability changed.
- Deleted or unusable availability targets have an explanatory state.
- Notifications cover relevant booking/reschedule changes, teacher availability, homework/submissions, remarks, books/lessons, book completion, contracts/expiry and final reviews.
- Local notification storage can merge with server notifications.
- Toasts are deduplicated by message/type, with at most three visible and five waiting; burst handling preserves active notices and bounds waiting items.
- Notification preference read/update endpoints exist; a full preference-settings screen is not part of the current visible module list.

### Chat module

- Open a conversation/contact drawer, search contacts, select a contact and read/send text messages.
- Show contact identity/profile photo, last-message preview/time, unread counts, online presence and read receipts.
- Receive messages and presence/read updates through a live server stream.
- Open, minimize, restore and close conversation windows.
- Default student contacts: assigned active, profile-complete teacher and active administrators.
- Default teacher contacts: assigned active, profile-complete students and active administrators.
- Administrator contact lists include eligible school users. Existing conversation summaries are also retained.
- Sending requires a nonempty message and two distinct eligible active accounts; non-admin participants must have completed profiles. Sender identity is checked against the authenticated session.
- Default contact lists are not an exclusive backend relationship whitelist: do not describe the server as enforcing “only assigned teacher/student can ever message each other.”
- Message subject/content are encrypted in storage and decrypted for authorized conversation responses.
- Current local pagination work requests the newest 40 messages, supports an older-message cursor and a Load older action, preserves position when prepending, and targets the latest message when reopening.
- Current local mobile work limits the phone layout to one conversation window and adjusts minimized windows/keyboard viewport behavior.
- **Validation status:** pagination unit tests passed in the preceding work, but the chat/mobile browser fixture timed out before contact selection. Treat the recent chat/mobile/navigation fixes as awaiting end-to-end verification, not confirmed acceptance results.

### LINE connection and reminders module — student interface

- View connection status and the school's LINE account/add-friend link.
- Generate a six-digit linking code and send it to the official LINE chat within ten minutes.
- Confirm completion, pause/resume reminders, disconnect and reconnect.
- Student account setup requires the link; pausing messages keeps the identity link.
- The server remembers completed LINE onboarding. Existing migrated completed accounts and users who disconnect after completing this step are not forced through first-time linking again solely because they are currently unlinked.
- Reminder delivery requires configured LINE credentials, a linked account and enabled reminders.
- Default class reminders: 30 and 10 minutes before class; deployment can change the offsets.
- Reschedule messages: request, approval, decline and pending-decision follow-up.
- Default pending-request nudge window is within 120 minutes of class, excluding the last five minutes.
- Default LINE contract-expiry warning is seven days; the separate in-app warning is 14 days.
- Reminder timestamps are rendered in the recipient's timezone; class instants are derived from the teacher's timezone.
- Deduplication reservations prevent repeated successful reminders. Transient send failures can be retried; reminder failure does not undo a successful scheduling operation.
- Teacher/admin Account screens do not expose the student LINE card, although reminder backend code can process already-linked staff records.

## Administrator

### Overview module

- View student, teacher and account totals, active/archived figures and school class summaries.
- View Needs Attention items with links into the relevant management module.
- View the recent seven-day class-status trend and today's timetable.
- View contracts ending, low class balances, newest accounts and accounts archived by dormancy rules.
- Navigate from overview cards to management screens.

### Calendar module

- Inspect the school timetable, navigate dates/months and open class details.
- View participants, course, date/time, duration, meeting link, class status and available verification information.
- Use available role-specific filters/search and upcoming/date views.
- Receive calendar updates when bookings, requests, attendance or verification change.
- Calendar access is school-wide for administrators; students and teachers receive their permitted schedule scope.
- The normal student self-booking wizard and teacher attendance actions are participant workflows; do not equate admin calendar visibility with every participant-only action being present in the admin interface.
- Booking API support additionally allows administrators to create bookings for participants and teachers to book their own classes, subject to the booking handler's eligibility, balance, availability and conflict checks.

### Create Teacher module

- Enter teacher name, email, country and birthday.
- Assign supported courses.
- Enter specialization, teaching style, best student pace, years of experience and teaching bio/notes.
- Set whether the teacher teaches children.
- Optionally auto-fill from a PDF, DOCX or TXT resume, maximum 8 MiB; inspect and confirm parsed values before creation.
- Resume parsing is assistance and rate limited; parsing does not itself create the teacher.
- Review a creation confirmation, create the account and issue its setup invitation.
- See whether account creation succeeded separately from whether email delivery succeeded.

### Create Student / Trial Assessment / Teacher Matching module

- Enter student name, email, country and birthday; select course.
- Score the five trial criteria from 1 to 5 and obtain the computed proficiency level.
- Record learning goals, focus areas, learning styles, pace, custom supported preferences and trial notes.
- Optionally record preferred weekdays and time range.
- Analyze with AI/matching assistance, inspect ranked recommendations, fit explanations and availability/load warnings, and select the teacher.
- Set the initial class package; interface choices are 10, 15 or 20 classes and 25- or 50-minute duration.
- Review confirmation including teacher/assessment/schedule warnings, then create account, profile, package and invitation.
- Teacher recommendations and preferred times do not reserve or book lessons.
- Teacher must be eligible for the course; active/complete account and child-teaching suitability are checked in matching/assignment paths.
- Child suitability uses age 12 or younger. Teachers who opt out of teaching children are excluded for those students.
- Matching compares course, experience/proficiency fit, goal/focus specializations, learning/teaching style, pace, weak whole-word bio signals, assigned load and optional availability.
- Under-two-student teacher load is a balancing preference, **not** a hard two-student capacity. If all suitable teachers meet/exceed it, matching can still recommend with a warning.
- Preferred schedule checks use published, unoccupied availability over the next 21 days; recommendations can surface mismatch warnings.
- Deterministic scoring remains the basis; configured AI can enrich criteria, explain or reorder eligible candidates. It cannot create an otherwise ineligible teacher.
- Student-provided preference/preview requests cannot directly assign a teacher.

### Teacher Courses module

- Search teacher/course assignments, select courses, review and save changes.
- Update a teacher's child-teaching flag through supported admin controls/API.
- Course assignment determines teaching and matching eligibility; it is separate from distributing books.

### Account Management module

- Search accounts by identity/email/role and switch active/archived views.
- Open account details, profile completion, invitation state and invitation expiry.
- Correct user email, subject to uniqueness/validation and protected-super-admin restrictions.
- Resend setup invitation or copy a fresh setup link; provide manual-copy fallback.
- For incomplete accounts, email correction replaces unused invitations and sends a fresh link.
- Completed accounts use their corrected email for future sign-in/recovery; they do not reuse setup invitations.
- Archived accounts cannot receive setup invitations.
- Archive and restore eligible accounts with confirmation; view/restore automatically archived accounts.
- Teacher removal/archiving can leave learners requiring reassignment; overview/account workflows expose students without a teacher.
- Protected super-admin account cannot be archived/suspended and its email cannot be changed through the management endpoint.
- Account archiving is distinct from deleting account data.

### Contracts / Packages module

- Search/filter contracts by student, email, course, teacher and status.
- View package total, used classes, remaining balance, duration, creation/expiry and status badges.
- Edit supported course, eligible assigned teacher, duration, total classes, used classes and Active/Expired/Cancelled status.
- Validate usage against total; remaining balance derives from total minus used.
- New standard contracts have a three-calendar-month term; time expiry and full consumption can make a package expired.
- In-app expiry warning defaults to 14 days before the deadline.
- Booking availability additionally subtracts unresolved reserved bookings from unused credits.
- Review pending new-contract requests and extensions, student preferences/reasons, current package information and request revision history.
- Approve/decline requests; optionally supply administrative response.
- New-contract approval creates the replacement package and applies the associated course/teacher/profile decisions; it does not silently transfer old unused credits.
- Extension approval sets a future end date on the referenced existing contract and preserves package identity, totals and usage; unused balance is rechecked before approval.
- Extension reactivates the package and resets its in-app expiry-warning marker.
- Remove resolved contract requests from the active list by archiving; pending requests must first be decided/withdrawn.
- Payments and extension charges are handled outside the application; approval does not charge a card or collect money.

### Reschedule Requests module

- Search/filter pending, approved, declined and other supported request outcomes.
- Inspect teacher, student, original schedule, requested schedule, reason, decline reason and resolution time.
- Remove individual request records with confirmation; backend also supports bulk removal.
- The admin monitoring screen does not approve/decline participant reschedules. Only the other participant makes that decision.
- Removing a request record is not an approval and does not move the lesson.

### Class Verifications module

- Search/filter class verification records by class, participants, date and state.
- View teacher start, student attendance, teacher end, shared attendance duration, summary, evidence mode and review reason.
- Open start screenshot, end screenshot or recording when available.
- Review Pending, Admin Review, Verified and Incomplete records.
- Approve a supported class as verified/completed or mark it incomplete.
- Approval completes/charges the original booking's package once; repeated approval must not deduct another credit.
- Admin resolution can process an expired original package with remaining allowance, rather than charge a newer replacement package.
- Marking an already completed class incomplete reverses its recorded credit usage in the selected original package path.
- Incomplete evidence records release the corresponding reservation; ordinary no-show is not a verified completed lesson.
- Remove an individual verification record and its uploaded evidence; clear finalized Verified/Incomplete records in bulk.
- Pending/Admin Review records are preserved by bulk final-record cleanup.
- Shared group evidence files are retained while another participant record still references them.
- Cleanup removes verification/evidence records; it is distinct from undoing the class's historical credit decision.

### Books / Lessons / Progress module

- Create a book with title, course, optional description and cover.
- Distribute/reassign book access to teachers; search by book/course/teacher.
- Edit book metadata/cover; archive and restore books with confirmation.
- Book archive preserves lessons and learner progress; distribution removal removes the affected teacher's access.
- Covers: JPG/JPEG, PNG or WebP, maximum 5 MiB.
- Open book content and upload numbered/titled lessons with notes/description and a learning file.
- Lesson upload interface lists PDF, DOC, DOCX and TXT; backend also accepts RTF. Maximum lesson file size 10 MiB.
- Inspect lesson details/files and delete individual lessons with confirmation. Lesson update/replacement also has backend support.
- View Students Progress, per-lesson completion, completed/total lessons, book percentage and completion status.
- Admin maintains the shared library. Teachers read books distributed to them; students inherit access through assigned teacher and course.
- New distribution/material and book-completion events generate notifications for the applicable users.

### Contract Review Reports module

- List completed-contract reviews; search student, teacher, course, level and status.
- Filter complete/awaiting teacher/awaiting student; inspect records awaiting both.
- View summary counts, computed proficiency information and average teacher ratings.
- Open the full report with both sides' five scores, comments, overall student rating and submission dates.
- Only the administrator sees both private reviews together.

## Super administrator

### Create Admin module

- Has all ordinary administrator modules.
- Create another administrator with name, email, country, birthday and initial password.
- Password minimum eight characters; the form uses direct initial-password creation rather than the student/teacher invitation workflow.
- Ordinary administrators cannot create administrators, including by directly calling the create-user API.
- Newly created administrators do not inherit super-admin privilege automatically.
- The original protected super-admin identity has the special account-management protections above.

## Teacher

### Dashboard module

- View personal greeting and today's teaching timetable.
- Open a class directly, open Calendar and open My Students.
- Continue/reopen onboarding guidance.

### My Students module

- View assigned students with profile identity, email, course and package details.
- View contract duration/status, total/used/remaining classes and expiry information.
- Search student/email/course/package state; filter Active, Used up, Inactive and No package.
- Paginate the student list.
- Access is scoped to the teacher's permitted students rather than the whole student directory.

### Calendar / Availability module

- View own monthly/date/upcoming timetable and class details.
- Set a date Available or Unavailable, with start/end working hours and an optional break.
- Apply availability to multiple dates through the bulk workflow; edit existing dates and delete allowed records.
- Availability requires an active, profile-complete teacher account.
- No past-date availability; planning limit is three months ahead.
- For today, available start/end times must be after the current time in the current validation path.
- End must follow start. Both break endpoints are required together; break end must follow break start and the break must fit within working hours.
- One date's availability is inserted/updated as the teacher's record for that date.
- Updating availability controls future bookings; it does not cancel or move existing bookings.
- Availability deletion is blocked if scheduled classes remain booked on that date.
- Assigned students receive relevant availability notices.

### Individual Class / Attendance / Evidence module

- Open class details and meeting in a separate browser tab/window.
- Start own assigned class and record teacher start/consent.
- View student attendance and the class evidence/verification state.
- Select screenshot or recording evidence flow; acknowledge the recording-consent prompt.
- Upload/replace/remove permitted start proof; upload end proof and enter the class summary.
- Capture/upload supported recording evidence, view upload/recording status and reopen available recordings.
- End the class and complete eligible verified lessons, or submit an exception for administrator review with a reason.
- Required shared attendance/recording duration is 60% of scheduled duration, capped at 30 minutes: **15 minutes for a 25-minute class, 30 minutes for a 50-minute class**.
- Shared attendance begins at the later of teacher start and that student's attendance. Waiting alone does not count.
- Screenshot evidence requires separate start and end files. Start proof must be uploaded after both are present and within five minutes of that moment.
- Recording evidence must meet required duration; teacher-start/student-attendance/end requirements still apply.
- Summary validator requires at least four alphanumeric words and terminal `.`, `!` or `?`.
- Missing/short/late evidence or insufficient shared attendance can use the admin-review path instead of automatic verification.
- Teacher completion charges the original active package, once, with remaining allowance; it cannot take the credit from a newer package.
- Mark a student no-show only after the scheduled lesson end and only if the student never confirmed attendance.
- No automatic 15-minute no-show conversion. No-show marking does not itself consume a completion credit.
- Start/end screenshot formats: JPG/JPEG, PNG or WebP, maximum 4 MiB per file.
- Recording formats: WebM or MP4, maximum 500 MiB upload. Default local recording retention is seven days; storage/provider configuration can alter delivery/retention behavior.

### Rescheduling module

- Request a future replacement date/time for an eligible own class.
- Inspect actual available slots, reasons and original schedule.
- View submitted request outcomes; cancel own pending request and remove eligible resolved entries.
- Approve/decline requests sent by the student; give a decline reason.
- Requester cannot approve their own request. The original booking remains until approval.
- Availability, conflicts, attendance, original package and expiry are rechecked when approving.
- Once either participant records attendance/teacher starts, ordinary rescheduling is closed.
- Ordinary rescheduling cannot move one student out of a shared group session.

### Group Class Proposals module

- From an existing class, select one or more compatible booked lessons belonging to other students.
- Find shared date/time options and optionally use a preferred time.
- Propose a group class, view invitation responses/status and cancel the teacher's proposal.
- Propose a new time for an existing group, keeping the same participants.
- At least two different students, with one existing booking per student; same teacher, course and 25/50-minute duration. Original bookings must remain eligible, scheduled and unstarted.
- All participants must have active, complete accounts and eligible original packages.
- Every invited student must accept before conversion/rescheduling is committed.
- Proposal expires at the earlier of 24 hours after creation or 15 minutes before the earliest original/proposed lesson.
- Pending proposal temporarily reserves the proposed interval; original bookings remain reserved until conversion.
- Decline/cancellation/expiry, original-booking changes or failed final eligibility/conflict checks preserve the originals.
- Conversion reuses the original student booking IDs, links one shared session/meeting and does not create an extra booking or an extra credit deduction.
- Teacher timetable collapses the group into one displayed session; attendance, consent, private remarks, verification and charging remain per student.
- Students already marked as joined must have consented before group recording starts; an absent student does not block recording. Attendance and verification remain individual.
- One present student does not automatically verify the absent student.

### Class History module

- View own past classes, participants, date/time, duration, outcome and available summary/recording.
- Current routed history is the simplified card interface with participant, outcome and time-period filters and Show more.
- A richer legacy history component exists with text/date/status/evidence filters; it is not the currently routed history screen.
- Recordings are available only while retained/accessible and through the protected recording flow.

### Remarks module

- Select an enrolled student; create class-linked remarks through class workflows.
- View previously written remarks and filter Active, Archived or All.
- Edit own active remark text, archive, restore or permanently delete through confirmed actions.
- Archived remarks are hidden from the student's remarks list; restore before editing.
- Resubmitting a class's existing remark updates/reactivates it rather than creating a duplicate entry for the same key.
- Creating a remark requires the linked teacher/student/class relationship and active, complete participant accounts.
- A rating field exists in remark storage/API; do not confuse it with the separate five-criterion contract evaluation.

### Assignments module

- Select/search assigned students and view current submissions and assignment lists.
- Create an assignment with title/instructions, student/course, deadline date/time, optional attachments and submission-attempt limit.
- Edit instructions and replace supported attachments; archive/unarchive or permanently delete assignments with confirmation.
- View student answers, attached files, submission timestamps, status and previous-attempt history.
- Open protected attachment/submission links.
- Teacher ownership is checked for management; administrators have API management access without a dedicated assignment sidebar screen.
- Assignment instructions cannot be empty. An explicit attempt limit must be a positive integer; an omitted limit is unlimited.
- New assignment deadlines cannot be in the past; teacher, student, title and instructions are required.
- Archived/past-due assignments cannot receive or edit student submissions.
- A new submission attempt increments the count, snapshots the previous attempt and resets stored grade/feedback fields; editing an existing submission preserves the attempt count and archives its old contents.
- Assignment/submission upload limits and formats are listed under Shared file rules below.
- **Scope distinction:** grade/feedback columns exist, but the inspected current teacher screen/routes do not provide a teacher grading or feedback-write workflow. Do not list grade entry as a completed feature merely because those columns exist.

### My Books / Learning Progress module

- View/search books distributed to the teacher and inspect book/course/lesson information.
- Read lesson notes and files through the supported viewer/open-file flow.
- Inspect assigned students' book and lesson completion progress.
- Receive new-material/distribution and learner book-completion notifications.
- Teacher views are read/progress views; book/lesson authoring belongs to administrators. Old teacher-upload components are not current route/menu permissions.

### Contract Reviews module

- View completed contracts requiring the teacher's final evaluation and previously submitted own reviews.
- Score all five student proficiency criteria, inspect the computed final level, add optional comments and submit once.
- Submission updates the student's stored proficiency level.
- Review belongs to the teacher recorded for that contract; later reassignment does not move the old review to a different teacher.
- Teacher cannot read the student's private teacher-rating answers/comments.
- Required review gating applies until the teacher submits their side.

## Student

### Dashboard module

- View personal greeting, unused classes and classes ready to book.
- Open Book a class, today's classes, outstanding assignments and recent teacher remarks.
- Continue/reopen onboarding guidance.

### Calendar / Class Booking module

- View own schedule, upcoming lessons, class cards and class details.
- View assigned teacher and teacher availability; select dates with usable booking slots.
- Use the guided booking flow for a single date/time or weekly patterns; choose preferred times and inspect suggested/nearby matches.
- Select multiple proposed occurrences within available package balance and review before booking.
- Show an explanation when no usable date/time remains rather than treating published hours alone as selectable availability.
- Use the student's active package course, assigned teacher and 25/50-minute package duration.
- Cannot book another student's lesson or choose an unrelated teacher through ordinary self-booking.
- Start must be in the future, within the scheduling horizon, and the full class must fit inside published working time, outside breaks and within the original active contract deadline.
- Teacher/student occupied intervals and group proposal holds block conflicts, including overlaps across adjacent dates/timezones. Back-to-back classes are allowed.
- Reservation limits account for booked but unresolved credits; past unresolved reservations remain held until resolved.
- Server transaction/participant locks recheck conflicts and credit availability when writing, so two students cannot successfully reserve the same occupied teacher interval.
- A recommendation/preferred weekly pattern is not a confirmed reservation until each booking succeeds.

### Class Entry / Attendance module

- Open a scheduled class's meeting, acknowledge consent and record own attendance.
- Students may arrive before teacher start; attendance is recorded without deducting a class credit.
- There is no automatic 15-minute attendance cutoff.
- Entry opens 30 minutes before the scheduled start. An unstarted lesson closes at its scheduled end. Once the teacher starts, participants may join/rejoin until the teacher ends it.
- Closed, cancelled, completed, no-show or incomplete sessions reject entry.
- Students confirm their own attendance/consent; a teacher cannot impersonate student attendance through the normal endpoint.
- Attendance closes ordinary rescheduling/group conversion for that booking.
- Teacher controls start/end, evidence submission and completion; the student cannot verify or debit their own package by joining.

### Reschedule Requests module

- Request an eligible future date/time, supply reason, inspect available slots and submit to the teacher.
- View incoming teacher requests and approve/decline with reason.
- View own submitted requests/outcomes, cancel own pending request and remove supported resolved list entries.
- Only the other participant decides; original schedule stays in force while pending.
- Approval rechecks actual availability/conflicts, class attendance state and the original booking's contract/expiry.
- Cannot individually reschedule a linked group participant; use the teacher's group proposal workflow.

### Group Invitations module

- View teacher proposals, original and proposed lesson details, response/expiry status.
- Accept or decline own invitation.
- Every invited student's acceptance is required; partial acceptance does not replace the originals.
- Cannot accept for another student or create the teacher's proposal.
- Shared session uses own individual attendance, consent, package credit and private remarks.

### Contract / Renewal / Extension module

- View course, teacher, package duration, total/used/remaining classes, reserved balance, status and expiry.
- Request a new contract with course, class count/duration, learning preferences, optional schedule and notes.
- Preview matching assistance without assigning a teacher or creating a booking.
- Revise a pending request; inspect latest status, previous versions and administrator response; withdraw a pending request.
- Request more time on the latest expired/ended contract if unused classes remain.
- No extension when no contract exists, all credits are used or the contract has not ended.
- Only one request kind can be pending at a time: withdraw the pending new-contract request before requesting an extension, or vice versa.
- Resubmitting the same pending kind revises it; it is not a duplicate pending request. Up to ten earlier revisions are retained.
- Only pending requests can be withdrawn; resolved requests remain history and a later ask is a new request.
- Request states: Pending, Approved, Declined, Cancelled.
- Administrator decides; requesting does not instantly activate a new contract or extend expiry.
- Expired unused credits remain associated with their old package; extension preserves them, while a new contract is a separate replacement.

### Assignments / Submission Dropbox module

- View own assigned work, instructions, due date/time, attachments, attempt allowance and submission state.
- Open an assignment directly from dashboard/notification links.
- Submit written answer, supported files or both; an empty answer without a file is rejected.
- View current submission, submission time/count and previous versions.
- Resubmit while before deadline, unarchived and within the attempt limit.
- Edit existing submission while allowed, preserving its attempt number and saving a history snapshot.
- Replacement uploaded files update the current file set; prior files remain associated with submission history where applicable.
- Cannot submit/edit somebody else's assignment or bypass an exhausted attempt limit through the new-attempt endpoint.
- Past-due/archived assignment submission and editing are refused.

### Remarks module

- Read own active teacher remarks with teacher identity, related class/date and remark text.
- Receive/open remark notifications.
- Archived/deleted remarks do not appear in the active student feed.
- Student has no teacher-remark edit/archive/delete controls.

### Books / Lessons module

- View/search accessible books for assigned teacher and course, book cover/description and lesson list.
- Open lesson details, notes, supported material preview and fullscreen reader.
- PDF/text and other supported file-view/fallback flows depend on format/browser support.
- Save/resume reading position; view personal completion percentage and lesson state.
- Interface unlocks lessons in order: the preceding lesson must be completed.
- Student preview is limited; full-reader progress must reach the end before Mark as Complete is offered.
- Manually mark a ready lesson complete; completion reaches 100% and records completion time.
- Saved lesson completion/progress does not decrease on subsequent updates.
- Completing all lessons makes the book Completed and notifies its distributed teachers.
- **Enforcement distinction:** ordered unlocking and read-to-end readiness are interface checks. The progress API does not independently establish that the student read the file or enforce the preceding-lesson sequence.
- Teacher/course/distribution access and archive state govern material visibility. A database progress record is not proof that the content was learned.

### Class History module

- View own past class cards with teacher, date/time, duration, friendly outcome and available summary/recording.
- Filter by teacher, outcome and This week / This month / Earlier; Show more reveals additional records.
- Watch retained class recordings through the protected recording link flow.
- Student history uses the simplified current interface rather than the unused richer history component's full evidence/search UI.

### Contract Reviews module

- View completed contracts and own pending/submitted review.
- Rate the teacher on Clear explanations, Patient & supportive, Engaging classes, Helpful feedback, and Professional & prepared.
- All five scores must be integers 1–5; overall rating is their average.
- Add optional comments, maximum 4,000 stored characters; submit once per contract.
- Required closing review is triggered when the contract is fully consumed and completed, not simply because its calendar expiry passed with unused classes.
- Teacher cannot see the student's scores/comments; the student cannot see the teacher's private evaluation. Admin can inspect both; updated student proficiency is stored separately.
- Pending required review directs the student back to this module before ordinary access continues.

## Cross-module business rules

### Proficiency evaluation rubric

- Criteria: Speaking & Pronunciation; Reading & Comprehension; Structure; Sentence / Grammar; Vocabulary.
- Every criterion requires an integer score from 1 to 5; server recomputes the level rather than trusting a client-supplied level.
- Evaluate in this order:
  1. Any core criterion (all except Speaking & Pronunciation) scored 1 → Novice.
  2. Every score at least 4 and average at least 4.5 → Advanced.
  3. Every score at least 3 and average at least 3.5 → Intermediate High.
  4. Every score at least 3 → Intermediate Mid.
  5. Otherwise average at least 2.8 → Intermediate Mid; lower average → Intermediate Low.
- Current computed levels are Novice, Intermediate Low/Mid/High and Advanced; old novice-low/mid/high database values remain compatible.
- Trial scoring and contract-final scoring use the same level calculation. Per-class remarks are a separate mechanism and do not replace the final evaluation.

### Scheduling, credits and verification

- Package states: Active, Expired, Cancelled. Class scheduling/status and evidence verification status are distinct.
- Scheduled/completed/cancelled/no-show class records and Pending/Admin Review/Verified/Incomplete verification states must not be treated as the same field.
- Unused classes = total minus used. Bookable balance further subtracts qualifying unresolved reservations.
- Booking reserves allowance; joining does not consume it. Verified completion/admin approval consumes it once.
- Consuming the penultimate credit leaves the contract active; consuming the last expires it.
- Unresolved old reservations remain visible/held; an active session stays accessible even across midnight.
- Completion and rescheduling resolve against the contract associated with the original booking, not whichever newer contract happens to be active.
- Student/teacher conflicts are interval overlaps, not merely duplicate start times; adjacent classes may touch without overlapping.
- Booking/reschedule checks use actual instants derived from teacher timezone, including neighboring-date conflicts.
- Some availability-edit checks currently use server-local date/current-time validation; do not claim every legacy availability path is fully timezone-normalized.
- Changing availability is not cancellation. There is no separate normal self-service class-cancellation screen/route in the current routed workflow simply because a cancelled status exists.
- The manual package use-class API is administrator-only; it is not the ordinary student-attendance debit mechanism.

### Shared file rules

- Assignment and submission uploads: 100 MiB maximum combined size; an individual file is also limited to 100 MiB. The current upload handler does not set a fixed file-count limit.
- Accepted extensions: PDF; DOC/DOCX; XLS/XLSX; PPT/PPTX; TXT/RTF; JPG/JPEG/PNG; MP3/WAV/M4A; MP4/WebM/MOV.
- Profile photo, book cover, resume, lesson, screenshot and recording limits differ; use their respective module rules.
- Protected assignment/submission links are signed, access checked and time limited; arbitrary public upload URLs are not the intended access flow.
- Class recording access is protected and retention limited; optional Google Drive storage/delivery depends on credentials/configuration.
- Upload cleanup distinguishes current files, history and shared group references.

### Automatic dormancy module

- Students with an ended contract: eligible after an additional 90 days of qualifying inactivity.
- Students who never had a contract: 180 days.
- Teachers: 60 days of qualifying inactivity.
- Inactivity is derived from stored contract/class/request/availability activity, not a claim of a database last-login field.
- Do not archive automatically when protected unused paid classes, pending contract/reschedule decisions, upcoming classes or future availability remain.
- A teacher with paying students on active contracts is protected.
- Admin accounts are excluded; manual archives are not overwritten by the automatic dormancy reason.
- Automatically archived users appear with reason/date and can be restored through admin controls.

### Authorization, privacy and operations

- Protected APIs require a valid session; role/identity/record-ownership checks scope the applicable operations.
- Student identity comes from the session for own submissions/progress; client-supplied IDs do not grant administrator rights.
- Administrator-only material writes, contract decisions and user administration are distinct from teacher/student reading permissions.
- Passwords are hashed; setup/reset tokens are hashed; chat and selected private notes/notifications/reviews are encrypted in storage.
- Current-password checks and costly AI/resume/contact operations are rate limited.
- Email, LINE, optional SMS, AI, meeting-provider and recording-storage functions depend on deployment configuration. AI requests use configured Gemini first, then Groq and OpenRouter as fallbacks; backup-provider PDF resume parsing requires readable extracted text. Provider availability is not guaranteed.
- Meeting-link generation supports the configured provider path; Jitsi configuration and Teams integration code exist. This is not a guarantee that both providers are active in a deployment.
- Group schema preparation failure disables group endpoints while preserving the individual scheduling path.

## Items to distinguish when comparing the thesis transcript

- **API/legacy support, not a current menu module:** phone SMS verification endpoints; generic video-session/Teams CRUD; notification-preference endpoints; administrator manual credit debit; administrator assignment management; lesson replacement/update API.
- **Unused/redirected screens:** legacy Classroom route redirects to Calendar; older teacher material-upload and richer class-history components do not establish current user-facing permissions.
- **No workflow found in the audited routes/screens:** public self-registration, online checkout/payment processing, automatic trial-class booking, teacher credential approval, ordinary admin creation by another ordinary admin, standalone course-catalog CRUD screen, teacher assignment grade/feedback entry, certificates, payroll and transcript export.
- **Interface-only learning rules:** sequential lesson unlocking and read-to-end readiness must not be described as independently verified learning or server-validated reading.
- **Admin rescheduling:** monitoring/removal is separate from participant approval.
- **Teacher matching:** load target is a preference; recommendation is not reservation; AI operation is configuration dependent.
- **Recent local fixes:** chat pagination/latest-message/mobile window behavior and class-detail Back navigation still require successful browser acceptance verification. This inventory does not mark the earlier mobile-overflow work complete.
- A source inventory cannot prove that a feature behaves correctly with live MySQL, meeting providers, mail/LINE accounts, uploads or the deployed frontend. Thesis requirements and acceptance results should be checked separately against this list.

## Source map for checking an item

| Inventory area | Primary implementation sources |
|---|---|
| Routes, menus and access gates | `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx` |
| Public/auth/setup | `frontend/src/pages/homepage.jsx`, `login.jsx`, `SetupAccount.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`; `backend/server.js` |
| Admin modules | `frontend/src/pages/AdminDashboard.jsx`, `frontend/src/components/AdminOverview.jsx`, `AdminContractReviews.jsx` |
| Account/photo/name | `frontend/src/pages/account.jsx`, `frontend/src/components/PasswordInput.jsx`, `backend/profileValidation.js`, `backend/server.js` |
| Booking/rescheduling/attendance | `frontend/src/pages/Calendar.jsx`, `frontend/src/components/StudentBookingWizard.jsx`, `RescheduleTimePicker.jsx`, `MyRescheduleRequests.jsx`; `backend/server.js`, `scheduling.js`, `classSession.js`, `classEvidence.js`, `rescheduleRequestFlow.js`; `docs/scheduling-attendance-rules.md` |
| Group lessons | `frontend/src/components/GroupClassManager.jsx`, `backend/groupClasses.js`, `backend/groupClassAttendance.js`, `docs/group-class-proposals.md` |
| Matching/evaluation | `backend/teacherMatching.js`, `teacherAdvisor.js`, `teacherResumeParser.js`, `aiClient.js`, `geminiClient.js`, `matchInsights.js`, `proficiencyEvaluation.js`; `frontend/src/utils/matchingCriteria.js` |
| Contracts/reviews | `backend/contractTerms.js`, `contractRequestFlow.js`, `contractReview.js`, `server.js`; `frontend/src/pages/ContractReview.jsx` |
| Assignments | `frontend/src/pages/teacherAssignment.jsx`, `assignments.jsx`, `assignmentsDropbox.jsx`; `backend/assignmentUploadLimits.js`, `fileLink.js`, `server.js` |
| Remarks/history/students | `frontend/src/pages/PassRemarks.jsx`, `remarks.jsx`, `StudentClassHistoryKid.jsx`, `TeacherStudents.jsx`; `backend/server.js` |
| Library/progress | `frontend/src/pages/booksLessons.jsx`, `teacherBooksLessons.jsx`, `booksContent.jsx`; `backend/server.js` |
| Notifications/chat/LINE | `frontend/src/components/NotificationPanel.jsx`, `NotificationContainer.jsx`, `ChatPanel.jsx`, `LineConnectCard.jsx`; `frontend/src/utils/toastQueue.js`; `backend/chatPagination.js`, `line.js`, `lineSetup.js`, `lineReminders.js`, `server.js` |
| Dormancy/security | `backend/accountDormancy.js`, `sessionToken.js`, `rateLimit.js`, `dbRateLimit.js`, `server.js` |

This inventory describes repository code, not a live deployment or a complete end-to-end acceptance test. Updating this document does not change application behavior.
