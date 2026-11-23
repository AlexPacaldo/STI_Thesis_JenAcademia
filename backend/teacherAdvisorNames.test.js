import { test } from "node:test";
import { strict as assert } from "node:assert";
import { teacherNamesInExplanation } from "./teacherAdvisor.js";

test("teacher IDs in advisor prose are replaced with candidate names", () => {
  const candidates = [{ id: 252, name: "Rafael Santos" }, { id: 253, name: "Ben Martin" }, { id: 6, name: "Other Teacher" }];
  assert.equal(
    teacherNamesInExplanation("Teacher 252 fits best, while 253 also fits; 252 has 6 years of experience.", candidates),
    "Rafael Santos fits best, while Ben Martin also fits; Rafael Santos has 6 years of experience."
  );
  assert.equal(teacherNamesInExplanation("Teacher 999 fits.", candidates), "Teacher 999 fits.");
});
