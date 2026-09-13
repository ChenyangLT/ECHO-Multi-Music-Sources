/*
 * Custom configuration page for ECHO 多平台音源.
 *
 * Shows which platforms the community provider bridge reports, exposes the song
 * background (MV) settings with the same controls and ranges as ECHO-main's
 * immersive MV panel, lets the user sign in (QR code / login window / cookie)
 * without leaving the config modal, and surfaces the bridge status so a failed
 * load is visible instead of silent.
 */
const { root, config, schema, save, close, toast, ui, defaults } = echoConfigUi;

const external = echoExternalMod;
const locale = config.locale === 'en-US' ? 'en-US' : 'zh-CN';
const text = locale === 'zh-CN'
  ? {
      platforms: '音乐平台',
      platformsHint: '音源算法来自 ECHO 社区版，运行在模组主进程里。',
      status: '音源桥接状态',
      bridgeReady: '已加载',
      bridgeFailed: '加载失败',
      accounts: '账号',
      accountsHint: '登录状态保存在 ECHO 的账号文件里（加密存储），和 ECHO 本体共用。',
      saveCookie: '保存',
      clear: '清除',
      connected: '已登录',
      disconnected: '未登录',
      refresh: '刷新状态',
      general: '常规',
      tidalHint: 'TIDAL 搜索需要自己的开发者凭据，其他平台不需要。',
      saved: '已保存',
      failed: '失败',
      background: '歌曲背景（B 站 MV）',
      backgroundHint: '设置项与 ECHO 社区版的 MV 沉浸式背景一一对应。播放栏右侧的开关就是“启用 MV 背景”。',
      enableBackground: '启用 MV 背景',
      enableBackgroundHint: '播放栏右侧的歌曲背景开关与此同步。点进歌曲详情页（歌词页）就会在歌词后面显示匹配到的 B 站 MV。',
      immersive: '沉浸式 MV 背景',
      autoScale: '自动缩放',
      autoScaleHint: '按画面比例自动放大视频，避免出现黑边（开启时填充方式固定为「窄边」）。',
      fit: '填充方式',
      fitCover: '铺满（裁切）',
      fitContain: '窄边（完整）',
      fitFill: '拉伸',
      fitOriginal: '原始尺寸',
      width: '画面宽度',
      height: '画面高度',
      zoom: '缩放（Z）',
      offsetX: '水平位置（X）',
      offsetY: '垂直位置（Y）',
      blur: '毛玻璃模糊',
      brightness: '背景亮度',
      overlay: '暗色遮罩',
      readability: '歌词可读性增强',
      hideLyrics: 'MV 背景播放时隐藏歌词',
      reset: '重置沉浸式背景',
      advanced: '匹配与同步',
      advancedHint: '与社区版一致：开启“按播放量优先匹配”时，匹配度阈值不参与筛选。',
      autoSearch: '自动搜索网络 MV',
      autoPreload: '预加载 MV',
      titleOnly: '只用歌曲名搜索',
      preferViews: '按播放量优先匹配',
      threshold: '自动应用匹配度',
      quality: 'MV 最高画质',
      bestQuality: '最高',
      allow60fps: '允许 60fps',
      followProgress: 'MV 跟随音乐进度',
      followProgressHint: '持续校正 MV 与音频的时间差（不同步时微调播放速度，差距过大时快进）。社区版默认为关闭。',
      syncMode: '同步模式',
      replayOnChange: '切换 MV 后从头对齐',
      qrLogin: '扫码登录',
      loginWindow: '打开登录窗口',
      qrWaiting: '请用手机 App 扫码',
      qrScanned: '已扫码，请在手机上确认',
      qrDone: '登录成功',
      qrExpired: '二维码已过期，请重新生成',
      qrFailed: '扫码登录失败',
      qrRefresh: '重新生成二维码',
      uid: (id) => `UID ${id}`,
      downloaderTitle: '背景 MV 获取（社区版 MV 引擎）',
      downloaderHint: '背景 MV 由移植自社区版的 MV 引擎解析成视频流后直接播放，和社区版完全一致：不下载、不缓存、不占用磁盘。',
      engineLine: '社区版 MV 引擎',
      engineReady: '可用',
      engineUnavailable: '不可用',
      engineDatabase: (path) => `数据库：${path}`,
      engineTracks: (count) => `已记住 ${count} 首歌曲`,
      accountUsed: (name) => `使用已登录 B 站账号的 Cookie${name ? ` · ${name}` : ''}`,
      accountMissing: 'B 站未登录：解析使用匿名身份，高画质可能受限',
      matchMode: 'MV 匹配方式',
      matchModeFirst: '按名称取 B 站第一个视频',
      matchModeScore: '按匹配度评分',
      matchModeViews: '按播放量',
      candidateCount: '候选数量',
      candidateCountHint: '自动匹配取前几个结果，也决定背景设置页候选列表显示多少个（点击候选即可换 MV）。',
      sourceMode: '背景视频来源',
      sourceModeEngine: '社区 MV 引擎（与社区版一致）',
      sourceModeProgressive: 'B 站完整 MP4（引擎失败时回退）',
      searchSuffix: '搜索后缀',
    }
  : {
      platforms: 'Music platforms',
      platformsHint: 'Provider algorithms come from the ECHO Community build and run in the mod main process.',
      status: 'Bridge status',
      bridgeReady: 'Loaded',
      bridgeFailed: 'Failed to load',
      accounts: 'Accounts',
      accountsHint: 'Sign-ins are stored in ECHO\'s (encrypted) account file and shared with the host app.',
      saveCookie: 'Save',
      clear: 'Clear',
      connected: 'Signed in',
      disconnected: 'Not signed in',
      refresh: 'Refresh status',
      general: 'General',
      tidalHint: 'TIDAL search needs its own developer credentials; other platforms do not.',
      saved: 'Saved',
      failed: 'Failed',
      background: 'Song background (Bilibili MV)',
      backgroundHint: 'Every option mirrors ECHO Community\'s immersive MV background. The player-bar switch is "Enable MV background".',
      enableBackground: 'Enable MV background',
      enableBackgroundHint: 'The player-bar switch mirrors this. Opening the song detail page shows the matched Bilibili MV behind the lyrics.',
      immersive: 'Immersive MV background',
      autoScale: 'Auto scale',
      autoScaleHint: 'Scales the video to the window aspect so no letterbox remains (forces the letterbox fitting).',
      fit: 'Fitting',
      fitCover: 'Fill (crop)',
      fitContain: 'Letterbox',
      fitFill: 'Stretch',
      fitOriginal: 'Original size',
      width: 'Video width',
      height: 'Video height',
      zoom: 'Zoom (Z)',
      offsetX: 'Offset X',
      offsetY: 'Offset Y',
      blur: 'Background blur',
      brightness: 'Background brightness',
      overlay: 'Dark overlay',
      readability: 'Enhanced lyrics readability',
      hideLyrics: 'Hide lyrics while the MV plays',
      reset: 'Reset immersive background',
      advanced: 'Matching & sync',
      advancedHint: 'As in the community build: while "prefer the most viewed match" is on, the threshold does not restrict the candidates.',
      autoSearch: 'Auto-search online MV',
      autoPreload: 'Preload MV',
      titleOnly: 'Search by title only',
      preferViews: 'Prefer the most viewed match',
      threshold: 'Auto-apply match threshold',
      quality: 'MV max quality',
      bestQuality: 'Max',
      allow60fps: 'Allow 60fps',
      followProgress: 'Follow the music progress',
      followProgressHint: 'Continuously corrects the MV/audio drift (nudges the video rate, seeks when far off). Off by default in the community build.',
      syncMode: 'Sync mode',
      replayOnChange: 'Align the MV to the song start',
      qrLogin: 'Sign in with QR code',
      loginWindow: 'Open login window',
      qrWaiting: 'Scan with the phone app',
      qrScanned: 'Scanned — confirm on your phone',
      qrDone: 'Signed in',
      qrExpired: 'The code expired, generate a new one',
      qrFailed: 'QR sign-in failed',
      qrRefresh: 'Generate a new code',
      uid: (id) => `UID ${id}`,
      downloaderTitle: 'Background MV acquisition (community MV engine)',
      downloaderHint: 'The background MV is resolved into a stream by the ported community MV engine and played directly, exactly like the community build: nothing is downloaded or cached.',
      engineLine: 'Community MV engine',
      engineReady: 'available',
      engineUnavailable: 'unavailable',
      engineDatabase: (path) => `Database: ${path}`,
      engineTracks: (count) => `${count} track(s) remembered`,
      accountUsed: (name) => `Uses the signed-in Bilibili cookie${name ? ` · ${name}` : ''}`,
      accountMissing: 'Not signed in to Bilibili: resolving anonymously may limit quality',
      matchMode: 'MV match mode',
      matchModeFirst: 'First Bilibili result for the name',
      matchModeScore: 'By match score',
      matchModeViews: 'By view count',
      candidateCount: 'Candidate count',
      candidateCountHint: 'How many results auto-matching and the candidate list on the background page use.',
      sourceMode: 'Background video source',
      sourceModeEngine: 'Community MV engine (same as the community build)',
      sourceModeProgressive: 'Bilibili complete MP4 (fallback when the engine fails)',
      searchSuffix: 'Search suffix',
    };

