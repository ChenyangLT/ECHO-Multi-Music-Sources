// QR-code sign-in for the platforms that expose one.
//
// Bilibili and QQ Music both publish a QR login endpoint that can be driven
// from the main process with nothing but a partitioned Electron session: the
// QR is rendered here (the `qrcode` package), the phone app scans it, and the
// session's own cookie jar collects the resulting login cookies. NetEase keeps
// using the community build's NeteaseQrLoginService (it needs the web login
// page's device fingerprint), and every other platform falls back to a real
// login window whose QR the phone can scan, exactly like ECHO's own account
// login.
//
// A login saved here goes through the same AccountService the cookie form uses,
// so the encrypted accounts.json stays the single source of truth.
import QRCode from 'qrcode';
import { getAccountService } from 'ECHO_MAIN_ROOT/src/main/accounts/AccountService';
import { getNeteaseQrLoginService } from 'ECHO_MAIN_ROOT/src/main/accounts/NeteaseQrLoginService';
import type { AccountProvider, AccountStatus } from 'ECHO_MAIN_ROOT/src/shared/types/accounts';

export type QrLoginState = 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'failed';

export type QrLoginStartResult = {
  key: string;
  qrUrl: string;
  expiresAt: string;
  state: Extract<QrLoginState, 'waiting'>;
  message: string;
};

export type QrLoginPollResult = {
  state: QrLoginState;
  saved: boolean;
  message: string;
  code: number | null;
  status?: AccountStatus;
};

const qrTtlMs = 5 * 60 * 1000;
const bilibiliPartition = 'persist:echo-account-bilibili';
const qqMusicPartition = 'persist:echo-account-qqmusic';
const genericPartitionPrefix = 'persist:echo-account-';

type LoginWindowConfig = {
  url: string;
  domains: string[];
  requiredCookieNames?: string[];
};

const loginWindowConfigs: Partial<Record<AccountProvider, LoginWindowConfig>> = {
  netease: {
    url: 'https://music.163.com/',
    domains: ['music.163.com', '.music.163.com', '163.com', '.163.com'],
    requiredCookieNames: ['MUSIC_U'],
  },
  qqmusic: {
    url: 'https://y.qq.com/',
    domains: ['y.qq.com', '.y.qq.com', 'qq.com', '.qq.com'],
    requiredCookieNames: ['uin', 'qqmusic_key', 'qm_keyst'],
  },
  kugou: {
    url: 'https://www.kugou.com/',
    domains: ['www.kugou.com', '.kugou.com', 'kugou.com'],
  },
  bilibili: {
    url: 'https://passport.bilibili.com/login',
    domains: ['www.bilibili.com', '.bilibili.com', 'bilibili.com', 'passport.bilibili.com', '.passport.bilibili.com'],
    requiredCookieNames: ['SESSDATA', 'DedeUserID', 'bili_jct'],
  },
  soundcloud: {
    url: 'https://soundcloud.com/',
    domains: ['soundcloud.com', '.soundcloud.com'],
    requiredCookieNames: ['oauth_token'],
  },
  osu: {
    url: 'https://osu.ppy.sh/',
    domains: ['osu.ppy.sh', '.osu.ppy.sh', 'ppy.sh', '.ppy.sh'],
    requiredCookieNames: ['osu_session'],
  },
};

const requiredCookieNamesFor = (provider: AccountProvider): string[] | undefined =>
  loginWindowConfigs[provider]?.requiredCookieNames;

const delay = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const text = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const electron = (): typeof import('electron') => {
  // Required lazily so the bundle can be loaded outside Electron for audits.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('electron') as typeof import('electron');
};

const createQrDataUrl = (value: string): Promise<string> =>
  QRCode.toDataURL(value, {
    errorCorrectionLevel: 'medium',
    margin: 2,
    width: 260,
    color: {
      dark: '#111827',
      light: '#ffffff',
    },
  });

const cookieHeaderFrom = (cookies: Array<{ name?: string; value?: string }>): string => {
  const pairs = new Map<string, string>();
  for (const cookie of cookies) {
    if (!cookie?.name || typeof cookie.value !== 'string') {
      continue;
    }
    pairs.set(cookie.name, `${cookie.name}=${cookie.value}`);
  }
  return [...pairs.values()].join('; ');
};

const hasRequiredCookies = (header: string, required: string[] | undefined): boolean => {
  if (!header) {
    return false;
  }
  if (!required?.length) {
    return true;
  }
  const names = new Set(header.split(';').map((part) => part.split('=')[0]?.trim()));
  return required.every((name) => names.has(name));
};

