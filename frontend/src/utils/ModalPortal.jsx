import { createPortal } from "react-dom";

/**
 * Renders modal overlays into document.body instead of in place.
 *
 * Page content sits inside .content-area (and a wrapper in App.jsx) that both
 * run `animation: fadeIn ... both`, where fadeIn animates `transform`. Because
 * the fill mode is `both`, the final `transform: translateY(0)` keeps applying
 * after the animation finishes. A non-none transform makes that element the
 * containing block for `position: fixed` descendants, so a
 * `position: fixed; inset: 0` backdrop rendered inside it is positioned against
 * the content column rather than the viewport - it covers the page body but not
 * the header or the sidebar.
 *
 * Portalling to document.body escapes that containing block, which is what
 * "full screen" and "modal" are supposed to mean.
 */
export default function ModalPortal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}