const platformLabels = {
  netease: '网易云音乐 / NetEase Cloud Music',
  qqmusic: 'QQ 音乐 / QQ Music',
  kugou: '酷狗音乐 / KuGou Music',
  bilibili: '哔哩哔哩 / Bilibili',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  tidal: 'TIDAL',
  qobuz: 'Qobuz',
};

// ---- state ---------------------------------------------------------------

const draft = { ...config };
const invoke = async (method, payload) => {
  const main = external?.main;
  if (!main?.invoke) throw new Error('main bridge unavailable');
  const response = await main.invoke(method, payload);
  // Package methods arrive wrapped twice ({ ok, result } from the loader server
  // and again from the native host), and failures can sit at either level.
  let value = response;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!value || typeof value !== 'object') break;
    if (value.ok === false) throw new Error(String(value.error || 'failed'));
    if (!('result' in value)) break;
    value = value.result;
  }
  return value;
};

const num = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

// ---- styles -------------------------------------------------------------

const style = document.createElement('style');
style.textContent = `
.mmsc{display:flex;flex-direction:column;gap:16px;font:13px/1.5 -apple-system,system-ui,"Segoe UI",sans-serif}
.mmsc-section{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:12px}
.mmsc-section>h4{margin:0;font-size:13px;font-weight:650}
.mmsc-hint{margin:0;color:var(--theme-muted-text,#64748b);font-size:12px}
.mmsc-platforms{display:flex;flex-wrap:wrap;gap:6px}
.mmsc-pill{padding:4px 10px;border-radius:999px;background:rgba(127,127,127,.14);font-size:11px}
.mmsc-pill[data-on="false"]{opacity:.5}
.mmsc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--theme-panel-border,#d8dee9)}
.mmsc-row:first-of-type{border-top:0}
.mmsc-status{font-size:11px;color:var(--theme-muted-text,#64748b);flex:0 0 auto}
.mmsc-input{flex:1 1 200px;padding:7px 10px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:8px;background:var(--theme-field-bg,transparent);color:inherit;font-size:12px}
.mmsc-btn{padding:6px 11px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:12px}
.mmsc-btn-primary{background:var(--theme-accent-solid-bg,#4b55e8);border-color:transparent;color:#fff;font-weight:600}
.mmsc-field{display:flex;flex-direction:column;gap:4px;padding:6px 0}
.mmsc-field>label{font-size:12px;font-weight:600}
.mmsc-field>small{color:var(--theme-muted-text,#64748b);font-size:11px}
.mmsc-range{display:flex;align-items:center;gap:10px}
.mmsc-range input[type="range"]{flex:1;accent-color:var(--theme-accent-solid-bg,#4b55e8)}
.mmsc-range output{min-width:3.4em;text-align:right;font-variant-numeric:tabular-nums;color:var(--theme-muted-text,#64748b);font-size:11px}
.mmsc-switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0}
.mmsc-switch-row span{font-size:12px;font-weight:600}
.mmsc-switch input{accent-color:var(--theme-accent-solid-bg,#4b55e8)}
.mmsc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
.mmsc-qr{display:flex;gap:12px;align-items:flex-start;padding:10px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:10px;width:100%}
.mmsc-qr img{width:150px;height:150px;border-radius:8px;background:#fff;padding:4px}
.mmsc-qr-side{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--theme-muted-text,#64748b)}
.mmsc-qr-side strong{font-size:12px;color:inherit}
.mmsc-identity{display:flex;align-items:center;gap:10px;flex:1 1 200px;min-width:0}
.mmsc-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;background:rgba(127,127,127,.14)}
.mmsc-identity-text{display:flex;flex-direction:column;gap:1px;min-width:0}
.mmsc-identity-text strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmsc-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
`;
root.append(style);