const readSessionCookies = async (session: unknown, domains: string[]): Promise<Array<{ name?: string; value?: string }>> => {
  const target = session as { cookies: { get: (filter: { domain: string }) => Promise<Array<{ name?: string; value?: string }>> } };
  const batches = await Promise.all(
    domains.map((domain) => target.cookies.get({ domain }).catch(() => [])),
  );
  return batches.flat();
};

const collectSessionCookie = async (session: unknown, domains: string[]): Promise<string> => {
  const cookies = await readSessionCookies(session, domains);
  return cookieHeaderFrom(cookies);
};

const clearSessionCookieNames = async (session: unknown, domains: string[], names: string[]): Promise<void> => {
  const target = session as {
    cookies: {
      get: (filter: { domain: string }) => Promise<Array<{ name?: string; value?: string; domain?: string; path?: string; secure?: boolean }>>;
      remove: (url: string, name: string) => Promise<void>;
    };
  };
  const wanted = new Set(names);
  const cookies = await readSessionCookies(session, domains);
  const seen = new Set<string>();
  await Promise.all(cookies.map(async (cookie) => {
    const typed = cookie as { name?: string; value?: string; domain?: string; path?: string; secure?: boolean };
    if (!typed.name || !typed.domain || !wanted.has(typed.name)) {
      return;
    }
    const host = typed.domain.replace(/^\./, '');
    const path = typed.path?.startsWith('/') ? typed.path : '/';
    const key = `${host}\n${path}\n${typed.name}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const protocol = typed.secure === false ? 'http' : 'https';
    await target.cookies.remove(`${protocol}://${host}${path}`, typed.name).catch(() => undefined);
  }));
};

type QrSession = {
  id: string;
  provider: AccountProvider;
  qrDataUrl: string;
  expiresAtMs: number;
  state: QrLoginState;
  message: string;
  saved: boolean;
  status?: AccountStatus;
  poll: () => Promise<QrLoginState>;
  dispose: () => void;
};

const qrMessage = (provider: AccountProvider, state: QrLoginState, fallback?: string | null): string => {
  if (fallback) {
    return fallback;
  }
  const labels: Record<string, string> = {
    netease: '网易云音乐',
    bilibili: '哔哩哔哩',
    qqmusic: 'QQ 音乐',
    kugou: '酷狗音乐',
  };
  const label = labels[provider] ?? provider;
  if (state === 'waiting') {
    return `请用手机 App 扫描二维码登录${label}。`;
  }
  if (state === 'scanned') {
    return '已扫码，请在手机上确认登录。';
  }
  if (state === 'confirmed') {
    return `${label} 登录成功。`;
  }
  if (state === 'expired') {
    return '二维码已过期，请重新生成。';
  }
  return `${label} 扫码登录失败。`;
};

const sessionFetchJson = async (
  session: unknown,
  url: string,
  init: Record<string, unknown> = {},
): Promise<unknown> => {
  const target = session as { fetch: (input: string, init?: Record<string, unknown>) => Promise<Response> };
  const response = await target.fetch(url, {
    method: 'GET',
    credentials: 'include',
    ...init,
  });
  const raw = await response.text();
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

// ---- Bilibili --------------------------------------------------------------

const bilibiliCookieDomains = ['.bilibili.com', 'bilibili.com', 'passport.bilibili.com', '.passport.bilibili.com'];
const bilibiliCookieNamesToClear = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid', 'buvid3', 'b_nut'];

const startBilibiliQrSession = async (id: string): Promise<QrSession> => {
  const session = electron().session.fromPartition(bilibiliPartition);
  await clearSessionCookieNames(session, bilibiliCookieDomains, bilibiliCookieNamesToClear);

  const payload = await sessionFetchJson(session, 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
  const qrUrl = text(data.url);
  const qrKey = text(data.qrcode_key);
  if (!qrUrl || !qrKey) {
    throw new Error('Bilibili 二维码生成失败，请稍后重试。');
  }

  let state: QrLoginState = 'waiting';
  let message = qrMessage('bilibili', 'waiting');

  return {
    id,
    provider: 'bilibili',
    qrDataUrl: await createQrDataUrl(qrUrl),
    expiresAtMs: Date.now() + qrTtlMs,
    state,
    message,
    saved: false,
    async poll() {
      if (state === 'confirmed' || state === 'failed' || state === 'expired') {
        return state;
      }
      const pollPayload = await sessionFetchJson(
        session,
        `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrKey)}&source=main-fe-header`,
      );
      if (!isRecord(pollPayload) || Number(pollPayload.code) !== 0) {
        state = 'failed';
        message = qrMessage('bilibili', 'failed', isRecord(pollPayload) ? text(pollPayload.message) : null);
        return state;
      }

      const pollData = isRecord(pollPayload.data) ? pollPayload.data : {};
      const code = Number(pollData.code);
      if (code === 86101) {
        state = 'waiting';
        message = qrMessage('bilibili', 'waiting', text(pollData.message));
        return state;
      }
      if (code === 86090) {
        state = 'scanned';
        message = qrMessage('bilibili', 'scanned', text(pollData.message));
        return state;
      }
      if (code === 86038) {
        state = 'expired';
        message = qrMessage('bilibili', 'expired', text(pollData.message));
        return state;
      }
      if (code !== 0) {
        state = 'failed';
        message = qrMessage('bilibili', 'failed', text(pollData.message));
        return state;
      }

      state = 'confirmed';
      message = qrMessage('bilibili', 'confirmed');
      return state;
    },
    dispose() {
      /* the partition cookies are intentionally kept for the next sign-in */
    },
  };
};

// ---- QQ Music --------------------------------------------------------------

const qqMusicCookieDomains = ['y.qq.com', '.y.qq.com', 'qq.com', '.qq.com', 'ptlogin2.qq.com', '.ptlogin2.qq.com'];
const qqMusicAppId = '716027609';
const qqMusicDaid = '383';
const qqMusicThirdAid = '100497308';

/** QQ's ptqrtoken is a 31-bit rolling hash of the qrsig cookie. */
const qqHash33 = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash += (hash << 5) + value.charCodeAt(index);
  }
  return 2147483647 & hash;
};

