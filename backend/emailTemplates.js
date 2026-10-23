/**
 * The HTML of the emails this app sends.
 *
 * !! Email clients are not browsers. Gmail strips <style> blocks in some
 * !! contexts, Outlook renders with Word, and neither knows what a flexbox is.
 * !! So the layout here is tables and inline styles, which is old-fashioned
 * !! and is the only thing that looks the same in all of them. A modern
 * !! layout looks right in the developer's browser and collapses in the one
 * !! place it is actually read.
 *
 * !! Every value that came from a visitor is escaped before it reaches the
 * !! markup. The contact form puts a stranger's name and message into this
 * !! template, and an email client renders HTML - so an unescaped message is
 * !! a script tag delivered to the school's inbox.
 *
 * !! Every message keeps a plain-text version. The HTML is the design; the
 * !! text is what a watch, a terminal, or a client with images and styles
 * !! turned off will show, and it is also the part spam filters read.
 */

const BRAND = {
  forest: "#1e3828",
  forestDark: "#16301f",
  green: "#2f7a3d",
  lime: "#79a847",
  limeBright: "#a9d16f",
  paper: "#eef2ec",
  surface: "#ffffff",
  soft: "#f6f8f3",
  border: "#e3eadd",
  text: "#26423b",
  muted: "#5e7268",
  ink: "#13251f",
};

const FONT =
  "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Turn a value into text that is safe inside markup.
 *
 * !! The order matters: the ampersand goes first, or the entities produced by
 * !! the later replacements are themselves re-escaped and the page shows
 * !! "&amp;lt;" instead of "<".
 */
export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Keep a visitor's line breaks without trusting their markup.
 *
 * !! Escaping happens first, so the only tags in the result are the <br>s
 * !! added here. Doing it the other way round would leave a message that
 * !! contains "<br>" free to invent its own structure.
 */
function escapeMultiline(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

function firstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0];
  return first || "there";
}

/* ---------------------------------------------------------------- the shell */

/**
 * The frame every email shares: the header, the accent bar, the footer.
 *
 * !! Only the middle is passed in. The header and the footer are what make
 * !! three different emails look like they came from the same school, and a
 * !! copy of them per message is how one of them ends up with the old logo.
 *
 * @param {{preview: string, rows: string, footerPrimary: string, footerSecondary: string}} parts
 */
function renderEmail({ preview, rows, footerPrimary, footerSecondary }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>JEN Academia</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.paper};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${BRAND.surface};border:1px solid #dfe7dc;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND.forest};padding:26px 32px;">
            <div style="font-family:${FONT};font-size:21px;line-height:1.2;font-weight:800;letter-spacing:0.2px;color:#ffffff;">
              <span style="color:${BRAND.limeBright};">JEN</span> Academia
            </div>
          </td>
        </tr>
        <tr><td style="height:4px;background:${BRAND.lime};font-size:0;line-height:0;">&nbsp;</td></tr>
${rows}
        <tr>
          <td style="background:#fafbf8;border-top:1px solid #e9eee5;padding:18px 32px;">
            <div style="font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};">
              ${footerPrimary}
            </div>
            <div style="font-family:${FONT};font-size:12px;line-height:1.6;color:#8a9b93;padding-top:4px;">
              ${footerSecondary}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** The small uppercase label that starts a section. */
function eyebrow(text, color = BRAND.green) {
  return `<div style="font-family:${FONT};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${color};">${text}</div>`;
}

