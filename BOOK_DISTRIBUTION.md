# Admin-Owned Book Library

Books used to be created by teachers, which meant `books.teacher_id` recorded
both who owned a book and which teacher's students could see it. That coupled
content creation to content ownership, so a book could only ever belong to one
teacher.

Now the **admin owns the library**. They add books, decide which teachers get
them, and maintain the lessons. Teachers are read-only consumers of whatever
they are handed.

## Model

| Role   | Add book | Distribute | Edit book | Archive/Delete | Lessons | Student progress |
|--------|----------|------------|-----------|----------------|---------|------------------|
| Admin  | ✅       | ✅         | ✅        | ✅             | ✅      | ✅               |
| Teacher| ❌       | ❌         | ❌        | ❌             | ❌      | ✅ (read-only)   |
| Student| ❌       | ❌         | ❌        | ❌             | ❌      | ❌               |

A book can be distributed to **many teachers at once**. Each of those teachers'
students see it for the matching course.

## Database

New table `book_teachers`:

```sql
CREATE TABLE `book_teachers` (
  `book_id`     int NOT NULL,
  `teacher_id`  int NOT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `assigned_by` int DEFAULT NULL,
  PRIMARY KEY (`book_id`,`teacher_id`),
  KEY `idx_book_teachers_teacher` (`teacher_id`),
  KEY `idx_book_teachers_teacher_assigned` (`teacher_id`,`assigned_at`),
  CONSTRAINT `book_teachers_book_fk`      FOREIGN KEY (`book_id`)    REFERENCES `books` (`book_id`) ON DELETE CASCADE,
  CONSTRAINT `book_teachers_teacher_fk`   FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `book_teachers_assigner_fk`  FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
);
```

`ensureBookTeachersTable()` in `server.js` creates it on boot and backfills any
pre-migration book from its old `books.teacher_id`, so nothing a teacher could
already see disappears when the rule changes. It is idempotent - safe to run on
every start.

`books.teacher_id` is left in place (nullable) purely for backwards
compatibility. New books leave it `NULL`; nothing reads it for access decisions
any more.

## Access control

Two gates replaced the old `validateTeacherBookOwnership` / `isTeacherBookOwner`:

- **`requireAdmin(res, adminId, bookId?)`** — every write. Checks the caller is
  an `active` admin, and optionally that the book exists.
- **`validateBookReadAccess(res, bookId, adminId, teacherId)`** — reads. The
  admin may read anything; a teacher only books present in `book_teachers`.

Students go through `canStudentAccessBook` / `canStudentAccessLesson`, which now
join through `book_teachers` instead of `books.teacher_id`.

The admin ID is read from `admin_id` (query param > body > `x-admin-id` header),
matching the existing `teacher_id` convention.

## Endpoints

| Endpoint | Method | Access |
|----------|--------|--------|
| `/api/books` | GET | `admin_id` → whole library; `teacher_id` → distributed to them; `student_id` → their teacher's; `course_id` → that course |
| `/api/books/:book_id` | GET | admin, or assigned teacher, or the student |
| `/api/books` | POST | **admin** — accepts `teacher_ids` (JSON array or CSV) |
| `/api/books/:book_id` | PUT | **admin** — title / description / author / cover |
| `/api/books/:book_id/teachers` | PUT | **admin** — replaces the teacher set wholesale |
| `/api/books/:book_id` | DELETE | **admin** |
| `/api/books/:book_id/archive` | PUT | **admin** |
| `/api/books/:book_id/restore` | PUT | **admin** |
| `/api/admin/books` | GET | **admin** — includes archived; `status=active\|archived\|all` |
| `/api/teacher/books` | GET | teacher — distributed to them only |
| `/api/lessons` | GET | student, assigned teacher, or admin |
| `/api/lessons/:lesson_id` | GET | student, assigned teacher, or admin |
| `/api/lessons` | POST | **admin** |
| `/api/lessons/:lesson_id` | PUT | **admin** |
| `/api/lessons/:lesson_id` | DELETE | **admin** |
| `/api/teacher/book/:bookId/progress` | GET | assigned teacher or admin |

Book lists return `course_name`, `teacher_names`, `teacher_ids`, `author` and
`lesson_count`. The teacher roll-up and lesson count are correlated subqueries,
not joins, so they can't multiply each other.

## Frontend

| Route | Page | Purpose |
|-------|------|---------|
| `/AdminDashboard?tab=books` | `AdminDashboard.jsx` | Book library: add, edit, distribute, archive, delete |
| `/adminBooksContent/:bookId` | `BooksContent mode="admin"` | Admin lesson management + cover + progress |
| `/teacherBooksLessons` | `teacherBooksLessons.jsx` | Read-only list of assigned books |
| `/teacherBooksLessons/:bookId` | `BooksContent mode="teacher"` | Read-only lessons + student progress |
| `/booksLessons` | `booksLessons.jsx` | Student list (unchanged behaviour) |

`BooksContent` now takes three modes. `isAdminView` gates every write control;
`isStudentView` gates progress tracking and lesson locking. `isTeacherView` is
now purely a read view.

## Notifications

- On create/distribute: the newly added teachers are notified, plus each of
  their students in that course.
- On a new lesson: only the students of teachers who actually hold the book.
- On course completion: every teacher holding the book.

## Testing

1. Start the backend; the `book_teachers` migration runs on boot.
2. As **admin**, open Books / Lessons and add a book with a cover, picking two
   teachers.
3. Confirm both teachers get the book and both teachers' students see it.
4. Confirm a **teacher** cannot see "Create New Book", "Edit Cover", "Archive"
   or "+ Upload Lesson" anywhere.
5. Confirm `POST /api/books` without `admin_id` returns 401, and with a
   teacher's ID returns 403.
6. Re-distribute a book with one teacher removed and confirm their access to the
   book and its lessons is revoked immediately.