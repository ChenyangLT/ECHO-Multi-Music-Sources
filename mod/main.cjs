'use strict';

// ECHO Multi Music Sources — main-process entry.
//
// The heavy lifting lives in bridge/provider-bridge.cjs, which is built from the
// ECHO Community streaming sources (see the project README). This file only:
//   1. loads that bridge,
//   2. exposes it to the mod renderer over a private RPC namespace,
//   3. feeds settings into it,
//   4. optionally routes ECHO's online-playback resolution through it.
//
// Nothing here touches ECHO's SQLite library, its plugin runtime, or any native
// addon: the bridge is bundled with shims for those daemon surfaces.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { inflateRawSync } = require('node:zlib');

const MOD_ID = 'echo.multi-music-sources';
const RPC_PREFIX = 'echo-mms:';
// Providers the community bridge owns. `mock`/`m3u8`/`plugin` are deliberately
// excluded so ECHO's own handling stays authoritative for them.
const COMMUNITY_PROVIDERS = new Set(['netease', 'qqmusic', 'kugou', 'bilibili', 'youtube', 'soundcloud', 'spotify', 'tidal', 'qobuz']);

/** The subset of the MV settings the community MV searcher/resolver consumes. */
const mvRequestSettings = (settings) => ({
  maxQuality: settings.mvMaxQuality || 'max',
  allow60fps: settings.mvAllow60fps !== false,
  titleOnlySearch: settings.mvTitleOnlySearch === true,
  preferHighestViewCount: settings.mvPreferHighestViewCount !== false,
});

/**
 * The Bilibili search query for a track: title, plus the artist and the
 * configured hint (default "MV") unless the user asked for title-only. This
 * mirrors the renderer so a manual match test searches exactly what the
 * background searches.
 */
const mvQuery = (settings, title, artist) => {
  const parts = settings.mvTitleOnlySearch === true || !artist ? [title] : [title, artist];
  const suffix = typeof settings.mvSearchSuffix === 'string' ? settings.mvSearchSuffix.trim() : 'MV';
  if (suffix) parts.push(suffix);
  return parts.filter(Boolean).join(' ');
};

/** How the background video is matched against Bilibili. */
const MV_MATCH_MODES = new Set(['first', 'score', 'views']);

/** How the background video is obtained. */
const MV_SOURCE_MODES = new Set(['engine', 'progressive']);

/** The mv* keys the ported community MV engine reads and writes. */
const MV_SETTING_KEYS = [
  'mvEnabled',
  'mvEnabledProviders',
  'mvProviderOrder',
  'mvAutoSearch',
  'mvAutoPreload',
  'mvAutoApplyThreshold',
  'mvTitleOnlySearch',
  'mvPreferHighestViewCount',
  'mvImmersiveBackground',
  'mvImmersiveBackgroundAutoScale',
  // The picture fitting keys are the renderer's, but they are mirrored here so a
  // value chosen once is present on both sides of the RPC from the first render.
  'mvImmersiveBackgroundFit',
  'mvImmersiveBackgroundFitWidthPinned',
  'mvImmersiveBackgroundWidthPercent',
  'mvImmersiveBackgroundHeightPercent',
  'mvImmersiveBackgroundScalePercent',
  'mvImmersiveBackgroundOffsetXPercent',
  'mvImmersiveBackgroundOffsetYPercent',
  'mvImmersiveBackgroundBlurPx',
  'mvImmersiveBackgroundBrightnessPercent',
  'mvImmersiveBackgroundOverlayOpacityPercent',
  'mvLyricsReadabilityEnhanced',
  'mvHideLyrics',
  'mvShowSettingsButton',
  'mvRestartAudioOnLoad',
  'mvSyncMode',
  'mvReplayAudioOnChange',
  'mvMaxQuality',
  'mvAllow60fps',
];

const mvSettingsPatch = (settings) => {
  const patch = {};
  for (const key of MV_SETTING_KEYS) {
    if (settings[key] !== undefined) patch[key] = settings[key];
  }
  return patch;
};

/** The engine's MvSettings (unprefixed) mapped back onto the mod's mv* keys. */
const mvSettingsFromEngine = (engine) => {
  const map = {
    enabled: 'mvEnabled',
    enabledProviders: 'mvEnabledProviders',
    providerOrder: 'mvProviderOrder',
    autoSearch: 'mvAutoSearch',
    autoPreload: 'mvAutoPreload',
    autoApplyThreshold: 'mvAutoApplyThreshold',
    titleOnlySearch: 'mvTitleOnlySearch',
    preferHighestViewCount: 'mvPreferHighestViewCount',
    immersiveBackground: 'mvImmersiveBackground',
    immersiveBackgroundAutoScale: 'mvImmersiveBackgroundAutoScale',
    immersiveBackgroundScalePercent: 'mvImmersiveBackgroundScalePercent',
    immersiveBackgroundOffsetXPercent: 'mvImmersiveBackgroundOffsetXPercent',
    immersiveBackgroundOffsetYPercent: 'mvImmersiveBackgroundOffsetYPercent',
    immersiveBackgroundBlurPx: 'mvImmersiveBackgroundBlurPx',
    immersiveBackgroundBrightnessPercent: 'mvImmersiveBackgroundBrightnessPercent',
    immersiveBackgroundOverlayOpacityPercent: 'mvImmersiveBackgroundOverlayOpacityPercent',
    lyricsReadabilityEnhanced: 'mvLyricsReadabilityEnhanced',
    hideLyrics: 'mvHideLyrics',
    restartAudioOnLoad: 'mvRestartAudioOnLoad',
    syncMode: 'mvSyncMode',
    replayAudioOnChange: 'mvReplayAudioOnChange',
    maxQuality: 'mvMaxQuality',
    allow60fps: 'mvAllow60fps',
  };
  const patch = {};
  if (!engine || typeof engine !== 'object') return patch;
  for (const [engineKey, configKey] of Object.entries(map)) {
    if (engine[engineKey] !== undefined) patch[configKey] = engine[engineKey];
  }
  return patch;
};

