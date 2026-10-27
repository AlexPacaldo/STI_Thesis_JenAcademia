import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/account.module.css";
import kid from "../assets/studentKid.module.css";
import pfp from "../assets/img/Navbar/user.jpg";
import LineConnectCard from "../components/LineConnectCard.jsx";
import { useNotification } from "../components/NotificationContainer.jsx";
import { describeStudentContract } from "../utils/contractExpiry.js";
import { clearStoredUser, readStoredUser, writeStoredUser } from "../utils/sessionUser.js";
import { formatTimezoneLabel, getTimezoneOptions, getUserTimezone, parseServerTimestamp } from "../utils/timezone.js";
import { API_BASE_URL } from "../utils/api.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { compressFileIfImage } from "../utils/imageCompression.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import { ACCOUNT } from "../utils/studentCopy.js";

const API = API_BASE_URL;
const CROP_SIZE = 320;
const COUNTRY_OPTIONS = [
  "Australia",
  "Canada",
  "China",
  "India",
  "Indonesia",
  "Japan",
  "Malaysia",
  "Philippines",
  "Singapore",
  "South Korea",
  "Taiwan",
  "Thailand",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Vietnam",
  "Samoa",
];
const COUNTRY_TIMEZONES = {
  Australia: "Australia/Sydney",
  Canada: "America/Toronto",
  China: "Asia/Shanghai",
  India: "Asia/Kolkata",
  Indonesia: "Asia/Jakarta",
  Japan: "Asia/Tokyo",
  Malaysia: "Asia/Kuala_Lumpur",
  Philippines: "Asia/Manila",
  Singapore: "Asia/Singapore",
  "South Korea": "Asia/Seoul",
  Taiwan: "Asia/Taipei",
  Thailand: "Asia/Bangkok",
  "United Arab Emirates": "Asia/Dubai",
  "United Kingdom": "Europe/London",
  "United States": "America/New_York",
  Vietnam: "Asia/Ho_Chi_Minh",
  Samoa: "Pacific/Pago_Pago",
};
const TIMEZONE_OPTIONS = getTimezoneOptions();

function mapUser(u = {}) {
  return {
    id: u.id ?? u.user_id ?? null,
    firstName: u.firstName ?? u.first_name ?? "",
    lastName: u.lastName ?? u.last_name ?? "",
    email: u.email ?? "",
    country: u.country ?? "",
    birthDate: u.birthDate ?? u.birth_date ?? "",
    timezone: u.timezone ?? u.time_zone ?? "Asia/Manila",
    role: u.role ?? "student",
    status: u.status ?? "active",
    profileCompleted: !!(u.profileCompleted ?? u.profile_completed ?? false),
    passwordChanged: !!(u.passwordChanged ?? u.password_changed ?? false),
    profileImageUrl: u.profileImageUrl ?? u.profile_image_url ?? "",
    assignedTeacherId: u.assignedTeacherId ?? u.assigned_teacher_id ?? null,
    createdAt: u.createdAt ?? u.created_at ?? null,
    roleDetails: u.roleDetails ?? u.role_details ?? {},
  };
}

function toStoredUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    profileCompleted: user.profileCompleted,
    passwordChanged: user.passwordChanged,
    profileImageUrl: user.profileImageUrl,
    assignedTeacherId: user.assignedTeacherId,
    timezone: user.timezone,
    courseId: user.courseId ?? null,
    stayLoggedIn: user.stayLoggedIn ?? false,
  };
}

function formFromUser(user) {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    country: user.country,
    birthDate: normalizeDateInput(user.birthDate),
    timezone: user.timezone,
  };
}

function formatRole(role) {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
}

/**
 * Does this teacher teach children?
 *
 * Opt-out, so anything other than an explicit 0 or "0" means yes. That mirrors
 * teacherWillTeachChildren on the server rather than inventing a second reading
 * of the same column - and it means a teacher who never touched the setting sees
 * themselves as willing, which is what the database says about them.
 */
function readsAsTeachesChildren(value) {
  return !(value === 0 || value === "0" || value === false);
}

