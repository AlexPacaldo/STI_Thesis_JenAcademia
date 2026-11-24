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
    if (role === "teacher") {
      const assignmentPath = "/teacherAssignment?tab=submissions";
      return relatedId
        ? `${assignmentPath}&assignmentId=${encodeURIComponent(relatedId)}`
        : assignmentPath;
    }
    if (role === "student" && relatedId) {
      return `/assignmentsDropbox?assignmentId=${encodeURIComponent(relatedId)}`;
    }
  }

  if (relatedType === "contract_review") {
    return relatedId
      ? `/ContractReview?packageId=${encodeURIComponent(relatedId)}`
      : "/ContractReview";
  }
  if (relatedType === "contract_request" && role === "admin") {
    return "/AdminDashboard?tab=requests";
  }
  if (relatedType === "group_class_proposal") {
    return relatedId
      ? `/Calendar?groupProposalId=${encodeURIComponent(relatedId)}`
      : "/Calendar";
  }
  if (relatedType === "reschedule_request") {
    return relatedId
      ? `/Calendar?rescheduleRequestId=${encodeURIComponent(relatedId)}`
      : "/Calendar";
  }

  const actionPath = normalizeActionPath(
    notification.action_url || notification.actionUrl,
    origin
  );
  const isClassNotification =
    relatedType === "class" || notification.type === "class_reminder";
  if (
    isClassNotification &&
    relatedId &&
    ["teacher", "student"].includes(role) &&
    (!actionPath || actionPath === "/Calendar")
  ) {
    return `/Calendar?classId=${encodeURIComponent(relatedId)}`;
  }
  // Older availability notices saved only /Calendar, which opens the student's
  // booked classes. They need the teacher's availability even with no bookings.
  if (relatedType === "teacher_availability" && (!actionPath || actionPath === "/Calendar")) {
    return relatedId
      ? `/Calendar?view=availability&availabilityId=${encodeURIComponent(relatedId)}`
      : "/Calendar?view=availability";
  }
  if (actionPath) return actionPath;

  if (relatedType === "book" && relatedId) {
    const bookId = encodeURIComponent(relatedId);
    if (role === "teacher") return `/teacherBooksLessons/${bookId}`;
    if (role === "admin") return `/adminBooksContent/${bookId}`;
    return `/booksContent/${bookId}`;
  }

  if (relatedType === "contract_request") {
    return role === "admin" ? "/AdminDashboard" : "/Calendar";
  }
  if (["contract_expiry", "teacher_availability"].includes(relatedType)) {
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