// Song background + MV settings mirror ECHO-main's persisted `mv*` settings one
// for one (same names, defaults and ranges), so the mod behaves like the
// community build instead of inventing its own vocabulary. The legacy
// songBackground* keys are still read by the renderer as fallbacks.
const MV_DEFAULTS = {
  // Opt-in: the MV background stays off until the user switches it on (the
  // player-bar MV button, the mod page toolbar or the config dialog).
  mvEnabled: false,
  mvEnabledProviders: ['bilibili'],
  mvProviderOrder: ['bilibili'],
  mvAutoSearch: true,
  mvAutoPreload: true,
  mvAutoApplyThreshold: 0.7,
  mvTitleOnlySearch: false,
  mvSearchSuffix: 'MV',
  mvPreferHighestViewCount: true,
  mvImmersiveBackground: true,
  mvImmersiveBackgroundAutoScale: true,
  // 「默认（左右贴合）」: the picture is scaled to exactly the width of the page and
  // the height is left alone. It ships as the default so a fresh install already
  // behaves that way, and it is what every MV uses until the user changes it.
  mvImmersiveBackgroundFit: 'cover',
  mvImmersiveBackgroundFitWidthPinned: true,
  mvImmersiveBackgroundWidthPercent: 100,
  mvImmersiveBackgroundHeightPercent: 100,
  mvImmersiveBackgroundScalePercent: 100,
  mvImmersiveBackgroundOffsetXPercent: 50,
  mvImmersiveBackgroundOffsetYPercent: 50,
  mvImmersiveBackgroundBlurPx: 0,
  mvImmersiveBackgroundBrightnessPercent: 100,
  mvImmersiveBackgroundOverlayOpacityPercent: 0,
  mvLyricsReadabilityEnhanced: false,
  mvHideLyrics: false,
  // The song detail page's own way into the settings drawer.
  mvShowSettingsButton: true,
  mvRestartAudioOnLoad: true,
  mvSyncMode: 'balanced',
  mvReplayAudioOnChange: true,
  mvMaxQuality: 'max',
  mvAllow60fps: true,
  // Background video pipeline: the video is resolved by the community MV engine
  // and streamed through this process (no download step).
  mvMatchMode: 'first',
  mvSourceMode: 'engine',
};

const DEFAULT_SETTINGS = {
  locale: 'zh-CN',
  defaultProvider: 'netease',
  defaultQuality: 'lossless',
  pageSize: 30,
  hideUnavailable: false,
  showProviderBadges: true,
  interceptPlayback: true,
  lyricsNetworkEnabled: true,
  tidalClientId: 'vmtQLf79BHl9YgUT',
  tidalClientSecret: '',
  tidalCountryCode: 'US',
  debugLogging: false,
  ...MV_DEFAULTS,
};

// The loader installs its own copy of the enhanced NetEase client; the bundle
// resolves optional native packages the same way the loader's bridge does.
const extendModuleSearchPaths = () => {
  try {
    const resourcesPath = process.resourcesPath || '';
    const candidates = [
      path.join(resourcesPath, 'app.asar', 'node_modules'),
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'),
      path.join(resourcesPath, '..', 'ShinawaseLoader', 'node_modules'),
      path.join(__dirname, 'node_modules'),
      path.join(__dirname, '..', '..', 'node_modules'),
    ].filter(Boolean);
    const current = String(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
    const merged = [...new Set([...current, ...candidates])];
    process.env.NODE_PATH = merged.join(path.delimiter);
    require('node:module').Module._initPaths();
  } catch {
    /* resolution hints are best effort */
  }
};

extendModuleSearchPaths();

// ---------------------------------------------------------------------------
// Locally kept playlists
//
// Opening a playlist used to mean going back to the platform every single time:
// the account's playlist list and every playlist the user opened only ever lived
// in the bridge's memory. Both are written to a small JSON file next to ECHO's
// own data instead, so 「我的歌单」 is instant on the next visit and an opened
// playlist can even be listed while the platform is rate-limiting.
// ---------------------------------------------------------------------------

const PLAYLIST_STORE_FILE = 'echo-mms-playlists.json';
// A guard against a runaway payload: only so many tracks per playlist are kept.
const PLAYLIST_STORE_MAX_TRACKS = 3000;
const PLAYLIST_STORE_MAX_COLLECTIONS = 400;

const emptyPlaylistStore = () => ({ version: 1, updatedAt: null, accounts: {}, collections: {} });

const playlistStoreFile = () => {
  let base = '';
  try {
    base = require('electron')?.app?.getPath?.('userData') || '';
  } catch {
    /* the electron module is unavailable outside the host */
  }
  if (!base) base = process.env.APPDATA || path.join(os.tmpdir(), 'echo-mms');
  return path.join(base, PLAYLIST_STORE_FILE);
};

const readPlaylistStore = () => {
  const file = playlistStoreFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyPlaylistStore();
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      accounts: parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {},
      collections: parsed.collections && typeof parsed.collections === 'object' ? parsed.collections : {},
    };
  } catch {
    // Missing or unreadable: start empty rather than failing the page.
    return emptyPlaylistStore();
  }
};

const writePlaylistStore = (store) => {
  const file = playlistStoreFile();
  const payload = { ...store, version: 1, updatedAt: new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Written through a temporary file so an interrupted write cannot leave a
    // half-written store behind.
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(payload), 'utf8');
    fs.renameSync(temporary, file);
  } catch {
    /* keeping playlists locally is best effort */
  }
  return payload;
};

/** Trims a payload from the renderer down to something worth persisting. */
const sanitizeTracks = (tracks) => (Array.isArray(tracks) ? tracks.slice(0, PLAYLIST_STORE_MAX_TRACKS) : []);

const trimCollections = (collections) => {
  const entries = Object.entries(collections || {});
  if (entries.length <= PLAYLIST_STORE_MAX_COLLECTIONS) return collections;
  entries.sort((left, right) => String(right[1]?.savedAt || '').localeCompare(String(left[1]?.savedAt || '')));
  return Object.fromEntries(entries.slice(0, PLAYLIST_STORE_MAX_COLLECTIONS));
};

/**
 * The MV media URLs the community service produces:
 *   echo-mv://ephemeral/<token>            a snapshot (temporary) variant
 *   echo-mv://stream/<videoId>/<variantId> a persisted variant
 *   echo-video://mv/<videoId>              a bound local file
 */
const parseMvMediaUrl = (value) => {
  let parsed = null;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    return null;
  }
  const parts = parsed.pathname
    .replace(/^\/+/u, '')
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));

  if (parsed.protocol === 'echo-mv:') {
    if (parsed.hostname === 'ephemeral' && parts.length === 1) return { kind: 'ephemeral', token: parts[0] };
    if (parsed.hostname === 'stream' && parts.length === 2) return { kind: 'stream', videoId: parts[0], variantId: parts[1] };
    return null;
  }
  if (parsed.protocol === 'echo-video:') {
    if (parsed.hostname === 'mv' && parts.length === 1) return { kind: 'file', videoId: parts[0] };
    return null;
  }
  return null;
};

