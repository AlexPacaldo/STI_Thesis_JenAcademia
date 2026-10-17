// src/pages/BooksContent.jsx
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styles from "../assets/booksContent.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";
import { apiFetch } from "../utils/apiAuth.js";
import { AuthenticatedFrame, AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { compressFileIfImage } from "../utils/imageCompression.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS, readNamespacedStorageValue } from "../utils/storageKeys.js";
import ModalPortal from "../utils/ModalPortal.jsx";

const API_BASE = API_BASE_URL;
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const getProgressPercentage = (item) => {
  const value = Number(item?.progress_percentage ?? (item?.is_completed ? 100 : 0));
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const isLessonCompleted = (item) => {
  return Boolean(item?.is_completed) || getProgressPercentage(item) >= 100;
};

const getAssetUrl = (url) => {
  if (!url) return "";
  return String(url).startsWith("http") ? url : `${API_BASE}${url}`;
};

const getFileExtension = (fileName) => {
  const cleaned = String(fileName || "").split("?")[0].split("#")[0];
  return cleaned.includes(".") ? cleaned.split(".").pop().toLowerCase() : "";
};

const decodeText = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// Characters of plain-text shown when the preview is capped.
const PREVIEW_TEXT_LIMIT = 1200;

// Pages of a lesson file a student sees inline before full screen takes over.
const STUDENT_PREVIEW_PAGES = 1;


// pageLimit caps how much is rendered inline. Students get 1 page so the
// fullscreen scroll stays a meaningful "I read the whole thing" gate; teachers
// get the whole document.
function InlineFilePreview({ fileUrl, fileName, onRendered, pageLimit = 0 }) {
  const ext = getFileExtension(fileName);
  const [textContent, setTextContent] = useState("");
  const [textStatus, setTextStatus] = useState("idle");

  useEffect(() => {
    let cancelled = false;

    if (!fileUrl) {
      setTextContent("");
      setTextStatus("idle");
      return undefined;
    }

    if (["txt", "md", "csv", "json", "log"].includes(ext)) {
      setTextStatus("loading");
      apiFetch(fileUrl)
        .then((res) => res.text())
        .then((text) => {
          if (!cancelled) {
            setTextContent(text);
            setTextStatus("ready");
            onRendered?.();
          }
        })
        .catch((error) => {
          if (!cancelled) {
            console.error("Error loading text preview:", error);
            setTextStatus("error");
          }
        });
    } else {
      setTextContent("");
      setTextStatus("idle");
    }

    return () => {
      cancelled = true;
    };
  }, [ext, fileUrl, onRendered]);

  if (!fileUrl) return null;

  if (ext === "pdf") {
    return (
      <PdfLessonViewer
        fileUrl={fileUrl}
        title={fileName}
        onRendered={onRendered}
        pageLimit={pageLimit}
      />
    );
  }

  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
    return (
      <div className={styles.imagePreview}>
        <AuthenticatedImage
          src={fileUrl}
          alt={fileName}
          className={styles.previewImage}
          onLoad={onRendered}
        />
      </div>
    );
  }

  if (["txt", "md", "csv", "json", "log"].includes(ext)) {
    // Plain text has no pages, so cap it by characters when a limit is set.
    const isTruncated = pageLimit > 0 && textContent.length > PREVIEW_TEXT_LIMIT;
    const visibleText = isTruncated
      ? `${textContent.slice(0, PREVIEW_TEXT_LIMIT).trimEnd()}\n\n…`
      : textContent;

    return (
      <div className={styles.textPreview}>
        {textStatus === "loading" ? (
          <p className={styles.emptyText}>Loading file preview...</p>
        ) : textStatus === "error" ? (
          <p className={styles.emptyText}>This file could not be loaded.</p>
        ) : (
          <pre>{visibleText}</pre>
        )}
      </div>
    );
  }

  return (
    <AuthenticatedFrame
      src={fileUrl}
      title={`${fileName} preview`}
      className={styles.genericPreview}
      onLoad={onRendered}
    />
  );
}

function PdfLessonViewer({ fileUrl, title, onRendered, pageLimit = 0 }) {
  const containerRef = useRef(null);
  const renderTokenRef = useRef(0);
  const [status, setStatus] = useState("loading");
  const [totalPages, setTotalPages] = useState(0);
  // Bumped on window resize so pages re-fit. A size listener rather than a
  // ResizeObserver on the page container: the container's height grows as pages
  // are appended, so observing it would re-trigger the render that grew it.
  const [sizeVersion, setSizeVersion] = useState(0);

  useEffect(() => {
    const handleResize = () => setSizeVersion((version) => version + 1);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !fileUrl) return undefined;

    const renderToken = renderTokenRef.current + 1;
    renderTokenRef.current = renderToken;
    let cancelled = false;
    let activeDocument = null;

    container.replaceChildren();
    setStatus("loading");

    const renderPdf = async () => {
      try {
        // pdfjs fetches a URL itself and cannot carry the session header, so
        // the bytes come through apiFetch and are handed over as data.
        const response = await apiFetch(fileUrl);
        if (!response.ok) throw new Error(`Could not load file (${response.status})`);
        const loadingTask = pdfjsLib.getDocument({ data: await response.arrayBuffer() });
        const pdf = await loadingTask.promise;
        activeDocument = pdf;
        if (cancelled || renderTokenRef.current !== renderToken) return;
        setTotalPages(pdf.numPages);

        // pageLimit > 0 renders only the first N pages (student preview).
        const lastPage = pageLimit > 0 ? Math.min(pdf.numPages, pageLimit) : pdf.numPages;

        for (let pageNumber = 1; pageNumber <= lastPage; pageNumber += 1) {
          if (cancelled || renderTokenRef.current !== renderToken) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          // Fit to width, not height. A portrait page fitted to the window's
          // height leaves ~570px of empty margin either side and renders the
          // text small; filling the width instead keeps it readable and the
          // reader scrolls down through the document, one tall page at a time.
          const availableWidth = Math.max(container.clientWidth - 8, 320);
          const scale = Math.min(1.6, Math.max(0.8, availableWidth / baseViewport.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          const outputScale = window.devicePixelRatio || 1;

          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = styles.pdfPage;

          const wrapper = document.createElement("div");
          wrapper.className = styles.pdfPageWrap;
          wrapper.appendChild(canvas);
          container.appendChild(wrapper);

          await page.render({
            canvasContext: context,
            viewport,
            transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
          }).promise;
        }

        if (!cancelled && renderTokenRef.current === renderToken) {
          setStatus("ready");
          window.requestAnimationFrame(() => onRendered?.());
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error rendering PDF:", error);
          setStatus("error");
          onRendered?.();
        }
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      activeDocument?.destroy?.();
    };
  }, [fileUrl, onRendered, pageLimit, sizeVersion]);

  const hasMorePages = pageLimit > 0 && totalPages > pageLimit;

  return (
    <div className={styles.pdfViewerShell}>
      {status === "loading" && <p className={styles.emptyText}>Loading file preview...</p>}
      {status === "error" && (
        <div className={styles.documentPreview}>
          <div>
            <h3>{title}</h3>
            <p>This file could not be previewed here. Open it in a separate tab instead.</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className={styles.pdfPages} />
      {hasMorePages && status === "ready" ? (
        <p className={styles.previewPageCount}>
          Showing page 1 of {totalPages}
        </p>
      ) : null}
    </div>
  );
}

export default function BooksContent({ mode = "student" }) {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const [book, setBook] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [completingLessonId, setCompletingLessonId] = useState(null);
  const [activeTeacherTab, setActiveTeacherTab] = useState("content");
  const [studentProgress, setStudentProgress] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [accessError, setAccessError] = useState("");
  const [hasScrolled, setHasScrolled] = useState(false);
  const [autoOpenedLessonId, setAutoOpenedLessonId] = useState(null);
  const [readerContentReady, setReaderContentReady] = useState(false);
  const [selectedLessonAtBottom, setSelectedLessonAtBottom] = useState(false);
  const [showPdfFullscreen, setShowPdfFullscreen] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [uploadingLesson, setUploadingLesson] = useState(false);
  const [lessonData, setLessonData] = useState({
    title: "",
    content: "",
    file: null,
  });
  const fullscreenReaderRef = useRef(null);
  const bottomStabilityTimerRef = useRef(null);
  const STABILITY_DELAY = 250; // ms

  useEffect(() => {
    if (!showPdfFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showPdfFullscreen]);

  const isTeacherView = mode === "teacher";
  // The admin owns the library: only this view may change a book or its lessons.
  const isAdminView = mode === "admin";
  const canManage = isAdminView;
  const isStudentView = mode === "student";

  // This page serves three routes: /booksContent/:bookId (student),
  // /teacherBooksLessons/:bookId (teacher, read-only) and
  // /adminBooksContent/:bookId (admin). Each list has a different path.
  const backRoute = isAdminView
    ? "/AdminDashboard?tab=books"
    : isTeacherView
      ? "/teacherBooksLessons"
      : "/booksLessons";

  const handleBack = () => {
    // Prefer the real history entry so the Dashboard entry point
    // (Dashboard.jsx links straight here) returns to the Dashboard rather than
    // being forced to the books list. Fall back to the list on a direct link or
    // refresh, where there is nothing behind us to go back to.
    const historyIndex = typeof window !== "undefined" ? window.history.state?.idx : 0;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
    } else {
      navigate(backRoute);
    }
  };

  const teacherId = useMemo(() => {
    const storedUser = readStoredUser() || {};
    return readNamespacedStorageValue(STORAGE_KEYS.teacherId, LEGACY_STORAGE_KEYS.teacherId) || storedUser.id || storedUser.user_id || storedUser.userId || null;
  }, []);
  const adminId = useMemo(() => {
    const storedUser = readStoredUser() || {};
    return storedUser.id || storedUser.user_id || storedUser.userId || null;
  }, []);
  const studentId = useMemo(() => {
    const storedUser = readStoredUser() || {};
    return storedUser.id || storedUser.user_id || storedUser.userId || readNamespacedStorageValue(STORAGE_KEYS.studentId, LEGACY_STORAGE_KEYS.studentId) || null;
  }, []);

  // Who the API should treat this session as. Teachers and admins read the book
  // through the same route; the admin additionally gets the write calls.
  const staffQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (isAdminView) {
      if (adminId) params.set("admin_id", String(adminId));
    } else if (teacherId) {
      params.set("teacher_id", String(teacherId));
    }
    return params;
  }, [adminId, isAdminView, teacherId]);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    const loadBookContent = async () => {
      try {
        setLoading(true);
        setAccessError("");

        if (!isTeacherView && !isAdminView) {
          const storedUser = readStoredUser() || {};
          const currentStudentId = storedUser.id || storedUser.user_id || storedUser.userId || studentId;
          const packageResponse = await fetch(`${API_BASE}/api/calendar/student-package/${currentStudentId}`);

          if (packageResponse.ok) {
            const packageData = await packageResponse.json();
            if (Number(packageData.package?.classes_left) <= 0) {
              notify?.("Contact the admin for a new contract to view Books / Lessons.", "error");
              navigate("/Calendar");
              return;
            }
          }
        }

        const accessQuery = !isTeacherView && !isAdminView
          ? studentId
            ? `?student_id=${encodeURIComponent(studentId)}`
            : ""
          : `?${staffQueryParams.toString()}`;
        const lessonQuery = new URLSearchParams({ book_id: bookId });
        if (!isTeacherView && !isAdminView) {
          lessonQuery.set("student_id", studentId);
        } else {
          staffQueryParams.forEach((value, key) => lessonQuery.set(key, value));
        }

        const progressQuery = new URLSearchParams(staffQueryParams);

        const [bookResponse, lessonsResponse, progressResponse] = await Promise.all([
          apiFetch(`${API_BASE}/api/books/${bookId}${accessQuery}`),
          apiFetch(`${API_BASE}/api/lessons?${lessonQuery.toString()}`),
          isAdminView || isTeacherView
            ? apiFetch(`${API_BASE}/api/teacher/book/${bookId}/progress?${progressQuery.toString()}`)
            : apiFetch(`${API_BASE}/api/lesson-progress?student_id=${studentId}&book_id=${bookId}`),
        ]);

        if (bookResponse.status === 403 || lessonsResponse.status === 403) {
          setAccessError("You do not have access to this book.");
          notify?.("You do not have access to this book.", "error");
          return;
        }

        if (!bookResponse.ok) throw new Error("Failed to fetch book");
        if (!lessonsResponse.ok) throw new Error("Failed to fetch lessons");

        const bookData = await bookResponse.json();
        const lessonsData = await lessonsResponse.json();
        const lessonsList = lessonsData.lessons || [];

        setBook(bookData.book);
        setLessons(lessonsList);
        setSelectedLesson(lessonsList[0] || null);

        if (!progressResponse?.ok) return;

        const progressData = await progressResponse.json();

        if (isAdminView || isTeacherView) {
          setStudentProgress(progressData.students || []);
          return;
        }

        const progressMap = {};
        (progressData.progress || []).forEach((item) => {
          progressMap[item.lesson_id] = item;
        });
        setProgress(progressMap);
      } catch (err) {
        console.error("Error loading book content:", err);
        notify?.(`Error: ${err.message}`, "error");
      } finally {
        setLoading(false);
      }
    };

    loadBookContent();
  }, [bookId, isAdminView, isTeacherView, navigate, notify, staffQueryParams, studentId]);

  useEffect(() => {
    if (!activeTeacherTab || activeTeacherTab !== "progress" || !bookId) return;

    const loadStudentProgress = async () => {
      try {
        setProgressLoading(true);
        setProgressError("");

        const response = await apiFetch(`${API_BASE}/api/teacher/book/${bookId}/progress?${staffQueryParams.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch student progress");

        const data = await response.json();
        setStudentProgress(data.students || []);
      } catch (err) {
        console.error("Error loading student progress:", err);
        setProgressError(err.message || "Failed to load student progress.");
      } finally {
        setProgressLoading(false);
      }
    };

    loadStudentProgress();
  }, [activeTeacherTab, bookId, staffQueryParams]);

  const selectedFileUrl = useMemo(() => {
    if (!selectedLesson?.file_path) return "";
    return `${API_BASE}${selectedLesson.file_path}`;
  }, [selectedLesson]);

  const selectedFileName = useMemo(() => {
    if (!selectedLesson?.file_path) return "";
    return selectedLesson.file_path.split("/").pop()?.replace(/^\d+-/, "") || "Lesson material";
  }, [selectedLesson]);

  const fileExtension = useMemo(() => getFileExtension(selectedFileName), [selectedFileName]);

  const selectedLessonId = selectedLesson?.lesson_id;
  const selectedLessonCompleted = selectedLessonId ? isLessonCompleted(progress[selectedLessonId]) : false;
  const lessonRequiresScroll = Boolean(selectedFileUrl);
  const selectedLessonReadReady = (() => {
    if (!selectedLessonId) return false;
    if (selectedLessonCompleted) return true;

    if (lessonRequiresScroll) {
      return readerContentReady && selectedLessonAtBottom;
    }

    // If lesson does NOT require scrolling, allow readiness only if
    // the lesson was not auto-opened, or the user has interacted (scrolled).
    return !autoOpenedLessonId || hasScrolled;
  })();

  const isReaderAtBottom = useCallback((viewport) => {
    if (!viewport) return false;

    const contentFits = viewport.scrollHeight <= viewport.clientHeight + 12;
    if (contentFits) return true;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return distanceFromBottom <= 12;
  }, []);

  // Called when the user actually scrolls the viewport.
  const handleFullscreenScroll = useCallback(() => {
    setHasScrolled(true);
    // If this lesson was auto-opened, clear the auto-open block on actual user interaction.
    if (autoOpenedLessonId === selectedLessonId) {
      setAutoOpenedLessonId(null);
    }

    const viewport = fullscreenReaderRef.current;
    if (!viewport || !selectedLessonId || !lessonRequiresScroll) return;
    if (!readerContentReady) return;

    const atBottom = isReaderAtBottom(viewport);
    setSelectedLessonAtBottom(atBottom);

    // If at bottom, start a short stability timer before enabling the button.
    if (atBottom) {
      if (bottomStabilityTimerRef.current) {
        clearTimeout(bottomStabilityTimerRef.current);
        bottomStabilityTimerRef.current = null;
      }

      bottomStabilityTimerRef.current = window.setTimeout(() => {
        const vp = fullscreenReaderRef.current;
        if (!vp) return;
        setSelectedLessonAtBottom(isReaderAtBottom(vp));

        bottomStabilityTimerRef.current = null;
      }, STABILITY_DELAY);
    } else {
      setSelectedLessonAtBottom(false);
      if (bottomStabilityTimerRef.current) {
        clearTimeout(bottomStabilityTimerRef.current);
        bottomStabilityTimerRef.current = null;
      }
    }
  }, [autoOpenedLessonId, isReaderAtBottom, lessonRequiresScroll, readerContentReady, selectedLessonId]);

  // Called when the content finishes rendering (not a user scroll).
  const handleRendered = useCallback(() => {
    setReaderContentReady(true);
    window.requestAnimationFrame(() => {
      setSelectedLessonAtBottom(isReaderAtBottom(fullscreenReaderRef.current));
    });
  }, [isReaderAtBottom]);

  // If the PDF renderer places its own scrollable container inside the
  // fullscreen reader, attach a scroll listener directly to it so user
  // scrolls inside the PDF are detected immediately.
  useEffect(() => {
    if (!showPdfFullscreen || !selectedLessonId) return undefined;

    const viewport = fullscreenReaderRef.current;
    if (!viewport) return undefined;

    const pdfInner = viewport.querySelector?.(`.${styles.pdfPages}`) || null;
    if (!pdfInner) return undefined;

    // Use the existing handler reference.
    pdfInner.addEventListener("scroll", handleFullscreenScroll, { passive: true });
    return () => {
      pdfInner.removeEventListener("scroll", handleFullscreenScroll);
    };
  }, [showPdfFullscreen, selectedLessonId, handleFullscreenScroll]);

  useEffect(() => {
    if (!showPdfFullscreen || !selectedLessonId) return undefined;

    // Reset reader state when opening a lesson in fullscreen.
    setHasScrolled(false);
    setReaderContentReady(false);
    setSelectedLessonAtBottom(false);

    const resetScroll = window.setTimeout(() => {
      const viewport = fullscreenReaderRef.current;
      if (!viewport) return;

      viewport.scrollTop = 0;
    }, 120);

    return () => {
      window.clearTimeout(resetScroll);
      if (bottomStabilityTimerRef.current) {
        clearTimeout(bottomStabilityTimerRef.current);
        bottomStabilityTimerRef.current = null;
      }
    };
  }, [selectedLessonId, selectedFileUrl, showPdfFullscreen]);

  const handleLessonClick = (lesson) => {
    if (isStudentView) {
      const lessonIndex = lessons.findIndex((item) => item.lesson_id === lesson.lesson_id);
      const previousLesson = lessons[lessonIndex - 1];
      const isLocked = lessonIndex > 0 && !isLessonCompleted(progress[previousLesson?.lesson_id]);

      if (isLocked) {
        notify?.("Please complete the previous lesson first.", "warning");
        return;
      }
    }

    setSelectedLesson(lesson);
    setShowPdfFullscreen(false);
    // Manual selection clears any auto-open block and reader-ready state.
    setAutoOpenedLessonId(null);
    setReaderContentReady(false);
    setSelectedLessonAtBottom(false);
  };

  const markLessonComplete = async () => {
    if (!selectedLesson || !isStudentView || selectedLessonCompleted) return;
    const readerAtBottomNow = !lessonRequiresScroll || (
      readerContentReady && isReaderAtBottom(fullscreenReaderRef.current)
    );
    if (!selectedLessonReadReady || !readerAtBottomNow) {
      setSelectedLessonAtBottom(false);
      notify?.("Please scroll to the bottom of the lesson file before marking it complete.", "warning");
      return;
    }

    try {
      const completedLesson = selectedLesson;
      const currentLessonIndex = lessons.findIndex(
        (lesson) => lesson.lesson_id === completedLesson.lesson_id
      );
      const nextLesson = lessons[currentLessonIndex + 1] || null;

      setCompletingLessonId(completedLesson.lesson_id);

      const response = await apiFetch(`${API_BASE}/api/lesson-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          lesson_id: completedLesson.lesson_id,
          is_completed: 1,
          status: "Completed",
        }),
      });

      if (!response.ok) throw new Error("Failed to complete lesson");

      const data = await response.json();
      const completedProgress = data.progress || {
        student_id: studentId,
        lesson_id: completedLesson.lesson_id,
        progress_percentage: 100,
        is_completed: 1,
      };

      setProgress((current) => ({
        ...current,
        [completedLesson.lesson_id]: completedProgress,
      }));

      if (nextLesson) {
        setSelectedLesson(nextLesson);
        // Mark that this lesson was auto-opened so we don't immediately allow marking
        // it as complete until the user interacts (scrolls). Also reset the
        // hasScrolled and reader-ready flags so leftover scroll state from the
        // previous lesson doesn't unintentionally enable the button.
        setAutoOpenedLessonId(nextLesson.lesson_id);
        setHasScrolled(false);
        setReaderContentReady(false);
        setSelectedLessonAtBottom(false);
        notify?.("Lesson completed. Next lesson unlocked.", "success");
      } else {
        notify?.("Lesson marked as completed.", "success");
      }
    } catch (err) {
      console.error("Error completing lesson:", err);
      notify?.(`Error: ${err.message}`, "error");
    } finally {
      setCompletingLessonId(null);
    }
  };

  const getCompletionPercentage = () => {
    if (lessons.length === 0) return 0;
    const completedCount = lessons.filter((lesson) =>
      isLessonCompleted(progress[lesson.lesson_id])
    );
    return Math.round((completedCount.length / lessons.length) * 100);
  };

  const handleLessonFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setLessonData({ ...lessonData, file: null });
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.type)) {
      notify?.("Only PDF, DOC, DOCX, and TXT files are allowed", "error");
      e.target.value = "";
      return;
    }

    setLessonData({ ...lessonData, file });
  };

  const reloadLessons = async () => {
    const lessonQuery = new URLSearchParams({ book_id: bookId });
    staffQueryParams.forEach((value, key) => lessonQuery.set(key, value));

    const lessonsResponse = await apiFetch(`${API_BASE}/api/lessons?${lessonQuery.toString()}`);
    if (!lessonsResponse.ok) return;

    const lessonsData = await lessonsResponse.json();
    setLessons(lessonsData.lessons || []);
  };

  const handleUploadLesson = async () => {
    if (!lessonData.title.trim()) {
      notify?.("Lesson title is required", "error");
      return;
    }

    if (!lessonData.file) {
      notify?.("Please select a file to upload", "error");
      return;
    }

    try {
      setUploadingLesson(true);

      const formData = new FormData();
      formData.append("book_id", bookId);
      formData.append("title", lessonData.title);
      formData.append("content", lessonData.content || "");
      const uploadFile = await compressFileIfImage(lessonData.file);
      formData.append("file", uploadFile, uploadFile.name);
      if (adminId) {
        formData.append("admin_id", String(adminId));
      }

      const response = await apiFetch(`${API_BASE}/api/lessons`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to create lesson");
      }

      notify?.("Lesson uploaded successfully!", "success");
      setShowLessonModal(false);
      setLessonData({
        title: "",
        content: "",
        file: null,
      });
      await reloadLessons();
    } catch (err) {
      console.error("Error uploading lesson:", err);
      notify?.(`Error: ${err.message}`, "error");
    } finally {
      setUploadingLesson(false);
    }
  };

  const handleDeleteLesson = async (lesson) => {
    if (!window.confirm(`Delete lesson "${lesson.title}"? Students' progress on it is removed too.`)) {
      return;
    }

    try {
      const response = await apiFetch(
        `${API_BASE}/api/lessons/${lesson.lesson_id}?admin_id=${encodeURIComponent(adminId)}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete lesson");

      notify?.("Lesson deleted", "success");
      await reloadLessons();
    } catch (err) {
      console.error("Error deleting lesson:", err);
      notify?.(`Error: ${err.message}`, "error");
    }
  };

  if (loading) {
    return (
      <div className={styles.Center}>
        <p className={styles.stateMessage}>Loading lessons...</p>
      </div>
    );
  }

  if (!bookId || !book) {
    return (
      <div className={styles.Center}>
        <p className={styles.stateMessage}>{accessError || "Book not found."}</p>
      </div>
    );
  }

  return (
    <div className={styles.Center}>
      <div className={styles.CenterContent}>
        <button type="button" className={styles.backButton} onClick={handleBack}>
          <i className="bi bi-arrow-left" aria-hidden="true" />
          <span>
            {isAdminView ? "Back to Book Library" : isTeacherView ? "Back to My Books" : "Back to Books"}
          </span>
        </button>

        <div className={styles.TopContent}>
          <div className={styles.Teacher}>
            {book.cover_url ? (
              <img src={`${API_BASE}${book.cover_url}`} alt="Book cover" className={styles.bookCoverImg} />
            ) : (
              <img src={teacherPic} alt="Teacher" />
            )}
            <div className={styles.bookTitleGroup}>
              <div className={styles.bookTitleRow}>
                <h1><b>{book.title}</b></h1>
                {canManage && (
                  <button
                    type="button"
                    className={styles.changeCoverBtn}
                    onClick={() => setShowCoverModal(true)}
                  >
                    Change Cover
                  </button>
                )}
              </div>
              <p>
                {isAdminView
                  ? `Distributed to ${book.teacher_names || "nobody yet"}`
                  : isTeacherView
                    ? book.course_name || "Assigned to you"
                    : book.author || "Your Teacher"}
              </p>
            </div>
          </div>
          <div className={styles.Date}>
            <h1><b>{lessons.length}</b></h1>
            <p>{lessons.length === 1 ? "Lesson" : "Lessons"}</p>
          </div>
        </div>

        {isStudentView && (
          <div className={styles.progressContainer}>
            <h3>Your Progress: {getCompletionPercentage()}% completed</h3>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${getCompletionPercentage()}%` }}
              />
            </div>
          </div>
        )}

        {!isStudentView && (
          <div className={styles.teacherTabs} role="tablist" aria-label="Teacher book sections">
            <button
              type="button"
              className={`${styles.teacherTab} ${activeTeacherTab === "content" ? styles.activeTeacherTab : ""}`}
              onClick={() => setActiveTeacherTab("content")}
              role="tab"
              aria-selected={activeTeacherTab === "content"}
            >
              Lesson Content
            </button>
            <button
              type="button"
              className={`${styles.teacherTab} ${activeTeacherTab === "progress" ? styles.activeTeacherTab : ""}`}
              onClick={() => setActiveTeacherTab("progress")}
              role="tab"
              aria-selected={activeTeacherTab === "progress"}
            >
              See Students Progress
            </button>
          </div>
        )}

        {!isStudentView && activeTeacherTab === "progress" ? (
          <section className={styles.progressPanel}>
            <div className={styles.progressPanelHeader}>
              <div>
                <h2>Students Progress</h2>
                <p>{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"} in this book</p>
              </div>
            </div>

            {progressLoading ? (
              <p className={styles.emptyText}>Loading student progress...</p>
            ) : progressError ? (
              <p className={styles.emptyText}>{progressError}</p>
            ) : studentProgress.length === 0 ? (
              <p className={styles.emptyText}>No active students are enrolled in this book's course yet.</p>
            ) : (
              <div className={styles.progressTableWrap}>
                <table className={styles.progressTable}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Completed Lessons</th>
                      <th>Status</th>
                      <th>Lesson Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentProgress.map((student) => (
                      <tr
                        key={student.studentId}
                        className={student.courseCompleted ? styles.courseCompletedRow : ""}
                      >
                        <td>
                          <div className={styles.studentCell}>
                            {student.profileImageUrl ? (
                              <img src={getAssetUrl(student.profileImageUrl)} alt={student.name} />
                            ) : (
                              <div className={styles.studentInitial}>
                                {(student.name || "S").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <strong>{student.name}</strong>
                              <span>{student.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.progressCount}>
                            <strong>{student.completedLessons} / {student.totalLessons} Lessons</strong>
                            <span>{student.progressPercentage}% Complete</span>
                            <div className={styles.tableProgressBar}>
                              <div style={{ width: `${student.progressPercentage}%` }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${student.courseCompleted ? styles.statusDone : ""}`}>
                            {student.status}
                          </span>
                        </td>
                        <td>
                          <div className={styles.lessonBreakdown}>
                            {student.lessons.map((lesson) => (
                              <span
                                key={lesson.lessonId}
                                className={lesson.isCompleted ? styles.lessonDone : styles.lessonPending}
                              >
                                L{lesson.lessonNumber}: {lesson.isCompleted ? "Done" : "Pending"}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
        <div className={styles.bookLayout}>
          <aside className={styles.lessonsList}>
            <div className={styles.lessonsHeader}>
              <h3>Lessons</h3>
              {canManage && (
                <button
                  type="button"
                  className={styles.uploadLessonBtn}
                  onClick={() => setShowLessonModal(true)}
                >
                  + Upload Lesson
                </button>
              )}
            </div>
            <div className={styles.lessonsContainer}>
              {lessons.length === 0 && (
                <p className={styles.emptyText}>No lessons uploaded for this book yet.</p>
              )}

              {lessons.map((lesson) => {
                const isCompleted = isLessonCompleted(progress[lesson.lesson_id]);
                const lessonIndex = lessons.findIndex((item) => item.lesson_id === lesson.lesson_id);
                const previousLesson = lessons[lessonIndex - 1];
                const isLocked = isStudentView && lessonIndex > 0 && !isLessonCompleted(progress[previousLesson?.lesson_id]);

                return (
                  <div
                    key={lesson.lesson_id}
                    className={styles.lessonRow}
                  >
                    <button
                      type="button"
                      className={`${styles.lessonButton} ${
                        selectedLesson?.lesson_id === lesson.lesson_id ? styles.active : ""
                      } ${isCompleted ? styles.completed : ""} ${isLocked ? styles.locked : ""}`}
                      onClick={() => handleLessonClick(lesson)}
                      aria-disabled={isLocked}
                    >
                      <span className={styles.lessonNumber}>Lesson {lesson.lesson_number}</span>
                      <span className={styles.lessonTitle}>{lesson.title}</span>
                      {isStudentView && (
                        <span className={styles.lessonProgressText}>
                          {isLocked ? "Locked" : isCompleted ? "Completed" : "In Progress"}
                        </span>
                      )}
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className={styles.deleteLessonBtn}
                        onClick={() => handleDeleteLesson(lesson)}
                        aria-label={`Delete lesson ${lesson.lesson_number}`}
                        title="Delete lesson"
                      >
                        <i className="bi bi-trash" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          <main className={styles.bookContent}>
            {selectedLesson ? (
              <>
                <div className={styles.lessonHeader}>
                  <span>Lesson {selectedLesson.lesson_number}</span>
                  <h2>{selectedLesson.title}</h2>
                </div>

                {selectedLesson.content && (
                  <p className={styles.lessonContent}>{selectedLesson.content}</p>
                )}

                <section
                  className={styles.readerViewport}
                  aria-label="Lesson reading area"
                >
                {selectedFileUrl ? (
                  <section className={styles.fileSection}>
                    <div className={styles.fileInfo}>
                      <h3>Uploaded File</h3>
                    </div>

                    <div className={styles.fileActions}>
                        <button
                          type="button"
                          className={styles.fileActionBtn}
                          onClick={() => setShowPdfFullscreen(true)}
                        >
                          Full screen
                        </button>
                      </div>

                      {!isStudentView ? (
                      <InlineFilePreview
                        fileUrl={selectedFileUrl}
                        fileName={selectedFileName}
                      />
                    ) : (
                        <>
                          {/* First page only: lesson completion is gated on the
                              fullscreen reader reaching the bottom, so showing
                              the whole file here would make that check moot. */}
                          <InlineFilePreview
                            fileUrl={selectedFileUrl}
                            fileName={selectedFileName}
                            pageLimit={STUDENT_PREVIEW_PAGES}
                          />
                          {/* No second "Open full screen" button here - the
                              file actions above already have one. Only the
                              progress rule is worth stating, since a student
                              can't otherwise tell why reading here won't
                              count. */}
                          <p className={styles.progressHint}>
                            <i className="bi bi-info-circle" aria-hidden="true" />
                            Reading progress is recorded in full screen mode.
                          </p>
                        </>
                      )}
                    </section>
                  ) : (
                    <div className={styles.noPreview}>
                      <p>No file was uploaded for this lesson.</p>
                    </div>
                  )}
                </section>

              </>
            ) : (
              <p className={styles.emptyText}>Select a lesson to view its uploaded file.</p>
            )}
          </main>
        </div>
        )}
      </div>

      {/* Change Cover Modal (teacher only) */}
      {showCoverModal && (
        <ModalPortal>
          <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Change Book Cover</h2>
            <label>
              Select cover image:
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              />
            </label>

            <div className={styles.modalButtons}>
              <button
                onClick={async () => {
                  if (!coverFile) {
                    notify?.("Please choose an image file", "error");
                    return;
                  }

                  try {
                    const fd = new FormData();
                    const compressedCover = await compressFileIfImage(coverFile);
                    fd.append("cover", compressedCover, compressedCover.name);
                    if (adminId) {
                      fd.append("admin_id", String(adminId));
                    }

                    const res = await apiFetch(`${API_BASE}/api/books/${book.book_id}`, {
                      method: "PUT",
                      body: fd,
                    });

                    if (!res.ok) throw new Error("Failed to upload cover");

                    notify?.("Cover updated", "success");
                    setShowCoverModal(false);
                    setCoverFile(null);
                    // reload book
                    const bookQuery = new URLSearchParams(staffQueryParams);
                    const bk = await (
                      await apiFetch(`${API_BASE}/api/books/${bookId}?${bookQuery.toString()}`)
                    ).json();
                    setBook(bk.book);
                  } catch (err) {
                    console.error(err);
                    notify?.(`Error: ${err.message}`, "error");
                  }
                }}
                className={styles.confirmBtn}
              >
                Save
              </button>
              <button onClick={() => { setShowCoverModal(false); setCoverFile(null); }} className={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* Upload Lesson Modal */}
      {showLessonModal && (
        <ModalPortal>
          <div className={styles.modal}>
          <div className={`${styles.modalContent} ${styles.lessonModalContent}`}>
            <h2>Upload Lesson</h2>
            <p className={styles.autoLessonNote}>
              The lesson number will be assigned automatically.
            </p>

            <label>
              Lesson Title:
              <input
                className={styles.lessonInput}
                type="text"
                placeholder="Enter lesson title"
                value={lessonData.title}
                onChange={(e) =>
                  setLessonData({ ...lessonData, title: e.target.value })
                }
              />
            </label>

            <label>
              File:
              <input
                className={styles.lessonInput}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleLessonFileChange}
              />
            </label>

            {lessonData.file && (
              <p className={styles.selectedFileName}>{lessonData.file.name}</p>
            )}

            <label>
              Description (optional):
              <textarea
                className={styles.lessonTextarea}
                placeholder="Write additional notes for this lesson..."
                value={lessonData.content}
                onChange={(e) =>
                  setLessonData({ ...lessonData, content: e.target.value })
                }
              />
            </label>

            <div className={styles.modalButtons}>
              <button
                type="button"
                onClick={handleUploadLesson}
                className={styles.confirmBtn}
                disabled={uploadingLesson}
              >
                {uploadingLesson ? "Uploading..." : "Upload"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLessonModal(false);
                  setLessonData({
                    title: "",
                    content: "",
                    file: null,
                  });
                }}
                className={styles.cancelBtn}
              >
                Cancel
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {showPdfFullscreen && selectedFileUrl && (
        <ModalPortal>
          <div className={styles.fullscreenPdf}>
          <div className={styles.fullscreenHeader}>
            <div>
              <h2>{selectedLesson?.title || "Lesson file"}</h2>
              <p>{decodeText(selectedFileName)}</p>
            </div>
            <div className={styles.fullscreenActions}>
              {isStudentView && (
                <>
                  <span className={`${styles.lessonStatus} ${selectedLessonCompleted ? styles.statusCompleted : ""}`}>
                    {selectedLessonCompleted ? "Completed" : selectedLessonReadReady ? "Ready to complete" : "Read to the end"}
                  </span>
                  <button
                    type="button"
                    className={`${styles.completeBtn} ${selectedLessonCompleted ? styles.completedBtn : ""}`}
                    onClick={markLessonComplete}
                    disabled={selectedLessonCompleted || !selectedLessonReadReady || completingLessonId === selectedLesson?.lesson_id}
                  >
                    {selectedLessonCompleted
                      ? "Completed"
                      : completingLessonId === selectedLesson?.lesson_id
                        ? "Saving..."
                        : "Mark as Complete"}
                  </button>
                </>
              )}
              <button type="button" onClick={() => setShowPdfFullscreen(false)}>
                Close
              </button>
            </div>
          </div>

          <div
            className={styles.fullscreenReader}
            onScroll={handleFullscreenScroll}
            ref={fullscreenReaderRef}
          >
            {fileExtension === "pdf" ? (
              <PdfLessonViewer
                fileUrl={selectedFileUrl}
                title={selectedLesson?.title || "Lesson file"}
                onRendered={handleRendered}
              />
            ) : fileExtension && ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(fileExtension) ? (
              <div className={styles.imagePreview}>
                <AuthenticatedImage
                  src={selectedFileUrl}
                  alt={selectedFileName}
                  className={styles.previewImage}
                  onLoad={handleRendered}
                />
              </div>
            ) : fileExtension && ["txt", "md", "csv", "json", "log"].includes(fileExtension) ? (
              <InlineFilePreview
                fileUrl={selectedFileUrl}
                fileName={selectedFileName}
                onRendered={handleRendered}
              />
            ) : (
              <AuthenticatedFrame
                src={selectedFileUrl}
                title={`${selectedFileName} preview`}
                className={styles.genericPreview}
                onLoad={handleRendered}
              />
            )}
          </div>
          </div>
        </ModalPortal>
      )}

    </div>
  );
}
