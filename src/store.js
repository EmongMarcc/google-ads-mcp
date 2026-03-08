import { randomUUID } from "crypto";

const sessions = new Map();

export function createSession(credentials) {
  const token = randomUUID();
  sessions.set(token, { ...credentials, createdAt: Date.now() });
  return token;
}

export function getSession(token) {
  return sessions.get(token) || null;
}

export function updateSession(token, updates) {
  const existing = sessions.get(token);
  if (!existing) return false;
  sessions.set(token, { ...existing, ...updates });
  return true;
}

export function deleteSession(token) {
  sessions.delete(token);
}

export function sessionCount() {
  return sessions.size;
}
