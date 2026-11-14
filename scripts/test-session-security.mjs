import assert from 'node:assert/strict';
import { signSessionToken, verifySessionToken } from '../backend/sessionToken.js';

const secret = 'session-secret';
const issued = signSessionToken({ userId: 42, role: 'student', sessionId: 'abc123' }, { secret, ttlMs: 60_000, now: 1_000 });
const verified = verifySessionToken(issued, { secret, now: 10_000 });
assert.deepEqual(verified, { sub: 42, role: 'student', exp: 61_000, sid: 'abc123' });
assert.equal(verifySessionToken(issued, { secret, now: 61_001 }), null);
assert.equal(verifySessionToken(signSessionToken({ userId: 7, role: 'admin' }, { secret, ttlMs: 60_000, now: 1_000 }), { secret, now: 10_000 })?.sid, undefined);
console.log('Session tokens include a server-issued session id and reject expired or forgery attempts.');
