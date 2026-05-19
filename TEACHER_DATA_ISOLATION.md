# Teacher Data Isolation Implementation

## Overview
This document describes the implementation of **teacher data isolation** for the Jen Academia platform. Teachers can now only see and manage books/lessons they personally uploaded. Unauthorized access attempts return a **403 Forbidden** error.

---

## Security Implementation

### 1. Helper Functions Added

#### `getTeacherIdFromRequest(req)`
Extracts the teacher ID from the HTTP request with fallback priority:
1. Query parameter: `?teacher_id=123`
2. Request body: `{ teacher_id: 123 }`
3. Header: `X-Teacher-ID: 123`

#### `isTeacherBookOwner(bookId, teacherId)`
Checks if a teacher owns a specific book.

#### `validateTeacherBookOwnership(res, bookId, teacherId)`
Validates teacher book ownership. Responds with:
- **401 Unauthorized**: If teacher_id not provided
- **404 Not Found**: If book doesn't exist
- **403 Forbidden**: If teacher doesn't own the book
- **true**: If authorized

#### `validateTeacherLessonOwnership(res, lessonId, teacherId)`
Validates teacher lesson ownership (via book ownership). Responds with similar status codes as above.

---

## Secured Endpoints

### Books Endpoints

#### `GET /api/teacher/books`
**Security**: Only returns books owned by the requesting teacher.

**Required Parameters**:
- `teacher_id` (query parameter, body, or header)

**Response**:
```javascript
{
  "books": [
    {
      "book_id": 1,
      "teacher_id": 5,
      "course_id": 1,
      "title": "Math 101",
      "description": "...",
      "cover_url": "...",
      "lesson_count": 12,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

**Error Responses**:
- 401: `{ "message": "Unauthorized: teacher_id is required" }`
- 500: Database errors

---

#### `GET /api/books/:book_id`
**Security**: 
- If `teacher_id` param provided: validates teacher ownership
- If `student_id` param provided: validates student's assigned teacher

**Query Parameters**:
- `teacher_id` OR `student_id` (at least one required for validation)

**Response**:
```javascript
{
  "book": {
    "book_id": 1,
    "teacher_id": 5,
    "course_id": 1,
    "title": "Math 101",
    "lesson_count": 12,
    ...
  }
}
```

**Error Responses**:
- 401: Unauthorized (no teacher_id)
- 403: `{ "message": "Forbidden: You do not have permission to access this book..." }`
- 404: Book not found

---

#### `PUT /api/books/:book_id`
**Security**: Only the teacher who uploaded the book can update it.

**Request Body** (required):
```javascript
{
  "title": "New Title",           // optional
  "description": "New Desc",      // optional
  "teacher_id": 5,                // REQUIRED for ownership check
  "cover": [file upload]          // optional
}
```

**Response**:
```javascript
{ "message": "Book updated successfully" }
```

**Error Responses**:
- 401: Unauthorized (no teacher_id)
- 403: Forbidden (doesn't own book)
- 404: Book not found
- 400: No update fields provided

---

#### `DELETE /api/books/:book_id`
**Security**: Only the teacher who uploaded the book can delete it.
- Cascades delete: lessons → lesson_progress

**Required Parameters**:
- `teacher_id` (query, body, or header)

**Response**:
```javascript
{ "message": "Book deleted successfully" }
```

**Error Responses**:
- 401: Unauthorized (no teacher_id)
- 403: Forbidden (doesn't own book)
- 404: Book not found

---

#### `POST /api/books`
**Security**: Teacher_id is required and used to track ownership.

**Request Body** (all required):
```javascript
{
  "title": "Math 101",        // required
  "description": "...",       // required
  "course_id": 1,             // required
  "teacher_id": 5,            // required - tracked for ownership
  "cover": [file upload]      // optional
}
```

**Response**:
```javascript
{
  "message": "Book created successfully",
  "book_id": 123,
  "cover_url": "/uploads/books/..."
}
```

---

### Lessons Endpoints

#### `POST /api/lessons`
**Security**: Only the teacher who owns the book can create lessons.

**Request Body**:
```javascript
{
  "book_id": 1,              // required - book must belong to teacher
  "lesson_number": 1,        // required
  "title": "Lesson 1",       // required
  "content": "...",          // optional
  "order_number": 1,         // optional
  "is_published": 1,         // optional
  "teacher_id": 5,           // REQUIRED for ownership check
  "file": [file upload]      // optional
}
```

**Error Responses**:
- 401: Unauthorized (no teacher_id)
- 403: Forbidden (doesn't own book)
- 404: Book not found

---

#### `PUT /api/lessons/:lesson_id`
**Security**: Only the teacher who owns the containing book can update.

**Request Body**:
```javascript
{
  "lesson_number": 1,        // optional
  "title": "Lesson 1",       // optional
  "content": "...",          // optional
  "order_number": 1,         // optional
  "is_published": 1,         // optional
  "teacher_id": 5,           // REQUIRED for ownership check
  "file": [file upload]      // optional
}
```

**Error Responses**:
- 401: Unauthorized (no teacher_id)
- 403: Forbidden (lesson belongs to another teacher's book)
- 404: Lesson not found

---

#### `DELETE /api/lessons/:lesson_id`
**Security**: Only the teacher who owns the book can delete lessons.

**Required Parameters**:
- `teacher_id` (query, body, or header)

**Error Responses**:
- 401: Unauthorized (no teacher_id)
- 403: Forbidden (lesson belongs to another teacher's book)
- 404: Lesson not found

---

## Frontend Updates Required

### Update API Calls to Include teacher_id

**Before** (Vulnerable):
```javascript
fetch(`http://localhost:3001/api/teacher/books?teacher_id=${teacherId}`)
```

**After** (All these methods work):
```javascript
// Method 1: Query parameter (recommended for GET)
fetch(`http://localhost:3001/api/teacher/books?teacher_id=${teacherId}`)

