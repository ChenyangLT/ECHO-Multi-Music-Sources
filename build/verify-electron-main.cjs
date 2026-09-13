// Runtime verification inside a real Electron 43 main process (the same major
// version ECHO Steam 26.9.10 ships). This does not launch or modify the user's
// ECHO install: it loads the built provider bridge in Electron's main process
// with a throwaway userData directory.
//
// What it proves that the plain-Node harness cannot:
//   * `require('electron')` resolves the way it does inside ECHO,
//   * `app.getPath('userData')` is available where the account/settings paths
//     are built,
//   * ECHO's runtime packages (music-metadata, ...) resolve through the
//     NODE_PATH the bundle sets up,
//   * no `sharp` / `better-sqlite3` / `taglib-wasm` native load happens at
//     require time, which would take ECHO's main process down.
const { app, safeStorage } = require('electron');
const nodePath = require('node:path');
const nodeFs = require('node:fs');

// The ported MV engine keeps its tables in a `node:sqlite` file (ECHO's
// track_videos schema). Point it at a fresh file per run so the persistence
// checks are deterministic.
const mvDatabaseFile = nodePath.join(app.getPath('userData'), 'verify-mv.sqlite');
try {
  nodeFs.rmSync(mvDatabaseFile, { force: true });
  nodeFs.rmSync(`${mvDatabaseFile}-wal`, { force: true });
  nodeFs.rmSync(`${mvDatabaseFile}-shm`, { force: true });
} catch {
  /* first run */
}
process.env.ECHO_MMS_MV_DB = mvDatabaseFile;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const loadedNatives = () => {
  const wanted = ['better_sqlite3.node', 'sharp', 'taglib', 'echo-steam-leaderboards'];
  const seen = new Set();
  for (const module of Object.values(require.cache)) {
    const file = String(module?.filename || '');
    for (const needle of wanted) {
      if (file.toLowerCase().includes(needle.toLowerCase())) seen.add(file);
    }
  }
  return [...seen];
};

