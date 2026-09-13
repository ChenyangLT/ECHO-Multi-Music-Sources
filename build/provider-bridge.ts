// Entry point for the Multi Music Sources provider bridge.
//
// Everything here is built on the ECHO Community streaming algorithms: the
// per-platform provider implementations, the streaming service orchestration
// (search cache, quality fallback, lyrics/MV lookup, playlist import) and the
// account service that reads the same per-platform login cookies the community
// build uses.
//
// Modules that depend on ECHO's desktop daemon (protected SQLite library,
// Electron auth windows) are replaced at build time by the shims in ./shims.
import { getAccountService } from 'ECHO_MAIN_ROOT/src/main/accounts/AccountService';
import { createStreamingProviderRegistry, StreamingService } from 'ECHO_MAIN_ROOT/src/main/streaming/StreamingService';
import { BilibiliMvProvider } from 'ECHO_MAIN_ROOT/src/main/mv/OnlineMvProviders';
import { MvService } from 'ECHO_MAIN_ROOT/src/main/mv/MvService';
import { jsonFetch } from 'ECHO_MAIN_ROOT/src/main/streaming/providers/chinaStreamingUtils';
import { fetchWithNetworkProxy } from 'ECHO_MAIN_ROOT/src/main/network/networkFetch';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { getQrLoginManager, loginWindowProviders, qrLoginProviders } from './qr-login';
import { setShimSettings, setShimSettingsListener } from './shims/appSettings';
import { getStreamingCacheStore } from './shims/StreamingCacheStore';
import { createMvDatabaseConnection, isMvDatabaseAvailable, mvDatabasePath } from './shims/LibraryDatabaseManager';
import { getLibraryService, listMvTracks, rememberMvTrack } from './shims/LibraryService';

const SERVICE_KEY = '__echoMmsProviderBridge';

let service = null;

const ensureService = () => {
  if (!service) {
    // The cache store is the build-time in-memory shim (see build/shims), so the
    // provider algorithms run exactly as they do in the community build without
    // ever touching ECHO's protected SQLite library.
    service = new StreamingService(createStreamingProviderRegistry(), getStreamingCacheStore());
  }
  return service;
};

const asRecord = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const requireText = (value, label) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label || 'value'} is required.`);
  }
  return trimmed;
};

const platformNames = ['netease', 'qqmusic', 'kugou', 'bilibili', 'youtube', 'soundcloud', 'spotify', 'tidal', 'qobuz', 'osu'];

const requirePlatform = (value) => {
  const name = requireText(value, 'provider');
  if (!platformNames.includes(name)) {
    throw new Error(`Unsupported music platform: ${name}`);
  }
  return name;
};

const optionalPositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return max ? Math.min(max, Math.max(1, Math.floor(parsed))) : Math.max(1, Math.floor(parsed));
};

/**
 * Probes a media URL with a ranged request over plain node:http(s).
 *
 * This must NOT go through Electron's net.fetch: that path rejects (or gets a
 * 403 for) a cross-origin `Origin` header, which is exactly what Bilibili's CDN
 * returns for the progressive URLs, so every candidate looked refused. The media
 * proxy already fetches with node:https, which the CDN accepts.
 */
const probeMediaUrl = (url: string, headers: Record<string, string>): Promise<number | null> =>
  new Promise((resolve) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      resolve(null);
      return;
    }

    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      { method: 'GET', headers: { ...headers, Range: 'bytes=0-1' } },
      (response) => {
        resolve(Number(response.statusCode) || null);
        response.resume();
      },
    );
    request.on('error', () => resolve(null));
    request.setTimeout(8_000, () => {
      try {
        request.destroy();
      } catch {
        /* ignore */
      }
      resolve(null);
    });
    request.end();
  });

/** Tracks of a playlist imported into the in-memory cache store. */
const storedPlaylistTracks = (playlistId: unknown): unknown[] => {  const id = typeof playlistId === 'string' ? playlistId.trim() : '';
  if (!id) {
    return [];
  }
  try {
    const store = getStreamingCacheStore() as unknown as { getPlaylistTracks?: (id: string) => unknown[] };
    return typeof store.getPlaylistTracks === 'function' ? store.getPlaylistTracks(id) : [];
  } catch {
    return [];
  }
};

/**
 * The playlist link the community importer needs, from whatever an account
 * listing handed back.
 *
 * NetEase and QQ Music describe an account playlist with `providerPlaylistId`
 * (and a `webUrl`) but no plain `url`, so a caller that only forwarded `url`
 * ended up passing a bare numeric id — which is not a URL at all and made
 * `importPlaylistFromUrl` answer "Please enter a valid streaming playlist URL".
 * Any bare id is turned into the platform's canonical playlist link here, so the
 * renderer cannot get this wrong whatever shape it reads.
 */
const canonicalAccountPlaylistUrl = (provider: string, value: string, providerPlaylistId?: unknown): string => {
  const raw = String(value || '').trim();
  if (/^https?:\/\//iu.test(raw)) return raw;

  const id = (raw || String(providerPlaylistId ?? '').trim()).replace(/[^0-9A-Za-z_-]/gu, '');
  if (!id) return raw;

  switch (provider) {
    case 'netease':
      // The hash form is the one the community parser understands (`id` param).
      return `https://music.163.com/#/playlist?id=${encodeURIComponent(id)}`;
    case 'qqmusic':
      return `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(id)}`;
    case 'kugou':
      return `https://www.kugou.com/yy/special/single/${encodeURIComponent(id)}.html`;
    case 'spotify':
      return `https://open.spotify.com/playlist/${encodeURIComponent(id)}`;
    case 'youtube':
      return `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
    default:
      return raw;
  }
};

type AccountProfileExtras = {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  vipLabel: string | null;
};

/** The account playlist shape the mod page renders (community-compatible). */
export type AccountPlaylistEntry = {
  id: string;
  name: string;
  title: string;
  provider: string;
  providerPlaylistId: string;
  url: string;
  trackCount: number | null;
  coverUrl: string | null;
  description: string | null;
  creator: string | null;
  kind: 'playlist' | 'favorites' | 'collected' | 'watchlater';
};

const bilibiliHeaders = (cookie: string, referer = 'https://www.bilibili.com/') => ({
  ...(cookie ? { Cookie: cookie } : {}),
  Referer: referer,
  Origin: 'https://www.bilibili.com',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
});

const bilibiliFavoritesUrl = (mid: string | number, mediaId: string | number) =>
  `https://space.bilibili.com/${mid}/favlist?fid=${mediaId}`;