const qqQrsigFrom = (cookies: Array<{ name?: string; value?: string }>): string | null =>
  text(cookies.find((cookie) => cookie.name === 'qrsig')?.value);

const parsePtuiCb = (raw: string): { code: string | null; url: string | null; message: string | null; nickname: string | null } => {
  const match = raw.match(/ptuiCB\(([^)]*)\)/u);
  if (!match) {
    return { code: null, url: null, message: null, nickname: null };
  }
  const parts = match[1].split(',').map((part) => part.trim().replace(/^'|'$/gu, ''));
  return {
    code: parts[0] ?? null,
    url: parts[2] ?? null,
    message: parts[4] ?? null,
    nickname: parts[5] ?? null,
  };
};

const startQqMusicQrSession = async (id: string): Promise<QrSession> => {
  const session = electron().session.fromPartition(qqMusicPartition);
  await clearSessionCookieNames(session, qqMusicCookieDomains, ['qrsig', 'qqmusic_key', 'qm_keyst', 'music_key', 'uin', 'p_skey', 'skey', 'ptui_loginuin']);

  const target = session as { fetch: (input: string, init?: Record<string, unknown>) => Promise<Response> };
  const showResponse = await target.fetch(
    `https://ssl.ptlogin2.qq.com/ptqrshow?appid=${qqMusicAppId}&e=2&l=M&s=3&d=72&v=4&t=${Math.random()}&daid=${qqMusicDaid}&pt_3rd_aid=${qqMusicThirdAid}`,
    {
      headers: {
        Referer: 'https://xui.ptlogin2.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    },
  );
  const image = Buffer.from(await showResponse.arrayBuffer());
  if (image.length === 0) {
    throw new Error('QQ 音乐二维码生成失败，请稍后重试。');
  }
  const qrsig = qqQrsigFrom(await readSessionCookies(session, qqMusicCookieDomains));
  if (!qrsig) {
    throw new Error('QQ 音乐二维码会话建立失败，请稍后重试。');
  }
  const ptqrToken = qqHash33(qrsig);

  let state: QrLoginState = 'waiting';
  let message = qrMessage('qqmusic', 'waiting');

  return {
    id,
    provider: 'qqmusic',
    qrDataUrl: `data:image/png;base64,${image.toString('base64')}`,
    expiresAtMs: Date.now() + qrTtlMs,
    state,
    message,
    saved: false,
    async poll() {
      if (state === 'confirmed' || state === 'failed' || state === 'expired') {
        return state;
      }
      const pollUrl = 'https://ssl.ptlogin2.qq.com/ptqrlogin'
        + `?u1=${encodeURIComponent('https://graph.qq.com/oauth2.0/login_jump')}`
        + `&ptqrtoken=${ptqrToken}`
        + '&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052'
        + `&action=0-0-${Date.now()}`
        + '&js_ver=10233&js_type=1&login_sig=&pt_uistyle=40'
        + `&aid=${qqMusicAppId}&daid=${qqMusicDaid}&pt_3rd_aid=${qqMusicThirdAid}&has_onekey=1`;
      let raw = '';
      try {
        const response = await target.fetch(pollUrl, {
          headers: {
            Referer: 'https://xui.ptlogin2.qq.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        raw = await response.text();
      } catch {
        return state;
      }

      const parsed = parsePtuiCb(raw);
      if (parsed.code === '66') {
        state = 'waiting';
        message = qrMessage('qqmusic', 'waiting', parsed.message);
        return state;
      }
      if (parsed.code === '67') {
        state = 'scanned';
        message = qrMessage('qqmusic', 'scanned', parsed.message);
        return state;
      }
      if (parsed.code === '65') {
        state = 'expired';
        message = qrMessage('qqmusic', 'expired', parsed.message);
        return state;
      }
      if (parsed.code !== '0' || !parsed.url) {
        state = 'failed';
        message = qrMessage('qqmusic', 'failed', parsed.message);
        return state;
      }

      // The callback URL finishes the login and issues the music cookies; the
      // profile page is what actually mints qm_keyst for the web player.
      try {
        await target.fetch(parsed.url, { credentials: 'include' });
      } catch {
        /* the cookie check below decides */
      }
      try {
        await target.fetch('https://y.qq.com/portal/profile.html', { credentials: 'include' });
      } catch {
        /* the cookie check below decides */
      }

      state = 'confirmed';
      message = qrMessage('qqmusic', 'confirmed');
      return state;
    },
    dispose() {
      /* keep the partition cookies for the next sign-in */
    },
  };
};

// ---- Login window fallback -------------------------------------------------

/**
 * Opens the platform's own login page so its QR can be scanned with the phone
 * app. The window closes itself as soon as the required cookies exist and the
 * cookie header is returned through the session.
 */
const startLoginWindowSession = async (provider: AccountProvider, id: string): Promise<QrSession> => {
  const config = loginWindowConfigs[provider];
  if (!config) {
    throw new Error(`${provider} 暂不支持扫码登录，请使用 Cookie 登录。`);
  }

  const { BrowserWindow, session: electronSession } = electron();
  const loginSession = electronSession.fromPartition(`${genericPartitionPrefix}${provider}`);
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: 'ECHO 账号登录',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: loginSession,
    },
  });

  let state: QrLoginState = 'waiting';
  let message = qrMessage(provider, 'waiting');
  let closed = false;
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let bestCookie = '';

  const collect = async (): Promise<string> => {
    const header = await collectSessionCookie(loginSession, config.domains);
    if (hasRequiredCookies(header, config.requiredCookieNames)) {
      bestCookie = header;
      if (!autoCloseTimer) {
        autoCloseTimer = setTimeout(() => {
          if (!window.isDestroyed()) {
            window.close();
          }
        }, 600);
      }
    }
    return header;
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    void window.loadURL(url).catch(() => undefined);
    return { action: 'deny' };
  });
  const pollTimer = setInterval(() => {
    void collect();
  }, 1500);
  window.webContents.on('did-navigate', () => {
    void collect();
  });
  window.once('closed', () => {
    closed = true;
    clearInterval(pollTimer);
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
    }
  });

  await window.loadURL(config.url).catch(() => undefined);

  return {
    id,
    provider,
    // A login window cannot be rendered as an image; the UI shows instructions.
    qrDataUrl: '',
    expiresAtMs: Date.now() + 10 * 60 * 1000,
    state,
    message,
    saved: false,
    async poll() {
      if (state === 'confirmed' || state === 'failed' || state === 'expired') {
        return state;
      }
      await collect();
      if (bestCookie) {
        state = 'confirmed';
        message = qrMessage(provider, 'confirmed');
        return state;
      }
      if (closed) {
        state = 'failed';
        message = '登录窗口已关闭，但没有检测到登录 Cookie。请完成登录后再关闭窗口。';
        return state;
      }
      return state;
    },
    dispose() {
      clearInterval(pollTimer);
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
      }
      if (!window.isDestroyed()) {
        window.destroy();
      }
    },
  };
};

