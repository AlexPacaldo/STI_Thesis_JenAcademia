/**
 * The menu that opens from the name in the header.
 *
 * !! It is shaped like the one people already know: the person at the top,
 * !! then a list of things they can go to, then the way out, then a quiet
 * !! line at the bottom. A child who has used any phone can use this
 * !! without being told.
 *
 * !! Every row is a button a finger can hit (60px), and every row has a
 * !! picture AND a word - a child who cannot read the icon yet still knows
 * !! what it is for.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import styles from "../assets/AccountMenu.module.css";
import pfp from "../assets/img/Navbar/user.jpg";
import { ACCOUNT } from "../utils/studentCopy.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { clearStoredUser } from "../utils/sessionUser.js";
/**
 * The picture in the menu.
 *
 * !! The same picture the header shows, so the person recognises themselves.
 * !! A stored photo sits behind the session, so it is resolved to a blob:
 * !! URL the same way the header does it - a plain <img> would be refused.
 */
function AccountAvatar({ user }) {
  const url = user?.profileImageUrl || user?.profile_image_url;
  return (
    <AuthenticatedImage
      src={url}
      alt=""
      className={styles.avatar}
      fallback={<img className={styles.avatar} src={pfp} alt="" />}
    />
  );
}

export default function AccountMenu({ user, role, classHistoryPath = "/classHistory" }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);

  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const roleLabel = role === "admin" ? "Admin" : role === "teacher" ? "Teacher" : "Student";
  // Only a student and a teacher have classes of their own to look back on.
  const showClasses = role === "student" || role === "teacher";

  // Clicking anywhere else closes it, and so does the Escape key.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const logOut = () => {
    setOpen(false);
    clearStoredUser();
    window.location.href = "/";
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ACCOUNT.menuLabel}
      >
        <span className={styles.triggerName}>{fullName}</span>
        <AccountAvatar user={user} />
        <i className={`bi bi-chevron-down ${styles.triggerCaret}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className={styles.menu} role="menu" aria-label={ACCOUNT.menuLabel}>
          {/* Who this is. The person at the top, like every other menu. */}
          <div className={styles.head}>
            <AccountAvatar user={user} />
            <div className={styles.headText}>
              <span className={styles.headName}>{fullName}</span>
              <span className={styles.headRole}>{roleLabel}</span>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.items}>
            <Link to="/account" className={styles.item} role="menuitem" onClick={() => setOpen(false)}>
              <span className={styles.itemIcon} aria-hidden="true">
                <i className="bi bi-person-fill" />
              </span>
              <span className={styles.itemLabel}>{ACCOUNT.menuMyAccount}</span>
              <i className={`bi bi-chevron-right ${styles.itemChevron}`} aria-hidden="true" />
            </Link>

            {showClasses ? (
              <Link
                to={classHistoryPath}
                className={styles.item}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className={styles.itemIcon} aria-hidden="true">
                  <i className="bi bi-clock-history" />
                </span>
                <span className={styles.itemLabel}>{ACCOUNT.menuMyClasses}</span>
                <i className={`bi bi-chevron-right ${styles.itemChevron}`} aria-hidden="true" />
              </Link>
            ) : null}

            <a href="/#contact" className={styles.item} role="menuitem" onClick={() => setOpen(false)}>
              <span className={styles.itemIcon} aria-hidden="true">
                <i className="bi bi-question-circle-fill" />
              </span>
              <span className={styles.itemLabel}>{ACCOUNT.menuGetHelp}</span>
              <i className={`bi bi-chevron-right ${styles.itemChevron}`} aria-hidden="true" />
            </a>
          </div>

          <div className={styles.divider} />

          <div className={styles.items}>
            <button type="button" className={styles.item} role="menuitem" onClick={logOut}>
              <span className={styles.itemIcon} aria-hidden="true">
                <i className="bi bi-box-arrow-right" />
              </span>
              <span className={styles.itemLabel}>{ACCOUNT.menuLogOut}</span>
            </button>
          </div>

          <p className={styles.footer}>{ACCOUNT.menuFooter}</p>
        </div>
      ) : null}
    </div>
  );
}
