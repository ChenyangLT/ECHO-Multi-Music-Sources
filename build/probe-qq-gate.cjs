// 1) Is QQ Music's `code 2001` gate throttling (recovers over time) or a hard
//    login gate? Poll it slowly.
// 2) Capture the legacy `client_search_cp` response shape so a fallback mapper
//    can be written against real data.
const { app } = require('electron');
const nodePath = require('node:path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const headers = { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com', 'User-Agent': UA };
const musicuUrl = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

const body = {
  comm: { ct: '19', cv: '1859', uin: '0' },
  req_1: {
    module: 'music.search.SearchCgiService',
    method: 'DoSearchForQQMusicDesktop',
    param: { query: '周杰伦', page_num: 1, num_per_page: 3, search_type: 0 },
  },
};

const probeMusicu = async () => {
  const response = await fetch(musicuUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = JSON.parse(await response.text());
  const song = parsed?.req_1?.data?.body?.song;
  return { status: response.status, code: parsed?.code, req1: parsed?.req_1?.code, songs: song?.list?.length ?? -1, sum: parsed?.req_1?.data?.meta?.sum ?? null };
};

const probeLegacy = async () => {
  const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=3&w=' + encodeURIComponent('周杰伦') + '&new_json=1';
  const response = await fetch(url, { headers });
  const parsed = JSON.parse(await response.text());
  const song = parsed?.data?.song;
  const first = song?.list?.[0];
  return { status: response.status, songs: song?.list?.length ?? -1, total: song?.totalnum ?? null, first };
};

const run = async () => {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      console.log(`musicu attempt ${attempt}: ${JSON.stringify(await probeMusicu())}`);
    } catch (error) {
      console.log(`musicu attempt ${attempt}: THREW ${error.message}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 8000));
  }

  console.log('\n=== legacy client_search_cp shape ===');
  try {
    const result = await probeLegacy();
    console.log(`status=${result.status} songs=${result.songs} total=${result.total}`);
    const first = result.first;
    if (first) {
      console.log('song keys:', Object.keys(first).join(','));
      console.log('mid:', first.mid, '| id:', first.id, '| name:', first.name, '| title:', first.title);
      console.log('interval:', first.interval, '| album:', JSON.stringify(first.album));
      console.log('singer:', JSON.stringify(first.singer));
      console.log('file:', JSON.stringify(first.file));
      console.log('pay:', JSON.stringify(first.pay));
      console.log('raw sample:', JSON.stringify(first).slice(0, 1400));
    }
  } catch (error) {
    console.log(`legacy THREW ${error.message}`);
  }

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
