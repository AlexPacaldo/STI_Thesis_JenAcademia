# JEN Academia thesis presentation guide

**Presentation: Wednesday, November 25, 2026**

All names, accounts, and learning records below are fictional presentation data. Times use Asia/Manila.

## Preparation before the panel

1. Open the application that is connected to the seeded demo database. Verify that the frontend and backend use that same database; a successful seed alone does not prove the website is connected to it.
2. Sign in as the admin and check the six teachers, five students, courses, books, assignments, and class records. Sign out and test the teacher and student accounts below. Use separate browser profiles to switch roles quickly.
3. The seed creates availability and dates relative to the day it is run. Re-seed close to November 25 if you need fresh future dates, then check the results before presenting. Re-seeding updates demo records and can overwrite changes made during rehearsal. Do it only on the disposable database. Allow the backend's scheduled expiry processing time to run.
4. Student-only screens can require a real LINE connection. Link a real test LINE account ahead of time using the app's normal flow; the demo seed does not manufacture a LINE identity. Check email, LINE, video meetings, recordings, and Gemini separately if you plan to demonstrate them: they depend on real external configuration and connectivity.
5. Open the matching page and rehearse the example below. Take screenshots of a successful analysis, books, assignment statuses, and class records as a backup. AI ordering, explanations, availability, and match strength can vary; describe what the screen actually shows. Do not promise a particular Gemini ranking.
6. Keep a clean browser tab open at the matching form. Use the preview/analyze step without submitting a new student during practice, or change the test email for each completed creation.

## Quick account card

Every demo account uses password **JEN2026!**. These are shared demo credentials for a disposable environment; do not reuse them for real accounts.

| Role | Account | Useful view |
| --- | --- | --- |
| Admin | admin@jenacademia.local | Matching, users, books, contracts, attendance |
| Teacher | ben.martin@jenacademia.local | Carlos, assignments, class and reschedule workflows |
| Teacher | gina.delacruz@jenacademia.local | IELTS classes, assignments, remarks |
| Student | carlos.mendoza@student.jenacademia.local | Conversation lessons and assignments; contract nearing expiry |
| Student | beatrice.alvarez@student.jenacademia.local | IELTS records and submitted assignment |
| Student | danica.pope@student.jenacademia.local | Expired contract and graded assignment |

Full profiles and the other account addresses are in `SAMPLE_ACCOUNTS.txt`. Its age and expiry estimates are relative and may become stale; use the actual UI values.

## Suggested flow and script: 10–12 minutes

### 1. Introduction (45 seconds)

“Good day, panel. Our system supports the daily workflow of an English learning academy. We will follow a student from evaluation and teacher matching through lessons, assignments, classes, and contract monitoring. All records in this demonstration are fictional.”

### 2. Admin overview (1 minute)

Sign in as the admin. Show the dashboard, student and teacher lists, and the course catalogue.

“The admin has a central view of accounts and academic activity. Teacher profiles include courses, experience, specializations, teaching style, and availability. These details give the matching process information it can use.”

### 3. Teacher–student matching (3–4 minutes; main feature)

Open Create Student. Enter the demonstration profile:

- **Ava Reyes**, birthday **March 12, 2015** (11 on November 25, 2026); course **Conversational English**.
- Evaluation scores: speaking/pronunciation **1**, reading/comprehension **3**, structure **2**, sentence/grammar **3**, vocabulary **2**. The intended computed level is intermediate low; verify the UI.
- Learning goal **conversation**; focus **speaking**; learning style **conversational**; pace **balanced**. If available, add “public speaking nerves” under the custom focus field.
- Trial notes: “Very shy. Froze when asked to describe her weekend. Understands grammar well but will not speak unless she is asked directly by name.”
- Preferred schedule: **Saturday, 09:00–11:00**. Click **Analyze**.

