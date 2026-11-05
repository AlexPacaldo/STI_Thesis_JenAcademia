#!/usr/bin/env node
/**
 * Seed the beta-test accounts without changing the presentation seed data.
 *
 *   cd backend && node seed-beta-data.mjs
 *
 * This uses the same database safety checks and seed workflow as
 * seed-demo-data.mjs, with additional test accounts and synthetic LINE links.
 * Synthetic LINE links make setup appear complete but are not real LINE users;
 * reminders stay disabled until a tester connects a real account.
 */
process.env.JEN_ACADEMIA_SEED_PROFILE = "beta";
await import("./seed-demo-data.mjs");
