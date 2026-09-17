// Renderer verification: runs mod/mod.js in a minimal DOM shim with a stubbed
// echoExternalMod, exercising the page render, search flow, playback calls and
// error surfacing — the parts a main-process harness cannot reach.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const buildRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(process.env.ECHO_MMS_PACKAGE_ROOT || join(buildRoot, '..', 'mod'));

// ---- minimal DOM ---------------------------------------------------------

class ClassList {
  constructor() { this.items = new Set(); }
  add(...names) { for (const name of names) this.items.add(name); }
  remove(...names) { for (const name of names) this.items.delete(name); }
  toggle(name, force) {
    const on = force === undefined ? !this.items.has(name) : Boolean(force);
    if (on) this.items.add(name); else this.items.delete(name);
    return on;
  }
  contains(name) { return this.items.has(name); }
  toString() { return [...this.items].join(' '); }
}

class StyleDeclaration {
  constructor() {
    this.cssText = '';
    this.properties = new Map();
  }
  setProperty(name, value) { this.properties.set(String(name), String(value)); }
  getPropertyValue(name) { return this.properties.get(String(name)) ?? ''; }
  removeProperty(name) { this.properties.delete(String(name)); }
}

class Element {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.classList = new ClassList();
    this.dataset = {};
    this.style = new StyleDeclaration();
    this.attributes = {};
    this._text = '';
    this.listeners = new Map();
    this.value = '';
    this.type = '';
    this.placeholder = '';
    this.title = '';
    this.disabled = false;
    this.tabIndex = 0;
    this.loading = '';
    this.src = '';
    this.alt = '';
    this.id = '';
    this.muted = false;
    this.loop = false;
    this.autoplay = false;
    this.playsInline = false;
    this.crossOrigin = null;
    this.paused = true;
    this._innerHTML = '';
  }

  /** Walks to the root so `isConnected` behaves like the real DOM. */
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === documentShim.body || node === documentShim.head || node.tagName === 'HTML';
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); }
  get outerHTML() { return `<${this.tagName.toLowerCase()} class="${this.className}">`; }

  // Faithful enough for the background layer: play/pause flip `paused` and
  // `readyState`, and load() resets both (per spec), which is what makes a stalled
  // source distinguishable from a running one.
  play() { this.paused = false; this.readyState = 4; this.dispatch('playing'); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatch('pause'); }
  load() { this.paused = true; this.readyState = 0; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }

  get className() { return this.classList.toString(); }
  set className(value) {
    this.classList.items = new Set(String(value).split(/\s+/u).filter(Boolean));
  }

  get textContent() {
    if (this.children.length) return this.children.map((child) => child.textContent).join('');
    return this._text;
  }
  set textContent(value) {
    this._text = value === null || value === undefined ? '' : String(value);
    this.children = [];
    this.childNodes = this.children;
  }

  /** Detaches from the current parent, so append/insertBefore behave like the DOM. */
  detach() {
    const parent = this.parentNode;
    if (!parent?.children) return;
    parent.children = parent.children.filter((child) => child !== this);
    parent.childNodes = parent.children;
  }

  get nextElementSibling() {
    const parent = this.parentNode;
    if (!parent?.children) return null;
    const index = parent.children.indexOf(this);
    if (index < 0) return null;
    return parent.children[index + 1] ?? null;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node === null || node === undefined) continue;
      const child = typeof node === 'string' ? new Element('#text') : node;
      if (typeof node === 'string') child.textContent = node;
      child.detach();
      child.parentNode = this;
      this.children.push(child);
    }
    this.childNodes = this.children;
  }

  appendChild(node) { this.append(node); return node; }

  insertBefore(node, reference) {
    const child = typeof node === 'string' ? new Element('#text') : node;
    if (typeof node === 'string') child.textContent = node;
    const index = reference ? this.children.indexOf(reference) : -1;
    child.detach();
    child.parentNode = this;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    this.childNodes = this.children;
    return child;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.childNodes = this.children;
    // A real scroll container clamps its offset when the content is removed, which
    // is why replacing a panel's children throws the user back to the top.
    if (Number(this.scrollTop) > 0) this.scrollTop = 0;
    this.append(...nodes);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode.childNodes = this.parentNode.children;
    this.parentNode = null;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }
  dispatch(type, event = {}) {
    const payload = { type, preventDefault() {}, stopPropagation() {}, ...event };
    for (const handler of this.listeners.get(type) || []) handler(payload);
  }
  click() { this.dispatch('click'); }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const raw = String(selector).trim();
    // Support the ":scope > .child" form used to find direct children.
    const scoped = raw.startsWith(':scope >');
    const simple = scoped ? raw.slice(':scope >'.length).trim() : raw;
    const matches = [];
    const walk = (node, depth) => {
      for (const child of node.children) {
        if (matchSelector(child, simple) && (!scoped || depth === 0)) matches.push(child);
        if (!scoped) walk(child, depth + 1);
      }
    };
    walk(this, 0);
    return matches;
  }

  /** Depth-first text collection, used to assert what the user would read. */
  allText() {
    const parts = [];
    const walk = (node) => {
      if (node._text) parts.push(node._text);
      for (const child of node.children) walk(child);
    };
    walk(this);
    return parts.join(' ').replace(/\s+/gu, ' ').trim();
  }
}

const matchSelector = (element, selector) => {
  const simple = selector.trim();
  if (simple.startsWith('.')) return element.classList.contains(simple.slice(1));
  if (simple.startsWith('#')) return element.id === simple.slice(1);
  const attr = simple.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/u);
  if (attr) {
    const [, name, expected] = attr;
    const actual = element.attributes[name];
    if (actual === undefined) return false;
    return expected === undefined ? true : actual === expected;
  }
  return element.tagName === simple.toUpperCase();
};

const documentShim = {
  createElement: (tag) => new Element(tag),
  head: new Element('head'),
  body: new Element('body'),
  // Delegate real queries to the body so the page can find ECHO's DOM.
  querySelector: (selector) => documentShim.body.querySelector(selector),
  querySelectorAll: (selector) => documentShim.body.querySelectorAll(selector),
  addEventListener() {},
  removeEventListener() {},
};

// The song-background feature is scoped to ECHO's lyrics page and its toggle
// lives in the player transport, so both are mounted before the page boots.
// The app's own `.lyrics-backdrop` is part of the fixture because the background
// layer has to be inserted *after* it (it is `isolation:isolate` +
// `contain:paint`, so a z-index:-1 layer would never be visible).
const lyricsPage = new Element('div');
lyricsPage.className = 'lyrics-page';
const lyricsBackdrop = new Element('div');
lyricsBackdrop.className = 'lyrics-backdrop';
lyricsPage.append(lyricsBackdrop);
const transportBar = new Element('div');
transportBar.className = 'transport';
const lyricsButton = new Element('button');
lyricsButton.className = 'icon-button transport-media-button transport-lyrics-button';
transportBar.append(lyricsButton);
const transportShell = new Element('div');
transportShell.className = 'player-transport-shell';
transportShell.append(transportBar);
documentShim.body.append(lyricsPage, transportShell);

// ---- loader SDK stub ----------------------------------------------------

const calls = [];
let sidebarPage = null;
// Every sidebar entry the mod registers (the audio page and the MV page).
const sidebarPages = [];
let mainResponses = {
  // The mod polls status() until the bridge reports ready before it loads
  // providers, so the default stub must look like a healthy bridge.
  status: { ok: true, result: { bridgeReady: true, bridgeError: null, mode: 'community-provider-bridge' } },
  providers: {
    ok: true,
    result: [
      { name: 'netease', displayName: 'NetEase', enabled: true, supportsSearch: true, supportsPlayback: true, requiresAccount: false },
      { name: 'qqmusic', displayName: 'QQ Music', enabled: true, supportsSearch: true, supportsPlayback: true, requiresAccount: false },
      { name: 'bilibili', displayName: 'Bilibili', enabled: true, supportsSearch: true, supportsPlayback: true, requiresAccount: false },
    ],
  },
  accountStatuses: { ok: true, result: [] },
  // The signed-in identity the account page renders (avatar / nickname / uid).
  accountProfiles: {
    ok: true,
    result: [
      { provider: 'netease', connected: false, displayName: null, username: null, avatarUrl: null, lastCheckedAt: null, error: null },
      { provider: 'qqmusic', connected: false, displayName: null, username: null, avatarUrl: null, lastCheckedAt: null, error: null },
      {
        provider: 'bilibili',
        connected: true,
        displayName: '测试账号',
        username: '10086',
        avatarUrl: 'https://example.invalid/avatar.jpg',
        vipLabel: 'VIP',
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ],
  },
  qrLoginCapabilities: { ok: true, result: { qrImage: ['netease', 'bilibili', 'qqmusic'], loginWindow: ['netease', 'qqmusic', 'kugou', 'bilibili'] } },
};

const invokeMain = async (method, payload) => {
  calls.push({ method, payload });
  const handler = mainResponses[method];
  const methodResult = typeof handler === 'function' ? await handler(payload) : (handler ?? { ok: true, result: null });
  // Model the loader's real transport: the loader server wraps the native
  // host's response, and the native host wraps the method's own envelope.
  return { ok: true, result: methodResult };
};

const playerCalls = [];
let playerStatusCalls = 0;
const player = {
  queue: () => ({ items: [] }),
  status: async () => { playerStatusCalls += 1; return { state: 'idle' }; },
  playTrack: async (track, options) => { playerCalls.push({ kind: 'playTrack', track, options }); return { ok: true }; },
  append: (track, source) => { playerCalls.push({ kind: 'append', track, source }); return { ok: true }; },
  replaceQueue: (tracks, options) => { playerCalls.push({ kind: 'replaceQueue', tracks, options }); return { ok: true }; },
};

let disposedCss = 0;
let disposedSidebar = 0;
// The injected stylesheet, so the MV layer's visibility contract can be asserted.
let injectedCss = '';
const toasts = [];
const settingsSaves = [];
// ECHO switches routes with window CustomEvents, so the harness records what the
// page dispatches (e.g. the transport MV button opening the song detail page).
const navEvents = [];

class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail ?? null;
    this.defaultPrevented = false;
  }
  preventDefault() { this.defaultPrevented = true; }
}

const echoExternalMod = {
  version: 1,
  manifest: { name: 'ECHO Multi Music Sources', version: '1.0.0' },
  config: {
    locale: 'zh-CN',
    defaultProvider: 'netease',
    defaultQuality: 'lossless',
    pageSize: 30,
    hideUnavailable: false,
    showProviderBadges: true,
    playlistViewMode: 'grid',
    interceptPlayback: true,
    songBackgroundEnabled: false,
    songBackgroundMinScore: 0.55,
    // The mv* defaults mod/config.json ships (the loader merges them in).
    mvEnabled: true,
    mvAutoSearch: true,
    mvAutoPreload: true,
    mvAutoApplyThreshold: 0.7,
    mvTitleOnlySearch: false,
    mvSearchSuffix: 'MV',
    mvPreferHighestViewCount: true,
    mvImmersiveBackground: true,
    mvImmersiveBackgroundAutoScale: true,
    mvImmersiveBackgroundScalePercent: 115,
    mvImmersiveBackgroundOffsetXPercent: 50,
    mvImmersiveBackgroundOffsetYPercent: 50,
    mvImmersiveBackgroundBlurPx: 0,
    mvImmersiveBackgroundBrightnessPercent: 100,
    mvImmersiveBackgroundOverlayOpacityPercent: 0,
    mvLyricsReadabilityEnhanced: false,
    mvHideLyrics: false,
    mvRestartAudioOnLoad: true,
    mvSyncMode: 'balanced',
    mvReplayAudioOnChange: true,
    mvMaxQuality: 'max',
    mvAllow60fps: true,
    mvMatchMode: 'first',
    mvSourceMode: 'engine',
  },
  echo: { playback: { playMediaItem: async () => ({ ok: true }) } },
  player,
  main: { invoke: invokeMain },
  extend: {
    css: (id, cssText) => {
      calls.push({ method: 'extend.css', payload: { id, length: cssText.length } });
      injectedCss = cssText;
      return () => { disposedCss += 1; };
    },
  },
  sidebar: {
    register: (page) => {
      sidebarPages.push(page);
      if (!sidebarPage) sidebarPage = page;
      calls.push({ method: 'sidebar.register', payload: { id: page?.id } });
      return () => { disposedSidebar += 1; };
    },
  },
  loaderSettings: {
    get: async () => ({ accentColor: '', density: 'comfortable' }),
    onChange: () => () => {},
  },
  settings: {
    set: (patch) => { settingsSaves.push(patch); },
  },
  toast: (message) => toasts.push(message),
  log: () => {},
  console: { debug() {}, info() {}, log() {}, warn() {}, error() {} },
};

// ---- run mod.js ---------------------------------------------------------

const source = readFileSync(join(packageRoot, 'mod.js'), 'utf8');
const sandbox = {
  echoExternalMod,
  window: {
    echo: {},
    __echoExternalPlayer: null,
    innerWidth: 1200,
    innerHeight: 800,
    open: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent(event) { navEvents.push(event); return true; },
  },
  CustomEvent,
  navigator: { clipboard: { writeText: async () => {} } },
  document: documentShim,
  requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  console,
  URL,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  Promise,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Set,
  Map,
  JSON,
  Error,
  RegExp,
  Date,
  isFinite,
  parseFloat,
  parseInt,
};
sandbox.globalThis = sandbox;

// `let`: the background/MV section renders the mod's second sidebar page into its
// own shell and points the assertions at it, then restores the audio page.
let pageRoot = new Element('div');
vm.createContext(sandbox);
// mod.js is the body of an async loader function: it may use `return`, so it is
// compiled as one. The body executes immediately, which is what we want here.
const script = new vm.Script(`(async () => {\n${source}\n})()`, { filename: 'mod.js' });

const settle = async (times = 6) => {
  for (let index = 0; index < times; index += 1) await new Promise((resolveWait) => setTimeout(resolveWait, 25));
};

/** Polls until a predicate holds, so timers never decide a pass/fail. */
const waitFor = async (predicate, label, timeoutMs = 4000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  console.log(`[debug] waitFor timed out: ${label}`);
  return false;
};

let failures = 0;
let cleanup = null;

const check = (name, passed, detail) => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
};

