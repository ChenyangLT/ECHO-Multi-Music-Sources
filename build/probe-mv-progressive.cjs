// Verifies the progressive (non-DASH) background video path: a complete MP4 with
// a real duration, verified bytes and range support — the path that replaced the
// DASH segment URLs which looped their first seconds.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const tracks = [
    { title: '晴天 周杰伦 MV', limit: 3 },
    { title: 'カタオモイ Aimer MV', limit: 2 },
  ];

  for (const request of tracks) {
    console.log(`\n=== name search: ${request.title} ===`);
    let candidates = [];
    try {
      const result = await bridge.findMvCandidatesByTitle(request);
      candidates = result?.candidates || [];
      console.log(`mode=${result?.mode} query=${result?.query} candidates=${candidates.length}`);
      for (const candidate of candidates) {
        console.log(`   ${candidate.id} | ${candidate.title} | ${candidate.uploader}`);
      }
    } catch (error) {
      console.log(`findMvCandidatesByTitle THREW: ${error?.message || error}`);
      continue;
    }

    const best = candidates[0];
    if (!best) continue;
    const bvid = String(best.id).replace(/^bilibili:/u, '');
    console.log(`progressive resolve for ${bvid}...`);
    try {
      const stream = await bridge.resolveBilibiliProgressive({ bvid, maxQuality: '1080p', allow60fps: true });
      console.log(`  quality=${stream.qualityLabel} qn=${stream.quality} duration=${stream.durationSeconds}s size=${(Number(stream.sizeBytes) / 1024 / 1024).toFixed(1)}MB signedIn=${stream.signedIn}`);
      console.log(`  url=${String(stream.url).slice(0, 100)}`);
      console.log(`  tried=${JSON.stringify(stream.tried)}`);

      const probe = await fetch(stream.url, { headers: { ...stream.headers, Range: 'bytes=0-1' } });
      console.log(`  probe: status=${probe.status} range=${probe.headers.get('content-range')} type=${probe.headers.get('content-type')} accept=${probe.headers.get('accept-ranges')}`);
      await probe.arrayBuffer().catch(() => undefined);
      const mid = await fetch(stream.url, { headers: { ...stream.headers, Range: 'bytes=1000000-1000001' } });
      console.log(`  mid-range probe: status=${mid.status} range=${mid.headers.get('content-range')}`);
      await mid.arrayBuffer().catch(() => undefined);
    } catch (error) {
      console.log(`  resolveBilibiliProgressive THREW: ${error?.message || error}`);
    }
  }

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