const el = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined && value !== null) node.textContent = String(value);
  return node;
};

const section = (title, hint) => {
  const node = el('div', 'mmsc-section');
  node.append(el('h4', null, title));
  if (hint) node.append(el('p', 'mmsc-hint', hint));
  return node;
};

// ---- controls ------------------------------------------------------------
// Every control records its config key on the field element so "reset" can push
// the defaults back into the UI as well as into the draft.

const controls = [];

/** Free-text control (paths), persisted on blur/change. */
const textField = (key, placeholder, title) => {
  const field = el('div', 'mmsc-field');
  field.dataset.key = key;
  field.append(el('label', null, title || key));
  const input = document.createElement('input');
  input.className = 'mmsc-input';
  input.type = 'text';
  input.placeholder = placeholder || '';
  input.value = typeof draft[key] === 'string' ? draft[key] : '';
  input.addEventListener('change', () => {
    draft[key] = input.value.trim();
  });
  field.append(input);
  controls.push({ key, write: (value) => { input.value = typeof value === 'string' ? value : ''; } });
  return field;
};

/** Range control, mirroring ECHO-main's NumberRangeField. */
const rangeField = (key, { min, max, step = 1, suffix = '', title, hint, transform }) => {
  const field = el('div', 'mmsc-field');
  field.dataset.key = key;
  field.append(el('label', null, title || key));
  const row = el('div', 'mmsc-range');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);

  const toDisplay = (value) => (transform ? transform.toDisplay(value) : num(value, min, max, min));
  const fromDisplay = (value) => (transform ? transform.fromDisplay(value) : Number(value));

  const write = (value) => {
    const display = toDisplay(value);
    input.value = String(display);
    output.textContent = `${display}${suffix}`;
  };

  const output = el('output', null, '');
  input.addEventListener('input', () => {
    draft[key] = fromDisplay(Number(input.value));
    output.textContent = `${input.value}${suffix}`;
  });
  row.append(input, output);
  field.append(row);
  if (hint) field.append(el('small', null, hint));
  controls.push({ key, write });
  write(draft[key]);
  return field;
};

