export const MAX_VISIBLE_TOASTS = 3;
export const MAX_QUEUED_TOASTS = 5;

export function enqueueToast(queue, toast) {
  const existing = queue.find(item => item.message === toast.message && item.type === toast.type);
  if (existing) return { queue, id: existing.id };
  // Preserve active toasts. During a burst, retain only the newest waiting items.
  const visible = queue.slice(0, MAX_VISIBLE_TOASTS);
  const waiting = queue.slice(MAX_VISIBLE_TOASTS).slice(-(MAX_QUEUED_TOASTS - 1));
  return { queue: [...visible, ...waiting, toast], id: toast.id };
}
