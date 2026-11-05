/**
 * Beta test data: the presentation accounts plus 5 teachers and 20 students.
 * The existing demo data stays unchanged for the presentation seeder.
 */
import {
  ALL_COURSES,
  STUDENTS as DEMO_STUDENTS,
  TEACHERS as DEMO_TEACHERS,
  validateDemoAccounts as validateDemoAccountsBase,
} from "./demo-accounts.mjs";

export * from "./demo-accounts.mjs";

const betaTeachers = [
  {
    key: "beta-teacher-01",
    email: "beta.teacher01@jenacademia.local",
    firstName: "Elena", lastName: "Navarro",
    birthDate: "1989-06-17",
    contact: "+63917 556 0101",
    teachesChildren: true,
    courses: ["Business English", "Job Interview", "Online English"],
    specialization: "business communication and interview preparation",
    teachingStyle: ["structured", "interactive"],
    idealStudentPace: ["balanced"],
    experienceYears: 8,
    notes: "Builds practical workplace communication skills through structured role-play.",
  },
  {
    key: "beta-teacher-02",
    email: "beta.teacher02@jenacademia.local",
    firstName: "Marco", lastName: "Villanueva",
    birthDate: "1991-02-11",
    contact: "+63917 556 0102",
    teachesChildren: true,
    courses: ["IELTS", "TOEIC", "News"],
    specialization: "IELTS, TOEIC and academic reading",
    teachingStyle: ["structured", "visual"],
    idealStudentPace: ["review-heavy"],
    experienceYears: 7,
    notes: "Prepares learners for exams with focused review plans and practice tests.",
  },
  {
    key: "beta-teacher-03",
    email: "beta.teacher03@jenacademia.local",
    firstName: "Sofia", lastName: "Garcia",
    birthDate: "1986-09-24",
    contact: "+63917 556 0103",
    teachesChildren: false,
    courses: ["Conversational English", "Travel English", "Online English"],
    specialization: "conversation, travel and pronunciation",
    teachingStyle: ["conversational", "interactive"],
    idealStudentPace: ["balanced", "fast"],
    experienceYears: 11,
    notes: "Helps adult learners speak naturally in everyday and travel situations.",
  },
  {
    key: "beta-teacher-04",
    email: "beta.teacher04@jenacademia.local",
    firstName: "Daniel", lastName: "Flores",
    birthDate: "1994-12-03",
    contact: "+63917 556 0104",
    teachesChildren: true,
    courses: ["OPIc", "Business English", "Conversational English"],
    specialization: "spoken English and OPIc preparation",
    teachingStyle: ["interactive", "conversational"],
    idealStudentPace: ["fast"],
    experienceYears: 5,
    notes: "Uses timed speaking prompts and feedback to build fluent answers.",
  },
  {
    key: "beta-teacher-05",
    email: "beta.teacher05@jenacademia.local",
    firstName: "Grace", lastName: "Tan",
    birthDate: "1983-04-29",
    contact: "+63917 556 0105",
    teachesChildren: true,
    courses: ["News", "Travel English", "IELTS", "TOEIC"],
    specialization: "reading comprehension and exam preparation",
    teachingStyle: ["structured", "visual"],
    idealStudentPace: ["slow", "review-heavy"],
    experienceYears: 14,
    notes: "Breaks down complex reading passages into manageable practice steps.",
  },
];

