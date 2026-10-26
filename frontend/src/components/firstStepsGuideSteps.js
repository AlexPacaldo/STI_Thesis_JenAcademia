/**
 * The words and the stage directions for the welcome guide.
 *
 * !! Content and presentation are separate on purpose. This file says WHAT a
 * !! step means; GuidePreview.jsx says WHAT IT LOOKS LIKE. Adding a step should
 * !! only ever need a new entry here, as long as its `preview.scene` is one the
 * !! preview already knows how to draw.
 *
 * Each step carries three things beyond its copy:
 *   - `preview.scene`     which little app screen to draw on the right,
 *   - `preview.focus`     which single part of that screen to spotlight,
 *   - `preview.example`   one real situation, shown as a before/after story.
 *
 * The copy is deliberately short and in plain language: this is read by
 * teachers between classes and by children on a phone.
 */

export function getGuideSteps(role) {
  if (role === "teacher") return TEACHER_STEPS;
  return STUDENT_STEPS;
}

const TEACHER_STEPS = [
  {
    id: "home",
    icon: "👋",
    title: "Hello, teacher!",
    module: "Home",
    text: "Home is your starting place. It shows the classes you have today, then two shortcuts.",
    points: [
      "See every class you have today, in order.",
      "Use the menu on the left to open Calendar, students, assignments, and books.",
      "Come back to Home whenever you want to start again.",
    ],
    preview: {
      scene: "home",
      focus: "today",
      highlight: {
        title: "Classes today",
        text: "Each card is one class today: the student and the subject. Tap a card to open that day in your calendar.",
      },
      example: {
        emoji: "🌤️",
        title: "A quick check before teaching",
        body: "It is 3:50 PM and your first class starts in ten minutes. You open Home instead of searching through the calendar.",
        flow: [
          { label: "Right now", value: "Emma · 4:00 PM", meta: "English · 50 min" },
          { label: "After that", value: "Liam · 6:30 PM", meta: "Reading · 50 min", tone: "new" },
        ],
        outcome: "You know exactly who is next and when to start.",
      },
    },
  },
  {
    id: "availability",
    icon: "🗓️",
    title: "Set your teaching times",
    module: "Calendar",
    text: "Tell the calendar when you are free to teach. Students can only book inside these hours.",
    points: [
      "Open Calendar and choose Set Availability.",
      "Pick a day, then choose the time you can start and finish.",
      "If you take a break, add it so nobody books that gap.",
      "Press Save Availability. Your free times turn green on the calendar.",
    ],
    preview: {
      scene: "availability",
      focus: "save",
      highlight: {
        title: "Save Availability",
        text: "Nothing is saved until you press this button. After that, students see only the hours you chose.",
      },
      example: {
        emoji: "☕",
        title: "Your Tuesday teaching hours",
        body: "You are free after school on Tuesdays, but you stop for a snack at 5:30.",
        flow: [
          { label: "Day", value: "Tuesday", meta: "every week" },
          { label: "Free", value: "4:00 – 7:00 PM", meta: "break at 5:30", tone: "new" },
        ],
        outcome: "Students can book 4:00, 4:30, 5:00, 6:00 and 6:30 — never during your break.",
      },
    },
    action: "Open Calendar",
    path: "/Calendar",
  },
  {
    id: "reschedule",
    icon: "🔁",
    title: "Change a class time",
    module: "Calendar",
    text: "Use the calendar when you or a student needs a different class time.",
    points: [
      "Open Calendar and choose the class you need to move.",
      "Choose Request for Reschedule.",
      "Pick a free day and time. Add a short reason.",
      "Check the new time, then send the request.",
      "The class only moves when the other person says yes.",
    ],
    preview: {
      scene: "reschedule",
      focus: "reschedule",
      highlight: {
        title: "Request for Reschedule",
        text: "This opens the request form. The class stays where it is until the other person approves the new time.",
      },
      example: {
        emoji: "🏫",
        title: "Emma’s class needs a new time",
        body: "Emma has a school event on Tuesday. You find a free slot on Thursday and send the request.",
        flow: [
          { label: "Before", value: "Tue, 2 Jun · 4:00 PM", meta: "English with Emma", tone: "old" },
          { label: "Requested", value: "Thu, 4 Jun · 5:00 PM", meta: "waiting for Emma", tone: "new" },
        ],
        outcome: "The old time stays on the calendar until Emma taps Approve.",
      },
    },
    action: "Open Calendar",
    path: "/Calendar",
  },
  {
    id: "students",
    icon: "🧒",
    title: "Find your students",
    module: "My students",
    text: "My students is your list of everyone you teach.",
    points: [
      "Find a student by scrolling or using the search box.",
      "Read each student’s course, package, and classes left.",
      "Use the same list in Remarks and Assignments.",
    ],
    preview: {
      scene: "students",
      focus: "student",
      highlight: {
        title: "Student row",
        text: "Each row is one student: their course, their package, and how many classes are left.",
      },
      example: {
        emoji: "🔎",
        title: "Finding one student quickly",
        body: "You need Emma’s next class time before your lesson starts.",
        flow: [
          { label: "Search", value: "Type “Em”", meta: "the list filters as you type" },
          { label: "Open", value: "Emma Santos", meta: "next class: Tue 4:00 PM", tone: "new" },
        ],
        outcome: "No scrolling through the whole list.",
      },
    },
    action: "See my students",
    path: "/teacherStudents",
  },
  {
    id: "history",
    icon: "🕰️",
    title: "Look at class history",
    module: "Class history",
    text: "Class history shows classes that have already happened.",
    points: [
      "Open Class history from the menu.",
      "Look through the list or search for a student.",
      "Check the status, the summary, and the recording proof.",
    ],
    preview: {
      scene: "history",
      focus: "row",
      highlight: {
        title: "Past class",
        text: "Each card is one finished class: when it was, who came, and the proof that it happened.",
      },
      example: {
        emoji: "📝",
        title: "Remembering last week’s lesson",
        body: "Before Emma’s next class, you check what you covered last time.",
        flow: [
          { label: "Open", value: "Tue, 27 May", meta: "English with Emma" },
          { label: "Read", value: "“Great progress on past tense.”", meta: "your class note", tone: "new" },
        ],
        outcome: "You pick up exactly where you stopped.",
      },
    },
    action: "Open class history",
    path: "/teacherClassHistory",
  },
  {
    id: "reviews",
    icon: "⭐",
    title: "Review a student’s progress",
    module: "Contract reviews",
    text: "Contract reviews close a finished contract. You score five skills and the level is worked out for you.",
    points: [
      "Open Contract reviews and choose the review waiting for you.",
      "Give each skill a score from 1 to 5.",
      "Write a short, helpful note.",
      "Check the level, then submit. It cannot be changed after that.",
    ],
    preview: {
      scene: "reviews",
      focus: "scores",
      highlight: {
        title: "Skill scores",
        text: "Score each skill on its own. JEN Academia adds them up and shows the level — nobody picks the level by hand.",
      },
      example: {
        emoji: "🎓",
        title: "Closing Emma’s contract",
        body: "Emma has finished all her classes. You score what you actually saw in class.",
        flow: [
          { label: "Scores", value: "4 · 4 · 3 · 4 · 5", meta: "five skills" },
          { label: "Result", value: "Level computed", meta: "shown before you submit", tone: "new" },
        ],
        outcome: "One fair review, saved for Emma and the admin team.",
      },
    },
    action: "Open contract reviews",
    path: "/ContractReview",
  },
  {
    id: "remarks",
    icon: "💬",
    title: "Leave a remark",
    module: "Calendar",
    text: "A class note tells the student what you noticed. You write it in the class panel.",
    points: [
      "Open Calendar and choose the class you just taught.",
      "After you start the class and the student confirms attendance, you can write a remark in the class panel.",
      "Submitting a remark is optional. You can still complete the class without one.",
    ],
    preview: {
      scene: "classNote",
      focus: "note",
      highlight: {
        title: "Your note",
        text: "Write what the student did well and what to practise next. Keep it short and encouraging.",
      },
      example: {
        emoji: "💚",
        title: "A note after Tuesday’s class",
        body: "Emma finally used the past tense without help. You want her to remember that.",
        flow: [
          { label: "Class", value: "English with Emma", meta: "Tue, 27 May · 4:00 PM" },
          { label: "Note", value: "“You used past tense all by yourself today!”", meta: "saved on this class", tone: "new" },
        ],
        outcome: "The note is saved, and you can complete the class.",
      },
    },
    action: "Open Calendar",
    path: "/Calendar",
  },
  {
    id: "assignments",
    icon: "✏️",
    title: "Give and check assignments",
    module: "Assignments",
    text: "Use Assignments to give work and read what students send back.",
    points: [
      "Choose a student, then open Assign Task.",
      "Write the instructions. Add a file or due date if you need one.",
      "Check the details and post the task.",
      "Open View submissions to read the student’s answer.",
      "Use Manage Assignments to check or change posted work.",
    ],
    preview: {
      scene: "assignments",
      focus: "assign",
      highlight: {
        title: "Create Assignment",
        text: "Write the instructions, add a due date or a file, then press this to give the task to the student.",
      },
      example: {
        emoji: "📚",
        title: "One task, sent to Emma",
        body: "You want Emma to practise reading before Friday.",
        flow: [
          { label: "Assign", value: "“Read pages 12–14”", meta: "due Friday · 5:00 PM" },
          { label: "Check", value: "View submissions", meta: "Emma’s answer arrives here", tone: "new" },
        ],
        outcome: "You always know who has sent their work and who has not.",
      },
    },
    action: "Open assignments",
    path: "/teacherAssignment",
  },
  {
    id: "books",
    icon: "📚",
    title: "Open your books",
    module: "My books",
    text: "My books has the lesson books shared with you.",
    points: [
      "Open My books and choose a book.",
      "Choose a lesson to open its file.",
      "Use the progress view to see how far each student has got.",
    ],
    preview: {
      scene: "books",
      focus: "progress",
      highlight: {
        title: "Your books",
        text: "Each card is a book the admin shared with you. Open it to read the lessons and see how far a student has got.",
      },
      example: {
        emoji: "📖",
        title: "Checking Emma’s reading",
        body: "Emma has finished three of the five lessons in her book.",
        flow: [
          { label: "Book", value: "English Adventures 2", meta: "5 lessons" },
          { label: "Progress", value: "3 of 5 lessons", meta: "60% complete", tone: "new" },
        ],
        outcome: "You know she is ready for lesson 4.",
      },
    },
    action: "Open My books",
    path: "/teacherBooksLessons",
  },
];

