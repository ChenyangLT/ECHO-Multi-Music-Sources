// Throwaway: what variants does the community MvService actually produce for a
// Bilibili MV? Determines whether the community acquisition path yields one
// complete file or DASH segments.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  bridge.mvRememberTrack({ id: 'streaming:netease:1', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, provider: 'netease', providerTrackId: '1' });
  const request = { trackId: 'streaming:netease:1', title: '晴天 周杰伦 MV', artist: '周杰伦', durationSeconds: 269, mediaType: 'streaming' };

  const candidates = await bridge.mvSearchNetworkCandidatesForSnapshot(request);
  console.log(`candidates: ${candidates.length}`);
  for (const candidate of candidates.slice(0, 3)) {
    console.log(`  ${candidate.score?.toFixed(2)} ${candidate.title} | ${candidate.uploader} | ${candidate.url}`);
  }

  const playable = await bridge.mvGetTemporaryPlayableForSnapshot(request);
  console.log('\nsnapshot playable:', JSON.stringify({
    id: playable?.id,
    provider: playable?.provider,
    qualityLabel: playable?.qualityLabel,
    selectedQualityId: playable?.selectedQualityId,
    mediaUrl: String(playable?.mediaUrl || '').slice(0, 110),
    width: playable?.width,
    height: playable?.height,
    playableInApp: playable?.playableInApp,
  }, null, 2));

  try {
    const resolved = await bridge.mvResolveStreams({ videoId: playable.id });
    const variants = Array.isArray(resolved?.variants) ? resolved.variants : [];
    console.log(`\nvariants: ${variants.length}`);
    for (const variant of variants.slice(0, 10)) {
      console.log(`  ${variant.label} | protocol=${variant.protocol} | playable=${variant.playableInApp} | mime=${variant.mimeType} | ${String(variant.url || '').slice(0, 90)}`);
    }
    console.log('selected:', JSON.stringify(resolved?.video ? { qualityLabel: resolved.video.qualityLabel, selectedQualityId: resolved.video.selectedQualityId, mediaUrl: String(resolved.video.mediaUrl || '').slice(0, 100) } : null));
  } catch (error) {
    console.log('resolveStreams THREW:', error.message);
  }

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
