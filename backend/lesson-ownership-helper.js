/**
 * Validate that the requesting teacher owns the book containing a lesson
 * @param {Object} res - Express response object
 * @param {number} lessonId - The lesson ID to check
 * @param {number} teacherId - The authenticated teacher's ID
 * @returns {Promise<boolean>} True if authorized, throws error otherwise
 */
async function validateTeacherLessonOwnership(res, lessonId, teacherId) {
  if (!teacherId) {
    res.status(401).json({ message: "Unauthorized: Teacher ID not provided" });
    return false;
  }

  const [lessons] = await pool.query(
    `SELECT l.lesson_id, b.teacher_id, l.book_id
     FROM lessons l
     JOIN books b ON l.book_id = b.book_id
     WHERE l.lesson_id = ? LIMIT 1`,
    [lessonId]
  );

  if (lessons.length === 0) {
    res.status(404).json({ message: "Lesson not found" });
    return false;
  }

  if (lessons[0].teacher_id !== parseInt(teacherId)) {
    res.status(403).json({ 
      message: "Forbidden: You do not have permission to manage this lesson. The lesson belongs to a book uploaded by another teacher." 
    });
    return false;
  }

  return true;
}
