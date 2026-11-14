export const CHAT_PAGE_SIZE = 40;

export function mergeChatMessages(current, incoming) {
  const byId = new Map(current.map(message => [String(message.id), message]));
  incoming.forEach(message => {
    const previous = byId.get(String(message.id));
    byId.set(String(message.id), { ...previous, ...message,
      read_at: message.read_at || previous?.read_at || null,
      is_read: Boolean(message.is_read || previous?.is_read) });
  });
  return [...byId.values()].sort((left, right) => Number(left.id) - Number(right.id));
}
