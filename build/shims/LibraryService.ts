// Build-time shim: replaces ECHO-main/src/main/library/LibraryService.ts.
//
// The real service is the desktop library (protected SQLite + native scanners).
// The only thing ECHO-main's MvService asks of it is `getTrack(trackId)`, so the
// shim keeps a small registry of the tracks the mod is actually playing: the
// renderer reports the current track (id/title/artist/album/duration/cover) and
// the MV engine then searches, persists selections and offsets against real
// metadata instead of a "Streaming track" placeholder.
//
// Everything else the daemon service offers is deliberately unavailable: a mod
// has no library to expose.

type RegisteredTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  duration: number;
  coverThumb: string | null;
  mediaType: 'streaming' | 'local' | 'remote';
  provider: string | null;
  providerTrackId: string | null;
};

const registry = new Map<string, RegisteredTrack>();

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Records/refreshes the metadata of a track the mod is playing. */
export const rememberMvTrack = (input: unknown): string | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const id = text(record.id) || text(record.stableKey) || text(record.trackId);
  if (!id) return null;

  const previous = registry.get(id);
  const title = text(record.title) || previous?.title || 'Untitled';
  const artist = text(record.artist) || previous?.artist || 'Unknown Artist';
  const track: RegisteredTrack = {
    id,
    title,
    artist,
    album: text(record.album) || previous?.album || 'Unknown Album',
    albumArtist: text(record.albumArtist) || artist,
    duration: number(record.duration) || previous?.duration || 0,
    coverThumb: text(record.coverThumb) || text(record.coverUrl) || previous?.coverThumb || null,
    mediaType: record.mediaType === 'local' || record.mediaType === 'remote' ? record.mediaType : 'streaming',
    provider: text(record.provider) || previous?.provider || null,
    providerTrackId: text(record.providerTrackId) || previous?.providerTrackId || null,
  };
  registry.set(id, track);

  // Keep the registry bounded for long sessions.
  if (registry.size > 500) {
    const oldest = registry.keys().next().value;
    if (oldest) registry.delete(oldest);
  }
  return id;
};

export const forgetMvTrack = (id: unknown): boolean => registry.delete(text(id));
export const mvTrackRegistrySize = (): number => registry.size;
export const listMvTracks = (): RegisteredTrack[] => [...registry.values()];

const toLibraryTrack = (track: RegisteredTrack) => ({
  id: track.id,
  mediaType: track.mediaType,
  isTemporary: track.mediaType === 'streaming',
  path: track.id,
  sourceId: track.provider ?? track.id,
  provider: track.provider,
  providerTrackId: track.providerTrackId,
  stableKey: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.albumArtist,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: track.duration,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: null,
  coverThumb: track.coverThumb,
  fieldSources: {
    title: 'mod-registry',
    artist: 'mod-registry',
    album: 'mod-registry',
  },
});

class LibraryServiceShim {
  getTrack(trackId: unknown) {
    const track = registry.get(text(trackId));
    return track ? toLibraryTrack(track) : null;
  }

  getTracksByIds(trackIds: unknown) {
    if (!Array.isArray(trackIds)) return [];
    return trackIds.map((id) => this.getTrack(id)).filter(Boolean);
  }

  close() {
    /* nothing to release */
  }
}

let service: LibraryServiceShim | null = null;

export const getLibraryService = (): LibraryServiceShim => {
  service ??= new LibraryServiceShim();
  return service;
};

export const createLibraryService = (): LibraryServiceShim => new LibraryServiceShim();
export const closeDefaultLibraryService = (): void => {
  service = null;
};
