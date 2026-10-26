import axios from "axios";
import ContractExpiryBadge from "../components/ContractExpiryBadge.jsx";
import { useEffect, useMemo, useState } from "react";
import kid from "../assets/studentKid.module.css";
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
  const statusTone = (status) => ({
    active: kid.pastStatusDone,
    used_up: kid.pastStatusChecking,
    inactive: kid.pastStatusWaiting,
    no_package: kid.pastStatusAlmost,
  }[status] || kid.pastStatusWaiting);

  return (
    <main className={kid.history}>
      <header className={kid.historyHead}>
        <div>
          <h1 className={kid.historyTitle}>Students</h1>
          <p className={kid.historySubtitle}>
            Review your assigned students, learning plans, and class balances.
          </p>
        </div>
        <button className={kid.refreshBtn} type="button" onClick={loadStudents} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className={kid.filterPills} role="group" aria-label="Filter students by package status">
        {["all", "active", "used_up", "inactive", "no_package"].map((status) => (
          <button
            key={status}
            type="button"
            className={`${kid.filterPill} ${statusFilter === status ? kid.filterPillActive : ""}`}
            onClick={() => setStatusFilter(status)}
          >
            {packageStatusLabel[status]} <span className={kid.filterNum}>{counts[status] || 0}</span>
          </button>
        ))}
      </div>

      <div className={kid.historySearch}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by student, email, course, or package status"
          aria-label="Search students"
        />
      </div>

      {loading ? (
        <div className={kid.historyList}>
          {[0, 1, 2].map((index) => <div key={index} className={kid.loadingCard} />)}
        </div>
      ) : students.length === 0 ? (
        <div className={kid.historyEmpty}>
          <span className={kid.historyEmptyIcon} aria-hidden="true">👩‍🎓</span>
          <p className={kid.historyEmptyTitle}>No assigned students yet</p>
          <p className={kid.historyEmptyHelp}>Students assigned to you will appear here.</p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className={kid.historyEmpty}>
          <span className={kid.historyEmptyIcon} aria-hidden="true">🔎</span>
          <p className={kid.historyEmptyTitle}>No students match your search</p>
        </div>
      ) : (
        <>
          <p className={kid.historySummary}>
            Showing {(safePage - 1) * STUDENTS_PER_PAGE + 1}–{Math.min(safePage * STUDENTS_PER_PAGE, filteredStudents.length)} of {filteredStudents.length} students.
          </p>
          <div className={kid.historyList}>
            {pagedStudents.map((student) => {
              const packageStatus = getPackageStatus(student);
              const totalClasses = Number(student.total_classes || 0);
              const usedClasses = Number(student.classes_used || 0);
              const classesLeft = Number(student.classes_left || 0);
              const progress = totalClasses > 0 ? Math.min(100, Math.round((usedClasses / totalClasses) * 100)) : 0;
              return (
                <article key={student.user_id} className={kid.pastCard}>
                  <div className={kid.pastHead}>
                    <span className={kid.pastIcon} aria-hidden="true">👩‍🎓</span>
                    <div>
                      <h2 className={kid.pastName}>{getStudentName(student)}</h2>
                      <p className={kid.pastWhen}>{student.email || "No email provided"}</p>
                    </div>
                  </div>
                  <span className={`${kid.pastStatus} ${statusTone(packageStatus)}`}>
                    {packageStatusLabel[packageStatus]}
                  </span>
                  <div className={`${kid.pastFacts} ${kid.teacherStudentFacts}`}>
                    <div className={kid.pastFact}>
                      <span className={kid.pastFactIcon} aria-hidden="true">📚</span>
                      <div>
                        <div className={kid.pastFactLabel}>Course and level</div>
                        <div className={kid.pastFactValue}>{student.course_name || "No course assigned"} · {formatProficiencyLevel(student.proficiency_level)}</div>
                      </div>
                    </div>
                    <div className={kid.pastFact}>
                      <span className={kid.pastFactIcon} aria-hidden="true">🎟️</span>
                      <div>
                        <div className={kid.pastFactLabel}>Class balance</div>
                        <div className={kid.pastFactValue}>{classesLeft} of {totalClasses} classes remaining</div>
                      </div>
                    </div>
                    <div className={kid.pastFact}>
                      <span className={kid.pastFactIcon} aria-hidden="true">⏱️</span>
                      <div>
                        <div className={kid.pastFactLabel}>Class duration</div>
                        <div className={kid.pastFactValue}>{student.class_duration ? `${student.class_duration} minutes per class` : "Not set"}</div>
                      </div>
                    </div>
                    <div className={kid.pastFact}>
                      <span className={kid.pastFactIcon} aria-hidden="true">📞</span>
                      <div>
                        <div className={kid.pastFactLabel}>Contact</div>
                        <div className={kid.pastFactValue}>{student.contact || "No contact provided"}</div>
                      </div>
                    </div>
                  </div>
                  <div className={kid.historyProgress}>
                    <div className={kid.historyProgressLabel}>
                      <span>Classes used</span><strong>{usedClasses} / {totalClasses}</strong>
                    </div>
                    <div className={kid.historyProgressTrack} role="progressbar" aria-label={`${getStudentName(student)} classes used`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className={kid.historyProgressFill} style={{ width: `${progress}%` }} />
                    </div>
                    <ContractExpiryBadge expiresAt={student.expires_at} size="sm" />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {filteredStudents.length > STUDENTS_PER_PAGE && (
        <div className={kid.teacherStudentPagination}>
          <button
            type="button"
            className={`${kid.btn} ${kid.btnGhost}`}
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={safePage === 1}
          >
            Previous
          </button>
          <span>Page {safePage} of {totalPages}</span>
          <button
            type="button"
            className={`${kid.btn} ${kid.btnGhost}`}
            onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
            disabled={safePage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
