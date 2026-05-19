# Frontend Update Examples

This file contains copy-paste ready examples for updating your React frontend to properly send `teacher_id` with all API requests.

---

## 1. Update Book Creation (teacherBooksLessons.jsx)

### Current Code (Vulnerable):
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
  // Missing teacher_id!
```

### Updated Code (Secure):
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
  formData.append("teacher_id", teacherId);  // ✅ ADD THIS LINE
  
  if (newBook.coverFile) {
    formData.append("cover", newBook.coverFile);
  }

  try {
    const response = await fetch(`${API_BASE}/api/books`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to create book");
    }

    const data = await response.json();
    notify?.("Book created successfully", "success");
    setShowCreateModal(false);
    setNewBook({ title: "", description: "", coverFile: null });
    fetchBooks();
  } catch (err) {
    console.error("Error creating book:", err);
    notify?.(`Error: ${err.message}`, "error");
  }
};
```

---

## 2. Update Book Deletion

### Current Code (Vulnerable):
```javascript
const handleDeleteBook = async (bookId) => {
  if (!window.confirm("Are you sure you want to delete this book?")) return;

  try {
    const response = await fetch(`${API_BASE}/api/books/${bookId}`, {
      method: "DELETE",
    });
    // No teacher_id sent!
```

### Updated Code (Secure):
```javascript
const handleDeleteBook = async (bookId) => {
  if (!window.confirm("Are you sure you want to delete this book?")) return;

  try {
    const response = await fetch(`${API_BASE}/api/books/${bookId}?teacher_id=${teacherId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to delete book");
    }

    notify?.("Book deleted successfully", "success");
    fetchBooks();
  } catch (err) {
    console.error("Error deleting book:", err);
    notify?.(`Error: ${err.message}`, "error");
  }
};
```

---

## 3. Update Book Update/Edit (teacherBooksLessons.jsx)

### Current Code (Vulnerable):
```javascript
const handleCoverUpload = async () => {
  if (!coverFile) {
    notify?.("Please select an image file", "error");
    return;
  }

  const formData = new FormData();
  formData.append("cover", coverFile);
  formData.append("title", books.find(b => b.book_id === editingBookId)?.title);
  // Missing teacher_id!
```

### Updated Code (Secure):
```javascript
const handleCoverUpload = async () => {
  if (!coverFile) {
    notify?.("Please select an image file", "error");
    return;
  }

  const book = books.find(b => b.book_id === editingBookId);
  
  const formData = new FormData();
  formData.append("cover", coverFile);
  formData.append("title", book?.title);
  formData.append("description", book?.description || "");
  formData.append("teacher_id", teacherId);  // ✅ ADD THIS LINE

  try {
    const response = await fetch(`${API_BASE}/api/books/${editingBookId}`, {
      method: "PUT",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to update book");
    }

    notify?.("Book cover updated successfully", "success");
    setShowCoverModal(false);
    setCoverFile(null);
    setEditingBookId(null);
    fetchBooks();
  } catch (err) {
    console.error("Error uploading cover:", err);
    notify?.(`Error: ${err.message}`, "error");
  }
};
```

---

## 4. Update Lesson Creation (teacherBooksDropbox.jsx)

### Current Code (Vulnerable):
```javascript
const handleAddLesson = async (e) => {
  e.preventDefault();

  if (!selectedBook) {
    notify?.("Please select a book", "error");
    return;
  }

  const formData = new FormData();
  formData.append("book_id", selectedBook);
  formData.append("lesson_number", lessonData.lesson_number);
  formData.append("title", lessonData.title);
  formData.append("content", lessonData.content);
  // Missing teacher_id!
```

### Updated Code (Secure):
```javascript
const handleAddLesson = async (e) => {
  e.preventDefault();

  if (!selectedBook) {
    notify?.("Please select a book", "error");
    return;
  }

  if (!lessonData.lesson_number || !lessonData.title) {
    notify?.("Lesson number and title are required", "error");
    return;
  }

  const formData = new FormData();
  formData.append("book_id", selectedBook);
  formData.append("lesson_number", lessonData.lesson_number);
  formData.append("title", lessonData.title);
  formData.append("content", lessonData.content);
  formData.append("teacher_id", teacherId);  // ✅ ADD THIS LINE
  
  if (lessonData.file) {
    formData.append("file", lessonData.file);
  }

  try {
    const response = await fetch(`http://localhost:3001/api/lessons`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to add lesson");
    }

    notify?.("Lesson added successfully", "success");
    setLessonData({
      lesson_number: "",
      title: "",
      content: "",
      file: null,
    });
    setSelectedBook("");
    fetchBooks();
  } catch (err) {
    console.error("Error adding lesson:", err);
    notify?.(`Error: ${err.message}`, "error");
  }
};
```

---

## 5. Update Lesson Update (if you have an edit endpoint)

### Example:
```javascript
const handleUpdateLesson = async (lessonId, updatedData) => {
  const formData = new FormData();
  formData.append("lesson_number", updatedData.lesson_number);
  formData.append("title", updatedData.title);
  formData.append("content", updatedData.content);
  formData.append("teacher_id", teacherId);  // ✅ ADD THIS LINE
  
  if (updatedData.file) {
    formData.append("file", updatedData.file);
  }

  try {
    const response = await fetch(`http://localhost:3001/api/lessons/${lessonId}`, {
      method: "PUT",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to update lesson");
    }

    notify?.("Lesson updated successfully", "success");
    fetchBooks();
  } catch (err) {
    console.error("Error updating lesson:", err);
    notify?.(`Error: ${err.message}`, "error");
  }
};
```

---

## 6. Update Lesson Deletion

### Example:
```javascript
const handleDeleteLesson = async (lessonId) => {
  if (!window.confirm("Are you sure you want to delete this lesson?")) return;

  try {
    const response = await fetch(
      `http://localhost:3001/api/lessons/${lessonId}?teacher_id=${teacherId}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to delete lesson");
    }

    notify?.("Lesson deleted successfully", "success");
    fetchBooks();
  } catch (err) {
    console.error("Error deleting lesson:", err);
    notify?.(`Error: ${err.message}`, "error");
  }
};
```

---

## 7. Error Handling Pattern

Use this pattern for all API calls to provide better user feedback:

```javascript
try {
  const response = await fetch(url, options);

  // Check for HTTP errors
  if (!response.ok) {
    const error = await response.json();
    
    // Handle specific status codes
    switch (response.status) {
      case 401:
        notify?.("Unauthorized: Please log in again", "error");
        break;
      case 403:
        notify?.("Access Denied: " + error.message, "error");
        break;
      case 404:
        notify?.("Resource not found", "error");
        break;
      default:
        notify?.(error.message || "An error occurred", "error");
    }
    
    throw new Error(error.message);
  }

  const data = await response.json();
  notify?.("Operation successful", "success");
  return data;
  
} catch (err) {
  console.error("API Error:", err);
  // Error already notified to user above
}
```

---

## 8. Verify teacher_id is Available

Before making API calls, ensure teacher_id is properly stored:

```javascript
// In your main component or App.jsx
useEffect(() => {
  const storedTeacherId = localStorage.getItem("teacher_id");
  
  if (!storedTeacherId) {
    console.warn("⚠️ teacher_id not found in localStorage!");
    console.warn("Make sure teacher_id is stored during login");
  } else {
    console.log("✅ teacher_id available:", storedTeacherId);
  }
}, []);
```

---

## Testing Checklist

- [ ] Create a book - verify teacher_id is sent
- [ ] Delete a book - verify teacher_id is sent
- [ ] Update book cover - verify teacher_id is sent
- [ ] Create a lesson - verify teacher_id is sent
- [ ] Update a lesson - verify teacher_id is sent
- [ ] Delete a lesson - verify teacher_id is sent
- [ ] Try to access another teacher's book - verify 403 error
- [ ] Check browser Network tab - confirm teacher_id in requests
- [ ] Check backend console - verify teacher_id validation logs

---

## Common Issues & Solutions

### Issue: 401 Unauthorized Error
**Cause**: teacher_id not being sent
**Solution**: Check that `teacherId` variable is defined and not null/empty

```javascript
console.log("Current teacherId:", teacherId);
// Should print a number like: "Current teacherId: 5"
```

### Issue: 403 Forbidden Error
**Cause**: Wrong teacher_id being sent (doesn't own the book/lesson)
**Solution**: Verify you're using the correct logged-in teacher's ID

```javascript
// Debug: Log what teacher_id is being sent
console.log("Sending teacher_id:", teacherId);
console.log("Book owner should be:", teacherId);
```

### Issue: 404 Not Found
**Cause**: Book/lesson doesn't exist or incorrect ID
**Solution**: Verify the book/lesson ID exists in the database

---

## One-Time Setup

In your login endpoint response, ensure you're storing the teacher ID:

```javascript
// In your login response handler
const userData = await response.json();

if (userData.user.role === 'teacher') {
  localStorage.setItem("teacher_id", userData.user.id);  // ✅ Add this
  localStorage.setItem("firstName", userData.user.firstName);
  localStorage.setItem("lastName", userData.user.lastName);
  // ... other fields
}
```
