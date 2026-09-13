// Build-time shim: replaces ECHO-main/src/main/streaming/StreamingCacheStore.ts.
//
// The community cache store persists streaming tracks, imported playlists and
// API responses into ECHO's protected SQLite library database. A ShinawaseLoader
// mod runs inside the Steam build, where that database is owned by ECHO's own
// main process, so this shim keeps the exact same public surface but stores the
// same data in memory for the lifetime of the game process.
//
// The provider algorithms themselves never touch this: they only produce tracks,
// details and playback sources. Only StreamingService's cache/side-effect calls
// land here, and every one of them tolerates an in-memory backend.
import { randomUUID } from 'node:crypto';
// Absolute so this shim can live outside the ECHO source tree (see build/shim-plugin.mjs).
import { streamingStableKey } from 'ECHO_MAIN_ROOT/src/shared/types/streaming';

const playlistIdFor = (kind, provider, playlistId) =>
  `mms-${kind}-${provider ? `${provider}-` : ''}${String(playlistId ?? 'default')}`;

const playlistFor = (kind, sourceProvider, sourcePlaylistId, name) => ({
  id: playlistIdFor(kind, sourceProvider, sourcePlaylistId),
  name: name || kind,
  kind,
  sourceProvider: sourceProvider ?? null,
  sourcePlaylistId: sourcePlaylistId ?? null,
  itemCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const trackKey = (provider, providerTrackId) => `${provider}\u0000${providerTrackId}`;

export class StreamingCacheStore {
  constructor(_database, _backupPlaylistBeforeReset) {
    this.tracks = new Map();
    this.trackSources = new Map();
    this.apiCache = new Map();
    this.playlists = new Map();
    this.playlistItems = new Map();
  }

  getTrack(provider, providerTrackId) {
    return this.tracks.get(trackKey(provider, providerTrackId)) ?? null;
  }

  getTrackSourceInfo(provider, providerTrackId) {
    return this.trackSources.get(trackKey(provider, providerTrackId)) ?? null;
  }

  upsertTrack(track, raw = track) {
    if (!track?.provider || !track?.providerTrackId) {
      return;
    }
    const key = trackKey(track.provider, track.providerTrackId);
    this.tracks.set(key, track);
    if (raw) {
      this.trackSources.set(key, {
        provider: track.provider,
        providerTrackId: track.providerTrackId,
        sourceProvider: raw.sourceProvider ?? null,
        sourceItemId: raw.sourceItemId ?? null,
        albumId: raw.albumId ?? track.albumId ?? null,
      });
    }
  }

  upsertTracks(tracks) {
    for (const track of Array.isArray(tracks) ? tracks : []) {
      this.upsertTrack(track);
    }
  }

  setApiCache(provider, kind, cacheKey, payload, expiresAt) {
    this.apiCache.set(cacheKey, { payload, expiresAt, kind, provider });
  }

  getApiCache(cacheKey, options = {}) {
    const hit = this.apiCache.get(cacheKey);
    if (!hit) {
      return null;
    }
    if (options.allowExpired === true) {
      return hit.payload;
    }
    const expiresAtMs = Date.parse(hit.expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return null;
    }
    return hit.payload;
  }

  upsertImportedPlaylist(playlist, options = {}) {
    const id = options.kind
      ? playlistIdFor(options.kind, playlist.provider, playlist.providerPlaylistId)
      : playlistIdFor('streaming', playlist.provider, playlist.providerPlaylistId);
    const existing = this.playlists.get(id);
    // The community detail type calls it `title`; the mod page reads `name`.
    const requestedName = playlist.name || playlist.title;
    const next = {
      ...(existing ?? playlistFor(options.kind ?? 'streaming', playlist.provider, playlist.providerPlaylistId, requestedName)),
      id,
      name: requestedName || existing?.name || 'Streaming',
      kind: options.kind ?? existing?.kind ?? 'streaming',
      sourceProvider: playlist.provider ?? null,
      sourcePlaylistId: playlist.providerPlaylistId ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.playlists.set(id, next);
    return next;
  }

  replacePlaylistItems(playlistId) {
    this.playlistItems.set(playlistId, []);
  }

  refreshPlaylistItemCount(playlistId) {
    const playlist = this.playlists.get(playlistId) ?? playlistFor('streaming', null, playlistId, 'Streaming');
    const itemCount = (this.playlistItems.get(playlistId) ?? []).length;
    const next = { ...playlist, itemCount, updatedAt: new Date().toISOString() };
    this.playlists.set(playlistId, next);
    return next;
  }

  importStreamingPlaylistPage(playlist, options = {}) {
    const savedPlaylist = this.upsertImportedPlaylist(playlist, options);
    if (options.reset) {
      this.playlistItems.set(savedPlaylist.id, []);
    }
    this.upsertTracks(playlist.tracks);
    const items = this.playlistItems.get(savedPlaylist.id) ?? [];
    let position = Number.isFinite(options.startPosition) ? options.startPosition : items.length;
    for (const track of Array.isArray(playlist.tracks) ? playlist.tracks : []) {
      items.push({
        playlistId: savedPlaylist.id,
        mediaId: track.id ?? streamingStableKey(track.provider, track.providerTrackId),
        position,
        addedFrom: options.addedFrom ?? null,
        track,
      });
      position += 1;
    }
    this.playlistItems.set(savedPlaylist.id, items);
    return { playlist: this.refreshPlaylistItemCount(savedPlaylist.id), nextPosition: position };
  }

  importLikedStreamingTracks(tracks, options = {}) {
    const playlist = this.upsertImportedPlaylist(
      { provider: 'netease', providerPlaylistId: 'liked', name: 'Liked Songs', tracks: [] },
      { kind: 'system' },
    );
    this.upsertTracks(tracks);
    const items = this.playlistItems.get(playlist.id) ?? [];
    const known = new Set(items.map((item) => item.mediaId));
    let addedCount = 0;
    let position = items.length;
    for (const track of Array.isArray(tracks) ? tracks : []) {
      const mediaId = track.id ?? streamingStableKey(track.provider, track.providerTrackId);
      if (known.has(mediaId)) {
        continue;
      }
      known.add(mediaId);
      items.push({ playlistId: playlist.id, mediaId, position, addedFrom: options.addedFrom ?? null, track });
      position += 1;
      addedCount += 1;
    }
    this.playlistItems.set(playlist.id, items);
    return {
      playlist: this.refreshPlaylistItemCount(playlist.id),
      importedCount: Array.isArray(tracks) ? tracks.length : 0,
      addedCount,
    };
  }

  unlikeLikedStreamingTrack(provider, providerTrackId) {
    const mediaId = streamingStableKey(provider, providerTrackId);
    for (const [playlistId, items] of this.playlistItems) {
      this.playlistItems.set(
        playlistId,
        items.filter((item) => item.mediaId !== mediaId),
      );
    }
  }

  /**
   * Tracks of an imported playlist, in playlist order.
   *
   * The real store is read back through SQLite by the library layer; the mod has
   * no database, so the in-memory items are the only record of what a daily
   * recommendation or a liked-songs sync imported. The mod bridge reads them
   * back so the page can list and play those tracks.
   */
  getPlaylistTracks(playlistId) {
    const items = this.playlistItems.get(playlistId) ?? [];
    return items
      .slice()
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
      .map((item) => item.track)
      .filter(Boolean);
  }

  /** Mirrors the real store's id generation so callers can reuse it. */
  static playlistId(kind, provider, playlistId) {
    return playlistIdFor(kind, provider, playlistId);
  }
}

export const streamingCacheStoreRandomId = () => randomUUID();

let defaultCacheStore = null;

/**
 * The community StreamingService expects a cache store instance. Real ECHO
 * builds one per database connection; the mod shares one in-memory store for the
 * lifetime of the game process.
 */
export const getStreamingCacheStore = () => {
  if (!defaultCacheStore) {
    defaultCacheStore = new StreamingCacheStore(null, null);
  }
  return defaultCacheStore;
};
