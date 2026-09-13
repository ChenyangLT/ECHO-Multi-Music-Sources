// Verifies the song-background path: Bilibili MV search for a track, then
// resolving a playable stream URL for the best candidate.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const tracks = [
    { title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269 },
    { title: 'カタオモイ', artist: 'Aimer', duration: 245 },
  ];

  for (const track of tracks) {
    console.log(`\n=== MV search: ${track.artist} - ${track.title} ===`);
    let candidates = [];
    try {
      candidates = await bridge.findMvCandidates({ ...track, limit: 4 });
    } catch (error) {
      console.log(`findMvCandidates THREW: ${error?.message || error}`);
      continue;
    }
    console.log(`candidates=${candidates.length}`);
    for (const candidate of candidates) {
      console.log(`   ${candidate.title} | ${candidate.uploader} | score=${candidate.score} | views=${candidate.viewCount} | ${candidate.url}`);
    }

    const best = candidates[0];
    if (!best) continue;
    const bvid = String(best.id).replace(/^bilibili:/u, '');
    console.log(`resolving stream for ${bvid}...`);
    try {
      const stream = await bridge.resolveMvStream({ bvid, title: best.title });
      console.log(`  url=${String(stream.url).slice(0, 110)}`);
      console.log(`  quality=${stream.qualityLabel} ${stream.width}x${stream.height} mime=${stream.mimeType} duration=${stream.durationSeconds}`);
      console.log(`  headers=${JSON.stringify(stream.headers).slice(0, 160)}`);
    } catch (error) {
      console.log(`  resolveMvStream THREW: ${error?.message || error}`);
    }
  }

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