// ---- Manager ---------------------------------------------------------------

type ManagedSession = {
  session: QrSession;
  communityKey?: string;
  collectCookie: () => Promise<string>;
};

const cookieDomainsFor = (provider: AccountProvider): string[] => loginWindowConfigs[provider]?.domains ?? [];

class QrLoginManager {
  private readonly sessions = new Map<string, ManagedSession>();

  private accountService() {
    return getAccountService();
  }

  /** Starts a QR sign-in session; only one is kept alive at a time. */
  async start(provider: AccountProvider): Promise<QrLoginStartResult> {
    for (const managed of this.sessions.values()) {
      managed.session.dispose();
    }
    this.sessions.clear();

    if (provider === 'netease') {
      const started = await getNeteaseQrLoginService().startLogin();
      const session: QrSession = {
        id: started.key,
        provider,
        qrDataUrl: started.qrUrl,
        expiresAtMs: Date.parse(started.expiresAt) || Date.now() + qrTtlMs,
        state: 'waiting',
        message: started.message,
        saved: false,
        async poll() {
          return 'waiting';
        },
        dispose() {
          /* the community service owns this session */
        },
      };
      this.sessions.set(started.key, {
        session,
        communityKey: started.key,
        collectCookie: async () => '',
      });
      return {
        key: started.key,
        qrUrl: started.qrUrl,
        expiresAt: started.expiresAt,
        state: 'waiting',
        message: started.message,
      };
    }

    const id = `${provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const session = provider === 'bilibili'
      ? await startBilibiliQrSession(id)
      : provider === 'qqmusic'
        ? await startQqMusicQrSession(id)
        : await startLoginWindowSession(provider, id);

    this.sessions.set(id, {
      session,
      collectCookie: () => collectSessionCookie(
        electron().session.fromPartition(
          provider === 'bilibili' ? bilibiliPartition : provider === 'qqmusic' ? qqMusicPartition : `${genericPartitionPrefix}${provider}`,
        ),
        cookieDomainsFor(provider),
      ),
    });

    return {
      key: id,
      qrUrl: session.qrDataUrl,
      expiresAt: new Date(session.expiresAtMs).toISOString(),
      state: 'waiting',
      message: session.message,
    };
  }

  async poll(key: string, providerHint?: AccountProvider): Promise<QrLoginPollResult> {
    const trimmed = String(key ?? '').trim();
    if (!trimmed) {
      throw new Error('QR login key is required.');
    }

    const managed = this.sessions.get(trimmed);
    if (!managed) {
      return { state: 'expired', saved: false, message: qrMessage(providerHint ?? 'netease', 'expired'), code: null };
    }

    const provider = managed.session.provider;

    if (managed.communityKey) {
      const result = await getNeteaseQrLoginService().pollLogin(managed.communityKey);
      if (result.state === 'confirmed' || result.state === 'expired' || result.state === 'failed') {
        this.sessions.delete(trimmed);
      }
      return {
        state: result.state,
        saved: result.saved,
        message: result.message,
        code: result.code ?? null,
        status: result.status,
      };
    }

    const session = managed.session;
    if (Date.now() > session.expiresAtMs && session.state !== 'confirmed') {
      session.dispose();
      this.sessions.delete(trimmed);
      return { state: 'expired', saved: false, message: qrMessage(provider, 'expired'), code: null };
    }

    const state = await session.poll();
    if (state === 'confirmed') {
      const cookie = (await managed.collectCookie()) || '';
      if (!hasRequiredCookies(cookie, requiredCookieNamesFor(provider))) {
        session.dispose();
        this.sessions.delete(trimmed);
        return {
          state: 'failed',
          saved: false,
          message: '登录已确认，但没有读到会话 Cookie，请重试。',
          code: null,
        };
      }

      const status = this.accountService().saveCookie(provider, cookie);
      session.dispose();
      this.sessions.delete(trimmed);
      return { state: 'confirmed', saved: true, message: session.message, code: null, status };
    }

    if (state === 'expired' || state === 'failed') {
      session.dispose();
      this.sessions.delete(trimmed);
    }

    return { state, saved: false, message: session.message, code: null };
  }

  disposeAll(): void {
    for (const managed of this.sessions.values()) {
      managed.session.dispose();
    }
    this.sessions.clear();
  }
}

let manager: QrLoginManager | null = null;

export const getQrLoginManager = (): QrLoginManager => {
  manager ??= new QrLoginManager();
  return manager;
};

/** Platforms whose QR sign-in renders a scannable image inside the mod page. */
export const qrLoginProviders: AccountProvider[] = ['netease', 'bilibili', 'qqmusic'];

/** Platforms the login window can sign in (QR is scanned inside the window). */
export const loginWindowProviders: AccountProvider[] = ['netease', 'qqmusic', 'kugou', 'bilibili', 'soundcloud', 'osu'];
