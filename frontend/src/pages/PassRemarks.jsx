// src/pages/PassRemarks.jsx
import { useEffect, useState } from "react";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/teacherSchedule.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;

function studentProfileSrc(student) {
  const url = student?.profileImageUrl || student?.profile_image_url || student?.profile_picture;
  if (!url) return userPic;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url.startsWith("/") || url.startsWith("uploads/") ? "" : "/"}${url}`;
}

function remarkProfileSrc(url) {
  if (!url) return userPic;
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/uploads/")) return `${API}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API}/${cleaned}`;
  return cleaned;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatClockTime(value) {
  if (!value) return null;
  const [hour, minute] = String(value).split(":");
  if (hour == null || minute == null) return null;
  const hourNumber = parseInt(hour, 10);
  if (Number.isNaN(hourNumber)) return null;
  const ampm = hourNumber >= 12 ? "PM" : "AM";
  return `${((hourNumber + 11) % 12) + 1}:${minute}${ampm}`;
}

export default function PassRemarks() {
  const { notify } = useNotification() || {};
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [remarks, setRemarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teacherId, setTeacherId] = useState(null);

  // Remark history: what this teacher has written, with edit/archive controls.
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const user = readStoredUser();
    if (!user) {
      setError("Please log in first.");
      setLoading(false);
      return;
    }

    const currentUserId = user.id || user.user_id || null;
    if (!currentUserId || user.role !== "teacher") {
      setError("Remarks are available only for teachers.");
      setLoading(false);
      return;
    }

    setTeacherId(currentUserId);
    fetch(`${API}/api/teacher/${currentUserId}/students`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Failed to load students.");
        }
        return res.json();
      })
      .then((data) => {
        setStudents(data.students || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Failed to load student list.");
        setLoading(false);
      });
  }, []);

  const selectedStudent = students.find((student) => student.user_id === selectedStudentId) || null;

  const loadHistory = async (studentId, filter = historyFilter) => {
    if (!teacherId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({ status: filter });
      if (studentId) params.set("student_id", String(studentId));
      const res = await fetch(`${API}/api/teacher/${teacherId}/remarks?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to load remark history.");
      setHistory(data.remarks || []);
    } catch (err) {
      console.error(err);
      setHistoryError(err.message || "Failed to load remark history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // Reload the list whenever the selected student or the filter changes.
  useEffect(() => {
    loadHistory(selectedStudentId, historyFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId, historyFilter, teacherId]);

  const runRemarkAction = async (remarkId, action, successMessage) => {
    if (!teacherId) return false;
    setBusyId(remarkId);
    try {
      const res = await fetch(`${API}/api/teacher/remarks/${remarkId}${action}`, {
        method: action ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_id: teacherId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify?.(data.message || "That action could not be completed.", "error");
        return false;
      }
      notify?.(data.message || successMessage, "success");
      await loadHistory(selectedStudentId, historyFilter);
      return true;
    } catch (err) {
      console.error(err);
      notify?.("Server error while updating the remark.", "error");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const startEditing = (remark) => {
    setEditingId(remark.remark_id);
    setDraftText(remark.remarks || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftText("");
  };

  const saveEdit = async (remark) => {
    const text = draftText.trim();
    if (!text) {
      notify?.("Remark text cannot be empty.", "warning");
      return;
    }
    if (text === (remark.remarks || "").trim()) {
      cancelEditing();
      return;
    }

    setBusyId(remark.remark_id);
    try {
      const res = await fetch(`${API}/api/teacher/remarks/${remark.remark_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_id: teacherId, remarks: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify?.(data.message || "Could not update the remark.", "error");
        return;
      }
      notify?.(data.message || "Remark updated.", "success");
      cancelEditing();
      await loadHistory(selectedStudentId, historyFilter);
    } catch (err) {
      console.error(err);
      notify?.("Server error while updating the remark.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemarkChange = (text) => {
    if (!selectedStudentId) return;
    setRemarks((prev) => ({ ...prev, [selectedStudentId]: text }));
  };

  const handleSubmit = async () => {
    if (!selectedStudentId) {
      notify("Select a student first.", "warning");
      return;
    }

    const text = (remarks[selectedStudentId] || "").trim();
    if (text === "") {
      notify("Please write a remark before submitting.", "warning");
      return;
    }

    if (!teacherId) {
      notify("Teacher information is missing.", "error");
      return;
    }

    try {
      const classRes = await fetch(
        `${API}/api/teacher/${teacherId}/student/${selectedStudentId}/latest-class`
      );
      if (!classRes.ok) {
        const errData = await classRes.json().catch(() => ({}));
        notify(errData.message || "No class available for this student.", "warning");
        return;
      }

      const { class: latestClass } = await classRes.json();
      if (!latestClass || !latestClass.class_id) {
        notify("No class found for this student.", "warning");
        return;
      }

      const submitRes = await fetch(`${API}/api/calendar/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: latestClass.class_id,
          teacher_id: teacherId,
          student_id: selectedStudentId,
          remarks: text,
          rating: null,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        notify(submitData.message || "Could not submit remark.", "error");
        return;
      }

      notify("Remark submitted successfully!", "success");
      setRemarks((prev) => ({ ...prev, [selectedStudentId]: "" }));
      await loadHistory(selectedStudentId, historyFilter);
    } catch (err) {
      console.error(err);
      notify("Server error while submitting remark.", "error");
    }
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        <div className={styles.leftCard}>
          <div style={{ padding: 16 }}>
            <h2>Enrolled Students</h2>
            {loading && <p>Loading students...</p>}
            {error && <p style={{ color: "#dc2626" }}>{error}</p>}
            {!loading && !error && students.length === 0 && (
              <p>No students are currently assigned to this teacher.</p>
            )}
          </div>
          <div className={styles.studentList}>
            {students.map((student) => (
              <div
                key={student.user_id}
                className={`${styles.boxCard} ${selectedStudentId === student.user_id ? styles.selected : ""}`}
                onClick={() => setSelectedStudentId(student.user_id)}
                style={{ cursor: "pointer" }}
              >
                <div className={styles.studentSummary}>
                  <img
                    src={studentProfileSrc(student)}
                    alt={`${student.first_name} ${student.last_name}`}
                    className={styles.studentAvatar}
                    onError={(event) => {
                      event.currentTarget.src = userPic;
                    }}
                  />
                  <div className={styles.studentMeta}>
                    <h1>{`${student.first_name} ${student.last_name}`}</h1>
                    <p>{student.email}</p>
                  </div>
                </div>
                <p className={styles.enrollmentText}>Enrolled with you</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.rightCard}>
          <div className={styles.rightContent}>
            {selectedStudent ? (
              <>
                <div className={styles.user}>
                  <img
                    src={studentProfileSrc(selectedStudent)}
                    alt={`${selectedStudent.first_name} ${selectedStudent.last_name}`}
                  />
                  <h1>{`${selectedStudent.first_name} ${selectedStudent.last_name}`}</h1>
                </div>

                <div className={styles.bottomInfo}>
                  <div className={styles.remarksBox}>
                    <h1>Remarks:</h1>
                    <textarea
                      id="comment"
                      className={styles.commentBox}
                      placeholder="Write your remarks here..."
                      value={remarks[selectedStudentId] || ""}
                      onChange={(e) => handleRemarkChange(e.target.value)}
                    />
                    <button className={styles.submitComment} onClick={handleSubmit}>
                      Submit Remarks
                    </button>
                  </div>

                  <div className={styles.historyPanel}>
                    <div className={styles.historyHeader}>
                      <h1>Remarks you&apos;ve placed</h1>
                      <div className={styles.historyFilters} role="tablist" aria-label="Filter remarks">
                        {["active", "archived", "all"].map((filter) => (
                          <button
                            key={filter}
                            type="button"
                            role="tab"
                            aria-selected={historyFilter === filter}
                            className={`${styles.historyFilter} ${historyFilter === filter ? styles.historyFilterActive : ""}`}
                            onClick={() => setHistoryFilter(filter)}
                          >
                            {filter === "active" ? "Active" : filter === "archived" ? "Archived" : "All"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {historyLoading && <p className={styles.historyHint}>Loading remarks…</p>}
                    {historyError && <p className={styles.historyError}>{historyError}</p>}

                    {!historyLoading && !historyError && history.length === 0 ? (
                      <p className={styles.historyHint}>
                        {historyFilter === "archived"
                          ? "No archived remarks."
                          : "You haven't written a remark for this student yet."}
                      </p>
                    ) : null}

                    <ul className={styles.historyList}>
                      {history.map((remark) => {
                        const isArchived = remark.status === "archived";
                        const isEditing = editingId === remark.remark_id;
                        const isBusy = busyId === remark.remark_id;
                        const classTime = formatClockTime(remark.start_time);

                        return (
                          <li
                            key={remark.remark_id}
                            className={`${styles.historyItem} ${isArchived ? styles.historyItemArchived : ""}`}
                          >
                            <div className={styles.historyItemTop}>
                              <div className={styles.historyIdentity}>
                                <img
                                  src={remarkProfileSrc(remark.student_profile_image_url)}
                                  alt=""
                                  onError={(event) => {
                                    event.currentTarget.src = userPic;
                                  }}
                                />
                                <div>
                                  <p className={styles.historyStudent}>{remark.student_name}</p>
                                  <p className={styles.historyClass}>
                                    {remark.class_name || "Class removed"}
                                    {classTime ? ` · ${classTime}` : ""}
                                  </p>
                                </div>
                              </div>

                              <div className={styles.historyBadges}>
                                {isArchived ? (
                                  <span className={`${styles.historyBadge} ${styles.badgeArchived}`}>Archived</span>
                                ) : null}
                                {remark.was_edited && !isArchived ? (
                                  <span className={styles.historyBadge}>Edited</span>
                                ) : null}
                              </div>
                            </div>

                            {isEditing ? (
                              <div className={styles.historyEditor}>
                                <textarea
                                  className={styles.commentBox}
                                  value={draftText}
                                  onChange={(event) => setDraftText(event.target.value)}
                                  disabled={isBusy}
                                  aria-label="Edit remark text"
                                />
                                <div className={styles.historyActions}>
                                  <button
                                    type="button"
                                    className={styles.historyActionGhost}
                                    onClick={cancelEditing}
                                    disabled={isBusy}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.historyActionPrimary}
                                    onClick={() => saveEdit(remark)}
                                    disabled={isBusy}
                                  >
                                    {isBusy ? "Saving…" : "Save changes"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className={styles.historyText}>{remark.remarks}</p>
                            )}

                            <div className={styles.historyFooter}>
                              <span className={styles.historyStamp}>
                                {isArchived && remark.archived_at
                                  ? `Archived ${formatDateTime(remark.archived_at)}`
                                  : `Submitted ${formatDateTime(remark.created_at)}`}
                              </span>

                              {!isEditing ? (
                                <div className={styles.historyActions}>
                                  {isArchived ? (
                                    <>
                                      <button
                                        type="button"
                                        className={styles.historyActionGhost}
                                        onClick={() => runRemarkAction(remark.remark_id, "/restore", "Remark restored.")}
                                        disabled={isBusy}
                                      >
                                        Restore
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.historyActionDanger}
                                        onClick={() => runRemarkAction(remark.remark_id, "", "Remark deleted.")}
                                        disabled={isBusy}
                                      >
                                        Delete
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className={styles.historyActionGhost}
                                        onClick={() => startEditing(remark)}
                                        disabled={isBusy}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.historyActionDanger}
                                        onClick={() => runRemarkAction(remark.remark_id, "/archive", "Remark archived.")}
                                        disabled={isBusy}
                                      >
                                        Archive
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 20 }}>
                <h2>Select a student to view details and add remarks</h2>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
