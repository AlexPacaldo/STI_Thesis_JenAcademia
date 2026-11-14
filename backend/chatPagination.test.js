import test from "node:test";
import assert from "node:assert/strict";
import { chatPageOptions, readChatPage } from "./chatPagination.js";
import { mergeChatMessages } from "../frontend/src/utils/chatMessages.js";

test("chat pages default to 40 messages and validate/cap cursors and sizes", () => {
  assert.deepEqual(chatPageOptions(), { limit: 40, before: null });
  assert.deepEqual(chatPageOptions({ limit: "1000", before: "81" }), { limit: 100, before: 81 });
  for (const query of [{ before: "0" }, { before: "abc" }, { before: "1.2" }, { before: "9007199254740993" }, { limit: "0" }, { limit: "1.5" }]) {
    assert.throws(() => chatPageOptions(query), { status: 400 });
  }
});

test("long threads seek each direction and decrypt only the requested page", async () => {
  const all = Array.from({ length: 1000 }, (_, index) => ({ message_id: index + 1, sender_id: 1,
    recipient_id: 2, content: `encrypted-${index + 1}`, subject: null, is_read: 0 }));
  let decrypted = 0;
  const db = { async query(sql, params) {
    assert.match(sql, /UNION ALL/);
    assert.match(sql, /ORDER BY message_id DESC LIMIT \?/);
    assert.doesNotMatch(sql, /OFFSET/);
    const before = sql.includes("message_id < ?") ? params[2] : Infinity;
    const limit = params.at(-1);
    assert.equal(limit, 41);
    return [all.filter(row => row.message_id < before).reverse().slice(0, limit)];
  } };
  const decrypt = text => { if (text) decrypted++; return text?.replace("encrypted-", "") || null; };
  const latest = await readChatPage(db, 1, 2, {}, decrypt);
  assert.equal(latest.messages.length, 40);
  assert.equal(latest.messages[0].message_id, 961);
  assert.equal(latest.messages.at(-1).message_id, 1000);
  assert.equal(decrypted, 40);
  assert.equal(latest.hasMore, true);
  assert.equal(latest.nextBefore, "961");
  const older = await readChatPage(db, 1, 2, { before: latest.nextBefore }, decrypt);
  assert.equal(older.messages[0].message_id, 921);
  assert.equal(older.messages.at(-1).message_id, 960);
  const first = await readChatPage(db, 1, 2, { before: "5" }, decrypt);
  assert.equal(first.hasMore, false);
  assert.equal(first.nextBefore, null);
  assert.deepEqual(first.messages.map(row => row.message_id), [1, 2, 3, 4]);
});

test("history pages and live messages merge without duplicates or lost read receipts", () => {
  const current = [{ id: 2, text: "two", is_read: true, read_at: "2026-11-14T10:00:00Z" }, { id: 3, text: "three" }];
  const merged = mergeChatMessages(current, [{ id: 1, text: "one" }, { id: 2, text: "two", is_read: false }, { id: "3", text: "three" }]);
  assert.deepEqual(merged.map(message => Number(message.id)), [1, 2, 3]);
  assert.equal(merged[1].is_read, true);
  assert.equal(merged[1].read_at, current[0].read_at);
});