/** A file extension for the loopback URL, so the media element knows the container. */
const mimeExtension = (mimeType) => {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('mp4') || value.includes('m4s') || value.includes('aac')) return '.mp4';
  if (value.includes('webm')) return '.webm';
  if (value.includes('matroska')) return '.mkv';
  if (value.includes('mpegurl') || value.includes('m3u8')) return '.m3u8';
  if (value.includes('mp2t')) return '.ts';
  return '';
};

const BVID_PATTERN = /BV[0-9A-Za-z]{4,}/u;
const AVID_PATTERN = /av(\d+)/iu;

/** Follows redirects with node:https and returns the final URL. */
const followRedirects = (target, hops = 0) =>
  new Promise((resolve) => {
    if (hops > 5) {
      resolve(null);
      return;
    }
    let url = null;
    try {
      url = new URL(target);
    } catch {
      resolve(null);
      return;
    }
    const lib = url.protocol === 'https:' ? require('node:https') : require('node:http');
    const request = lib.request(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      const location = response.headers.location;
      response.resume();
      if (response.statusCode >= 300 && response.statusCode < 400 && location) {
        resolve(followRedirects(new URL(location, url).toString(), hops + 1));
        return;
      }
      resolve(url.toString());
    });
    request.on('error', () => resolve(null));
    request.setTimeout(8000, () => {
      request.destroy();
      resolve(null);
    });
    request.end();
  });

/** Resolves an `av` id to its `BV` id through Bilibili's public view API. */
const bvidFromAid = (aid) =>
  new Promise((resolve) => {
    const url = `https://api.bilibili.com/x/web-interface/view?aid=${encodeURIComponent(aid)}`;
    const request = require('node:https').request(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const bvid = parsed?.data?.bvid;
          resolve(typeof bvid === 'string' && BVID_PATTERN.test(bvid) ? bvid : null);
        } catch {
          resolve(null);
        }
      });
    });
    request.on('error', () => resolve(null));
    request.setTimeout(8000, () => {
      request.destroy();
      resolve(null);
    });
    request.end();
  });

/**
 * Normalises what the user pasted into something the community `bindUrl`
 * accepts: it understands a bare `BV…` id and Bilibili / YouTube URLs, so short
 * share links (`b23.tv/…`) and `av…` links are translated here.
 */