const studentProfiles = [
  {
    firstName: "Aiden", lastName: "Bautista", birthDate: "2001-01-19",
    course: "Business English", level: "intermediate-low", teacher: "beta-teacher-01",
    notes: "Needs clearer, more confident updates for weekly team meetings.",
    criteria: { learningGoal: ["business"], focusArea: ["speaking"], learningStyle: ["interactive"], pace: ["balanced"] },
  },
  {
    firstName: "Bianca", lastName: "Castillo", birthDate: "1998-08-06",
    course: "IELTS", level: "intermediate-mid", teacher: "beta-teacher-02",
    notes: "Preparing for IELTS and wants to improve listening accuracy.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["listening"], learningStyle: ["structured"], pace: ["review-heavy"] },
  },
  {
    firstName: "Caleb", lastName: "Domingo", birthDate: "2003-03-27",
    course: "Conversational English", level: "novice-high", teacher: "beta-teacher-03",
    notes: "Wants to speak more comfortably with international colleagues.",
    criteria: { learningGoal: ["conversation"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["slow"] },
  },
  {
    firstName: "Diana", lastName: "Estrada", birthDate: "1995-10-12",
    course: "Job Interview", level: "advanced", teacher: "beta-teacher-01",
    notes: "Practicing concise answers for interviews in the technology sector.",
    criteria: { learningGoal: ["interview-readiness"], focusArea: ["speaking"], learningStyle: ["interactive"], pace: ["fast"] },
  },
  {
    firstName: "Ethan", lastName: "Fernandez", birthDate: "2000-05-04",
    course: "TOEIC", level: "intermediate-low", teacher: "beta-teacher-02",
    notes: "Would like a steady review plan for reading and vocabulary.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["reading"], learningStyle: ["structured"], pace: ["review-heavy"] },
  },
  {
    firstName: "Faith", lastName: "Gonzales", birthDate: "2007-11-21",
    course: "Online English", level: "novice-mid", teacher: "beta-teacher-04",
    notes: "Building confidence with everyday questions and short answers.",
    criteria: { learningGoal: ["confidence"], focusArea: ["speaking"], learningStyle: ["visual"], pace: ["slow"] },
  },
  {
    firstName: "Gabriel", lastName: "Hernandez", birthDate: "1997-07-15",
    course: "Travel English", level: "intermediate-mid", teacher: "beta-teacher-03",
    notes: "Traveling soon and wants to practice airport and hotel conversations.",
    criteria: { learningGoal: ["travel"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["balanced"] },
  },
  {
    firstName: "Hannah", lastName: "Ilagan", birthDate: "2002-02-08",
    course: "OPIc", level: "intermediate-high", teacher: "beta-teacher-04",
    notes: "Practicing organized responses for the OPIc speaking test.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["speaking"], learningStyle: ["interactive"], pace: ["fast"] },
  },
  {
    firstName: "Isaac", lastName: "Jimenez", birthDate: "1999-09-30",
    course: "News", level: "advanced", teacher: "beta-teacher-05",
    notes: "Wants to discuss current events with more precise vocabulary.",
    criteria: { learningGoal: ["conversation"], focusArea: ["vocabulary"], learningStyle: ["structured"], pace: ["balanced"] },
  },
  {
    firstName: "Jasmine", lastName: "King", birthDate: "2005-04-13",
    course: "Conversational English", level: "novice-high", teacher: "santos",
    notes: "Needs patient speaking practice and a wider everyday vocabulary.",
    criteria: { learningGoal: ["confidence"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["slow"] },
  },
  {
    firstName: "Kevin", lastName: "Lopez", birthDate: "1993-06-01",
    course: "Business English", level: "intermediate-mid", teacher: "beta-teacher-01",
    notes: "Preparing to lead client calls and present project updates.",
    criteria: { learningGoal: ["business"], focusArea: ["speaking"], learningStyle: ["interactive"], pace: ["fast"] },
  },
  {
    firstName: "Lara", lastName: "Mendoza", birthDate: "2004-12-17",
    course: "IELTS", level: "intermediate-low", teacher: "beta-teacher-02",
    notes: "Working toward a target score with extra reading and listening practice.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["reading", "listening"], learningStyle: ["structured"], pace: ["review-heavy"] },
  },
  {
    firstName: "Miguel", lastName: "Natividad", birthDate: "1996-03-09",
    course: "Travel English", level: "intermediate-low", teacher: "beta-teacher-03",
    notes: "Wants to handle common travel questions without translating first.",
    criteria: { learningGoal: ["travel"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["balanced"] },
  },
  {
    firstName: "Nina", lastName: "Ocampo", birthDate: "2001-08-23",
    course: "Job Interview", level: "intermediate-high", teacher: "beta-teacher-01",
    notes: "Practicing confident introductions and behavioral interview answers.",
    criteria: { learningGoal: ["interview-readiness"], focusArea: ["speaking"], learningStyle: ["interactive"], pace: ["balanced"] },
  },
  {
    firstName: "Oliver", lastName: "Perez", birthDate: "2006-01-05",
    course: "TOEIC", level: "novice-high", teacher: "beta-teacher-02",
    notes: "Needs help building a reliable foundation for TOEIC vocabulary.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["vocabulary"], learningStyle: ["visual"], pace: ["slow"] },
  },
  {
    firstName: "Paula", lastName: "Quizon", birthDate: "1990-11-14",
    course: "News", level: "intermediate-mid", teacher: "beta-teacher-05",
    notes: "Enjoys reading articles and wants to explain opinions more clearly.",
    criteria: { learningGoal: ["conversation"], focusArea: ["reading"], learningStyle: ["structured"], pace: ["balanced"] },
  },
  {
    firstName: "Quentin", lastName: "Ramos", birthDate: "2003-05-28",
    course: "Online English", level: "intermediate-low", teacher: "beta-teacher-04",
    notes: "Wants more natural pronunciation in remote team conversations.",
    criteria: { learningGoal: ["business"], focusArea: ["speaking"], learningStyle: ["interactive"], pace: ["fast"] },
  },
  {
    firstName: "Rina", lastName: "Soriano", birthDate: "1998-02-26",
    course: "OPIc", level: "intermediate-mid", teacher: "beta-teacher-04",
    notes: "Would like regular timed speaking drills before an OPIc test.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["review-heavy"] },
  },
  {
    firstName: "Samuel", lastName: "Torres", birthDate: "2005-09-02",
    course: "Conversational English", level: "novice-mid", teacher: "beta-teacher-03",
    notes: "Learning basic conversation for an upcoming exchange program.",
    criteria: { learningGoal: ["confidence"], focusArea: ["speaking"], learningStyle: ["visual"], pace: ["slow"] },
  },
  {
    firstName: "Tessa", lastName: "Uy", birthDate: "1994-04-07",
    course: "IELTS", level: "advanced", teacher: "beta-teacher-05",
    notes: "Refining academic reading strategies and vocabulary for a higher score.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["reading", "vocabulary"], learningStyle: ["structured"], pace: ["review-heavy"] },
  },
].map((profile, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    key: `beta-student-${number}`,
    email: `beta.student${number}@student.jenacademia.local`,
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate: profile.birthDate,
    contact: `+63917 557 ${String(index + 1).padStart(4, "0")}`,
    course: profile.course,
    level: profile.level,
    teacher: profile.teacher,
    totalClasses: [10, 15, 20][index % 3],
    classesUsed: index % 4,
    classDuration: 50,
    createdDaysAgo: (index * 7) % 46,
    notes: profile.notes,
    criteria: profile.criteria,
  };
});

export const TEACHERS = [...DEMO_TEACHERS, ...betaTeachers];
export const STUDENTS = [...DEMO_STUDENTS, ...studentProfiles];

export function validateDemoAccounts() {
  const problems = validateDemoAccountsBase();
  const allAccounts = [...TEACHERS, ...STUDENTS];
  const allKeys = new Set();
  const allEmails = new Set();

  for (const account of allAccounts) {
    if (allKeys.has(account.key)) problems.push(`duplicate account key "${account.key}"`);
    allKeys.add(account.key);
    if (allEmails.has(account.email)) problems.push(`duplicate account email "${account.email}"`);
    allEmails.add(account.email);
  }

  const teacherKeys = new Set(TEACHERS.map((teacher) => teacher.key));
  for (const teacher of betaTeachers) {
    for (const course of teacher.courses) {
      if (!ALL_COURSES.includes(course)) {
        problems.push(`teacher "${teacher.key}" references unknown course "${course}"`);
      }
    }
  }
  for (const student of studentProfiles) {
    if (!teacherKeys.has(student.teacher)) {
      problems.push(`student "${student.key}" is assigned to unknown teacher "${student.teacher}"`);
    }
    if (!ALL_COURSES.includes(student.course)) {
      problems.push(`student "${student.key}" references unknown course "${student.course}"`);
    }
  }

  return problems;
}
