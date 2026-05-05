const STORAGE_KEY = "localNotifications";

function safeParse(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function getAllLocalNotifications() {
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

export function saveLocalNotifications(notifications) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}

export function addLocalNotification({
  recipientId,
  recipientName,
  senderName,
  message,
  type = "general",
  title = "Notification",
  relatedId = null,
}) {
  const stored = getAllLocalNotifications();
  const notification = {
    notification_id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    recipientId: recipientId ?? null,
    recipientName: recipientName?.trim() || null,
    senderName: senderName?.trim() || "System",
    message,
    type,
    title,
    relatedId,
    is_read: false,
    created_at: new Date().toISOString(),
  };
  const next = [notification, ...stored];
  saveLocalNotifications(next);
  return notification;
}

export function getLocalNotificationsForUser({ userId, userName }) {
  const normalizedName = userName?.trim();
  return getAllLocalNotifications().filter((notif) => {
    if (userId && notif.recipientId && String(notif.recipientId) === String(userId)) {
      return true;
    }
    if (normalizedName && notif.recipientName && notif.recipientName === normalizedName) {
      return true;
    }
    return false;
  });
}

export function getLocalUnreadCount({ userId, userName }) {
  return getLocalNotificationsForUser({ userId, userName }).filter((notif) => !notif.is_read).length;
}

export function markLocalNotificationRead(notificationId) {
  const notifications = getAllLocalNotifications().map((notif) =>
    notif.notification_id === notificationId ? { ...notif, is_read: true } : notif
  );
  saveLocalNotifications(notifications);
}

export function markAllLocalNotificationsReadForUser({ userId, userName }) {
  const normalizedName = userName?.trim();
  const notifications = getAllLocalNotifications().map((notif) => {
    if (
      (userId && notif.recipientId && String(notif.recipientId) === String(userId)) ||
      (normalizedName && notif.recipientName === normalizedName)
    ) {
      return { ...notif, is_read: true };
    }
    return notif;
  });
  saveLocalNotifications(notifications);
}

export function clearLocalNotificationsForUser({ userId, userName }) {
  const normalizedName = userName?.trim();
  const notifications = getAllLocalNotifications().filter((notif) => {
    if (userId && notif.recipientId && String(notif.recipientId) === String(userId)) {
      return false;
    }
    if (normalizedName && notif.recipientName === normalizedName) {
      return false;
    }
    return true;
  });
  saveLocalNotifications(notifications);
}

export function mergeNotifications(apiNotifications, localNotifications) {
  const seen = new Set();
  const merged = [];

  [...(apiNotifications || []), ...(localNotifications || [])].forEach((notif) => {
    const id = notif.notification_id ?? notif.id ?? JSON.stringify(notif);
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(notif);
    }
  });

  return merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