/** Checkbox row, mirroring ECHO-main's ToggleButton rows. */
const toggleField = (key, title, hint, options = {}) => {
  const field = el('div', 'mmsc-field');
  field.dataset.key = key;
  const row = el('div', 'mmsc-switch-row');
  row.append(el('span', null, title || key));
  const switchWrap = el('span', 'mmsc-switch');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.addEventListener('change', () => {
    draft[key] = input.checked;
  });
  switchWrap.append(input);
  row.append(switchWrap);
  field.append(row);
  if (hint) field.append(el('small', null, hint));
  const read = (value) => (options.strict ? value === true : value !== false);
  controls.push({ key, write: (value) => { input.checked = read(value); } });
  input.checked = read(draft[key]);
  return field;
};

const selectField = (key, title, options) => {  const field = el('div', 'mmsc-field');
  field.dataset.key = key;
  field.append(el('label', null, title || key));
  const select = document.createElement('select');
  select.className = 'mmsc-input';
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    select.append(node);
  }
  select.addEventListener('change', () => {
    draft[key] = select.value;
  });
  field.append(select);
  controls.push({ key, write: (value) => { select.value = String(value); } });
  select.value = String(draft[key]);
  return field;
};

const applyDraftToControls = () => {
  for (const control of controls) {
    if (draft[control.key] !== undefined) control.write(draft[control.key]);
  }
};

