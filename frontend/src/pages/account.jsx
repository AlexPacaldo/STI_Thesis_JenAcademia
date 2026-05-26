import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/account.module.css";
import pfp from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";
import { getUserTimezone } from "../utils/timezone.js";

const API = "http://localhost:3001";
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
  "Thailand",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Vietnam",
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
  Thailand: "Asia/Bangkok",
  "United Arab Emirates": "Asia/Dubai",
  "United Kingdom": "Europe/London",
  "United States": "America/New_York",
  Vietnam: "Asia/Ho_Chi_Minh",
};
const TIMEZONE_OPTIONS = [
  "Asia/Manila",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Jakarta",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Seoul",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Ho_Chi_Minh",
  "Australia/Sydney",
  "America/Toronto",
  "America/New_York",
  "Europe/London",
  "UTC",
];

function absoluteUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url}`;
}

function mapUser(u = {}) {
  return {
    id: u.id ?? u.user_id ?? null,
    firstName: u.firstName ?? u.first_name ?? "",
    lastName: u.lastName ?? u.last_name ?? "",
    email: u.email ?? "",
    contact: u.contact ?? u.contact_number ?? "",
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

function formFromUser(user) {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    contact: user.contact,
    country: user.country,
    birthDate: normalizeDateInput(user.birthDate),
    timezone: user.timezone,
  };
}

function formatRole(role) {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
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

function formatAccountDate(value, timezone) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-US", { timeZone: getUserTimezone({ timezone }) });
}

function hasRequiredCompletionFields(user) {
  return Boolean(
    String(user?.contact || "").trim()
    && String(user?.profileImageUrl || "").trim()
    && user?.passwordChanged
  );
}

function isCompleteUser(user) {
  return Boolean(user?.profileCompleted && hasRequiredCompletionFields(user));
}

function Stat({ label, value }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
    </div>
  );
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
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    contact: "",
    country: "",
    birthDate: "",
    timezone: "Asia/Manila",
  });
  const [profileEditing, setProfileEditing] = useState(false);
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pictureUploading, setPictureUploading] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [cropModal, setCropModal] = useState(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0, zoom: 1 });
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const storedUser = useMemo(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? mapUser(JSON.parse(stored)) : null;
    } catch {
      return null;
    }
  }, []);

  const details = user?.roleDetails || {};
  const fullName = `${form.firstName || ""} ${form.lastName || ""}`.trim() || "Account";
  const avatarSrc = useMemo(() => absoluteUrl(user?.profileImageUrl) || pfp, [user?.profileImageUrl]);
  const age = calculateAge(form.birthDate);
  const completionItems = useMemo(() => ([
    { label: "Profile picture", complete: Boolean(user?.profileImageUrl) },
    { label: "Contact number", complete: Boolean(String(form.contact || "").trim()) },
    { label: "Password changed", complete: Boolean(user?.passwordChanged) },
  ]), [form.contact, user?.passwordChanged, user?.profileImageUrl]);
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
      setPasswordEditing(!refreshed.passwordChanged);
    }
    localStorage.setItem("user", JSON.stringify(refreshed));
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
      setPasswordEditing(!mapped.passwordChanged);
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
    localStorage.removeItem("user");
    window.location.href = "/";
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
    notify(`Detected timezone: ${detectedTimezone}`, "success");
  }

  function cancelProfileEdit() {
    if (user) setForm(formFromUser(user));
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

    setSaving(true);
    try {
      await axios.put(`${API}/api/users/${user.id}`, form);
      const updated = await loadUser(user.id);
      setProfileEditing(!updated.profileCompleted);
      notify("Profile updated successfully.", "success");

      if (updated.profileCompleted && isProfileIncomplete) {
        setTimeout(() => {
          if (updated.role === "teacher") navigate("/TeacherDashboard");
          else if (updated.role === "admin") navigate("/AdminDashboard");
          else navigate("/StudentDashboard");
        }, 400);
      }
    } catch (err) {
      notify(err?.response?.data?.message || "Could not update profile.", "error");
    } finally {
      setSaving(false);
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
    payload.append("profile_picture", file, "profile-picture.png");
    setPictureUploading(true);

    try {
      await axios.post(`${API}/api/users/${user.id}/profile-picture`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const nextUser = await loadUser(user.id);
      notify("Profile picture updated.", "success");
      closeCropModal();
      if (nextUser.profileCompleted && isProfileIncomplete) {
        setTimeout(() => {
          if (nextUser.role === "teacher") navigate("/TeacherDashboard");
          else if (nextUser.role === "admin") navigate("/AdminDashboard");
          else navigate("/StudentDashboard");
        }, 400);
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

  function renderRolePanel() {
    if (user.role === "student") {
      const classesLeft = details.classes_left ?? (
        details.total_classes != null && details.classes_used != null
          ? Math.max(0, Number(details.total_classes) - Number(details.classes_used))
          : null
      );

      return (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Learning Profile</h2>
            <span>Student</span>
          </div>
          <div className={styles.statsGrid}>
            <Stat label="Course" value={details.course_name} />
            <Stat label="Teacher" value={details.teacher_first_name ? `${details.teacher_first_name} ${details.teacher_last_name || ""}`.trim() : details.teacher_name} />
            <Stat label="Classes Left" value={classesLeft} />
            <Stat label="Classes Used" value={`${formatValue(details.classes_used, "0")} / ${formatValue(details.total_classes, "0")}`} />
          </div>
        </section>
      );
    }

    if (user.role === "teacher") {
      return (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Teaching Profile</h2>
            <span>Teacher</span>
          </div>
          <div className={styles.statsGrid}>
            <Stat label="Active Students" value={details.active_students ?? 0} />
            <Stat label="Upcoming Classes" value={details.upcoming_classes ?? 0} />
            <Stat label="Experience" value={details.experience_years ? `${details.experience_years} years` : null} />
            <Stat label="Specialization" value={details.specialization} />
          </div>
          <div className={styles.detailList}>
            <p><strong>Courses:</strong> {formatValue(details.courses)}</p>
          </div>
        </section>
      );
    }

    return (
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Administration</h2>
          <span>Admin</span>
        </div>
        <div className={styles.statsGrid}>
          <Stat label="Active Students" value={details.active_students ?? 0} />
          <Stat label="Active Teachers" value={details.active_teachers ?? 0} />
          <Stat label="Archived Users" value={details.archived_users ?? 0} />
          <Stat label="Account Status" value={user.status} />
        </div>
      </section>
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
        {isProfileIncomplete && (
          <section className={styles.notice}>
            <div>
              <strong>Complete your profile</strong>
              <span>Upload a profile picture, add your contact number, and change your password to access your dashboard.</span>
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

        <section className={styles.hero}>
          <div className={styles.avatarWrap}>
            <button
              type="button"
              className={styles.avatarButton}
              onClick={() => setAvatarMenuOpen((open) => !open)}
              aria-label="Open profile picture options"
            >
              <img className={styles.avatar} src={avatarSrc} alt={`${fullName} profile`} />
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className={styles.fileInput}
              onChange={(e) => handleProfileFile(e.target.files?.[0])}
            />
          </div>

          <div className={styles.heroContent}>
            <div>
              <h1>{fullName}</h1>
              <div className={styles.badges}>
                <span>{formatRole(user.role)}</span>
                <span>{formatRole(user.status)}</span>
              </div>
            </div>
            <p>{user.email}</p>
          </div>
        </section>

        <section className={styles.mainGrid}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Profile Information</h2>
              <span>{profileEditing ? "Editing" : "Locked"}</span>
            </div>
            <form onSubmit={saveProfile} className={styles.form}>
              <div className={styles.row}>
                <label>
                  First Name
                  <input name="firstName" value={form.firstName} onChange={onChange} disabled={!profileEditing} required />
                </label>
                <label>
                  Last Name
                  <input name="lastName" value={form.lastName} onChange={onChange} disabled={!profileEditing} required />
                </label>
              </div>

              <div className={styles.row}>
                <label>
                  Email
                  <input type="email" name="email" value={form.email} onChange={onChange} disabled={!profileEditing} required />
                </label>
              </div>

              <div className={styles.row}>
                <label>
                  Country
                  <select name="country" value={form.country} onChange={onChange} disabled={!profileEditing}>
                    <option value="">Select Country</option>
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Birthday
                  <input type="date" name="birthDate" value={form.birthDate} onChange={onChange} disabled={!profileEditing} />
                </label>
              </div>

              <div className={styles.row}>
                <label>
                  Contact Number
                  <input name="contact" value={form.contact} onChange={onChange} disabled={!profileEditing} placeholder="09xx xxx xxxx" required />
                </label>
                <label>
                  Age
                  <input value={age === null ? "Not set" : `${age} years old`} disabled readOnly />
                </label>
              </div>

              <div className={styles.row}>
                <label>
                  Timezone
                  <div className={styles.timezoneControl}>
                    <select name="timezone" value={form.timezone} onChange={onChange} disabled={!profileEditing} required>
                      <option value="">Select timezone</option>
                      {form.timezone && !TIMEZONE_OPTIONS.includes(form.timezone) && (
                        <option value={form.timezone}>{form.timezone}</option>
                      )}
                      {TIMEZONE_OPTIONS.map((timezone) => (
                        <option key={timezone} value={timezone}>{timezone}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.detectBtn}
                      onClick={autoDetectTimezone}
                      disabled={!profileEditing}
                    >
                      Auto Detect
                    </button>
                  </div>
                </label>
              </div>

              <div className={styles.actions}>
                {profileEditing && (
                  <button type="button" className={styles.textBtn} onClick={cancelProfileEdit}>
                    Cancel
                  </button>
                )}
                <button className={styles.primaryBtn} disabled={saving}>
                  {profileEditing ? (saving ? "Saving..." : "Save Changes") : "Update Profile"}
                </button>
              </div>
            </form>
          </section>

          {renderRolePanel()}

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Security</h2>
              <span>{passwordEditing ? "Editing" : "Locked"}</span>
            </div>
            <form onSubmit={changePassword} className={styles.form}>
              <div className={styles.row}>
                <label>
                  Current Password
                  <input
                    type="password"
                    value={pwd.current}
                    disabled={!passwordEditing}
                    onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
                    required={passwordEditing}
                  />
                </label>
                <label>
                  New Password
                  <input
                    type="password"
                    value={pwd.next}
                    disabled={!passwordEditing}
                    onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
                    required={passwordEditing}
                  />
                </label>
               <label>
                  Confirm Password
                  <input
                    type="password"
                    value={pwd.confirm}
                    disabled={!passwordEditing}
                    onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                    required={passwordEditing}
                  />
                </label>
              </div>

              <div className={styles.actions}>
                {passwordEditing && (
                  <button type="button" className={styles.textBtn} onClick={cancelPasswordEdit}>
                    Cancel
                  </button>
                )}
                <button className={styles.primaryBtn} disabled={pwdSaving}>
                  {passwordEditing ? (pwdSaving ? "Updating..." : "Save Password") : "Update Password"}
                </button>
              </div>
            </form>
          </section>

          <section className={`${styles.card} ${styles.accountMeta}`}>
            <div className={styles.cardHeader}>
              <h2>Account</h2>
              <span>{user.profileCompleted ? "Complete" : "Incomplete"}</span>
            </div>
            <div className={styles.detailList}>
              <p><strong>User ID:</strong> {user.id}</p>
              <p><strong>Role:</strong> {formatRole(user.role)}</p>
              <p><strong>Created:</strong> {formatAccountDate(user.createdAt, user.timezone)}</p>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout}>Log out</button>
          </section>
        </section>
      </div>

      {cropModal && (
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
              <button type="button" className={styles.primaryBtn} onClick={saveCroppedProfilePicture} disabled={pictureUploading}>
                {pictureUploading ? "Saving..." : "Save Picture"}
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
              <img src={avatarSrc} alt={`${fullName} profile preview`} />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