/** A dark pill with a link in it. The table is what Outlook needs. */
function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:${BRAND.forest};border-radius:999px;">
                  <a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:14px;line-height:1.4;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
                </td>
              </tr>
            </table>`;
}

/* ------------------------------------------------------- the contact form */

/**
 * The message the school receives when somebody uses the contact form.
 *
 * @param {{name: string, email: string, message: string, inbox?: string}} form
 * @returns {{text: string, html: string}}
 */
export function contactFormEmail({ name, email, message, inbox }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeMultiline(message);
  const safeInbox = escapeHtml(inbox || "");
  const replyLabel = `Reply to ${escapeHtml(firstName(name))}`;
  const preview = `New message from ${safeName} via the JEN Academia contact form.`;

  const text = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    ``,
    `Message:`,
    message,
    ``,
    `--`,
    `Reply to this email to answer ${name} directly.`,
    `Sent from the contact form at jenacademia.com.`,
  ].join("\n");

  const rows = `        <tr>
          <td style="padding:32px 32px 0;">
            ${eyebrow("New contact form message")}
            <div style="font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.forest};padding-top:8px;word-break:break-word;">
              ${safeName}
            </div>
            <div style="font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.muted};padding-top:8px;">
              Someone used the contact form on jenacademia.com. Reply straight to them &mdash; the reply address is already set.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:12px;">
              <tr>
                <td style="padding:14px 18px;">
                  <div style="font-family:${FONT};font-size:10px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};">Name</div>
                  <div style="font-family:${FONT};font-size:15px;line-height:1.5;font-weight:600;color:${BRAND.ink};padding-top:3px;word-break:break-word;">${safeName}</div>
                </td>
              </tr>
              <tr><td style="padding:0 18px;"><div style="height:1px;background:${BRAND.border};font-size:0;line-height:0;">&nbsp;</div></td></tr>
              <tr>
                <td style="padding:14px 18px;">
                  <div style="font-family:${FONT};font-size:10px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};">Email</div>
                  <div style="font-family:${FONT};font-size:15px;line-height:1.5;font-weight:600;padding-top:3px;word-break:break-all;">
                    <a href="mailto:${safeEmail}" style="color:${BRAND.green};text-decoration:none;">${safeEmail}</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 32px 0;">
            <div style="font-family:${FONT};font-size:10px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};">Message</div>
            <div style="margin-top:8px;padding:18px 20px;background:${BRAND.surface};border-left:3px solid ${BRAND.lime};border-top:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};border-bottom:1px solid ${BRAND.border};border-radius:0 10px 10px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.text};word-break:break-word;">
              ${safeMessage}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 32px 34px;">
            ${button(`mailto:${safeEmail}`, replyLabel)}
          </td>
        </tr>`;

  const html = renderEmail({
    preview,
    rows,
    footerPrimary: `Sent from the contact form at jenacademia.com. Replies go to ${safeEmail}.`,
    footerSecondary: `JEN Academia${safeInbox ? ` &middot; ${safeInbox}` : ""}`,
  });

  return { text, html };
}

/* -------------------------------------------------- the account invite */

/**
 * The message that gives a new student or teacher their account.
 *
 * !! The link is the whole point of this email, so it appears twice: once as
 * !! a button for people who read mail on a phone, and once as text for
 * !! people whose client blocks buttons, who want to check where a link goes
 * !! before following it, or who are pasting it into another browser. An
 * !! invite with only a button is an invite that some people cannot accept.
 *
 * @param {{firstName?: string, roleLabel?: string, inviteUrl: string, expiresText?: string, contactEmail?: string}} invite
 * @returns {{text: string, html: string}}
 */
export function accountInviteEmail({
  firstName: firstNameValue,
  roleLabel,
  inviteUrl,
  expiresText,
  contactEmail,
}) {
  const safeName = escapeHtml(firstNameValue || "there");
  const safeRole = escapeHtml(roleLabel || "student");
  const safeUrl = escapeHtml(inviteUrl);
  const safeExpiry = escapeHtml(expiresText || "");
  const safeContact = escapeHtml(contactEmail || "");
  const preview = `Your JEN Academia ${safeRole} account is ready — set your password to finish setting it up.`;

  const text = [
    `Hi ${firstNameValue || "there"},`,
    "",
    `Your JEN Academia ${roleLabel || "student"} account has been created.`,
    "Please use this secure link to set your password and complete your account setup:",
    "",
    inviteUrl,
    "",
    expiresText ? `This invite expires on ${expiresText}.` : "",
    "",
    "If you did not expect this message, please contact JEN Academia.",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  const rows = `        <tr>
          <td style="padding:32px 32px 0;">
            ${eyebrow(`${safeRole} account`)}
            <div style="font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.forest};padding-top:8px;">
              Welcome, ${safeName}
            </div>
            <div style="font-family:${FONT};font-size:14px;line-height:1.7;color:${BRAND.muted};padding-top:8px;">
              Your JEN Academia ${safeRole} account has been created. Choose a password to finish setting it up &mdash; it takes about a minute.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 32px 0;">
            ${button(safeUrl, "Set up my account")}
          </td>
        </tr>
        ${
          safeExpiry
            ? `<tr>
          <td style="padding:20px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:12px;">
              <tr>
                <td style="padding:14px 18px;">
                  <div style="font-family:${FONT};font-size:10px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};">This link expires</div>
                  <div style="font-family:${FONT};font-size:15px;line-height:1.5;font-weight:600;color:${BRAND.ink};padding-top:3px;">${safeExpiry}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};">
              Button not working? Copy this link into your browser:
            </div>
            <div style="font-family:${FONT};font-size:12px;line-height:1.6;padding-top:5px;word-break:break-all;">
              <a href="${safeUrl}" style="color:${BRAND.green};text-decoration:none;">${safeUrl}</a>
            </div>
          </td>
        </tr>
        <tr><td style="padding:0 32px 34px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

  const html = renderEmail({
    preview,
    rows,
    footerPrimary: `You are receiving this because a JEN Academia account was created for this email address.`,
    footerSecondary: safeContact
      ? `Did not expect this? Contact us at ${safeContact}.`
      : `Did not expect this? Please contact JEN Academia.`,
  });

  return { text, html };
}