const run = async () => {
  const pending = script.runInContext(sandbox);
  await settle(2);
  check('mod.js evaluates as an async function body', typeof (await pending) === 'function', 'returned a cleanup function');
  cleanup = await pending;

  check('sidebar page registered', Boolean(sidebarPage), sidebarPage ? `id=${sidebarPage.id} label=${sidebarPage.label}` : 'none');
  check('page css injected', calls.some((call) => call.method === 'extend.css'), `${calls.find((call) => call.method === 'extend.css')?.payload?.length ?? 0} bytes`);

  // The MV background is opt-in: the package ships it switched off, so a fresh
  // install never goes online for a music video until the user lights the button.
  const shippedConfig = JSON.parse(readFileSync(join(packageRoot, 'config.json'), 'utf8'));
  check(
    'the shipped default keeps the MV background off',
    shippedConfig.mvEnabled === false && shippedConfig.songBackgroundEnabled === false,
    `mvEnabled=${shippedConfig.mvEnabled} songBackgroundEnabled=${shippedConfig.songBackgroundEnabled}`,
  );

  // The transport switch reports the SETTING, not the playback moment: lit while
  // the background is enabled, dimmed while it is off.
  check(
    'the transport MV button is styled lit while on and dimmed while off',
    /\.mms-backdrop-toggle\.mms-backdrop-toggle\[data-active="false"\]\{[^}]*opacity:\.66/u.test(injectedCss)
      && /\.mms-backdrop-toggle\.mms-backdrop-toggle\[data-active="true"\]\{[^}]*color:var\(--theme-accent-text-strong/u.test(injectedCss),
    'dimmed + lit declarations found',
  );

  // The MV layer's visibility contract, mirroring ECHO-main's own background
  // wrapper: it appears when the layer OWNS A STREAM, and the app's backdrop hands
  // over on that same condition. Keying either on a playback label is what made an
  // MV that was loading (or whose label an expiring notice restored) invisible
  // until the player-bar switch was toggled by hand.
  check(
    'the MV layer is revealed by owning a stream, not by a playback label',
    /\.mms-lyrics-bg\[data-source="ready"\]\{opacity:1\}/u.test(injectedCss)
      && !/\.mms-lyrics-bg\[data-playing="true"\]\{opacity:1\}/u.test(injectedCss)
      && !/\.mms-lyrics-bg\[data-state="playing"\]\{opacity:1\}/u.test(injectedCss),
    `source=${/\[data-source="ready"\]\{opacity:1\}/u.test(injectedCss)} playing-gate=${/\[data-playing="true"\]\{opacity:1\}/u.test(injectedCss)}`,
  );
  check(
    'the app backdrop hands over as soon as the layer owns a stream',
    /:has\(> \.mms-lyrics-bg\[data-source="ready"\]\) > \.lyrics-backdrop\{background:transparent\}/u.test(injectedCss),
    'declaration found',
  );

  // Mount the page the way the loader does.
  sidebarPage.render(pageRoot, { toast: (message) => toasts.push(message), echo: {}, config: echoExternalMod.config });
  await waitFor(() => calls.some((call) => call.method === 'providers'), 'providers loaded');
  await settle(3);

  const text = pageRoot.allText();
  check('page renders title', text.includes('多平台音源'), text.slice(0, 70));
  check('bridge status polled', calls.some((call) => call.method === 'status'), `${calls.filter((call) => call.method === 'status').length} status calls`);
  check('providers loaded before first render', calls.some((call) => call.method === 'providers'));

  // --- navigation: 我的歌单 is the landing page, 背景设置 lives elsewhere ----
  const tabLabels = () => pageRoot.querySelectorAll('.mms-nav-tab').map((tab) => tab.textContent);
  const clickTab = async (label) => {
    pageRoot.querySelectorAll('.mms-nav-tab').find((tab) => tab.textContent === label)?.click();
    await settle(2);
  };
  check(
    'the mod page opens on 我的歌单',
    tabLabels().join('|') === '我的歌单|搜索|账号' && Boolean(pageRoot.querySelector('.mms-daily')) && !pageRoot.querySelector('.mms-search'),
    `tabs=${tabLabels().join(',')} daily=${Boolean(pageRoot.querySelector('.mms-daily'))}`,
  );
  check(
    '背景设置 and 每日推荐 are no longer nav tabs',
    !tabLabels().some((label) => label.includes('背景') || label.includes('每日推荐')),
    tabLabels().join(','),
  );
  check(
    'the active tab is marked with the native underline idiom',
    pageRoot.querySelectorAll('.mms-nav-tab')[0]?.classList.contains('is-active')
      && /\.mms-nav-tab\.is-active:after\{/u.test(injectedCss),
    `active=${pageRoot.querySelectorAll('.mms-nav-tab')[0]?.className}`,
  );
  check(
    'the 歌单 page shows one sign-in hint and no provider status text',
    Boolean(pageRoot.querySelector('.mms-login-hint')) && !pageRoot.querySelector('.mms-chip-state'),
    `hint=${Boolean(pageRoot.querySelector('.mms-login-hint'))} states=${pageRoot.querySelectorAll('.mms-chip-state').length}`,
  );
  const goLogin = pageRoot.querySelector('.mms-login-hint')?.querySelector('.mms-primary');
  check('the sign-in hint offers 去登录', goLogin?.textContent === '去登录', goLogin?.textContent);
  goLogin?.click();
  await settle(2);
  check('去登录 switches to the 账号 tab', Boolean(pageRoot.querySelector('.mms-accounts')), tabLabels().join(','));
  // The chosen tab is remembered for the rest of the session: re-mounting the page
  // (ECHO does that on every route change) keeps it.
  sidebarPage.render(pageRoot, { toast: (message) => toasts.push(message), echo: {}, config: echoExternalMod.config });
  await settle(2);
  check('the tab is remembered for the session', Boolean(pageRoot.querySelector('.mms-accounts')), tabLabels().join(','));
  await clickTab('搜索');
  check('the 搜索 tab opens the search view', Boolean(pageRoot.querySelector('.mms-search')), tabLabels().join(','));
  check(
    'the narrow-window provider dropdown is in the stylesheet',
    /@media \(max-width:1100px\)\{\.mms-providers\{display:none\}\s*\.mms-providers-select\{display:block/u.test(injectedCss),
    'media query found',
  );

  // --- error surfacing (regression: { ok:false, error } without `result`) ---
  const failureText = 'Unsupported music platform: nope';
  mainResponses.search = { ok: false, error: failureText };
  const input = await waitFor(() => pageRoot.querySelector('.mms-search-input'), 'search input') && pageRoot.querySelector('.mms-search-input');
  check('search input rendered', Boolean(input));
  if (input) {
    input.value = '晴天';
    input.dispatch('input');
    pageRoot.querySelector('.mms-search').dispatch('submit');
    await waitFor(() => pageRoot.allText().includes(failureText), 'error banner');
    const errorText = pageRoot.allText();
    check('RPC error message reaches the UI', errorText.includes(failureText), errorText.includes(failureText) ? failureText : errorText.slice(0, 140));
  }

  // --- successful search + playback wiring ---------------------------------
  mainResponses.accountStatuses = { ok: true, result: [{ provider: 'netease', connected: true, displayName: 'tester' }] };
  mainResponses.search = {
    ok: true,
    result: {
      total: 2,
      tracks: [
        { id: 'streaming:netease:1', stableKey: 'streaming:netease:1', provider: 'netease', providerTrackId: '1', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, playable: true, qualities: ['lossless', 'high'] },
        { id: 'streaming:netease:2', stableKey: 'streaming:netease:2', provider: 'netease', providerTrackId: '2', title: '稻香', artist: '周杰伦', album: '魔杰座', duration: 223, playable: false, unavailableReason: '当前不可播放' },
      ],
      albums: [], artists: [], playlists: [],
    },
  };
  // Dismiss the error banner, load the happy-path stubs, then submit a search.
  pageRoot.querySelector('.mms-banner-error')?.click();
  await settle(2);

  const happyInput = pageRoot.querySelector('.mms-search-input');
  happyInput.value = '晴天';
  happyInput.dispatch('input');
  pageRoot.querySelector('.mms-search').dispatch('submit');
  await waitFor(() => pageRoot.querySelectorAll('.mms-row').length >= 2, 'search rows');
  const rows = pageRoot.querySelectorAll('.mms-row');
  check('search results rendered as rows', rows.length >= 2, `${rows.length} rows`);
  const resultsText = pageRoot.allText();
  check('track titles rendered', resultsText.includes('晴天') && resultsText.includes('稻香'));
  check('provider badge rendered', resultsText.includes('网易云音乐'));
  check('duration formatted', resultsText.includes('4:29'), resultsText.includes('4:29') ? '4:29' : resultsText.slice(0, 100));

  const playButton = rows[0]?.querySelectorAll('.mms-icon')[0];
  check('play button present', Boolean(playButton));
  if (playButton) {
    playButton.click();
    await settle(3);
    const played = playerCalls.find((call) => call.kind === 'playTrack');
    check('playback routed to loader player', Boolean(played), played ? `provider=${played.track?.provider} quality=${played.options?.quality}` : 'no playTrack call');
    check('queue item carries streaming media type', played?.track?.mediaType === 'streaming', `mediaType=${played?.track?.mediaType}`);
  }

  const queueButton = rows[0]?.querySelectorAll('.mms-icon')[1];
  if (queueButton) {
    queueButton.click();
    await settle(2);
    check('queue button appends to player', playerCalls.some((call) => call.kind === 'append'), playerCalls.map((call) => call.kind).join(','));
  }

  // --- context menu --------------------------------------------------------
  rows[0].dispatch('contextmenu', { clientX: 40, clientY: 60 });
  await settle(2);
  const menu = documentShim.body.querySelector('.mms-menu');
  check('context menu opens on right click', Boolean(menu), menu ? menu.allText() : 'no menu');
  if (menu) {
    const labels = menu.allText();
    check('context menu offers platform actions', labels.includes('在浏览器打开') && labels.includes('复制链接'), labels);
    check('menu positioned at pointer', menu.style.left === '40px' && menu.style.top === '60px', `${menu.style.left},${menu.style.top}`);
    const openItem = menu.querySelectorAll('.mms-menu-item').find((item) => item.textContent.includes('在浏览器打开'));
    let opened = null;
    sandbox.window.open = (url) => { opened = url; };
    openItem.click();
    await settle(1);
    check('open-in-browser uses the platform URL', typeof opened === 'string' && opened.includes('music.163.com'), String(opened));
    check('menu closes after a choice', !documentShim.body.querySelector('.mms-menu'));
  }

  // --- song background (lyrics page scope) ---------------------------------
  echoExternalMod.config.songBackgroundEnabled = true;
  mainResponses.findMvCandidates = {
    ok: true,
    result: [
      { id: 'bilibili:BVTEST1', title: '晴天 MV', uploader: 'uploader', url: 'https://www.bilibili.com/video/BVTEST1', thumbnailUrl: null, viewCount: 1000, score: 0.9, reasons: [] },
    ],
  };
  let mvResolves = 0;
  // The acquisition is the community one: the engine search persists the
  // candidates, `selectVideo` resolves the variant, and the renderer plays the
  // `echo-mv://` URL ECHO-main's MvPanel plays. `prepareMvProgressive` is the
  // fallback (Bilibili's complete MP4 through the loopback proxy) and
  // `prepareMvBackground` is the old DASH segment trap: its URLs only hold a few
  // seconds, which is what made the background loop its first seconds.
  mainResponses.mvSearchNetworkCandidatesForSnapshot = {
    ok: true,
    result: [
      {
        id: 'cand-1',
        title: '晴天 MV',
        uploader: 'uploader',
        url: 'https://www.bilibili.com/video/BVTEST1',
        providerUrl: 'https://www.bilibili.com/video/BVTEST1',
        score: 0.93,
        viewCount: 1_200_000,
        durationSeconds: 269,
        reasons: ['标题匹配'],
        playableInApp: true,
      },
    ],
  };
  mainResponses.mvSelectVideo = {
    ok: true,
    result: {
      id: 'video-1',
      sourceId: 'BVTEST1',
      title: '晴天 MV',
      provider: 'bilibili',
      providerUrl: 'https://www.bilibili.com/video/BVTEST1',
      mediaUrl: 'echo-mv://stream/video-1/bilibili-qn-80',
      qualityLabel: '1080P',
      durationSeconds: 269,
      offsetMs: 0,
      playableInApp: true,
    },
  };
  mainResponses.mvGetTemporaryPlayableForSnapshot = {
    ok: true,
    result: {
      id: 'temporary:token-1',
      sourceId: 'BVTEST1',
      title: '晴天 MV',
      provider: 'bilibili',
      providerUrl: 'https://www.bilibili.com/video/BVTEST1',
      mediaUrl: 'echo-mv://ephemeral/token-1',
      qualityLabel: '1080P',
      durationSeconds: 269,
      offsetMs: 0,
      playableInApp: true,
    },
  };
  mainResponses.mvResolveStreams = {
    ok: true,
    result: {
      video: { id: 'video-1', title: '晴天 MV', mediaUrl: 'echo-mv://stream/video-1/bilibili-qn-80' },
      variants: [
        { id: 'bilibili-qn-80', label: '1080P', protocol: 'direct', playableInApp: true, qualityTier: '1080p' },
        { id: 'bilibili-qn-64', label: '720P', protocol: 'direct', playableInApp: true, qualityTier: '720p' },
      ],
    },
  };
  mainResponses.prepareMvProgressive = async () => {
    mvResolves += 1;
    // The main process returns a loopback proxy URL, not the CDN URL directly.
    return { ok: true, result: { url: 'http://127.0.0.1:9/proxied.mp4', qualityLabel: '1080P', durationSeconds: 269, sizeBytes: 24_000_000, mimeType: 'video/mp4', mode: 'progressive' } };
  };
  mainResponses.prepareMvBackground = async () => {
    mvResolves += 1;
    return { ok: true, result: { url: 'http://127.0.0.1:9/segment.m4s', mimeType: 'video/mp4' } };
  };
  mainResponses.setSettings = { ok: true, result: {} };
  player.status = async () => { playerStatusCalls += 1; return { state: 'playing', currentTrackId: 'streaming:netease:1' }; };

  // The MV switch left the search toolbar: it lives on the player bar and on the
  // 「MV 背景」 page, so the toolbar is search + media type + quality + refresh.
  const toolbarMv = pageRoot.querySelectorAll('.mms-ghost').find((item) => item.textContent.includes('背景'));
  check('the search toolbar no longer carries the MV background switch', !toolbarMv, toolbarMv?.textContent || '(none)');
  check('the toolbar refresh control is icon-only', Boolean(pageRoot.querySelector('.mms-tool-icon')), pageRoot.querySelector('.mms-tool-icon')?.className);
  await waitFor(() => lyricsPage.querySelector(':scope > .mms-lyrics-bg'), 'lyrics background layer');
  check('background layer injected into the lyrics page', Boolean(lyricsPage.querySelector(':scope > .mms-lyrics-bg')));
  const bgIndex = lyricsPage.children.indexOf(lyricsPage.querySelector(':scope > .mms-lyrics-bg'));
  const backdropIndex = lyricsPage.children.indexOf(lyricsBackdrop);
  check(
    'background layer sits after the app backdrop (stacking fix)',
    bgIndex > backdropIndex && backdropIndex >= 0,
    `backdrop=${backdropIndex} layer=${bgIndex}`,
  );
  const bgStyle = lyricsPage.querySelector('.mms-lyrics-bg')?.style;
  check(
    'ECHO-main immersive CSS variables applied',
    bgStyle?.properties?.get('--mms-immersive-scale') !== undefined
      && bgStyle?.properties?.get('--mms-immersive-position-x') === '50%'
      && bgStyle?.properties?.get('--mms-immersive-brightness') === '100%',
    `scale=${bgStyle?.properties?.get('--mms-immersive-scale')} x=${bgStyle?.properties?.get('--mms-immersive-position-x')}`,
  );
  const playerBarToggle = transportBar.querySelector('.mms-backdrop-toggle');
  check(
    'player-bar toggle uses the always-visible transport class',
    Boolean(playerBarToggle?.classList.contains('transport-media-button')),
    playerBarToggle?.className,
  );
  check('player-bar toggle injected', Boolean(playerBarToggle), `${transportBar.children.length} transport children`);
  await waitFor(() => calls.some((call) => call.method === 'findMvCandidates'), 'MV search', 12000);
  check('Bilibili MV searched for the playing track', calls.some((call) => call.method === 'findMvCandidates' && call.payload?.title === '晴天'), JSON.stringify(calls.find((call) => call.method === 'findMvCandidates')?.payload));
  await waitFor(() => lyricsPage.querySelector('video')?.src, 'background video', 8000);
  const backdropVideo = lyricsPage.querySelector('.mms-backdrop-video');
  check(
    'the engine search runs for the snapshot the background matched',
    calls.some((call) => call.method === 'mvSearchNetworkCandidatesForSnapshot' && call.payload?.trackId === 'streaming:netease:1'),
    JSON.stringify(calls.find((call) => call.method === 'mvSearchNetworkCandidatesForSnapshot')?.payload || {}).slice(0, 120),
  );
  check(
    'the name-matched candidate is selected through the community service',
    calls.some((call) => call.method === 'mvSelectVideo' && call.payload?.videoId === 'cand-1'),
    JSON.stringify(calls.find((call) => call.method === 'mvSelectVideo')?.payload || {}),
  );
  check(
    'the background plays the community echo-mv stream',
    String(backdropVideo?.src).startsWith('echo-mv://'),
    String(backdropVideo?.src).slice(0, 60),
  );
  check(
    'nothing is downloaded for the background',
    !calls.some((call) => /^mvPrefetch/u.test(call.method)) && !calls.some((call) => call.method === 'prepareMvBackground'),
    calls.map((call) => call.method).filter((name) => /prefetch|prepareMv/u.test(name)).join(',') || '(no download step)',
  );
  check(
    'the community stream is used instead of the MP4 fallback',
    !calls.some((call) => call.method === 'prepareMvProgressive'),
    calls.filter((call) => call.method === 'prepareMvProgressive').length ? 'progressive used' : 'engine stream used',
  );
  check('background video is muted + looping (autoplay-safe)', backdropVideo?.muted === true && backdropVideo?.loop === true, `muted=${backdropVideo?.muted} loop=${backdropVideo?.loop}`);
  check('background layer marked playing', lyricsPage.querySelector('.mms-lyrics-bg')?.dataset.state === 'playing', lyricsPage.querySelector('.mms-lyrics-bg')?.dataset.state);

  // A fragmented DASH stream reports only its own few seconds: the background
  // must escalate to the complete MP4 instead of looping those seconds forever.
  const progressiveCallsBefore = calls.filter((call) => call.method === 'prepareMvProgressive').length;
  backdropVideo.duration = 8;
  backdropVideo.dispatch('loadedmetadata');
  await waitFor(
    () => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('proxied.mp4'),
    'short-source escalation',
    8000,
  );
  check(
    'a short DASH stream is escalated to the complete MP4',
    calls.filter((call) => call.method === 'prepareMvProgressive').length > progressiveCallsBefore
      && String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('proxied.mp4'),
    `${calls.filter((call) => call.method === 'prepareMvProgressive').length} progressive call(s) src=${String(lyricsPage.querySelector('.mms-backdrop-video')?.src).slice(0, 44)}`,
  );
  backdropVideo.duration = 269;

  // --- following the song position ----------------------------------------
  // The loader player runtime reports `positionSeconds` / `durationSeconds`
  // (not `positionMs`). Reading the wrong field made every alignment compute a
  // target of 0, so the drift timer seeked the MV back to its first seconds
  // roughly every 400 ms — the "stuck looping the first seconds" report.
  player.status = async () => ({
    state: 'playing',
    currentTrackId: 'streaming:netease:1',
    positionSeconds: 149.13,
    durationSeconds: 249.067,
  });
  lyricsPage.querySelector('.mms-backdrop-video').currentTime = 0;
  await waitFor(
    () => Number(lyricsPage.querySelector('.mms-backdrop-video')?.currentTime) > 100,
    'MV follows the song position',
    8000,
  );
  const followedTime = Number(lyricsPage.querySelector('.mms-backdrop-video')?.currentTime);
  check(
    'the MV follows the song position reported as positionSeconds',
    followedTime > 100 && followedTime < 200,
    `currentTime=${followedTime}`,
  );

  // An unreadable status must leave the video alone instead of rewinding it.
  player.status = async () => ({ state: 'playing', currentTrackId: 'streaming:netease:1' });
  const beforeUnreadable = Number(lyricsPage.querySelector('.mms-backdrop-video')?.currentTime);
  await new Promise((resolveWait) => setTimeout(resolveWait, 700));
  const afterUnreadable = Number(lyricsPage.querySelector('.mms-backdrop-video')?.currentTime);
  check(
    'an unreadable player status never rewinds the MV',
    afterUnreadable === beforeUnreadable && afterUnreadable > 100,
    `before=${beforeUnreadable} after=${afterUnreadable}`,
  );

  // Drift correction direction (ECHO-main's signed drift): the video has to be
  // nudged towards the song, never away from it.
  player.status = async () => ({ state: 'playing', currentTrackId: 'streaming:netease:1', positionSeconds: 160 });
  const driftVideo = lyricsPage.querySelector('.mms-backdrop-video');
  driftVideo.currentTime = 159;
  await new Promise((resolveWait) => setTimeout(resolveWait, 600));
  const behindRate = Number(driftVideo.playbackRate);
  driftVideo.currentTime = 161;
  await new Promise((resolveWait) => setTimeout(resolveWait, 600));
  const aheadRate = Number(driftVideo.playbackRate);
  check('a lagging MV is sped up towards the song', behindRate > 1.001, `rate=${behindRate}`);
  check('a leading MV is slowed down towards the song', aheadRate < 0.999, `rate=${aheadRate}`);
  driftVideo.playbackRate = 1;

  player.status = async () => ({ state: 'playing', currentTrackId: 'streaming:netease:1' });
  check(
    'the matched video is remembered for the panel',
    await waitFor(
      () => lyricsPage.querySelector('.mms-mv-panel')?.allText().includes('晴天 MV'),
      'panel shows the matched video',
    ),
    lyricsPage.querySelector('.mms-mv-panel')?.allText().slice(0, 80),
  );

  // --- fallback: no community stream -> Bilibili's complete MP4 ------------
  mainResponses.mvSelectVideo = { ok: false, error: 'no playable variant' };
  mainResponses.mvGetTemporaryPlayableForSnapshot = { ok: false, error: 'no temporary stream' };
  const rematchButton = lyricsPage.querySelector('.mms-mv-panel')
    ?.querySelectorAll('.mms-ghost')
    .find((item) => item.textContent === '重新匹配');
  check('lyrics-page panel offers a rematch', Boolean(rematchButton));
  if (rematchButton) {
    rematchButton.click();
    await waitFor(() => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('proxied.mp4'), 'progressive fallback', 8000);
    check(
      'the MP4 fallback takes over when the engine has no stream',
      calls.some((call) => call.method === 'prepareMvProgressive'),
      calls.filter((call) => call.method === 'prepareMvProgressive').length ? 'progressive used' : 'no fallback call',
    );
    check(
      'the fallback still never touches the DASH segment endpoint',
      !calls.some((call) => call.method === 'prepareMvBackground'),
      calls.filter((call) => call.method === 'prepareMvBackground').length ? 'DASH used' : 'no DASH call',
    );
  }
  // Restore the community path for the sections below.
  mainResponses.mvSelectVideo = {
    ok: true,
    result: {
      id: 'video-1',
      sourceId: 'BVTEST1',
      title: '晴天 MV',
      provider: 'bilibili',
      providerUrl: 'https://www.bilibili.com/video/BVTEST1',
      mediaUrl: 'echo-mv://stream/video-1/bilibili-qn-80',
      qualityLabel: '1080P',
      durationSeconds: 269,
      offsetMs: 0,
      playableInApp: true,
    },
  };
  mainResponses.mvGetTemporaryPlayableForSnapshot = {
    ok: true,
    result: {
      id: 'temporary:token-1',
      sourceId: 'BVTEST1',
      title: '晴天 MV',
      provider: 'bilibili',
      providerUrl: 'https://www.bilibili.com/video/BVTEST1',
      mediaUrl: 'echo-mv://ephemeral/token-1',
      qualityLabel: '1080P',
      durationSeconds: 269,
      offsetMs: 0,
      playableInApp: true,
    },
  };

  // --- account playlists (NetEase playlists + Bilibili favourites) ---------
  // The community account-playlist shape carries `webUrl` for NetEase / QQ
  // Music and only Bilibili adds a plain `url`; reading `url` alone made every
  // NetEase playlist open with "Please enter a valid streaming playlist URL"
  // because the fallback was the bare numeric id.
  const localStore = { accounts: {}, collections: {} };
  mainResponses.listAccountPlaylists = {
    ok: true,
    result: {
      provider: 'netease',
      fetchedAt: '2026-01-02T03:04:05.000Z',
      playlists: [
        { id: 'p1', name: '我喜欢的音乐', title: '我喜欢的音乐', provider: 'netease', providerPlaylistId: '123', webUrl: 'https://music.163.com/#/playlist?id=123', trackCount: 12, coverUrl: 'http://p1.music.126.net/cover-123.jpg?param=600y600', creator: '测试账号', kind: 'playlist' },
        { id: 'bilibili:favorites:99', name: 'Neuro sama', title: 'Neuro sama', provider: 'bilibili', providerPlaylistId: 'https://space.bilibili.com/1/favlist?fid=99', url: 'https://space.bilibili.com/1/favlist?fid=99', trackCount: 87, coverUrl: null, creator: 'Chen_yang_LT', kind: 'favorites' },
      ],
    },
  };
  // The bridge resolves an account playlist *or* a pasted link through the same
  // RPC, so the stub answers per URL — the link one is the 999 playlist below.
  const accountCollectionResult = {
    provider: 'netease',
    playlistId: 'mms-account-1',
    playlistName: '我喜欢的音乐',
    importedCount: 2,
    tracks: [
      { id: 'streaming:netease:21', stableKey: 'streaming:netease:21', provider: 'netease', providerTrackId: '21', title: '歌单曲目一', artist: '艺人', album: '专辑', duration: 180, playable: true, qualities: ['lossless'] },
      { id: 'streaming:netease:22', stableKey: 'streaming:netease:22', provider: 'netease', providerTrackId: '22', title: '歌单曲目二', artist: '艺人', duration: 200, playable: true, qualities: ['lossless'] },
    ],
  };
  const linkCollectionResult = {
    provider: 'netease',
    playlistId: 'mms-link-1',
    playlistName: '链接歌单',
    importedCount: 2,
    tracks: [
      { id: 'streaming:netease:31', stableKey: 'streaming:netease:31', provider: 'netease', providerTrackId: '31', title: '链接曲目一', artist: '艺人', duration: 190, playable: true, qualities: ['lossless'] },
      { id: 'streaming:netease:32', stableKey: 'streaming:netease:32', provider: 'netease', providerTrackId: '32', title: '链接曲目二', artist: '艺人', duration: 210, playable: true, qualities: ['lossless'] },
    ],
  };
  mainResponses.importAccountCollection = (payload) => ({
    ok: true,
    result: String(payload?.url || '').includes('id=999') ? linkCollectionResult : accountCollectionResult,
  });
  // The main process keeps the account list and the playlists the user *chose* to
  // save in a JSON file; these stubs model that file.
  mainResponses.playlistStoreRead = { ok: true, result: { path: 'C:\\Temp\\echo-mms-playlists.json', ...localStore } };
  mainResponses.playlistStoreSaveAccount = (payload) => {
    localStore.accounts[payload.provider] = { entries: payload.entries, fetchedAt: payload.fetchedAt };
    return { ok: true, result: { accounts: localStore.accounts } };
  };
  mainResponses.playlistStoreSaveCollection = (payload) => {
    localStore.collections[payload.key] = {
      key: payload.key,
      provider: payload.provider,
      source: payload.source === 'link' ? 'link' : 'account',
      linkUrl: payload.linkUrl ?? null,
      name: payload.name,
      description: payload.description,
      coverUrl: payload.coverUrl ?? null,
      savedAt: '2026-01-02T03:05:00.000Z',
      trackCount: Array.isArray(payload.tracks) ? payload.tracks.length : 0,
      tracks: payload.tracks,
    };
    return { ok: true, result: { collections: localStore.collections } };
  };
  mainResponses.playlistStoreRemoveCollection = (payload) => {
    delete localStore.collections[payload.key];
    return { ok: true, result: { collections: localStore.collections } };
  };

  check(
    'the liked-songs sync button is gone',
    !pageRoot.querySelectorAll('.mms-nav-tab').some((tab) => String(tab.textContent).includes('同步')),
    pageRoot.querySelectorAll('.mms-nav-tab').map((tab) => tab.textContent).join(','),
  );

  const playlistsTab = pageRoot.querySelectorAll('.mms-nav-tab').find((tab) => tab.textContent.includes('我的歌单'));
  check('my-playlists entry present', Boolean(playlistsTab));
  if (playlistsTab) {
    playlistsTab.click();
    await waitFor(() => pageRoot.allText().includes('我喜欢的音乐'), 'account playlists');
    const playlistsText = pageRoot.allText();
    check(
      'the account playlists are listed with their counts',
      playlistsText.includes('我喜欢的音乐') && playlistsText.includes('Neuro sama') && playlistsText.includes('12 首') && playlistsText.includes('87 首'),
      playlistsText.slice(0, 140),
    );
    check(
      'every card offers an explicit save control',
      pageRoot.querySelectorAll('.mms-card-actions').length >= 2
        && pageRoot.querySelectorAll('.mms-card-actions').every((row) => row.allText().includes('保存到本地')),
      pageRoot.querySelectorAll('.mms-card-actions').map((row) => row.allText()).join(' | '),
    );
    await waitFor(
      () => calls.some((call) => call.method === 'playlistStoreSaveAccount'),
      'the account list is kept locally',
    );
    check(
      'the account playlist list is kept locally',
      Boolean(localStore.accounts.netease?.entries?.length) && localStore.accounts.netease.fetchedAt === '2026-01-02T03:04:05.000Z',
      JSON.stringify(Object.keys(localStore.accounts)),
    );

    const cards = pageRoot.querySelectorAll('.mms-card');
    const playlistCard = cards.find((card) => card.allText().includes('我喜欢的音乐'));
    check('playlist cards are clickable', Boolean(playlistCard));
    if (playlistCard) {
      // The card cover is the https upgrade of what the platform handed back.
      const cardCover = playlistCard.querySelector('.mms-card-cover');
      check(
        'a playlist card shows the platform cover over https',
        String(cardCover?.src || '') === 'https://p1.music.126.net/cover-123.jpg?param=600y600',
        String(cardCover?.src || '(none)'),
      );

      playlistCard.click();
      await waitFor(
        () => calls.some((call) => call.method === 'importAccountCollection'),
        'account playlist import',
      );
      const importCall = calls.filter((call) => call.method === 'importAccountCollection').slice(-1)[0];
      check(
        'opening a NetEase playlist uses its webUrl, not the bare id',
        importCall?.payload?.url === 'https://music.163.com/#/playlist?id=123' && importCall?.payload?.provider === 'netease',
        JSON.stringify(importCall?.payload || {}),
      );
      await waitFor(() => pageRoot.allText().includes('歌单曲目一'), 'playlist tracks');
      check(
        'the imported playlist lists its tracks',
        pageRoot.allText().includes('歌单曲目一') && pageRoot.allText().includes('歌单曲目二'),
        pageRoot.allText().slice(0, 120),
      );
      // Opening must not persist anything on its own.
      check(
        'opening a playlist does not save it behind the user\u2019s back',
        !calls.some((call) => call.method === 'playlistStoreSaveCollection'),
        `${calls.filter((call) => call.method === 'playlistStoreSaveCollection').length} save call(s)`,
      );
      const heroCover = pageRoot.querySelector('.mms-hero-cover');
      check(
        'the detail page shows the playlist cover',
        String(heroCover?.src || '') === 'https://p1.music.126.net/cover-123.jpg?param=600y600',
        String(heroCover?.src || '(none)'),
      );
      check(
        'the detail page says the playlist is not kept locally yet',
        pageRoot.allText().includes('未保存到本地'),
        pageRoot.allText().slice(0, 120),
      );

      // ← must return to the 歌单 page this playlist was opened from.
      const listCallsBeforeBack = calls.filter((call) => call.method === 'listAccountPlaylists').length;
      const backButton = pageRoot.querySelectorAll('.mms-ghost').find((item) => item.textContent.includes('返回'));
      backButton?.click();
      await settle(2);
      check(
        'back from a playlist returns to the playlists page',
        pageRoot.allText().includes('我的歌单 ·') && pageRoot.allText().includes('Neuro sama'),
        pageRoot.allText().slice(0, 110),
      );
      check(
        'returning does not re-fetch the account list',
        calls.filter((call) => call.method === 'listAccountPlaylists').length === listCallsBeforeBack,
        `${calls.filter((call) => call.method === 'listAccountPlaylists').length - listCallsBeforeBack} extra call(s)`,
      );

      // Now the user explicitly saves it from the card.
      const saveCard = pageRoot.querySelectorAll('.mms-card').find((card) => card.allText().includes('我喜欢的音乐'));
      const saveButton = saveCard?.querySelectorAll('.mms-primary').find((item) => item.textContent.includes('保存到本地'));
      check('the card save button is a primary action while unsaved', Boolean(saveButton));
      saveButton?.click();
      await waitFor(
        () => calls.some((call) => call.method === 'playlistStoreSaveCollection'),
        'explicit save',
      );
      await settle(2);
      const keptCall = calls.filter((call) => call.method === 'playlistStoreSaveCollection').slice(-1)[0];
      check(
        'the save button keeps the playlist locally',
        keptCall?.payload?.tracks?.length === 2
          && String(keptCall?.payload?.key || '').includes('123')
          && String(keptCall?.payload?.coverUrl || '').includes('cover-123.jpg'),
        JSON.stringify({ key: keptCall?.payload?.key, tracks: keptCall?.payload?.tracks?.length }),
      );
      check(
        'the card now offers to remove the local copy',
        pageRoot.allText().includes('本地已存') && pageRoot.allText().includes('取消保存'),
        pageRoot.allText().slice(0, 140),
      );

      // Back to the list, then open it again: the saved copy is used, no fetch.
      const importsBeforeReopen = calls.filter((call) => call.method === 'importAccountCollection').length;
      const secondCard = pageRoot.querySelectorAll('.mms-card').find((card) => card.allText().includes('我喜欢的音乐'));
      secondCard?.click();
      await settle(3);
      check(
        'a saved playlist opens without going back to the platform',
        calls.filter((call) => call.method === 'importAccountCollection').length === importsBeforeReopen
          && pageRoot.allText().includes('歌单曲目一'),
        `${calls.filter((call) => call.method === 'importAccountCollection').length - importsBeforeReopen} extra import call(s)`,
      );
      check(
        'the detail view says it came from the local copy',
        pageRoot.allText().includes('来自本地保存'),
        pageRoot.allText().slice(0, 110),
      );

      // The detail page can undo the choice as well.
      const detailUnsave = pageRoot.querySelectorAll('.mms-ghost')
        .find((item) => item.textContent.includes('取消保存'));
      detailUnsave?.click();
      await waitFor(
        () => calls.some((call) => call.method === 'playlistStoreRemoveCollection'),
        'local copy removed',
      );
      await settle(2);
      check(
        'the detail page can remove the local copy',
        !localStore.collections['netease:123'] && pageRoot.allText().includes('未保存到本地'),
        pageRoot.allText().slice(0, 110),
      );
    }

    // --- layout picker -----------------------------------------------------
    playlistsTab.click();
    await settle(2);
    const modeSelect = pageRoot.querySelector('.mms-view-mode')?.querySelector('select');
    check(
      'the playlist page offers a layout picker',
      Boolean(modeSelect),
      pageRoot.querySelector('.mms-view-mode')?.allText() || '(none)',
    );
    if (modeSelect) {
      modeSelect.value = 'list';
      modeSelect.dispatch('change');
      await settle(2);
      check(
        'picking 列表 renders the list layout',
        Boolean(pageRoot.querySelector('.mms-playlist-list')) && !pageRoot.querySelector('.mms-grid'),
        pageRoot.querySelector('.mms-playlist-list')?.className || '(none)',
      );
      check(
        'the layout choice is persisted',
        settingsSaves.some((patch) => patch?.playlistViewMode === 'list'),
        JSON.stringify(settingsSaves.filter((patch) => 'playlistViewMode' in (patch || {})).slice(-1)[0] || {}),
      );
      modeSelect.value = 'compact';
      modeSelect.dispatch('change');
      await settle(2);
      check(
        'picking 紧凑 renders the compact layout',
        Boolean(pageRoot.querySelector('.mms-playlist-compact')),
        pageRoot.querySelector('.mms-playlist-compact')?.className || '(none)',
      );
      // Back to icons so the card assertions below keep their grid semantics.
      const gridSelect = pageRoot.querySelector('.mms-view-mode')?.querySelector('select');
      gridSelect.value = 'grid';
      gridSelect.dispatch('change');
      await settle(2);
      check('picking 图标 renders the grid layout again', Boolean(pageRoot.querySelector('.mms-grid')));
    }

    // --- importing a playlist from a link ---------------------------------
    mainResponses.importPlaylistFromUrl = {
      ok: true,
      result: {
        playlistId: linkCollectionResult.playlistId,
        playlistName: linkCollectionResult.playlistName,
        importedCount: linkCollectionResult.importedCount,
        provider: linkCollectionResult.provider,
        providerPlaylistId: '999',
      },
    };
    mainResponses.getStoredPlaylist = {
      ok: true,
      result: { playlistId: linkCollectionResult.playlistId, tracks: linkCollectionResult.tracks },
    };

    const importForm = pageRoot.querySelector('.mms-import-form');
    const importInput = importForm?.querySelector('.mms-search-input');
    check('the playlist page offers a link import field', Boolean(importInput));
    if (importForm && importInput) {
      importInput.value = 'https://music.163.com/#/playlist?id=999';
      importForm.dispatch('submit');
      await waitFor(
        () => calls.some((call) => call.method === 'importPlaylistFromUrl'),
        'playlist link import',
      );
      const importCall = calls.filter((call) => call.method === 'importPlaylistFromUrl').slice(-1)[0];
      check(
        'the pasted link is handed to the importer',
        importCall?.payload?.url === 'https://music.163.com/#/playlist?id=999',
        JSON.stringify(importCall?.payload || {}),
      );
      await waitFor(() => pageRoot.allText().includes('链接曲目一'), 'imported tracks');
      check(
        'an imported playlist opens with its tracks',
        pageRoot.allText().includes('链接曲目一') && pageRoot.allText().includes('链接曲目二'),
        pageRoot.allText().slice(0, 130),
      );
      check(
        'the imported tracks are read back through getStoredPlaylist',
        calls.some((call) => call.method === 'getStoredPlaylist' && call.payload?.playlistId === 'mms-link-1'),
        JSON.stringify(calls.filter((call) => call.method === 'getStoredPlaylist').slice(-1)[0]?.payload || {}),
      );
      check(
        'an imported playlist is not saved on its own either',
        !calls.some((call) => call.method === 'playlistStoreSaveCollection' && call.payload?.source === 'link'),
        `${calls.filter((call) => call.method === 'playlistStoreSaveCollection').length} save call(s)`,
      );

      // Save the imported list from the detail page.
      const saveImported = pageRoot.querySelectorAll('.mms-primary').find((item) => item.textContent.includes('保存到本地'));
      check('the imported detail offers 保存到本地', Boolean(saveImported));
      saveImported?.click();
      await waitFor(
        () => calls.some((call) => call.method === 'playlistStoreSaveCollection' && call.payload?.source === 'link'),
        'imported playlist saved',
      );
      await settle(2);
      const linkSave = calls.filter((call) => call.method === 'playlistStoreSaveCollection' && call.payload?.source === 'link').slice(-1)[0];
      check(
        'a link-imported playlist is stored with its link',
        String(linkSave?.payload?.linkUrl || '').includes('id=999') && linkSave?.payload?.tracks?.length === 2,
        JSON.stringify({ key: linkSave?.payload?.key, linkUrl: linkSave?.payload?.linkUrl, name: linkSave?.payload?.name }),
      );

      // Back on the 歌单 page it appears in the local group and opens offline.
      const backFromImport = pageRoot.querySelectorAll('.mms-ghost').find((item) => item.textContent.includes('返回'));
      backFromImport?.click();
      await settle(3);
      check(
        'the link-imported playlist shows in 本地保存的歌单',
        pageRoot.allText().includes('本地保存的歌单') && pageRoot.allText().includes('链接歌单'),
        pageRoot.allText().slice(0, 160),
      );
      const importsBeforeLocalOpen = calls.filter((call) => call.method === 'importPlaylistFromUrl').length;
      const localCard = pageRoot.querySelectorAll('.mms-card').find((card) => card.allText().includes('链接歌单'));
      localCard?.click();
      await settle(3);
      check(
        'a locally saved link playlist opens without importing again',
        calls.filter((call) => call.method === 'importPlaylistFromUrl').length === importsBeforeLocalOpen
          && pageRoot.allText().includes('链接曲目一'),
        `${calls.filter((call) => call.method === 'importPlaylistFromUrl').length - importsBeforeLocalOpen} extra import(s)`,
      );
    }
  }

  // --- daily recommendations (a group on the 歌单 page now) -----------------
  mainResponses.refreshNeteaseDailyRecommend = {
    ok: true,
    result: {
      playlistId: 'mms-system-netease-daily-recommend',
      playlistName: '每日推荐',
      importedCount: 2,
      provider: 'netease',
      providerPlaylistId: 'daily-recommend',
      tracks: [
        { id: 'streaming:netease:11', stableKey: 'streaming:netease:11', provider: 'netease', providerTrackId: '11', title: '日推一号', artist: '艺人甲', album: '专辑', duration: 200, playable: true, qualities: ['lossless'] },
        { id: 'streaming:netease:12', stableKey: 'streaming:netease:12', provider: 'netease', providerTrackId: '12', title: '日推二号', artist: '艺人乙', album: '专辑', duration: 220, playable: true, qualities: ['lossless'] },
      ],
    },
  };
  await clickTab('我的歌单');
  const dailyGroup = pageRoot.querySelector('.mms-daily');
  check('每日推荐 is a group on the 歌单 page', Boolean(dailyGroup), pageRoot.allText().slice(0, 60));
  const dailyOpen = dailyGroup?.querySelectorAll('.mms-primary').find((item) => item.textContent.includes('打开每日推荐'));
  check('the daily group offers an open action', Boolean(dailyOpen), dailyOpen?.textContent);
  dailyOpen?.click();
  await waitFor(() => pageRoot.allText().includes('日推一号'), 'daily recommend tracks');
  check(
    'daily recommend shows the imported tracks',
    pageRoot.allText().includes('日推一号') && pageRoot.allText().includes('日推二号'),
    pageRoot.allText().slice(0, 80),
  );
  // Back on the 歌单 page the group previews the same list it just read.
  await clickTab('我的歌单');
  const dailyRows = pageRoot.querySelector('.mms-daily')?.querySelectorAll('.mms-row') || [];
  check(
    'the daily group previews the tracks it read',
    dailyRows.length >= 2,
    `${dailyRows.length} row(s)`,
  );

  // --- MV background page (its own sidebar entry) --------------------------
  mainResponses.mvEngineStatus = {
    ok: true,
    result: {
      ready: true,
      error: null,
      database: 'C:\\Temp\\echo-mms-mv.sqlite',
      tracks: 3,
      settings: {},
      account: { connected: true, displayName: '测试账号', hasCookie: true },
    },
  };
  const mvPage = sidebarPages.find((page) => page.id === 'multi-music-sources-mv');
  check('the MV background page is a second sidebar entry', Boolean(mvPage), sidebarPages.map((page) => page.id).join(','));
  const audioPageRoot = pageRoot;
  const mvRoot = new Element('div');
  if (mvPage) {
    mvPage.render(mvRoot, { toast: (message) => toasts.push(message), echo: {}, config: echoExternalMod.config });
    pageRoot = mvRoot;
  }
  {
    await waitFor(() => pageRoot.querySelector('.mms-background'), 'MV background page');
    await waitFor(() => pageRoot.allText().includes('已记住 3 首歌曲'), 'engine status loaded');
    const backgroundText = pageRoot.allText();
    check(
      'the MV page carries the master switch',
      pageRoot.querySelectorAll('.mms-switch').length >= 1 && backgroundText.includes('启用 MV 背景'),
      `${pageRoot.querySelectorAll('.mms-switch').length} switch(es) · ${backgroundText.slice(0, 60)}`,
    );
    check(
      'background page reports the community MV engine',
      backgroundText.includes('社区 MV 引擎') && backgroundText.includes('可用'),
      backgroundText.slice(0, 140),
    );
    check(
      'background page shows the engine database and track count',
      backgroundText.includes('echo-mms-mv.sqlite') && backgroundText.includes('已记住 3 首歌曲'),
      backgroundText.slice(140, 320),
    );
    check(
      'background page shows the account cookie source',
      backgroundText.includes('使用已登录账号') && backgroundText.includes('测试账号'),
      backgroundText.slice(120, 260),
    );
    check(
      'the downloader/cache controls are gone',
      !backgroundText.includes('BBDown') && !backgroundText.includes('缓存上限') && !backgroundText.includes('缓存目录'),
      backgroundText.slice(0, 200),
    );
    const matchSelect = pageRoot.querySelectorAll('.mms-select')
      .find((item) => item.children.some((child) => child.value === 'first'));
    check('background page offers the first-result match mode', Boolean(matchSelect));
    const sourceSelect = pageRoot.querySelectorAll('.mms-select')
      .find((item) => item.children.some((child) => child.value === 'engine'));
    check(
      'background page offers the community engine source mode',
      Boolean(sourceSelect) && !sourceSelect.children.some((child) => child.value === 'bbdown'),
      sourceSelect ? sourceSelect.children.map((child) => child.value).join(',') : 'no select',
    );
  }

  // Candidates + custom link: the settings page is where a wrong match is fixed.
  mainResponses.findMvCandidates = {
    ok: true,
    result: [
      { id: 'BVFIRST', title: '晴天 MV 第一个结果', uploader: 'UP 主', url: 'https://www.bilibili.com/video/BVFIRST', duration: 269, viewCount: null, score: null },
      { id: 'BVSECOND', title: '晴天 第二个结果', uploader: '另一个 UP', url: 'https://www.bilibili.com/video/BVSECOND', duration: 240, viewCount: 99999, score: 0.5 },
    ],
  };
  const boundVideo = (payload, id = 'bound-1') => ({
    ok: true,
    result: {
      id,
      trackId: payload?.trackId ?? 'streaming:netease:1',
      provider: 'bilibili',
      sourceType: 'manual',
      title: '晴天 官方 MV',
      providerUrl: payload?.url ?? 'https://www.bilibili.com/video/BVFIRST',
      selectedQualityId: 'auto',
      offsetMs: 0,
      playableInApp: true,
    },
  });
  mainResponses.mvBindUrl = async (payload) => boundVideo(payload);
  mainResponses.mvGetSelected = { ok: true, result: null };
  mainResponses.mvResolveStreams = {
    ok: true,
    result: {
      video: {
        id: 'bound-1',
        sourceId: 'BVFIRST',
        provider: 'bilibili',
        sourceType: 'manual',
        title: '晴天 官方 MV',
        providerUrl: 'https://www.bilibili.com/video/BVFIRST',
        mediaUrl: 'echo-mv://stream/bound-1/bilibili-qn-80',
        qualityLabel: '1080P',
        playableInApp: true,
        offsetMs: 0,
      },
      variants: [
        { id: 'bilibili-qn-80', label: '1080P', protocol: 'direct', playableInApp: true, qualityTier: '1080p' },
        { id: 'bilibili-qn-64', label: '720P', protocol: 'direct', playableInApp: true, qualityTier: '720p' },
      ],
    },
  };
  mainResponses.mvSetQuality = { ok: true, result: { id: 'bound-1', qualityLabel: '720P', selectedQualityId: 'bilibili-qn-64' } };
  mainResponses.mvSetOffset = { ok: true, result: { id: 'bound-1', offsetMs: 500 } };

  const testMatchButton = pageRoot.querySelectorAll('.mms-primary').find((item) => item.textContent.includes('为当前歌曲匹配候选'));
  check('background page offers the candidate search', Boolean(testMatchButton));
  if (testMatchButton) {
    testMatchButton.click();
    await waitFor(() => pageRoot.allText().includes('晴天 MV 第一个结果'), 'candidate results');
    const candidates = pageRoot.querySelectorAll('.mms-bg-candidate');
    check('the candidate list shows the search results', candidates.length >= 2, `${candidates.length} candidates`);
    check('the first result is the chosen one', candidates[0]?.dataset.chosen === 'true' && candidates[0]?.allText().includes('第一个结果'));

    const chosenRow = pageRoot.querySelectorAll('.mms-bg-candidate').find((row) => row.allText().includes('第一个结果'));
    const applyCandidate = chosenRow?.querySelectorAll('.mms-primary').find((item) => item.textContent === '用这个');
    const previewCandidate = chosenRow?.querySelectorAll('.mms-ghost').find((item) => item.textContent === '预览');
    check('candidate rows offer apply + preview', Boolean(applyCandidate) && Boolean(previewCandidate), chosenRow?.allText().slice(0, 80) || 'no chosen row');

    if (applyCandidate) {
      // The song is already at 2:29 — switching the MV must land there.
      player.status = async () => ({
        state: 'playing',
        currentTrackId: 'streaming:netease:1',
        positionSeconds: 149.13,
        durationSeconds: 249.067,
      });
      applyCandidate.click();
      await waitFor(
        () => calls.some((call) => call.method === 'mvBindUrl' && call.payload?.url === 'https://www.bilibili.com/video/BVFIRST'),
        'candidate binding',
      );
      const bindCall = calls.filter((call) => call.method === 'mvBindUrl').pop();
      check(
        'applying a candidate remembers it for that song',
        bindCall?.payload?.trackId === 'streaming:netease:1' && bindCall?.payload?.url === 'https://www.bilibili.com/video/BVFIRST',
        JSON.stringify(bindCall?.payload || {}),
      );
      await waitFor(
        () => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('bound-1'),
        'applied stream',
        8000,
      );
      check(
        'the applied candidate plays its stream',
        String(lyricsPage.querySelector('.mms-backdrop-video')?.src).startsWith('echo-mv://stream/bound-1/'),
        String(lyricsPage.querySelector('.mms-backdrop-video')?.src).slice(0, 64),
      );
      await waitFor(
        () => Math.abs(Number(lyricsPage.querySelector('.mms-backdrop-video')?.currentTime) - 149.13) < 2,
        'seek to the song position',
        8000,
      );
      const appliedTime = Number(lyricsPage.querySelector('.mms-backdrop-video')?.currentTime);
      check(
        'switching the MV seeks once to the song position and continues there',
        Math.abs(appliedTime - 149.13) < 2,
        `currentTime=${appliedTime}`,
      );
      // The quality chips and the per-track offset of the binding show up.
      await waitFor(() => pageRoot.allText().includes('MV 偏移'), 'quality/offset section');
      check('the bound video lists its qualities', pageRoot.allText().includes('1080P') && pageRoot.allText().includes('720P'));
      const offsetPlus = pageRoot.querySelectorAll('.mms-ghost').find((item) => item.textContent === '+0.5s');
      check('offset controls are offered', Boolean(offsetPlus));
      if (offsetPlus) {
        offsetPlus.click();
        await waitFor(() => calls.some((call) => call.method === 'mvSetOffset'), 'mvSetOffset call');
        const offsetCall = calls.filter((call) => call.method === 'mvSetOffset').pop();
        check('offset changes are persisted per track', offsetCall?.payload?.offsetMs === 500 || offsetCall?.payload?.offsetMs === 0, JSON.stringify(offsetCall?.payload));
      }
    }

    if (previewCandidate) {
      const bindsBeforePreview = calls.filter((call) => call.method === 'mvBindUrl').length;
      previewCandidate.click();
      await waitFor(() => calls.some((call) => call.method === 'mvSearchNetworkCandidatesForSnapshot'), 'engine search for the preview');
      check(
        'previewing does not change the binding',
        calls.filter((call) => call.method === 'mvBindUrl').length === bindsBeforePreview,
        `${calls.filter((call) => call.method === 'mvBindUrl').length} bind call(s)`,
      );
      await waitFor(() => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).startsWith('echo-mv://'), 'preview background video', 8000);
      lyricsPage.querySelector('.mms-backdrop-video').dispatch('ended');
      await settle(2);
      check(
        'a finished background restarts instead of being dropped',
        String(lyricsPage.querySelector('.mms-backdrop-video')?.src).startsWith('echo-mv://')
          && !calls.some((call) => call.method === 'mvRelease'),
        calls.filter((call) => call.method === 'mvRelease').length ? 'released' : 'still attached',
      );
    }

    // A pasted link is bound to the playing song (and remembered).
    const linkInput = pageRoot.querySelectorAll('.mms-search-input').find((item) => String(item.placeholder || '').includes('BV 号'));
    check('the custom-link field is offered', Boolean(linkInput), pageRoot.allText().slice(0, 0) || '');
    if (linkInput) {
      linkInput.value = 'https://www.bilibili.com/video/BVCUSTOM';
      const bindLinkButton = pageRoot.querySelectorAll('.mms-primary').find((item) => item.textContent === '绑定到当前歌曲');
      check('the custom-link row has a bind button', Boolean(bindLinkButton));
      bindLinkButton?.click();
      await waitFor(
        () => calls.some((call) => call.method === 'mvBindUrl' && call.payload?.url === 'https://www.bilibili.com/video/BVCUSTOM'),
        'custom link binding',
      );
      const customCall = calls.filter((call) => call.method === 'mvBindUrl').pop();
      check(
        'a pasted link is bound to the current song',
        customCall?.payload?.trackId === 'streaming:netease:1' && customCall?.payload?.url === 'https://www.bilibili.com/video/BVCUSTOM',
        JSON.stringify(customCall?.payload || {}),
      );
      await waitFor(() => pageRoot.allText().includes('已绑定'), 'bound video shown');
      check('the settings page shows the bound video', pageRoot.allText().includes('已绑定'));
    }

    // Candidate count: one knob for auto-matching and the list length.
    const countSlider = pageRoot.querySelectorAll('.mms-bg-slider')
      .map((wrap) => wrap.children[0])
      .find((item) => item?.min === '2' && item?.max === '20');
    check('the candidate count slider is offered', Boolean(countSlider));
    if (countSlider) {
      countSlider.value = '4';
      countSlider.dispatch('change');
      await waitFor(() => calls.some((call) => call.method === 'setSettings' && call.payload?.mvCandidateLimit === 4), 'candidate limit saved');
      check('the candidate count is persisted', calls.some((call) => call.method === 'setSettings' && call.payload?.mvCandidateLimit === 4));

      // Every slider also takes a typed value, so exact numbers do not depend on
      // dragging a range.
      const countNumber = countSlider.parentNode?.querySelectorAll('.mms-bg-number')[0];
      check(
        'the candidate count offers a number field',
        Boolean(countNumber) && countNumber.type === 'number',
        `type=${countNumber?.type ?? '(none)'}`,
      );
      if (countNumber) {
        countNumber.value = '15';
        countNumber.dispatch('change');
        await waitFor(
          () => calls.some((call) => call.method === 'setSettings' && call.payload?.mvCandidateLimit === 15),
          'typed candidate count saved',
        );
        check(
          'a typed value is applied exactly like the slider',
          calls.some((call) => call.method === 'setSettings' && call.payload?.mvCandidateLimit === 15),
          `value=${countNumber.value} slider=${countSlider.value}`,
        );
        // Out-of-range input is clamped to the slider's own bounds.
        countNumber.value = '999';
        countNumber.dispatch('change');
        await waitFor(
          () => calls.some((call) => call.method === 'setSettings' && call.payload?.mvCandidateLimit === 20),
          'typed candidate count clamped',
        );
        check(
          'a typed value is clamped to the slider range',
          calls.some((call) => call.method === 'setSettings' && call.payload?.mvCandidateLimit === 20) && countNumber.value === '20',
          `value=${countNumber.value}`,
        );
      }
    }
  }

  // --- picture presets ----------------------------------------------------
  const presetSelect = pageRoot.querySelectorAll('.mms-select')
    .find((item) => item.children.some((child) => child.value === 'cinema'));
  check('the picture presets are offered', Boolean(presetSelect));
  if (presetSelect) {
    presetSelect.value = 'cinema';
    presetSelect.dispatch('change');
    await waitFor(
      () => calls.some((call) => call.method === 'setSettings' && call.payload?.mvImmersiveBackgroundWidthPercent === 125),
      'preset applied',
    );
    await waitFor(
      () => lyricsPage.querySelector('.mms-lyrics-bg')?.style.getPropertyValue('--mms-immersive-width') === '125%',
      'preset reaches the layer',
    );
    const presetCall = calls.filter((call) => call.method === 'setSettings' && call.payload?.mvImmersiveBackgroundWidthPercent === 125).pop();
    check(
      'a preset writes size + fitting + zoom together',
      presetCall?.payload?.mvImmersiveBackgroundFit === 'cover'
        && presetCall?.payload?.mvImmersiveBackgroundHeightPercent === 100
        && presetCall?.payload?.mvImmersiveBackgroundScalePercent === 100
        && presetCall?.payload?.mvImmersiveBackgroundAutoScale === false,
      JSON.stringify(presetCall?.payload || {}).slice(0, 140),
    );
    const layerStyle = lyricsPage.querySelector('.mms-lyrics-bg')?.style;
    check(
      'the preset reaches the background layer',
      layerStyle?.getPropertyValue('--mms-immersive-width') === '125%'
        && layerStyle?.getPropertyValue('--mms-immersive-fit') === 'cover'
        && lyricsPage.querySelector('.mms-lyrics-bg')?.dataset.fit === 'cover',
      `width=${layerStyle?.getPropertyValue('--mms-immersive-width')} fit=${layerStyle?.getPropertyValue('--mms-immersive-fit')}`,
    );
    const fitSelect = pageRoot.querySelectorAll('.mms-select')
      .find((item) => item.children.some((child) => child.value === 'none'));
    check('the raw fitting control is offered too', Boolean(fitSelect));
  }

  // --- community MV engine (ECHO-main's MvService over RPC) ----------------
  mainResponses.mvEngineStatus = {
    ok: true,
    result: {
      ready: true,
      error: null,
      database: 'C:\\Temp\\echo-mms-mv.sqlite',
      tracks: 3,
      settings: { autoSearch: true, immersiveBackgroundScalePercent: 115, syncMode: 'balanced', enabledProviders: ['bilibili', 'youtube'] },
      account: { connected: true, displayName: '测试账号', hasCookie: true },
    },
  };
  mainResponses.mvGetSettings = { ok: true, result: { autoSearch: true, immersiveBackgroundScalePercent: 115, syncMode: 'balanced' } };
  mainResponses.mvSetSettings = { ok: true, result: { settings: { autoSearch: true }, config: {} } };
  mainResponses.mvGetSelected = { ok: true, result: null };
  mainResponses.mvSearchNetworkCandidatesForSnapshot = {
    ok: true,
    result: [
      { id: 'bilibili:BVENGINE1', title: '晴天 官方 MV', uploader: '官方', url: 'https://www.bilibili.com/video/BVENGINE1', score: 0.93, viewCount: 12_000_000, durationSeconds: 269, reasons: ['标题完全匹配', '播放量高'] },
      { id: 'bilibili:BVENGINE2', title: '晴天 翻唱', uploader: 'UP', url: 'https://www.bilibili.com/video/BVENGINE2', score: 0.61, viewCount: 2000, durationSeconds: 240, reasons: ['标题部分匹配'] },
    ],
  };
  mainResponses.mvGetTemporaryPlayableForSnapshot = {
    ok: true,
    result: {
      id: 'temporary:engine-1',
      trackId: 'streaming:netease:1',
      provider: 'bilibili',
      sourceId: 'BVENGINE1',
      title: '晴天 官方 MV',
      providerUrl: 'https://www.bilibili.com/video/BVENGINE1',
      mediaUrl: 'echo-mv://ephemeral/engine-token-1',
      qualityLabel: '1080P',
      playableInApp: true,
      offsetMs: 0,
    },
  };
  mainResponses.mvSelectVideo = {
    ok: true,
    result: {
      id: 'video-engine-1',
      sourceId: 'BVENGINE1',
      provider: 'bilibili',
      title: '晴天 官方 MV',
      providerUrl: 'https://www.bilibili.com/video/BVENGINE1',
      mediaUrl: 'echo-mv://stream/video-engine-1/bilibili-qn-80',
      qualityLabel: '1080P',
      playableInApp: true,
      offsetMs: 0,
    },
  };
  mainResponses.mvResolveStreams = {
    ok: true,
    result: { video: { id: 'video-engine-1', title: '晴天 官方 MV' }, variants: [
      { id: 'bilibili-dash-qn-80', label: '1080P', protocol: 'direct', playableInApp: true, qualityTier: '1080p' },
      { id: 'bilibili-dash-qn-64', label: '720P', protocol: 'direct', playableInApp: true, qualityTier: '720p' },
    ] },
  };
  mainResponses.mvSetQuality = { ok: true, result: { id: 'video-engine-1', qualityLabel: '720P', selectedQualityId: 'bilibili-dash-qn-64' } };
  mainResponses.mvSetOffset = { ok: true, result: { id: 'video-engine-1', offsetMs: 500 } };

  const reloadButton = pageRoot.querySelectorAll('.mms-ghost').find((item) => item.textContent.includes('刷新引擎状态'));
  check('background page offers the MV engine section', Boolean(reloadButton));
  await waitFor(() => pageRoot.allText().includes('echo-mms-mv.sqlite'), 'MV engine status');
  check('MV engine status is shown', pageRoot.allText().includes('echo-mms-mv.sqlite') && pageRoot.allText().includes('已登记 3 首'), 'engine status rendered');
  await waitFor(() => calls.some((call) => call.method === 'mvEngineStatus'), 'mvEngineStatus call');
  check(
    'engine settings are pushed into the engine',
    calls.some((call) => call.method === 'mvSetSettings' && call.payload?.mvImmersiveBackgroundScalePercent === 115),
    JSON.stringify(calls.find((call) => call.method === 'mvSetSettings')?.payload || {}).slice(0, 90),
  );

  const engineSearchButton = pageRoot.querySelectorAll('.mms-primary').find((item) => item.textContent.includes('用引擎搜索候选'));
  check('engine candidate search button present', Boolean(engineSearchButton), `disabled=${engineSearchButton?.disabled}`);
  if (engineSearchButton) {
    const searchesBefore = calls.filter((call) => call.method === 'mvSearchNetworkCandidatesForSnapshot').length;
    engineSearchButton.click();
    await waitFor(
      () => calls.filter((call) => call.method === 'mvSearchNetworkCandidatesForSnapshot').length > searchesBefore,
      'engine candidate search call',
    );
    check('the engine search runs for the current track', calls.filter((call) => call.method === 'mvSearchNetworkCandidatesForSnapshot').length > searchesBefore);
    await waitFor(() => pageRoot.allText().includes('标题完全匹配'), 'engine candidates');
    const engineText = pageRoot.allText();
    check('engine candidates show score and reasons', engineText.includes('匹配度 93%') && engineText.includes('标题完全匹配'), engineText.slice(0, 120));
    // The engine's scored candidates and the mod's name search are the same
    // Bilibili query: they used to be rendered as two separate lists ("why are
    // there two candidate boxes?"). They are merged into one now.
    check(
      'the settings page shows exactly one candidate list',
      pageRoot.querySelectorAll('.mms-bg-candidates').length === 1,
      `${pageRoot.querySelectorAll('.mms-bg-candidates').length} list(s)`,
    );
    const engineRow = pageRoot.querySelectorAll('.mms-bg-candidate').find((row) => row.allText().includes('匹配度 93%'));
    const engineApplyButton = engineRow?.querySelectorAll('.mms-primary').find((item) => item.textContent === '用这个');
    check('engine candidates can be applied', Boolean(engineApplyButton), engineRow?.allText().slice(0, 80) || 'no engine row');
    if (engineApplyButton) {
      engineApplyButton.click();
      await waitFor(
        () => calls.some((call) => call.method === 'mvBindUrl' && String(call.payload?.url || '').includes('BVENGINE1')),
        'engine candidate binding',
      );
      check(
        'an engine candidate is remembered for the song too',
        calls.some((call) => call.method === 'mvBindUrl' && String(call.payload?.url || '').includes('BVENGINE1')),
        JSON.stringify(calls.filter((call) => call.method === 'mvBindUrl').slice(-1)[0]?.payload || {}),
      );
      await waitFor(() => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).startsWith('echo-mv://'), 'engine playback', 8000);
      check(
        'the applied engine candidate plays its stream',
        String(lyricsPage.querySelector('.mms-backdrop-video')?.src).startsWith('echo-mv://')
          && !calls.some((call) => call.method === 'prepareMvBackground'),
        String(lyricsPage.querySelector('.mms-backdrop-video')?.src).slice(0, 60),
      );
    }
  }

  // Back to the audio page for the rest of the suite (the MV page keeps its own
  // root in the real app, so nothing it showed was thrown away here either).
  pageRoot = audioPageRoot;

  check(
    'played tracks are registered with the MV engine',
    calls.some((call) => call.method === 'rememberTrack' && String(call.payload?.id || '').includes('streaming:')),
    JSON.stringify(calls.find((call) => call.method === 'rememberTrack')?.payload || {}).slice(0, 90),
  );

  // --- lyrics-page MV panel ------------------------------------------------
  await waitFor(() => lyricsPage.querySelector('.mms-mv-panel'), 'MV panel');
  const mvPanel = lyricsPage.querySelector('.mms-mv-panel');
  check('lyrics-page MV panel is mounted', Boolean(mvPanel));
  if (mvPanel) {
    check(
      'MV panel exposes the community actions',
      ['重新匹配', '-0.5s', '+0.5s', '偏移归零', '隐藏歌词', '关闭背景'].every((label) => mvPanel.allText().includes(label)),
      mvPanel.allText().slice(0, 120),
    );
    check(
      'the panel header offers a settings entry',
      mvPanel.querySelectorAll('.mms-mv-panel-action').some((item) => item.textContent.includes('设置')),
      mvPanel.querySelectorAll('.mms-mv-panel-action').map((item) => item.textContent).join(','),
    );

    // The gear opens the full settings drawer right on the lyrics page.
    const settingsButton = mvPanel.querySelectorAll('.mms-mv-panel-action').find((item) => item.textContent.includes('设置'));
    settingsButton?.click();
    await waitFor(() => lyricsPage.querySelector('.mms-mv-drawer')?.dataset.open === 'true', 'settings drawer opens');
    const drawer = lyricsPage.querySelector('.mms-mv-drawer');
    check('the settings drawer opens on the lyrics page', drawer?.dataset.open === 'true');
    const drawerText = drawer ? drawer.allText() : '';
    check(
      'the drawer carries the full settings UI',
      ['画面预设', '画面宽度', '填充方式', '候选数量', '自定义视频链接', '匹配方式'].every((label) => drawerText.includes(label)),
      drawerText.slice(0, 160),
    );

    // A change made in the drawer rebuilds it and reaches the live layer.
    const drawerFitSelect = drawer?.querySelectorAll('.mms-select')
      .find((item) => item.children.some((child) => child.value === 'none'));
    check('the drawer exposes the fitting control', Boolean(drawerFitSelect));
    if (drawerFitSelect) {
      drawerFitSelect.value = 'contain';
      drawerFitSelect.dispatch('change');
      await waitFor(
        () => calls.some((call) => call.method === 'setSettings' && call.payload?.mvImmersiveBackgroundFit === 'contain'),
        'drawer setting saved',
      );
      await waitFor(
        () => lyricsPage.querySelector('.mms-lyrics-bg')?.dataset.fit === 'contain',
        'drawer setting reaches the layer',
      );
      check(
        'a drawer change reaches the background layer',
        lyricsPage.querySelector('.mms-lyrics-bg')?.dataset.fit === 'contain',
        `fit=${lyricsPage.querySelector('.mms-lyrics-bg')?.dataset.fit}`,
      );
    }
    const closeDrawer = lyricsPage.querySelector('.mms-mv-drawer')?.querySelectorAll('.mms-mv-panel-action')[0];
    closeDrawer?.click();
    await settle(2);
    check('the drawer can be collapsed', lyricsPage.querySelector('.mms-mv-drawer')?.dataset.open === 'false');

    const disableButton = mvPanel.querySelectorAll('.mms-ghost').find((item) => item.textContent === '关闭背景');
    disableButton?.click();
    await settle(3);
    check('MV panel can turn the background off', calls.some((call) => call.method === 'setSettings' && call.payload?.mvEnabled === false));
    // Restore it through the player-bar switch (the panel is gone while off).
    transportBar.querySelector('.mms-backdrop-toggle')?.click();
    await waitFor(() => lyricsPage.querySelector('.mms-mv-panel'), 'background restored', 8000);
    check('the background can be switched back on', Boolean(lyricsPage.querySelector('.mms-lyrics-bg')));
  }

  // --- panel actions work for tracks ECHO itself started --------------------
  // Playback started outside the mod page was never registered, so the panel's
  // offset buttons did nothing and the feedback only appeared on the hidden
  // sidebar page. The status carries the full track, so it is registered now and
  // the confirmation shows on the lyrics page.
  const foreignTrack = {
    id: 'streaming:netease:9',
    stableKey: 'streaming:netease:9',
    mediaType: 'streaming',
    provider: 'netease',
    providerTrackId: '9',
    title: '本机播放的歌',
    artist: '别的艺人',
    album: '专辑',
    duration: 200,
  };
  player.status = async () => ({
    state: 'playing',
    currentTrackId: 'streaming:netease:9',
    positionSeconds: 12,
    durationSeconds: 200,
    currentTrack: foreignTrack,
  });
  await waitFor(
    () => calls.some((call) => call.method === 'rememberTrack' && call.payload?.id === 'streaming:netease:9'),
    'status track registered',
    8000,
  );
  check(
    'a track started outside the mod page is registered from the player status',
    calls.some((call) => call.method === 'rememberTrack' && call.payload?.id === 'streaming:netease:9'),
    JSON.stringify(calls.filter((call) => call.method === 'rememberTrack').slice(-1)[0]?.payload || {}).slice(0, 90),
  );
  const panelOffset = lyricsPage.querySelector('.mms-mv-panel')
    ?.querySelectorAll('.mms-ghost')
    .find((item) => item.textContent === '+0.5s');
  check('the panel offset button is present', Boolean(panelOffset));
  if (panelOffset) {
    panelOffset.click();
    await waitFor(
      () => calls.some((call) => call.method === 'mvSetOffset' && call.payload?.trackId === 'streaming:netease:9'),
      'offset applied to the status track',
      8000,
    );
    const offsetCall = calls.filter((call) => call.method === 'mvSetOffset').slice(-1)[0];
    check(
      'the offset button works for that track too',
      offsetCall?.payload?.trackId === 'streaming:netease:9',
      JSON.stringify(offsetCall?.payload || {}),
    );
    await waitFor(
      () => String(lyricsPage.querySelector('.mms-backdrop-status')?.textContent || '').includes('MV 偏移'),
      'offset confirmation on the lyrics page',
      8000,
    );
    check(
      'the action confirms itself on the lyrics page',
      String(lyricsPage.querySelector('.mms-backdrop-status')?.textContent || '').includes('MV 偏移')
        && lyricsPage.querySelector('.mms-backdrop-status')?.dataset.visible === 'true',
      String(lyricsPage.querySelector('.mms-backdrop-status')?.textContent || '').slice(0, 60),
    );
  }

  // --- a failed first match must not latch the track ------------------------
  // Entering the song detail page while the MV lookup fails used to keep the
  // track id, so no later poll ever retried: the video only appeared after the
  // background switch was toggled off and on (which cleared the id).
  const retryTrack = {
    id: 'streaming:netease:77',
    stableKey: 'streaming:netease:77',
    mediaType: 'streaming',
    provider: 'netease',
    providerTrackId: '77',
    title: '需要重试的歌',
    artist: '艺人',
    duration: 200,
  };
  mainResponses.findMvCandidates = { ok: false, error: '搜索暂时失败' };
  mainResponses.mvGetSelected = { ok: true, result: null };
  mainResponses.mvSearchNetworkCandidatesForSnapshot = { ok: false, error: '引擎暂时失败' };
  mainResponses.mvGetTemporaryPlayableForSnapshot = { ok: false, error: '引擎暂时失败' };
  mainResponses.mvSelectVideo = { ok: false, error: '引擎暂时失败' };
  mainResponses.prepareMvProgressive = { ok: false, error: '回退暂时失败' };
  player.status = async () => ({
    state: 'playing',
    currentTrackId: 'streaming:netease:77',
    positionSeconds: 5,
    durationSeconds: 200,
    currentTrack: retryTrack,
  });
  await waitFor(
    () => calls.some((call) => call.method === 'findMvCandidates' && call.payload?.title === '需要重试的歌'),
    'first failed match attempt',
    12_000,
  );
  const attemptsAfterFailure = calls.filter((call) => call.method === 'findMvCandidates' && call.payload?.title === '需要重试的歌').length;
  check('the first match attempt failed', attemptsAfterFailure >= 1, `${attemptsAfterFailure} attempt(s)`);

  // The lookup works again: the next poll must retry on its own.
  mainResponses.findMvCandidates = {
    ok: true,
    result: [
      { id: 'BVRETRY', title: '需要重试的歌 MV', uploader: 'UP', url: 'https://www.bilibili.com/video/BVRETRY', duration: 200, viewCount: 10, score: 0.9 },
    ],
  };
  mainResponses.mvSearchNetworkCandidatesForSnapshot = {
    ok: true,
    result: [
      { id: 'cand-retry', title: '需要重试的歌 MV', uploader: 'UP', url: 'https://www.bilibili.com/video/BVRETRY', providerUrl: 'https://www.bilibili.com/video/BVRETRY', score: 0.9, viewCount: 10, durationSeconds: 200, reasons: [] },
    ],
  };
  mainResponses.mvSelectVideo = {
    ok: true,
    result: {
      id: 'video-retry',
      sourceId: 'BVRETRY',
      provider: 'bilibili',
      title: '需要重试的歌 MV',
      providerUrl: 'https://www.bilibili.com/video/BVRETRY',
      mediaUrl: 'echo-mv://stream/video-retry/bilibili-qn-80',
      qualityLabel: '1080P',
      playableInApp: true,
      offsetMs: 0,
    },
  };
  await waitFor(
    () => calls.filter((call) => call.method === 'findMvCandidates' && call.payload?.title === '需要重试的歌').length > attemptsAfterFailure,
    'automatic retry after the failure',
    12_000,
  );
  check(
    'a failed match is retried without toggling the switch',
    calls.filter((call) => call.method === 'findMvCandidates' && call.payload?.title === '需要重试的歌').length > attemptsAfterFailure,
    `${calls.filter((call) => call.method === 'findMvCandidates' && call.payload?.title === '需要重试的歌').length} attempt(s)`,
  );
  await waitFor(
    () => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('video-retry'),
    'MV loads on the retry',
    12_000,
  );
  check(
    'the MV loads on the retry',
    String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('video-retry'),
    String(lyricsPage.querySelector('.mms-backdrop-video')?.src).slice(0, 60),
  );

  // --- a stream that never starts must not fake a playing background -------
  // `playBackdropSource` used to announce `playing` before a single frame
  // arrived, so a stalled request or an expired variant showed as an opaque
  // black layer, and because a src was set the supervisor timer never retried:
  // the only way out was toggling the player-bar switch by hand.
  const stallTrack = {
    id: 'streaming:netease:88',
    stableKey: 'streaming:netease:88',
    mediaType: 'streaming',
    provider: 'netease',
    providerTrackId: '88',
    title: '卡住的歌',
    artist: '艺人',
    duration: 200,
  };
  mainResponses.findMvCandidates = {
    ok: true,
    result: [{ id: 'BVSTALL', title: '卡住的歌 MV', uploader: 'UP', url: 'https://www.bilibili.com/video/BVSTALL', duration: 200, viewCount: 10, score: 0.9 }],
  };
  mainResponses.mvSearchNetworkCandidatesForSnapshot = {
    ok: true,
    result: [{ id: 'cand-stall', title: '卡住的歌 MV', uploader: 'UP', url: 'https://www.bilibili.com/video/BVSTALL', providerUrl: 'https://www.bilibili.com/video/BVSTALL', score: 0.9, viewCount: 10, durationSeconds: 200, reasons: [] }],
  };
  mainResponses.mvSelectVideo = {
    ok: true,
    result: {
      id: 'video-stall',
      sourceId: 'BVSTALL',
      provider: 'bilibili',
      title: '卡住的歌 MV',
      providerUrl: 'https://www.bilibili.com/video/BVSTALL',
      mediaUrl: 'echo-mv://stream/video-stall/bilibili-qn-80',
      qualityLabel: '1080P',
      playableInApp: true,
      offsetMs: 0,
    },
  };
  mainResponses.mvResolveMediaUrl = { ok: true, result: { url: 'http://127.0.0.1:9/stall-proxy.mp4', qualityLabel: '1080P', durationSeconds: 200, mimeType: 'video/mp4' } };
  mainResponses.prepareMvProgressive = { ok: true, result: { url: 'http://127.0.0.1:9/stall-progressive.mp4', qualityLabel: '720P', durationSeconds: 200, sizeBytes: 1, mimeType: 'video/mp4', mode: 'progressive' } };
  player.status = async () => ({
    state: 'playing',
    currentTrackId: 'streaming:netease:88',
    positionSeconds: 7,
    durationSeconds: 200,
    currentTrack: stallTrack,
  });

  // The stub's <video> fires `playing` synchronously; neuter it so the source is
  // handed over without ever starting, exactly like a stalled CDN request.
  const originalPlay = Element.prototype.play;
  Element.prototype.play = function stalledPlay() { return Promise.resolve(); };
  try {
    await waitFor(
      () => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('video-stall'),
      'stalled stream handed to the video',
      12_000,
    );
    const layer = lyricsPage.querySelector('.mms-lyrics-bg');
    check(
      'a stream that has not started is not reported as playing',
      layer?.dataset.state === 'loading',
      `state=${layer?.dataset.state}`,
    );
    // The whole point: owning a stream reveals the layer, exactly like ECHO-main
    // rendering its background wrapper once a URL exists. Waiting for "playing"
    // left the MV invisible (the reported blank page) even though it was loading.
    check(
      'owning a stream reveals the layer before it plays',
      layer?.dataset.source === 'ready' && layer?.dataset.playing === 'false',
      `source=${layer?.dataset.source} playing=${layer?.dataset.playing}`,
    );
    check(
      'the status pill says the stream is still loading',
      String(lyricsPage.querySelector('.mms-backdrop-status')?.textContent || '').includes('正在加载'),
      String(lyricsPage.querySelector('.mms-backdrop-status')?.textContent || '').slice(0, 60),
    );

    const proxyCallsBefore = calls.filter((call) => call.method === 'mvResolveMediaUrl').length;
    await waitFor(
      () => calls.filter((call) => call.method === 'mvResolveMediaUrl').length > proxyCallsBefore,
      'the stalled stream is retried on its own',
      20_000,
    );
    check(
      'a stalled stream is retried without toggling the switch',
      calls.filter((call) => call.method === 'mvResolveMediaUrl').length > proxyCallsBefore,
      `${calls.filter((call) => call.method === 'mvResolveMediaUrl').length - proxyCallsBefore} retry step(s)`,
    );
  } finally {
    Element.prototype.play = originalPlay;
  }

  // --- the lyrics-page drawer must follow the engine/account state ---------
  // After a restart a signed-in Bilibili account showed as 未登录 in the drawer
  // (and its 刷新状态 button looked dead) because loadMvEngine() only re-rendered
  // the sidebar page, never the open drawer.
  const panelSettings = lyricsPage.querySelector('.mms-mv-panel')
    ?.querySelectorAll('.mms-mv-panel-action')
    .find((item) => item.textContent.includes('设置'));
  check('the MV panel still offers the settings drawer', Boolean(panelSettings));
  if (panelSettings) {
    panelSettings.click();
    await settle(2);
    const drawer = lyricsPage.querySelector('.mms-mv-drawer');
    check('the drawer opens for the account check', drawer?.dataset.open === 'true', `open=${drawer?.dataset.open}`);
    const refreshStatus = drawer?.querySelectorAll('.mms-ghost').find((item) => item.textContent.includes('刷新状态'));
    check('the drawer offers 刷新状态', Boolean(refreshStatus));
    mainResponses.mvEngineStatus = {
      ok: true,
      result: {
        ready: true,
        error: null,
        database: 'C:\\Temp\\echo-mms-mv.sqlite',
        tracks: 3,
        settings: { autoSearch: true, immersiveBackgroundScalePercent: 115, syncMode: 'balanced', enabledProviders: ['bilibili', 'youtube'] },
        account: { connected: true, displayName: 'B站小号', hasCookie: true },
      },
    };
    refreshStatus?.click();
    await waitFor(
      () => String(drawer?.allText() || '').includes('B站小号'),
      'the drawer follows the refreshed account',
      8000,
    );
    check(
      'the drawer picks up the refreshed B站 login state',
      String(drawer?.allText() || '').includes('B站小号'),
      String(drawer?.allText() || '').slice(0, 140),
    );

    // Adjusting a value rebuilds the panel, and replacing a scroll container's
    // children clamps scrollTop — which is what made the settings panel jump back
    // to the top ("the page slides up") while adjusting values near the bottom.
    const drawerBody = drawer?.querySelector('.mms-mv-drawer-body');
    const drawerNumber = drawerBody?.querySelectorAll('.mms-bg-number')[0];
    check(
      'the drawer offers a number field to adjust',
      Boolean(drawerBody) && Boolean(drawerNumber) && drawerNumber.type === 'number',
      `type=${drawerNumber?.type ?? '(none)'}`,
    );
    if (drawerBody && drawerNumber) {
      drawerBody.scrollTop = 140;
      const savesBefore = calls.filter((call) => call.method === 'setSettings').length;
      drawerNumber.value = String((Number(drawerNumber.value) || 0) + 1);
      drawerNumber.dispatch('change');
      await waitFor(
        () => calls.filter((call) => call.method === 'setSettings').length > savesBefore,
        'the drawer value change is saved',
        8000,
      );
      // The panel is rebuilt on the next supervisor tick.
      await new Promise((resolveWait) => setTimeout(resolveWait, 2400));
      check(
        'adjusting a value keeps the panel scroll position',
        Number(drawerBody.scrollTop) === 140,
        `scrollTop=${drawerBody.scrollTop}`,
      );
    }
    const closeDrawerButton = drawer?.querySelectorAll('.mms-mv-panel-action')[0];
    closeDrawerButton?.click();
    await settle(2);
  }

  // --- the offset buttons must actually move the running video -------------
  // engineSetOffset() updated state.mvOffset and the stored value but never
  // backdrop.offsetMs, which is what the alignment math reads: the notice
  // appeared, the value was saved, and the video did not move — the offset
  // buttons looked dead. The panel body was also rebuilt on every poll tick,
  // which swallowed clicks that landed between mousedown and mouseup.
  const offsetTrack = {
    id: 'streaming:netease:99',
    stableKey: 'streaming:netease:99',
    mediaType: 'streaming',
    provider: 'netease',
    providerTrackId: '99',
    title: '偏移的歌',
    artist: '艺人',
    duration: 200,
  };
  mainResponses.mvGetSelected = { ok: true, result: null };
  mainResponses.findMvCandidates = {
    ok: true,
    result: [{ id: 'BVOFFSET', title: '偏移的歌 MV', uploader: 'UP', url: 'https://www.bilibili.com/video/BVOFFSET', duration: 200, viewCount: 10, score: 0.9 }],
  };
  mainResponses.mvSearchNetworkCandidatesForSnapshot = {
    ok: true,
    result: [{ id: 'cand-offset', title: '偏移的歌 MV', uploader: 'UP', url: 'https://www.bilibili.com/video/BVOFFSET', providerUrl: 'https://www.bilibili.com/video/BVOFFSET', score: 0.9, viewCount: 10, durationSeconds: 200, reasons: [] }],
  };
  mainResponses.mvSelectVideo = {
    ok: true,
    result: {
      id: 'video-offset',
      sourceId: 'BVOFFSET',
      provider: 'bilibili',
      title: '偏移的歌 MV',
      providerUrl: 'https://www.bilibili.com/video/BVOFFSET',
      mediaUrl: 'echo-mv://stream/video-offset/bilibili-qn-80',
      qualityLabel: '1080P',
      playableInApp: true,
      offsetMs: 0,
      durationSeconds: 200,
    },
  };
  // The engine stores the per-track offset on the video record, so both the write
  // and the later read report the same value — exactly like the real MvService.
  let offsetTestMs = 0;
  mainResponses.mvSetOffset = (payload) => {
    offsetTestMs = Number(payload?.offsetMs) || 0;
    return { ok: true, result: { id: 'video-offset', offsetMs: offsetTestMs } };
  };
  mainResponses.mvGetSelected = () => ({
    ok: true,
    result: {
      id: 'video-offset',
      sourceType: 'manual',
      sourceId: 'BVOFFSET',
      provider: 'bilibili',
      title: '偏移的歌 MV',
      providerUrl: 'https://www.bilibili.com/video/BVOFFSET',
      mediaUrl: 'echo-mv://stream/video-offset/bilibili-qn-80',
      playableInApp: true,
      durationSeconds: 200,
      offsetMs: offsetTestMs,
      selected: true,
      score: 1,
    },
  });
  player.status = async () => ({
    state: 'playing',
    currentTrackId: 'streaming:netease:99',
    positionSeconds: 30,
    durationSeconds: 200,
    currentTrack: offsetTrack,
  });

  await waitFor(
    () => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('video-offset'),
    'offset test video loads',
    12_000,
  );
  const offsetVideo = lyricsPage.querySelector('.mms-backdrop-video');
  const offsetButton = lyricsPage.querySelector('.mms-mv-panel')
    ?.querySelectorAll('.mms-ghost')
    .find((item) => item.textContent === '+0.5s');
  check('the offset test has a panel button and a video', Boolean(offsetButton && offsetVideo));
  if (offsetButton && offsetVideo) {
    // The forced alignment on load puts the video at the song position.
    await waitFor(() => Math.abs(Number(offsetVideo.currentTime) - 30) < 0.01, 'video aligned to the song', 8000);
    check(
      'the video starts aligned to the song position',
      Math.abs(Number(offsetVideo.currentTime) - 30) < 0.01,
      `currentTime=${offsetVideo.currentTime}`,
    );
    offsetButton.click();
    await waitFor(
      () => calls.some((call) => call.method === 'mvSetOffset' && call.payload?.offsetMs === 500),
      'offset saved',
      8000,
    );
    await waitFor(() => Math.abs(Number(offsetVideo.currentTime) - 30.5) < 0.01, 'video follows the offset', 8000);
    check(
      'a +0.5s nudge moves the running video, not just the label',
      Math.abs(Number(offsetVideo.currentTime) - 30.5) < 0.01,
      `currentTime=${offsetVideo.currentTime} offset=${calls.filter((call) => call.method === 'mvSetOffset').slice(-1)[0]?.payload?.offsetMs}`,
    );
    check(
      'the panel confirms the new offset',
      String(lyricsPage.querySelector('.mms-backdrop-status')?.textContent || '').includes('0.5s'),
      String(lyricsPage.querySelector('.mms-backdrop-status')?.textContent || '').slice(0, 50),
    );

    // The supervisor timer keeps polling; the buttons must not be swapped out
    // from under a click.
    const panelBody = () => lyricsPage.querySelector('.mms-mv-panel')?.querySelector('.mms-mv-panel-body');
    const buttonNow = () => lyricsPage.querySelector('.mms-mv-panel')
      ?.querySelectorAll('.mms-ghost')
      .find((item) => item.textContent === '+0.5s');
    const buttonBefore = buttonNow();
    const signatureBefore = String(panelBody()?.dataset.signature || '(none)');
    await new Promise((resolveWait) => setTimeout(resolveWait, 2300));
    const buttonAfter = buttonNow();
    const signatureAfter = String(panelBody()?.dataset.signature || '(none)');
    check(
      'the panel buttons survive a poll tick (clicks are not swallowed)',
      Boolean(buttonBefore) && buttonBefore === buttonAfter,
      buttonBefore === buttonAfter ? 'same node' : `rebuilt: ${signatureBefore} -> ${signatureAfter}`,
    );
  }

  // --- a notice must not hide a video that is already playing --------------
  // The confirmation notices (offset, quality, "matched") restore the pill label
  // they memorised after 4.2s. Raised while the stream was still loading, that
  // restored "loading" on top of a running video — the layer is revealed by
  // [data-playing], so it went transparent and ECHO's own backdrop came back:
  // the reported "MV flashes once and then the background goes white".
  const noticeTrack = {
    id: 'streaming:netease:100',
    stableKey: 'streaming:netease:100',
    mediaType: 'streaming',
    provider: 'netease',
    providerTrackId: '100',
    title: '通知的歌',
    artist: '艺人',
    duration: 200,
  };
  mainResponses.mvGetSelected = { ok: true, result: null };
  mainResponses.mvSearchNetworkCandidatesForSnapshot = {
    ok: true,
    result: [{ id: 'cand-notice', title: '通知的歌 MV', uploader: 'UP', url: 'https://www.bilibili.com/video/BVNOTICE', providerUrl: 'https://www.bilibili.com/video/BVNOTICE', score: 0.9, viewCount: 10, durationSeconds: 200, reasons: [] }],
  };
  mainResponses.mvSelectVideo = {
    ok: true,
    result: {
      id: 'video-notice',
      sourceId: 'BVNOTICE',
      provider: 'bilibili',
      title: '通知的歌 MV',
      providerUrl: 'https://www.bilibili.com/video/BVNOTICE',
      mediaUrl: 'echo-mv://stream/video-notice/bilibili-qn-80',
      qualityLabel: '1080P',
      playableInApp: true,
      offsetMs: 0,
      durationSeconds: 200,
    },
  };
  mainResponses.mvSetOffset = { ok: true, result: { id: 'video-notice', offsetMs: 500 } };
  player.status = async () => ({
    state: 'playing',
    currentTrackId: 'streaming:netease:100',
    positionSeconds: 5,
    durationSeconds: 200,
    currentTrack: noticeTrack,
  });

  const noticePlay = Element.prototype.play;
  // Hold playback so the stream sits in `loading` while the notice is raised.
  Element.prototype.play = function heldPlay() { return Promise.resolve(); };
  try {
    await waitFor(
      () => String(lyricsPage.querySelector('.mms-backdrop-video')?.src).includes('video-notice'),
      'notice test stream handed over',
      12_000,
    );
    const noticeLayer = lyricsPage.querySelector('.mms-lyrics-bg');
    check(
      'the stream is loading and hidden before it plays',
      noticeLayer?.dataset.state === 'loading' && noticeLayer?.dataset.playing === 'false',
      `state=${noticeLayer?.dataset.state} playing=${noticeLayer?.dataset.playing}`,
    );
    const noticeNudge = lyricsPage.querySelector('.mms-mv-panel')
      ?.querySelectorAll('.mms-ghost')
      .find((item) => item.textContent === '+0.5s');
    noticeNudge?.click();
    await waitFor(
      () => String(lyricsPage.querySelector('.mms-backdrop-status')?.textContent || '').includes('MV 偏移'),
      'offset notice raised while loading',
      8000,
    );
  } finally {
    // Playback is allowed from here on.
    Element.prototype.play = noticePlay;
  }
  const noticeLayer = lyricsPage.querySelector('.mms-lyrics-bg');
  await waitFor(() => noticeLayer?.dataset.state === 'playing', 'the video starts playing', 10_000);
  check(
    'the layer is revealed by the video itself, not by a label',
    noticeLayer?.dataset.playing === 'true',
    `playing=${noticeLayer?.dataset.playing} state=${noticeLayer?.dataset.state}`,
  );
  // The notice raised while loading expires ~4.2s after the click; the label it
  // restores must not knock the running video out of the reveal state.
  await waitFor(
    () => String(lyricsPage.querySelector('.mms-backdrop-status')?.dataset.visible) === 'false',
    'the loading-time notice expires',
    12_000,
  );
  check(
    'an expiring notice does not hide a playing video',
    noticeLayer?.dataset.state === 'playing' && noticeLayer?.dataset.playing === 'true'
      && noticeLayer?.dataset.source === 'ready',
    `state=${noticeLayer?.dataset.state} playing=${noticeLayer?.dataset.playing} source=${noticeLayer?.dataset.source}`,
  );

  // --- a lost visibility flag is repaired by the supervisor timer ----------
  noticeLayer.dataset.playing = 'false';
  noticeLayer.dataset.source = 'none';
  await waitFor(
    () => noticeLayer.dataset.playing === 'true' && noticeLayer.dataset.source === 'ready',
    'the reveal flags self-heal',
    8000,
  );
  check(
    'a lost reveal flag is repaired on the next poll',
    noticeLayer.dataset.playing === 'true' && noticeLayer.dataset.source === 'ready',
    `playing=${noticeLayer.dataset.playing} source=${noticeLayer.dataset.source}`,
  );

  // --- the layer must sit AFTER ECHO's opaque lyrics backdrop --------------
  // Both are absolutely positioned at z-index 0, so the later sibling paints on
  // top. ECHO commits the lyrics page before its backdrop exists, so the first
  // injection used to land as the page's FIRST child; the backdrop then mounted
  // after it and painted straight over the video. The user saw ECHO's own
  // bright-white centre fading to grey at the sides instead of the MV, and
  // toggling the switch re-created the nodes in the right order — which is why the
  // switch "fixed" it. The supervisor timer now re-asserts the order every pass.
  const orderedLayer = () => lyricsPage.querySelector('.mms-lyrics-bg');
  const orderOf = () => {
    const kids = lyricsPage.children;
    return { backdrop: kids.indexOf(lyricsBackdrop), layer: kids.indexOf(orderedLayer()) };
  };
  check('the MV layer is placed after the app backdrop', orderOf().layer === orderOf().backdrop + 1, JSON.stringify(orderOf()));
  // Simulate ECHO re-committing the page with the backdrop before our layer.
  lyricsPage.insertBefore(orderedLayer(), lyricsBackdrop);
  check(
    'the layer can be pushed in front of the backdrop for the test',
    orderOf().layer < orderOf().backdrop,
    JSON.stringify(orderOf()),
  );
  await waitFor(
    () => orderOf().layer === orderOf().backdrop + 1,
    'the supervisor timer restores the stacking order',
    8000,
  );
  check(
    'a layer that ended up in front of the backdrop is moved back behind it',
    orderOf().layer === orderOf().backdrop + 1,
    JSON.stringify(orderOf()),
  );

  // --- accounts + QR -------------------------------------------------------
  const navTabs = pageRoot.querySelectorAll('.mms-nav-tab');
  const accountsTab = navTabs.find((tab) => tab.textContent.includes('账号'));
  check('accounts tab present', Boolean(accountsTab));
  if (accountsTab) {
    accountsTab.click();
    await waitFor(() => pageRoot.querySelector('.mms-accounts'), 'accounts view');
    const accountsText = pageRoot.allText();
    check('accounts view lists platforms', accountsText.includes('网易云音乐'), accountsText.slice(0, 90));
    check(
      'accounts view shows the signed-in identity',
      accountsText.includes('测试账号') && accountsText.includes('UID 10086') && accountsText.includes('VIP'),
      accountsText.slice(90, 220),
    );
    check('accounts view renders the avatar', Boolean(pageRoot.querySelector('.mms-avatar')?.src?.includes('avatar.jpg')));

    let qrPolls = 0;
    mainResponses.startQrLogin = {
      ok: true,
      result: { key: 'qr-key-1', qrUrl: 'data:image/png;base64,iVBORw0KGgo=', expiresAt: new Date(Date.now() + 300000).toISOString(), state: 'waiting', message: '等待扫码' },
    };
    mainResponses.pollQrLogin = async () => {
      qrPolls += 1;
      return qrPolls < 2
        ? { ok: true, result: { state: 'waiting', saved: false, message: '等待扫码', code: null } }
        : { ok: true, result: { state: 'confirmed', saved: true, message: '登录成功', code: null, status: { provider: 'netease', connected: true } } };
    };

    const qrButton = pageRoot.querySelectorAll('.mms-primary').find((item) => item.textContent.includes('扫码登录'));
    check('QR sign-in button present', Boolean(qrButton));
    if (qrButton) {
      qrButton.click();
      await waitFor(() => pageRoot.querySelector('.mms-qr-image'), 'QR panel');
      const image = pageRoot.querySelector('.mms-qr-image');
      check('QR image rendered from the returned data URL', image?.src === 'data:image/png;base64,iVBORw0KGgo=', String(image?.src).slice(0, 40));
      const qrCall = calls.find((call) => call.method === 'startQrLogin');
      check('startQrLogin called with the clicked platform', Boolean(qrCall?.payload?.provider), JSON.stringify(qrCall?.payload));
      check('QR panel shows the waiting hint', pageRoot.querySelector('.mms-qr')?.allText().includes('请用手机'), pageRoot.querySelector('.mms-qr')?.allText().slice(0, 60));
    }
  }

  // --- the transport MV button: lit state + opening the detail page --------
  // The button reflects the "启用 MV 背景" setting (lit while on, dimmed while off)
  // and, because the main page shows no MV at all, switching it on there also
  // navigates to the song detail page (ECHO's lyrics route, driven by a window
  // CustomEvent — re-dispatching it while already there would toggle back out).
  const navToggle = transportBar.querySelector('.mms-backdrop-toggle');
  check(
    'the transport MV button is lit while the background is enabled',
    navToggle?.dataset.active === 'true'
      && navToggle?.classList.contains('is-soft-active')
      && navToggle?.getAttribute('aria-pressed') === 'true',
    `active=${navToggle?.dataset.active} soft=${navToggle?.classList.contains('is-soft-active')} pressed=${navToggle?.getAttribute('aria-pressed')}`,
  );

  // ECHO is showing something other than the song detail page. `lyrics` is not
  // one of the app's kept-alive routes, so leaving it unmounts `.lyrics-page`.
  lyricsPage.remove();
  await settle(2);
  navEvents.length = 0;
  navToggle.click();
  await settle(3);
  check(
    'switching the background off stays on the current page',
    navEvents.length === 0 && navToggle.dataset.active === 'false' && !navToggle.classList.contains('is-soft-active'),
    `active=${navToggle.dataset.active} events=${navEvents.map((event) => event.type).join(',') || '(none)'}`,
  );
  check(
    'the switched-off button reports the disabled setting',
    navToggle.getAttribute('aria-pressed') === 'false' && String(navToggle.title).includes('关'),
    `pressed=${navToggle.getAttribute('aria-pressed')} title=${navToggle.title}`,
  );

  navEvents.length = 0;
  navToggle.click();
  await settle(3);
  check(
    'switching the background on from the main page opens the song detail page',
    navEvents.some((event) => event.type === 'app:navigate:lyrics' && event.detail?.mode === 'lyrics')
      && navToggle.dataset.active === 'true'
      && navToggle.classList.contains('is-soft-active'),
    `events=${navEvents.map((event) => `${event.type}${event.detail?.mode ? `:${event.detail.mode}` : ''}`).join(',') || '(none)'} active=${navToggle.dataset.active}`,
  );

  // Back on the detail page the button only toggles: dispatching the route event
  // here would send the user straight back out of the page.
  documentShim.body.append(lyricsPage);
  await settle(3);
  navEvents.length = 0;
  navToggle.click();
  await settle(3);
  check(
    'the button never navigates away from the song detail page',
    navEvents.length === 0 && navToggle.dataset.active === 'false',
    `active=${navToggle.dataset.active} events=${navEvents.map((event) => event.type).join(',') || '(none)'}`,
  );
  navEvents.length = 0;
  navToggle.click();
  await settle(3);
  check(
    'turning the background back on while on the detail page stays there',
    navEvents.length === 0 && navToggle.dataset.active === 'true',
    `active=${navToggle.dataset.active} events=${navEvents.map((event) => event.type).join(',') || '(none)'}`,
  );

  // --- cleanup -------------------------------------------------------------
  await cleanup();
  await settle(1);
  check('cleanup releases sidebar + css', disposedSidebar === 2 && disposedCss === 1, `sidebar=${disposedSidebar} css=${disposedCss}`);

  console.log(`\n${failures === 0 ? 'all renderer checks passed' : `${failures} renderer check(s) failed`}`);
  // The page may have left intervals running; exit deterministically.
  process.exit(failures ? 1 : 0);
};

run().catch((error) => {
  console.error('renderer harness error:', error);
  process.exit(2);
});
