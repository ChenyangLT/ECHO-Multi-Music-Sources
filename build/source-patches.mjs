// Source patches applied to the vendored ECHO Community sources at build time.
//
// The community sources are kept untouched on disk so they can be re-synced with
// upstream; behaviour changes needed for the mod live here instead, each with the
// reason it exists and the exact anchor it rewrites. A patch failing to apply is
// a hard build error, so a future upstream change cannot silently drop a fix.

export const sourcePatches = [
  {
    id: 'streaming-skip-stale-empty-search',
    file: 'src/main/streaming/StreamingService.ts',
    reason:
      'search() serves an expired cache entry immediately and refreshes it in the background. When the ' +
      'cached entry is an EMPTY result (which is exactly what a platform throttle produces), the user ' +
      'keeps seeing "no results" for the whole cache window even though a fresh request would succeed. ' +
      'Empty stale entries are therefore ignored so the search is retried inline.',
    anchor: `    const staleSqliteHit = this.cacheStore.getApiCache<StreamingSearchResult>(key, { allowExpired: true });
    if (normalized.provider !== 'plugin' && staleSqliteHit) {`,
    replacement: `    const staleSqliteHit = this.cacheStore.getApiCache<StreamingSearchResult>(key, { allowExpired: true });
    const staleSqliteHitIsEmpty =
      Boolean(staleSqliteHit) &&
      (staleSqliteHit!.tracks?.length ?? 0) === 0 &&
      (staleSqliteHit!.albums?.length ?? 0) === 0 &&
      (staleSqliteHit!.artists?.length ?? 0) === 0 &&
      (staleSqliteHit!.playlists?.length ?? 0) === 0 &&
      (staleSqliteHit!.mvs?.length ?? 0) === 0;
    if (normalized.provider !== 'plugin' && staleSqliteHit && !staleSqliteHitIsEmpty) {`,
  },
  {
    id: 'qqmusic-legacy-search-primary',
    file: 'src/main/streaming/providers/QQMusicStreamingProvider.ts',
    reason:
      'u.y.qq.com/cgi-bin/musicu.fcg has started answering anonymous desktop search with req_1.code 2001 ' +
      '("please log in first", feedbackURL pointing at common_login.html) for whole sessions on end, with ' +
      'an empty song list and meta.sum 0 — measured 0/6 successful queries. The legacy ' +
      'c.y.qq.com/soso/fcgi-bin/client_search_cp endpoint kept answering 6/6 with the full song shape ' +
      '(mid/name/singer/album/mv), and mapSong already reads exactly those field names. Search therefore ' +
      'queries the legacy endpoint first and only falls back to musicu.fcg, which also keeps an ' +
      'authenticated session working when the legacy endpoint is the one that misbehaves.',
    steps: [
      {
        note: 'Query the legacy endpoint first; fall back to musicu.fcg only if it yields nothing.',
        anchor: `    const data = asRecord(
      await jsonFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        headers: qqHeaders(accountCookie()),
        body,
      }),
    );`,
        replacement: `    const qqLegacySearchType = searchType === 8 ? 'album' : searchType === 9 ? 'singer' : searchType === 3 ? 'playlist' : 'song';
    const qqLegacyParams = new URLSearchParams({
      format: 'json',
      p: String(page),
      n: String(pageSize),
      w: request.query,
      new_json: '1',
      t: qqLegacySearchType === 'song' ? '0' : qqLegacySearchType === 'album' ? '8' : qqLegacySearchType === 'singer' ? '9' : '3',
    });
    let data: Record<string, unknown> = {};
    let qqUsedLegacySearch = false;
    try {
      const legacyPayload = asRecord(
        await jsonFetch('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?' + qqLegacyParams.toString(), {
          headers: qqHeaders(accountCookie()),
          timeoutMs: 10_000,
        }),
      );
      const legacyData = asRecord(legacyPayload.data);
      const legacySong = asRecord(legacyData.song);
      const legacyAlbum = asRecord(legacyData.album);
      const legacySinger = asRecord(legacyData.singer);
      const legacyPlaylist = asRecord(legacyData.songlist);
      const legacyTotal = integer(
        legacySong.totalnum ?? legacyAlbum.totalnum ?? legacySinger.totalnum ?? legacyPlaylist.totalnum,
      );
      const legacyHasResults =
        (Array.isArray(legacySong.list) && legacySong.list.length > 0) ||
        (Array.isArray(legacyAlbum.list) && legacyAlbum.list.length > 0) ||
        (Array.isArray(legacySinger.list) && legacySinger.list.length > 0) ||
        (Array.isArray(legacyPlaylist.list) && legacyPlaylist.list.length > 0);
      if (legacyHasResults) {
        // The legacy payload nests the same fields one level shallower
        // (data.song.list). The parser below reads the modern shape
        // (req_1.data.body.song.list), and unwrapQqSongRecord peels a nested
        // record named "song" off each entry, so every entry is re-wrapped under
        // a "song" key to keep that unwrapping a no-op. meta.sum carries total.
        qqUsedLegacySearch = true;
        data = {
          req_1: {
            data: {
              body: {
                song: { list: (Array.isArray(legacySong.list) ? legacySong.list : []).map((entry) => ({ song: entry })) },
                album: { list: Array.isArray(legacyAlbum.list) ? legacyAlbum.list : [] },
                singer: { list: Array.isArray(legacySinger.list) ? legacySinger.list : [] },
                songlist: { list: Array.isArray(legacyPlaylist.list) ? legacyPlaylist.list : [] },
              },
              meta: { ...asRecord(legacyData.meta), sum: legacyTotal },
            },
          },
        };
      }
    } catch {
      /* fall through to the modern endpoint */
    }
    if (!qqUsedLegacySearch) {
      data = asRecord(
        await jsonFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
          method: 'POST',
          headers: qqHeaders(accountCookie()),
          body,
        }),
      );
    }`,
      },
      {
        note: 'Restore the plain parse (the legacy response already has the shallow shape).',
        anchor: `    let payload = asRecord(asRecord(data.req_1).data);
    let bodyData = asRecord(payload.body);
    let songData = asRecord(bodyData.song);
    let albumData = asRecord(bodyData.album);
    let singerData = asRecord(bodyData.singer);
    let playlistData = asRecord(bodyData.songlist ?? bodyData.playlist ?? bodyData.mv);
    let meta = asRecord(payload.meta);`,
        replacement: `    const payload = asRecord(asRecord(data.req_1).data);
    const bodyData = asRecord(payload.body);
    const songData = asRecord(bodyData.song);
    const albumData = asRecord(bodyData.album);
    const singerData = asRecord(bodyData.singer);
    const playlistData = asRecord(bodyData.songlist ?? bodyData.playlist ?? bodyData.mv);
    const meta = asRecord(payload.meta);`,
      },
    ],
  },
  {
    id: 'bilibili-mv-search-origin',
    file: 'src/main/mv/OnlineMvProviders.ts',
    reason:
      'The Bilibili search headers set Origin/Referer to search.bilibili.com while the request goes to ' +
      'api.bilibili.com. Electron net.fetch enforces a same-origin check for the Origin header and fails ' +
      'the request outright (net::ERR_FAILED, measured in the live game), so MV search always returned ' +
      'an empty list and the song background reported "no match" for every track. Pointing Origin and ' +
      'Referer at www.bilibili.com — the same host the CDN and API accept, verified working — fixes it. ' +
      'Bilibili does not require the search page as referer; the plain header set returned a full result ' +
      'list from the live game.',
    steps: [
      {
        note: 'Use a www.bilibili.com referer for the type search.',
        anchor: `const bilibiliSearchReferer = (query: string): string =>
  \`https://search.bilibili.com/video?keyword=\${encodeURIComponent(query)}\`;`,
        replacement: `const bilibiliSearchReferer = (query: string): string =>
  \`https://www.bilibili.com/search/video?keyword=\${encodeURIComponent(query)}\`;`,
      },
      {
        note: 'Use a www.bilibili.com referer for the aggregate search.',
        anchor: `const bilibiliAllSearchReferer = (query: string): string =>
  \`https://search.bilibili.com/all?keyword=\${encodeURIComponent(query)}\`;`,
        replacement: `const bilibiliAllSearchReferer = (query: string): string =>
  \`https://www.bilibili.com/search/all?keyword=\${encodeURIComponent(query)}\`;`,
      },
      {
        note: 'Match the Origin header to the request host.',
        anchor: `const bilibiliSearchHeaders = (query: string, credentials: Record<string, string>): Record<string, string> => ({
  ...credentials,
  Referer: bilibiliSearchReferer(query),
  Origin: 'https://search.bilibili.com',
  'Accept-Language': bilibiliAcceptLanguage,
});`,
        replacement: `const bilibiliSearchHeaders = (query: string, credentials: Record<string, string>): Record<string, string> => ({
  ...credentials,
  Referer: bilibiliSearchReferer(query),
  Origin: 'https://www.bilibili.com',
  'Accept-Language': bilibiliAcceptLanguage,
});`,
      },
    ],
  },
  {
    id: 'bilibili-mv-search-primary-aggregate',
    file: 'src/main/mv/OnlineMvProviders.ts',
    reason:
      'Bilibili now answers the search/type endpoint with HTTP 412 (rate limited) for ordinary ' +
      'clients — measured 412 from the live game even though search/all/v2 answered 200 with a full ' +
      'video group. The community code queries search/type first and only falls back to all/v2, so MV ' +
      'search silently returned nothing and the song background reported "no match" for every track. ' +
      'The aggregate endpoint is therefore queried first, with search/type kept as the fallback.',
    anchor: `    let typeResults: unknown[] = [];
    try {
      const typePayload = await withTimeout(this.fetchImpl, typeSearchUrl.toString(), headers);
      const typeData = isRecord(typePayload) ? typePayload.data : null;
      typeResults = isRecord(typeData) ? asArray(typeData.result) : [];
    } catch {
      typeResults = [];
    }
    const results = typeResults.length > 0 ? typeResults : await this.searchAllVideos(query, headers);`,
    replacement: `    // The aggregate endpoint is tried first: search/type is currently answering
    // HTTP 412 (rate limited) for ordinary clients, which yields an empty list
    // and would hide every match.
    let typeResults: unknown[] = await this.searchAllVideos(query, headers);
    if (typeResults.length === 0) {
      try {
        const typePayload = await withTimeout(this.fetchImpl, typeSearchUrl.toString(), headers);
        const typeData = isRecord(typePayload) ? typePayload.data : null;
        typeResults = isRecord(typeData) ? asArray(typeData.result) : [];
      } catch {
        typeResults = [];
      }
    }
    if (typeResults.length === 0) {
      const unsignedSearchUrl = new URL('https://api.bilibili.com/x/web-interface/search/type');
      unsignedSearchUrl.searchParams.set('search_type', 'video');
      unsignedSearchUrl.searchParams.set('keyword', query);
      unsignedSearchUrl.searchParams.set('page', '1');
      unsignedSearchUrl.searchParams.set('order', 'click');
      unsignedSearchUrl.searchParams.set('page_size', '8');
      try {
        const unsignedPayload = await withTimeout(this.fetchImpl, unsignedSearchUrl.toString(), headers);
        const unsignedData = isRecord(unsignedPayload) ? unsignedPayload.data : null;
        typeResults = isRecord(unsignedData) ? asArray(unsignedData.result) : [];
      } catch {
        typeResults = [];
      }
    }
    const results = typeResults;`,
  },
  {
    id: 'accounts-encrypted-store',
    file: 'src/main/accounts/AccountService.ts',
    reason:
      'ECHO Steam persists account secrets in accounts.json as encryptedCookie / encryptedAccessToken / ' +
      'encryptedRefreshToken, wrapped with Electron safeStorage ("safe:<base64>") and falling back to a ' +
      'readable "plain:<base64>" envelope. The community AccountService only models the plaintext fields, so ' +
      'a login saved by ECHO itself is invisible to this service: a valid Bilibili/NetEase session reports as ' +
      '"not signed in", the account-gated playback quality is unavailable, daily recommendations refuse to run ' +
      '("Please connect a NetEase Cloud Music account") and liked-songs sync returns nothing. The two shapes are ' +
      'translated in both directions, every field this service does not model is carried across untouched, and ' +
      'the file keeps the host application\'s 0600 permission.',
    steps: [
      {
        note: 'Pull safeStorage in alongside app.',
        anchor: `import { app } from 'electron';`,
        replacement: `import { app, safeStorage } from 'electron';`,
      },
      {
        note: 'chmodSync is needed to keep the encrypted store private like the host does.',
        anchor: `import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';`,
        replacement: `import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';`,
      },
      {
        note: 'Add the secret envelope translation helpers.',
        anchor: `export class AccountService {`,
        replacement: `// ---- ECHO Steam encrypted account store -----------------------------------
// ECHO's own builds keep account secrets in accounts.json under
// encryptedCookie/encryptedAccessToken/encryptedRefreshToken, wrapped with
// Electron safeStorage ("safe:<base64>"), with a readable "plain:<base64>"
// envelope when OS encryption is unavailable. This service only models the
// plaintext fields, so secrets written by the host application are translated
// on the way in and back into the encrypted envelope on the way out. Every
// field this service does not model is preserved verbatim.

const encryptedSecretKeys = {
  cookie: 'encryptedCookie',
  accessToken: 'encryptedAccessToken',
  refreshToken: 'encryptedRefreshToken',
} as const;

const encryptedSecretKeyNames: readonly string[] = Object.values(encryptedSecretKeys);
const plaintextSecretKeyNames: readonly string[] = ['cookie', 'accessToken', 'refreshToken'];
const safeStoragePrefix = 'safe:';
const plainFallbackPrefix = 'plain:';

/** Fields of accounts.json this service does not model, per provider key. */
const storedAccountExtras = new Map<string, Record<string, unknown>>();

/**
 * Envelopes that could not be opened (written by another Electron build).
 * They are kept verbatim so a write that has no replacement secret restores
 * the original value instead of destroying the user's login.
 */
const storedAccountSecretEnvelopes = new Map<string, Record<string, string>>();

/**
 * ECHO's own main process decrypts the store with its process-bound safeStorage
 * key and publishes a reader on globalThis (the loader bridge). When an envelope
 * cannot be opened here, that reader is the authoritative source for the cookie.
 */
const resolveHostAccountCookie = (provider: string): string | undefined => {
  const reader = (globalThis as Record<string, unknown>).__shinawaseStreamingAccountCookie;
  if (typeof reader !== 'function') {
    return undefined;
  }

  try {
    const value = (reader as (name: string) => unknown)(provider);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  } catch {
    return undefined;
  }
};

const isPlainRecord2 = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const restrictAccountFilePermissions = (filePath: string): void => {
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Windows ignores POSIX modes; the atomic write is what matters there.
  }
};

const decryptStoredSecret = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  if (value.startsWith(safeStoragePrefix)) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(safeStoragePrefix.length), 'base64')) || undefined;
    } catch {
      return undefined;
    }
  }
  if (value.startsWith(plainFallbackPrefix)) {
    try {
      return Buffer.from(value.slice(plainFallbackPrefix.length), 'base64').toString('utf8') || undefined;
    } catch {
      return undefined;
    }
  }
  // Older builds stored the raw secret; keep accepting it.
  return value;
};

const encryptStoredSecret = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStoragePrefix + safeStorage.encryptString(value).toString('base64');
    }
  } catch {
    // Fall through to the readable envelope.
  }
  return plainFallbackPrefix + Buffer.from(value, 'utf8').toString('base64');
};

/** On-disk accounts.json -> the shape normalizeStoredAccounts expects. */
const withDecryptedAccountSecrets = (value: unknown): unknown => {
  if (!isPlainRecord2(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [providerKey, providerValue] of Object.entries(value)) {
    if (!isPlainRecord2(providerValue)) {
      next[providerKey] = providerValue;
      continue;
    }

    const extras: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(providerValue)) {
      if (!encryptedSecretKeyNames.includes(key) && !plaintextSecretKeyNames.includes(key)) {
        extras[key] = entry;
      }
    }
    storedAccountExtras.set(providerKey, extras);

    const decrypted: Record<string, unknown> = { ...providerValue };
    for (const key of encryptedSecretKeyNames) {
      delete decrypted[key];
    }

    const preserved: Record<string, string> = {};
    for (const [plainKey, storedKey] of [
      ['cookie', encryptedSecretKeys.cookie],
      ['accessToken', encryptedSecretKeys.accessToken],
      ['refreshToken', encryptedSecretKeys.refreshToken],
    ] as const) {
      const rawStored = providerValue[storedKey];
      const secret = decryptStoredSecret(rawStored ?? providerValue[plainKey]);
      if (secret !== undefined) {
        decrypted[plainKey] = secret;
        continue;
      }

      delete decrypted[plainKey];
      if (typeof rawStored === 'string' && rawStored.length > 0) {
        preserved[storedKey] = rawStored;
      }
    }
    storedAccountSecretEnvelopes.set(providerKey, preserved);

    next[providerKey] = decrypted;
  }

  return next;
};

/** The modelled records -> the encrypted on-disk shape. */
const withEncryptedAccountSecrets = (records: unknown): unknown => {
  if (!isPlainRecord2(records)) {
    return records;
  }

  const next: Record<string, unknown> = {};
  for (const [providerKey, providerValue] of Object.entries(records)) {
    if (!isPlainRecord2(providerValue)) {
      next[providerKey] = providerValue;
      continue;
    }

    const record: Record<string, unknown> = { ...providerValue };
    const secrets: Record<string, string | undefined> = {};
    for (const plainKey of plaintextSecretKeyNames) {
      const raw = record[plainKey];
      secrets[plainKey] = typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
      delete record[plainKey];
    }

    const hasSecret = plaintextSecretKeyNames.some((key) => Boolean(secrets[key]));
    if (!hasSecret && Object.keys(record).length === 0) {
      // clearAccount() empties the record; drop the carried-over extras too.
      storedAccountExtras.delete(providerKey);
      storedAccountSecretEnvelopes.delete(providerKey);
      next[providerKey] = {};
      continue;
    }

    const preserved = storedAccountSecretEnvelopes.get(providerKey) ?? {};
    const persisted: Record<string, unknown> = { ...(storedAccountExtras.get(providerKey) ?? {}), ...record };
    for (const [plainKey, storedKey] of [
      ['cookie', encryptedSecretKeys.cookie],
      ['accessToken', encryptedSecretKeys.accessToken],
      ['refreshToken', encryptedSecretKeys.refreshToken],
    ] as const) {
      const encrypted = encryptStoredSecret(secrets[plainKey]) ?? preserved[storedKey];
      if (encrypted) {
        persisted[storedKey] = encrypted;
      }
    }

    next[providerKey] = persisted;
  }

  return next;
};

export class AccountService {`,
      },
      {
        note: 'Seed records from the host application reader when an envelope cannot be opened here.',
        anchor: `  private readRecords(): StoredAccounts {
    if (this.records) {
      return this.records;
    }

    const primaryRecords = this.readRecordsFromPath(this.storagePath);
    if (primaryRecords) {
      this.records = primaryRecords;
      return this.records;
    }

    const backupRecords = this.readRecordsFromPath(this.getBackupStoragePath());
    if (backupRecords) {
      this.records = backupRecords;
      this.writeRecords(backupRecords);
      return this.records;
    }

    if (!existsSync(this.storagePath)) {
      this.records = {};
      return this.records;
    }

    this.records = {};
    return this.records;
  }`,
        replacement: `  private seedHostAccountCookies(records: StoredAccounts): StoredAccounts {
    for (const provider of accountProviders) {
      if (records[provider]?.cookie) {
        continue;
      }

      const hostCookie = resolveHostAccountCookie(provider);
      if (hostCookie) {
        records[provider] = { ...(records[provider] ?? {}), cookie: hostCookie };
      }
    }

    return records;
  }

  private readRecords(): StoredAccounts {
    if (this.records) {
      return this.seedHostAccountCookies(this.records);
    }

    const primaryRecords = this.readRecordsFromPath(this.storagePath);
    if (primaryRecords) {
      this.records = primaryRecords;
      return this.seedHostAccountCookies(this.records);
    }

    const backupRecords = this.readRecordsFromPath(this.getBackupStoragePath());
    if (backupRecords) {
      this.records = backupRecords;
      this.writeRecords(backupRecords);
      return this.seedHostAccountCookies(this.records);
    }

    if (!existsSync(this.storagePath)) {
      this.records = {};
      return this.seedHostAccountCookies(this.records);
    }

    this.records = {};
    return this.seedHostAccountCookies(this.records);
  }`,
      },
      {
        note: 'Decrypt the stored secrets before the records are normalized.',
        anchor: `    try {
      return normalizeStoredAccounts(JSON.parse(readFileSync(filePath, 'utf8')) as unknown);
    } catch {
      return null;
    }`,
        replacement: `    try {
      return normalizeStoredAccounts(withDecryptedAccountSecrets(JSON.parse(readFileSync(filePath, 'utf8')) as unknown));
    } catch {
      return null;
    }`,
      },
      {
        note: 'Write the encrypted envelope back, with the host application permissions.',
        anchor: `    writeFileSync(tmpPath, \`\${JSON.stringify(records, null, 2)}\\n\`, 'utf8');
    renameSync(tmpPath, this.storagePath);
    this.copyPrimaryToBackup();
    this.records = records;`,
        replacement: `    writeFileSync(tmpPath, \`\${JSON.stringify(withEncryptedAccountSecrets(records), null, 2)}\\n\`, { encoding: 'utf8', mode: 0o600 });
    renameSync(tmpPath, this.storagePath);
    restrictAccountFilePermissions(this.storagePath);
    this.copyPrimaryToBackup();
    this.records = records;`,
      },
    ],
  },
  {
    id: 'bilibili-native-audio-playback',
    file: 'src/main/streaming/providers/BilibiliStreamingProvider.ts',
    reason:
      'This provider resolved Bilibili playback exclusively through yt-dlp. The ECHO Steam distribution ships no ' +
      'yt-dlp binary, so every Bilibili track failed with "Bilibili extractor failed: spawn yt-dlp.exe ENOENT" ' +
      'and the mod fell back to the loader resolver, which fails the same way. Bilibili\'s own playurl API answers ' +
      'the same question without an external binary — web-interface/view gives the cid, web-interface/nav gives the ' +
      'WBI keys, and x/player/wbi/playurl (the endpoint the MV provider already uses, with the same signing table) ' +
      'returns audio-only DASH streams. Native resolution is therefore tried first and yt-dlp is kept as the ' +
      'last-resort fallback.',
    steps: [
      {
        note: 'md5 for the WBI signature.',
        anchor: `import { randomUUID } from 'node:crypto';`,
        replacement: `import { createHash, randomUUID } from 'node:crypto';`,
      },
      {
        note: 'jsonFetch is the provider-side JSON helper (network proxy, timeout, JSON unwrap).',
        anchor: `import { asRecord, integer, streamingImageProxyUrl, text } from './chinaStreamingUtils';`,
        replacement: `import { asRecord, integer, jsonFetch, streamingImageProxyUrl, text } from './chinaStreamingUtils';`,
      },
      {
        note: 'Add the native audio-only resolver.',
        anchor: `export class BilibiliStreamingProvider implements StreamingProvider {`,
        replacement: `// ---- Native audio-only playback -------------------------------------------
// Bilibili exposes audio-only DASH streams through the same playurl API the MV
// provider uses, so playing a Bilibili track needs no extractor binary at all.
// The WBI signing table and helpers are deliberately identical to the MV
// provider's, so both paths produce the same signature for the same request.

const bilibiliAudioQualityOrder = [30216, 30232, 30280, 30250, 30251];
const bilibiliDashFnval = '4048';
const bilibiliDashFnvalAudioOnly = '16';
const bilibiliPlaybackAcceptLanguage = 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7';
const bilibiliPlaybackMixinKeyEncTable = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16,
  24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

const bilibiliAudioQualityRank = (id: number): number => {
  const index = bilibiliAudioQualityOrder.indexOf(id);
  return index === -1 ? 1 : index;
};

const bilibiliRequestedAudioRank = (quality: unknown): number => {
  const value = String(quality ?? '').trim().toLowerCase();
  if (value === 'hires') {
    return 4;
  }
  if (value === 'lossless') {
    return 2;
  }
  if (value === 'high') {
    return 1;
  }
  if (value === 'standard') {
    return 0;
  }
  return 2;
};

const bilibiliWbiKeyPart = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) {
    return null;
  }

  return raw.split('/').pop()?.split('.')[0] ?? null;
};

const bilibiliMixinWbiKey = (rawKey: string): string =>
  bilibiliPlaybackMixinKeyEncTable.map((index) => rawKey[index]).join('').slice(0, 32);

const bilibiliAppendWbiSignature = (url: URL, mixinKey: string): void => {
  url.searchParams.set('wts', String(Math.round(Date.now() / 1000)));
  const query = Array.from(url.searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value).replace(/[!'()*]/g, '')))
    .join('&');
  url.searchParams.set('w_rid', createHash('md5').update(query + mixinKey).digest('hex'));
};

const bilibiliPlaybackHeaders = (bvid: string, cookie: string | undefined): Record<string, string> => ({
  Referer: 'https://www.bilibili.com/video/' + bvid,
  Origin: 'https://www.bilibili.com',
  'User-Agent': bilibiliUserAgent,
  'Accept-Language': bilibiliPlaybackAcceptLanguage,
  ...(cookie ? { Cookie: cookie } : {}),
});

const bilibiliFetchJson = async (url: string, headers: Record<string, string>): Promise<Record<string, unknown> | null> => {
  try {
    return asRecord(await jsonFetch(url, { headers, timeoutMs: 12_000 }));
  } catch {
    return null;
  }
};

/** Bilibili reports success with code 0; anything else (or a dead request) failed. */
const bilibiliPayloadFailed = (payload: Record<string, unknown> | null): boolean =>
  !payload || (payload.code !== undefined && Number(payload.code) !== 0);

const bilibiliSearchPageFromEntries = (entries: unknown[], pageSize: number): BilibiliSearchPage => {
  const tracks = entries
    .map((entry) => trackFromSearchEntry(entry as BilibiliSearchEntry))
    .filter((track): track is StreamingTrack => Boolean(track));
  return { tracks, total: null, hasMore: tracks.length >= pageSize };
};

/** The WBI mixin key is needed for both search and playurl. */
const resolveBilibiliWbiMixinKey = async (headers: Record<string, string>): Promise<string | null> => {
  const payload = await bilibiliFetchJson('https://api.bilibili.com/x/web-interface/nav', headers);
  const wbiImg = asRecord(asRecord(payload?.data).wbi_img);
  const imgKey = bilibiliWbiKeyPart(wbiImg.img_url);
  const subKey = bilibiliWbiKeyPart(wbiImg.sub_url);
  return imgKey && subKey ? bilibiliMixinWbiKey(imgKey + subKey) : null;
};

const bilibiliAudioStreamUrl = (stream: Record<string, unknown>): string | null => {
  const direct = text(stream.baseUrl ?? stream.base_url);
  if (direct) {
    return direct;
  }

  for (const listKey of ['backupUrl', 'backup_url']) {
    const list = stream[listKey];
    if (!Array.isArray(list)) {
      continue;
    }
    for (const entry of list) {
      const candidate = text(entry);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
};

/**
 * Resolves a Bilibili track to an audio-only DASH stream, or null when the API
 * refuses (region lock, members-only track, or a rate-limited session).
 */
const resolveBilibiliAudioSource = async (
  request: StreamingPlaybackRequest,
): Promise<StreamingPlaybackSource | null> => {
  const rawId = String(request.providerTrackId ?? '').trim();
  const bvid = bvidFromValue(rawId) ?? rawId.replace(/^bilibili:/iu, '');
  if (!bvid) {
    return null;
  }

  const cookie = accountCookie();
  const headers = bilibiliPlaybackHeaders(bvid, cookie);

  const viewUrl = new URL('https://api.bilibili.com/x/web-interface/view');
  if (/^av\\d+$/iu.test(bvid)) {
    viewUrl.searchParams.set('aid', bvid.slice(2));
  } else {
    viewUrl.searchParams.set('bvid', bvid);
  }
  const viewPayload = await bilibiliFetchJson(viewUrl.toString(), headers);
  const viewData = asRecord(viewPayload?.data);
  const cid = integer(viewData.cid) ?? integer(asRecord(Array.isArray(viewData.pages) ? viewData.pages[0] : null).cid);
  if (!cid) {
    return null;
  }

  const mixinKey = await resolveBilibiliWbiMixinKey(headers);

  const buildPlayUrl = (fnval: string, signed: boolean): URL => {
    const url = new URL(
      signed ? 'https://api.bilibili.com/x/player/wbi/playurl' : 'https://api.bilibili.com/x/player/playurl',
    );
    url.searchParams.set('bvid', bvid);
    url.searchParams.set('cid', String(cid));
    url.searchParams.set('qn', '0');
    url.searchParams.set('fnver', '0');
    url.searchParams.set('fnval', fnval);
    url.searchParams.set('fourk', '1');
    if (signed && mixinKey) {
      bilibiliAppendWbiSignature(url, mixinKey);
    }
    return url;
  };

  const attempts: Array<{ fnval: string; signed: boolean }> = [];
  if (mixinKey) {
    attempts.push({ fnval: bilibiliDashFnval, signed: true });
  }
  attempts.push({ fnval: bilibiliDashFnval, signed: false });
  attempts.push({ fnval: bilibiliDashFnvalAudioOnly, signed: false });

  for (const attempt of attempts) {
    const payload = await bilibiliFetchJson(buildPlayUrl(attempt.fnval, attempt.signed).toString(), headers);
    if (bilibiliPayloadFailed(payload)) {
      continue;
    }

    const dash = asRecord(asRecord(payload.data).dash);
    const audioStreams = (Array.isArray(dash.audio) ? dash.audio : [])
      .map((entry) => {
        const stream = asRecord(entry);
        return { stream, id: integer(stream.id) ?? 0, url: bilibiliAudioStreamUrl(stream) };
      })
      .filter((entry): entry is { stream: Record<string, unknown>; id: number; url: string } => Boolean(entry.url));
    if (audioStreams.length === 0) {
      continue;
    }

    // Prefer the best stream that does not exceed the requested quality, and
    // fall back to the best available one when the platform has nothing at or
    // below it.
    const requestedRank = bilibiliRequestedAudioRank(request.quality);
    const sorted = [...audioStreams].sort((left, right) => bilibiliAudioQualityRank(right.id) - bilibiliAudioQualityRank(left.id));
    const chosen = sorted.find((entry) => bilibiliAudioQualityRank(entry.id) <= requestedRank) ?? sorted[0];

    return {
      provider,
      providerTrackId: request.providerTrackId,
      url: chosen.url,
      expiresAt: streamUrlExpiresAt(chosen.url),
      mimeType: text(chosen.stream.mimeType ?? chosen.stream.mime_type) ?? 'audio/mp4',
      bitrate: integer(chosen.stream.bandwidth),
      sampleRate: null,
      bitDepth: null,
      codec: text(chosen.stream.codecs ?? chosen.stream.codec),
      headers: {
        Referer: headers.Referer,
        Origin: headers.Origin,
        'User-Agent': headers['User-Agent'],
        ...(cookie ? { Cookie: cookie } : {}),
      },
      requiresProxy: false,
      supportsRange: !/\\.m3u8(?:\\?|$)/iu.test(chosen.url),
    };
  }

  return null;
};

export class BilibiliStreamingProvider implements StreamingProvider {`,
      },
      {
        note: 'Search through the WBI-signed endpoint and the aggregate endpoint instead of the rate-limited one.',
        anchor: `  private async searchBilibiliApi(request: StreamingSearchRequest, page: number, pageSize: number): Promise<BilibiliSearchPage | null> {
    const url = new URL('https://api.bilibili.com/x/web-interface/search/type');
    url.searchParams.set('search_type', 'video');
    url.searchParams.set('keyword', request.query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(pageSize));

    try {
      const response = await fetchWithNetworkProxy(url.toString(), {
        headers: bilibiliHeaders({ Referer: \`https://search.bilibili.com/video?keyword=\${encodeURIComponent(request.query)}\` }),
      });
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as BilibiliSearchResponse;
      if (payload.code !== 0 || !Array.isArray(payload.data?.result)) {
        return null;
      }

      const tracks = payload.data.result
        .map(trackFromSearchEntry)
        .filter((track): track is StreamingTrack => Boolean(track));
      return {
        tracks,
        total: integer(payload.data.numResults),
        hasMore: tracks.length === pageSize,
      };
    } catch {
      return null;
    }
  }`,
        replacement: `  private async searchBilibiliApi(request: StreamingSearchRequest, page: number, pageSize: number): Promise<BilibiliSearchPage | null> {
    // The unsigned search/type endpoint answers ordinary clients with HTTP 412
    // (rate limited) for whole sessions, which left Bilibili search and the
    // song-background MV lookup with an empty catalogue. The WBI-signed variant
    // and the aggregate all/v2 endpoint both keep returning the same video
    // shape, so they are tried in that order.
    const headers = bilibiliHeaders({
      Referer: 'https://www.bilibili.com/search/video?keyword=' + encodeURIComponent(request.query),
    });
    const wbiMixinKey = await resolveBilibiliWbiMixinKey(headers);

    const typeUrl = new URL(
      wbiMixinKey
        ? 'https://api.bilibili.com/x/web-interface/wbi/search/type'
        : 'https://api.bilibili.com/x/web-interface/search/type',
    );
    typeUrl.searchParams.set('search_type', 'video');
    typeUrl.searchParams.set('keyword', request.query);
    typeUrl.searchParams.set('page', String(page));
    typeUrl.searchParams.set('page_size', String(pageSize));
    if (wbiMixinKey) {
      bilibiliAppendWbiSignature(typeUrl, wbiMixinKey);
    }

    const typePayload = await bilibiliFetchJson(typeUrl.toString(), headers);
    if (!bilibiliPayloadFailed(typePayload)) {
      const typeData = asRecord(typePayload?.data);
      const typePage = bilibiliSearchPageFromEntries(Array.isArray(typeData.result) ? typeData.result : [], pageSize);
      if (typePage.tracks.length > 0) {
        return { ...typePage, total: integer(typeData.numResults) };
      }
    }

    const aggregateUrl = new URL('https://api.bilibili.com/x/web-interface/search/all/v2');
    aggregateUrl.searchParams.set('keyword', request.query);
    aggregateUrl.searchParams.set('page', String(page));
    const aggregatePayload = await bilibiliFetchJson(aggregateUrl.toString(), headers);
    if (!bilibiliPayloadFailed(aggregatePayload)) {
      const groups = Array.isArray(asRecord(aggregatePayload?.data).result)
        ? (asRecord(aggregatePayload?.data).result as unknown[])
        : [];
      const videoGroup = groups.map((entry) => asRecord(entry)).find((group) => group.result_type === 'video');
      const entries = Array.isArray(videoGroup?.data) ? (videoGroup?.data as unknown[]) : [];
      const aggregatePage = bilibiliSearchPageFromEntries(entries, pageSize);
      if (aggregatePage.tracks.length > 0) {
        return aggregatePage;
      }
    }

    return null;
  }`,
      },
      {
        note: 'Try the native audio-only path before shelling out to yt-dlp.',
        anchor: `  async resolvePlayback(request: StreamingPlaybackRequest): Promise<StreamingPlaybackSource> {
    const metadata = await ytDlpJson<unknown>(['--no-playlist', '-f', 'ba/bestaudio', resolvedTrackUrl(request.providerTrackId)]);`,
        replacement: `  async resolvePlayback(request: StreamingPlaybackRequest): Promise<StreamingPlaybackSource> {
    // Native first: the Steam distribution ships no yt-dlp binary, and the
    // playurl API already returns audio-only DASH streams for the same video.
    const nativeSource = await resolveBilibiliAudioSource(request).catch(() => null);
    if (nativeSource) {
      return nativeSource;
    }

    const metadata = await ytDlpJson<unknown>(['--no-playlist', '-f', 'ba/bestaudio', resolvedTrackUrl(request.providerTrackId)]);`,
      },
    ],
  },
  {
    id: 'network-fetch-cookie-headers',
    file: 'src/main/network/networkFetch.ts',
    reason:
      'fetchWithNetworkProxy prefers Electron net.fetch, which runs on Chromium. Chromium treats Cookie ' +
      'as a forbidden request header, so the header is dropped and every cookie-authenticated platform ' +
      'call goes out anonymous: NetEase "I like" / account playlists answered account:null and threw ' +
      '"cannot read the NetEase account id", Bilibili favourites answered isLogin:false, while plain ' +
      'Node fetch with the very same cookie returned the account (verified in the running game: ' +
      'account.id 4897598320 through fetch/node:https, account:null through the helper). Requests that ' +
      'carry a cookie or authorization header therefore bypass Electron net.fetch; everything else keeps ' +
      'using it so ECHO\'s proxy and session handling stay in charge.',
    anchor: `  try {
    const electron = await import('electron');
    if (electron.app?.isReady?.() && electron.net?.fetch) {
      return electron.net.fetch(requestInput, initForElectronNetFetch(requestInput, safeInit));
    }
  } catch {`,
    replacement: `  const carriesCredentials = (() => {
    if (!safeInit?.headers) {
      return false;
    }
    try {
      const headers = new Headers(safeInit.headers as HeadersInit);
      return headers.has('cookie') || headers.has('authorization');
    } catch {
      return false;
    }
  })();

  try {
    const electron = await import('electron');
    if (!carriesCredentials && electron.app?.isReady?.() && electron.net?.fetch) {
      return electron.net.fetch(requestInput, initForElectronNetFetch(requestInput, safeInit));
    }
  } catch {`,
  },
];
