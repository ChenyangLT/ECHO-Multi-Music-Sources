// Build-time shim: replaces ECHO-main/src/main/audio/PlaybackSessionStore.ts.
// The real store persists playback session state into its own better-sqlite3
// database. The mod has no business owning ECHO's playback session, so this
// keeps the same surface backed by memory and a read-only JSON file that ECHO
// itself may have written.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

const defaultPlaybackSessionPath = () => {
  try {
    return join(app.getPath('userData'), 'echo-playback-session.json');
  } catch {
    return '';
  }
};

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const normalizePersistedPlaybackSession = (value, _fallbackUpdatedAt = new Date().toISOString()) => {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }
  return value;
};

export const createResumeFromAudioStatus = (session, status, updatedAt) => {
  if (!session || !status?.currentFilePath || ['idle', 'stopped', 'ended'].includes(status.state)) {
    return null;
  }
  return {
    queueId: session.currentQueueId ?? null,
    trackId: status.currentTrackId ?? session.currentTrackId ?? null,
    filePath: status.currentFilePath,
    positionMs: Math.round(Math.max(0, Number(status.positionSeconds) || 0) * 1000),
    durationMs: Math.round(Math.max(0, Number(status.durationSeconds) || 0) * 1000),
    state: status.state,
    updatedAt,
  };
};

export class PlaybackSessionStore {
  constructor(databasePath = defaultPlaybackSessionPath(), _options = {}) {
    this.databasePath = databasePath;
    this.session = null;
  }

  load() {
    if (this.session) {
      return this.session;
    }
    if (!this.databasePath || !existsSync(this.databasePath)) {
      return null;
    }
    try {
      this.session = normalizePersistedPlaybackSession(JSON.parse(readFileSync(this.databasePath, 'utf8')));
    } catch {
      this.session = null;
    }
    return this.session;
  }

  save(session) {
    this.session = session;
    return session;
  }

  saveWithAudioStatus(session, status) {
    return this.save({ ...session, resume: createResumeFromAudioStatus(session, status, new Date().toISOString()) });
  }

  saveResumeFromAudioStatus(status) {
    const session = this.load();
    if (!session) {
      return null;
    }
    return this.saveWithAudioStatus(session, status);
  }

  clearResume() {
    const session = this.load();
    if (!session) {
      return null;
    }
    return this.save({ ...session, resume: null });
  }

  clear() {
    this.session = null;
  }

  close() {}
}

let defaultPlaybackSessionStore = null;

export const getPlaybackSessionStore = () => {
  if (!defaultPlaybackSessionStore) {
    defaultPlaybackSessionStore = new PlaybackSessionStore();
  }
  return defaultPlaybackSessionStore;
};

export const closeDefaultPlaybackSessionStore = () => {
  defaultPlaybackSessionStore?.close();
  defaultPlaybackSessionStore = null;
};