const STUDENT_STEPS = [
  {
    id: "home",
    icon: "👋",
    title: "Hello, learner!",
    module: "Home",
    text: "Home is your starting place. It shows what is happening today.",
    points: [
      "See your classes for today, in order.",
      "Use the menu to open Calendar, assignments, remarks, and books.",
      "Come back to Home whenever you want to start again.",
    ],
    preview: {
      scene: "home",
      focus: "today",
      highlight: {
        title: "My classes today",
        text: "Each card is a class you have today: the subject and your teacher. Tap it to see the time in your calendar.",
      },
      example: {
        emoji: "⏰",
        title: "Getting ready for class",
        body: "It is 3:50 PM. You open Home to check where your next class is.",
        flow: [
          { label: "Right now", value: "English · 4:00 PM", meta: "with Ms. Ana" },
          { label: "After that", value: "Reading · 6:30 PM", meta: "with Mr. Lee", tone: "new" },
        ],
        outcome: "You never miss a class because you always know where to look.",
      },
    },
  },
  {
    id: "booking",
    icon: "🗓️",
    title: "Book a class",
    module: "Calendar",
    text: "Pick one day and one time with your teacher.",
    points: [
      "Open Calendar and tap Book a class.",
      "Choose a day, then choose a time your teacher is free.",
      "Check the teacher, day, and time.",
      "Tap Book it to send your booking.",
    ],
    preview: {
      scene: "booking",
      focus: "book",
      highlight: {
        title: "Green days are free",
        text: "Green days are the days your teacher can teach. Pick one, then pick a time, then press Book it.",
      },
      example: {
        emoji: "🎒",
        title: "Booking after school",
        body: "You want a class on Tuesday. Your teacher is free at 4:00 and 4:30.",
        flow: [
          { label: "Pick", value: "Tue, 2 Jun", meta: "green means your teacher is free" },
          { label: "Book", value: "4:30 PM", meta: "English with Ms. Ana", tone: "new" },
        ],
        outcome: "The class appears on your calendar and your teacher is told.",
      },
    },
    action: "Open Calendar",
    path: "/Calendar",
  },
  {
    id: "reschedule",
    icon: "🔁",
    title: "Ask to change a class",
    module: "Calendar",
    text: "If you cannot come, ask your teacher for a new time.",
    points: [
      "Open Calendar and choose your class.",
      "Tap Change the time.",
      "Choose a free new day and time. Tell your teacher why.",
      "Check the new time and send your request.",
      "Your teacher must say yes before the class time changes.",
    ],
    preview: {
      scene: "reschedule",
      focus: "reschedule",
      highlight: {
        title: "Change the time",
        text: "This starts your request. Your old time stays on the calendar until your teacher approves the new one.",
      },
      example: {
        emoji: "⚽",
        title: "You have a football game",
        body: "Your match is on Tuesday at the same time as your English class.",
        flow: [
          { label: "Before", value: "Tue, 2 Jun · 4:00 PM", meta: "English with Ms. Ana", tone: "old" },
          { label: "Requested", value: "Thu, 4 Jun · 5:00 PM", meta: "waiting for Ms. Ana", tone: "new" },
        ],
        outcome: "If your teacher says yes, the class moves. If not, your old time stays.",
      },
    },
    action: "Open Calendar",
    path: "/Calendar",
  },
  {
    id: "history",
    icon: "🕰️",
    title: "Look at class history",
    module: "Class history",
    text: "Class history shows classes you have already had.",
    points: [
      "Open Class history from the menu.",
      "Look through your past classes, newest first.",
      "Tap a class to watch it again.",
    ],
    preview: {
      scene: "history",
      focus: "row",
      highlight: {
        title: "A past class",
        text: "Each card is one class you had: when it was, how long, and what you did together.",
      },
      example: {
        emoji: "🗂️",
        title: "Finding last week’s class",
        body: "You want to check when you learned about animals in English.",
        flow: [
          { label: "Open", value: "Tue, 27 May", meta: "English with Ms. Ana" },
          { label: "Read", value: "“Animals and colours”", meta: "class details", tone: "new" },
        ],
        outcome: "You can look back at everything you have learned.",
      },
    },
    action: "Open class history",
    path: "/classHistory",
  },
  {
    id: "reviews",
    icon: "⭐",
    title: "Share a contract review",
    module: "Contract reviews",
    text: "When a contract is finished, you rate your classes.",
    points: [
      "Open Contract reviews.",
      "Choose the review waiting for you.",
      "Give each question a score from 1 to 5.",
      "Add a note if you want, check it, then submit.",
    ],
    preview: {
      scene: "reviews",
      focus: "scores",
      highlight: {
        title: "Your ratings",
        text: "Tap a number from 1 to 5 for each question. Five means your teacher was brilliant at it.",
      },
      example: {
        emoji: "🌟",
        title: "Rating Ms. Ana’s classes",
        body: "You finished all your classes. Now you can say what helped you most.",
        flow: [
          { label: "Scores", value: "5 · 5 · 4", meta: "one row per question" },
          { label: "Result", value: "Average shown", meta: "before you send it", tone: "new" },
        ],
        outcome: "Your review is private. Only you and the admin team can see it.",
      },
    },
    action: "Open contract reviews",
    path: "/ContractReview",
  },
  {
    id: "assignments",
    icon: "✏️",
    title: "Do your assignments",
    module: "Assignments",
    text: "Assignments shows the work your teacher gave you.",
    points: [
      "Open Assignments and choose a task.",
      "Read the instructions and due date.",
      "Write your answer or add your file.",
      "Check it, then tap Submit.",
      "If editing is allowed, open the task again and choose Edit.",
    ],
    preview: {
      scene: "assignments",
      focus: "open",
      highlight: {
        title: "Open",
        text: "Open a task to read the instructions, write your answer, and send it back to your teacher.",
      },
      example: {
        emoji: "✅",
        title: "Reading homework for Friday",
        body: "Your teacher asked you to read pages 12–14 and answer one question.",
        flow: [
          { label: "Task", value: "Reading practice", meta: "due Friday" },
          { label: "Done", value: "Submitted", meta: "your teacher can see it", tone: "new" },
        ],
        outcome: "Your work is saved and your teacher knows it is finished.",
      },
    },
    action: "Open assignments",
    path: "/assignments",
  },
  {
    id: "remarks",
    icon: "💬",
    title: "Read your remarks",
    module: "Remarks",
    text: "Remarks are notes your teacher has shared with you.",
    points: [
      "Open Remarks from the menu.",
      "Read the notes your teacher wrote, newest first.",
      "Use them to remember what you did well and what to practise.",
    ],
    preview: {
      scene: "remarks",
      focus: "note",
      highlight: {
        title: "Your teacher’s note",
        text: "These are kind notes from after class. Read them before your next lesson.",
      },
      example: {
        emoji: "🌱",
        title: "A note after Tuesday’s class",
        body: "Your teacher noticed something you did all by yourself.",
        flow: [
          { label: "Note", value: "Tue, 27 May", meta: "from Ms. Ana" },
          { label: "Try next", value: "Past tense", meta: "practise a little", tone: "new" },
        ],
        outcome: "Small steps add up. Read one note before each class.",
      },
    },
    action: "Open remarks",
    path: "/remarks",
  },
  {
    id: "books",
    icon: "📚",
    title: "Read a lesson",
    module: "Books/Lessons",
    text: "Open Books/Lessons to find your books and lessons.",
    points: [
      "Choose a book to open it.",
      "Choose the lesson you are ready to read.",
      "Read the file. Your place is saved if you leave.",
      "When you reach the bottom, tap Mark as Complete.",
      "Finishing a lesson opens the next one.",
    ],
    preview: {
      scene: "books",
      focus: "complete",
      highlight: {
        title: "Mark as Complete",
        text: "Tap this when you finish a lesson. It saves your place and opens the next lesson.",
      },
      example: {
        emoji: "🚀",
        title: "Finishing lesson 3",
        body: "You have read the whole lesson and answered the last question.",
        flow: [
          { label: "Reading", value: "Lesson 3", meta: "page 14 of 14" },
          { label: "Finished", value: "Lesson 4 unlocked", meta: "progress saved", tone: "new" },
        ],
        outcome: "Your progress is saved, even if you close the app.",
      },
    },
    action: "Open Books/Lessons",
    path: "/booksLessons",
  },
];