// Method 2: Request body (recommended for POST/PUT)
fetch('http://localhost:3001/api/books', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: '...',
    course_id: 1,
    teacher_id: loggedInTeacherId,  // Add this
    description: '...'
  })
})

// Method 3: Custom header (recommended for DELETE)
fetch('http://localhost:3001/api/books/123', {
  method: 'DELETE',
  headers: { 'X-Teacher-ID': loggedInTeacherId }
})
```

### Example: Updated TeacherBooksLessons.jsx

```javascript
const handleCreateBook = async () => {
  if (!newBook.title.trim()) {
    notify?.("Book title is required", "error");
    return;
  }

  const formData = new FormData();
  formData.append("title", newBook.title);
  formData.append("description", newBook.description);
  formData.append("course_id", courseId);
  formData.append("teacher_id", teacherId);  // ADD THIS LINE
  
  if (newBook.coverFile) {
    formData.append("cover", newBook.coverFile);
  }

  try {
    const response = await fetch(`${API_BASE}/api/books`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Failed to create book");
    
    const data = await response.json();
    notify?.("Book created successfully", "success");
    fetchBooks();
  } catch (err) {
    console.error("Error creating book:", err);
    notify?.(`Error: ${err.message}`, "error");
  }
};
```

---

## Testing the Implementation

### Test 1: Teacher Can View Own Books
```bash
curl "http://localhost:3001/api/teacher/books?teacher_id=5"
# Expected: Books owned by teacher 5
```

### Test 2: Teacher Cannot View Another Teacher's Books
```bash
curl "http://localhost:3001/api/teacher/books?teacher_id=999"
# Expected: Empty list or books only for teacher 999
```

### Test 3: Unauthorized Direct Access to Another Teacher's Book
```bash
# Assume teacher 5 owns book 10, teacher 6 owns book 20
curl "http://localhost:3001/api/books/20?teacher_id=5"
# Expected 403: "Forbidden: You do not have permission to access this book"
```

### Test 4: Cannot Update Another Teacher's Book
```bash
curl -X PUT "http://localhost:3001/api/books/20" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hacked","teacher_id":5}'
# Expected 403: Forbidden error
```

### Test 5: Cannot Delete Another Teacher's Lesson
```bash
curl -X DELETE "http://localhost:3001/api/books/20?teacher_id=5"
# Expected 403: Forbidden error
```

---

## Security Best Practices

### ✅ DO:
- Always pass `teacher_id` from the authenticated user (not from user input)
- Validate that `teacher_id` matches the logged-in user on the frontend
- Store the teacher_id securely in localStorage/sessionStorage after login
- Use HTTPS in production to prevent teacher_id interception

### ❌ DON'T:
- Trust `teacher_id` from URL parameters alone
- Allow users to change `teacher_id` in the browser console
- Hardcode teacher IDs in frontend code
- Transmit sensitive data over HTTP (use HTTPS)

---

## Database Implementation Details

### Book Ownership Check
```sql
SELECT book_id, teacher_id 
FROM books 
WHERE book_id = ? AND teacher_id = ?
```

### Lesson Ownership Check (via book)
```sql
SELECT l.lesson_id, b.teacher_id, l.book_id
FROM lessons l
JOIN books b ON l.book_id = b.book_id
WHERE l.lesson_id = ? AND b.teacher_id = ?
```

### Teacher's Books Query
```sql
SELECT b.*, COUNT(l.lesson_id) as lesson_count
FROM books b
LEFT JOIN lessons l ON b.book_id = l.book_id
WHERE b.teacher_id = ?
GROUP BY b.book_id
ORDER BY b.created_at DESC
```

---

## Error Response Codes

| Code | Scenario |
|------|----------|
| 400 | Missing required fields |
| 401 | teacher_id not provided or invalid |
| 403 | Teacher doesn't own the resource |
| 404 | Resource not found |
| 500 | Server/database error |

---

## Implementation Checklist

- [x] Backend helper functions added
- [x] GET `/api/teacher/books` - Secured with ownership filter
- [x] GET `/api/books/:book_id` - Added teacher validation
- [x] PUT `/api/books/:book_id` - Added ownership check
- [x] DELETE `/api/books/:book_id` - Added ownership check
- [x] POST `/api/lessons` - Added book ownership check
- [x] PUT `/api/lessons/:lesson_id` - Added ownership check
- [x] DELETE `/api/lessons/:lesson_id` - Added ownership check
- [ ] Frontend: Update all API calls to include teacher_id
- [ ] Frontend: Update lesson creation endpoints
- [ ] Frontend: Update lesson update endpoints
- [ ] Frontend: Update lesson delete endpoints
- [ ] Testing: Verify all endpoints enforce data isolation
- [ ] Testing: Verify 403 errors for unauthorized access

---

## Rollback Instructions

If you need to revert these changes:

1. Restore the backup of `server.js`
2. Remove the helper functions (lines ~3640-3710)
3. Revert the secured endpoints to their original versions (no ownership checks)

Note: No database schema changes were required. The `teacher_id` field already existed in the `books` table.

---

## Questions & Support

For issues or questions about this implementation:
1. Check error codes and messages in the response body
2. Verify teacher_id is being sent in requests
3. Check backend console logs for SQL errors
4. Ensure database has correct teacher_id values in books table
