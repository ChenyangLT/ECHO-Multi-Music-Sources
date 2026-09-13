// Measures reliability of the two QQ search endpoints under repeated use, so the
// fallback strategy can be based on data rather than one lucky run.
const { app } = require('electron');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const headers = { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com', 'User-Agent': UA };
const queries = ['周杰伦', '晴天', 'Aimer', 'Yoasobi', '陈奕迅', '林俊杰'];

const legacy = async (query) => {
  const params = new URLSearchParams({ format: 'json', p: '1', n: '5', w: query, new_json: '1', t: '0' });
  const response = await fetch('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?' + params.toString(), { headers });
  const text = await response.text();
  const parsed = JSON.parse(text);
  return { status: response.status, songs: parsed?.data?.song?.list?.length ?? -1, total: parsed?.data?.song?.totalnum ?? null };
};

const musicu = async (query) => {
  const body = {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req_1: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: { query, page_num: 1, num_per_page: 5, search_type: 0 } },
  };
  const response = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = JSON.parse(await response.text());
  const song = parsed?.req_1?.data?.body?.song;
  return { status: response.status, req1: parsed?.req_1?.code ?? null, songs: song?.list?.length ?? -1, sum: parsed?.req_1?.data?.meta?.sum ?? null };
};

const run = async () => {
  let legacyOk = 0;
  let musicuOk = 0;
  for (const query of queries) {
    try {
      const result = await legacy(query);
      if (result.songs > 0) legacyOk += 1;
      console.log(`legacy "${query}": status=${result.status} songs=${result.songs} total=${result.total}`);
    } catch (error) {
      console.log(`legacy "${query}": THREW ${error.message}`);
    }
    try {
      const result = await musicu(query);
      if (result.songs > 0) musicuOk += 1;
      console.log(`musicu "${query}": status=${result.status} req1=${result.req1} songs=${result.songs} sum=${result.sum}`);
    } catch (error) {
      console.log(`musicu "${query}": THREW ${error.message}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  }
  console.log(`\nlegacy ok ${legacyOk}/${queries.length}, musicu ok ${musicuOk}/${queries.length}`);
  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