// ---- general settings ---------------------------------------------------

const general = section(text.general);
// The MV settings get their own panel below, with the community build's ranges.
const generalProperties = Object.fromEntries(
  Object.entries(schema?.properties || {}).filter(([key]) => !key.startsWith('mv') && !key.startsWith('songBackground')),
);
const generalForm = ui.form({ ...schema, properties: generalProperties }, draft);
general.append(generalForm.element);
general.append(el('p', 'mmsc-hint', text.tidalHint));
root.append(general);

// ---- song background ----------------------------------------------------

const background = section(text.background, text.backgroundHint);
background.append(toggleField('mvEnabled', text.enableBackground, text.enableBackgroundHint));

const immersiveGrid = el('div', 'mmsc-grid');
immersiveGrid.append(
  toggleField('mvImmersiveBackground', text.immersive),
  toggleField('mvImmersiveBackgroundAutoScale', text.autoScale, text.autoScaleHint),
  selectField('mvImmersiveBackgroundFit', text.fit, [
    { value: 'cover', label: text.fitCover },
    { value: 'contain', label: text.fitContain },
    { value: 'fill', label: text.fitFill },
    { value: 'none', label: text.fitOriginal },
  ]),
  rangeField('mvImmersiveBackgroundWidthPercent', { min: 10, max: 200, suffix: '%', title: text.width }),
  rangeField('mvImmersiveBackgroundHeightPercent', { min: 10, max: 200, suffix: '%', title: text.height }),
  rangeField('mvImmersiveBackgroundScalePercent', { min: 70, max: 220, suffix: '%', title: text.zoom }),
  rangeField('mvImmersiveBackgroundOffsetXPercent', { min: 0, max: 100, suffix: '%', title: text.offsetX }),
  rangeField('mvImmersiveBackgroundOffsetYPercent', { min: 0, max: 100, suffix: '%', title: text.offsetY }),
  rangeField('mvImmersiveBackgroundBlurPx', { min: 0, max: 32, suffix: 'px', title: text.blur }),
  rangeField('mvImmersiveBackgroundBrightnessPercent', { min: 60, max: 140, suffix: '%', title: text.brightness }),
  rangeField('mvImmersiveBackgroundOverlayOpacityPercent', { min: 0, max: 100, suffix: '%', title: text.overlay }),
);
background.append(immersiveGrid);
background.append(toggleField('mvLyricsReadabilityEnhanced', text.readability, null, { strict: true }));
background.append(toggleField('mvHideLyrics', text.hideLyrics, null, { strict: true }));

const reset = el('button', 'mmsc-btn', text.reset);
reset.type = 'button';
reset.addEventListener('click', () => {
  Object.assign(draft, {
    mvImmersiveBackground: true,
    mvImmersiveBackgroundAutoScale: true,
    mvImmersiveBackgroundFit: 'cover',
    mvImmersiveBackgroundWidthPercent: 100,
    mvImmersiveBackgroundHeightPercent: 100,
    mvImmersiveBackgroundScalePercent: 115,
    mvImmersiveBackgroundOffsetXPercent: 50,
    mvImmersiveBackgroundOffsetYPercent: 50,
    mvImmersiveBackgroundBlurPx: 0,
    mvImmersiveBackgroundBrightnessPercent: 100,
    mvImmersiveBackgroundOverlayOpacityPercent: 0,
  });
  applyDraftToControls();
  toast(text.saved, 'success');
});
background.append(reset);
root.append(background);

