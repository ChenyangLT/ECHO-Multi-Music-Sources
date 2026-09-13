// Build-time shim: replaces ECHO-main/src/main/app/appSettings.ts.
// The community streaming providers only read a handful of preference fields,
// and the MV engine reads/writes the mv* family. The mod passes them in through
// setShimSettings(); writes coming back from the community code (MvService's
// setSettings) are forwarded to the mod main process through the listener, so
// the MV settings UI and the mod config stay in step.
const state = {
  settings: null,
};

let settingsListener = null;

export const defaultTidalClientId = 'vmtQLf79BHl9YgUT';
export const defaultNetworkProxyBypassRules = '<local>;localhost;127.0.0.1;::1;*.local;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*';

/** ECHO-main's mv* defaults, so the ported MV engine behaves like the community build. */
export const defaultMvSettings = {
  mvEnabled: true,
  mvEnabledProviders: ['bilibili', 'youtube'],
  mvProviderOrder: ['bilibili', 'youtube'],
  mvAutoSearch: true,
  mvAutoPreload: true,
  mvAutoApplyThreshold: 0.7,
  mvTitleOnlySearch: false,
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
};

export const setShimSettings = (patch) => {
  state.settings = patch && typeof patch === 'object' ? patch : null;
};

/** Notified whenever the community code writes settings (mvSetSettings). */
export const setShimSettingsListener = (listener) => {
  settingsListener = typeof listener === 'function' ? listener : null;
};

export const getAppSettings = () => ({
  networkProxyEnabled: false,
  networkProxyUrl: '',
  networkProxyBypassRules: defaultNetworkProxyBypassRules,
  audioAnalysisEnabled: false,
  lyricsNetworkEnabled: true,
  lyricsEnabledProviders: ['lrclib', 'netease', 'qqmusic'],
  lyricsProviderTimeoutMs: 8_000,
  lyricsTotalMatchTimeoutMs: 12_000,
  lyricsAutoAcceptScore: 0.8,
  lyricsCoverAutoAcceptScore: 0.6,
  lyricsDeepSearchEnabled: false,
  tidalClientId: defaultTidalClientId,
  tidalClientSecret: '',
  tidalCountryCode: 'US',
  spotifyClientId: '',
  ...defaultMvSettings,
  ...(state.settings || {}),
});

export const setAppSettings = (patch) => {
  state.settings = { ...(state.settings || {}), ...(patch || {}) };
  try {
    settingsListener?.(patch || {}, getAppSettings());
  } catch {
    /* a listener must never break the settings write */
  }
  return getAppSettings();
};

export const normalizeSettings = (value) => ({ ...getAppSettings(), ...(value || {}) });
export const normalizeHqPlayerSettings = (value) => value || {};
export const normalizeChannelBalanceSettings = (value) => value || {};
export const normalizeSystemLocale = (value) => (typeof value === 'string' && value ? value : 'zh-CN');
export const normalizeAirPlayReceiverProtocol = (value) => value || 'raop';
export const setFinalThemeUnlockAvailable = () => {};
export const getLyricsWallpaperDirectory = () => '';
export const getAppWallpaperDirectory = () => '';
export const defaultSettings = {};
export const defaultAppearancePreferences = {};
export const defaultHqPlayerSettings = {};
export const defaultChannelBalanceSettings = {};
