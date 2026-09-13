// Build-time shim: replaces ECHO-main/src/main/database/LibraryDatabaseManager.ts.
//
// The community MvService keeps the matched videos, their stream variants and
// the per-track offset in ECHO's protected SQLite library. A mod owns no such
// database — but Electron 43 ships Node 24, and Node ships `node:sqlite`, so the
// MV tables live in their own small database file inside ECHO's userData
// directory instead. MvService itself runs completely unmodified, and the
// selected video / offsets survive a game restart.
//
// The shim exposes the same surface the real manager does
// (`openServiceConnection` returning `{ database, close }`) plus the two
// better-sqlite3 conveniences `node:sqlite` lacks: `transaction()` and `name`.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const nodeRequire = createRequire(typeof __filename === 'string' ? __filename : join(process.cwd(), 'echo-mms-shim.cjs'));

type SqliteStatement = {
  run: (...args: unknown[]) => { changes?: number; lastInsertRowid?: number | bigint };
  get: (...args: unknown[]) => unknown;
  all: (...args: unknown[]) => unknown[];
};

type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

type SqliteCtor = new (path: string) => SqliteDatabase;

/** `node:sqlite` is loaded lazily so a host without it still loads the bundle. */
const loadSqliteCtor = (): SqliteCtor | null => {
  try {
    const sqlite = nodeRequire('node:sqlite') as { DatabaseSync?: SqliteCtor };
    return sqlite?.DatabaseSync ?? null;
  } catch {
    return null;
  }
};

/** True when the MV engine can keep its own tables (Node >= 22.5, Electron 43). */
export const isMvDatabaseAvailable = (): boolean => loadSqliteCtor() !== null;

// ECHO's own `track_videos` schema (src/main/database/schema.ts). MvService
// creates the `track_video_streams` table itself; it is created here too so the
// very first statement in the service cannot fail on a fresh file.
const TRACK_VIDEOS_SQL = `
CREATE TABLE IF NOT EXISTS track_videos (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT,
  artist TEXT,
  url TEXT,
  provider_url TEXT,
  thumbnail_url TEXT,
  file_path TEXT,
  mime_type TEXT,
  duration_seconds REAL,
  width INTEGER,
  height INTEGER,
  selected_quality_id TEXT,
  quality_label TEXT,
  fps REAL,
  offset_ms INTEGER NOT NULL DEFAULT 0,
  raw_provider_json TEXT,
  score REAL NOT NULL DEFAULT 0,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_track_videos_track_id ON track_videos(track_id);
CREATE INDEX IF NOT EXISTS idx_track_videos_provider ON track_videos(provider, source_id);
`;

const TRACK_VIDEO_STREAMS_SQL = `
CREATE TABLE IF NOT EXISTS track_video_streams (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  quality_tier TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  fps REAL,
  codec TEXT,
  container TEXT,
  mime_type TEXT,
  protocol TEXT NOT NULL,
  url TEXT,
  headers_json TEXT NOT NULL DEFAULT '{}',
  playable_in_app INTEGER NOT NULL DEFAULT 0,
  requires_account INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(video_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_track_video_streams_video_id ON track_video_streams(video_id);
CREATE INDEX IF NOT EXISTS idx_track_video_streams_provider ON track_video_streams(provider, variant_id);
`;

/** MvService passes positional parameters; `undefined` must become SQL NULL. */
const normalizeArgs = (args: unknown[]): unknown[] => args.map((value) => (value === undefined ? null : value));

const wrapStatement = (statement: SqliteStatement) => ({
  run: (...args: unknown[]) => statement.run(...normalizeArgs(args)),
  get: (...args: unknown[]) => statement.get(...normalizeArgs(args)) ?? undefined,
  all: (...args: unknown[]) => statement.all(...normalizeArgs(args)),
});

const wrapDatabase = (database: SqliteDatabase, name: string) => ({
  name,
  exec: (sql: string) => database.exec(sql),
  prepare: (sql: string) => wrapStatement(database.prepare(sql)),
  close: () => database.close(),
  /** better-sqlite3's transaction helper, which `node:sqlite` does not ship. */
  transaction: <T, A extends unknown[]>(work: (...args: A) => T) => (...args: A): T => {
    database.exec('BEGIN');
    try {
      const result = work(...args);
      database.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        /* the original error matters more */
      }
      throw error;
    }
  },
  pragma: (statement: string) => {
    try {
      database.exec(`PRAGMA ${statement}`);
    } catch {
      /* pragmas are advisory here */
    }
  },
});

export type MvDatabaseConnection = {
  database: ReturnType<typeof wrapDatabase>;
  close: () => void;
  path: string;
};

/** Where the MV tables live. Exported so the mod UI can show it. */
export const mvDatabasePath = (): string => {
  const explicit = typeof process.env.ECHO_MMS_MV_DB === 'string' ? process.env.ECHO_MMS_MV_DB.trim() : '';
  if (explicit) return explicit;

  let userData = '';
  try {
    const electron = nodeRequire('electron') as { app?: { getPath?: (name: string) => string } };
    userData = electron?.app?.getPath?.('userData') || '';
  } catch {
    /* not running inside Electron */
  }
  if (!userData) userData = process.env.APPDATA || process.cwd();
  return join(userData, 'echo-mms-mv.sqlite');
};

export const createMvDatabaseConnection = (path = mvDatabasePath()): MvDatabaseConnection => {
  const Sqlite = loadSqliteCtor();
  if (!Sqlite) {
    throw new Error('node:sqlite is unavailable in this runtime; the MV engine cannot start');
  }

  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    /* the directory normally exists (it is ECHO's userData) */
  }

  const database = new Sqlite(path);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(TRACK_VIDEOS_SQL);
  database.exec(TRACK_VIDEO_STREAMS_SQL);

  return {
    database: wrapDatabase(database, path),
    close: () => {
      try {
        database.close();
      } catch {
        /* already closed */
      }
    },
    path,
  };
};

/** Mirrors the real manager closely enough for MvService's single call site. */
export class LibraryDatabaseManager {
  private connection: MvDatabaseConnection | null = null;

  constructor(private readonly storagePath: string = mvDatabasePath()) {}

  openServiceConnection(_name = 'mv'): MvDatabaseConnection {
    this.connection ??= createMvDatabaseConnection(this.storagePath);
    return this.connection;
  }

  open(): MvDatabaseConnection {
    return this.openServiceConnection('mv');
  }

  close(): void {
    this.connection?.close();
    this.connection = null;
  }
}

let defaultManager: LibraryDatabaseManager | null = null;

export const createLibraryDatabaseManager = (path?: string) => new LibraryDatabaseManager(path);
export const getLibraryDatabaseManager = (): LibraryDatabaseManager => {
  defaultManager ??= new LibraryDatabaseManager();
  return defaultManager;
};
export const closeDefaultLibraryDatabaseManager = (): void => {
  defaultManager?.close();
  defaultManager = null;
};