// ---- matching & sync ----------------------------------------------------

const advanced = section(text.advanced, text.advancedHint);
const advancedGrid = el('div', 'mmsc-grid');
advancedGrid.append(
  toggleField('mvAutoSearch', text.autoSearch),
  toggleField('mvAutoPreload', text.autoPreload),
  toggleField('mvTitleOnlySearch', text.titleOnly),
  textField('mvSearchSuffix', 'MV', text.searchSuffix),
  toggleField('mvPreferHighestViewCount', text.preferViews),
  rangeField('mvAutoApplyThreshold', {
    min: 30,
    max: 100,
    suffix: '%',
    title: text.threshold,
    transform: {
      toDisplay: (value) => Math.round(num(value, 0.3, 1, 0.7) * 100),
      fromDisplay: (value) => Number(value) / 100,
    },
  }),
  selectField('mvMatchMode', text.matchMode, [
    { value: 'first', label: text.matchModeFirst },
    { value: 'score', label: text.matchModeScore },
    { value: 'views', label: text.matchModeViews },
  ]),
  rangeField('mvCandidateLimit', { min: 2, max: 20, title: text.candidateCount, hint: text.candidateCountHint }),
  selectField('mvSourceMode', text.sourceMode, [
    { value: 'engine', label: text.sourceModeEngine },
    { value: 'progressive', label: text.sourceModeProgressive },
  ]),
  selectField('mvMaxQuality', text.quality, [
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' },
    { value: '1440p', label: '1440p' },
    { value: '2160p', label: '2160p' },
    { value: 'max', label: text.bestQuality },
  ]),
  toggleField('mvAllow60fps', text.allow60fps),
  toggleField('mvRestartAudioOnLoad', text.followProgress, text.followProgressHint, { strict: true }),
  selectField('mvSyncMode', text.syncMode, [
    { value: 'stable', label: locale === 'zh-CN' ? '稳定' : 'Stable' },
    { value: 'balanced', label: locale === 'zh-CN' ? '均衡' : 'Balanced' },
    { value: 'precise', label: locale === 'zh-CN' ? '精准' : 'Precise' },
  ]),
  toggleField('mvReplayAudioOnChange', text.replayOnChange),
);
advanced.append(advancedGrid);
root.append(advanced);

// ---- background MV engine (the ported community MvService) ---------------

const engineSection = section(text.downloaderTitle, text.downloaderHint);
const engineStatus = el('p', 'mmsc-hint', '…');
engineSection.append(engineStatus);
const engineActions = el('div', 'mmsc-actions');
const engineRefresh = el('button', 'mmsc-btn', text.refresh);
engineRefresh.type = 'button';
engineRefresh.addEventListener('click', () => void loadEngineStatus());
engineActions.append(engineRefresh);
engineSection.append(engineActions);
root.append(engineSection);

const loadEngineStatus = async () => {
  engineStatus.textContent = '…';
  try {
    const status = await invoke('mvEngineStatus');
    const parts = [status?.ready
      ? `${text.engineLine}: ${text.engineReady}`
      : `${text.engineLine}: ${text.engineUnavailable}${status?.error ? ` (${status.error})` : ''}`];
    if (status?.ready) {
      if (status.database) parts.push(text.engineDatabase(status.database));
      parts.push(text.engineTracks(status.tracks ?? 0));
    }
    parts.push(status?.account?.connected
      ? text.accountUsed(status.account.displayName)
      : text.accountMissing);
    engineStatus.textContent = parts.join(' · ');
  } catch (error) {
    engineStatus.textContent = `${text.failed}: ${error?.message || error}`;
  }
};

// ---- bridge status ------------------------------------------------------

const statusSection = section(text.status);
const statusLine = el('p', 'mmsc-hint');
const platforms = el('div', 'mmsc-platforms');
const refresh = el('button', 'mmsc-btn', text.refresh);
refresh.type = 'button';
refresh.addEventListener('click', () => void loadStatus());
statusSection.append(statusLine, platforms, refresh);
root.append(statusSection);

