function normalizeActionPath(actionUrl, origin) {
  if (typeof actionUrl !== "string" || !actionUrl.trim()) return null;

  try {
    const target = new URL(actionUrl.trim(), origin);
    if (!["http:", "https:"].includes(target.protocol)) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

function dashboardPath(role) {
  if (role === "teacher") return "/TeacherDashboard";
  if (role === "admin") return "/AdminDashboard";
  return "/StudentDashboard";
}

export function getNotificationTargetUrl(notification, role, origin) {
  const relatedId = notification.related_id ?? notification.relatedId;
  const relatedType = notification.related_type ?? notification.relatedType;

  if (relatedType === "assignment" || notification.type === "assignment") {
    if (role === "teacher") return "/teacherAssignment";
    if (role === "student" && relatedId) {
      return `/assignmentsDropbox?assignmentId=${encodeURIComponent(relatedId)}`;
    }
  }

  const actionPath = normalizeActionPath(
    notification.action_url || notification.actionUrl,
    origin
  );
  if (actionPath) return actionPath;

  if (relatedType === "class" && relatedId && ["teacher", "student"].includes(role)) {
    return `/Calendar?classId=${encodeURIComponent(relatedId)}`;
  }

  if (relatedType === "book" && relatedId) {
    const bookId = encodeURIComponent(relatedId);
    if (role === "teacher") return `/teacherBooksLessons/${bookId}`;
    if (role === "admin") return `/adminBooksContent/${bookId}`;
    return `/booksContent/${bookId}`;
  }

  if (relatedType === "contract_review") return "/ContractReview";
  if (relatedType === "contract_request") {
    return role === "admin" ? "/AdminDashboard" : "/Calendar";
  }
  if (["contract_expiry", "group_class_proposal", "reschedule_request", "teacher_availability"].includes(relatedType)) {
    return "/Calendar";
  }
  if (relatedType === "class_remarks") {
    return role === "teacher" ? "/PassRemarks" : "/remarks";
  }

  if (notification.type === "remark") {
    return role === "teacher" ? "/PassRemarks" : "/remarks";
  }
  if (notification.type === "reschedule" || notification.type === "class_reminder") {
    return "/Calendar";
  }
  if (notification.type === "announcement") return dashboardPath(role);

  return dashboardPath(role);
}