function formatValue(value, fallback = "Not set") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function normalizeDateInput(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/**
 * "2003-10-11" -> "11 October 2003".
 *
 * !! A birthday is not a date range and not a database value. It is a day
 * !! somebody was born, and it reads better in words.
 */
function formatBirthday(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAccountDate(value, timezone) {
  if (!value) return "Not available";
  // created_at is a CURRENT_TIMESTAMP column: UTC, not local wall-clock.
  const date = parseServerTimestamp(value);
  if (!date) return "Not available";
  return date.toLocaleDateString("en-US", { timeZone: getUserTimezone({ timezone }) });
}

function isCompleteUser(user) {
  return Boolean(user?.profileCompleted);
}

export default function Account() {
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const fileInputRef = useRef(null);
  const cropImageRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const cameraStreamRef = useRef(null);
  const [user, setUser] = useState(null);
  const [isProfileIncomplete, setIsProfileIncomplete] = useState(false);
  const [firstSetupStep, setFirstSetupStep] = useState(0);
  const [firstSetupFinished, setFirstSetupFinished] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    country: "",
    birthDate: "",
    timezone: "Asia/Manila",
  });
  const [profileEditing, setProfileEditing] = useState(false);
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pictureUploading, setPictureUploading] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [detailsPassword, setDetailsPassword] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [cropModal, setCropModal] = useState(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, zoom: 1 });
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const storedUser = useMemo(() => {
    const stored = readStoredUser();
    return stored ? mapUser(stored) : null;
  }, []);

  const details = user?.roleDetails || {};
  // The contract summary the student sees on their own page.
  //
  // Two limits, not one: classes and time. Classes can be plentiful while the
  // contract is nearly over, so the deadline is shown on its own rather than
  // implied by the remaining count.
  //
  // The status/date decision lives in contractExpiry.js rather than here, so
  // the cancelled and expired cases are decided in one tested place instead of
  // once per page that needs to answer the question.
  const contract = useMemo(
    () =>
      describeStudentContract({
        packageId: details.package_id,
        status: details.package_status,
        expiresAt: details.package_expires_at,
        totalClasses: details.total_classes,
        classesUsed: details.classes_used,
        classesLeft: details.classes_left,
      }),
    [
      details.package_id, details.package_status, details.package_expires_at,
      details.total_classes, details.classes_used, details.classes_left,
    ]
  );
  // Seeded from the profile so the control reflects the stored value. Kept as
  // local state because it saves on change rather than through Save Changes -
  // it is a statement about what work you will take, not a profile field, and
  // folding it into the generic profile save would let a teacher change it
  // without meaning to.
  const [teachesChildren, setTeachesChildren] = useState(true);
  const [childrenSaving, setChildrenSaving] = useState(false);

  useEffect(() => {
    if (user?.role === "teacher") {
      setTeachesChildren(readsAsTeachesChildren(details.teaches_children));
    }
  }, [user?.role, details.teaches_children]);

  async function saveTeachesChildren(next) {
    const previous = teachesChildren;
    setTeachesChildren(next);
    setChildrenSaving(true);
    try {
      await axios.patch(`${API}/api/teacher/teaches-children`, { teachesChildren: next });
      notify(
        next
          ? "Saved. You can now be matched with students of any age."
          : "Saved. You will no longer be recommended for students under 13.",
        "success"
      );
    } catch (err) {
      // Put it back. Showing a setting that did not persist is worse than an
      // error message - the teacher would believe students under 13 were being
      // kept away from them when they were not.
      setTeachesChildren(previous);
      notify(err?.response?.data?.message || "Could not save that preference.", "error");
    } finally {
      setChildrenSaving(false);
    }
  }
  const fullName = `${form.firstName || ""} ${form.lastName || ""}`.trim() || "Account";
  const age = calculateAge(form.birthDate);
  const completionItems = useMemo(() => ([
    { label: "Profile picture", complete: Boolean(user?.profileImageUrl) },
  ]), [user?.profileImageUrl]);
  const cropPreviewStyle = useMemo(() => {
    if (!cropImageSize.width || !cropImageSize.height) return {};
    const baseScale = Math.max(CROP_SIZE / cropImageSize.width, CROP_SIZE / cropImageSize.height);
    const scale = baseScale * crop.zoom;
    const width = cropImageSize.width * scale;
    const height = cropImageSize.height * scale;

    return {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${(CROP_SIZE - width) / 2 + crop.x}px, ${(CROP_SIZE - height) / 2 + crop.y}px)`,
    };
  }, [crop.x, crop.y, crop.zoom, cropImageSize.height, cropImageSize.width]);

  function clampCropPosition({ x, y, zoom }) {
    if (!cropImageSize.width || !cropImageSize.height) return { x, y, zoom };

    const baseScale = Math.max(CROP_SIZE / cropImageSize.width, CROP_SIZE / cropImageSize.height);
    const scale = baseScale * zoom;
    const width = cropImageSize.width * scale;
    const height = cropImageSize.height * scale;
    const minX = (CROP_SIZE - width) / 2;
    const maxX = (width - CROP_SIZE) / 2;
    const minY = (CROP_SIZE - height) / 2;
    const maxY = (height - CROP_SIZE) / 2;

    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
      zoom,
    };
  }

  useEffect(() => {
    if (!cropImageSize.width || !cropImageSize.height) return;
    setCrop((current) => {
      const bounded = clampCropPosition(current);
      if (bounded.x === current.x && bounded.y === current.y && bounded.zoom === current.zoom) {
        return current;
      }
      return bounded;
    });
  }, [cropImageSize.width, cropImageSize.height]);

  async function loadUser(userId) {
    const res = await axios.get(`${API}/api/users/${userId}`);
    const refreshed = mapUser(res.data?.user ?? res.data);
    refreshed.profileCompleted = isCompleteUser(refreshed);
    setUser(refreshed);
    setForm(formFromUser(refreshed));
    setIsProfileIncomplete(!refreshed.profileCompleted);
    if (!refreshed.profileCompleted) {
      setProfileEditing(true);
      setPasswordEditing(false);
      setFirstSetupStep(refreshed.profileImageUrl ? 1 : 0);
    }
    writeStoredUser(toStoredUser(refreshed));
    window.dispatchEvent(new CustomEvent("userProfileUpdated", { detail: refreshed }));
    return refreshed;
  }

  useEffect(() => {
    if (!storedUser?.id) {
      navigate("/login", { replace: true });
      return;
    }

    const mapped = { ...storedUser, profileCompleted: isCompleteUser(storedUser) };
    setUser(mapped);
    setForm(formFromUser(mapped));
    setIsProfileIncomplete(!mapped.profileCompleted);
    if (!mapped.profileCompleted) {
      setProfileEditing(true);
      setPasswordEditing(false);
      setFirstSetupStep(mapped.profileImageUrl ? 1 : 0);
    }

    loadUser(mapped.id).catch(() => {
      console.warn("Could not fetch user; using local data.");
    });
  }, [navigate, storedUser]);

  useEffect(() => {
    return () => {
      if (cropModal?.src) URL.revokeObjectURL(cropModal.src);
    };
  }, [cropModal?.src]);

  useEffect(() => {
    if (!cameraOpen) return undefined;

    let cancelled = false;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        notify("Camera is not available in this browser.", "error");
        setCameraOpen(false);
        return;
      }

      setCameraStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          await cameraVideoRef.current.play();
        }
      } catch {
        notify("Could not open the camera. Please allow camera access or upload a file instead.", "error");
        setCameraOpen(false);
      } finally {
        if (!cancelled) setCameraStarting(false);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
    };
  }, [cameraOpen, notify]);

  function handleLogout() {
    setConfirmAction({
      type: "logout",
      title: "Log out?",
      message: "Are you sure you want to log out?",
      confirmLabel: "Log Out",
    });
  }

  function performLogout() {
    clearStoredUser();
    window.location.href = "/";
  }

  function closeConfirmAction() {
    setConfirmAction(null);
  }

  function requestSaveProfile() {
    setConfirmAction({
      type: "save-profile",
      title: isProfileIncomplete ? "Save your details?" : "Save profile changes?",
      message: isProfileIncomplete
        ? "Check your time zone, then save."
        : "Are you sure you want to save the profile changes?",
      confirmLabel: isProfileIncomplete ? "Save my details" : "Save Changes",
    });
  }

  function requestSavePicture() {
    setConfirmAction({
      type: "save-picture",
      title: "Save profile picture?",
      message: "Are you sure you want to save this profile picture?",
      confirmLabel: "Save Picture",
    });
  }

  function requestSavePassword() {
    setConfirmAction({
      type: "save-password",
      title: "Update password?",
      message: "Are you sure you want to update your password?",
      confirmLabel: "Update Password",
    });
  }

  async function saveProfileConfirmed() {
    setSaving(true);
    try {
      // !! Email is not sent. The server refuses to write it from this route,
      // !! and sending it anyway would suggest the form still owns it.
      const { email: _lockedEmail, ...editable } = form;
      await axios.put(`${API}/api/users/${user.id}`, {
        ...editable,
        currentPassword: detailsPassword,
      });
      setDetailsPassword("");
      const updated = await loadUser(user.id);
      setProfileEditing(!updated.profileCompleted);
      notify("Profile updated successfully.", "success");

      if (updated.profileCompleted && isProfileIncomplete) {
        setFirstSetupFinished(true);
      }
    } catch (err) {
      if (err?.response?.status === 401) setDetailsPassword("");
      notify(err?.response?.data?.message || "Could not update profile.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function performConfirmAction() {
    if (!confirmAction) return;
    if (confirmAction.type === "logout") {
      performLogout();
      return;
    }
    if (confirmAction.type === "save-profile") {
      await saveProfileConfirmed();
    }
    if (confirmAction.type === "save-picture") {
      saveCroppedProfilePicture();
    }
    if (confirmAction.type === "save-password") {
      await savePasswordConfirmed();
    }
    closeConfirmAction();
  }

  function onChange(e) {
    const { name, value } = e.target;
    setForm((current) => {
      if (name === "country") {
        return {
          ...current,
          country: value,
          timezone: COUNTRY_TIMEZONES[value] || current.timezone,
        };
      }

      return { ...current, [name]: value };
    });
  }

  function autoDetectTimezone() {
    if (!profileEditing) return;

    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detectedTimezone) {
      notify("Could not detect your timezone in this browser.", "error");
      return;
    }

    setForm((current) => ({
      ...current,
      timezone: detectedTimezone,
    }));
    notify(`Detected timezone: ${formatTimezoneLabel(detectedTimezone)}`, "success");
  }

  function cancelProfileEdit() {
    if (user) setForm(formFromUser(user));
    setDetailsPassword("");
    setProfileEditing(isProfileIncomplete);
  }

  function cancelPasswordEdit() {
    setPwd({ current: "", next: "", confirm: "" });
    setPasswordEditing(isProfileIncomplete && !user?.passwordChanged);
  }

  function closeCropModal() {
    if (cropModal?.src) URL.revokeObjectURL(cropModal.src);
    setCropModal(null);
    setCrop({ x: 0, y: 0, zoom: 1 });
    setCropImageSize({ width: 0, height: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function saveProfile(e) {
    e.preventDefault();

    if (!profileEditing) {
      setProfileEditing(true);
      return;
    }

    // !! The password is checked here so the confirm dialog is not opened for
    // !! a save that cannot succeed. The server checks it again; this copy is
    // !! for the person filling the form in, not for security.
    if (!detailsPassword.trim()) {
      notify("Enter your password to save your details.", "error");
      return;
    }

    if (!confirmAction || confirmAction.type !== "save-profile") {
      requestSaveProfile();
      return;
    }
  }

  function chooseProfilePicture() {
    setAvatarMenuOpen(false);
    fileInputRef.current?.click();
  }

  function takeProfilePicture() {
    setAvatarMenuOpen(false);
    setCameraOpen(true);
  }

  function closeCameraModal() {
    setCameraOpen(false);
  }

  function captureProfilePicture() {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      notify("Camera is still starting. Please try again.", "error");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const photo = typeof File === "function"
        ? new File([blob], "camera-profile-picture.png", { type: "image/png" })
        : blob;
      closeCameraModal();
      handleProfileFile(photo);
    }, "image/png", 0.95);
  }

  function handleProfileFile(file) {
    if (!file) return;
    setCropModal({
      src: URL.createObjectURL(file),
      fileName: file.name || "profile-picture.png",
    });
    setCrop({ x: 0, y: 0, zoom: 1 });
  }

  async function uploadProfilePicture(file) {
    if (!file || !user?.id) return;
    const payload = new FormData();
    setPictureUploading(true);

    try {
      const uploadFile = await compressFileIfImage(
        file instanceof File ? file : new File([file], "profile-picture.png", { type: file.type || "image/png" }),
        { maxDimension: 512, quality: 0.88 }
      );
      payload.append("profile_picture", uploadFile, uploadFile.name || "profile-picture.webp");
      await axios.post(`${API}/api/users/${user.id}/profile-picture`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const nextUser = await loadUser(user.id);
      notify("Profile picture updated.", "success");
      closeCropModal();
      if (isProfileIncomplete) setFirstSetupStep(1);
      if (nextUser.profileCompleted && isProfileIncomplete) {
        setFirstSetupFinished(true);
      }
    } catch (err) {
      notify(err?.response?.data?.message || "Could not upload profile picture.", "error");
    } finally {
      setPictureUploading(false);
    }
  }

  function saveCroppedProfilePicture() {
    const image = cropImageRef.current;
    if (!image || !cropImageSize.width || !cropImageSize.height) return;

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const baseScale = Math.max(CROP_SIZE / cropImageSize.width, CROP_SIZE / cropImageSize.height);
    const scale = baseScale * crop.zoom;
    const drawWidth = cropImageSize.width * scale;
    const drawHeight = cropImageSize.height * scale;
    const displayX = (CROP_SIZE - drawWidth) / 2 + crop.x;
    const displayY = (CROP_SIZE - drawHeight) / 2 + crop.y;
    const outputScale = canvas.width / CROP_SIZE;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      image,
      displayX * outputScale,
      displayY * outputScale,
      drawWidth * outputScale,
      drawHeight * outputScale
    );

    canvas.toBlob((blob) => {
      if (!blob) return;
      uploadProfilePicture(blob);
    }, "image/png", 0.95);
  }

  function renderFirstProfileSetup() {
    const dashboardPath = user.role === "teacher" ? "/TeacherDashboard" : "/StudentDashboard";
    const firstName = form.firstName || "friend";

    if (firstSetupFinished) {
      return (
        <section className={styles.firstSetupCard} aria-labelledby="first-setup-ready">
          <span className={styles.firstSetupIcon} aria-hidden="true">🎉</span>
          <p className={styles.firstSetupStep}>All done!</p>
          <h1 id="first-setup-ready">You’re ready, {firstName}!</h1>
          <p>Your account is ready. Let’s go to Home and take a little tour.</p>
          <button type="button" className={styles.firstSetupPrimary} onClick={() => navigate(dashboardPath)}>
            Go to Home
          </button>
        </section>
      );
    }

    return (
      <section className={styles.firstSetupCard} aria-labelledby="first-setup-title">
        <div className={styles.firstSetupProgress} aria-label={`Step ${firstSetupStep + 1} of 2`}>
          <span className={firstSetupStep === 0 ? styles.firstSetupCurrent : styles.firstSetupDone}>
            {firstSetupStep > 0 ? "✓" : "1"}
          </span>
          <i />
          <span className={firstSetupStep === 1 ? styles.firstSetupCurrent : ""}>2</span>
        </div>
        <p className={styles.firstSetupStep}>Let’s get your account ready</p>
        <h1 id="first-setup-title">Hi, {firstName}!</h1>

        {firstSetupStep === 0 ? (
          <div className={styles.firstSetupContent}>
            <span className={styles.firstSetupIcon} aria-hidden="true">📸</span>
            <h2>First, add your picture</h2>
            <p>
              {user.role === "teacher"
                ? "Choose a picture so your students and team know it’s you."
                : "Choose a picture so your teacher and classmates know it’s you."}
            </p>
            {user.profileImageUrl && (
              <AuthenticatedImage
                className={styles.firstSetupAvatar}
                src={user.profileImageUrl}
                alt="Your profile"
              />
            )}
            <input
              ref={fileInputRef}
              className={styles.firstSetupFileInput}
              type="file"
              accept="image/*"
              aria-label="Choose a profile picture"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleProfileFile(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className={styles.firstSetupPrimary}
              onClick={chooseProfilePicture}
              disabled={pictureUploading}
            >
              {user.profileImageUrl ? "Choose a different picture" : "Choose a picture"}
            </button>
            {pictureUploading && <p role="status">Saving your picture...</p>}
          </div>
        ) : (
          <form className={styles.firstSetupForm} onSubmit={saveProfile}>
            <span className={styles.firstSetupIcon} aria-hidden="true">🧑‍🎓</span>
            <h2>Now, check your details</h2>
            <label>
              <span>Your first name</span>
              <input name="firstName" value={form.firstName} onChange={onChange} required />
            </label>
            <label>
              <span>Your last name</span>
              <input name="lastName" value={form.lastName} onChange={onChange} required />
            </label>
            <label>
              <span>Time zone</span>
              <select name="timezone" value={form.timezone} onChange={onChange} required>
                {form.timezone && !TIMEZONE_OPTIONS.includes(form.timezone) && (
                  <option value={form.timezone}>{formatTimezoneLabel(form.timezone)}</option>
                )}
                {TIMEZONE_OPTIONS.map((timezone) => (
                  <option key={timezone} value={timezone}>{formatTimezoneLabel(timezone)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Your password</span>
              <input
                type="password"
                value={detailsPassword}
                onChange={(event) => setDetailsPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <small>We need it to save your details safely.</small>
            </label>
            <div className={styles.firstSetupActions}>
              <button type="button" className={styles.firstSetupSecondary} onClick={() => setFirstSetupStep(0)}>
                Back
              </button>
              <button type="submit" className={styles.firstSetupPrimary} disabled={saving}>
                {saving ? "Saving..." : "Save my details"}
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  function startCropDrag(e) {
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: crop.x,
      baseY: crop.y,
    };
  }

  function moveCropDrag(e) {
    if (!dragRef.current.active) return;
    setCrop((current) => clampCropPosition({
      ...current,
      x: dragRef.current.baseX + e.clientX - dragRef.current.startX,
      y: dragRef.current.baseY + e.clientY - dragRef.current.startY,
    }));
  }

  function endCropDrag() {
    dragRef.current.active = false;
  }

  async function changePassword(e) {
    e.preventDefault();

    if (!passwordEditing) {
      setPasswordEditing(true);
      return;
    }

    if (!pwd.next || pwd.next !== pwd.confirm) {
      notify("New password and confirm password do not match.", "error");
      return;
    }
    if (!confirmAction || confirmAction.type !== "save-password") {
      requestSavePassword();
      return;
    }
  }

  async function savePasswordConfirmed() {
    setPwdSaving(true);
    try {
      const res = await axios.put(`${API}/api/users/${user.id}/password`, {
        current: pwd.current,
        next: pwd.next,
      });
      notify(res.data?.message || "Password changed.", "success");
      setPwd({ current: "", next: "", confirm: "" });
      setPasswordEditing(false);
      const updated = await loadUser(user.id);
      if (updated.profileCompleted && isProfileIncomplete) {
        setTimeout(() => {
          if (updated.role === "teacher") navigate("/TeacherDashboard");
          else if (updated.role === "admin") navigate("/AdminDashboard");
          else navigate("/StudentDashboard");
        }, 400);
      }
    } catch (err) {
      notify(err?.response?.data?.message || "Could not change password. Check current password.", "error");
    } finally {
      setPwdSaving(false);
    }
  }

  /**
   * The student's own account page.
   *
   * !! This was the admin's screen with the admin's words on it: "Profile
   * !! Information", a "Locked" badge over a form of disabled inputs, a
   * !! "Security" card, a "Contract" card, and a table of user IDs.
   * !!
   * !! So it is a different screen, not a restyled one. It answers the three
   * !! questions a student has about their own account - how many classes
   * !! are left, what am I learning, and who is my teacher - and then lets
   * !! them change their picture, their details and their password.
   * !!
   * !! The number is the picture, and it is the same counter the home page
   * !! has, so a student learns one shape and sees it everywhere.
   */
  function renderStudentAccount() {
    const classesTotal = Number(contract.total || 0);
    const classesLeft = contract.state === "cancelled" ? 0 : Number(contract.left || 0);
    const usedPct = classesTotal > 0 ? Math.min(100, Math.round((contract.used / classesTotal) * 100)) : 0;

    const teacherName = details.teacher_first_name
      ? `${details.teacher_first_name} ${details.teacher_last_name || ""}`.trim()
      : details.teacher_name;

    const planEnd =
      contract.expiry?.detail?.replace(/^Contract ends /, "") || contract.expiry?.when || "";

    const birthday = formatBirthday(form.birthDate);

    const details_rows = [
      { label: ACCOUNT.yourName, value: fullName },
      { label: ACCOUNT.birthday, value: birthday },
      { label: ACCOUNT.country, value: form.country },
      {
        label: ACCOUNT.timeZone,
        value: form.timezone ? formatTimezoneLabel(form.timezone) : "",
      },
      { label: ACCOUNT.email, value: form.email },
    ].filter((row) => row.value);

    return (
      <div className={kid.kidAccount}>
        {/* Something still to do. */}
        {isProfileIncomplete ? (
          <section className={kid.kidNotice}>
            <h2 className={kid.kidNoticeTitle}>{ACCOUNT.finishProfile}</h2>
            <p className={kid.kidNoticeBody}>{ACCOUNT.finishProfileHelp}</p>
            <ul className={kid.kidNoticeList}>
              <li className={kid.kidNoticeItem}>
                <span className={kid.kidNoticeTick} aria-hidden="true">
                  {user?.profileImageUrl ? "✓" : "•"}
                </span>
                {ACCOUNT.needPicture}
              </li>
            </ul>
          </section>
        ) : null}

        {/* Who this is. */}
        <section className={kid.kidAccountHero}>
          <div className={kid.kidAvatarWrap}>
            <button
              type="button"
              className={kid.kidAvatarButton}
              onClick={() => setAvatarMenuOpen((open) => !open)}
              aria-label={ACCOUNT.changePicture}
            >
              <AuthenticatedImage
                className={kid.kidAvatar}
                src={user?.profileImageUrl}
                alt={`${fullName} profile`}
                fallback={<img className={kid.kidAvatar} src={pfp} alt={`${fullName} profile`} />}
              />
              <span className={kid.kidAvatarEdit} aria-hidden="true">
                +
              </span>
            </button>
            {avatarMenuOpen && (
              <div className={styles.avatarMenu}>
                <button type="button" onClick={() => { setPreviewOpen(true); setAvatarMenuOpen(false); }}>
                  See profile picture
                </button>
                <button type="button" onClick={chooseProfilePicture} disabled={pictureUploading}>
                  Upload file
                </button>
                <button type="button" onClick={takeProfilePicture} disabled={pictureUploading}>
                  Take picture
                </button>
              </div>
            )}
          </div>

          <div className={kid.kidHeroText}>
            <h1 className={kid.kidHeroName}>{ACCOUNT.hello(form.firstName || fullName)}</h1>
            <span className={kid.kidHeroRole}>{formatRole(user.role)}</span>
            <p className={kid.kidHeroEmail}>{form.email}</p>
          </div>
        </section>

        {/* The number is the picture. */}
        {classesTotal > 0 ? (
          <section className={kid.kidPlanCard}>
            <p className={kid.sectionTitle}>{ACCOUNT.classesLeft}</p>
            <div className={kid.kidCounterRow}>
              <span className={kid.kidCounterNumber}>{classesLeft}</span>
              <span className={kid.kidCounterOf}>{ACCOUNT.of(classesTotal)}</span>
            </div>
            <div className={kid.kidCounterBar}>
              <div className={kid.kidCounterBarFill} style={{ width: `${usedPct}%` }} />
            </div>
            {planEnd ? <p className={kid.kidPlanNote}>{ACCOUNT.planEnds(planEnd)}</p> : null}
          </section>
        ) : null}

        {/* What the student is learning, and who is teaching them. */}
        <div className={kid.kidTwoUp}>
          <section className={kid.kidInfoCard}>
            <p className={kid.sectionTitle}>{ACCOUNT.yourClass}</p>
            <p className={kid.kidInfoValue}>{details.course_name || ACCOUNT.notSet}</p>
          </section>
          <section className={kid.kidInfoCard}>
            <p className={kid.sectionTitle}>{ACCOUNT.yourTeacher}</p>
            <p className={kid.kidInfoValue}>{teacherName || ACCOUNT.notSet}</p>
          </section>
        </div>

        {/* About you. Read it, then change it. */}
        <section className={kid.kidCard}>
          <div className={kid.kidCardHead}>
            <h2 className={kid.kidCardTitle}>{ACCOUNT.aboutYou}</h2>
            {!profileEditing ? (
              <button
                type="button"
                className={kid.kidGhostBtn}
                onClick={() => setProfileEditing(true)}
              >
                {ACCOUNT.changeDetails}
              </button>
            ) : null}
          </div>

          {profileEditing ? (
            <form onSubmit={saveProfile} className={kid.kidForm}>
              <div className={kid.kidRow}>
                <label className={kid.kidField}>
                  <span className={kid.kidFieldLabel}>{ACCOUNT.firstName}</span>
                  <input
                    className={kid.kidInput}
                    name="firstName"
                    value={form.firstName}
                    onChange={onChange}
                    required
                  />
                </label>
                <label className={kid.kidField}>
                  <span className={kid.kidFieldLabel}>{ACCOUNT.lastName}</span>
                  <input
                    className={kid.kidInput}
                    name="lastName"
                    value={form.lastName}
                    onChange={onChange}
                    required
                  />
                </label>
              </div>

              <label className={kid.kidField}>
                <span className={kid.kidFieldLabel}>{ACCOUNT.email}</span>
                <input
                  className={kid.kidInput}
                  value={form.email}
                  readOnly
                  disabled
                />
                <span className={kid.kidFieldNote}>{ACCOUNT.emailLocked}</span>
              </label>

              <div className={kid.kidRow}>
                <label className={kid.kidField}>
                  <span className={kid.kidFieldLabel}>{ACCOUNT.country}</span>
                  <select
                    className={kid.kidInput}
                    name="country"
                    value={form.country}
                    onChange={onChange}
                  >
                    <option value="">-</option>
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </label>
                <label className={kid.kidField}>
                  <span className={kid.kidFieldLabel}>{ACCOUNT.birthday}</span>
                  <input
                    className={kid.kidInput}
                    type="date"
                    name="birthDate"
                    value={form.birthDate}
                    onChange={onChange}
                  />
                </label>
              </div>

              <label className={kid.kidField}>
                <span className={kid.kidFieldLabel}>{ACCOUNT.timeZone}</span>
                <div className={styles.timezoneControl}>
                  <select
                    className={kid.kidInput}
                    name="timezone"
                    value={form.timezone}
                    onChange={onChange}
                    required
                  >
                    <option value="">-</option>
                    {form.timezone && !TIMEZONE_OPTIONS.includes(form.timezone) && (
                      <option value={form.timezone}>{formatTimezoneLabel(form.timezone)}</option>
                    )}
                    {TIMEZONE_OPTIONS.map((timezone) => (
                      <option key={timezone} value={timezone}>{formatTimezoneLabel(timezone)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={autoDetectTimezone}
                  >
                    Auto Detect
                  </button>
                </div>
              </label>

              <label className={kid.kidField}>
                <span className={kid.kidFieldLabel}>{ACCOUNT.passwordLabel}</span>
                <input
                  className={kid.kidInput}
                  type="password"
                  value={detailsPassword}
                  onChange={(e) => setDetailsPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <span className={kid.kidFieldNote}>{ACCOUNT.passwordToSave}</span>
              </label>

              <div className={kid.kidActions}>
                <button
                  type="button"
                  className={kid.kidGhostBtn}
                  onClick={cancelProfileEdit}
                >
                  {ACCOUNT.cancel}
                </button>
                <button className={kid.kidPrimaryBtn} disabled={saving}>
                  {saving ? ACCOUNT.savingDetails : ACCOUNT.saveDetails}
                </button>
              </div>
            </form>
          ) : (
            <div className={kid.kidList}>
              {details_rows.map((row) => (
                <div key={row.label} className={kid.kidListRow}>
                  <span className={kid.kidListLabel}>{row.label}</span>
                  <span className={kid.kidListValue}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* The password. */}
        <section className={kid.kidCard}>
          <div className={kid.kidCardHead}>
            <h2 className={kid.kidCardTitle}>{ACCOUNT.yourPassword}</h2>
            {!passwordEditing ? (
              <button
                type="button"
                className={kid.kidGhostBtn}
                onClick={() => setPasswordEditing(true)}
              >
                {ACCOUNT.changePassword}
              </button>
            ) : null}
          </div>

          {passwordEditing ? (
            <form onSubmit={changePassword} className={kid.kidForm}>
              <label className={kid.kidField}>
                <span className={kid.kidFieldLabel}>{ACCOUNT.currentPassword}</span>
                <input
                  className={kid.kidInput}
                  type="password"
                  value={pwd.current}
                  onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
                  required
                />
              </label>
              <div className={kid.kidRow}>
                <label className={kid.kidField}>
                  <span className={kid.kidFieldLabel}>{ACCOUNT.newPassword}</span>
                  <input
                    className={kid.kidInput}
                    type="password"
                    value={pwd.next}
                    onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
                    required
                  />
                </label>
                <label className={kid.kidField}>
                  <span className={kid.kidFieldLabel}>{ACCOUNT.confirmPassword}</span>
                  <input
                    className={kid.kidInput}
                    type="password"
                    value={pwd.confirm}
                    onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <div className={kid.kidActions}>
                <button
                  type="button"
                  className={kid.kidGhostBtn}
                  onClick={cancelPasswordEdit}
                >
                  {ACCOUNT.cancel}
                </button>
                <button className={kid.kidPrimaryBtn} disabled={pwdSaving}>
                  {pwdSaving ? ACCOUNT.savingPassword : ACCOUNT.savePassword}
                </button>
              </div>
            </form>
          ) : null}
        </section>

        {/* LINE reminders. Optional, but the fastest way to hear about a class. */}
        <LineConnectCard userId={user.id} />

        <button className={kid.kidLogout} type="button" onClick={handleLogout}>
          {ACCOUNT.menuLogOut}
        </button>
      </div>
    );
  }

  /**
   * A teacher's and an admin's account page.
   *
   * !! The same shape as the student's page - a stack of cards, one thing in
   * !! each - at an adult's proportions. One product, two sizes.
   *
   * !! The big change is that the details are READ, not edited. The old page
   * !! showed a form of disabled inputs with a "Locked" badge over it, which
   * !! is a form you cannot use and a badge that says "no". Now the facts are
   * !! a list, and "Edit details" turns the list into inputs.
   */
  function renderStaffAccount() {
    const isAdmin = user.role === "admin";

    const facts = [
      { label: "First name", value: form.firstName },
      { label: "Last name", value: form.lastName },
      { label: "Email", value: form.email },
      { label: "Country", value: form.country },
      { label: "Birthday", value: formatBirthday(form.birthDate) },
      { label: "Age", value: age === null ? "" : `${age} years old` },
      { label: "Time zone", value: form.timezone ? formatTimezoneLabel(form.timezone) : "" },
    ].filter((fact) => fact.value);

    return (
      <div className={styles.proPage}>
        {/* Who this is. */}
        <section className={styles.proHero}>
          <div className={styles.avatarWrap}>
            <button
              type="button"
              className={styles.avatarButton}
              onClick={() => setAvatarMenuOpen((open) => !open)}
              aria-label="Open profile picture options"
            >
              <AuthenticatedImage
                className={styles.avatar}
                src={user?.profileImageUrl}
                alt={`${fullName} profile`}
                fallback={<img className={styles.avatar} src={pfp} alt={`${fullName} profile`} />}
              />
              <span className={styles.avatarEditMark}>+</span>
            </button>
            {avatarMenuOpen && (
              <div className={styles.avatarMenu}>
                <button type="button" onClick={() => { setPreviewOpen(true); setAvatarMenuOpen(false); }}>
                  See profile picture
                </button>
                <button type="button" onClick={chooseProfilePicture} disabled={pictureUploading}>
                  Upload file
                </button>
                <button type="button" onClick={takeProfilePicture} disabled={pictureUploading}>
                  Take picture
                </button>
              </div>
            )}
          </div>

          <div className={styles.proHeroText}>
            <h1 className={styles.proHeroName}>{fullName}</h1>
            <div className={styles.proHeroMeta}>
              <span className={styles.proBadge}>{formatRole(user.role)}</span>
              <span className={styles.proBadge}>{formatRole(user.status)}</span>
            </div>
            <p className={styles.proHeroEmail}>{form.email}</p>
          </div>
        </section>

        {/* The work: what this person is here to do. */}
        {isAdmin ? (
          <section className={styles.proCard}>
            <div className={styles.proCardHead}>
              <h2 className={styles.proCardTitle}>Administration</h2>
              <span className={styles.proBadge}>Admin</span>
            </div>
            <div className={styles.proStatGrid}>
              <div className={styles.proStat}>
                <span className={styles.proStatLabel}>Active students</span>
                <span className={styles.proStatValue}>{details.active_students ?? 0}</span>
              </div>
              <div className={styles.proStat}>
                <span className={styles.proStatLabel}>Active teachers</span>
                <span className={styles.proStatValue}>{details.active_teachers ?? 0}</span>
              </div>
              <div className={styles.proStat}>
                <span className={styles.proStatLabel}>Archived users</span>
                <span className={styles.proStatValue}>{details.archived_users ?? 0}</span>
              </div>
              <div className={styles.proStat}>
                <span className={styles.proStatLabel}>Account status</span>
                <span className={styles.proStatValue}>{formatRole(user.status)}</span>
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.proCard}>
            <div className={styles.proCardHead}>
              <h2 className={styles.proCardTitle}>Teaching profile</h2>
              <span className={styles.proBadge}>Teacher</span>
            </div>

            <div className={styles.proStatGrid}>
              <div className={styles.proStat}>
                <span className={styles.proStatLabel}>Active students</span>
                <span className={styles.proStatValue}>{details.active_students ?? 0}</span>
              </div>
              <div className={styles.proStat}>
                <span className={styles.proStatLabel}>Upcoming classes</span>
                <span className={styles.proStatValue}>{details.upcoming_classes ?? 0}</span>
              </div>
              <div className={styles.proStat}>
                <span className={styles.proStatLabel}>Experience</span>
                <span className={styles.proStatValue}>
                  {details.experience_years ? `${details.experience_years} years` : "—"}
                </span>
              </div>
              <div className={styles.proStat}>
                <span className={styles.proStatLabel}>Specialization</span>
                <span className={styles.proStatValue}>
                  {details.specialization || "—"}
                </span>
              </div>
            </div>

            <div className={styles.proFacts}>
              <div className={styles.proFact}>
                <span className={styles.proFactLabel}>Courses</span>
                <span className={styles.proFactValue}>{formatValue(details.courses)}</span>
              </div>
            </div>

            <label className={styles.checkboxOption} htmlFor="teacher-teaches-children">
              <input
                id="teacher-teaches-children"
                type="checkbox"
                checked={teachesChildren}
                disabled={childrenSaving}
                onChange={(e) => saveTeachesChildren(e.target.checked)}
              />
              <span>
                I will teach students of any age, including children under 13
                <p className={styles.checkboxOptionHint}>
                  {teachesChildren
                    ? "You can be recommended for any student."
                    : "You will not be recommended for students under 13. The school is told this, and your other settings are unchanged."}
                  {childrenSaving ? " Saving..." : ""}
                </p>
              </span>
            </label>
          </section>
        )}

        {/* The details. Read them, then change them. */}
        <section className={styles.proCard}>
          <div className={styles.proCardHead}>
            <h2 className={styles.proCardTitle}>Profile information</h2>
            {!profileEditing ? (
              <button
                type="button"
                className={styles.proBtnGhost}
                onClick={() => setProfileEditing(true)}
              >
                Edit details
              </button>
            ) : null}
          </div>

          {profileEditing ? (
            <form onSubmit={saveProfile} className={styles.proForm}>
              <div className={styles.proRow}>
                <label className={styles.proField}>
                  <span className={styles.proLabel}>First name</span>
                  <input
                    className={styles.proInput}
                    name="firstName"
                    value={form.firstName}
                    onChange={onChange}
                    required
                  />
                </label>
                <label className={styles.proField}>
                  <span className={styles.proLabel}>Last name</span>
                  <input
                    className={styles.proInput}
                    name="lastName"
                    value={form.lastName}
                    onChange={onChange}
                    required
                  />
                </label>
              </div>

              <div className={styles.proRow}>
                <label className={styles.proField}>
                  <span className={styles.proLabel}>Email</span>
                  <input className={styles.proInput} value={form.email} readOnly disabled />
                  <span className={styles.proFieldNote}>
                    Your email is how you sign in and receive password resets, so it can't be changed
                    here. An administrator can update it.
                  </span>
                </label>
                <label className={styles.proField}>
                  <span className={styles.proLabel}>Current password</span>
                  <input
                    className={styles.proInput}
                    type="password"
                    value={detailsPassword}
                    onChange={(e) => setDetailsPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <span className={styles.proFieldNote}>Required to save changes.</span>
                </label>
              </div>

              <div className={styles.proRow}>
                <label className={styles.proField}>
                  <span className={styles.proLabel}>Country</span>
                  <select
                    className={styles.proInput}
                    name="country"
                    value={form.country}
                    onChange={onChange}
                  >
                    <option value="">Select country</option>
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.proField}>
                  <span className={styles.proLabel}>Birthday</span>
                  <input
                    className={styles.proInput}
                    type="date"
                    name="birthDate"
                    value={form.birthDate}
                    onChange={onChange}
                  />
                </label>
              </div>

              <label className={styles.proField}>
                <span className={styles.proLabel}>Time zone</span>
                <input
                  className={styles.proInput}
                  name="timezone"
                  value={form.timezone}
                  onChange={onChange}
                  required
                />
              </label>

              <div className={styles.proActions}>
                <button
                  type="button"
                  className={styles.proBtnGhost}
                  onClick={cancelProfileEdit}
                >
                  Cancel
                </button>
                <button className={styles.proBtn} disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          ) : (
            <div className={styles.proFacts}>
              {facts.map((fact) => (
                <div key={fact.label} className={styles.proFact}>
                  <span className={styles.proFactLabel}>{fact.label}</span>
                  <span className={styles.proFactValue}>{fact.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* The password. */}
        <section className={styles.proCard}>
          <div className={styles.proCardHead}>
            <h2 className={styles.proCardTitle}>Security</h2>
            {!passwordEditing ? (
              <button
                type="button"
                className={styles.proBtnGhost}
                onClick={() => setPasswordEditing(true)}
              >
                Change password
              </button>
            ) : null}
          </div>

          {passwordEditing ? (
            <form onSubmit={changePassword} className={styles.proForm}>
              <div className={styles.proRow}>
                <label className={styles.proField}>
                  <span className={styles.proLabel}>Current password</span>
                  <input
                    className={styles.proInput}
                    type="password"
                    value={pwd.current}
                    onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
                    required
                  />
                </label>
                <label className={styles.proField}>
                  <span className={styles.proLabel}>New password</span>
                  <input
                    className={styles.proInput}
                    type="password"
                    value={pwd.next}
                    onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <label className={styles.proField}>
                <span className={styles.proLabel}>Confirm new password</span>
                <input
                  className={styles.proInput}
                  type="password"
                  value={pwd.confirm}
                  onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                  required
                />
              </label>

              <div className={styles.proActions}>
                <button
                  type="button"
                  className={styles.proBtnGhost}
                  onClick={cancelPasswordEdit}
                >
                  Cancel
                </button>
                <button className={styles.proBtn} disabled={pwdSaving}>
                  {pwdSaving ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>
          ) : (
            <p className={styles.proFactValue}>
              Your password is not shown to anyone, including the admin.
            </p>
          )}
        </section>

        {/* LINE reminders for staff too — teachers get reschedule and class alerts. */}
        <LineConnectCard userId={user.id} />

        {/* The facts about the account itself, and the way out. */}
        <section className={styles.proCard}>
          <div className={styles.proCardHead}>
            <h2 className={styles.proCardTitle}>Account</h2>
            <span className={styles.proBadge}>
              {user.profileCompleted ? "Complete" : "Incomplete"}
            </span>
          </div>
          <div className={styles.proFacts}>
            <div className={styles.proFact}>
              <span className={styles.proFactLabel}>User ID</span>
              <span className={styles.proFactValue}>{user.id}</span>
            </div>
            <div className={styles.proFact}>
              <span className={styles.proFactLabel}>Role</span>
              <span className={styles.proFactValue}>{formatRole(user.role)}</span>
            </div>
            <div className={styles.proFact}>
              <span className={styles.proFactLabel}>Created</span>
              <span className={styles.proFactValue}>
                {formatAccountDate(user.createdAt, user.timezone)}
              </span>
            </div>
          </div>
          <div className={styles.proActions}>
            <button className={styles.proLogout} type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <main className={styles.pageShell}>
        <section className={styles.emptyState}>
          <h1>Account</h1>
          <p>You are not logged in.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.pageShell}>
      <div className={styles.accountPage}>
        {(isProfileIncomplete || firstSetupFinished) && ["student", "teacher"].includes(user.role) ? (
          renderFirstProfileSetup()
        ) : user.role === "student" ? (
          renderStudentAccount()
        ) : (
          <>
            {isProfileIncomplete && (
              <section className={styles.notice}>
                <div>
                  <strong>Complete your profile</strong>
                  <span>Upload a profile picture to access your dashboard.</span>
                </div>
                <ul className={styles.requirementList}>
                  {completionItems.map((item) => (
                    <li key={item.label} className={item.complete ? styles.completeItem : styles.incompleteItem}>
                      {item.label}
                    </li>
                  ))}
                </ul>
              </section>
            )}

          {renderStaffAccount()}
          </>
        )}
      </div>

      {cropModal && (
        <ModalPortal>
          <div className={styles.modalBackdrop} onPointerMove={moveCropDrag} onPointerUp={endCropDrag} onPointerLeave={endCropDrag}>
          <section className={styles.cropModal}>
            <div className={styles.modalHeader}>
              <h2>Adjust profile picture</h2>
              <button type="button" className={styles.closeBtn} onClick={closeCropModal}>x</button>
            </div>
            <div className={styles.cropStage}>
              <div
                className={styles.cropFrame}
                onPointerDown={startCropDrag}
                role="presentation"
              >
                <img
                  ref={cropImageRef}
                  src={cropModal.src}
                  alt="Crop preview"
                  draggable="false"
                  onLoad={(e) => setCropImageSize({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight,
                  })}
                  style={cropPreviewStyle}
                />
                <div className={styles.cropMask} />
              </div>
              <p>Drag to reposition. Use zoom to fit the face inside the circle.</p>
              <div className={styles.zoomControl}>
                <span>-</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={crop.zoom}
                  onChange={(e) => {
                    const nextZoom = Number(e.target.value);
                    setCrop((current) => clampCropPosition({ ...current, zoom: nextZoom }));
                  }}
                />
                <span>+</span>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.textBtn} onClick={closeCropModal}>Cancel</button>
              <button type="button" className={styles.primaryBtn} onClick={requestSavePicture} disabled={pictureUploading}>
                {pictureUploading ? "Saving..." : "Save Picture"}
              </button>
            </div>
          </section>
        </div>
        </ModalPortal>
      )}

      {/* Portalled so the backdrop covers the whole viewport. See ModalPortal. */}
      <ModalPortal>
        {confirmAction && (
          <div
            className={styles.modalBackdrop}
            onClick={closeConfirmAction}
          >
            <section className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
              <h2>{confirmAction.title}</h2>
              <p className={styles.confirmBody}>{confirmAction.message}</p>
              <div className={styles.confirmActions}>
                <button type="button" className={styles.textBtn} onClick={closeConfirmAction}>
                  Cancel
                </button>
                <button type="button" className={styles.primaryBtn} onClick={performConfirmAction}>
                  {confirmAction.confirmLabel}
                </button>
              </div>
            </section>
          </div>
        )}
        {cameraOpen && (
          <div className={styles.modalBackdrop}>
            <section className={styles.cameraModal}>
              <div className={styles.modalHeader}>
                <h2>Take profile picture</h2>
                <button type="button" className={styles.closeBtn} onClick={closeCameraModal}>x</button>
              </div>
              <div className={styles.cameraBody}>
                <div className={styles.cameraFrame}>
                  {cameraStarting && <span>Starting camera...</span>}
                  <video ref={cameraVideoRef} playsInline muted />
                </div>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.textBtn} onClick={closeCameraModal}>Cancel</button>
                <button type="button" className={styles.primaryBtn} onClick={captureProfilePicture} disabled={cameraStarting}>
                  Capture
                </button>
              </div>
            </section>
          </div>
        )}

        {previewOpen && (
          <div className={styles.modalBackdrop} onClick={() => setPreviewOpen(false)}>
            <section className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Profile picture</h2>
                <button type="button" className={styles.closeBtn} onClick={() => setPreviewOpen(false)}>x</button>
              </div>
              <div className={styles.previewBody}>
                <AuthenticatedImage
                  src={user?.profileImageUrl}
                  alt={`${fullName} profile preview`}
                  fallback={<img src={pfp} alt={`${fullName} profile preview`} />}
                />
              </div>
            </section>
          </div>
        )}
      </ModalPortal>
    </main>
  );
}
