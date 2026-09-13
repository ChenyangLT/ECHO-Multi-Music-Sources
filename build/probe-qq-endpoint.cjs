// Replicates the QQ Music provider's own search request so a platform-side
// rejection can be told apart from a parse-side bug.
const { app } = require('electron');

const body = {
  comm: { ct: '19', cv: '1859', uin: '0' },
  req_1: {
    module: 'music.search.SearchCgiService',
    method: 'DoSearchForQQMusicDesktop',
    param: { query: '周杰伦', page_num: 1, num_per_page: 3, search_type: 0 },
  },
};

const headers = {
  Referer: 'https://y.qq.com/',
  Origin: 'https://y.qq.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
};

const show = (label, value) => console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);

const run = async () => {
  for (const [label, url] of [
    ['musicu.fcg', 'https://u.y.qq.com/cgi-bin/musicu.fcg'],
    ['musicu (c.y)', 'https://c.y.qq.com/cgi-bin/musicu.fcg'],
  ]) {
    for (const [mode, init] of [
      ['POST-json', { method: 'POST', headers, body: JSON.stringify(body) }],
      ['GET-legacy', null],
    ]) {
      try {
        const target = mode === 'GET-legacy'
          ? `${url}?format=json&data=${encodeURIComponent(JSON.stringify(body))}`
          : url;
        const request = init || { method: 'GET', headers: { ...headers, 'Content-Type': undefined } };
        const response = await fetch(target, request);
        const text = await response.text();
        console.log(`\n[${label} / ${mode}] status=${response.status} len=${text.length}`);
        show('  head', text.slice(0, 260));
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        if (parsed) {
          const payload = parsed?.req_1?.data;
          const songData = payload?.body?.song;
          console.log(`  code=${parsed.code} req1code=${parsed.req_1?.code} songList=${songData?.list?.length ?? 'n/a'} totalnum=${songData?.totalnum ?? 'n/a'}`);
          console.log(`  meta=${JSON.stringify(payload?.meta)}`);
        }
      } catch (error) {
        console.log(`\n[${label} / ${mode}] THREW ${error?.message || error}`);
      }
    }
  }
  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
