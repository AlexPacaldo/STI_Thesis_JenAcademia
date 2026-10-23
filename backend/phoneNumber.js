// phoneNumber.js
/**
 * Phone numbers, normalised before they are stored.
 *
 * !! A phone number is not a free-text field. It is a string of digits with an
 * !! optional country code, and the same number can be written five ways:
 * !! 0917 123 4567, 09171234567, +63 917 123 4567, 639171234567, (0917)
 * !! 123-4567. Stored as typed, those are five different numbers and nobody
 * !! can call any of them reliably. So the separators come out and a
 * !! Philippine mobile number becomes +639171234567.
 *
 * !! This is FORMAT validation, not ownership verification. It proves the
 * !! value could be a phone number; it does not prove the number belongs to
 * !! the person who typed it. Real verification needs an SMS one-time code
 * !! from a paid provider (Twilio, Vonage, Firebase), and this app does not
 * !! have one.
 */

/**
 * Strip the punctuation people put in phone numbers.
 *
 * !! Only the separators that are part of how people write numbers. Anything
 * !! else is refused, so a value carrying letters or markup never reaches the
 * !! database or an email.
 */
export function digitsOnly(value) {
  return String(value == null ? "" : value).replace(/[\s().-]/g, "");
}

/**
 * @param {string} raw what the user typed
 * @returns {{ok: true, value: string} | {ok: false, message: string}}
 */
export function normalizePhoneNumber(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) {
    return { ok: false, message: "A phone number is required." };
  }

  const compact = digitsOnly(text);

  if (!/^\+?\d{6,15}$/.test(compact)) {
    return {
      ok: false,
      message:
        "That phone number does not look right. Use digits only, for example 0917 123 4567 or +63 917 123 4567.",
    };
  }

  // A number made of one repeated digit is a placeholder, not a phone.
  // 99999999999 was in a real profile, and accepting it means the school has
  // a contact number that can never be called.
  if (/^(\+?)(\d)\2+$/.test(compact)) {
    return {
      ok: false,
      message: "That phone number looks like a placeholder. Please enter your real number.",
    };
  }

  // Philippine mobile, written the local way: 09XXXXXXXXX.
  if (/^09\d{9}$/.test(compact)) {
    return { ok: true, value: `+63${compact.slice(1)}` };
  }

  // Philippine mobile without the plus: 639XXXXXXXXX.
  if (/^63\d{10}$/.test(compact)) {
    return { ok: true, value: `+${compact}` };
  }

  // Anything else already carrying a country code.
  if (/^\+\d{6,15}$/.test(compact)) {
    return { ok: true, value: compact };
  }

  // A number with no country code and no local prefix. Kept as typed so a
  // visitor from another country is not refused for not knowing our format.
  return { ok: true, value: compact };
}
