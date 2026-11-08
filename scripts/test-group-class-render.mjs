import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";

const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const server = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)),
  server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { default: Manager } = await server.ssrLoadModule("/src/components/GroupClassManager.jsx");
  const selectedClass = { id: 10, teacher_id: 1, student_id: 2, duration: 25, status: "scheduled", group_session_id: 7, studentName: "Grace" };
  const props = { userId: 1, role: "teacher", viewerTimezone: "Asia/Manila", selectedClass,
    selectedStarted: false, peers: [selectedClass, { ...selectedClass, id: 20, studentName: "Shannon" }], onUpdated() {}, onSelectParticipant() {} };
  const teacher = renderToStaticMarkup(React.createElement(Manager, props));
  assert(teacher.includes("Propose new group time"));
  assert(teacher.includes("Grace") && teacher.includes("Shannon"));
  assert(teacher.includes("aria-pressed=\"true\""));
  const student = renderToStaticMarkup(React.createElement(Manager, { ...props, role: "student", userId: 2 }));
  assert(!student.includes("Propose new group time"));
  assert(student.includes("attendance and class allowance are tracked separately"));
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(Manager, { ...props, selectedClass: null })));
  console.log("Teacher, student, group roster, and refresh-state components render successfully.");
} finally { await server.close(); }
