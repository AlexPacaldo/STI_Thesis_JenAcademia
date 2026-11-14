export function chatPageOptions(query = {}) {
  const limit = query.limit == null ? 40 : Number(query.limit);
  const before = query.before == null ? null : Number(query.before);
  if (!Number.isSafeInteger(limit) || limit < 1
    || (before !== null && (!/^[1-9]\d*$/.test(String(query.before)) || !Number.isSafeInteger(before)))) {
    const error = new Error("Use a positive message cursor and page size.");
    error.status = 400;
    throw error;
  }
  return { limit: Math.min(limit, 100), before };
}

export async function readChatPage(db, userId, otherUserId, options, decrypt) {
  const { limit, before } = chatPageOptions(options);
  const direction = `SELECT message_id FROM messages WHERE sender_id = ? AND recipient_id = ?
    ${before ? "AND message_id < ?" : ""} ORDER BY message_id DESC LIMIT ?`;
  const parameters = (sender, recipient) => [sender, recipient, ...(before ? [before] : []), limit + 1];
  // Each direction can seek its pair/id index before joining/decrypting a page.
  const [rows] = await db.query(`SELECT m.message_id, m.sender_id, m.recipient_id, m.subject, m.content,
      m.is_read, m.sent_at, m.read_at, s.first_name AS sender_first_name, s.last_name AS sender_last_name,
      r.first_name AS recipient_first_name, r.last_name AS recipient_last_name
    FROM ((${direction}) UNION ALL (${direction})) page
    JOIN messages m ON m.message_id = page.message_id
    JOIN users s ON s.user_id = m.sender_id
      AND s.status = 'active' AND (s.role = 'admin' OR s.profile_completed = TRUE)
    JOIN users r ON r.user_id = m.recipient_id
      AND r.status = 'active' AND (r.role = 'admin' OR r.profile_completed = TRUE)
    ORDER BY m.message_id DESC LIMIT ?`,
  [...parameters(userId, otherUserId), ...parameters(otherUserId, userId), limit + 1]);
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse().map(row => ({
    message_id: row.message_id, sender_id: row.sender_id, recipient_id: row.recipient_id,
    subject: decrypt(row.subject), content: decrypt(row.content), is_read: Boolean(row.is_read),
    sent_at: row.sent_at, read_at: row.read_at,
    sender_name: `${row.sender_first_name || ""} ${row.sender_last_name || ""}`.trim(),
    recipient_name: `${row.recipient_first_name || ""} ${row.recipient_last_name || ""}`.trim(),
  }));
  return { messages, hasMore, nextBefore: hasMore ? String(messages[0].message_id) : null };
}