“Here we enter the student’s course, evaluation, preferences, trial observations, and preferred schedule. The system compares the student with teachers who can teach the selected course. The recommendation includes reasons and a match-strength indication so the administrator can review the result.”

Point out the actual displayed results, comparing the following designed cases:

- **Maia Cruz** has a conversational profile and Saturday morning availability, but her profile says she does not teach children. If the UI displays her, explain how that affects the recommendation.
- **Rafael Santos** teaches young learners and has a Saturday morning window. Check his actual availability and recommendation in the displayed result.
- **Ben Martin** is available Saturday afternoon, which does not cover this morning preference.
- **Dario Lim** has a Saturday morning window, but seeded bookings overlap it. The matching look-ahead and current dates determine the result.

“The recommendation combines profile fit with practical constraints such as the course, age preference, availability, and workload. AI can help interpret information and order candidates; the application also applies its own rules. The administrator reviews the explanation and makes the decision.”

If the UI reports that AI is unavailable, say: “The AI service is currently unavailable, so the application shows its rule-based fallback and labels it accordingly.” Do not deliberately break a live API key during the presentation. Do not claim AI extracted a specific criterion unless the displayed result shows it.

### 4. Books and learning (1–2 minutes)

As admin, open Books and show **Confident Conversations** and **IELTS Speaking Practice**, including their lessons and distribution. Then switch to Carlos’s student account, if LINE setup is complete, and open the conversation book. The seed sets lesson 1 complete and lesson 2 in progress.

“Teachers and students can access learning materials by course. Here we can follow lesson progress, which gives a clearer picture of what the student has completed.”

### 5. Assignments and classes (2 minutes)

Show **Meeting Introductions** (pending), **Listening Reflection** (submitted), and **Reading Practice Review** (graded), using the relevant teacher or student account. Show the completed **IELTS Progress Review** and its teacher remark. Show the pending **Conversation Reschedule Demo** request, if available.

“Assignments move through submission and feedback, and class records preserve what happened during a lesson. A reschedule request records the proposed change for review; the original time remains until the request is approved.”

For the attendance review, explain that the demo has no fabricated proof files. Do not approve, submit, grade, or reschedule unless you are prepared to reset the scenario afterward.

### 6. Contracts and closing (1–2 minutes)

Return to admin Contracts. Compare Beatrice’s active package, Carlos’s approaching expiry, and Danica’s expired package. The precise dates and labels depend on when the data was seeded and the server clock. If Danica’s student account is linked, show her contract and extension request option.

“The system makes package status and remaining classes visible. When a contract expires with unused classes, a student can request an extension, which an admin can review.”

“To conclude, the system connects administration, learning activities, and teacher matching in one workflow. The matching result is explainable and remains subject to the administrator’s review.”

## Likely panel questions

**Does AI make the final decision?** The system may use AI advice to help rank or interpret candidates, while application rules and the administrator's choice remain part of the process. Show the actual result rather than promising a fixed ranking.

**What happens without AI?** The application can fall back to rules and indicates when the AI ranking was unavailable. Verify that behavior before claiming it on the day.

**What if no teacher fits well?** The interface can indicate a weaker match rather than presenting every result as strong. Rehearse a real example before showing it.

**Is availability a guarantee?** It reflects the saved availability, existing bookings and the system's matching horizon at the time of analysis. It is not a guarantee beyond the data checked.

**Is this real student data?** The accounts in this demo seed are fictional. Verify the rest of the database contains only material appropriate to show before projecting it.

## Recovery plan

- Matching takes too long or shows fallback: explain the label and use the saved screenshot of a successful run; do not claim a fresh AI result.
- Student screen asks for LINE: use a pre-linked test account, or show the admin/teacher view and the saved screenshot.
- Missing dates or scenario differs: check which database the app uses, when the seed ran, and teacher availability. Re-seed only the disposable database, and recheck afterward.
- Connection failure: use the screenshots and describe the demonstrated behavior honestly. Do not expose secrets, real personal data, or backend configuration on the projector.
