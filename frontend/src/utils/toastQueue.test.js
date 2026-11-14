import test from "node:test";
import assert from "node:assert/strict";
import { enqueueToast, MAX_VISIBLE_TOASTS, MAX_QUEUED_TOASTS } from "./toastQueue.js";

const toast = id => ({ id, message: `Message ${id}`, type: "info", duration: 4000 });

test("bursts preserve active toasts and bound the waiting queue", () => {
  let queue = [];
  for (let id = 1; id <= 100; id++) queue = enqueueToast(queue, toast(id)).queue;
  assert.equal(queue.length, MAX_VISIBLE_TOASTS + MAX_QUEUED_TOASTS);
  assert.deepEqual(queue.slice(0, MAX_VISIBLE_TOASTS).map(item => item.id), [1, 2, 3]);
  assert.deepEqual(queue.slice(MAX_VISIBLE_TOASTS).map(item => item.id), [96, 97, 98, 99, 100]);
});

test("duplicates reuse the existing toast and its dismissal ID", () => {
  let queue = [toast(1), toast(2), toast(3), toast(4)];
  const duplicate = enqueueToast(queue, { ...toast(4), id: 5 });
  assert.equal(duplicate.queue, queue);
  assert.equal(duplicate.id, 4);
  queue = enqueueToast(queue, { ...toast(1), id: 6, type: "error" }).queue;
  assert.equal(queue.length, 5); // Different severity conveys a different outcome.
});

test("closing a toast promotes waiting items in order with their full duration", () => {
  let queue = [];
  for (let id = 1; id <= 5; id++) queue = enqueueToast(queue, toast(id)).queue;
  queue = queue.filter(item => item.id !== 2);
  assert.deepEqual(queue.slice(0, MAX_VISIBLE_TOASTS).map(item => item.id), [1, 3, 4]);
  assert.equal(queue[2].duration, 4000);
  assert.equal(new Set(queue.map(item => item.id)).size, queue.length);
});
