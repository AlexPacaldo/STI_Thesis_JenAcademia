import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import styles from "../assets/AdminDashboard.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";
import { formatProficiencyLevel } from "../utils/proficiencyLevels.js";
import { readStoredUser } from "../utils/sessionUser.js";

const API = API_BASE_URL;
const STUDENTS_PER_PAGE = 10;

const getStudentName = (student) => (
  `${student.first_name || student.firstName || ""} ${student.last_name || student.lastName || ""}`.trim() || "Student"
);

const getPackageStatus = (student) => {
  if (!student.package_id) return "no_package";
  if (Number(student.classes_left || 0) <= 0) return "used_up";
  if (student.package_status && student.package_status !== "active") return "inactive";
  return "active";
};

const packageStatusLabel = {
  all: "All",
  active: "Active",
  used_up: "Used Up",
  inactive: "Inactive",
  no_package: "No Package",
};

const packageStatusStyle = (status) => {
  const map = {
    active: { background: "#dcfce7", color: "#166534" },
    used_up: { background: "#fef3c7", color: "#92400e" },
    inactive: { background: "#f3f4f6", color: "#374151" },
    no_package: { background: "#fee2e2", color: "#991b1b" },
  };
  return map[status] || { background: "#f3f4f6", color: "#374151" };
};

export default function TeacherStudents() {
  const { notify } = useNotification() || {};
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const user = readStoredUser();
  const teacherId = user?.id || user?.user_id || user?.userId;
  const userRole = String(user?.role || "").toLowerCase();

  const loadStudents = async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/api/teacher/${teacherId}/students`);
      setStudents(response.data?.students || []);
    } catch (err) {
      console.error(err);
      setStudents([]);
      notify?.(err?.response?.data?.message || "Failed to load students", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      window.location.href = "/";
      return;
    }
    if (userRole !== "teacher") {
      window.location.href = userRole === "student" ? "/StudentDashboard" : "/AdminDashboard";
      return;
    }
    loadStudents();
  }, [teacherId, userRole]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const counts = {
    all: students.length,
    active: students.filter((student) => getPackageStatus(student) === "active").length,
    used_up: students.filter((student) => getPackageStatus(student) === "used_up").length,
    inactive: students.filter((student) => getPackageStatus(student) === "inactive").length,
    no_package: students.filter((student) => getPackageStatus(student) === "no_package").length,
  };

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((student) => {
      const packageStatus = getPackageStatus(student);
      if (statusFilter !== "all" && packageStatus !== statusFilter) return false;
      if (!term) return true;
      return [
        getStudentName(student),
        student.email,
        student.contact,
        student.course_name,
        student.proficiency_level,
        packageStatusLabel[packageStatus],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [search, statusFilter, students]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / STUDENTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = filteredStudents.slice(
    (safePage - 1) * STUDENTS_PER_PAGE,
    safePage * STUDENTS_PER_PAGE
  );

  return (
    <div className={styles.Center}>
      <div className={styles.page}>
        <main className={styles.main}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>Students</h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.9em", color: "#666" }}>
                  Track your assigned students, course details, and remaining class package balance.
                </p>
              </div>
              <button className={styles.linkBtn} type="button" onClick={loadStudents}>
                Refresh
              </button>
            </div>

            <div className={styles.filterTabs} style={{ marginBottom: 14 }}>
              {["all", "active", "used_up", "inactive", "no_package"].map((status) => {
                const active = statusFilter === status;
                const colors = packageStatusStyle(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    style={{
                      padding: "8px 12px",
                      border: active ? "1px solid #2f4d3e" : "1px solid #e5e7eb",
                      background: active ? "#2f4d3e" : colors.background,
                      color: active ? "#fff" : colors.color,
                      borderRadius: "999px",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: "0.82em",
                    }}
                  >
                    {packageStatusLabel[status]} ({counts[status] || 0})
                  </button>
                );
              })}
            </div>

            <div className={styles.searchBar}>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by student, email, contact, course, level, or package status"
                aria-label="Search students"
              />
            </div>

            <div className={styles.tableWrap}>
              {loading ? (
                <div className={styles.empty}>Loading students...</div>
              ) : students.length === 0 ? (
                <div className={styles.empty}>No assigned students yet</div>
              ) : filteredStudents.length === 0 ? (
                <div className={styles.empty}>No students match your search</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Package</th>
                      <th>Classes</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStudents.map((student) => {
                      const packageStatus = getPackageStatus(student);
                      const statusColor = packageStatusStyle(packageStatus);
                      const totalClasses = Number(student.total_classes || 0);
                      const usedClasses = Number(student.classes_used || 0);
                      const classesLeft = Number(student.classes_left || 0);
                      const progress = totalClasses > 0 ? Math.min(100, Math.round((usedClasses / totalClasses) * 100)) : 0;

                      return (
                        <tr key={student.user_id}>
                          <td data-label="Student">
                            <div style={{ fontWeight: 800 }}>{getStudentName(student)}</div>
                            <div style={{ fontSize: "0.8em", color: "#667085", marginTop: 3, wordBreak: "break-all" }}>
                              {student.email || "No email"}
                            </div>
                            <div style={{ fontSize: "0.8em", color: "#667085", marginTop: 3 }}>
                              {student.contact || "No contact"}
                            </div>
                          </td>
                          <td data-label="Course">
                            <div style={{ fontWeight: 700 }}>{student.course_name || "No course assigned"}</div>
                            <div style={{ fontSize: "0.8em", color: "#667085", marginTop: 3 }}>
                              {formatProficiencyLevel(student.proficiency_level)}
                            </div>
                          </td>
                          <td data-label="Package">
                            <div style={{ fontWeight: 800 }}>
                              {student.package_id ? `${totalClasses} classes` : "No active package"}
                            </div>
                            <div style={{ fontSize: "0.8em", color: "#667085", marginTop: 3 }}>
                              {student.class_duration ? `${student.class_duration} min per class` : "Duration not set"}
                            </div>
                          </td>
                          <td data-label="Classes">
                            <div style={{ display: "grid", gap: 4, fontSize: "0.84em" }}>
                              <span>Left: <strong>{classesLeft}</strong></span>
                              <span>Used: {usedClasses}</span>
                              <span>Total: {totalClasses}</span>
                            </div>
                            <div style={{ marginTop: 8, width: 160, maxWidth: "100%", height: 7, borderRadius: 999, background: "#eef3ef", overflow: "hidden" }}>
                              <div style={{ width: `${progress}%`, height: "100%", background: classesLeft > 0 ? "#2f4d3e" : "#f59e0b" }} />
                            </div>
                          </td>
                          <td data-label="Status">
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "5px 9px",
                                borderRadius: 999,
                                background: statusColor.background,
                                color: statusColor.color,
                                fontWeight: 800,
                                fontSize: "0.78em",
                              }}
                            >
                              {packageStatusLabel[packageStatus]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {filteredStudents.length > STUDENTS_PER_PAGE && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  disabled={safePage === 1}
                >
                  Previous
                </button>
                <span>Page {safePage} of {totalPages}</span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                  disabled={safePage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