/**
 * Bilibili's own account collections: the favourites folders the user created,
 * the folders they follow, and "watch later".
 *
 * The community provider has no account-playlist support for Bilibili, so this
 * is a mod-level addition. Every entry carries the public favourites URL in
 * `providerPlaylistId`, which is exactly what the community's
 * `favoritesImportFromUrl` path understands — so opening one reuses the same
 * playlist import/playback pipeline as NetEase and QQ Music.
 */
const bilibiliAccountPlaylists = async (): Promise<AccountPlaylistEntry[]> => {
  const cookie = getAccountService().getCredentials('bilibili').cookie ?? '';
  const headers = bilibiliHeaders(cookie);
  const nav = asRecord(await jsonFetch('https://api.bilibili.com/x/web-interface/nav', { headers, timeoutMs: 12_000 }));
  const mid = nav?.data?.mid ?? nav?.mid ?? null;
  if (!mid) {
    throw new Error('请先登录 B 站账号，再查看收藏夹。');
  }

  const entries: AccountPlaylistEntry[] = [];
  const push = (
    kind: AccountPlaylistEntry['kind'],
    id: string,
    title: string,
    url: string,
    trackCount: number | null,
    coverUrl: string | null,
    description: string | null,
  ) => {
    if (!id) return;
    entries.push({
      id: `bilibili:${kind}:${id}`,
      name: title,
      title,
      provider: 'bilibili',
      providerPlaylistId: url,
      url,
      trackCount,
      coverUrl,
      description,
      creator: typeof nav?.data?.uname === 'string' ? nav.data.uname : null,
      kind,
    });
  };

  const created = asRecord(await jsonFetch(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`, { headers, timeoutMs: 12_000 }));
  for (const folder of Array.isArray(created?.data?.list) ? created.data.list : []) {
    const record = asRecord(folder);
    push(
      'favorites',
      String(record.id ?? ''),
      String(record.title ?? '收藏夹'),
      bilibiliFavoritesUrl(mid, String(record.id ?? '')),
      Number(record.media_count) || 0,
      typeof record.cover === 'string' ? record.cover : null,
      null,
    );
  }

  try {
    const collected = asRecord(await jsonFetch(`https://api.bilibili.com/x/v3/fav/folder/collected/list?up_mid=${mid}&pn=1&ps=50&platform=web`, { headers, timeoutMs: 12_000 }));
    for (const folder of Array.isArray(collected?.data?.list) ? collected.data.list : []) {
      const record = asRecord(folder);
      push(
        'collected',
        String(record.id ?? ''),
        `订阅：${String(record.title ?? '')}`,
        bilibiliFavoritesUrl(record.mid ?? mid, String(record.id ?? '')),
        Number(record.media_count) || 0,
        typeof record.cover === 'string' ? record.cover : null,
        typeof record.intro === 'string' ? record.intro : null,
      );
    }
  } catch {
    /* followed folders are optional */
  }

  try {
    const watchLater = asRecord(await jsonFetch('https://api.bilibili.com/x/v2/history/toview', { headers, timeoutMs: 12_000 }));
    if (Number(watchLater?.data?.count) > 0) {
      push(
        'watchlater',
        'toview',
        '稍后再看',
        'https://www.bilibili.com/watchlater/',
        Number(watchLater.data.count) || 0,
        null,
        null,
      );
    }
  } catch {
    /* watch later is optional */
  }

  return entries;
};

const neteaseProfileCache = new Map<string, { at: number; extras: AccountProfileExtras | null }>();

/**
 * NetEase's account endpoint is the only place the signed-in nickname, avatar
 * and uid exist; the community provider keeps nothing but the cookie.
 */
const neteaseProfileExtras = async (providerName: string): Promise<AccountProfileExtras | null> => {
  if (providerName !== 'netease') {
    return null;
  }

  const cached = neteaseProfileCache.get('netease');
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    return cached.extras;
  }

  let extras: AccountProfileExtras | null = null;
  try {
    const cookie = getAccountService().getCredentials('netease').cookie;
    if (cookie) {
      const payload = asRecord(await jsonFetch('https://music.163.com/api/nuser/account/get', {
        headers: {
          Accept: 'application/json,text/plain,*/*',
          Cookie: cookie,
          Referer: 'https://music.163.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        timeoutMs: 12_000,
      }));
      const profile = asRecord(payload.profile);
      const account = asRecord(payload.account);
      const userId = profile.userId ?? account.id ?? account.userId;
      const nickname = typeof profile.nickname === 'string' && profile.nickname.trim() ? profile.nickname.trim() : null;
      const avatarUrl = typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim() ? profile.avatarUrl.trim() : null;
      if (nickname || userId !== undefined && userId !== null) {
        extras = {
          displayName: nickname ?? (userId !== undefined && userId !== null ? String(userId) : null),
          username: userId !== undefined && userId !== null ? String(userId) : null,
          avatarUrl,
          vipLabel: Number(profile.vipType) > 0 ? 'VIP' : null,
        };
      }
    }
  } catch {
    extras = null;
  }

  neteaseProfileCache.set('netease', { at: Date.now(), extras });
  return extras;
};

// ---- Song background helpers ----------------------------------------------

let bilibiliMvProvider = null;

const getBilibiliMvProvider = () => {
  if (!bilibiliMvProvider) {
    bilibiliMvProvider = new BilibiliMvProvider();
  }
  return bilibiliMvProvider;
};

/**
 * The MV providers take a library track. Only the display fields are read by the
 * Bilibili path (artist/title/album drive the query and the match score), so the
 * rest is filled with neutral values.
 */
const buildMvTrack = ({ title, artist, album, duration }) => ({
  id: `streaming:background:${title}`,
  path: '',
  title,
  artist: artist || 'Unknown Artist',
  album: typeof album === 'string' && album.trim() ? album.trim() : 'Unknown Album',
  albumArtist: artist || 'Unknown Artist',
  duration: Number(duration) || 0,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: null,
  coverThumb: null,
  addedAt: new Date().toISOString(),
});

const buildMvSettings = (request = {}) => ({
  autoSearch: true,
  autoPreload: false,
  restartAudioOnLoad: false,
  enabledProviders: ['bilibili'],
  providerOrder: ['bilibili'],
  maxQuality: typeof request.maxQuality === 'string' ? request.maxQuality : '1080p',
  allow60fps: request.allow60fps !== false,
  preferHighestViewCount: request.preferHighestViewCount !== false,
  titleOnlySearch: request.titleOnlySearch === true,
});

// ---- Community MV engine ---------------------------------------------------
//
// This is ECHO-main's own MvService (plus its Bilibili/YouTube providers, the
// local-file provider and the scoring module) bundled as-is. Only its daemon
// dependencies are replaced at build time: the protected library database (a
// `node:sqlite` file with ECHO's track_videos schema) and the library lookup (a
// registry of the tracks the renderer is playing). Search order, candidate
// scoring, quality ladders, auto-apply, per-track offsets and the immersive
// background settings therefore behave exactly like the community build.

let mvService: MvService | null = null;
let mvServiceError: string | null = null;

const getMv = (): MvService => {
  if (mvService) return mvService;
  if (mvServiceError) throw new Error(mvServiceError);
  try {
    const connection = createMvDatabaseConnection();
    mvService = new MvService(
      connection.database as never,
      { getTrack: (trackId: string) => getLibraryService().getTrack(trackId) } as never,
      undefined,
      undefined,
      undefined,
      connection.close,
    );
  } catch (error) {
    mvServiceError = error instanceof Error ? error.message : String(error);
    throw new Error(mvServiceError);
  }
  return mvService;
};

/** Mirrors mvIpc's snapshot-request validation. */
const normalizeSnapshotRequest = (value: unknown): Record<string, unknown> => {
  const input = asRecord(value);
  const trackId = requireText(input.trackId, 'trackId');
  const title = requireText(input.title, 'title');
  const durationSeconds = Number(input.durationSeconds);
  return {
    trackId,
    title,
    artist: typeof input.artist === 'string' && input.artist.trim() ? input.artist.trim() : 'Unknown Artist',
    album: typeof input.album === 'string' && input.album.trim() ? input.album.trim() : null,
    albumArtist: typeof input.albumArtist === 'string' && input.albumArtist.trim() ? input.albumArtist.trim() : null,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    coverThumb: typeof input.coverThumb === 'string' && input.coverThumb.trim() ? input.coverThumb.trim() : null,
    mediaType: input.mediaType === 'remote' || input.mediaType === 'local' ? input.mediaType : 'streaming',
    query: typeof input.query === 'string' && input.query.trim() ? input.query.trim() : null,
  };
};

const api = {
  version: 1,
  mode: 'community-provider-bridge',

  /** Applies renderer-side preferences (lyrics providers, TIDAL client, proxy). */
  configure(patch) {
    const input = asRecord(patch);
    // The MV engine writes mv* settings back through the community
    // AccountService/appSettings shim; the mod main process persists them.
    if (typeof input.onMvSettingsChange === 'function') {
      setShimSettingsListener(input.onMvSettingsChange as (changed: Record<string, unknown>, all: Record<string, unknown>) => void);
    }
    setShimSettings(input);
    return { ok: true };
  },

  getProviders() {
    return ensureService().getProviders();
  },

  async search(request) {
    const input = asRecord(request);
    const mediaTypes = Array.isArray(input.mediaTypes) && input.mediaTypes.length ? input.mediaTypes : ['track'];
    return ensureService().search({
      provider: requirePlatform(input.provider),
      query: requireText(input.query, 'query'),
      mediaTypes,
      page: optionalPositiveInt(input.page, 1),
      pageSize: optionalPositiveInt(input.pageSize, 20, 50),
    });
  },

  async getTrack(request) {
    const input = asRecord(request);
    return ensureService().getTrack(requirePlatform(input.provider), requireText(input.providerTrackId, 'providerTrackId'));
  },

  getTrackSourceInfo(request) {
    const input = asRecord(request);
    return ensureService().getTrackSourceInfo({
      provider: requirePlatform(input.provider),
      providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
    });
  },

  async getAlbum(request) {
    const input = asRecord(request);
    return ensureService().getAlbum(requirePlatform(input.provider), requireText(input.providerAlbumId, 'providerAlbumId'));
  },

  async getArtist(request) {
    const input = asRecord(request);
    return ensureService().getArtist(requirePlatform(input.provider), requireText(input.providerArtistId, 'providerArtistId'));
  },

  async getLyrics(request) {
    const input = asRecord(request);
    return ensureService().getLyrics({
      provider: requirePlatform(input.provider),
      providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
    });
  },

  async getMv(request) {
    const input = asRecord(request);
    return ensureService().getMv({
      provider: requirePlatform(input.provider),
      providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
    });
  },

  async resolvePlayback(request) {
    const input = asRecord(request);
    const quality = ['standard', 'high', 'lossless', 'hires'].includes(input.quality) ? input.quality : undefined;
    return ensureService().resolvePlayback({
      provider: requirePlatform(input.provider),
      providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
      quality,
    });
  },

  invalidatePlayback(request) {
    const input = asRecord(request);
    try {
      ensureService().invalidatePlayback({
        provider: requirePlatform(input.provider),
        providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
      });
    } catch {
      /* invalidation is best effort */
    }
    return { ok: true };
  },

  async analyzeBpm(request) {
    const input = asRecord(request);
    return ensureService().analyzeBpm({
      provider: requirePlatform(input.provider),
      providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
    });
  },

  async importPlaylistFromUrl(url) {
    return ensureService().importPlaylistFromUrl(requireText(url, 'playlist URL'));
  },

  async listAccountPlaylists(provider) {
    const name = requirePlatform(provider);
    if (name === 'bilibili') {
      // The community provider has no Bilibili account-playlist support, so the
      // favourites folders are read here (and every entry is a favourites URL the
      // normal import pipeline can open).
      const playlists = await bilibiliAccountPlaylists();
      return { provider: name, supported: true, playlists };
    }
    return ensureService().listAccountPlaylists(name);
  },

  /**
   * Opens one of the account's own playlists / collections.
   *
   * NetEase, QQ Music and Spotify go through the community playlist import; a
   * Bilibili favourites folder goes through the community favourites import.
   * Both end in a playable track list, which is returned directly so the page can
   * render and play it without another round trip.
   */
  async importAccountCollection(input) {
    const request = asRecord(input);
    const provider = requirePlatform(request.provider);
    const url = canonicalAccountPlaylistUrl(
      provider,
      requireText(request.url, 'playlist url'),
      request.providerPlaylistId,
    );
    const service = ensureService();

    if (provider === 'bilibili' || /\/favlist|watchlater/u.test(url)) {
      const result = await service.importFavoritesFromUrl(url);
      const snapshot = asRecord(service.getFavorites());
      const collections = Array.isArray(snapshot.collections) ? snapshot.collections : [];
      const collection = collections.find((item) => asRecord(item).id === result?.collectionId) ?? null;
      const tracks = Array.isArray(asRecord(collection).tracks) ? asRecord(collection).tracks : [];
      return {
        provider,
        playlistId: result?.collectionId ?? null,
        playlistName: result?.playlistName ?? null,
        importedCount: result?.importedCount ?? tracks.length,
        tracks,
      };
    }

    const result = await service.importPlaylistFromUrl(url);
    return {
      provider,
      playlistId: result?.playlistId ?? null,
      playlistName: result?.playlistName ?? null,
      importedCount: result?.importedCount ?? 0,
      tracks: storedPlaylistTracks(result?.playlistId),
    };
  },

  async syncLikedSongs(provider) {
    const result = await ensureService().syncLikedSongs(provider ? requirePlatform(provider) : undefined);
    return { ...result, tracks: storedPlaylistTracks(result?.playlistId) };
  },

  async setTrackLiked(request) {
    const input = asRecord(request);
    return ensureService().setTrackLiked(
      requirePlatform(input.provider),
      requireText(input.providerTrackId, 'providerTrackId'),
      input.liked === true,
    );
  },

  async refreshNeteaseDailyRecommend() {
    const result = await ensureService().refreshNeteaseDailyRecommend();
    // The service keeps the imported playlist in the cache store; the page needs
    // the tracks themselves to list and play them.
    return { ...result, tracks: storedPlaylistTracks(result?.playlistId) };
  },

  /** Returns the tracks of a playlist this bridge imported (daily / liked). */
  getStoredPlaylist(request) {
    const input = asRecord(request);
    const playlistId = requireText(input.playlistId, 'playlistId');
    return {
      playlistId,
      tracks: storedPlaylistTracks(playlistId),
    };
  },

  async getFavorites() {
    return ensureService().getFavorites();
  },

  /**
   * Diagnostic: replays a platform request through both the provider helper and
   * the raw network path so a platform-side change can be told apart from a
   * provider-side bug. Only used by the build's probe scripts.
   */
  async debugFetch(input) {
    const request = asRecord(input);
    const url = requireText(request.url, 'url');
    const method = request.method === 'POST' ? 'POST' : 'GET';
    const headers = asRecord(request.headers);
    const body = request.body;
    const report = { url, method, headers, bodyKind: body === undefined ? 'none' : typeof body };

    try {
      const viaHelper = await jsonFetch(url, {
        method,
        headers,
        body,
        timeoutMs: Number(request.timeoutMs) || 15_000,
      });
      report.helper = JSON.stringify(viaHelper).slice(0, Number(request.preview) || 1200);
    } catch (error) {
      report.helperError = error instanceof Error ? error.message : String(error);
    }

    try {
      const response = await fetchWithNetworkProxy(url, {
        method,
        headers,
        body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      });
      report.proxyStatus = response.status;
      report.proxyBody = (await response.text()).slice(0, Number(request.preview) || 1200);
    } catch (error) {
      report.proxyError = error instanceof Error ? error.message : String(error);
    }

    return report;
  },

  setFavorite(request) {
    const input = asRecord(request);
    return ensureService().setFavorite(input.track, input.favorite === true);
  },

  exportFavorites() {
    return ensureService().getFavoritesExportContent();
  },

  // ---- Accounts ------------------------------------------------------------
  // The community AccountService owns %APPDATA%\ECHO Steam\accounts.json, the
  // same store ECHO Steam uses, so a login saved here is shared with the host.
  getAccountStatuses() {
    return getAccountService().getStatuses();
  },

  getAccountStatus(provider) {
    return getAccountService().getStatus(requirePlatform(provider));
  },

  getAccountCredentials(provider) {
    const credentials = getAccountService().getCredentials(requirePlatform(provider));
    return {
      provider: credentials.provider,
      browser: credentials.browser ?? null,
      hasCookie: Boolean(credentials.cookie?.trim()),
    };
  },

  /**
   * Main-process only: the raw login cookie for a platform.
   *
   * The MV downloader needs Bilibili's SESSDATA to fetch the background video,
   * and this never leaves the main process (the renderer only ever sees the
   * boolean from getAccountCredentials).
   */
  getProviderCookie(provider) {
    const name = requirePlatform(provider);
    const cookie = getAccountService().getCredentials(name).cookie;
    return {
      provider: name,
      cookie: typeof cookie === 'string' && cookie.trim() ? cookie.trim() : null,
    };
  },

  saveAccountCookie(provider, cookie) {
    return getAccountService().saveCookie(requirePlatform(provider), requireText(cookie, 'cookie'));
  },

  clearAccount(provider) {
    return getAccountService().clearAccount(requirePlatform(provider));
  },

  async checkAccount(provider) {
    return getAccountService().checkAccount(requirePlatform(provider));
  },

  async checkAllAccounts() {
    const results = [];
    for (const name of platformNames) {
      try {
        results.push(await getAccountService().checkAccount(name));
      } catch (error) {
        results.push({ provider: name, connected: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  },

  /**
   * Account statuses enriched with the signed-in identity.
   *
   * ECHO's own store keeps the display name and avatar for most platforms, but
   * NetEase's provider is a bare cookie record, so its nickname/avatar/uid are
   * read from the account endpoint and cached for the session. This is what the
   * mod's account page shows next to "已登录".
   */
  async accountProfiles() {
    const statuses = getAccountService().getStatuses();
    const profiles = [];
    for (const status of statuses) {
      const extras = status.connected ? await neteaseProfileExtras(status.provider) : null;
      profiles.push({
        ...status,
        displayName: extras?.displayName ?? status.displayName,
        username: extras?.username ?? status.username,
        avatarUrl: extras?.avatarUrl ?? status.avatarUrl,
        vipLabel: extras?.vipLabel ?? null,
      });
    }
    return profiles;
  },

  // ---- QR sign-in ---------------------------------------------------------
  // Bilibili and QQ Music render their own QR in the mod page (their login
  // endpoints can be driven straight from a partitioned session); NetEase keeps
  // the community service, which needs the web page's device fingerprint. Any
  // other platform opens ECHO's own login window, where the phone can scan the
  // same QR.

  /** Which sign-in route each platform offers, so the page can label the button. */
  qrLoginCapabilities() {
    return {
      qrImage: [...qrLoginProviders],
      loginWindow: [...loginWindowProviders],
    };
  },

  async startQrLogin(provider: string) {
    return getQrLoginManager().start(requirePlatform(provider));
  },

  async pollQrLogin(input) {
    const request = asRecord(input);
    const key = requireText(request.key, 'QR login key');
    const providerName = typeof request.provider === 'string' ? request.provider.trim() : '';
    return getQrLoginManager().poll(key, providerName && platformNames.includes(providerName) ? (providerName as never) : undefined);
  },

  // ---- Song background (Bilibili MV) --------------------------------------
  // Reuses the community build's Bilibili MV searcher and stream resolver, which
  // already implement the WBI signing, quality ladder and matching heuristics.

  /** Diagnostic: probes each Bilibili search endpoint and reports the raw outcome. */
  async probeMvEndpoints(input) {
    const request = asRecord(input);
    const query = requireText(request.query, 'query');
    const headers = {
      Referer: 'https://www.bilibili.com/',
      Origin: 'https://www.bilibili.com',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };
    const targets = [
      ['search/type', `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}&page=1&order=click&page_size=8`],
      ['search/all/v2', `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(query)}&page=1`],
      ['nav', 'https://api.bilibili.com/x/web-interface/nav'],
    ];
    // The provider sends a search.bilibili.com Referer and its own User-Agent;
    // the plain probes above use www.bilibili.com. Comparing both isolates
    // whether the provider's header set is what Bilibili rejects.
    const providerHeaders = {
      Referer: `https://search.bilibili.com/video?keyword=${encodeURIComponent(query)}`,
      Origin: 'https://search.bilibili.com',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ECHO-Next/1.0 Safari/537.36',
    };
    const report: Record<string, unknown> = {};
    for (const [name, url] of targets) {
      for (const [variant, headerSet] of [['plain', headers], ['provider', providerHeaders]] as const) {
        try {
          const response = await fetchWithNetworkProxy(url, { headers: headerSet });
          const text = await response.text();
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = null;
          }
          const data = asRecord(asRecord(parsed).data);
          const result = data.result;
          const videoGroup = Array.isArray(result)
            ? result.find((group) => asRecord(group).result_type === 'video')
            : null;
          report[`${name}/${variant}`] = {
            status: response.status,
            code: asRecord(parsed).code ?? null,
            bodyHead: text.slice(0, 90),
            resultLen: Array.isArray(result) ? result.length : null,
            videoGroupLen: videoGroup ? (Array.isArray(asRecord(videoGroup).data) ? (asRecord(videoGroup).data as unknown[]).length : null) : null,
          };
        } catch (error) {
          report[`${name}/${variant}`] = { error: error instanceof Error ? error.message : String(error) };
        }
      }
    }
    return report;
  },

  // ---- Community MV engine (ECHO-main's MvService over RPC) ----------------

  /** Engine state for the settings page: ready?, database file, current settings. */
  mvEngineStatus() {
    if (!isMvDatabaseAvailable()) {
      return { ready: false, error: 'node:sqlite unavailable', database: null, settings: null, tracks: 0, account: null };
    }
    let account = null;
    try {
      const credentials = getAccountService().getCredentials('bilibili');
      const status = getAccountService().getStatus('bilibili');
      account = {
        connected: Boolean(status?.connected),
        displayName: status?.displayName ?? null,
        hasCookie: Boolean(credentials?.cookie?.trim()),
      };
    } catch {
      /* the account store may be unavailable */
    }
    try {
      const service = getMv();
      return {
        ready: true,
        error: null,
        database: mvDatabasePath(),
        settings: service.getSettings(),
        tracks: listMvTracks().length,
        account,
      };
    } catch (error) {
      return {
        ready: false,
        error: error instanceof Error ? error.message : String(error),
        database: mvDatabasePath(),
        settings: null,
        tracks: 0,
        account,
      };
    }
  },

  /** Registers a played track so the MV engine can look it up by id. */
  mvRememberTrack(track) {
    return { id: rememberMvTrack(track) };
  },

  mvGetSettings() {
    return getMv().getSettings();
  },

  mvSetSettings(patch) {
    return getMv().setSettings((patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}) as never);
  },

  mvGetSelected(trackId) {
    return getMv().getSelectedVideo(requireText(trackId, 'trackId'));
  },

  async mvGetSelectedOrAutoApply(trackId) {
    return getMv().getSelectedOrAutoApplyVideo(requireText(trackId, 'trackId'));
  },

  mvFindLocalCandidates(trackId) {
    return getMv().findLocalMvCandidates(requireText(trackId, 'trackId'));
  },

  async mvSearchNetworkCandidates(input) {
    const request = asRecord(input);
    const trackId = requireText(request.trackId, 'trackId');
    const query = typeof request.query === 'string' && request.query.trim() ? request.query.trim() : undefined;
    return getMv().searchNetworkCandidates(trackId, query);
  },

  async mvSearchNetworkCandidatesForSnapshot(input) {
    return getMv().searchNetworkCandidatesForSnapshot(normalizeSnapshotRequest(input) as never);
  },

  async mvGetTemporaryPlayableForSnapshot(input) {
    return getMv().getTemporaryPlayableForSnapshot(normalizeSnapshotRequest(input) as never);
  },

  mvGetCandidates(trackId) {
    return getMv().getVideoCandidates(requireText(trackId, 'trackId'));
  },

  // ---- Protocol variants (what the community's echo-mv:// handler serves) --
  // videoProtocol.ts resolves these three through MvService and pipes the CDN
  // response with the variant's headers and the request's Range.

  /** A persisted variant: `echo-mv://stream/<videoId>/<variantId>`. */
  async mvGetStreamVariant(input) {
    const request = asRecord(input);
    return getMv().getStreamVariantForProtocol(
      requireText(request.videoId, 'videoId'),
      requireText(request.variantId, 'variantId'),
    );
  },

  /** A snapshot variant: `echo-mv://ephemeral/<token>`. */
  mvGetTemporaryStreamVariant(token) {
    return getMv().getTemporaryStreamVariantForProtocol(requireText(token, 'token'));
  },

  /** Re-resolves an expired persisted variant. */
  async mvRefreshStreamVariant(input) {
    const request = asRecord(input);
    return getMv().refreshStreamVariantForProtocol(
      requireText(request.videoId, 'videoId'),
      requireText(request.variantId, 'variantId'),
    );
  },

  /** A bound local file: `echo-video://mv/<videoId>`. */
  mvGetVideoFile(videoId) {
    return getMv().getVideoFileForProtocol(requireText(videoId, 'videoId'));
  },

  async mvResolveStreams(videoId) {
    return getMv().resolveStreams(requireText(videoId, 'videoId'));
  },

  async mvSetQuality(input) {
    const request = asRecord(input);
    return getMv().setQuality(requireText(request.videoId, 'videoId'), requireText(request.qualityId, 'qualityId'));
  },

  mvSetOffset(input) {
    const request = asRecord(input);
    const offset = Number(request.offsetMs);
    if (!Number.isFinite(offset)) throw new Error('offsetMs must be a number');
    return getMv().setVideoOffset(requireText(request.trackId, 'trackId'), offset);
  },

  mvBindLocalVideo(input) {
    const request = asRecord(input);
    return getMv().bindLocalVideo(requireText(request.trackId, 'trackId'), requireText(request.filePath, 'filePath'));
  },

  mvBindUrl(input) {
    const request = asRecord(input);
    return getMv().bindUrl(requireText(request.trackId, 'trackId'), requireText(request.url, 'url'));
  },

  async mvSelectVideo(input) {
    const request = asRecord(input);
    return getMv().selectVideo(requireText(request.trackId, 'trackId'), requireText(request.videoId, 'videoId'));
  },

  mvClearSelected(input) {
    const request = asRecord(input);
    getMv().clearSelectedVideo(requireText(request.trackId, 'trackId'));
    return { ok: true };
  },

  async mvOpenExternal(input) {
    const request = asRecord(input);
    await getMv().openVideoExternal(requireText(request.videoId, 'videoId'));
    return { ok: true };
  },

  /**
   * Name-based MV lookup: the first Bilibili videos for a track title, in
   * Bilibili's own relevance order.
   *
   * The MV provider asks Bilibili for `order=click` and then re-ranks by view
   * count, which is why the background could end up on a completely unrelated
   * (but very popular) video. This path uses the plain relevance search the
   * streaming provider already implements and leaves the order untouched, so
   * "the first video for this name" is exactly what comes back.
   */
  async findMvCandidatesByTitle(input) {
    const request = asRecord(input);
    const title = requireText(request.title, 'track title');
    const limit = optionalPositiveInt(request.limit, 5, 20);
    const result = await ensureService().search({
      provider: 'bilibili',
      query: title,
      mediaTypes: ['track'],
      page: 1,
      pageSize: limit,
    });

    const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    return {
      mode: 'first',
      query: title,
      candidates: tracks.slice(0, limit).map((track) => ({
        id: track.providerTrackId,
        title: track.title,
        uploader: track.artist ?? null,
        url: `https://www.bilibili.com/video/${track.providerTrackId}`,
        thumbnailUrl: track.coverThumb ?? track.coverUrl ?? null,
        duration: track.duration ?? null,
        viewCount: null,
        score: null,
        reasons: ['Bilibili 名称搜索结果'],
      })),
    };
  },

  /**
   * Bilibili's progressive (non-DASH) MP4 for a video, with the CDN verified.
   *
   * A `<video>` element cannot play a DASH *segment* URL: those are a few
   * seconds of a fragmented stream, which is exactly what made the background
   * loop its first seconds. The progressive endpoint (`fnval=1`) returns one
   * complete MP4 with a real duration, a byte length and range support, so it
   * plays through and seeks. Quality is walked down from the requested ceiling
   * and every candidate is probed, because 4K/1080p URLs are refused outright
   * when the account is not entitled to them.
   */
  async resolveBilibiliProgressive(input) {
    const request = asRecord(input);
    const bvid = requireText(request.bvid, 'bvid');
    const cookie = getAccountService().getCredentials('bilibili').cookie?.trim() || undefined;
    const headers: Record<string, string> = {
      Referer: `https://www.bilibili.com/video/${bvid}`,
      Origin: 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7',
      ...(cookie ? { Cookie: cookie } : {}),
    };

    const view = asRecord(await jsonFetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
      { headers, timeoutMs: 12_000 },
    ));
    const viewData = asRecord(view.data);
    const cid = Number(viewData.cid)
      || Number(asRecord(Array.isArray(viewData.pages) ? viewData.pages[0] : null).cid)
      || 0;
    if (!cid) {
      throw new Error('bilibili_cid_unavailable');
    }
    const knownDuration = Number(viewData.duration) || null;

    const qualityLabels: Record<number, string> = {
      120: '4K', 116: '1080P60', 112: '1080P+', 80: '1080P', 74: '720P60', 64: '720P', 32: '480P', 16: '360P',
    };
    const maxQuality = typeof request.maxQuality === 'string' ? request.maxQuality : 'max';
    const requestedOrder = maxQuality === '2160p' ? [120, 116, 112, 80, 64, 32, 16]
      : maxQuality === '1440p' ? [116, 112, 80, 64, 32, 16]
        : maxQuality === '1080p' ? [80, 64, 32, 16]
          : maxQuality === '720p' ? [64, 32, 16]
            : [120, 116, 112, 80, 74, 64, 32, 16];
    // A background does not need 60fps; drop those qn values when not allowed.
    const order = request.allow60fps === false ? requestedOrder.filter((qn) => qn !== 116 && qn !== 74) : requestedOrder;

    const tried: Array<{ qn: number; status: number | null; reason: string }> = [];
    for (const qn of order) {
      const url = new URL('https://api.bilibili.com/x/player/playurl');
      url.searchParams.set('bvid', bvid);
      url.searchParams.set('cid', String(cid));
      url.searchParams.set('qn', String(qn));
      url.searchParams.set('fnval', '1');
      url.searchParams.set('fnver', '0');
      url.searchParams.set('fourk', '1');

      let payload: Record<string, unknown> | null = null;
      try {
        payload = asRecord(await jsonFetch(url.toString(), { headers, timeoutMs: 12_000 }));
      } catch {
        payload = null;
      }
      if (!payload || Number(payload.code) !== 0) {
        tried.push({ qn, status: null, reason: 'api' });
        continue;
      }

      const data = asRecord(payload.data);
      const parts = Array.isArray(data.durl) ? data.durl : [];
      const first = asRecord(parts[0]);
      const mediaUrl = typeof first.url === 'string' && first.url
        ? first.url
        : (Array.isArray(first.backup_url) ? String(first.backup_url[0] ?? '') : '');
      if (!mediaUrl) {
        tried.push({ qn, status: null, reason: 'no_durl' });
        continue;
      }
      if (parts.length > 1) {
        // Bilibili splits very long videos into several progressive parts; a
        // single <video> can only play the first one.
        tried.push({ qn, status: null, reason: `split_${parts.length}` });
        continue;
      }

      let status: number | null = null;
      try {
        status = await probeMediaUrl(mediaUrl, headers);
      } catch {
        status = null;
      }
      if (status !== 200 && status !== 206) {
        tried.push({ qn, status, reason: 'cdn_refused' });
        continue;
      }

      const actualQn = Number(data.quality) || qn;
      return {
        url: mediaUrl,
        headers,
        mimeType: 'video/mp4',
        quality: actualQn,
        qualityLabel: qualityLabels[actualQn] ?? `qn${actualQn}`,
        durationSeconds: Number(data.timelength) ? Number(data.timelength) / 1000 : knownDuration,
        sizeBytes: Number(first.size) || Number(first.length) || null,
        parts: 1,
        signedIn: Boolean(cookie),
        tried,
      };
    }

    throw new Error(`bilibili_progressive_unavailable:${JSON.stringify(tried)}`);
  },

  async findMvCandidates(input) {
    const request = asRecord(input);
    const title = requireText(request.title, 'track title');
    const artist = typeof request.artist === 'string' ? request.artist.trim() : '';
    const candidates = await getBilibiliMvProvider()
      .search(
        buildMvTrack({ title, artist, album: request.album, duration: request.duration }),
        buildMvSettings(request),
        typeof request.query === 'string' && request.query.trim() ? request.query.trim() : undefined,
      )
      .catch(async (error: unknown) => {
        // Surface the reason instead of silently reporting "no match"; without
        // this a provider failure is indistinguishable from a genuine miss.
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        try {
          const nodeFs = await import('node:fs');
          const nodeOs = await import('node:os');
          const nodePath = await import('node:path');
          nodeFs.appendFileSync(
            nodePath.join(nodeOs.tmpdir(), 'echo-mms-mv-error.log'),
            `${new Date().toISOString()} search failed for ${title} / ${artist}: ${detail}\n`,
          );
        } catch {
          /* ignore */
        }
        throw new Error(`mv_search_failed: ${detail}`);
      });
    return (Array.isArray(candidates) ? candidates : []).slice(0, Number(request.limit) || 6).map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      uploader: candidate.uploader ?? null,
      url: candidate.providerUrl ?? candidate.url ?? null,
      thumbnailUrl: candidate.thumbnailUrl ?? null,
      viewCount: candidate.viewCount ?? null,
      score: candidate.score,
      reasons: candidate.reasons,
    }));
  },

  async resolveMvStream(input) {
    const request = asRecord(input);
    const bvid = requireText(request.bvid, 'bvid');
    const providerUrl = `https://www.bilibili.com/video/${bvid}`;
    const variants = await getBilibiliMvProvider().resolve(
      {
        id: `bilibili:${bvid}`,
        trackId: typeof request.trackId === 'string' ? request.trackId : `background:${bvid}`,
        provider: 'bilibili',
        sourceType: 'search_candidate',
        sourceId: bvid,
        title: typeof request.title === 'string' ? request.title : null,
        artist: null,
        url: providerUrl,
        providerUrl,
        thumbnailUrl: null,
        filePath: null,
        mediaUrl: null,
        mimeType: null,
        durationSeconds: Number(request.durationSeconds) || null,
        width: null,
        height: null,
        selectedQualityId: null,
        qualityLabel: null,
        fps: null,
        score: 1,
        selected: false,
        playableInApp: true,
        rawProviderJson: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
      buildMvSettings(request),
    );

    const list = Array.isArray(variants) ? variants : [];
    // Only a direct, in-app playable variant can back a browser <video>.
    const playable = list.find((variant) => variant.playableInApp && variant.protocol === 'direct' && variant.url);
    if (!playable?.url) {
      const blocked = list.find((variant) => variant.unavailableReason);
      throw new Error(blocked?.unavailableReason || 'bilibili_stream_unavailable');
    }
    return {
      url: playable.url,
      headers: playable.headers ?? {},
      mimeType: playable.mimeType ?? null,
      qualityLabel: playable.qualityLabel ?? null,
      width: playable.width ?? null,
      height: playable.height ?? null,
      durationSeconds: Number(request.durationSeconds) || null,
    };
  },
};

globalThis[SERVICE_KEY] = api;

export const createMultiMusicSourcesBridge = () => api;
export default api;
