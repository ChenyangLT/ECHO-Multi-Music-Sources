// Build-time shim: replaces ECHO-main/src/main/database/createDatabase.ts.
export const SQLITE_RUNTIME_PRAGMA_PROFILE = 'safe-performance-v1';
export const resolveSqliteDurabilityMode = (requested) => requested || 'balanced';
export const sqliteDurabilityModeFromSettings = () => 'balanced';
export const sqliteRuntimePragmas = () => [];
export const quarantineCorruptDatabase = (databasePath) => databasePath;
export const createDatabase = () => {
  throw new Error('echo_mms_database_unavailable');
};

/** The real module exports better-sqlite3's default constructor. */
const Database = function EchoMmsUnavailableDatabase() {
  throw new Error('echo_mms_database_unavailable');
};

export default Database;
