// Build-time shim: replaces ECHO-main/src/main/database/health.ts.
// The community module opens a real better-sqlite3 handle to probe the library
// database. The mod never owns that database, so every probe reports healthy.
export class DatabaseHealthError extends Error {
  constructor(message, status = 'unreadable') {
    super(message);
    this.name = 'DatabaseHealthError';
    this.status = status;
  }
}

export const isSqliteCorruptionMessage = (message) => /malformed|corrupt|not a database/iu.test(String(message ?? ''));
export const isDatabaseHealthy = (health) => health?.status === 'ok';
export const checkDatabaseOpenHealth = () => ({ status: 'ok' });
export const checkDatabaseHealth = () => ({ status: 'ok' });
export const checkDatabaseHealthCached = () => ({ status: 'ok' });
export const rememberDatabaseHealthOk = () => {};
export const clearDatabaseHealthCacheForTests = () => {};
export const assertDatabaseHealthy = () => {};
export const assertDatabaseOpenHealthy = () => {};
export const checkpointWal = () => ({ status: 'ok' });
