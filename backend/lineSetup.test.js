import test from "node:test";
import assert from "node:assert/strict";
import { ensureLineSetupColumn, isLineSetupRequired } from "./lineSetup.js";

test("only first-time student setup requires LINE", () => {
  assert.equal(isLineSetupRequired({ role: "student", line_setup_completed: 0 }), true);
  assert.equal(isLineSetupRequired({ role: "student", line_setup_completed: 0, line_user_id: "U123" }), false);
  for (const role of ["teacher", "admin"]) {
    assert.equal(isLineSetupRequired({ role, line_setup_completed: 0 }), false);
  }
});

test("disconnecting after setup keeps access, including after reloading the account", () => {
  const account = { role: "student", line_user_id: "U123", line_setup_completed: 1 };
  account.line_user_id = null;
  account.line_linked_at = null;
  assert.equal(isLineSetupRequired(account), false);
  assert.equal(isLineSetupRequired(JSON.parse(JSON.stringify(account))), false);
  assert.equal(isLineSetupRequired({ ...account, line_setup_completed: "1" }), false);
});

test("migration preserves existing accounts and does not repeat its backfill", async () => {
  const queries = [];
  const connection = { query: async (sql) => queries.push(sql) };
  await ensureLineSetupColumn(connection, async () => false);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /DEFAULT FALSE/);
  assert.match(queries[1], /profile_completed = TRUE OR line_user_id IS NOT NULL/);
  await ensureLineSetupColumn(connection, async () => true);
  assert.equal(queries.length, 2);
});
