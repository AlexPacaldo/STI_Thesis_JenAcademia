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
 *
 * !! The panel is rendered through ModalPortal and positioned from the
 * !! button's own rectangle, because the page content sits inside an element
 * !! that animates a transform - and a transformed element is the containing
 * !! block for anything position: fixed inside it. Rendered in place, the
 * !! panel would be positioned against the page column instead of the
 * !! viewport, which on a phone puts it in the middle of the screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import styles from "../assets/AccountMenu.module.css";
import pfp from "../assets/img/Navbar/user.jpg";
import { ACCOUNT } from "../utils/studentCopy.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import ModalPortal from "../utils/ModalPortal.jsx";
import { clearStoredUser } from "../utils/sessionUser.js";

/** The width of the panel on a screen with room for it. */
const PANEL_WIDTH = 320;

/** Below this the panel is a sheet at the bottom of the screen. */
const PHONE_WIDTH = 640;

/**
 * The picture in the menu.
 *
 * !! The same picture the header shows, so the person recognises themselves.
 * !! A stored photo sits behind the session, so it is resolved to a blob:
 * !! URL the same way the header does it - a plain <img> would be refused.
 *
 * !! Two sizes: small in the header, where it sits beside 42px buttons and
 * !! a 38px picture is what looks right, and large in the menu, where it is
 * !! the first thing on the panel.
 */
function AccountAvatar({ user, className = "" }) {
  const url = user?.profileImageUrl || user?.profile_image_url;
  return (
    <AuthenticatedImage
      src={url}
      alt=""
      className={`${styles.avatar} ${className}`}
      fallback={<img className={`${styles.avatar} ${className}`} src={pfp} alt="" />}
    />
  );
}

export default function AccountMenu({ user, role, classHistoryPath = "/classHistory" }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(null);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const roleLabel = role === "admin" ? "Admin" : role === "teacher" ? "Teacher" : "Student";
  // Only a student and a teacher have classes of their own to look back on.
  const showClasses = role === "student" || role === "teacher";

  /**
   * Where the panel goes.
   *
   * !! On a screen with room, it hangs under the name and lines up with its
   * !! right edge - the way every other menu does it. On a phone there is no
   * !! edge to line up with and no room to hang anything, so it is a sheet
   * !! at the bottom of the screen instead.
   */
  const placePanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (window.innerWidth <= PHONE_WIDTH) {
      setPanel({ mode: "sheet" });
      return;
    }
    const left = Math.max(
      12,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 12)
    );
    setPanel({ mode: "anchored", top: Math.round(rect.bottom + 8), left });
  }, []);

  const openMenu = () => {
    placePanel();
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setPanel(null);
  };

  // Clicking anywhere else closes it, and so does the Escape key.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      const inTrigger = wrapperRef.current?.contains(event.target);
      const inPanel = menuRef.current?.contains(event.target);
      if (!inTrigger && !inPanel) closeMenu();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      closeMenu();
      triggerRef.current?.focus();
    };
    // The panel hangs under the button, so it has to follow the button when
    // the page moves.
    const onMove = () => placePanel();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, placePanel]);

  const logOut = () => {
    closeMenu();
    clearStoredUser();
    window.location.href = "/";
  };

  const panelStyle =
    panel?.mode === "anchored" ? { top: panel.top, left: panel.left } : undefined;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        onClick={() => (open ? closeMenu() : openMenu())}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ACCOUNT.menuLabel}
      >
        <span className={styles.triggerName}>{fullName}</span>
        <AccountAvatar user={user} className={styles.avatarSmall} />
        <i className={`bi bi-chevron-down ${styles.triggerCaret}`} aria-hidden="true" />
      </button>

      {open ? (
        <ModalPortal>
          {/* On a phone the sheet is a layer over the page, so it needs
              something behind it to say so. */}
          {panel?.mode === "sheet" ? (
            <div className={styles.backdrop} onClick={closeMenu} />
          ) : null}

          <div
            ref={menuRef}
            className={`${styles.menu} ${panel?.mode === "sheet" ? styles.menuSheet : ""}`}
            style={panelStyle}
            role="menu"
            aria-label={ACCOUNT.menuLabel}
          >
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
              <Link
                to="/account"
                className={styles.item}
                role="menuitem"
                onClick={closeMenu}
              >
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
                  onClick={closeMenu}
                >
                  <span className={styles.itemIcon} aria-hidden="true">
                    <i className="bi bi-clock-history" />
                  </span>
                  <span className={styles.itemLabel}>{ACCOUNT.menuMyClasses}</span>
                  <i className={`bi bi-chevron-right ${styles.itemChevron}`} aria-hidden="true" />
                </Link>
              ) : null}

              <a href="/#contact" className={styles.item} role="menuitem" onClick={closeMenu}>
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
        </ModalPortal>
      ) : null}
    </div>
  );
}
