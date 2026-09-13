// Confirms the legacy QQ payload maps through the provider's own mapper by
// reproducing the reshape the source patch applies.
const { app } = require('electron');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const headers = { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com', 'User-Agent': UA };

const asRecord = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const qqSongWrapperKeys = ['data', 'songInfo', 'songinfo', 'song', 'songData', 'musicData', 'track', 'info'];
const unwrap = (value) => {
  let record = asRecord(value);
  for (let index = 0; index < 5; index += 1) {
    const nested = qqSongWrapperKeys.map((key) => asRecord(record[key])).find((candidate) => Object.keys(candidate).length > 0);
    if (!nested) break;
    record = nested;
  }
  return record;
};

const run = async () => {
  const params = new URLSearchParams({ format: 'json', p: '1', n: '3', w: '周杰伦', new_json: '1', t: '0' });
  const response = await fetch('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?' + params.toString(), { headers });
  const parsed = JSON.parse(await response.text());
  const legacyData = asRecord(parsed.data);
  const legacySong = asRecord(legacyData.song);
  const raw = Array.isArray(legacySong.list) ? legacySong.list : [];
  console.log(`legacy songs=${raw.length}`);

  // Reshape exactly as the patch does.
  const reshaped = {
    req_1: {
      data: {
        body: {
          song: { list: raw.map((entry) => ({ song: entry })) },
        },
        meta: { sum: 999 },
      },
    },
  };

  const payload = asRecord(asRecord(reshaped.req_1).data);
  const bodyData = asRecord(payload.body);
  const songData = asRecord(bodyData.song);
  const songs = Array.isArray(songData.list) ? songData.list : [];
  console.log(`reshaped songs=${songs.length}`);
  for (const entry of songs) {
    const song = unwrap(entry);
    console.log(`  unwrapped mid=${text(song.mid)} name=${text(song.name)} keys=${Object.keys(song).slice(0, 6).join(',')}`);
  }

  // Show what unwrapping the raw entry would have produced.
  const rawUnwrapped = unwrap(raw[0]);
  console.log(`raw entry unwrapped keys=${Object.keys(rawUnwrapped).slice(0, 8).join(',')} mid=${text(rawUnwrapped.mid)}`);

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