const normalizeMvLinkInput = async (raw) => {
  let value = String(raw || '').trim().replace(/^[<"']+|[>"']+$/gu, '');
  if (!value) throw new Error('url is required');

  const direct = BVID_PATTERN.exec(value);
  if (direct) return direct[0];

  const aid = AVID_PATTERN.exec(value);
  if (aid) {
    const bvid = await bvidFromAid(aid[1]);
    if (bvid) return bvid;
    throw new Error('无法解析这个 av 号，请改用 BV 号或完整链接');
  }

  let host = '';
  try {
    host = new URL(value).hostname.toLowerCase().replace(/^www\./u, '');
  } catch {
    throw new Error('无法识别的视频链接：请粘贴 B 站 BV 号、b23.tv 短链或视频链接');
  }

  // Short share links and any Bilibili page without a BV id on them: follow the
  // redirect chain and take the BV id from the final URL.
  if (host === 'b23.tv' || host.endsWith('bilibili.com')) {
    const finalUrl = await followRedirects(value);
    const found = finalUrl ? BVID_PATTERN.exec(finalUrl) : null;
    if (found) return found[0];
    const finalAid = finalUrl ? AVID_PATTERN.exec(finalUrl) : null;
    if (finalAid) {
      const bvid = await bvidFromAid(finalAid[1]);
      if (bvid) return bvid;
    }
    throw new Error('这个链接里没有找到 BV 号：请用视频页链接或直接填 BV 号');
  }

  // YouTube and anything else goes to the community binding as-is.
  return value;
};

module.exports.activate = async (host) => {
  const disposers = [];
  let settings = { ...DEFAULT_SETTINGS, ...(host?.config && typeof host.config === 'object' ? host.config : {}) };
  let bridge = null;
  let bridgeError = null;
  let restoreResolver = null;
  let stats = { searches: 0, resolves: 0, failures: 0, lastError: null };

  const log = (level, message) => {
    try {
      const verbose = settings.debugLogging === true;
      if (level !== 'error' && !verbose) return;
      host?.log?.(level, `[${MOD_ID}] ${message}`);
    } catch {
      /* logging must never break playback */
    }
  };

  // ---- bridge loading ------------------------------------------------------

  const loadBridge = () => {
    if (bridge) return bridge;
    if (bridgeError) throw bridgeError;
    try {
      const entry = path.join(__dirname, 'bridge', 'provider-bridge.cjs');
      const loaded = require(entry);
      bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
        ? loaded.createMultiMusicSourcesBridge()
        : loaded?.default?.createMultiMusicSourcesBridge?.();
      if (!bridge) throw new Error('provider bridge did not export an API');
      applySettings();
      log('INFO', `provider bridge ready (${bridge.mode})`);
      return bridge;
    } catch (error) {
      bridgeError = error instanceof Error ? error : new Error(String(error));
      log('ERROR', `provider bridge failed to load: ${bridgeError.message}`);
      throw bridgeError;
    }
  };

  const applySettings = () => {
    if (!bridge?.configure) return;
    try {
      bridge.configure({
        lyricsNetworkEnabled: settings.lyricsNetworkEnabled !== false,
        tidalClientId: settings.tidalClientId || DEFAULT_SETTINGS.tidalClientId,
        tidalClientSecret: settings.tidalClientSecret || '',
        tidalCountryCode: settings.tidalCountryCode || 'US',
        // The ported community MV engine reads the same mv* keys ECHO-main uses.
        ...mvSettingsPatch(settings),
        // …and writes them back when its own settings UI changes something; the
        // change is merged into the mod config so it survives a restart.
        onMvSettingsChange: (changed) => {
          if (!changed || typeof changed !== 'object') return;
          settings = { ...settings, ...changed };
          log('INFO', `MV settings updated: ${Object.keys(changed).join(',')}`);
        },
      });
    } catch (error) {
      log('WARN', `bridge configure failed: ${error?.message || error}`);
    }
  };

  const guard = (label, handler) => async (payload) => {
    try {
      const current = loadBridge();
      const result = await handler(current, payload);
      return { ok: true, result };
    } catch (error) {
      stats.failures += 1;
      stats.lastError = error instanceof Error ? error.message : String(error);
      log('WARN', `${label} failed: ${stats.lastError}`);
      return { ok: false, error: stats.lastError };
    }
  };

  // ---- Media proxy ---------------------------------------------------------
  //
  // Bilibili's media CDN rejects requests that do not carry a bilibili Referer
  // (403) and sends no CORS headers, so a renderer <video> cannot consume the
  // stream directly. It is relayed through a loopback proxy in this process,
  // which can send the full header set.
  //
  // The same proxy serves the downloaded MV cache from local disk, so a cached
  // background plays exactly like a local video (range requests included).

  const mediaProxy = {
    server: null,
    port: 0,
    tokens: new Map(),
  };

  const MEDIA_PROXY_TTL_MS = 5 * 60 * 1000;
  const PASS_THROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag', 'cache-control'];

  const MEDIA_CONTENT_TYPES = {
    '.mp4': 'video/mp4',
    '.m4s': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.flv': 'video/x-flv',
    '.ts': 'video/mp2t',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.wav': 'audio/wav',
  };

  const mediaContentType = (filePath) =>
    MEDIA_CONTENT_TYPES[path.extname(String(filePath || '')).toLowerCase()] || 'application/octet-stream';

  /**
   * The mime type for a remote media URL: guessed from its path extension, and
   * defaulting to video/mp4 — Bilibili's DASH URLs end in `.m4s`, which the
   * extension table already maps.
   */
  const mimeTypeForMediaUrl = (url) => {
    let pathname = '';
    try {
      pathname = new URL(String(url || '')).pathname;
    } catch {
      pathname = String(url || '');
    }
    const guessed = mediaContentType(pathname);
    return guessed === 'application/octet-stream' ? 'video/mp4' : guessed;
  };

  /** Streams a cached local file with RFC 7233 range support. */
  const serveLocalMedia = (req, res, entry) => {
    let stat = null;
    try {
      stat = fs.statSync(entry.filePath);
    } catch {
      res.statusCode = 404;
      res.end();
      return;
    }

    const total = stat.size;
    const type = mediaContentType(entry.filePath);
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/u.exec(String(range));
      let start = match && match[1] ? Number(match[1]) : 0;
      let end = match && match[2] ? Number(match[2]) : total - 1;
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= total) end = total - 1;
      if (start > end) {
        res.writeHead(416, { 'content-range': `bytes */${total}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'content-type': type,
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${total}`,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      });
      fs.createReadStream(entry.filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'content-type': type,
      'content-length': String(total),
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    });
    fs.createReadStream(entry.filePath).pipe(res);
  };

  const pipeUpstream = (req, res, entry) => {
    let target;
    try {
      target = new URL(entry.url);
    } catch {
      res.statusCode = 502;
      res.end();
      return;
    }
    const headers = { ...(entry.headers || {}) };
    if (req.headers.range) headers.Range = req.headers.range;
    const lib = target.protocol === 'https:' ? require('node:https') : require('node:http');
    const upstream = lib.request(entry.url, { method: 'GET', headers }, (up) => {
      const pass = {};
      for (const name of PASS_THROUGH_HEADERS) {
        if (up.headers[name]) pass[name] = up.headers[name];
      }
      // ECHO-main's echo-mv:// handler substitutes the variant's own mime type
      // when the CDN response has none or labels it `application/octet-stream`
      // (which is what Bilibili does for most video responses). Chromium will
      // not play a media element served with an opaque type, so the same
      // substitution happens here.
      const declared = String(pass['content-type'] || '').toLowerCase();
      if (!declared || declared.startsWith('application/octet-stream')) {
        pass['content-type'] = entry.mimeType || mimeTypeForMediaUrl(entry.url);
      }
      // Some Bilibili hosts answer 206 without advertising range support. The
      // renderer treats a resource without `accept-ranges` as unseekable, which
      // is what made the background unable to follow the song position, so the
      // capability is declared here (range requests are passed through above).
      if (!pass['accept-ranges']) pass['accept-ranges'] = 'bytes';
      res.writeHead(up.statusCode || 502, pass);
      up.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.statusCode = 502;
      res.end();
    });
    req.on('close', () => upstream.destroy());
    upstream.end();
  };

  const ensureMediaProxy = () => {
    if (mediaProxy.server) return mediaProxy.server;
    const http = require('node:http');
    const server = http.createServer((req, res) => {
      const leaf = String(req.url || '/').split('?')[0].replace(/^\//u, '').split('/')[0];
      const token = leaf.replace(/\.[a-z0-9]+$/iu, '');
      const entry = mediaProxy.tokens.get(token) || mediaProxy.tokens.get(leaf);
      if (!entry || entry.expires < Date.now()) {
        res.statusCode = 404;
        res.end();
        return;
      }
      if (entry.filePath) {
        serveLocalMedia(req, res, entry);
        return;
      }
      pipeUpstream(req, res, entry);
    });
    server.on('error', (error) => log('WARN', `media proxy error: ${error?.message || error}`));
    server.listen(0, '127.0.0.1', () => {
      mediaProxy.port = server.address()?.port || 0;
      log('INFO', `media proxy listening on 127.0.0.1:${mediaProxy.port}`);
    });
    mediaProxy.server = server;
    return server;
  };

  const registerMediaToken = (entry, extension = '') => {
    ensureMediaProxy();
    if (!mediaProxy.port) {
      throw new Error('media_proxy_unavailable');
    }
    const token = require('node:crypto').randomBytes(12).toString('hex');
    mediaProxy.tokens.set(token, { ...entry, expires: entry.expires || Date.now() + MEDIA_PROXY_TTL_MS });
    // Bound the table for long sessions.
    if (mediaProxy.tokens.size > 64) {
      const oldest = mediaProxy.tokens.keys().next().value;
      mediaProxy.tokens.delete(oldest);
    }
    return { token, url: `http://127.0.0.1:${mediaProxy.port}/${token}${extension}` };
  };

  /** Registers a remote stream and returns a loopback URL the renderer can use. */
  const registerMediaProxyUrl = (url, headers, mimeType = null) => registerMediaToken({
    url,
    headers: headers && typeof headers === 'object' ? headers : {},
    mimeType: mimeType ?? null,
  }).url;

  // ---- RPC surface --------------------------------------------------------

  const handlers = {
    ping: async () => ({ ok: true, result: { modId: MOD_ID, version: host?.manifest?.version || '0.0.0' } }),

    status: async () => {
      // Touch the bridge so the reported state reflects reality once the first
      // call has warmed it, and so config UI shows load failures early.
      try {
        loadBridge();
      } catch {
        /* reported through bridgeError below */
      }
      return {
        ok: true,
        result: {
          bridgeReady: Boolean(bridge),
          bridgeError: bridgeError ? bridgeError.message : null,
          mode: bridge?.mode || null,
          providers: COMMUNITY_PROVIDERS.size,
          interceptPlayback: settings.interceptPlayback !== false,
          defaultProvider: settings.defaultProvider,
          defaultQuality: settings.defaultQuality,
          stats: { ...stats },
        },
      };
    },

    providers: guard('providers', (service) => service.getProviders()),

    search: guard('search', (service, payload) => {
      stats.searches += 1;
      return service.search({
        provider: payload?.provider,
        query: payload?.query,
        mediaTypes: payload?.mediaTypes,
        page: payload?.page,
        pageSize: payload?.pageSize || settings.pageSize,
      });
    }),

    getTrack: guard('getTrack', (service, payload) => service.getTrack(payload)),
    getAlbum: guard('getAlbum', (service, payload) => service.getAlbum(payload)),
    getArtist: guard('getArtist', (service, payload) => service.getArtist(payload)),
    getLyrics: guard('getLyrics', (service, payload) => service.getLyrics(payload)),
    getMv: guard('getMv', (service, payload) => service.getMv(payload)),
    importPlaylistFromUrl: guard('importPlaylistFromUrl', (service, payload) => service.importPlaylistFromUrl(payload?.url ?? payload)),
    refreshNeteaseDailyRecommend: guard('refreshNeteaseDailyRecommend', (service) => service.refreshNeteaseDailyRecommend()),
    listAccountPlaylists: guard('listAccountPlaylists', (service, payload) => service.listAccountPlaylists(payload?.provider ?? payload)),
    /**
     * Opens one of the signed-in account's own playlists / favourites folders
     * (Bilibili favourites included) and returns its tracks for immediate use.
     */
    importAccountCollection: guard('importAccountCollection', (service, payload) => service.importAccountCollection(payload)),
    syncLikedSongs: guard('syncLikedSongs', (service, payload) => service.syncLikedSongs(payload?.provider ?? payload)),

    // ---- locally kept playlists -------------------------------------------
    playlistStoreRead: async () => {
      const store = readPlaylistStore();
      return { ok: true, result: { ...store, path: playlistStoreFile() } };
    },

    playlistStoreSaveAccount: async (payload) => {
      try {
        const provider = String(payload?.provider || '').trim();
        if (!provider) throw new Error('provider is required');
        const store = readPlaylistStore();
        const accounts = {
          ...store.accounts,
          [provider]: {
            fetchedAt: payload?.fetchedAt || new Date().toISOString(),
            entries: Array.isArray(payload?.entries) ? payload.entries.slice(0, 500) : [],
          },
        };
        const saved = writePlaylistStore({ ...store, accounts });
        log('INFO', `playlist store: ${accounts[provider].entries.length} entries for ${provider}`);
        return { ok: true, result: { accounts: saved.accounts, savedAt: saved.updatedAt } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    playlistStoreSaveCollection: async (payload) => {
      try {
        const key = String(payload?.key || '').trim();
        if (!key) throw new Error('key is required');
        const store = readPlaylistStore();
        const tracks = sanitizeTracks(payload?.tracks);
        const collections = trimCollections({
          ...store.collections,
          [key]: {
            key,
            provider: String(payload?.provider || '').trim() || null,
            // 'account' for a playlist from the signed-in account, 'link' for one
            // the user imported by URL — the page groups them separately.
            source: payload?.source === 'link' ? 'link' : 'account',
            name: typeof payload?.name === 'string' ? payload.name.slice(0, 300) : null,
            description: typeof payload?.description === 'string' ? payload.description.slice(0, 600) : null,
            coverUrl: typeof payload?.coverUrl === 'string' ? payload.coverUrl : null,
            linkUrl: typeof payload?.linkUrl === 'string' ? payload.linkUrl.slice(0, 2000) : null,
            trackCount: tracks.length,
            savedAt: new Date().toISOString(),
            tracks,
          },
        });
        const saved = writePlaylistStore({ ...store, collections });
        log('INFO', `playlist store: kept ${tracks.length} tracks for ${key}`);
        return { ok: true, result: { collections: saved.collections, savedAt: saved.updatedAt } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    playlistStoreRemoveCollection: async (payload) => {
      try {
        const key = String(payload?.key || '').trim();
        const store = readPlaylistStore();
        const collections = { ...store.collections };
        delete collections[key];
        const saved = writePlaylistStore({ ...store, collections });
        return { ok: true, result: { collections: saved.collections } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    playlistStoreClear: async () => {
      try {
        const saved = writePlaylistStore(emptyPlaylistStore());
        return { ok: true, result: { accounts: saved.accounts, collections: saved.collections } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    // Playback resolution is intentionally not behind the ok/error envelope: the
    // playback path needs a real throw to fall back to ECHO's own resolver.
    resolvePlayback: async (payload) => {
      const service = loadBridge();
      stats.resolves += 1;
      return service.resolvePlayback({
        provider: payload?.provider,
        providerTrackId: payload?.providerTrackId,
        quality: payload?.quality || settings.defaultQuality,
      });
    },

    invalidatePlayback: guard('invalidatePlayback', (service, payload) => service.invalidatePlayback(payload)),

    accountStatuses: guard('accountStatuses', (service) => service.getAccountStatuses()),
    accountProfiles: guard('accountProfiles', (service) => service.accountProfiles()),
    accountCredentials: guard('accountCredentials', (service, payload) => service.getAccountCredentials(payload?.provider ?? payload)),
    accountSaveCookie: guard('accountSaveCookie', (service, payload) => service.saveAccountCookie(payload?.provider, payload?.cookie)),
    accountClear: guard('accountClear', (service, payload) => service.clearAccount(payload?.provider ?? payload)),
    accountCheck: guard('accountCheck', (service, payload) => service.checkAccount(payload?.provider ?? payload)),
    accountCheckAll: guard('accountCheckAll', (service) => service.checkAllAccounts()),
    qrLoginCapabilities: guard('qrLoginCapabilities', (service) => service.qrLoginCapabilities()),

    // QR sign-in: Bilibili and QQ Music render their own QR for the page;
    // NetEase keeps the community web-login service; other platforms open
    // ECHO's own login window.
    startQrLogin: guard('startQrLogin', (service, payload) => service.startQrLogin(payload?.provider ?? payload)),
    pollQrLogin: guard('pollQrLogin', (service, payload) => service.pollQrLogin(payload)),

    // Song background: the community Bilibili MV searcher and stream resolver.
    // The MV settings from the mod config are forwarded with every request so the
    // community matching/quality rules are driven by the same knobs as ECHO-main.
    //
    // `mvMatchMode: 'first'` (the default) returns Bilibili's own relevance
    // order for a plain title search; 'score'/'views' keep the community
    // provider's scoring and view-count ranking.
    findMvCandidates: guard('findMvCandidates', (service, payload) => {
      const mode = MV_MATCH_MODES.has(payload?.mode) ? payload.mode : (MV_MATCH_MODES.has(settings.mvMatchMode) ? settings.mvMatchMode : 'first');
      if (mode === 'first') {
        // The renderer already builds the full query (title + artist + "MV"); a
        // caller that only supplies a title gets it built here.
        const query = typeof payload?.query === 'string' && payload.query.trim()
          ? payload.query.trim()
          : mvQuery(settings, String(payload?.title || '').trim(), String(payload?.artist || '').trim());
        return service.findMvCandidatesByTitle({
          title: query,
          limit: payload?.limit,
        });
      }
      return service.findMvCandidates({
        ...payload,
        ...mvRequestSettings(settings),
        preferHighestViewCount: mode === 'views',
        limit: payload?.limit,
      }).then((candidates) => ({ mode, query: payload?.query ?? null, candidates }));
    }),
    resolveMvStream: guard('resolveMvStream', (service, payload) => service.resolveMvStream({
      ...payload,
      ...mvRequestSettings(settings),
    })),
    probeMvEndpoints: guard('probeMvEndpoints', (service, payload) => service.probeMvEndpoints(payload)),
    /**
     * Diagnostic: replay a request through the bridge's own network path (the one
     * the providers use). Used by the build's probes and the verification suite to
     * prove that cookie/authorization headers actually reach the server.
     */
    debugFetch: guard('debugFetch', (service, payload) => service.debugFetch(payload)),

    // ---- Community MV engine (ECHO-main's MvService) ----------------------
    //
    // The whole MV subsystem is the community implementation: its search order,
    // candidate scoring, quality ladder, auto-apply rules, per-track offsets and
    // progressive MP4 fallback) is only the media-acquisition backend.
    mvEngineStatus: guard('mvEngineStatus', (service) => service.mvEngineStatus()),

    /** Keeps the MV engine's track lookup in step with what the player is on. */
    rememberTrack: async (payload) => {
      try {
        const service = loadBridge();
        const result = service.mvRememberTrack({
          id: payload?.id || payload?.stableKey,
          title: payload?.title,
          artist: payload?.artist,
          album: payload?.album,
          albumArtist: payload?.albumArtist,
          duration: payload?.duration,
          coverThumb: payload?.coverThumb || payload?.coverUrl,
          provider: payload?.provider,
          providerTrackId: payload?.providerTrackId,
          mediaType: 'streaming',
        });
        return { ok: true, result: { id: result?.id ?? null } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    mvGetSettings: guard('mvGetSettings', (service) => service.mvGetSettings()),

    mvSetSettings: async (payload) => {
      try {
        const service = loadBridge();
        const next = service.mvSetSettings(payload && typeof payload === 'object' ? payload : {});
        // MvService writes through the appSettings shim, which reports the change
        // back through configure()'s listener; mirror it into the mod settings so
        // the UI and a restart see the same values.
        if (next && typeof next === 'object') {
          settings = { ...settings, ...mvSettingsFromEngine(next) };
        }
        return { ok: true, result: { settings: next, config: { ...settings } } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    mvGetSelected: guard('mvGetSelected', (service, payload) => service.mvGetSelected(payload?.trackId ?? payload)),
    mvFindLocalCandidates: guard('mvFindLocalCandidates', (service, payload) => service.mvFindLocalCandidates(payload?.trackId ?? payload)),
    mvSearchNetworkCandidates: guard('mvSearchNetworkCandidates', (service, payload) => service.mvSearchNetworkCandidates(payload)),
    mvSearchNetworkCandidatesForSnapshot: guard('mvSearchNetworkCandidatesForSnapshot', (service, payload) => service.mvSearchNetworkCandidatesForSnapshot(payload)),
    mvGetTemporaryPlayableForSnapshot: guard('mvGetTemporaryPlayableForSnapshot', (service, payload) => service.mvGetTemporaryPlayableForSnapshot(payload)),
    mvGetCandidates: guard('mvGetCandidates', (service, payload) => service.mvGetCandidates(payload?.trackId ?? payload)),
    mvResolveStreams: guard('mvResolveStreams', (service, payload) => service.mvResolveStreams(payload?.videoId ?? payload)),
    mvSetQuality: guard('mvSetQuality', (service, payload) => service.mvSetQuality(payload)),
    mvSetOffset: guard('mvSetOffset', (service, payload) => service.mvSetOffset(payload)),
    mvBindLocalVideo: guard('mvBindLocalVideo', (service, payload) => service.mvBindLocalVideo(payload)),
    /**
     * Binds a pasted video link (or BV id) to a track, remembering it for that
     * song. The community `bindUrl` understands BV ids and Bilibili/YouTube
     * URLs; short share links and `av` ids are normalised here first.
     */
    mvBindUrl: async (payload) => {
      try {
        const service = loadBridge();
        const trackId = String(payload?.trackId || '').trim();
        const raw = String(payload?.url || '').trim();
        if (!trackId) throw new Error('trackId is required');
        if (!raw) throw new Error('url is required');
        const url = await normalizeMvLinkInput(raw);
        return { ok: true, result: await service.mvBindUrl({ trackId, url }) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log('WARN', `mvBindUrl failed: ${message}`);
        return { ok: false, error: message };
      }
    },
    mvSelectVideo: guard('mvSelectVideo', (service, payload) => service.mvSelectVideo(payload)),
    mvClearSelected: guard('mvClearSelected', (service, payload) => service.mvClearSelected(payload)),
    mvOpenExternal: guard('mvOpenExternal', (service, payload) => service.mvOpenExternal(payload)),

    /** Native file picker, then the same bindLocalVideo the community uses. */
    mvChooseLocalVideo: async (payload) => {
      try {
        const service = loadBridge();
        const trackId = String(payload?.trackId || '').trim();
        if (!trackId) throw new Error('trackId is required');
        const electron = require('electron');
        const result = await electron.dialog.showOpenDialog({
          title: '选择本地 MV 视频',
          properties: ['openFile'],
          filters: [{ name: '视频文件', extensions: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi'] }],
        });
        if (result.canceled || !result.filePaths?.[0]) {
          return { ok: true, result: null };
        }
        return { ok: true, result: service.mvBindLocalVideo({ trackId, filePath: result.filePaths[0] }) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    /** Serves a bound local MV file through the loopback proxy (range-capable). */
    mvServeLocalFile: async (payload) => {
      try {
        const filePath = String(payload?.filePath || '').trim();
        if (!filePath) throw new Error('filePath is required');
        if (!fs.existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
        return { ok: true, result: { url: registerMediaToken({ filePath }, path.extname(filePath)).url } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    // ---- Community MV media serving --------------------------------------
    //
    // ECHO-main resolves MV playback through its own custom protocol
    // (`echo-mv://stream/<videoId>/<variantId>`, `echo-mv://ephemeral/<token>`,
    // `echo-video://mv/<videoId>`) and a main-process handler pipes the CDN
    // response with the variant's headers and the request's Range. The mod does
    // exactly the same, plus an HTTP loopback form of the same URLs for hosts
    // where the custom scheme is unavailable.
    /** Registers a resolved MV variant (or bound local file) behind a loopback URL. */
    mvResolveMediaUrl: async (payload) => {
      try {
        const service = loadBridge();
        const mediaUrl = String(payload?.mediaUrl || '').trim();
        if (!mediaUrl) throw new Error('mediaUrl is required');

        const parsed = parseMvMediaUrl(mediaUrl);
        if (!parsed) throw new Error(`unsupported MV media url: ${mediaUrl.slice(0, 60)}`);

        if (parsed.kind === 'file') {
          const video = await service.mvGetVideoFile(parsed.videoId);
          if (!video?.filePath || !fs.existsSync(video.filePath)) throw new Error('local MV file is unavailable');
          const served = registerMediaToken({ filePath: video.filePath }, path.extname(video.filePath));
          return { ok: true, result: { url: served.url, mimeType: video.mimeType ?? null, kind: 'file', source: mediaUrl } };
        }

        const variant = parsed.kind === 'ephemeral'
          ? service.mvGetTemporaryStreamVariant(parsed.token)
          : await service.mvGetStreamVariant({ videoId: parsed.videoId, variantId: parsed.variantId });
        if (!variant?.url) throw new Error('MV variant could not be resolved');

        const served = registerMediaToken({
          url: variant.url,
          headers: variant.headers && typeof variant.headers === 'object' ? variant.headers : {},
          mimeType: variant.mimeType ?? null,
        }, mimeExtension(variant.mimeType));
        return {
          ok: true,
          result: {
            url: served.url,
            mimeType: variant.mimeType ?? null,
            kind: parsed.kind,
            source: mediaUrl,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log('WARN', `mvResolveMediaUrl failed: ${message}`);
        return { ok: false, error: message };
      }
    },

    // Daily recommendations / liked songs live in the bridge's in-memory cache
    // store; this reads the imported tracks back so the page can list them.
    getStoredPlaylist: guard('getStoredPlaylist', (service, payload) => service.getStoredPlaylist(payload)),

    /**
     * Progressive (non-DASH) background video: one complete MP4 that plays
     * through, seeks, and reports its real duration. DASH segment URLs are only
     * a few seconds long, which is what made the background loop its first
     * seconds, so they are never handed to the renderer any more.
     */
    prepareMvProgressive: async (payload) => {
      try {
        const service = loadBridge();
        const bvid = String(payload?.bvid || '').trim();
        if (!bvid) throw new Error('bvid is required');
        const stream = await service.resolveBilibiliProgressive({
          bvid,
          maxQuality: payload?.maxQuality || settings.mvMaxQuality,
          allow60fps: payload?.allow60fps !== false && settings.mvAllow60fps !== false,
        });
        return {
          ok: true,
          result: {
            url: registerMediaProxyUrl(stream.url, stream.headers, stream.mimeType ?? 'video/mp4'),
            mimeType: stream.mimeType ?? 'video/mp4',
            qualityLabel: stream.qualityLabel ?? null,
            durationSeconds: stream.durationSeconds ?? null,
            sizeBytes: stream.sizeBytes ?? null,
            signedIn: stream.signedIn === true,
            tried: Array.isArray(stream.tried) ? stream.tried : [],
            mode: 'progressive',
          },
        };
      } catch (error) {
        stats.failures += 1;
        stats.lastError = error instanceof Error ? error.message : String(error);
        log('WARN', `prepareMvProgressive failed: ${stats.lastError}`);
        return { ok: false, error: stats.lastError };
      }
    },

    /**
     * Resolves an MV stream and returns a loopback URL the renderer can play
     * without needing the CDN's Referer/CORS requirements. (DASH path; kept for
     * diagnostics — the background uses prepareMvProgressive.)
     */
    prepareMvBackground: async (payload) => {
      try {
        const service = loadBridge();
        const bvid = String(payload?.bvid || '').trim();
        if (!bvid) throw new Error('bvid is required');
        const stream = await service.resolveMvStream({
          bvid,
          title: payload?.title,
          durationSeconds: payload?.durationSeconds,
          ...mvRequestSettings(settings),
        });
        return {
          ok: true,
          result: {
            url: registerMediaProxyUrl(stream.url, stream.headers, stream.mimeType ?? 'video/mp4'),
            qualityLabel: stream.qualityLabel ?? null,
            width: stream.width ?? null,
            height: stream.height ?? null,
            mimeType: stream.mimeType ?? null,
          },
        };
      } catch (error) {
        stats.failures += 1;
        stats.lastError = error instanceof Error ? error.message : String(error);
        log('WARN', `prepareMvBackground failed: ${stats.lastError}`);
        return { ok: false, error: stats.lastError };
      }
    },

    getSettings: async () => ({ ok: true, result: { ...settings } }),
    setSettings: async (patch) => {
      if (patch && typeof patch === 'object') {
        settings = { ...settings, ...patch };
        applySettings();
        installResolver();
      }
      return { ok: true, result: { ...settings } };
    },
  };

  for (const [name, handler] of Object.entries(handlers)) {
    host?.handle?.(name, handler);
  }

  // Start the media proxy up front so the first background video is not delayed.
  ensureMediaProxy();

  /**
   * ECHO-main serves MV playback through its own `echo-mv://` protocol: the
   * renderer hands the URL MvService produced straight to <video>, and the main
   * process pipes the CDN variant with the variant's headers and the request's
   * Range. ECHO Steam ships the scheme but has no MV subsystem behind it, so the
   * mod registers the very same handler.
   */
  const registerMvProtocol = () => {
    try {
      const electron = require('electron');
      const protocol = electron?.protocol;
      if (typeof protocol?.handle !== 'function') {
        return { ok: false, reason: 'protocol.handle unavailable' };
      }
      if (typeof protocol.isProtocolHandled === 'function' && protocol.isProtocolHandled('echo-mv')) {
        return { ok: false, reason: 'echo-mv is already handled by the host' };
      }

      protocol.handle('echo-mv', async (request) => {
        try {
          const parsed = parseMvMediaUrl(request.url);
          if (!parsed || parsed.kind === 'file') {
            return new Response('', { status: 404 });
          }

          const service = loadBridge();
          let variant = parsed.kind === 'ephemeral'
            ? service.mvGetTemporaryStreamVariant(parsed.token)
            : await service.mvGetStreamVariant({ videoId: parsed.videoId, variantId: parsed.variantId });
          if (!variant?.url) {
            return new Response('', { status: 404 });
          }

          const range = request.headers.get('range');
          const streamVariant = async (candidate) => {
            const headers = { ...(candidate.headers && typeof candidate.headers === 'object' ? candidate.headers : {}) };
            if (range) headers.Range = range;
            const upstream = await fetch(candidate.url, { headers, redirect: 'follow' });
            if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
              return null;
            }

            const pass = new Headers({
              'Cache-Control': 'no-store',
              'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
            });
            const upstreamType = upstream.headers.get('content-type');
            const contentType = !upstreamType || upstreamType.toLowerCase().startsWith('application/octet-stream')
              ? candidate.mimeType || mimeTypeForMediaUrl(candidate.url)
              : upstreamType;
            if (contentType) pass.set('Content-Type', contentType);
            for (const name of ['content-length', 'content-range']) {
              const value = upstream.headers.get(name);
              if (value) pass.set(name, value);
            }
            return new Response(upstream.body, { status: upstream.status, headers: pass });
          };

          let response = await streamVariant(variant);
          if (!response && parsed.kind === 'stream') {
            // A persisted Bilibili URL expires; ECHO-main re-resolves the variant
            // once before giving up, and so does this handler.
            const refreshed = await service.mvRefreshStreamVariant({
              videoId: parsed.videoId,
              variantId: parsed.variantId,
            }).catch(() => null);
            if (refreshed?.url) {
              variant = refreshed;
              response = await streamVariant(refreshed);
            }
          }

          return response ?? new Response('', { status: 502 });
        } catch {
          return new Response('', { status: 404 });
        }
      });

      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  };

  const mvProtocol = registerMvProtocol();
  log('INFO', `echo-mv protocol ${mvProtocol.ok ? 'registered' : `not registered (${mvProtocol.reason})`}`);

  // ---- playback resolution hook -------------------------------------------

  // ECHO resolves online playback through the loader's
  // globalThis.__shinawaseResolveStreamingPlayback. Wrapping it lets the
  // community algorithms answer for the platforms they own while every other
  // provider (m3u8 radio, plugin sources, anything added later) keeps the
  // loader's behaviour.
  const installResolver = () => {
    const globalScope = globalThis;
    if (restoreResolver) {
      restoreResolver();
      restoreResolver = null;
    }
    if (settings.interceptPlayback === false) {
      log('INFO', 'playback interception disabled');
      return;
    }
    const previous = globalScope.__shinawaseResolveStreamingPlayback;
    if (typeof previous !== 'function' || previous.__echoMmsWrapped) {
      if (typeof previous === 'function') return;
      log('WARN', 'streaming playback resolver not present yet; will retry');
      return;
    }
    const wrapped = async (request) => {
      const provider = String(request?.provider ?? '');
      if (!COMMUNITY_PROVIDERS.has(provider)) {
        return previous(request);
      }
      try {
        const service = loadBridge();
        return await service.resolvePlayback({
          provider,
          providerTrackId: request?.providerTrackId,
          quality: request?.quality || request?.streamingQuality || settings.defaultQuality,
        });
      } catch (error) {
        stats.failures += 1;
        stats.lastError = error instanceof Error ? error.message : String(error);
        log('WARN', `community resolve failed for ${provider}, falling back: ${stats.lastError}`);
        return previous(request);
      }
    };
    wrapped.__echoMmsWrapped = true;
    globalScope.__shinawaseResolveStreamingPlayback = wrapped;
    restoreResolver = () => {
      if (globalScope.__shinawaseResolveStreamingPlayback === wrapped) {
        globalScope.__shinawaseResolveStreamingPlayback = previous;
      }
    };
    log('INFO', 'community playback resolver installed');
  };

  // The loader installs its resolver from the main bootstrap, which may finish
  // after mods activate, so poll briefly instead of missing the window.
  installResolver();
  if (!restoreResolver && settings.interceptPlayback !== false) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      installResolver();
      if (restoreResolver || attempts >= 40) {
        clearInterval(timer);
        if (!restoreResolver) log('WARN', 'gave up waiting for the streaming playback resolver');
      }
    }, 500);
    if (typeof timer.unref === 'function') timer.unref();
    disposers.push(() => clearInterval(timer));
  }

  // Warm the bridge so the first search is not paying module-load cost.
  setTimeout(() => {
    try {
      loadBridge();
    } catch {
      /* surfaced through status() */
    }
  }, 1500);

  log('INFO', `activated (interceptPlayback=${settings.interceptPlayback !== false})`);

  return () => {
    restoreResolver?.();
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {
        /* ignore cleanup failures */
      }
    }
  };
};

module.exports.RPC_PREFIX = RPC_PREFIX;