const loadStatus = async () => {
  statusLine.textContent = '…';
  try {
    const status = await invoke('status');
    if (status?.bridgeError) {
      statusLine.textContent = `${text.bridgeFailed}: ${status.bridgeError}`;
    } else {
      statusLine.textContent = `${text.bridgeReady} · ${status?.mode || ''}`;
    }
    const providers = await invoke('providers');
    const list = Array.isArray(providers) ? providers : [];
    platforms.replaceChildren();
    for (const provider of list) {
      const pill = el('span', 'mmsc-pill');
      pill.dataset.on = String(provider.enabled !== false);
      pill.textContent = `${platformLabels[provider.name] || provider.displayName || provider.name}${provider.enabled === false ? ' · off' : ''}`;
      platforms.append(pill);
    }
  } catch (error) {
    statusLine.textContent = `${text.bridgeFailed}: ${error?.message || error}`;
    platforms.replaceChildren();
  }
};

// ---- accounts -----------------------------------------------------------

const accountSection = section(text.accounts, text.accountsHint);
const accountList = el('div', null);
accountSection.append(accountList);
root.append(accountSection);

let qrCapabilities = { qrImage: [], loginWindow: [] };
let qrPanel = null;
let qrPollTimer = null;

const stopQrPoll = () => {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
};

const renderQrPanel = (qr) => {
  if (qrPanel) qrPanel.remove();
  qrPanel = el('div', 'mmsc-qr');
  if (qr.image) {
    const image = document.createElement('img');
    image.src = qr.image;
    image.alt = text.qrLogin;
    qrPanel.append(image);
  }
  const side = el('div', 'mmsc-qr-side');
  const label = {
    waiting: text.qrWaiting,
    scanned: text.qrScanned,
    confirmed: text.qrDone,
    expired: text.qrExpired,
    failed: text.qrFailed,
  }[qr.state] || (qr.mode === 'window' ? text.loginWindow : text.qrWaiting);
  side.append(el('strong', null, label));
  if (qr.message) side.append(el('span', null, qr.message));
  const actions = el('div', 'mmsc-actions');
  const regenerate = el('button', 'mmsc-btn', qr.mode === 'window' ? text.loginWindow : text.qrRefresh);
  regenerate.type = 'button';
  regenerate.addEventListener('click', () => void startQr(qr.provider));
  actions.append(regenerate);
  side.append(actions);
  qrPanel.append(side);
  accountList.append(qrPanel);
};

const startQr = async (provider) => {
  stopQrPoll();
  try {
    const started = await invoke('startQrLogin', { provider });
    const current = {
      provider,
      mode: started?.qrUrl ? 'image' : 'window',
      state: started?.state || 'waiting',
      image: started?.qrUrl || '',
      message: started?.message || '',
    };
    renderQrPanel(current);
    if (!started?.key) return;

    qrPollTimer = setInterval(async () => {
      try {
        const polled = await invoke('pollQrLogin', { key: started.key, provider });
        renderQrPanel({ ...current, state: polled?.state || current.state, message: polled?.message || current.message });
        if (polled?.saved || polled?.state === 'confirmed') {
          stopQrPoll();
          toast(text.qrDone, 'success');
          qrPanel?.remove();
          qrPanel = null;
          await loadAccounts();
        } else if (polled?.state === 'expired' || polled?.state === 'failed') {
          stopQrPoll();
        }
      } catch (error) {
        stopQrPoll();
        renderQrPanel({ ...current, state: 'failed', message: error?.message || String(error) });
      }
    }, 2000);
  } catch (error) {
    toast(`${text.failed}: ${error?.message || error}`, 'error');
  }
};

