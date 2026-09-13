// Config-modal verification: runs mod/config-ui.js against a tiny DOM stub with
// the loader's `echoConfigUi` context, so a missing string key, a broken control
// or an exception in the custom settings page fails the build instead of showing
// up as an empty modal in the game.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'mod');

const matchSelector = (element, selector) => {
  const simple = String(selector).trim();
  if (simple.startsWith('.')) return element.classList.contains(simple.slice(1));
  if (simple.startsWith('#')) return element.id === simple.slice(1);
  const attr = simple.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/u);
  if (attr) {
    const actual = element.attributes[attr[1]];
    if (actual === undefined) return false;
    return attr[2] === undefined ? true : actual === attr[2];
  }
  return element.tagName === simple.toUpperCase();
};

class Element {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.classList = {
      items: new Set(),
      contains: (name) => this.classList.items.has(name),
      toggle: (name, force) => {
        if (force === undefined ? !this.classList.items.has(name) : force) this.classList.items.add(name);
        else this.classList.items.delete(name);
      },
      toString: () => [...this.classList.items].join(' '),
    };
    this.style = {
      properties: new Map(),
      setProperty(name, value) { this.properties.set(String(name), String(value)); },
      getPropertyValue(name) { return this.properties.get(String(name)) ?? ''; },
    };
    this.listeners = new Map();
    this._text = '';
    this._innerHTML = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.type = '';
    this.src = '';
    this.placeholder = '';
    this.selected = false;
  }

  get className() { return this.classList.toString(); }
  set className(value) { this.classList.items = new Set(String(value).split(/\s+/u).filter(Boolean)); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); }
  get firstElementChild() { return this.children[0] ?? null; }
  get textContent() {
    if (this.children.length) return this.children.map((child) => child.textContent).join('');
    return this._text;
  }
  set textContent(value) {
    this._text = value === null || value === undefined ? '' : String(value);
    this.children = [];
    this.childNodes = this.children;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node === null || node === undefined) continue;
      const child = typeof node === 'string' ? new Element('#text') : node;
      if (typeof node === 'string') child.textContent = node;
      child.parentNode = this;
      this.children.push(child);
    }
  }
  appendChild(node) { this.append(node); return node; }
  insertBefore(node, reference) {
    const index = reference ? this.children.indexOf(reference) : -1;
    node.parentNode = this;
    if (index >= 0) this.children.splice(index, 0, node);
    else this.children.push(node);
    return node;
  }
  replaceChildren(...nodes) { this.children = []; this.childNodes = this.children; this.append(...nodes); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatch(type, event = {}) {
    const payload = { type, preventDefault() {}, stopPropagation() {}, ...event };
    for (const handler of this.listeners.get(type) || []) handler(payload);
  }
  click() { this.dispatch('click'); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const raw = String(selector).trim();
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

const documentStub = {
  createElement: (tag) => new Element(tag),
  head: new Element('head'),
  body: new Element('body'),
  querySelector: (selector) => documentStub.body.querySelector(selector),
  querySelectorAll: (selector) => documentStub.body.querySelectorAll(selector),
  addEventListener() {},
  removeEventListener() {},
};

const schema = JSON.parse(readFileSync(join(packageRoot, 'config.schema.json'), 'utf8'));
const config = JSON.parse(readFileSync(join(packageRoot, 'config.json'), 'utf8'));
const calls = [];
const toasts = [];
let saveHandler = null;
const root = new Element('div');

const responses = {
  status: { bridgeReady: true, mode: 'community-provider-bridge' },
  providers: [{ name: 'netease', enabled: true }, { name: 'bilibili', enabled: true }],
  accountProfiles: [
    { provider: 'netease', connected: true, displayName: '测试账号', username: '10086', avatarUrl: '', vipLabel: 'VIP', error: null },
    { provider: 'bilibili', connected: false, displayName: null, username: null, avatarUrl: null, error: null },
  ],
  qrLoginCapabilities: { qrImage: ['netease', 'bilibili', 'qqmusic'], loginWindow: ['kugou'] },
  mvEngineStatus: {
    ready: true,
    error: null,
    database: 'C:\\Temp\\echo-mms-mv.sqlite',
    tracks: 3,
    account: { connected: true, displayName: '测试账号', hasCookie: true },
    settings: { autoSearch: true },
  },
  startQrLogin: { key: 'qr-1', qrUrl: 'data:image/png;base64,AAAA', expiresAt: new Date().toISOString(), state: 'waiting', message: '等待扫码' },
  pollQrLogin: { state: 'waiting', saved: false, message: '等待扫码', code: null },
};

const invoke = async (method, payload) => {
  calls.push({ method, payload });
  return { ok: true, result: responses[method] ?? null };
};

const echoConfigUi = {
  root,
  manifest: { id: 'echo.multi-music-sources', name: 'ECHO 多平台音源' },
  config,
  schema,
  defaults: config,
  save: async () => undefined,
  close: () => undefined,
  toast: (message) => toasts.push(message),
  onSave: (handler) => { saveHandler = handler; },
  assetUrl: (value) => value,
  modId: 'echo.multi-music-sources',
  ui: {
    form: (formSchema, draft) => {
      const element = new Element('div');
      element.className = 'mmsc-form';
      for (const key of Object.keys(formSchema?.properties || {})) {
        const field = new Element('div');
        field.className = 'mmsc-form-field';
        field.append(new Element('label'));
        field.querySelector('label').textContent = formSchema.properties[key]?.title || key;
        element.append(field);
      }
      return { element, read: () => ({ ...draft }) };
    },
  },
};

const sandbox = {
  echoConfigUi,
  echoExternalMod: { main: { invoke } },
  document: documentStub,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Promise,
  JSON,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Set,
  Map,
  Error,
  RegExp,
  Date,
  URL,
  URLSearchParams,
  Event: class Event { constructor(type) { this.type = type; } },
};
sandbox.globalThis = sandbox;

let failures = 0;
const check = (name, passed, detail) => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
};

const settle = async (times = 8) => {
  for (let index = 0; index < times; index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
};

const source = readFileSync(join(packageRoot, 'config-ui.js'), 'utf8');
const context = vm.createContext(sandbox);
const script = new vm.Script(`(function () {\n${source}\n})()`, { filename: 'config-ui.js' });

let cleanup = null;
try {
  cleanup = script.runInContext(context);
  check('config-ui.js evaluates', typeof cleanup === 'function');
} catch (error) {
  check('config-ui.js evaluates', false, error.message);
}

await settle(12);

const text = (() => {
  const parts = [];
  const walk = (node) => {
    if (node.tagName === 'STYLE') return;
    if (node._text) parts.push(node._text);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return parts.join(' ').replace(/\s+/gu, ' ').trim();
})();
check('bridge status loaded', calls.some((call) => call.method === 'status'), calls.map((call) => call.method).join(','));
check('platforms listed', text.includes('网易云音乐'), text.slice(0, 80));
check(
  'account info rendered in the modal',
  text.includes('测试账号') && text.includes('UID 10086') && text.includes('VIP'),
  text.slice(80, 240),
);
check(
  'background panel rendered with the community settings',
  text.includes('沉浸式 MV 背景') && text.includes('缩放（Z）') && text.includes('按播放量优先匹配'),
  text.slice(240, 420),
);
check(
  'the picture size / fitting controls are rendered',
  text.includes('填充方式') && text.includes('画面宽度') && text.includes('画面高度') && text.includes('窄边（完整）'),
  text.slice(240, 420),
);
check(
  'the candidate count is rendered',
  text.includes('候选数量'),
  text.slice(240, 420),
);
check(
  'background MV engine panel rendered',
  text.includes('社区版 MV 引擎') && text.includes('按名称取 B 站第一个视频') && text.includes('不下载、不缓存'),
  text.slice(420, 640),
);
check(
  'the BBDown downloader controls are gone',
  !text.includes('BBDown') && !text.includes('缓存上限') && !text.includes('缓存目录'),
  text.slice(420, 640),
);
check('engine status probed', calls.some((call) => call.method === 'mvEngineStatus'));
check('no undefined labels in the modal', !/undefined|\[object Object\]/u.test(text), text.slice(0, 120));

const qrButton = root.querySelectorAll('.mmsc-btn-primary').find((item) => item.textContent.includes('扫码登录'));
check('QR button rendered for a QR-capable platform', Boolean(qrButton));
if (qrButton) {
  qrButton.click();
  await settle(6);
  const qrCall = calls.find((call) => call.method === 'startQrLogin');
  check('QR button starts a sign-in session', Boolean(qrCall?.payload?.provider), JSON.stringify(qrCall?.payload));
  const qrPanel = root.querySelector('.mmsc-qr');
  const qrImage = qrPanel?.children.find((child) => child.tagName === 'IMG');
  check('QR image rendered from the returned data URL', qrImage?.src?.startsWith('data:image/png'), String(qrImage?.src).slice(0, 32));
}

if (typeof saveHandler === 'function') {
  const next = await saveHandler();
  check('save returns the draft', Boolean(next) && typeof next === 'object');
  check(
    'save preserves the background keys',
    next?.mvMatchMode === 'first' && next?.mvSourceMode === 'engine' && next?.mvDownloaderPath === undefined,
    JSON.stringify({ match: next?.mvMatchMode, source: next?.mvSourceMode, downloader: next?.mvDownloaderPath }),
  );
} else {
  check('onSave registered', false);
}

if (typeof cleanup === 'function') {
  cleanup();
  check('cleanup removes the injected style', root.children.length === 0 || root.querySelectorAll('style').length === 0);
}

console.log(`\n${failures === 0 ? 'all config-ui checks passed' : `${failures} config-ui check(s) failed`}`);
process.exit(failures ? 1 : 0);
