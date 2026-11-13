// This flag records first-time setup and survives every way of unlinking LINE.
export function isLineSetupRequired(user) {
  return user?.role === "student"
    && !user.line_user_id
    && !Number(user.line_setup_completed);
}

export async function ensureLineSetupColumn(connection, hasColumn) {
  if (await hasColumn("users", "line_setup_completed")) return;
  await connection.query(
    "ALTER TABLE users ADD COLUMN line_setup_completed BOOLEAN NOT NULL DEFAULT FALSE"
  );
  // Existing finished accounts must not be forced through onboarding again.
  await connection.query(
    `UPDATE users SET line_setup_completed = TRUE
     WHERE profile_completed = TRUE OR line_user_id IS NOT NULL`
  );
}