const renderAccounts = (statuses) => {
  accountList.replaceChildren();
  qrPanel = null;
  for (const status of statuses) {
    const row = el('div', 'mmsc-row');

    const identity = el('div', 'mmsc-identity');
    if (status.connected && status.avatarUrl) {
      const avatar = document.createElement('img');
      avatar.className = 'mmsc-avatar';
      avatar.src = status.avatarUrl;
      avatar.alt = '';
      avatar.addEventListener('error', () => avatar.remove());
      identity.append(avatar);
    }
    const identityText = el('div', 'mmsc-identity-text');
    identityText.append(el('strong', null, platformLabels[status.provider] || status.provider));
    identityText.append(el('span', 'mmsc-status', status.connected
      ? `${text.connected}${status.displayName ? ` · ${status.displayName}` : ''}${status.vipLabel ? ` · ${status.vipLabel}` : ''}`
      : text.disconnected));
    if (status.connected && status.username && status.username !== status.displayName) {
      identityText.append(el('span', 'mmsc-status', text.uid(status.username)));
    }
    if (status.error) identityText.append(el('span', 'mmsc-status', status.error));
    identity.append(identityText);
    row.append(identity);

    const actions = el('div', 'mmsc-actions');
    if (!status.connected) {
      if (qrCapabilities.qrImage.includes(status.provider)) {
        const qrButton = el('button', 'mmsc-btn mmsc-btn-primary', text.qrLogin);
        qrButton.type = 'button';
        qrButton.addEventListener('click', () => void startQr(status.provider));
        actions.append(qrButton);
      } else if (qrCapabilities.loginWindow.includes(status.provider)) {
        const windowButton = el('button', 'mmsc-btn mmsc-btn-primary', text.loginWindow);
        windowButton.type = 'button';
        windowButton.addEventListener('click', () => void startQr(status.provider));
        actions.append(windowButton);
      }
    }

    const input = document.createElement('input');
    input.className = 'mmsc-input';
    input.type = 'password';
    input.placeholder = status.connected ? '••••••••' : 'cookie';

    const saveButton = el('button', 'mmsc-btn', text.saveCookie);
    saveButton.type = 'button';
    saveButton.addEventListener('click', async () => {
      if (!input.value.trim()) return;
      try {
        await invoke('accountSaveCookie', { provider: status.provider, cookie: input.value.trim() });
        input.value = '';
        toast(text.saved, 'success');
        await loadAccounts();
      } catch (error) {
        toast(`${text.failed}: ${error?.message || error}`, 'error');
      }
    });

    const clearButton = el('button', 'mmsc-btn', text.clear);
    clearButton.type = 'button';
    clearButton.addEventListener('click', async () => {
      try {
        await invoke('accountClear', { provider: status.provider });
        await loadAccounts();
      } catch (error) {
        toast(`${text.failed}: ${error?.message || error}`, 'error');
      }
    });

    actions.append(input, saveButton, clearButton);
    row.append(actions);
    accountList.append(row);
  }
};

const loadAccounts = async () => {
  try {
    // accountProfiles adds the signed-in identity on top of the stored status.
    const statuses = await invoke('accountProfiles');
    renderAccounts(Array.isArray(statuses) ? statuses : []);
  } catch {
    try {
      const statuses = await invoke('accountStatuses');
      renderAccounts(Array.isArray(statuses) ? statuses : []);
    } catch {
      renderAccounts([]);
    }
  }
};

const loadQrCapabilities = async () => {
  try {
    const capabilities = await invoke('qrLoginCapabilities');
    qrCapabilities = {
      qrImage: Array.isArray(capabilities?.qrImage) ? capabilities.qrImage : [],
      loginWindow: Array.isArray(capabilities?.loginWindow) ? capabilities.loginWindow : [],
    };
  } catch {
    qrCapabilities = { qrImage: [], loginWindow: [] };
  }
};

// ---- save ---------------------------------------------------------------

echoConfigUi.onSave(async () => {
  const next = { ...draft, ...generalForm.read() };
  Object.assign(draft, next);
  await invoke('setSettings', next).catch(() => {});
  return next;
});

void loadStatus();
void loadQrCapabilities().then(loadAccounts);
void loadEngineStatus();

return () => {
  stopQrPoll();
  style.remove();
  root.replaceChildren();
};
