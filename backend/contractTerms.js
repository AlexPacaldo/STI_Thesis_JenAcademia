// contractTerms.js
/**
 * How long a class contract runs, and how early the student hears about it.
 *
 * !! Extracted from server.js for the same reason dbConfig.js was extracted.
 * !!
 * !! The demo seeder needs the same term length to write expires_at, and having
 * !! it written out a second time is how the Contracts tab ends up showing an
 * !! empty Expires column while the server believes every package has a deadline.
 * !! One number, one place.
 */

/**
 * Months a package runs from the moment it was purchased.
 *
 * The term runs from purchase. created_at IS the purchase moment for every
 * package in the system, which is why no separate start date is stored: one
 * timestamp, and the deadline is derived from it.
 */
export const CONTRACT_TERM_MONTHS = 3;

/**
 * How far ahead of the deadline the student is told.
 *
 * Long enough to actually book the classes they have left, short enough that it
 * is still news.
 */
export const CONTRACT_EXPIRY_WARNING_DAYS = 14;