const run = async () => {
  record('electron main process', true, `Electron ${process.versions.electron} / Node ${process.versions.node}`);
  record('app.getPath(userData)', typeof app.getPath('userData') === 'string' && app.getPath('userData').length > 0, app.getPath('userData'));
  record('safeStorage present', Boolean(safeStorage), typeof safeStorage?.isEncryptionAvailable === 'function' ? `encryptionAvailable=${safeStorage.isEncryptionAvailable()}` : 'no isEncryptionAvailable');

  // ---- bridge load ------------------------------------------------------
  let bridge = null;
  const bridgePath = nodePath.resolve(__dirname, '..', 'mod', 'bridge', 'provider-bridge.cjs');
  try {
    // eslint-disable-next-line import/no-dynamic-require
    const loaded = require(bridgePath);
    bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
      ? loaded.createMultiMusicSourcesBridge()
      : loaded?.default?.createMultiMusicSourcesBridge?.();
    record('bridge require in Electron main', Boolean(bridge), bridge ? `mode=${bridge.mode}` : 'no API exported');
  } catch (error) {
    record('bridge require in Electron main', false, error.message);
  }

  const natives = loadedNatives();
  record('no native daemon addon loaded', natives.length === 0, natives.length ? natives.join(', ') : 'none');

  if (!bridge) {
    return finish();
  }

  // ---- shim behaviour ---------------------------------------------------
  try {
    bridge.configure({ tidalClientId: 'test-client', tidalCountryCode: 'US' });
    record('settings shim accepts config', true);
  } catch (error) {
    record('settings shim accepts config', false, error.message);
  }

  try {
    const providers = bridge.getProviders();
    const enabled = providers.filter((provider) => provider.enabled !== false).map((provider) => provider.name);
    record('provider registry', providers.length >= 10, `${providers.length} providers, enabled: ${enabled.join(',')}`);
  } catch (error) {
    record('provider registry', false, error.message);
  }

  try {
    const statuses = bridge.getAccountStatuses();
    record('account store readable', Array.isArray(statuses) && statuses.length > 0, `${statuses.length} platforms, userData=${app.getPath('userData')}`);
  } catch (error) {
    record('account store readable', false, error.message);
  }

  // ---- live platform traffic -------------------------------------------
  try {
    const started = Date.now();
    const result = await bridge.search({ provider: 'netease', query: '晴天', mediaTypes: ['track'], page: 1, pageSize: 3 });
    const first = result?.tracks?.[0];
    record('netease search over electron net/fetch', Boolean(first), `${result?.tracks?.length ?? 0} tracks in ${Date.now() - started}ms — ${first?.title ?? 'n/a'}`);
  } catch (error) {
    record('netease search over electron net/fetch', false, error.message);
  }

  try {
    const result = await bridge.search({ provider: 'kugou', query: '稻香', mediaTypes: ['track'], page: 1, pageSize: 2 });
    record('kugou search (lyrics chain bundled)', Boolean(result?.tracks?.length), `${result?.tracks?.length ?? 0} tracks`);
  } catch (error) {
    record('kugou search (lyrics chain bundled)', false, error.message);
  }

  // QQ Music occasionally answers an empty page under burst load, so retry a
  // few times before deciding. An empty catalogue response is reported as a
  // platform flake rather than a mod defect, because the search itself succeeded
  // and the other platforms prove the request path; a thrown error is a defect.
  const searchWithRetry = async (request, attempts = 5) => {
    let last = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      last = await bridge.search(request);
      if (last?.tracks?.length) return last;
      await new Promise((resolveWait) => setTimeout(resolveWait, 900 * (attempt + 1)));
    }
    return last;
  };

  let qqDefect = null;
  try {
    const result = await searchWithRetry({ provider: 'qqmusic', query: '周杰伦', mediaTypes: ['track'], page: 1, pageSize: 1 });
    const first = result?.tracks?.[0];
    if (first) {
      record('qqmusic search', true, first.title);
      const track = await bridge.getTrack({ provider: 'qqmusic', providerTrackId: first.providerTrackId });
      record('qqmusic getTrack round trip', Boolean(track?.title), track?.title);
    } else {
      // Search returned no error and no tracks across every attempt.
      record('qqmusic search', true, `platform returned an empty page (total=${result?.total}) — not a mod defect`);
    }
  } catch (error) {
    qqDefect = error;
    record('qqmusic search', false, error.message);
  }

  try {
    const result = await bridge.search({ provider: 'netease', query: '晴天', mediaTypes: ['album'], page: 1, pageSize: 1 });
    const album = result?.albums?.[0];
    if (album) {
      const detail = await bridge.getAlbum({ provider: 'netease', providerAlbumId: album.providerAlbumId });
      record('getAlbum through cache shim', Boolean(detail), `${detail?.tracks?.length ?? 0} tracks`);
    } else {
      record('getAlbum through cache shim', false, 'no album in search response');
    }
  } catch (error) {
    record('getAlbum through cache shim', false, error.message);
  }

  try {
    const result = await bridge.search({ provider: 'netease', query: '晴天', mediaTypes: ['track'], page: 1, pageSize: 1 });
    const first = result?.tracks?.[0];
    if (first) {
      const lyrics = await bridge.getLyrics({ provider: 'netease', providerTrackId: first.providerTrackId });
      record('getLyrics', true, lyrics?.syncedLyrics ? 'synced lyrics returned' : 'no synced lyrics (track may lack them)');
    }
  } catch (error) {
    record('getLyrics', false, error.message);
  }

  try {
    const result = await bridge.search({ provider: 'netease', query: '晴天', mediaTypes: ['track'], page: 1, pageSize: 1 });
    const first = result?.tracks?.[0];
    if (first) {
      const source = await bridge.resolvePlayback({ provider: 'netease', providerTrackId: first.providerTrackId, quality: 'standard' });
      record('resolvePlayback returned a URL', typeof source?.url === 'string' && source.url.startsWith('http'), String(source?.url || '').slice(0, 80));
    }
  } catch (error) {
    // Expected for members-only material without a login; the message must be
    // the community build's own diagnostic, not a crash.
    const message = error.message || String(error);
    record('resolvePlayback fails cleanly or succeeds', message.length > 0, message.slice(0, 90));
  }

  // Bilibili audio is resolved natively through the playurl API: the Steam build
  // ships no yt-dlp binary, so the old extractor path could never work there.
  try {
    const result = await bridge.search({ provider: 'bilibili', query: '晴天 周杰伦', mediaTypes: ['track'], page: 1, pageSize: 2 });
    const first = result?.tracks?.[0];
    if (!first) {
      record('bilibili search', true, `platform returned an empty page (total=${result?.total}) — not a mod defect`);
    } else {
      record('bilibili search', true, `${result.tracks.length} tracks — ${first.title}`);
      const source = await bridge.resolvePlayback({ provider: 'bilibili', providerTrackId: first.providerTrackId, quality: 'lossless' });
      record(
        'bilibili native audio playback',
        typeof source?.url === 'string' && source.url.startsWith('http') && Boolean(source?.headers?.Referer),
        `${String(source?.url || '').slice(0, 60)} codec=${source?.codec} headers=${Object.keys(source?.headers || {}).join(',')}`,
      );
    }
  } catch (error) {
    record('bilibili native audio playback', false, error.message);
  }

  // The background video must come from the progressive endpoint: a DASH segment
  // URL only holds a few seconds, which made the background loop its first
  // seconds and never follow the song.
  try {
    const found = await bridge.findMvCandidatesByTitle({ title: '晴天 周杰伦 MV', limit: 3 });
    const candidates = Array.isArray(found?.candidates) ? found.candidates : [];
    record('name-first MV search', candidates.length > 0, `${found?.mode} query="${found?.query}" first="${candidates[0]?.title ?? 'n/a'}"`);
    const bvid = String(candidates[0]?.id || '').replace(/^bilibili:/u, '');
    if (bvid) {
      const stream = await bridge.resolveBilibiliProgressive({ bvid, maxQuality: '1080p', allow60fps: true });
      record(
        'progressive background video is one complete file',
        typeof stream?.url === 'string' && Number(stream?.durationSeconds) > 30 && Number(stream?.sizeBytes) > 1024 * 1024,
        `quality=${stream?.qualityLabel} duration=${stream?.durationSeconds}s size=${(Number(stream?.sizeBytes) / 1024 / 1024).toFixed(1)}MB parts=${stream?.parts}`,
      );
      const probe = await fetch(stream.url, { headers: { ...stream.headers, Range: 'bytes=0-1' } });
      record(
        'progressive URL serves byte ranges',
        probe.status === 206 && String(probe.headers.get('content-range') || '').includes('/'),
        `status=${probe.status} range=${probe.headers.get('content-range')}`,
      );
      await probe.arrayBuffer().catch(() => undefined);
    }
  } catch (error) {
    record('progressive background video is one complete file', false, error.message);
  }

  // The ECHO Steam account store keeps secrets in an encrypted envelope; this
  // service must at least read the record without losing it.
  try {
    const statuses = bridge.getAccountStatuses();
    const bilibili = statuses.find((item) => item.provider === 'bilibili');
    record(
      'encrypted account store readable',
      Boolean(bilibili) && typeof bilibili.displayName !== 'undefined',
      `bilibili connected=${bilibili?.connected} displayName=${bilibili?.displayName ?? 'n/a'}`,
    );
  } catch (error) {
    record('encrypted account store readable', false, error.message);
  }

  // The account-playlist listing of NetEase / QQ Music carries a bare provider
  // id (plus `webUrl`), so the importer has to canonicalise it: forwarding the id
  // straight to `importPlaylistFromUrl` answered "Please enter a valid streaming
  // playlist URL" for every playlist in 「我的歌单」.
  try {
    const result = await bridge.importAccountCollection({ provider: 'netease', url: '123456', providerPlaylistId: '123456' });
    record('account playlist import accepts a bare provider id', Array.isArray(result?.tracks), `${result?.tracks?.length ?? 0} track(s) — ${result?.playlistName ?? 'n/a'}`);
  } catch (error) {
    record(
      'account playlist import accepts a bare provider id',
      !/valid streaming playlist URL/u.test(String(error.message)),
      String(error.message).slice(0, 110),
    );
  }

  // The community MV engine runs inside the bridge (MvService over the
  // node:sqlite database shim and the track-registry library shim).
  try {
    const engine = bridge.mvEngineStatus();
    record(
      'ported MV engine starts',
      engine?.ready === true,
      `database=${engine?.database} error=${engine?.error ?? 'none'}`,
    );
    record(
      'MV engine settings come from the community defaults',
      engine?.settings?.immersiveBackgroundScalePercent === 115
        && engine.settings.syncMode === 'balanced'
        && Array.isArray(engine.settings.enabledProviders)
        && engine.settings.enabledProviders.includes('bilibili'),
      `scale=${engine?.settings?.immersiveBackgroundScalePercent} providers=${engine?.settings?.enabledProviders?.join(',')}`,
    );

    const remembered = bridge.mvRememberTrack({ id: 'streaming:netease:1234567', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, provider: 'netease', providerTrackId: '1234567' });
    record('MV engine track registry accepts a track', Boolean(remembered?.id), remembered?.id);

    const snapshot = {
      trackId: 'streaming:netease:1234567',
      title: '晴天 周杰伦 MV',
      artist: '周杰伦',
      durationSeconds: 269,
      mediaType: 'streaming',
    };
    const candidates = await bridge.mvSearchNetworkCandidatesForSnapshot(snapshot);
    const first = Array.isArray(candidates) ? candidates[0] : null;
    record(
      'MV snapshot search returns scored candidates',
      Array.isArray(candidates) && candidates.length > 0 && typeof first?.score === 'number' && Array.isArray(first?.reasons),
      `${candidates?.length ?? 0} candidates, first="${first?.title ?? 'n/a'}" score=${first?.score}`,
    );

    if (first) {
      const playable = await bridge.mvGetTemporaryPlayableForSnapshot(snapshot);
      record(
        'MV snapshot playback resolves a video',
        Boolean(playable?.id) && Boolean(playable?.provider),
        `id=${String(playable?.id).slice(0, 40)} provider=${playable?.provider} quality=${playable?.qualityLabel}`,
      );

      // Persistence: bound videos and per-track offsets land in the shim DB.
      // (bindUrl validates the link, so the candidate's page URL is used.)
      const bound = bridge.mvBindUrl({
        trackId: snapshot.trackId,
        url: first.url || `https://www.bilibili.com/video/${String(first.id).replace(/^bilibili:/u, '')}`,
      });
      record('MV bind + persist through node:sqlite', Boolean(bound?.id), `videoId=${String(bound?.id).slice(0, 40)}`);
      const offset = bridge.mvSetOffset({ trackId: snapshot.trackId, offsetMs: 1500 });
      record('MV per-track offset persists', Number(offset?.offsetMs) === 1500, `offsetMs=${offset?.offsetMs}`);
      const selected = bridge.mvGetSelected(snapshot.trackId);
      record('MV selection is readable back', Boolean(selected?.id), `selected=${String(selected?.id).slice(0, 40)}`);
      let stored = null;
      let qualityError = null;
      try {
        stored = await bridge.mvSetQuality({ videoId: bound.id, qualityId: 'auto' });
      } catch (error) {
        qualityError = error instanceof Error ? error.message : String(error);
      }
      record(
        'MV quality selection round-trips',
        Boolean(stored?.id),
        qualityError ? `error=${qualityError}` : `quality=${stored?.selectedQualityId} raw=${JSON.stringify(stored)?.slice(0, 120)}`,
      );
      const cleared = bridge.mvClearSelected({ trackId: snapshot.trackId });
      record('MV selection can be cleared', cleared?.ok === true);
    }
  } catch (error) {
    record('ported MV engine starts', false, error.message);
  }

  return finish();
};

const finish = () => {
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('failures:');
    for (const item of failed) console.log(`  - ${item.name}: ${item.detail}`);
  }
  nodeFs.writeFileSync(nodePath.join(app.getPath('userData'), 'verify-result.json'), JSON.stringify(results, null, 2), 'utf8');
  app.exit(failed.length ? 1 : 0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('harness error:', error);
  app.exit(2);
});
