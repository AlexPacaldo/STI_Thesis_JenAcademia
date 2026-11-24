# JEN Academia thesis defense presentation guide

This guide follows the Railway demo dataset created on 25 November 2026. It is a presentation script, not a record of browser tests. Rehearse the workflows before your defense: availability, deadlines, contract statuses and dashboard numbers change over time.

## Before the presentation

1. Open the deployed application, check the internet connection, and sign in with the demo accounts. Keep [DEMO_CREDENTIALS.md](DEMO_CREDENTIALS.md) private; all demo accounts share a password.
2. Use separate browser profiles or private windows for the administrator, teacher and student, so switching roles is quick. Confirm that all three dashboards open.
3. Check upcoming dates in the calendar and the contract expiry dates. The seed creates availability for a limited period; rerunning it changes demo records, so rehearse first and do not run it during the presentation.
4. Test the matching analysis and note whether an external AI provider is available. Show the actual result; do not describe a deterministic fallback as a successful external AI response.
5. The current seed has **no group proposals or group sessions**. If you want to show a converted group class, prepare and rehearse it beforehand using the real interfaces and suitable bookings. See the group-class section below.
6. Keep a copy of this guide and the application manuals available. If a live action fails, explain the intended workflow and use a screen you have already verified rather than claiming it succeeded.

## Suggested 12–15 minute flow

| Time | Demonstration | Account |
| --- | --- | --- |
| 1–2 min | School overview and contracts | Super administrator |
| 3–4 min | Trial assessment and teacher matching | Super administrator |
| 2 min | Teacher profiles and teaching workflow | Teacher / administrator |
| 2–3 min | Student dashboard, assignment and learning materials | Student |
| 2–3 min | Group class or attendance review | Teacher / student / administrator |
| 1 min | Questions and closing | Any |

## 1. Introduce the system and administrator dashboard

Sign in as **admin@jenacademia.local**. Open **Overview** and briefly point out student and teacher totals, the timetable, contracts ending soon and any needs-attention items that are visible.

Suggested narration: “JEN Academia brings account management, scheduling, learning materials and contract monitoring into one system. The administrator can see operational priorities from the dashboard.”

Open **Contracts**. Look for Carlos Mendoza's contract, which was seeded close to expiry, and Danica Pope's expired contract. Check their current status on screen instead of quoting a fixed number of days. Explain that the displayed figures depend on the actual package and current date.

## 2. Demonstrate assessment and teacher matching

From **Create Student**, enter a fictional trial student and open the assessment and matching section. If you intend to save the account, use a unique demo email; otherwise stop before final submission.

For a child-suitability example, use a birth date that makes the student **11 years old on the day of the defense**, and select **Conversational English**. Enter the scores below:

| Assessment criterion | Score |
| --- | ---: |
| Speaking & Pronunciation | 1 |
| Reading & Comprehension | 3 |
| Structure | 2 |
| Sentence / Grammar | 3 |
| Vocabulary | 2 |

Choose a conversation-related goal, speaking focus, conversational learning style and balanced pace. Add a note such as “The learner understands instructions but needs encouragement to speak.” If schedule preferences are available, select Saturday morning, then run the analysis. The project’s example expects these scores to produce **Intermediate Low**; confirm the displayed result during rehearsal.

Compare the recommendations and explain the factors shown on the screen: course eligibility, profile characteristics, child eligibility, workload and availability. Maia Cruz teaches conversational English but is marked as not teaching children; Rafael Santos is marked as child-eligible. The order and warnings depend on current availability and workload, so follow the actual output rather than promising a specific ranking.

Suggested narration: “The assessment supplies a proficiency level and learning preferences. The matching process considers eligibility first, then compares relevant teaching and scheduling factors. The administrator makes the final selection.”

## 3. Show teacher management

Open **Account Management** or **Teacher Courses** and compare a few profiles:

- **Rafael Santos:** beginner and children's English, structured and visual teaching.
- **Gina Dela Cruz:** IELTS and TOEIC, exam preparation and structured review.
- **Maia Cruz:** conversation specialist who does not teach children.
- **Ben Martin:** interactive conversation and pronunciation.

Show the assigned courses and, where available, the teacher's published calendar. Explain that the profiles and availability give the matching feature useful context. Actual available dates can change.

## 4. Show the student experience

Sign in as **carlos.mendoza@student.jenacademia.local**. Show the student's dashboard, assigned teacher **Ben Martin**, contract and calendar. Point out that booking depends on the current package, teacher availability and schedule conflicts.

Open assignments and find **Meeting Introductions**, seeded for Carlos. Explain the instructions and due date. If you demonstrate a submission, use a short fictional answer and check the result on screen; submitting changes the demo state.

Open the learning materials and look for **Confident Conversations**. The seed includes lesson progress for Carlos: one completed lesson and one partly completed lesson. Confirm the current display before quoting the percentages.

## 5. Show the teacher's view

Sign in as **ben.martin@jenacademia.local**. Open the student and assignment pages, locate Carlos and **Meeting Introductions**, and show the pending work or the submission you just made. Open the calendar or reschedule area and look for **Conversation Reschedule Demo**, which was seeded with a pending request. Explain that the original booking stays in place while the request awaits a decision; check the current status before demonstrating an approval.

For a second example, **gina.delacruz@jenacademia.local** teaches Beatrice Alvarez. The seed includes the assignment **Listening Reflection** and an **IELTS Progress Review** class with a teacher remark. Use them to show how a teacher's instructional activity connects to a particular student.

## 6. Attendance and administrator review

As the administrator, open **Verifications** and look for **Conversation Attendance Review**. This example was seeded for review without evidence files. Show whatever attendance and review details the interface actually displays; do not claim screenshot evidence was uploaded.

Explain that verification uses the application's attendance and evidence rules and affects the student's package according to the recorded outcome. Avoid approving or changing the record during the defense unless you have rehearsed the consequences.

## 7. Group-class demonstration

The current seed contains **no prepared group invitations or converted sessions**. Prepare this workflow before the defense if it is a priority:

1. Using the actual application, arrange at least two eligible, unstarted individual bookings belonging to different students with the same teacher, course and duration. Check the interface's scheduling requirements and both students' active packages.
2. As the teacher, open an eligible booking and use the group proposal feature to select compatible bookings and invite the students.
3. Sign in as each invited student and respond. Show the pending state before the last acceptance if the interface permits it.
4. Once all required invitations are accepted, return to the teacher's view and show the resulting group session and each student's original booking record.

Rehearse the exact sequence and record the chosen accounts and times here: ______________________________. The current seed alone does not establish that suitable bookings exist, and this workflow has not been browser-tested in this session.

Suggested narration: “The proposal collects each participant's consent. A shared session should preserve the individual student records and their separate attendance and credits.”

## 8. Close and handle questions

Summarize the journey: an administrator assesses and assigns a learner; the teacher schedules and delivers lessons; the student accesses learning materials; and the administrator reviews the resulting records. Be explicit when a capability depends on an external integration or has not been demonstrated live.

If asked about AI, distinguish the application's matching rules from any external provider response, and explain only what the displayed result and your rehearsal establish. If asked about group classes, show the prepared proposal if available; otherwise explain the workflow without claiming it was tested.

For detailed interface instructions, see [ADMIN_USER_MANUAL.html](ADMIN_USER_MANUAL.html), [USER_MANUAL.html](USER_MANUAL.html), and [SAMPLE_ACCOUNTS.txt](SAMPLE_ACCOUNTS.txt). Some examples in those documents may describe data or dates that have since changed; the live screen is authoritative.
