// In-memory session store
// Each registered user gets a UUID → credentials mapping
// Note: resets on Railway restart — users just re-register (no DB needed)

import { randomUUID } from "crypto";

const sessions = new Map();

export function createSession(credentials) {
  const token = randomUUID();
  sessions.set(token, {
    ...credentials,
    createdAt: Date.now(),
  });
  return token;
}

export function getSession(token) {
  return sessions.get(token) || null;
}

export function deleteSession(token) {
  sessions.delete(token);
}

export function sessionCount() {
  return sessions.size;
}
