"""Build standalone, illustrated role manuals and the legacy entry-point index.

Content is maintained here; run this script, then render-manuals.mjs.
No application data, credentials or remote services are needed.
"""
from pathlib import Path
import html
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'user-manuals'
OUT.mkdir(parents=True, exist_ok=True)
DATE = '16 November 2026'

def esc(s): return html.escape(str(s), quote=True)
def p(s): return '<p>' + s + '</p>'
def note(s): return '<aside><strong>Remember</strong> ' + s + '</aside>'
def steps(title, before, items, result, helptext=''):
    return ('<div class="procedure"><h3>'+title+'</h3><p class="before"><strong>Before you begin:</strong> '+before+'</p><ol>'+
            ''.join('<li>'+s+'</li>' for s in items)+'</ol><p class="result"><strong>Check your result:</strong> '+result+'</p>'+
            (p('<strong>If you need help:</strong> '+helptext) if helptext else '')+'</div>')
def table(headers, rows):
    return '<table><thead><tr>'+''.join('<th>'+x+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+str(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'
def image(name, caption):
    return '<figure><img src="images/'+name+'.png" alt="'+esc(caption)+'"><figcaption>'+caption+' Screens use fictional sample data; your records will differ.</figcaption></figure>'
def flow(labels):
    # Native SVG workflow illustration, deliberately distinct from UI screenshots.
    n=len(labels); w=1000; box=(w-24*(n-1))/n
    parts=['<figure class="flow"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" role="img" aria-label="'+esc(' then '.join(labels))+'">']
    for i,label in enumerate(labels):
        x=i*(box+24)
        parts.append(f'<rect x="{x}" y="8" width="{box}" height="82" rx="8" fill="#e9f2ee" stroke="#b9d0c4"/><text x="{x+box/2}" y="38" text-anchor="middle" font-family="Arial" font-size="13" fill="#254e3c">STEP {i+1}</text><text x="{x+box/2}" y="64" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold" fill="#183f30">{esc(label)}</text>')
        if i<n-1: parts.append(f'<path d="M{x+box+5} 49 h14 l-5 -5 m5 5 l-5 5" fill="none" stroke="#8c7137" stroke-width="2"/>')
    return ''.join(parts)+'</svg><figcaption>Workflow illustration: follow the steps from left to right.</figcaption></figure>'
def chapter(title, intro, body): return {'title':title,'intro':intro,'body':body}

def introduction(role, purpose, menus):
    return chapter('Start here', purpose,
        p('This manual is for <strong>'+role.lower()+'</strong>. Read Getting access first, then use the contents to find the task you want to complete. Each task gives preparation, numbered actions and a result to check. Bold words identify on-screen labels or important fields.')+
        p('Use a current desktop or mobile browser, a reliable internet connection and access to your registered email. For online lessons, use a microphone, speakers or headphones, and a camera when needed. Allow meeting pop-ups and grant microphone/camera access when your browser asks.')+
        table(['Where to go','What you do there'],menus)+
        note('On a phone, open the navigation menu to find the same pages. Scroll inside long forms or dialogs to reach their action buttons. Screenshots show the desktop layout; labels and available actions depend on your role and the record status.')+
        p('Edition 2.0 • '+DATE+'. This guide follows the current project interface. School-specific availability, prices, contact details and enabled integrations may vary. Pictures are locally rendered interface examples with fictional data; workflow diagrams explain sequences rather than reproduce screens.'))

def access(role):
    staff=role in ('Administrator','Super administrator')
    return chapter('Getting access and signing in','Activate your account, enter the correct workspace, and recover access when needed.',
        image('sign-in','Figure 1. The sign-in screen: enter your email and password, or open password recovery.')+
        (steps('Activate your invitation','An administrator has created your student or teacher account and sent a setup invitation.',[
            'Open the newest account setup email. Check Junk or Spam if it is missing. Verify that it came from the school before opening the link.',
            'Open the setup link. Enter your initial password and confirmation as requested. Use at least eight characters and choose a password you do not use elsewhere.',
            'Submit the setup form and return to the sign-in page. Keep the password private; the invitation is single use.'
        ],'You can sign in with the invited email and your new password.','Invitations normally expire after 24 hours. Ask an administrator for a new invitation if the page says the link is expired, invalid or already used. Always use the newest email.') if not staff else p('An authorized administrator supplies your account. Super administrators create ordinary administrator accounts with an initial password. Receive those credentials through a private school-approved channel and change the password after your first sign-in.'))+
        steps('Sign in','Have your registered email and password ready.',[
            'Open the school website and choose the sign-in option.',
            'Type the full registered email address and password. Use the eye control if you need to check the password, and hide it again afterward.',
            'Select <strong>Stay signed in</strong> only on a device you control. Submit the sign-in form once and wait for the response.',
            'Confirm you reached your '+('administration workspace' if staff else role.lower()+' Home page')+'. If Account setup or a required review appears, complete it before continuing.'
        ],'Your role-specific navigation is visible.','Repeated failed passwords can temporarily lock the account; the default is five failures followed by a 15-minute lock. Wait or use password recovery. A new successful login can end an earlier session on another device.'))

def account(role):
    teacher=role=='Teacher'
    return chapter('My Account and password recovery','Keep your profile and timezone correct before you schedule or attend lessons.',
        steps('Complete or update your profile','Sign in and open <strong>Account</strong> from your account menu. First-time users may be sent here automatically.',[
            'Review your name, country, birthday and timezone. Enter the required personal details shown by the setup steps.',
            'Choose the timezone where you will attend or teach. Compare it with a known local time before saving.',
            'If you want a profile photo, choose an image or use the camera where supported. Crop, reposition and zoom, then preview the result.',
            ('Review your teaching information and set whether you teach children. ' if teacher else '')+'Save the changes. Enter your current password if sensitive changes require confirmation.',
            'Reopen Account and check that the changes were saved. '+('Complete the LINE connection in the next chapter to finish student onboarding.' if role=='Student' else 'Return to your Home or Overview page.')
        ],'Your saved profile is visible, and required setup no longer blocks navigation.','Email and existing phone information are read-only here. Ask an administrator to correct your email. Photo sources may be JPG/JPEG, PNG, WebP or GIF, up to 10 MiB before processing; the processed server upload is limited to 2 MiB.')+
        steps('Change a known password','You know your current password.',[
            'Open the password-change section in Account. Enter the current password.',
            'Enter a new password of at least eight characters and repeat it in the confirmation field. Keep it within the form limit; the server maximum is 72 UTF-8 bytes.',
            'Save and wait for confirmation. If the current password is rejected, correct that field and try again.'
        ],'The password change succeeds. Use the new password next time you sign in.')+
        steps('Recover a forgotten password','You can receive mail at the registered email address.',[
            'From sign-in, open <strong>Forgot password</strong>. Enter your email and send the request.',
            'Check your inbox and spam folder. The on-screen response stays general even if an address is unknown.',
            'Open the newest reset email within one hour. Enter and confirm a new password, submit, then sign in again.'
        ],'The new password works.','Reset links are single use and newer requests invalidate older unused links. If no email arrives, ask the school to confirm your account email and mail delivery.'))

def communication(role):
    return chapter('Notifications, messages and safe sign-out','Use notifications for task updates and chat for direct communication.',
        steps('Read and act on notifications','You are signed in.',[
            'Open the notification bell. Check unread items first or use filters such as New times, Homework, Teacher notes, News and Reminders.',
            'Open an item to see its related class, assignment, book or request. Check the date, timezone and people before acting.',
            'Use the available read controls to mark an item or all items read. Remove items you no longer need; use clear-all only after checking the list.'
        ],'The relevant page opens and unread indicators update.','A removed notification does not undo the class, submission or decision it describes. If an old availability link no longer opens, check Calendar for current availability.')+
        steps('Send a direct message','Choose an appropriate school contact.',[
            'Open the chat launcher and search the contact list. '+('Students normally see their assigned teacher and active administrators.' if role=='Student' else 'Teachers normally see assigned students and active administrators.' if role=='Teacher' else 'Administrators can find eligible school users.'),
            'Select the intended contact. Check the name before typing a clear message about the class or support issue.',
            'Send the message once. Check that it appears in the conversation. Read receipts and presence indicators provide additional context when available.',
            'Use <strong>Load older</strong> when you need earlier messages. Minimize a conversation to keep working, then restore it from its minimized control.'
        ],'Your message appears in the correct conversation.','On phones, one conversation window is shown at a time. If sending fails, check your connection and account/profile status, then reopen the conversation before retrying.')+
        steps('Finish your session','Save drafts and confirm any submitted changes first.',[
            'Close meeting tabs when lessons have ended. Open the account menu and choose the sign-out option.',
            'Confirm the sign-in page appears. On a shared device, close the browser after signing out.'
        ],'Protected pages require sign-in again.')+
        note('Never share a password, setup/reset link or LINE linking code in chat. Session expiry or a newer login may require you to sign in again.'))

def rescheduling(role):
    return chapter('Reschedule requests','A request proposes a change. The original class stays scheduled until the other participant approves.',
        flow(['Open class','Choose new time','Send request','Other person decides'])+
        steps('Ask for a different time','The lesson is eligible, has not started, and neither participant has recorded attendance.',[
            'Open <strong>Calendar</strong>, choose the class and open its reschedule action.',
            'Check the original date/time and timezone. Pick a future replacement slot offered by the availability picker.',
            'Enter a useful reason, such as a school or work conflict. Check that the entire lesson fits before the original contract expires.',
            'Review the proposal and submit it. Open the request list or related notification to track its status.'
        ],'The request is Pending. Keep the original appointment until approval is confirmed.','The time may become unavailable before approval. Ask for another offered slot if the system reports a conflict or an expired contract.')+
        steps('Respond to an incoming request','The other participant sent the request.',[
            'Open the request from Calendar, the request list or its notification. Read the original schedule, proposed schedule and reason.',
            'Choose the approval action if you can attend. If you cannot, choose decline and provide a meaningful reason; the decline flow requires 5–500 characters.',
            'Wait for confirmation and reopen Calendar. Check the final class date/time and request outcome.'
        ],'An approved request moves the lesson. A declined request leaves the original lesson in place.')+
        steps('Withdraw your own pending request','You created the request and it is still Pending.',[
            'Open your submitted requests and select the correct lesson.',
            'Use the cancel/withdraw action and confirm. Check that the request is cancelled and the original lesson remains.'
        ],'The other participant no longer needs to decide your withdrawn request.')+
        note('You cannot approve your own request. Individual rescheduling is unavailable after attendance/start and for one student inside a linked group lesson. '+('Ask your teacher to use the group proposal process.' if role=='Student' else 'Use the group proposal process to move the whole group.')))

UPLOADS=table(['Upload','Limit / accepted files'],[
    ('Assignment or submission','Up to 5 files; 10 MiB each; 25 MiB combined.'),
    ('Documents','PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT and RTF.'),
    ('Images and media','JPG/JPEG/PNG; MP3/WAV/M4A; MP4/WebM/MOV.'),
])

def history(role):
    return chapter('Class history and learning records','Find previous lessons, outcomes and available recordings.',
        steps('Find a past lesson','Open <strong>Class history</strong>.',[
            'Filter by '+('teacher' if role=='Student' else 'student/participant')+', outcome and time period: This week, This month or Earlier.',
            'Read the lesson card: participant, class date/time, duration and outcome. Use <strong>Show more</strong> to reveal older records.',
            'Open the available summary or protected recording action. If prompted, remain signed in to authorize access.'
        ],'You find the correct historical class and can review the information still available.','A recording is available only while retained and accessible. Local retention normally lasts seven days. If a protected link has expired, reopen the class to request a fresh link; contact the school if the recording is no longer retained.')+
        table(['Record','Meaning'],[
            ('Scheduled','A lesson exists in the timetable; this alone does not mean it was attended or completed.'),
            ('Completed / Verified','The completion and evidence process has been resolved successfully.'),
            ('Admin Review','An attendance/evidence exception needs an administrator’s decision.'),
            ('Incomplete','The verification was resolved as incomplete. Contact the school if you dispute the outcome.'),
            ('No-show','The teacher recorded that a student never confirmed attendance, after the scheduled lesson end.')
        ])+
        note('The class outcome and evidence-verification state describe different parts of the record. Use the details and school support if their meaning is unclear.'))

def helpchapter(role, rows):
    return chapter('Troubleshooting and support','Use the symptom to choose a next action. Preserve the exact message when reporting an issue.',
        table(['Problem','What to do'],[
            ('Cannot sign in','Check your full email, password and keyboard settings. Wait if temporarily locked; use password recovery. Ask the school about archived accounts.'),
            ('Setup or reset link fails','Open the newest email. Ask for a fresh setup invitation or request a fresh password reset; older links may have expired or been replaced.'),
            ('Sent back to Account or Contract reviews','Complete the required profile, '+('LINE onboarding or ' if role=='Student' else '')+'closing review before continuing.'),
            ('Times look wrong','Compare the timezone in Account and the timezone shown in the class details. Correct the profile timezone and reopen Calendar.'),
            ('A page or upload does not finish','Check connectivity, file format and file size. Confirm whether the action succeeded before retrying. Reopen a stale protected file link from its source page.'),
        ]+rows)+
        steps('Report a problem clearly','Use school contact information from the website or an available administrator chat.',[
            'Record the affected page, the action you tried, the exact error message, and your local date/time and timezone.',
            'Include the class, assignment, contract or book identifier/name when available. State the expected result and what actually happened.',
            'Attach a screenshot with passwords, private messages, invitation/reset links and other people’s personal information hidden.',
            'Ask the school to confirm the record before you repeat an approval, booking, submission or other change.'
        ],'Support has enough information to locate the issue without receiving your credentials.')+
        p('<strong>Useful terms:</strong> A <em>contract/package</em> is an allowance of classes with a duration and expiry. A <em>reservation</em> holds a class allowance for an unresolved booking. An <em>archive</em> hides or disables a record while preserving its data. A <em>review</em> is a closing evaluation, separate from per-class remarks.'))

student=[introduction('Student','Use JEN Academia to book and attend your lessons, submit work and follow your learning progress.',[
    ('Home','Today’s classes, classes left, assignments and recent remarks.'),('Calendar','Bookings, class entry, requests and contracts.'),('Assignments / Remarks','Submit homework and read teacher guidance.'),('Books/Lessons / Class history','Study materials, progress and previous lessons.'),('Contract reviews / Account','Closing reviews, profile and LINE connection.')]),access('Student'),account('Student')]
student.append(chapter('Connect LINE and finish onboarding','Students complete LINE linking before normal access. Connecting identifies your account; reminders can be paused separately.',
    flow(['Open Account','Get linking code','Send in LINE','Confirm connected'])+
    steps('Link your LINE account','Have LINE available and open Account in JEN Academia.',[
        'Find the LINE connection card. Open the school’s official LINE account/add-friend link and add that account if needed.',
        'Generate a six-digit linking code in JEN Academia. Keep the code private.',
        'Switch to the official school LINE chat and send the code as instructed within ten minutes.',
        'Return to JEN Academia and use the completion/status check. Confirm that the connection is shown as linked, then continue to Home.'
    ],'Account shows a successful LINE link and normal student navigation becomes available.','If the code expired, generate a new one and send it to the official school account. If status does not update, check that you used the same LINE account and the latest code; ask the school to check its LINE service configuration.')+
    steps('Pause, resume or reconnect','Open the LINE connection card in Account.',[
        'Use the reminders control to pause or resume messages. Pausing keeps the identity link.',
        'If you intentionally disconnect, read the confirmation and complete it. Use the connection process again when you want to reconnect.',
        'Check the final connection and reminder states before leaving Account.'
    ],'The card shows the reminder and connection settings you selected.')+
    note('Default class reminders are 30 and 10 minutes before class, subject to school settings and delivery. Always check Calendar yourself. A missing LINE reminder does not cancel a class.')))
student.append(chapter('Home and your class balance','Start your day by checking what is booked and what you can still reserve.',
    image('student-home','Figure 2. Student Home places the class balance and Book a class action near the top.')+
    steps('Check today’s work','Finish profile and LINE setup first.',[
        'Open <strong>Home</strong> and read <strong>Classes left</strong> and <strong>Ready to book</strong>.',
        'Open a card in <strong>My classes today</strong> to see the class details. Confirm its date/time before opening the meeting.',
        'Open outstanding assignments and recent remarks. Use the First Steps guide if you need help with navigation.'
    ],'You know your next class and any outstanding learning tasks.')+
    table(['Example balance','How to interpret it'],[('10 total − 2 used = 8 left','Eight classes remain unused in the package.'),('8 left − 2 unresolved bookings = 6 ready to book','Two are already reserved. Only six more can be reserved in this example.')])+
    note('Booking holds a credit; joining alone does not use it. Verified completion or administrator approval records usage. Past bookings that have not been resolved can continue to hold reservations. Contact the school if the balance appears stuck.')))
student.append(chapter('Book a class','Book against your active contract, assigned teacher and package lesson duration.',
    image('student-calendar','Figure 3. Calendar is the starting point for student bookings and contract information.')+
    steps('Choose and confirm a lesson','Your contract is active, unexpired and has bookable classes. Your assigned teacher has published usable availability.',[
        'From Home choose <strong>Book a class</strong>, or open <strong>Calendar</strong> and start its booking guide.',
        'Check the teacher, course, 25- or 50-minute duration and displayed timezone. Choose a day with usable free time.',
        'Select an offered time. For a weekly pattern, choose the offered weekdays/preferences and inspect the suggested occurrences.',
        'Review every selected date and time. Remove unwanted occurrences and stay within the ready-to-book allowance.',
        'Use the final booking action and wait for the result. Check each occurrence’s response if you requested more than one.',
        'Reopen the date in Calendar and confirm that the successful class cards appear with the correct teacher and time.'
    ],'Each successful booking appears in your schedule and reduces the allowance ready to book.','Published working hours do not guarantee a free slot. Breaks, existing classes, reserved proposals, expiry and conflicts can remove times. If no slots appear, try another offered day or contact your teacher.')+
    note('The full lesson must fit within teacher availability and the original active contract deadline. Preferred weekly times and matching suggestions are not reservations until the booking succeeds.')))
student.append(chapter('Join and attend a lesson','Open the scheduled class and confirm your own attendance and consent.',
    flow(['Open class','Check details','Join and consent','Attend lesson'])+
    steps('Enter the online classroom','Use a working microphone and stable connection. Check the lesson date/time and your Account timezone.',[
        'Open the class from Home or Calendar. Check the teacher, course, date/time and duration.',
        'Use the class entry/meeting control. Read and acknowledge the attendance and consent prompts shown.',
        'Allow the meeting tab/pop-up and browser permissions. Confirm you have recorded your attendance in JEN Academia as well as opened the meeting.',
        'If the teacher has not arrived, wait and contact the teacher through chat if needed. Follow school instructions for connection problems.',
        'Attend the lesson. If disconnected, reopen the class and rejoin while the teacher’s session is still active.',
        'After the teacher ends the class, check its later outcome in Class history. Ask the school if your attendance needs investigation.'
    ],'Your attendance is recorded and you enter the correct meeting. Completion is handled by the teacher/administrator.','If an unstarted lesson has passed its scheduled end, entry closes. After the teacher starts, rejoining remains possible until the teacher ends it. Closed or finalized classes reject entry.')+
    note('You may record attendance before the teacher starts. There is no automatic 15-minute attendance cutoff. Joining does not deduct a credit, and it closes ordinary rescheduling for that booking.')))
student.append(rescheduling('Student'))
student.append(chapter('Group lesson invitations','A teacher may propose combining two compatible booked lessons into one shared session.',
    flow(['Read invitation','Check new time','Accept or decline','Both must accept'])+
    steps('Respond to your invitation','Open the group invitation from the class/notification controls.',[
        'Read the original lesson, proposed group time, teacher, course, duration and response deadline.',
        'Choose accept only if you can attend the proposed group session. Choose decline if it does not suit you.',
        'Check your recorded response. Wait for the second student’s response and the final confirmation.',
        'Open Calendar again. Attend the shared time only after the proposal is confirmed; otherwise keep the original booking.'
    ],'Your response is saved. Conversion occurs only after both students accept and final eligibility checks pass.','A proposal expires at the earlier of 24 hours after creation or 15 minutes before the earliest original/proposed lesson. Decline, expiry or failed checks preserve the original bookings.')+
    note('Each student has separate attendance, consent, credit and private remarks. You cannot respond for another student. For recording, both group students must join and consent.')))
student.append(chapter('Complete and submit assignments','Read the instructions and deadline before using a submission attempt.',
    image('student-assignments','Figure 4. Assignments show instructions, due dates and an Open action.')+
    steps('Submit your work','Open <strong>Assignments</strong> and select <strong>Open</strong> on the correct assignment.',[
        'Read all instructions, the deadline and the attempts allowed/used. Open the teacher’s attachments if provided.',
        'Prepare your written response, files or both. An empty answer with no file cannot be submitted.',
        'Enter the answer and attach the intended files. Check filenames and remove anything attached by mistake.',
        'Submit and read the confirmation, especially if this is another attempt. Confirm once and wait for completion.',
        'Reopen the current submission. Check the saved answer, attachments, timestamp and attempt count.'
    ],'The assignment displays your saved submission and its submission status.','Past-due or archived work cannot be submitted or edited. If attempts are exhausted, contact your teacher; repeated submission does not bypass the limit.')+
    UPLOADS+
    note('A new resubmission uses another attempt and preserves earlier contents in history. Editing an existing submission through its edit action preserves the attempt number. File replacements change the current file set, so review the saved attachments afterward.')))
student.append(chapter('Study books and read teacher remarks','Use lesson materials in order and turn teacher guidance into your next learning action.',
    steps('Read and complete a lesson','Open <strong>Books/Lessons</strong>. Access depends on your assigned teacher, course and distributed materials.',[
        'Search for or select the book. Read its description and open its lesson list.',
        'Choose the first unlocked lesson. Read the notes and open the supported file/fullscreen reader.',
        'Work through the material to the end in the full reader. If a preview is limited, switch to the full reading view.',
        'When offered, choose <strong>Mark as Complete</strong>. Return to the lesson list and check the completion indicator.',
        'Continue to the next unlocked lesson. Return later to resume saved reading position or revisit completed materials.'
    ],'The lesson shows completed progress. Completing all lessons marks the book Completed.','If a book disappears, ask the teacher/administrator to check course assignment, teacher distribution and archive status. A format your browser cannot preview may use the offered open-file fallback.')+
    steps('Read and use your teacher’s remarks','Open <strong>Remarks</strong> or a teacher-note notification.',[
        'Check the teacher identity and related class/date so you know which lesson the note concerns.',
        'Read the strength and suggested next step. Make a short practice plan before your next lesson.',
        'Ask your teacher through chat if a comment needs explanation. You can read remarks; changes are made by the teacher.'
    ],'You understand what to practice next.')+
    note('Reading progress records your interaction with materials; it is not a test score or proof of mastery. Archived teacher remarks are hidden from your active list.')))
student.append(chapter('Contracts, renewals and extensions','Check whether you need a new package or more time to use an ended package.',
    table(['Your situation','Appropriate next step'],[('You want a new package','Submit a new-contract request.'),('Your latest contract ended and unused classes remain','Request an extension of that existing contract.'),('The contract is still active or all classes are used','An extension is not available under the current rules.')])+
    steps('Request a new contract','Open the contract area in Calendar and review your latest package.',[
        'Choose the new-contract request action. Select the course, class count and lesson duration offered by the form.',
        'Enter learning goals, preferences, optional schedule and notes. If matching preview is available, read it as advice; it does not assign a teacher.',
        'Review the request, submit and check that it shows Pending.',
        'To change a pending request of the same kind, reopen it and submit the revision. Use withdraw if you no longer want it.',
        'After the administrator decides, read the response and confirm the new package details before booking.'
    ],'Your request and its latest status are visible. Approval is required before a new package becomes available.')+
    steps('Request an extension','The latest ended/expired contract still has unused classes.',[
        'Open that contract and choose its extension request. Explain why more time is needed and complete the offered fields.',
        'Submit and check the Pending status. If a different kind of request is already pending, withdraw it before switching request kinds.',
        'After approval, check the extended end date and retained balance, then book within the updated term.'
    ],'An approved extension keeps the same package and usage while changing its end date.')+
    note('Only one request kind can be pending at a time. New packages are separate replacements; unused old credits are not silently transferred. Payment arrangements are handled with the school outside the application.')))
student.append(history('Student'))
student.append(chapter('Submit your closing contract review','A completed, fully used contract may require a private teacher review before you can continue.',
    steps('Rate your completed learning experience','Open <strong>Contract reviews</strong> and select a pending completed contract.',[
        'Check the teacher and contract so you review the correct experience.',
        'Score all five items from 1 to 5: Clear explanations; Patient &amp; supportive; Engaging classes; Helpful feedback; Professional &amp; prepared.',
        'Add optional comments about your experience, up to 4,000 characters. Avoid including unrelated personal information.',
        'Review all answers carefully and submit. This is one submission per contract.',
        'Check that your side shows submitted. Return to Home when required review gating is cleared.'
    ],'Your review is recorded; its overall rating is the average of your five scores.')+
    note('Your teacher cannot read your private rating answers/comments. Administrators can review them. You cannot read the teacher’s private final evaluation; your updated proficiency is stored separately. Calendar expiry alone, with unused credits, does not trigger this closing-review requirement.')))
student.extend([communication('Student'),helpchapter('Student',[
    ('Cannot book although classes remain','Check Ready to book, reservations, expiry and usable teacher slots. Ask support to resolve old unsettled bookings.'),('Cannot reschedule','Check whether either participant has attended, whether the lesson is linked to a group, and whether the new time fits the original contract.'),('Homework submission is blocked','Check deadline, archive state, attempts left and upload limits. Ask the teacher about the assignment before retrying.')])])

teacher=[introduction('Teacher','Use JEN Academia to publish availability, teach assigned students and maintain reliable learning records.',[
    ('Home / Calendar','Today’s classes, availability and class controls.'),('My students','Assigned learners and package details.'),('Assignments / Remarks','Create work, inspect submissions and maintain feedback.'),('My books / Class history','Distributed materials, progress and prior lessons.'),('Contract reviews / Account','Final proficiency evaluations and profile settings.')]),access('Teacher'),account('Teacher')]
teacher.append(chapter('Daily routine and My students','Check the day’s commitments, learner context and outstanding work before teaching.',
    image('teacher-students','Figure 2. My students gives teachers a scoped view of their assigned learners.')+
    steps('Prepare for the teaching day','Open Home after signing in.',[
        'Review <strong>Classes today</strong>. Open Calendar to check later dates and any changed times.',
        'Read notifications for new bookings, student reschedule requests, submissions and required reviews.',
        'Open <strong>My students</strong>. Search by student, email or course; use Active, Used up, Inactive or No package filters as needed.',
        'Check the learner’s course, contract status, lesson duration, unused classes and expiry. Use pagination for additional students.',
        'Prepare the distributed lesson material and review previous remarks or submissions.'
    ],'You know whom you are teaching, what to cover and which administrative issues need attention.','If an expected student is missing, ask an administrator to check assignment and account status. Your list is scoped to students you are permitted to see.')+
    note('An unused balance is different from a free booking allowance: unresolved bookings may already reserve some classes. Ask the administrator to resolve contract/credit problems rather than promising an unconfirmed lesson.')))
teacher.append(chapter('Publish and maintain availability','Availability opens future booking time; it does not create lessons by itself.',
    image('teacher-calendar','Figure 3. The teacher Calendar provides scheduling and availability controls.')+
    steps('Add a date’s working hours','Complete your teacher profile and open Calendar. Plan a future date within the three-month horizon.',[
        'Open the availability control and select the date. Choose <strong>Available</strong> or <strong>Unavailable</strong>.',
        'For Available, set a start and end time with the end after the start. Review the displayed timezone.',
        'If taking a break, provide both break start and break end, wholly inside the working hours. Leave both blank for no break.',
        'Choose <strong>Save Availability</strong>. Review the confirmation and save.',
        'Open <strong>See my availabilities</strong> and check the date, hours and break. Assigned students receive an availability notice.'
    ],'The date appears with the intended status and working time.','Past dates are refused. For today, offered start/end values must be after the current time. Fix invalid break times or reversed intervals before saving.')+
    steps('Apply or change multiple dates','Decide the month, weekdays/date set and common working hours.',[
        'Use the bulk availability workflow. Choose the offered dates/weekday pattern and enter the common status, hours and optional break.',
        'Review the selected-date count and confirmation carefully. Save only the dates you intend to publish.',
        'Reopen the availability list to verify several intended dates. Edit an existing date using its available action.'
    ],'The selected dates show the published schedule.')+
    note('Changing availability does not move or cancel existing bookings. Deletion is blocked while scheduled classes remain on that date. Arrange any necessary class changes with participants first.')))
teacher.append(chapter('Open and start an individual lesson','Keep the meeting and JEN Academia class record aligned from the start.',
    flow(['Open class','Start and consent','Student attends','Capture evidence'])+
    steps('Start the scheduled class','Check the correct class, student, scheduled time, lesson duration and meeting access.',[
        'Open the lesson from Home or Calendar and review the class details.',
        'Open the meeting in its separate tab/window. Allow pop-ups, microphone and camera as needed.',
        'Use the teacher start control in JEN Academia and acknowledge the required consent prompt.',
        'Check the student’s own attendance status. The student must record attendance; you cannot do this on their behalf.',
        'Choose the available screenshot or recording evidence flow. Follow the next chapter’s timing and file requirements.',
        'Teach the lesson and monitor shared attendance. If the student disconnects, help them rejoin while the session is active.'
    ],'Teacher start and the student’s attendance are visible, and the correct evidence process is underway.','If the student arrives before you, their attendance can already be recorded. Shared time begins at the later of your start and their attendance. Waiting alone does not count.')+
    note('Do not rely on opening a meeting link alone to establish attendance or completion. Once teacher start or student attendance is recorded, ordinary rescheduling and conversion of the original booking are closed.')))
teacher.append(chapter('Evidence, end-of-class and completion','Complete the record promptly so attendance, evidence and package usage can be resolved correctly.',
    table(['Requirement','25-minute class','50-minute class'],[('Minimum shared attendance','15 minutes','30 minutes'),('Screenshot start proof','Within 5 minutes after both are present','Within 5 minutes after both are present'),('Screenshot files','Separate start and end files','Separate start and end files')])+
    steps('Use screenshot evidence and end the class','Both participants are present and have recorded their required start/attendance.',[
        'Capture and upload start proof within five minutes of the moment both are present. Proof uploaded before that moment does not qualify for automatic verification.',
        'Teach for the required shared duration. Capture separate end proof and select it in the end-of-class form.',
        'Enter a factual class summary with at least four alphanumeric words and a final period, exclamation mark or question mark. Example: “We practiced introductions and reviewed vocabulary.”',
        'End the session through its class control. Check the evidence and verification state.',
        'Complete the class when it is eligible. If evidence or duration is insufficient, use the administrator-review path and explain the exception.',
        'Reopen the class/history to confirm the final outcome. Do not assume that uploading a file alone completed the lesson.'
    ],'The class is verified/completed or explicitly awaiting administrator review. Completion charges the original package once.')+
    p('<strong>Screenshot limits:</strong> JPG/JPEG, PNG or WebP; maximum 4 MiB for each start/end file. Use the offered replace/remove start-proof controls if correcting evidence, while observing the timing rule.')+
    p('<strong>Recording alternative:</strong> follow the recording and consent prompts, capture the required duration, and wait for upload completion. Supported uploads are WebM or MP4, up to 500 MiB. Attendance, teacher start and end requirements still apply. Check the recording status before leaving; local retention normally lasts seven days.')+
    note('Teacher completion requires the original package to remain active with allowance. If it has expired, ask the administrator to resolve the original record. Do not take a credit from a newer package.')))
teacher.append(chapter('Exceptions and student no-shows','Record what happened and send evidence problems for review rather than forcing automatic completion.',
    steps('Submit an attendance/evidence exception','Open the affected class and check the actual attendance, evidence and summary.',[
        'End the active session when appropriate and preserve the available evidence.',
        'Use the administrator-review action offered by the class flow. Explain missing/late proof, insufficient duration or another specific exception.',
        'Submit and check that the verification shows Admin Review. Contact the administrator through chat if the case needs context.',
        'Follow the eventual verification outcome in class details/history.'
    ],'An administrator has a clear reason and record to review.','If a student attended but the teacher never arrived, the administrator can resolve the record as incomplete and release the reservation.')+
    steps('Mark a genuine no-show','The scheduled end has passed and the student never confirmed attendance.',[
        'Open the correct lesson and check the scheduled end and student attendance record.',
        'Use the available no-show action only if it is offered and the attendance condition is met. Read and confirm the action.',
        'Check the no-show outcome in the class record. Send any attendance dispute to the administrator.'
    ],'The record shows a no-show. This action alone does not consume a completion credit.')+
    note('There is no automatic 15-minute no-show rule. A late student can join an active started session until you end it. Never mark no-show when the student has recorded attendance.')))
teacher.append(rescheduling('Teacher'))
teacher.append(chapter('Propose and manage group lessons','A group combines exactly two compatible student bookings after both students accept.',
    flow(['Choose two bookings','Propose shared time','Both students accept','Teach shared session'])+
    steps('Create a group proposal','Both bookings are scheduled, unstarted and eligible. Students are different, with the same teacher, course and 25/50-minute duration.',[
        'Open the first existing class and its group proposal control. Select the compatible second student’s booked lesson.',
        'Inspect shared available slots and choose a proposed future time. Check both original packages, expiry and participant conflicts.',
        'Review both original lessons, proposed time and participants, then submit the proposal.',
        'Monitor the invitation responses. You can cancel your pending proposal through its available action.',
        'After both accept and final checks succeed, check Calendar for the linked shared session. If declined, cancelled or expired, keep the original lessons.'
    ],'Confirmed conversion reuses the original two student bookings and creates one shared meeting/session.','A pending proposal temporarily holds the proposed interval; it does not immediately replace original reservations. Expiry is the earlier of 24 hours after proposal or 15 minutes before the earliest relevant class.')+
    steps('Teach or move an existing group','Open the shared session and verify both students.',[
        'Use group controls to propose a new time for the same participants if a change is needed. Both students must accept the change.',
        'For teaching, start the session and check each student’s attendance/consent individually. Both students must join and consent before group recording starts.',
        'Complete evidence, attendance and private remarks for each student. Check each participant’s verification result.'
    ],'Each student’s own attendance and original package are resolved independently.')+
    note('One present student does not verify an absent student. A group proposal does not create an extra class or an extra credit charge.')))
teacher.append(chapter('Create assignments and inspect submissions','Give clear instructions and realistic deadlines; inspect each student’s saved work.',
    image('teacher-assignments','Figure 4. The teacher Assignments workspace organizes students, assigned work and submissions.')+
    steps('Create an assignment','Open Assignments and select the intended assigned student.',[
        'Select <strong>Assign Task</strong>. Check the selected student and course before entering content.',
        'Enter nonempty instructions stating what to produce, how to submit it and how much work is expected. The form supplies the assignment name from the selected student.',
        'If setting a deadline, choose a future due date and time. If using Limit attempts, enter a positive whole number; leaving it off means unlimited attempts.',
        'Attach optional files within the upload limits. Review all fields, choose <strong>Create Assignment</strong>, then confirm <strong>Post Assignment</strong>.',
        'Check that the assignment appears for the correct student with the intended deadline.'
    ],'The student can open the assignment and receives the relevant notification.')+
    steps('Inspect and maintain work','Open the correct student’s assignment/submission list.',[
        'Choose <strong>View Submissions</strong>. Open a submission and read the answer, attached files, timestamp, status and previous-attempt history.',
        'Open attachments through their protected file controls. Reopen from the list if an old signed link has expired.',
        'Choose <strong>Manage Assignments</strong> and use the edit action to correct supported instructions/attachments. Review the saved content afterward.',
        'Archive work no longer open for submissions; unarchive if appropriate. Permanently delete only after reviewing the confirmation and school retention needs.'
    ],'You have reviewed the submitted work and the assignment has the intended active/archive state.')+
    UPLOADS+
    note('Archived or past-due assignments reject student submissions and edits. The current teacher interface does not provide a grade/feedback-entry workflow. Use remarks or chat for guidance supported by the school.')))
teacher.append(chapter('Write and maintain student remarks','Keep class feedback specific, useful and associated with the right student.',
    steps('Write class-linked feedback','Open the relevant class workflow and select/check the student.',[
        'Open the remark entry control. Identify the class/date before typing.',
        'Describe a concrete strength and one practical next step. Example: “You used the new greeting phrases clearly. Practice answering follow-up questions in full sentences.”',
        'Save the remark and check it in <strong>Remarks</strong>. A student-facing notification may link to it.'
    ],'The active remark is visible in the student’s own remarks list.')+
    steps('Correct, archive, restore or delete a remark','Open Remarks, select the student and use Active, Archived or All as appropriate.',[
        'Find the correct class-linked remark. Edit your own active remark and save the correction.',
        'To hide a remark from the student list while preserving it, archive it and confirm.',
        'To make an archived remark visible again, restore it. Restore before editing if its edit controls are unavailable.',
        'Use permanent deletion only when intended and confirm the exact record. Recheck the list afterward.'
    ],'The remark text and active/archive state match your intention.')+
    note('Resubmitting the existing remark for the same class updates/reactivates that entry. Per-class remarks are separate from the required five-criterion final contract evaluation.')))
teacher.append(chapter('Read distributed books and check progress','Administrators maintain books; teachers use distributed materials and inspect student progress.',
    steps('Prepare lesson materials','Open <strong>My books</strong>.',[
        'Search books by the available title/course filters. Select a distributed book and check its course and lesson list.',
        'Open lesson notes and the supported material viewer/open-file action. Read the material before teaching.',
        'Open the student progress view where offered. Check completed/total lessons, per-lesson completion and percentage.',
        'Use progress alongside your own assessment to decide what to review next.'
    ],'You can use the distributed learning material and identify student reading progress.','If material is missing, ask an administrator to check distribution, course and archive state. Teachers do not author books/lessons through the current menu.')+
    note('Saved reading completion is a study progress indicator. It does not independently prove that a learner understood the material. New material and completed books may generate notifications.')))
teacher.append(chapter('Submit final contract evaluations','Evaluate a completed contract once, using the same five proficiency criteria used in trial assessment.',
    steps('Evaluate the student at contract completion','Open Contract reviews and select a contract pending your evaluation.',[
        'Check the student, course and contract. Review the learner’s work and class history before scoring.',
        'Score every criterion from 1 to 5: Speaking &amp; Pronunciation; Reading &amp; Comprehension; Structure; Sentence / Grammar; Vocabulary.',
        'Inspect the computed final proficiency level and enter optional comments describing progress and next needs.',
        'Review carefully and submit once. Check that your evaluation shows submitted.',
        'Return to normal navigation after the required review is complete.'
    ],'The evaluation is saved and updates the student’s stored proficiency level.')+
    table(['Scoring condition, checked in this order','Computed level'],[
        ('Any criterion other than Speaking & Pronunciation is 1','Novice'),('All scores ≥4 and average ≥4.5','Advanced'),('All scores ≥3 and average ≥3.5','Intermediate High'),('All scores ≥3','Intermediate Mid'),('Otherwise, average ≥2.8','Intermediate Mid'),('Otherwise','Intermediate Low')])+
    note('The review belongs to the teacher recorded for the completed contract, even after later reassignment. Your student cannot read this private evaluation. You cannot read the student’s private teacher-rating answers/comments; administrators can inspect both sides.')))
teacher.extend([history('Teacher'),communication('Teacher'),helpchapter('Teacher',[
    ('Availability cannot be saved/deleted','Check future-date horizon, time order and both break fields. A booked date cannot be deleted while scheduled classes remain.'),('Class will not verify automatically','Check shared duration, consent, timely start proof and separate end proof or valid recording. Submit an exception for admin review.'),('Completion is blocked by package status','Ask an administrator to resolve the original booking’s package. A newer package cannot replace it for completion.')])])

def adminchapters():
    return [
    chapter('Overview and daily priorities','Start with items that affect access, classes and unresolved decisions.',
        steps('Run the daily administration check','Open <strong>Overview</strong> after signing in.',[
            'Review account/student/teacher totals and the Needs Attention items. Open an item to reach its management page.',
            'Check today’s timetable and recent class-status trend. Investigate unresolved verification records rather than assuming every past class is completed.',
            'Review ending contracts, low balances and learners without an assigned teacher. Contact the relevant participants as needed.',
            'Check pending contract decisions, setup/invitation problems and automatically archived accounts.',
            'Return to Overview after decisions and confirm that the relevant counts/attention items update.'
        ],'You have identified the day’s access, scheduling and contract priorities.')+
        note('Overview summarizes stored records. Open the actual class, contract or account before making a decision. Normal class attendance/start/end actions belong to the participants.')),
    chapter('Create a teacher account','Create the teaching profile and course eligibility, then verify invitation delivery separately.',
        image('admin-create-teacher','Figure 2. Create Teacher collects identity, course and matching-profile information.')+
        steps('Onboard a teacher','Obtain verified contact details and the teaching profile through the school’s onboarding process.',[
            'Open <strong>Create Teacher</strong>. Enter name, unique email, country and birthday.',
            'Select the supported courses. Enter specialization, teaching style, preferred student pace, years of experience and useful teaching bio/notes.',
            'Set whether the teacher teaches children. Confirm this with the teacher; it affects matching for students aged 12 or younger.',
            'If using resume assistance, upload a PDF, DOCX or TXT file up to 8 MiB. Inspect every parsed field and correct it before continuing.',
            'Review the creation confirmation and submit once. Read both the account-creation result and the invitation email result.',
            'Find the account in Account Management and check setup state. If email failed, resend or copy a fresh invitation after confirming the address.'
        ],'The teacher account and course assignments exist, with a usable setup invitation.','Resume parsing assists entry; it does not create an account or verify credentials. An email delivery failure can happen after account creation succeeds, so check for the existing account before trying again.')),
    chapter('Create a student and match a teacher','Use trial results and learning needs to select an eligible teacher and initial package.',
        image('admin-create-student','Figure 3. Create Student includes trial assessment, preferences, teacher recommendations and package setup.')+
        steps('Record assessment and create the account','Have the student’s identity, email, trial assessment, learning preferences and agreed package details ready.',[
            'Open <strong>Create Student</strong>. Enter name, unique email, country, birthday and course.',
            'Score all five trial criteria from 1 to 5: Speaking &amp; Pronunciation; Reading &amp; Comprehension; Structure; Sentence / Grammar; Vocabulary. Inspect the computed level.',
            'Record goals, focus areas, learning styles, pace and trial notes. Add preferred weekdays/time range when known.',
            'Run the available matching assistance. Compare eligible teachers, explanations, published availability and load/schedule warnings.',
            'Select the teacher. Confirm the course match and suitability for children aged 12 or younger.',
            'Set the initial package: 10, 15 or 20 classes, with 25- or 50-minute duration. Review the student, teacher, assessment and warnings in confirmation.',
            'Create once, then check account/profile/package creation and invitation delivery. Find the account and contract to confirm saved details.'
        ],'The student has an account, assessment, assigned teacher, initial package and setup invitation.')+
        note('Recommendations do not book lessons. Teacher load under two assigned students is a balancing preference, not a hard capacity limit. Preferred-time checks look at published availability over the next 21 days; review mismatch warnings. AI assistance depends on school configuration.')),
    chapter('Manage account access and invitations','Locate the right account before correcting email, renewing setup access or changing status.',
        steps('Correct an email or renew setup access','Open <strong>Account Management</strong> and search identity/email/role.',[
            'Open the matching account and inspect its role, active/archive status, profile completion, invitation state and expiry.',
            'For an incorrect email, enter a valid unique replacement through the email correction control and save.',
            'For incomplete student/teacher setup, resend the invitation or generate/copy a fresh setup link. Use the copy fallback if the browser cannot copy automatically.',
            'Share setup access only through the school’s private approved channel. Confirm the user received the newest link.',
            'Check the account again after setup. A completed account uses its corrected email for normal sign-in and recovery.'
        ],'The correct address and invitation status are visible.','Archived accounts cannot receive setup invitations. Replacing an email for an incomplete account invalidates old unused invitations. A completed account does not need its old setup link.')+
        steps('Archive or restore an account','Review pending commitments, learner assignment and school retention requirements.',[
            'Find the active account and choose archive. Read the confirmation, verify identity and confirm.',
            'Check the archived list. The user loses normal sign-in/access; account data is retained.',
            'To restore, locate the archived account, inspect any dormancy reason/date and use restore. Confirm the account is active.',
            'If a teacher was archived, check learners requiring reassignment and resolve their teaching/contract setup.'
        ],'The intended account status is saved.')+
        note('Protected super-administrator accounts cannot be archived/suspended or have their email changed through these management controls. Automatic dormancy has safeguards for paid unused classes, future commitments and pending decisions; inspect the reason rather than treating it as a simple last-login rule.')),
    chapter('Maintain teacher course assignments','Course eligibility controls matching and teaching; book distribution is managed separately.',
        steps('Update a teacher’s courses','Open <strong>Teacher Courses</strong>. Confirm the change with the school.',[
            'Search for the teacher and inspect the current course assignments.',
            'Select the supported courses the teacher should be eligible to teach. Review any child-teaching setting offered by the supported controls.',
            'Review and save. Reopen/search the teacher to confirm the assignments.',
            'Check any affected learner assignments and matching results. If the teacher also needs materials, assign those separately in Books / Lessons.'
        ],'The teacher’s course eligibility matches the intended teaching scope.')+
        note('Removing a course is not the same as deleting books or cancelling already booked lessons. Review existing commitments before changing eligibility.')),
    chapter('Monitor school schedules and reschedule requests','Inspect participant schedules and request outcomes without taking the participant’s decision role.',
        steps('Inspect a scheduled class','Open the administration <strong>Calendar</strong>.',[
            'Navigate to the relevant month/date and use the available participant/date filters.',
            'Open the class and check student, teacher, course, date/time, duration, meeting link and status.',
            'If investigating attendance, open the related verification record and compare the recorded events.',
            'Communicate the finding to the participants using school support channels.'
        ],'You have located the correct class and its current recorded state.')+
        steps('Monitor or remove a request record','Open <strong>Requests</strong> and filter/search the relevant participant or outcome.',[
            'Read the original schedule, proposed schedule, requester’s reason, response/decline reason and resolution time.',
            'For a pending request, direct the other participant to approve/decline it. The monitoring screen does not decide for them.',
            'If removing an eligible request record, choose its delete/remove action, confirm the exact record and recheck the list.'
        ],'You understand the request outcome or have removed the intended record.')+
        note('Removing a request record does not approve it or move the lesson. The original schedule remains until the other participant approves an eligible request. Calendar visibility does not grant the participant-only attendance workflow.')),
    chapter('Inspect and edit class contracts','Review totals, usage, reservations and expiry before changing a package.',
        image('admin-contracts','Figure 4. Contracts provides package information and access to contract-request decisions.')+
        steps('Review or correct a contract','Open <strong>Contracts</strong> and the package list.',[
            'Search/filter by student, email, course, teacher or status. Open the intended package.',
            'Check total, used and remaining classes; lesson duration; creation/expiry dates; status; and any reserved allowance.',
            'Use the edit action for supported course, eligible teacher, 25/50-minute duration, totals, usage or status changes. Record the reason through school procedures.',
            'Keep used classes within total classes. Check the calculated remaining balance and intended Active, Expired or Cancelled state.',
            'Save and reopen the record. Compare the displayed balance/status with the intended correction and any existing reservations.'
        ],'The intended contract fields are saved, with a consistent remaining balance.')+
        table(['Balance concept','Meaning'],[('Unused','Total classes minus used classes.'),('Bookable','Unused classes after qualifying unresolved reservations are held.'),('Original package','The package attached to the booking; later completion/rescheduling refers back to it.')])+
        note('Standard new contracts last three calendar months. Full use or time expiry may expire a package. An in-app warning normally starts 14 days before expiry. Editing package numbers is an administrative change; check existing class records before making it.')),
    chapter('Decide new-contract and extension requests','Read the latest revision and apply the correct package outcome.',
        flow(['Open request','Review latest details','Approve or decline','Check saved package'])+
        steps('Decide a new-contract request','Open Contracts and its contract-request section.',[
            'Filter Pending and open the request. Check student, course, requested count/duration, teacher/preferences, notes and current package.',
            'Review revision history so you decide the latest request. Confirm any school payment arrangements outside the application.',
            'Use approval or decline and provide the administrative response where offered. Check all course/teacher/package choices before confirming.',
            'Wait for the result. For approval, inspect the newly created replacement package and applied teacher/course/profile decisions.',
            'Confirm that the request outcome and administrator response are recorded.'
        ],'Approval creates the replacement package; decline leaves an explanation in request history.','A new contract does not automatically transfer unused old credits. Do not promise a transfer based on the request form.')+
        steps('Approve an extension of an ended package','The referenced ended contract still has unused classes.',[
            'Open the extension request and verify the referenced existing package and remaining allowance.',
            'Choose a future end date in the extension approval dialog. Review the student’s reason and intended deadline.',
            'Approve and check that the same package is active with its new end date, unchanged total and unchanged usage.',
            'Decline with context if ineligible. Archive resolved requests only when they no longer need to remain in the active list.'
        ],'An approved extension preserves package identity and unused credits while extending time.')+
        note('A request does not collect money. Only one request kind can be pending for a student; revisions update that pending kind. Pending requests must be decided or withdrawn before removal from the active list.')),
    chapter('Review attendance and class evidence','Resolve exceptions using attendance facts and the original booking’s package.',
        table(['Automatic evidence requirement','Value'],[('Shared duration','15 minutes for a 25-minute class; 30 minutes for a 50-minute class.'),('Start screenshot','After both are present and within five minutes of that moment.'),('Screenshot mode','Separate start and end proof, with teacher start, student attendance, teacher end and valid summary.'),('Recording mode','Required recorded duration plus the applicable attendance/start/end conditions.')])+
        steps('Approve or mark incomplete','Open <strong>Verifications</strong> and find the class by participant, class, date and status.',[
            'Open/read the record. Check teacher start, student attendance, teacher end and shared attendance duration.',
            'Review summary, evidence mode and exception reason. Open the start/end screenshots or available recording.',
            'Check the original package and remaining allowance. For a group, inspect each student’s record independently.',
            'Choose the supported approval action when the evidence merits completion, or mark incomplete when appropriate. Review and confirm the decision.',
            'Reopen the record and check verification state, class outcome and original-package usage.'
        ],'The class is resolved and its original-package credit decision is reflected. Repeated approval must not charge again.')+
        note('Administrator resolution can process an expired original package that still has allowance. It must not charge a newer replacement package. Marking a previously completed record incomplete reverses its recorded usage in the original-package path. Review carefully before changing an existing decision.')),
    chapter('Clean up finalized verification records','Evidence cleanup is distinct from deciding whether a lesson was completed.',
        steps('Remove an individual record or clear finalized records','Follow the school’s evidence-retention policy. Open Verifications and confirm the relevant outcomes.',[
            'For a single deletion, locate the precise class/participant record and inspect its evidence before using remove.',
            'Read the confirmation and confirm only the intended record. The record and its associated unshared uploaded evidence are removed.',
            'For bulk cleanup, use the finalized-record cleanup action only after reviewing which Verified/Incomplete records it targets.',
            'Check that Pending/Admin Review items remain for decision and that the intended finalized records were cleared.'
        ],'The targeted verification/evidence records are removed; unresolved review items remain.')+
        note('Cleanup does not undo a historical credit decision. Shared group evidence remains while another participant record references it. Do not delete evidence when the task is actually to correct a completion outcome.')),
    chapter('Create and distribute books','Maintain the shared library and grant teachers the correct course materials.',
        image('admin-library','Figure 5. Books / Lessons is the administrative book library and distribution workspace.')+
        steps('Add a book and assign teachers','Open <strong>Books / Lessons</strong>. Have the title, course, description and optional cover ready.',[
            'Use the add/create book control. Enter title and course, plus the optional description.',
            'Choose an optional JPG/JPEG, PNG or WebP cover up to 5 MiB.',
            'Select the teachers who should receive access. Review title, course and distribution before saving.',
            'Search for the saved book and open it. Confirm metadata and assigned teachers.'
        ],'The book is saved and distributed teachers can access it; eligible students inherit access through teacher/course.')+
        steps('Change distribution or archive a book','Search the book by title, course or teacher.',[
            'Use edit to change metadata/cover, or the teacher-assignment control to change distribution. Review before saving.',
            'To hide a book while preserving lessons/progress, archive it through its confirmed action.',
            'Use the archived view/status filter to locate and restore it when appropriate. Verify the final state.'
        ],'Metadata, distribution and archive state match the intended access.')+
        note('Removing a teacher’s distribution removes that teacher’s access. Archiving preserves lessons and learning progress; it is different from deleting an individual lesson.')),
    chapter('Upload lessons and inspect student progress','Organize usable lesson files and check learning records without treating reading progress as assessment.',
        steps('Upload a lesson into a book','Open the correct book’s content page from Books / Lessons.',[
            'Use the lesson upload/add action. Enter the lesson number/order, title and useful notes/description.',
            'Choose a learning file within the 10 MiB limit. The upload screen offers PDF, DOC, DOCX and TXT.',
            'Review the book, lesson ordering and file. Upload and wait for confirmation.',
            'Reopen the lesson and check its details and supported viewer/open-file action. Confirm that the material is readable.'
        ],'The lesson appears in the correct book with its notes and file.','RTF also has backend support, but use the formats offered by the current interface. If a format cannot preview, check the offered fallback before distributing it.')+
        steps('Inspect progress or remove a lesson','Open the intended book.',[
            'Open <strong>Students Progress</strong>. Locate the student and inspect completed/total lessons, percentage and per-lesson state.',
            'Compare progress with teacher assessment when planning support; reader completion alone does not establish learning.',
            'If an individual lesson must be removed, identify its number/title, use delete and read the confirmation carefully.',
            'Recheck the lesson list and consult affected teachers when changing an active course’s materials.'
        ],'You have inspected the intended student record or removed the exact lesson.')+
        note('Book completion can notify distributed teachers. Avoid describing teacher book views as authoring tools; the administrator maintains the library.')),
    chapter('Read closing contract-review reports','Administrators can inspect both private review sides and their completion states.',
        steps('Find and inspect a report','Open <strong>Contract reviews</strong>.',[
            'Search by student, teacher, course, level or status. Use complete/awaiting-teacher/awaiting-student filters as appropriate.',
            'Check which side is missing; some records may await both. Review the summary counts and average teacher ratings.',
            'Open the full report. Read the teacher’s five proficiency scores, computed level and comments.',
            'Read the student’s five teacher-rating scores, average rating, comments and submission dates.',
            'Follow up privately with the participant whose required review is pending. Preserve the confidentiality of both sides.'
        ],'You can identify missing reviews and interpret the final report without confusing it with per-class feedback.')+
        note('Only administrators can inspect both private sides together. Students and teachers submit once for the relevant completed contract. Expiry with unused classes alone is not the same trigger as full contract completion.')),
    ]

def make_admin(superadmin=False):
    role='Super administrator' if superadmin else 'Administrator'
    menus=[('Overview / Calendar','School priorities and schedules.'),('Create Teacher / Create Student','Onboarding and initial learning setup.'),('Account Management / Teacher Courses','Access, invitations and course eligibility.'),('Contracts / Requests / Verifications','Package decisions, monitoring and evidence review.'),('Books / Lessons / Contract reviews','Library, progress and closing reports.')]
    if superadmin:menus.append(('Create Admin','Create ordinary administrator accounts.'))
    items=[introduction(role,'Use JEN Academia to manage school accounts, contracts, class evidence and the shared learning library.',menus),access(role),account(role)]
    if superadmin:
        items.append(chapter('Create an administrator','This privilege is available only to a super administrator. New administrators do not inherit it automatically.',
            image('super-admin-create','Figure 2. Create Admin is the additional super-administrator form.')+
            steps('Create an ordinary administrator account','Confirm authorization, correct identity details and a private way to deliver the initial credentials.',[
                'Open <strong>Create Admin</strong>. If it is absent, check that you are using the intended super-administrator account.',
                'Enter name, unique email, country and birthday. Choose a unique strong initial password with at least eight characters.',
                'Review the identity and intended administrator role, then submit the form once.',
                'Verify the account exists in Account Management. Deliver the initial credentials privately using the school’s approved process.',
                'Ask the new administrator to sign in, complete any required profile fields and change the initial password in Account.'
            ],'An ordinary administrator can sign in with their own credentials.','This form uses an initial password rather than student/teacher invitation setup. If creation appears to fail, search for the email before repeating it.')+
            note('Ordinary administrators cannot create other administrators. Your protected super-administrator identity has additional archive/email protections. Use named individual accounts and keep the super-administrator credentials private.')))
    items.extend(adminchapters())
    items.extend([communication(role),helpchapter(role,[
        ('Account exists but invitation failed','Confirm the saved account and correct email. Resend/copy a new setup invitation instead of creating a duplicate.'),('No suitable teacher recommendation','Check course eligibility, profile completion, active status and child suitability. Review schedule warnings and published availability.'),('Student has credits but cannot book','Inspect original-package expiry and unresolved reservations. Resolve the affected class records before changing totals.'),('A completed class needs correction','Review its verification and original package. Use the supported outcome decision; deleting evidence alone does not reverse credit usage.')])])
    return items

visitor=[
    introduction('Visitor','Use the public website to understand the school’s services, contact the team and begin enrollment.',[
        ('Home and service sections','Read course, matching and enrollment information.'),('Contact','Send an enrollment or general inquiry.'),('Sign in / Forgot password','Access an existing school-created account or recover its password.')]),
    chapter('Explore courses and the enrollment process','Read the public information before contacting the school about your needs.',
        image('visitor-home','Figure 1. The public homepage introduces the school and its learning services.')+
        steps('Find a suitable service','Open the school website without signing in.',[
            'Read the homepage and course/service sections. Compare their purposes with your learning goal.',
            'Review the tutor-matching explanation and the trial/enrollment process. Note questions about course level, schedule and package terms.',
            'Find the contact information or Contact section and ask the school to confirm current availability and arrangements.'
        ],'You have a shortlist of learning needs and a clear next step for contacting the school.')+
        note('Public descriptions of trials or prices do not book a trial or process payment. The school handles the trial/contract process and creates student/teacher accounts. There is no public self-registration workflow.')),
    chapter('Send an inquiry','Give the school enough information to answer you without sending sensitive credentials.',
        steps('Submit the contact form','Have a working email address and a short explanation of your request.',[
            'Open the Contact section on the website. Enter your name and valid email address.',
            'Write your message, up to 2,000 characters. For enrollment, explain the learner’s goal, course interest, preferred schedule and timezone.',
            'Complete any anti-bot check shown. Review your email so the school can reply.',
            'Submit once and wait for the result. If a delivery error appears, use the displayed school contact channels or try again after checking the form.'
        ],'A successful response confirms the inquiry submission. Wait for the school’s reply to your email.','Repeated submissions may be rate limited. If you have sent several inquiries, wait before retrying; the default contact limit is ten requests in 15 minutes.')+
        p('<strong>Example inquiry:</strong> “I am interested in conversational English for work. I can study on Tuesday and Thursday evenings, Asia/Manila time. Please advise about assessment, available teachers and package options.”')+
        note('Do not send passwords, payment-card details, invitation/reset links or LINE linking codes in a contact message.')),
    chapter('From inquiry to your first account','The school completes the enrollment and account-creation steps before you can use private learning pages.',
        flow(['Contact school','Trial and contract','Receive invitation','Set up account'])+
        steps('Complete the enrollment handoff','The school has responded to your inquiry.',[
            'Confirm course goals, trial/assessment arrangements, schedule expectations and package terms directly with the school.',
            'Provide the required identity/contact information through the school’s approved process. Confirm the email address that will be used for your account.',
            'Wait for the administrator-created account and its setup invitation. Open the newest email and follow the setup link.',
            'Choose and confirm an initial password of at least eight characters. Complete the setup form and sign in.',
            'Use the separate Student or Teacher User Manual for profile completion and role-specific tasks. Students also complete LINE linking.'
        ],'You have an activated account and the correct role manual for normal use.','Invitations normally expire after 24 hours and are single use. Ask the administrator for a fresh invitation if it is missing, expired or already used.')+
        note('An invitation does not itself reserve a lesson. After student onboarding and an active package, use Calendar to book an available class.')),
    chapter('Sign in or recover an existing account','Existing users enter with the email registered by the school.',
        image('password-recovery','Figure 2. Password recovery requests an email link for an existing eligible account.')+
        steps('Access your existing account','You already have a school-created account.',[
            'Open the sign-in page. Enter the registered email and password, then submit.',
            'If you forgot the password, open <strong>Forgot password</strong>, enter that email and send the request.',
            'Check inbox and spam. Open the newest reset link within one hour, enter/confirm a new password and submit.',
            'Return to sign-in and use the new password. Continue with your role’s manual.'
        ],'You reach the appropriate role workspace.','The reset response does not reveal whether an email is registered. A new reset request replaces older unused links. If mail does not arrive, ask the school to confirm your registered email.')+
        note('If the account is archived, contact the school for restoration. Repeated incorrect passwords can cause a temporary lock; avoid continually retrying the same password.')),
    helpchapter('Visitor',[("Cannot find a registration button","Contact the school. Student and teacher accounts are created by an administrator after the enrollment/onboarding process."),("No reply to an inquiry","Check spam and the email entered in the form. Use the school’s published contact details to follow up; avoid repeated rapid submissions.")])
]

CSS='''
@page { size:A4; margin:17mm 17mm 19mm; }
*{box-sizing:border-box}html{font-family:"Segoe UI",Arial,sans-serif;color:#24372f;background:#e9eeeb;font-size:10pt;line-height:1.48}body{margin:0}main{max-width:210mm;margin:0 auto;background:white;padding:17mm}h1,h2,h3{color:#173e30;line-height:1.16}h1{font-size:38pt;letter-spacing:-1.2pt}h2{font-size:23pt;margin:0 0 9pt;max-width:160mm}h3{font-size:12pt;margin:13pt 0 6pt}p{margin:0 0 9pt}strong{font-weight:650}a{color:#24553f;text-underline-offset:3px}ol{padding-left:19pt;margin:6pt 0 10pt}li{padding-left:4pt;margin-bottom:6pt}li::marker{font-weight:bold;color:#286046}.cover{min-height:252mm;background:#173e30;color:#fff;padding:19mm 15mm;display:flex;flex-direction:column;justify-content:space-between;break-after:page}.cover h1{color:white;max-width:140mm;margin:16pt 0}.cover .brand{font-size:13pt;font-weight:700;letter-spacing:2pt}.kicker{font-size:8pt;text-transform:uppercase;letter-spacing:1.5pt;font-weight:700;color:#a87d2c;margin-bottom:12pt}.cover .kicker{color:#e0bd71}.cover .lead{font-size:14pt;color:#d8e6dd;max-width:130mm}.cover .rule{width:55mm;height:3px;background:#d5b26c;margin:22pt 0}.meta{font-size:9pt;color:#d8e6dd}.contents{break-after:page;padding-top:10mm}.contents ol{list-style:none;padding:0;columns:1}.contents li{margin:0;padding:6pt 0;border-bottom:1px solid #dde5df}.contents a{text-decoration:none;display:block}.contents span{display:inline-block;width:23pt;color:#97732d;font-weight:700}.section{break-before:page;padding-top:4mm}.intro{font-size:11pt;color:#5b6d63;margin-bottom:13pt}.running{font-size:7.5pt;letter-spacing:.7pt;text-transform:uppercase;border-bottom:1px solid #cfdcd3;padding-bottom:7pt;color:#66796c;margin-bottom:18pt;display:flex;justify-content:space-between}.before{color:#566b5c;font-size:9.3pt}.result{border-left:3px solid #3b7757;background:#eff6f1;padding:7pt 10pt;font-size:9.5pt;break-inside:avoid}aside{border-left:3px solid #bb9144;background:#fbf7ec;padding:9pt 11pt;margin:12pt 0;break-inside:avoid;font-size:9.2pt}aside strong{color:#846220;margin-right:5pt}figure{margin:12pt 0 15pt;break-inside:avoid}figure img{display:block;width:100%;border:1px solid #d1ddd5;border-radius:5px}figcaption{font-size:8pt;color:#657368;margin-top:6pt;line-height:1.4}.flow svg{width:100%;height:auto}.flow{margin:8pt 0 13pt}table{width:100%;border-collapse:collapse;font-size:9pt;margin:11pt 0 15pt}thead{display:table-header-group}tr{break-inside:avoid}th{background:#e9f1ec;color:#234933;text-align:left;padding:7pt;border-bottom:1px solid #bdd0c1}td{vertical-align:top;padding:7pt;border-bottom:1px solid #dbe5de}td:first-child{width:34%;font-weight:600}.procedure h3{break-after:avoid}.procedure .before{break-after:avoid}.toplink{font-size:8pt;color:#6c7d70;margin-top:15pt}.docend{margin-top:25pt;border-top:1px solid #d6e1d8;padding-top:12pt;color:#6c7d70;font-size:8pt}.download{padding:10pt;background:#f0f5f1;margin-bottom:10pt}
@media print{html{background:white;font-size:9.5pt;line-height:1.35}body{margin:0}main{max-width:none;padding:0}.cover{min-height:256mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}.download,.docend{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.toplink{display:none}a{text-decoration:none}h2,h3{break-after:avoid}p{orphans:3;widows:3;margin-bottom:7pt}li{break-inside:avoid;margin-bottom:4pt}.running{margin-bottom:13pt}.section{padding-top:2mm}.intro{font-size:10.5pt;margin-bottom:10pt}.kicker{margin-bottom:9pt}h3{margin-top:10pt}.before{font-size:9pt}.result{font-size:9pt;padding:6pt 9pt}aside{font-size:9pt;padding:7pt 9pt;margin:9pt 0}figure{margin:9pt 0 11pt}figure img{width:auto;max-width:100%;max-height:85mm;margin:0 auto}figcaption{font-size:7.5pt}table{font-size:8.8pt;margin:8pt 0 11pt}td,th{padding:6pt}.contents li{padding:5pt 0}}
@media(max-width:700px){main{padding:22px}.cover{min-height:90vh;padding:30px 22px}h1{font-size:30pt}h2{font-size:22pt}table{font-size:9pt}.running{display:block}.section{padding-top:25px}}
@media print{img[src$="sign-in.png"],img[src$="teacher-calendar.png"],img[src$="admin-contracts.png"]{max-height:65mm}}
'''

# Give assignment creation and submission management their own readable chapters.
for i, c in enumerate(teacher):
    if c['title'] == 'Create assignments and inspect submissions':
        marker='<div class="procedure"><h3>Inspect and maintain work</h3>'
        first, second=c['body'].split(marker,1)
        teacher[i:i+1]=[
            chapter('Create student assignments','Give clear instructions, an optional future deadline and an appropriate attempt allowance.',first+note('Assignment/submission uploads allow up to five files, 10 MiB each and 25 MiB combined. See the next chapter for supported formats and submission management.')),
            chapter('Inspect submissions and manage assignments','Read current work and previous attempts, then maintain assignment instructions and archive state.',marker+second)
        ]
        break

manuals=[('VISITOR','Visitor',visitor),('STUDENT','Student',student),('TEACHER','Teacher',teacher),('ADMIN','Administrator',make_admin()),('SUPER_ADMIN','Super administrator',make_admin(True))]
manifest=[]
for key,role,chapters in manuals:
    filename=key+'_USER_MANUAL'
    contents=''.join('<li><a href="#chapter-'+str(i)+'"><span>'+str(i).zfill(2)+'</span>'+c['title']+'</a></li>' for i,c in enumerate(chapters,1))
    body=''.join('<section class="section" id="chapter-'+str(i)+'"><div class="running"><span>JEN Academia / '+role+' user manual</span><span>Chapter '+str(i).zfill(2)+'</span></div><div class="kicker">'+str(i).zfill(2)+' / '+role+' guide</div><h2>'+c['title']+'</h2><p class="intro">'+c['intro']+'</p>'+c['body']+'<p class="toplink"><a href="#contents">Return to contents</a></p></section>' for i,c in enumerate(chapters,1))
    doc='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Detailed illustrated JEN Academia '+role.lower()+' user manual"><title>JEN Academia | '+role+' User Manual</title><style>'+CSS+'</style></head><body><main><p class="download"><a href="'+filename+'.pdf">Download the printable PDF</a> · <a href="index.html">All role manuals</a></p><header class="cover"><div class="brand">JEN ACADEMIA</div><div><div class="kicker">Practical user guide</div><h1>'+role+'<br>User Manual</h1><div class="rule"></div><p class="lead">Clear instructions for every stage.<br>Prepare. Follow the steps. Check the result.</p></div><div class="meta">Edition 2.0<br>'+DATE+'<br>Illustrated guide • Standalone role edition</div></header><nav class="contents" id="contents" aria-label="Contents"><div class="kicker">Find your task</div><h2>Contents</h2><p>Choose a chapter. Each procedure explains the starting conditions, actions and expected result.</p><ol>'+contents+'</ol></nav>'+body+'<footer class="docend">JEN Academia · '+role+' User Manual · Edition 2.0 · '+DATE+'</footer></main></body></html>'
    (OUT/(filename+'.html')).write_text(doc,encoding='utf-8')
    manifest.append({'role':role,'file':filename,'chapters':len(chapters),'procedures':doc.count('class="procedure"'),'images':doc.count('<img'),'sections':[c['title'] for c in chapters]})

links=''.join('<tr><td>'+m['role']+'</td><td><a href="'+m['file']+'.html">Read illustrated manual</a></td><td><a href="'+m['file']+'.pdf">Download PDF</a></td></tr>' for m in manifest)
index='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JEN Academia | User manuals</title><style>'+CSS+'</style></head><body><main><div class="kicker">JEN Academia / User documentation</div><h1>User manuals</h1><p class="intro">Choose your role for a complete illustrated guide with step-by-step procedures, result checks and troubleshooting.</p><table><thead><tr><th>Role</th><th>Online / HTML</th><th>Printable copy</th></tr></thead><tbody>'+links+'</tbody></table><h3>Which guide should I use?</h3><p>Visitors can explore services and contact the school. Students manage their own learning. Teachers manage assigned learners and classes. Administrators manage school operations. Super administrators have the same operational guide plus their additional Create Admin procedure.</p><p>Each role manual is self-contained. There is no need to read another role’s guide to complete your ordinary tasks.</p><aside><strong>About the pictures</strong> Interface pictures use the current frontend with fictional sample data. Workflow illustrations explain task sequences. No live account records are shown.</aside><p>Edition 2.0 · '+DATE+'</p></main></body></html>'
(OUT/'index.html').write_text(index,encoding='utf-8')
# Replace the previous mixed-role manual with a clear directory; preserve familiar paths.
(ROOT/'USER_MANUAL.html').write_text(index.replace('href="','href="docs/user-manuals/'),encoding='utf-8')
adminhtml=(OUT/'ADMIN_USER_MANUAL.html').read_text(encoding='utf-8').replace('src="images/','src="docs/user-manuals/images/').replace('href="ADMIN_USER_MANUAL.pdf"','href="docs/user-manuals/ADMIN_USER_MANUAL.pdf"').replace('href="index.html"','href="docs/user-manuals/index.html"')
(ROOT/'ADMIN_USER_MANUAL.html').write_text(adminhtml,encoding='utf-8')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'README.md').write_text('''# JEN Academia user manuals

Edition 2.0 — 16 November 2026.

Open [the manual directory](index.html) and choose a role. Each role has a standalone HTML guide and matching printable PDF. The root USER_MANUAL files are the directory; the root ADMIN_USER_MANUAL files remain the administrator guide.

## Maintain the manuals

1. Check interface labels and permissions against the current role screens and `docs/SYSTEM_FEATURES_AND_RULES.md`.
2. Update content in `scripts/build-user-manuals.py` and run `python scripts/build-user-manuals.py`.
3. Capture illustrations with `node scripts/capture-manual-screens.mjs` when screens change. This uses the real frontend with intercepted, fictional API responses. It does not connect to a database or validate deployed backend behavior. All external requests are blocked except mocked API responses.
4. Run `node scripts/render-manuals.mjs` to regenerate PDFs, validate links/images and render chapter previews for visual review.
5. Inspect the generated previews and fix layout issues before distributing the manuals.

Dependencies: the existing frontend Vite install, root `puppeteer-core`, Python standard library and an installed Chrome browser. `BROWSER_PATH` can select another Chromium browser. No Word/document skill dependencies are required because deliverables use the repository’s existing HTML/PDF format.

## Illustration provenance

PNG screenshots show actual React pages with fictional sample identities and records. `images/capture-report.json` records the captured routes and browser errors. No screenshot is evidence of production behavior. SVG workflow illustrations are authored inside the HTML and labelled as diagrams. Integration-dependent email, LINE, AI, recording and meeting behavior is described with its relevant conditions.
''',encoding='utf-8')
print(json.dumps([{k:v for k,v in m.items() if k!='sections'} for m in manifest],indent=2))
