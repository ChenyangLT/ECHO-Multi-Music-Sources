/*
 * ECHO 多平台音源 / Multi Music Sources — renderer page.
 *
 * A port of the ECHO Community streaming browser onto ECHO Steam. Search,
 * album / artist / playlist detail, lyrics and playback URLs all come from the
 * community streaming algorithms running in this mod's main process
 * (see main.cjs and bridge/provider-bridge.cjs). Playback is handed to ECHO's
 * real player through ShinawaseLoader's player runtime, so the queue, lyrics,
 * DSP and mini-player behave exactly like a local track.
 */
const external = echoExternalMod;
const manifest = external.manifest || {};
const config = external.config || {};
const echo = external.echo || {};

const PAGE_ID = 'multi-music-sources';
const MAIN_METHOD_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// Localisation
// ---------------------------------------------------------------------------

const STRINGS = {
  'zh-CN': {
    title: '多平台音源',
    subtitle: '在线搜索各音乐平台，直接串流播放',
    search: '搜索',
    searchPlaceholder: '搜索歌曲、专辑或艺人',
    tracks: '歌曲',
    albums: '专辑',
    artists: '艺人',
    playlists: '歌单',
    sources: '音乐平台',
    accounts: '账号',
    accountHint: '部分平台需要登录后才能播放完整歌曲或高音质。',
    notLoggedIn: '未登录',
    loggedIn: (name) => `已登录${name ? ` · ${name}` : ''}`,
    login: '登录',
    logout: '退出登录',
    saveCookie: '保存 Cookie',
    cookiePlaceholder: '粘贴该平台的 Cookie 值',
    checking: '检测中',
    check: '检测',
    checkAll: '全部检测',
    quality: '音质',
    play: '播放',
    playAll: '播放全部',
    queue: '加入队列',
    queueAll: '全部加入队列',
    lyrics: '歌词',
    mv: 'MV',
    openInBrowser: '在浏览器打开',
    copyLink: '复制链接',
    back: '返回',
    results: (n) => `${n} 个结果`,
    searching: '搜索中…',
    loading: '加载中…',
    empty: '没有找到结果',
    noTracks: '这个列表里没有可显示的歌曲',
    ready: '就绪',
    bridgeDown: '桌面桥接不可用，请确认模组已启用并重启 ECHO。',
    searchHint: '输入关键词后回车。播放地址只在播放时解析，不会写入队列。',
    unavailable: '当前不可播放',
    truncated: '结果较多，仅显示前 300 条',
    refresh: '刷新',
    dailyRecommend: '每日推荐',
    myPlaylists: '我的歌单',
    playlistsHint: '来自已登录账号：网易云 / QQ 音乐的歌单、B 站收藏夹（含订阅的收藏夹与稍后再看）。点封面即可载入播放。',
    playlistsNeedAccount: '这个平台还没登录：先在「账号」页登录，就能看到它账号里的歌单 / 收藏夹。',
    playlistsLoginHint: '登录后即可读取这个平台的歌单与收藏夹。',
    goLogin: '去登录',
    dailyGroup: '每日推荐',
    dailyGroupHint: '来自网易云账号，每天 6:00 更新。',
    dailyOpen: '打开每日推荐',
    dailyLoading: '正在读取每日推荐…',
    dailyRest: (n) => `还有 ${n} 首，点「打开每日推荐」查看全部`,
    providersLabel: '音源平台',
    playlistsEmpty: '账号里没有可读取的歌单或收藏夹。',
    playlistsCollected: '订阅的收藏夹',
    playlistsWatchLater: '稍后再看',
    importPlaylist: '导入歌单链接',
    importPlaceholder: '粘贴网易云 / QQ 音乐 / 酷狗 / Spotify 歌单链接',
    importAction: '导入',
    importing: '导入中…',
    imported: (n) => `已导入 ${n} 首到本地歌单`,
    importNeedUrl: '请先粘贴歌单链接',
    importHint: '支持网易云 / QQ 音乐 / 酷狗 / Spotify 歌单链接；导入后可以直接播放，点「保存到本地」才会留在这台机器上。',
    importedLabel: '链接导入',
    playlistViewMode: '显示方式',
    viewModeGrid: '图标',
    viewModeList: '列表',
    viewModeCompact: '紧凑',
    playlistsLocalGroup: '本地保存的歌单',
    playlistsLocalGroupHint: '通过链接导入并保存下来的歌单：不依赖账号，打开也不再联网。',
    playlistsLocalGroupEmpty: '还没有保存过链接导入的歌单。',
    playlistsLocalHint: '账号歌单列表会缓存在本地；歌单本身要点「保存到本地」才会存到本机，之后打开就不再联网获取。',
    playlistsLocal: (value) => `本地保存于 ${value}`,
    playlistsStored: (count) => `本地已存 ${count}`,
    playlistsSave: '保存到本地',
    playlistsUnsave: '取消保存',
    playlistsSaving: '保存中…',
    playlistsNotSaved: '未保存到本地',
    playlistsSaveHint: '点「保存到本地」后可离线打开。',
    playlistsSavedHint: '之后打开不再联网获取。',
    playlistsRemoved: '已取消本地保存',
    playlistsReimport: '重新获取',
    playlistsSaved: (count) => `已保存到本地：${count}`,
    playlistsFromLocal: '来自本地保存',
    playlistsClearLocal: '清除本地歌单',
    playlistsCleared: '已清除本地保存的歌单',
    providerUnavailable: '该平台当前不可用',
    needsAccount: '需要登录该平台账号',
    qrLogin: '扫码登录',
    qrWaiting: '请用手机 App 扫码',
    qrScanned: '已扫码，请在手机上确认',
    qrExpired: '二维码已过期',
    qrFailed: '扫码登录失败',
    qrRefresh: '重新生成二维码',
    qrUnsupported: '该平台暂不支持扫码登录',
    qrSuccess: '扫码登录成功',
    qrWindowLogin: '打开登录窗口',
    qrWindowHint: '登录窗口里用手机 App 扫码，登录完成后窗口会自动关闭。',
    accountUid: (id) => `UID ${id}`,
    accountVip: 'VIP',
    accountChecked: (value) => `最后检测：${value}`,
    accountError: (message) => `错误：${message}`,
    loadFailed: '加载失败',
    backdrop: '歌曲背景',
    backdropOn: '背景：开',
    backdropOff: '背景：关',
    backdropSearching: '正在搜索 B 站 MV',
    backdropSearchingFor: (query) => `正在搜索：${query}`,
    backdropNoMatch: '没有找到足够匹配的 MV',
    backdropFailed: '背景视频解析失败',
    backdropMatched: (title) => `MV 已匹配：${title}`,
    backdropLoading: (title) => `MV 已匹配：${title}（正在加载视频流…）`,
    backdropRetrying: '视频流没有开始播放，正在重试…',
    backdropResolvingFor: (title) => `正在解析：${title}`,
    backdropNoStream: '社区 MV 引擎没有解析出可播放的视频流',
    backdropShortSource: '该视频流只包含几秒内容（B 站分段流），已改用完整 MP4',
    backdropDragHint: '拖动可调整画面位置，Ctrl + 滚轮缩放',
    backgroundAttribution: (title) => `背景 MV：${title}`,
    lyricsHidden: '已按设置隐藏歌词',
    backgroundSettings: '背景设置',
    mvPageTitle: 'MV 背景',
    mvPageSubtitle: '歌词页的视频背景：匹配、画面、同步与社区 MV 引擎',
    enableBackdropRow: '启用 MV 背景',
    enableBackdropHint: '与播放栏的 MV 按钮、Loader 配置弹窗里的「启用 MV 背景」同一个开关。关闭时不会联网匹配视频。',
    mvPageDrawerHint: '同样的面板也在歌词页右下角：MV 面板 → ⚙ 设置。',
    backgroundTitle: '歌曲背景（B 站 MV）',
    backgroundSubtitle: '按名称匹配 B 站视频 → 社区 MV 引擎解析视频流 → 直接播放（不下载、不缓存）',
    backgroundStatus: '状态',
    engineLine: '社区 MV 引擎',
    engineOk: '可用',
    engineMissing: '不可用',
    engineDatabaseLine: (path) => `数据库：${path}`,
    engineTracksLine: (count) => `已记住 ${count} 首歌曲`,
    accountLine: 'B 站账号',
    accountUsed: (name) => `使用已登录账号${name ? ` · ${name}` : ''} 的 Cookie`,
    accountCookieReady: '已读取到 B 站 Cookie（还没校验昵称，点「刷新状态」）',
    accountMissing: '未登录 B 站，部分视频会以匿名身份解析（清晰度受限）',
    sourceMode: '背景视频来源',
    sourceModeEngine: '社区 MV 引擎（与社区版一致）',
    sourceModeProgressive: 'B 站完整 MP4（引擎失败时回退）',
    matchMode: '匹配方式',
    matchModeFirst: '按名称取 B 站第一个视频',
    matchModeScore: '按匹配度评分',
    matchModeViews: '按播放量',
    matchModeHint: '“第一个视频”直接使用 B 站搜索的排序结果，不再按播放量重排。',
    testMatch: '为当前歌曲匹配候选',
    testMatchNeedTrack: '请先在多平台音源页面播放或选择一首歌',
    testMatched: (title, uploader) => `匹配到：${title}${uploader ? ` · ${uploader}` : ''}`,
    testNoMatch: '没有匹配到视频',
    loadingCandidates: '正在获取候选…',
    candidatesFor: (title) => `当前歌曲：${title}`,
    candidatesEmpty: '还没有候选：点上面的「为当前歌曲匹配候选」，或直接在下面粘贴视频链接。',
    titleSearchLabel: '按标题搜索 B 站',
    titleSearchHint: '用这里输入的标题直接搜 B 站，不经过「歌名 + 艺人 +」这套自动查询；结果可以像其它候选一样绑定到当前歌曲。',
    titleSearchPlaceholder: '输入要搜索的标题，回车即可',
    titleSearchPlaceholderTrack: (title) => `默认用歌名：${title}`,
    titleSearchAction: '搜索',
    titleSearching: '按标题搜索中…',
    titleSearchEmpty: '请输入要搜索的标题',
    titleSearchFound: (n) => `找到 ${n} 个候选`,
    titleSearchShown: (query, n) => `「${query}」的搜索结果（${n} 个）`,
    candidatesShown: (count) => `候选 ${count} 个（可在下面调整数量）`,
    candidateCount: '候选数量',
    candidateCountHint: '自动匹配取前几个结果，也决定候选列表显示多少个（2–20）。',
    customLinkLabel: '自定义视频链接',
    customLinkPlaceholder: '粘贴 B 站 BV 号 / b23.tv 短链 / 视频链接',
    customLinkApply: '绑定到当前歌曲',
    candidateApply: '用这个',
    customLinkHint: '应用候选或绑定链接后会 seek 到歌曲当前进度，从同一时间点继续播放。',
    refreshStatus: '刷新状态',
    fileMissing: '文件不存在',
    immersive: '沉浸式 MV 背景',
    autoScale: '自动缩放',
    preset: '画面预设',
    presetCustom: '自定义',
    presetFitWidth: '默认（左右贴合）',
    presetCover: '铺满（裁切填满）',
    presetContain: '窄边（完整显示）',
    presetStretch: '拉伸铺满',
    presetOriginal: '原始尺寸居中',
    presetZoom: '放大铺满',
    presetAuto: '自动适配（社区版）',
    presetCinema: '宽银幕（上下留白）',
    presetHint: '「默认（左右贴合）」把画面缩放到左右两侧恰好贴住窗口宽度，并随窗口自适应；高度不做限制，画面比窗口高时会超出上下边界。',
    widthLabel: '画面宽度',
    heightLabel: '画面高度',
    fitLabel: '填充方式',
    fitCover: '铺满（裁切）',
    fitContain: '窄边（完整）',
    fitFill: '拉伸',
    fitOriginal: '原始尺寸',
    scaleLabel: '缩放（Z）',
    offsetXLabel: '水平位置（X）',
    offsetYLabel: '垂直位置（Y）',
    blur: '背景模糊',
    brightness: '背景亮度',
    overlay: '暗色遮罩',
    readability: '歌词可读性增强',
    hideLyrics: 'MV 播放时隐藏歌词',
    threshold: '匹配度阈值',
    autoSearch: '自动搜索网络 MV',
    autoPreload: '预加载 MV',
    titleOnly: '只用歌曲名搜索',
    searchSuffix: '搜索后缀',
    followProgress: 'MV 跟随音乐进度',
    syncMode: '同步模式',
    replayOnChange: '切换 MV 后从头对齐',
    quality: 'MV 最高画质',
    allow60fps: '允许 60fps',
    preview: '预览',
    previewHint: '预览会在歌词页里立刻播放这个视频',
    engineTitle: '社区版 MV 引擎',
    engineUsage: '匹配、评分、画质与逐曲偏移都由社区版 MvService 计算；模组只负责取回视频并显示。',
    engineReady: '已就绪',
    engineUnavailable: '不可用',
    engineDatabase: (path) => `数据库：${path}`,
    engineTracks: (count) => `已登记 ${count} 首`,
    engineSearch: '用引擎搜索候选',
    engineSearching: 'MV 引擎搜索中…',
    engineResolving: 'MV 引擎解析中…',
    engineCandidates: (count) => `候选 ${count} 个`,
    engineSelected: '当前 MV',
    engineQuality: 'MV 画质',
    qualityAuto: '自动',
    engineOffset: 'MV 偏移',
    engineOffsetHint: '按 100ms 调整 MV 与歌曲的时间差（±10 分钟）',
    engineBindLocal: '选择本地视频',
    engineClear: '清除绑定',
    engineCleared: '已清除该歌曲的 MV 绑定',
    engineBound: (title) => `已绑定：${title}`,
    engineApply: '应用',
    engineOpen: '在浏览器打开',
    engineDiagnostics: '复制诊断信息',
    engineDiagnosticsCopied: '已复制 MV 诊断信息',
    engineReload: '刷新引擎状态',
    panelTitle: 'MV 面板',
    panelSettings: '⚙ 设置',
    drawerTitle: 'MV 背景设置',
    drawerClose: '收起',
    panelRematch: '重新匹配',
    panelOffsetMinus: '-0.5s',
    panelOffsetPlus: '+0.5s',
    panelOffsetReset: '偏移归零',
    panelHide: '隐藏歌词',
    panelShow: '显示歌词',
    panelDisable: '关闭背景',
    backdropVisible: '正在显示 MV',
    backdropPressToReload: '（点击重新匹配）',
    backdropRematched: (reason) => (reason === 'button' ? '已重新匹配当前歌曲的 MV' : '已按当前歌曲重新匹配 MV'),
    settingsButton: '歌词页显示「⚙ 设置」按钮',
    settingsButtonHint: '关掉后歌曲详情页的 MV 面板不再带这个按钮；侧栏「MV 背景」页和播放栏的 MV 按钮不受影响。',
    trackCount: (n) => `${n} 首`,
    accountUid: (id) => `UID ${id}`,
    playFailed: '播放失败',
    noProviders: '没有可用的音乐平台。请查看日志了解音源桥接的加载情况。',
    dailyHint: '每日推荐由网易云账号生成，每天 6:00 更新。',
  },
  'en-US': {
    title: 'Multi Music Sources',
    subtitle: 'Search every music platform and stream it directly',
    search: 'Search',
    searchPlaceholder: 'Search songs, albums or artists',
    tracks: 'Tracks',
    albums: 'Albums',
    artists: 'Artists',
    playlists: 'Playlists',
    sources: 'Sources',
    accounts: 'Accounts',
    accountHint: 'Some platforms need a login before full tracks or higher quality are available.',
    notLoggedIn: 'Not signed in',
    loggedIn: (name) => `Signed in${name ? ` · ${name}` : ''}`,
    login: 'Sign in',
    logout: 'Sign out',
    saveCookie: 'Save cookie',
    cookiePlaceholder: 'Paste this platform\'s cookie value',
    checking: 'Checking',
    check: 'Check',
    checkAll: 'Check all',
    quality: 'Quality',
    play: 'Play',
    playAll: 'Play all',
    queue: 'Add to queue',
    queueAll: 'Queue all',
    lyrics: 'Lyrics',
    mv: 'MV',
    openInBrowser: 'Open in browser',
    copyLink: 'Copy link',
    back: 'Back',
    results: (n) => `${n} results`,
    searching: 'Searching…',
    loading: 'Loading…',
    empty: 'No results',
    noTracks: 'Nothing to show in this list',
    ready: 'Ready',
    bridgeDown: 'Desktop bridge unavailable. Make sure the mod is enabled and restart ECHO.',
    searchHint: 'Press Enter to search. Audio URLs are resolved only when playback starts.',
    unavailable: 'Not playable right now',
    truncated: 'Large result set — showing the first 300 entries',
    refresh: 'Refresh',
    dailyRecommend: 'Daily picks',
    myPlaylists: 'My playlists',
    playlistsHint: 'From the signed-in account: NetEase / QQ Music playlists and Bilibili favourite folders (including followed folders and watch later). Click a cover to load it.',
    playlistsNeedAccount: 'This platform is not signed in yet — sign in on the Accounts page to see its playlists / favourite folders.',
    playlistsLoginHint: 'Sign in to read this platform playlists and favourite folders.',
    goLogin: 'Sign in',
    dailyGroup: 'Daily picks',
    dailyGroupHint: 'Generated by your NetEase account, refreshed at 06:00.',
    dailyOpen: 'Open daily picks',
    dailyLoading: 'Reading daily picks…',
    dailyRest: (n) => `${n} more — use “Open daily picks” for all of them`,
    providersLabel: 'Source platform',
    playlistsEmpty: 'No readable playlists or favourite folders on this account.',
    playlistsCollected: 'Followed folder',
    playlistsWatchLater: 'Watch later',
    importPlaylist: 'Import a playlist link',
    importPlaceholder: 'Paste a NetEase / QQ Music / KuGou / Spotify playlist link',
    importAction: 'Import',
    importing: 'Importing…',
    imported: (n) => `Imported ${n} tracks`,
    importNeedUrl: 'Paste a playlist link first',
    importHint: 'NetEase / QQ Music / KuGou / Spotify playlist links. An imported list plays straight away; press "Save locally" to keep it on this machine.',
    importedLabel: 'Imported link',
    playlistViewMode: 'Layout',
    viewModeGrid: 'Icons',
    viewModeList: 'List',
    viewModeCompact: 'Compact',
    playlistsLocalGroup: 'Playlists kept locally',
    playlistsLocalGroupHint: 'Playlists imported by link and saved: no account needed, and they open without going online.',
    playlistsLocalGroupEmpty: 'No link-imported playlist has been saved yet.',
    playlistsLocalHint: 'The account list is cached locally; a playlist itself is only kept once you press "Save locally", and then it opens without going online.',
    playlistsLocal: (value) => `saved locally at ${value}`,
    playlistsStored: (count) => `${count} kept locally`,
    playlistsSave: 'Save locally',
    playlistsUnsave: 'Remove local copy',
    playlistsSaving: 'Saving…',
    playlistsNotSaved: 'not kept locally',
    playlistsSaveHint: 'press "Save locally" to open it offline.',
    playlistsSavedHint: 'opens without going online.',
    playlistsRemoved: 'Removed the local copy',
    playlistsReimport: 'Re-fetch',
    playlistsSaved: (count) => `Saved locally: ${count}`,
    playlistsFromLocal: 'from the local copy',
    playlistsClearLocal: 'Clear local playlists',
    playlistsCleared: 'Cleared the locally kept playlists',
    providerUnavailable: 'This platform is unavailable',
    needsAccount: 'Sign in to this platform first',
    qrLogin: 'Sign in with QR code',
    qrWaiting: 'Scan this code with the phone app',
    qrScanned: 'Scanned — confirm on your phone',
    qrExpired: 'The QR code expired',
    qrFailed: 'QR sign-in failed',
    qrRefresh: 'Generate a new code',
    qrUnsupported: 'QR sign-in is not available for this platform yet',
    qrSuccess: 'Signed in successfully',
    qrWindowLogin: 'Open login window',
    qrWindowHint: 'Scan the QR inside the login window; it closes itself once you are signed in.',
    accountUid: (id) => `UID ${id}`,
    accountVip: 'VIP',
    accountChecked: (value) => `Last checked: ${value}`,
    accountError: (message) => `Error: ${message}`,
    loadFailed: 'Failed to load',
    backdrop: 'Song background',
    backdropOn: 'Background: on',
    backdropOff: 'Background: off',
    backdropSearching: 'Searching Bilibili for the MV',
    backdropSearchingFor: (query) => `Searching: ${query}`,
    backdropNoMatch: 'No Bilibili video matched closely enough',
    backdropFailed: 'Could not resolve the background video',
    backdropMatched: (title) => `MV matched: ${title}`,
    backdropLoading: (title) => `MV matched: ${title} (loading the stream…)`,
    backdropRetrying: 'The stream did not start playing — retrying…',
    backdropResolvingFor: (title) => `Resolving: ${title}`,
    backdropNoStream: 'The community MV engine resolved no playable stream',
    backdropShortSource: 'That stream only holds a few seconds (a Bilibili segment); switching to the complete MP4',
    backdropDragHint: 'Drag to reposition, Ctrl + wheel to zoom',
    backgroundAttribution: (title) => `Background MV: ${title}`,
    lyricsHidden: 'Lyrics hidden by your background setting',
    backgroundSettings: 'Background',
    mvPageTitle: 'MV background',
    mvPageSubtitle: 'The lyrics-page video background: matching, picture, sync and the community MV engine',
    enableBackdropRow: 'Enable the MV background',
    enableBackdropHint: 'The same switch as the player-bar MV button and the "Enable the MV background" option in the loader config dialog. While off, nothing is matched online.',
    mvPageDrawerHint: 'The same panel also lives on the song page: MV panel → ⚙ settings.',
    backgroundTitle: 'Song background (Bilibili MV)',
    backgroundSubtitle: 'Match by name → resolve the stream with the community MV engine → play it (nothing is downloaded or cached)',
    backgroundStatus: 'Status',
    engineLine: 'Community MV engine',
    engineOk: 'available',
    engineMissing: 'unavailable',
    engineDatabaseLine: (path) => `Database: ${path}`,
    engineTracksLine: (count) => `${count} track(s) remembered`,
    accountLine: 'Bilibili account',
    accountUsed: (name) => `Uses the signed-in cookie${name ? ` · ${name}` : ''}`,
    accountCookieReady: 'Bilibili cookie found (profile not checked yet — press "Refresh status")',
    accountMissing: 'Not signed in to Bilibili; some videos resolve anonymously (lower quality)',
    sourceMode: 'Background video source',
    sourceModeEngine: 'Community MV engine (same as the community build)',
    sourceModeProgressive: 'Bilibili complete MP4 (fallback when the engine fails)',
    matchMode: 'Match mode',
    matchModeFirst: 'First Bilibili result for the name',
    matchModeScore: 'By match score',
    matchModeViews: 'By view count',
    matchModeHint: '"First result" uses Bilibili\'s own ordering and never re-ranks by view count.',
    testMatch: 'Find candidates for the current song',
    testMatchNeedTrack: 'Play or pick a song on the music page first',
    testMatched: (title, uploader) => `Matched: ${title}${uploader ? ` · ${uploader}` : ''}`,
    testNoMatch: 'No video matched',
    loadingCandidates: 'Loading candidates…',
    candidatesFor: (title) => `Current song: ${title}`,
    candidatesEmpty: 'No candidates yet: use "Find candidates for the current song" above, or paste a video link below.',
    titleSearchLabel: 'Search Bilibili by title',
    titleSearchHint: 'Searches Bilibili with exactly this title instead of the automatic "song + artist + suffix" query; a result can be bound to the current song like any other candidate.',
    titleSearchPlaceholder: 'Type a title and press Enter',
    titleSearchPlaceholderTrack: (title) => `Defaults to the song title: ${title}`,
    titleSearchAction: 'Search',
    titleSearching: 'Searching by title…',
    titleSearchEmpty: 'Type a title to search for',
    titleSearchFound: (n) => `${n} candidate(s) found`,
    titleSearchShown: (query, n) => `Results for "${query}" (${n})`,
    candidatesShown: (count) => `${count} candidate(s) — adjust the count below`,
    candidateCount: 'Candidate count',
    candidateCountHint: 'How many search results auto-matching and the list below use (2–20).',
    customLinkLabel: 'Custom video link',
    customLinkPlaceholder: 'Paste a Bilibili BV id / b23.tv link / video URL',
    customLinkApply: 'Bind to the current song',
    candidateApply: 'Use this',
    customLinkHint: 'Applying a candidate or binding a link seeks to the song position once and keeps playing from there.',
    refreshStatus: 'Refresh status',
    fileMissing: 'File not found',
    immersive: 'Immersive MV background',
    autoScale: 'Auto scale',
    preset: 'Picture preset',
    presetCustom: 'Custom',
    presetFitWidth: 'Default (fits left & right)',
    presetCover: 'Fill the frame (crop)',
    presetContain: 'Letterbox (whole video)',
    presetStretch: 'Stretch to fill',
    presetOriginal: 'Original size, centred',
    presetZoom: 'Zoomed fill',
    presetAuto: 'Automatic (community build)',
    presetCinema: 'Widescreen (letterboxed)',
    presetHint: '"Default (fits left & right)" scales the picture so it is exactly as wide as the window and keeps up with resizing; the height is left alone, so a taller picture simply runs past the top and bottom edges.',
    widthLabel: 'Video width',
    heightLabel: 'Video height',
    fitLabel: 'Fitting',
    fitCover: 'Fill (crop)',
    fitContain: 'Letterbox',
    fitFill: 'Stretch',
    fitOriginal: 'Original size',
    scaleLabel: 'Zoom (Z)',
    offsetXLabel: 'Horizontal position (X)',
    offsetYLabel: 'Vertical position (Y)',
    blur: 'Background blur',
    brightness: 'Background brightness',
    overlay: 'Dark overlay',
    readability: 'Enhanced lyrics readability',
    hideLyrics: 'Hide lyrics while the MV plays',
    threshold: 'Match threshold',
    autoSearch: 'Auto-search online MV',
    autoPreload: 'Preload MV',
    titleOnly: 'Search by title only',
    searchSuffix: 'Search suffix',
    followProgress: 'Follow the music progress',
    syncMode: 'Sync mode',
    replayOnChange: 'Align the MV to the song start',
    quality: 'MV max quality',
    allow60fps: 'Allow 60fps',
    preview: 'Preview',
    previewHint: 'Preview plays this video on the lyrics page right away',
    engineTitle: 'Community MV engine',
    engineUsage: 'Matching, scoring, quality and the per-track offset all come from the community MvService; the mod only fetches the video and shows it.',
    engineReady: 'Ready',
    engineUnavailable: 'Unavailable',
    engineDatabase: (path) => `Database: ${path}`,
    engineTracks: (count) => `${count} track(s) registered`,
    engineSearch: 'Search candidates with the engine',
    engineSearching: 'MV engine searching…',
    engineResolving: 'MV engine resolving…',
    engineCandidates: (count) => `${count} candidate(s)`,
    engineSelected: 'Current MV',
    engineQuality: 'MV quality',
    qualityAuto: 'Auto',
    engineOffset: 'MV offset',
    engineOffsetHint: 'Shift the MV against the song in 100 ms steps (±10 minutes)',
    engineBindLocal: 'Choose a local video',
    engineClear: 'Clear binding',
    engineCleared: 'Cleared the MV binding for this song',
    engineBound: (title) => `Bound: ${title}`,
    engineApply: 'Apply',
    engineOpen: 'Open in browser',
    engineDiagnostics: 'Copy diagnostics',
    engineDiagnosticsCopied: 'MV diagnostics copied',
    engineReload: 'Refresh engine state',
    panelTitle: 'MV panel',
    panelSettings: '⚙ Settings',
    drawerTitle: 'MV background settings',
    drawerClose: 'Collapse',
    panelRematch: 'Match again',
    panelOffsetMinus: '-0.5s',
    panelOffsetPlus: '+0.5s',
    panelOffsetReset: 'Reset offset',
    panelHide: 'Hide lyrics',
    panelShow: 'Show lyrics',
    panelDisable: 'Turn background off',
    backdropVisible: 'MV on screen',
    backdropPressToReload: ' (press to match again)',
    backdropRematched: (reason) => (reason === 'button' ? 'MV matched again for this song' : 'MV matched again for the current song'),
    settingsButton: 'Show the ⚙ settings button on the song page',
    settingsButtonHint: 'While off, the MV panel on the song detail page has no ⚙ button. The sidebar MV background page and the player-bar MV button are unaffected.',
    trackCount: (n) => `${n} tracks`,
    playFailed: 'Playback failed',
    noProviders: 'No music platform is available. Check the log for bridge load errors.',
    dailyHint: 'Daily picks are generated by your NetEase account and refresh at 06:00.',
  },
};

const locale = config.locale === 'en-US' ? 'en-US' : 'zh-CN';
const copy = STRINGS[locale];

// ---------------------------------------------------------------------------
// Platform metadata
// ---------------------------------------------------------------------------

const PLATFORM_ORDER = ['netease', 'qqmusic', 'kugou', 'bilibili', 'youtube', 'soundcloud', 'spotify', 'tidal', 'qobuz'];

/** How the 歌单 page lays its cards out (persisted in the mod config). */
const PLAYLIST_VIEW_MODES = ['grid', 'list', 'compact'];

const playlistViewMode = () => (PLAYLIST_VIEW_MODES.includes(config.playlistViewMode) ? config.playlistViewMode : 'grid');

const PLATFORM_LABELS = {
  netease: '网易云音乐',
  qqmusic: 'QQ 音乐',
  kugou: '酷狗音乐',
  bilibili: '哔哩哔哩',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  tidal: 'TIDAL',
  qobuz: 'Qobuz',
};

const QUALITIES = [
  { value: 'hires', label: 'Hi-Res' },
  { value: 'lossless', label: 'Lossless' },
  { value: 'high', label: '320 kbps' },
  { value: 'standard', label: '128 kbps' },
];

const MEDIA_TYPES = [
  { value: 'track', labelKey: 'tracks' },
  { value: 'album', labelKey: 'albums' },
  { value: 'artist', labelKey: 'artists' },
  { value: 'playlist', labelKey: 'playlists' },
];

const DEFAULT_COVER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="#eaf1f8"/><circle cx="31" cy="32" r="12" fill="#9fb6cc"/><path d="M28 67c11-19 25-25 42-9" fill="none" stroke="#5f7f9d" stroke-width="8" stroke-linecap="round"/></svg>',
)}`;

const MAX_RENDERED_TRACKS = 300;

// How many 每日推荐 tracks the 歌单 page previews before handing over to the
// detail page (the list itself holds up to a few dozen).
const DAILY_PREVIEW_LIMIT = 5;

// ---------------------------------------------------------------------------
// Bridge access
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Calls a method registered by main.cjs, unwrapping its result envelope. */
const invokeMain = async (method, payload) => {
  const main = external.main;
  if (!main?.invoke) {
    throw new Error(copy.bridgeDown);
  }
  let response;
  let timer = null;
  try {
    response = await Promise.race([
      main.invoke(method, payload),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${method} timed out`)), MAIN_METHOD_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/native_(host|package|main_method|invoke)|fetch failed|econnrefused|failed to fetch/iu.test(message)) {
      throw new Error(copy.bridgeDown);
    }
    throw new Error(message);
  } finally {
    if (timer) clearTimeout(timer);
  }
  // The loader transports package methods through two nested envelopes:
  //   { ok: true, result: <native host> } -> { ok: true, result: <method value> }
  // Failures can appear at either level as `{ ok: false, error }`, so peel the
  // envelopes until a plain value is left and surface the first error found.
  let value = response;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!value || typeof value !== 'object') break;
    if (value.ok === false) {
      throw new Error(String(value.error || copy.loadFailed));
    }
    if (!('result' in value)) break;
    value = value.result;
  }
  return value;
};

/** Waits for main.cjs to finish activating (mod entry and main script race). */
const waitForBridge = async () => {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const status = await invokeMain('status');
      if (status?.bridgeReady || status?.bridgeError) return status;
      lastError = status?.bridgeError ? new Error(status.bridgeError) : lastError;
    } catch (error) {
      lastError = error;
    }
    await sleep(300 * (attempt + 1));
  }
  if (lastError) throw lastError;
  return null;
};

const playerApi = () => external.player || window.__echoExternalPlayer;
const playbackApi = () => echo.playback || window.echo?.playback;

const trackKey = (track) => track?.stableKey || track?.id || `streaming:${track?.provider}:${track?.providerTrackId}`;

/**
 * The stable key of one locally kept account playlist / favourite folder.
 *
 * It has to survive a restart, so it is derived from the provider plus the
 * platform's own id (NetEase / QQ Music) or the collection URL (Bilibili).
 */
const collectionKeyOf = (provider, entry) => {
  const raw = String(entry?.providerPlaylistId || entry?.url || entry?.webUrl || entry?.id || '').trim();
  return `${provider || 'unknown'}:${raw}`.slice(0, 512);
};

/**
 * The key a playlist is kept under in the local store.
 *
 * Link imports are keyed by the pasted URL (`link:<provider>:<url>`) instead of
 * the provider id, so those descriptors carry the key explicitly.
 */
const playlistStoreKeyOf = (entry) => String(entry?.storeKey || '').trim()
  || collectionKeyOf(entry?.provider || state.provider, entry);

/** "12 首" / "12 tracks" for the notices that mention a count. */
const countLabel = (count) => copy.trackCount(Number(count) || 0);

/**
 * The view a detail page should return to.
 *
 * Opening a playlist / favourite folder from the 歌单 page must go back there, and
 * only a detail that was opened from the search results returns to search. It is
 * recorded *before* switching to the detail view, so the origin is the view the
 * user was actually looking at (calling it while already on a detail keeps the
 * origin it was opened with).
 */
const markDetailOrigin = () => {
  state.detailFrom = state.view === 'detail'
    ? (state.detailFrom || 'search')
    : state.view === 'playlists' ? 'playlists' : 'search';
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  ready: false,
  readyError: null,
  providers: [],
  provider: config.defaultProvider || 'netease',
  quality: config.defaultQuality || 'lossless',
  mediaType: 'track',
  query: '',
  searching: false,
  results: { tracks: [], albums: [], artists: [], playlists: [] },
  total: 0,
  accountStatuses: [],
  // Which sign-in route each platform offers, straight from the bridge.
  qrCapabilities: { qrImage: [], loginWindow: [] },
  // Background page: the community MV engine's state and the last match test.
  backgroundTest: null,
  backgroundTestFor: null,
  // The manual Bilibili search by title (the settings page's own query).
  titleSearch: null,
  // The signed-in account's own playlists / favourite folders (歌单 view).
  playlists: null,
  // NetEase 每日推荐: previewed as a group on the 歌单 page, opened as a detail.
  daily: { tracks: [], loaded: false, loading: false, error: null, name: null },
  // Locally kept playlists: the account's playlist list plus every playlist the
  // user opened, so the page does not have to re-fetch them every time.
  playlistStore: { ready: false, accounts: {}, collections: {} },
  // Community MV engine (ECHO-main's MvService) state.
  mvEngine: null,
  mvEngineLoading: false,
  mvSettings: null,
  mvCandidates: null,
  mvSelected: null,
  mvVariants: null,
  mvOffset: null,
  lastTrack: null,
  // The mod page opens on 我的歌单; switching tabs is remembered for the rest of
  // the session (the page is re-mounted on every route change).
  view: 'playlists',
  detail: null,
  // The view a detail page returns to: search results, or the 歌单 page the user
  // opened the playlist from (going "back" must not dump them into search).
  detailFrom: null,
  detailLoading: false,
  error: null,
  notice: null,
  busy: null,
  accountDraft: { provider: null, cookie: '' },
  qr: null,
};

const providerInfo = (name) => state.providers.find((item) => item.name === name) || null;
const accountStatus = (name) => state.accountStatuses.find((item) => item.provider === name) || null;
const visiblePlatforms = () => PLATFORM_ORDER.filter((name) => providerInfo(name));
const currentProviderLabel = (name = state.provider) => PLATFORM_LABELS[name] || providerInfo(name)?.displayName || name;

const providerState = (name) => {
  const provider = providerInfo(name);
  if (!provider) return { kind: 'missing', text: copy.providerUnavailable };
  const account = accountStatus(name);
  if (!provider.enabled) return { kind: 'disabled', text: provider.statusMessage || copy.providerUnavailable };
  if (provider.requiresAccount && !account?.connected) return { kind: 'account', text: copy.notLoggedIn };
  if (account?.connected) return { kind: 'ok', text: copy.loggedIn(account.displayName || account.username || '') };
  return { kind: 'ok', text: copy.ready };
};

// ---------------------------------------------------------------------------
// DOM helpers (no innerHTML with user data — everything is built as nodes)
// ---------------------------------------------------------------------------

const h = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
};

const button = (className, label, onClick, options = {}) => {
  const node = h('button', className, label);
  node.type = 'button';
  if (options.title) node.title = options.title;
  if (options.disabled) node.disabled = true;
  if (onClick) node.addEventListener('click', onClick);
  return node;
};

const formatDuration = (seconds) => {
  const total = Math.round(Number(seconds) || 0);
  if (!Number.isFinite(total) || total <= 0) return '--:--';
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
};

const formatCount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return copy.trackCount(0);
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)} 亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万`;
  return copy.trackCount(n);
};

const trackWebUrl = (track) => {
  const id = encodeURIComponent(String(track?.providerTrackId || ''));
  switch (track?.provider) {
    case 'netease': return `https://music.163.com/#/song?id=${id}`;
    case 'qqmusic': return `https://y.qq.com/n/ryqq/songDetail/${id}`;
    case 'kugou': return `https://www.kugou.com/song/#hash=${encodeURIComponent(String(track.providerTrackId).split('.')[0])}`;
    case 'spotify': return `https://open.spotify.com/track/${id}`;
    case 'tidal': return `https://tidal.com/track/${id}`;
    case 'bilibili': return `https://www.bilibili.com/video/${id}`;
    case 'youtube': return `https://www.youtube.com/watch?v=${id}`;
    case 'soundcloud': return `https://soundcloud.com/search/sounds?q=${encodeURIComponent(`${track.artist || ''} ${track.title || ''}`)}`;
    default: return null;
  }
};

// ---------------------------------------------------------------------------
// Queue / playback
// ---------------------------------------------------------------------------

const toQueueItem = (track, quality = state.quality) => {
  const key = trackKey(track);
  const resolved = quality || state.quality;
  return {
    id: key,
    mediaType: 'streaming',
    path: key,
    trackId: key,
    stableKey: key,
    provider: track.provider,
    providerTrackId: track.providerTrackId,
    quality: resolved,
    streamingQuality: resolved,
    title: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    albumArtist: track.albumArtist || track.artist || '',
    duration: Number(track.duration) || 0,
    coverThumb: track.coverThumb || track.coverUrl || DEFAULT_COVER,
    coverId: null,
    playable: track.playable !== false,
    unavailableReason: track.unavailableReason || null,
  };
};

/** Quality chain: bilibili rejects some tiers, so walk down like the community build. */
const qualityChain = (track, requested) => {
  const value = requested || state.quality;
  if (String(track?.provider) !== 'bilibili') return [value];
  return [value, 'high', 'standard', 'lossless'].filter((item, index, all) => item && all.indexOf(item) === index);
};

const playTrack = async (track, options = {}) => {
  rememberTrack(track);
  const player = playerApi();
  let lastError = null;
  for (const [index, quality] of qualityChain(track, options.quality).entries()) {
    try {
      const item = toQueueItem(track, quality);
      if (player?.playTrack) {
        return await player.playTrack(item, { ...options, quality, forceRefresh: options.forceRefresh === true || index > 0 });
      }
      const playback = playbackApi();
      if (!playback?.playMediaItem) throw new Error(copy.bridgeDown);
      return await playback.playMediaItem({
        item: { ...item, mediaType: 'streaming' },
        startSeconds: options.startSeconds,
        forceRefresh: options.forceRefresh === true || index > 0,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${copy.playFailed}: ${lastError instanceof Error ? lastError.message : String(lastError || '')}`);
};

const queueTrack = (track) => {
  const player = playerApi();
  const item = toQueueItem(track);
  if (player?.append) {
    player.append(item, { type: 'streaming', label: `${copy.title} / ${track.provider}`, provider: track.provider });
    return true;
  }
  return false;
};

const queueTracks = async (tracks, { startPlayback }) => {
  const playable = tracks.filter((track) => track.playable !== false);
  if (!playable.length) {
    reportNotice(copy.noTracks);
    return;
  }
  if (startPlayback && playable[0]) {
    await playTrack(playable[0]);
    for (const track of playable.slice(1)) {
      queueTrack(track);
    }
    return;
  }
  let queued = 0;
  for (const track of playable) {
    if (queueTrack(track)) queued += 1;
  }
  reportNotice(queued ? `${copy.queue} ${queued}` : copy.bridgeDown);
};

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

const reportNotice = (message) => {
  state.notice = message || null;
  showBackdropNotice(message);
  // The drawer mirrors the settings state, so a change re-renders it too.
  if (backdrop.drawer?.dataset.open === 'true') backdrop.drawerDirty = true;
  renderSoon();
};

const reportError = (error) => {
  state.error = error instanceof Error ? error.message : String(error || copy.loadFailed);
  showBackdropNotice(state.error, true);
  if (backdrop.drawer?.dataset.open === 'true') backdrop.drawerDirty = true;
  renderSoon();
};

/**
 * Surfaces a notice on the lyrics page as well.
 *
 * The sidebar page is not visible while the user is looking at the song detail
 * page, so a panel button that reports through `reportNotice` used to look like
 * "nothing happened"; the status pill shows it right where the click was made.
 */
const showBackdropNotice = (message, isError = false) => {
  const text = String(message || '').trim();
  if (!text || !lyricsPage()) return;
  if (backdrop.noticeTimer) clearTimeout(backdrop.noticeTimer);
  if (!backdrop.notice) {
    // Remember what the pill showed, so it can be restored afterwards.
    backdrop.noticePrevious = { state: backdrop.state, message: backdrop.message, reason: backdrop.reason };
  }
  backdrop.notice = { text, isError };
  setBackdropMessage(isError ? 'error' : 'notice', text, isError ? 'failed' : 'notice');
  backdrop.noticeTimer = setTimeout(() => {
    backdrop.noticeTimer = null;
    backdrop.notice = null;
    const previous = backdrop.noticePrevious;
    backdrop.noticePrevious = null;
    // Only step aside when nothing newer took over the pill in the meantime.
    if (backdrop.state === 'notice' || backdrop.state === 'error') {
      // A notice raised while the stream was still loading used to restore that
      // stale label ("loading"/"resolving") even after the video had started —
      // which hid a perfectly good MV behind the app's own backdrop. Reality
      // wins over the remembered label.
      const playing = backdrop.ready === true;
      const restored = playing
        ? 'playing'
        : previous?.state && previous.state !== 'notice'
          ? previous.state
          : (backdrop.source ? 'playing' : 'idle');
      setBackdropMessage(
        restored,
        playing ? copy.backdropMatched(backdrop.pendingTitle || '') : (previous?.message || ''),
        playing ? null : (previous?.reason ?? null),
      );
    }
  }, 4200);
};

let renderScheduled = false;
const renderSoon = () => {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
};

const loadProviders = async () => {
  const providers = await invokeMain('providers');
  state.providers = Array.isArray(providers) ? providers : [];
  const available = visiblePlatforms();
  if (!available.includes(state.provider) && available.length) {
    state.provider = available[0];
  }
};

const loadAccounts = async () => {
  try {
    // accountProfiles adds the signed-in identity (NetEase nickname/avatar/uid)
    // on top of the stored statuses; older bridges only expose the statuses.
    const profiles = await invokeMain('accountProfiles');
    state.accountStatuses = Array.isArray(profiles) ? profiles : [];
  } catch {
    try {
      const statuses = await invokeMain('accountStatuses');
      state.accountStatuses = Array.isArray(statuses) ? statuses : [];
    } catch {
      state.accountStatuses = [];
    }
  }
};

const loadQrCapabilities = async () => {
  try {
    const capabilities = await invokeMain('qrLoginCapabilities');
    const qrImage = Array.isArray(capabilities?.qrImage) ? capabilities.qrImage : [];
    const loginWindow = Array.isArray(capabilities?.loginWindow) ? capabilities.loginWindow : [];
    state.qrCapabilities = qrImage.length || loginWindow.length
      ? { qrImage, loginWindow }
      : defaultQrCapabilities();
  } catch {
    state.qrCapabilities = defaultQrCapabilities();
  }
};

/** The bridge's own routes, used when the capabilities call is unavailable. */
const defaultQrCapabilities = () => ({
  qrImage: ['netease', 'bilibili', 'qqmusic'],
  loginWindow: ['netease', 'qqmusic', 'kugou', 'bilibili', 'soundcloud', 'osu'],
});

/**
 * Reads the locally kept playlists from the main process.
 *
 * The account's playlist list and every playlist the user opened are written to
 * a JSON file next to ECHO's own data, so "我的歌单" is instant on the next visit
 * instead of hitting the platform again.
 */
const loadPlaylistStore = async () => {
  try {
    const result = await invokeMain('playlistStoreRead');
    state.playlistStore = {
      ready: true,
      path: result?.path || null,
      accounts: result?.accounts && typeof result.accounts === 'object' ? result.accounts : {},
      collections: result?.collections && typeof result.collections === 'object' ? result.collections : {},
    };
  } catch {
    // Without the store the page still works: it just fetches every time.
    state.playlistStore = { ready: true, accounts: {}, collections: {} };
  }
};

const supportsQrImage = (provider) => state.qrCapabilities.qrImage.includes(provider);
const supportsLoginWindow = (provider) => state.qrCapabilities.loginWindow.includes(provider);

const runSearch = async (overrides = {}) => {
  const query = (overrides.query ?? state.query ?? '').trim();
  if (!query) {
    state.results = { tracks: [], albums: [], artists: [], playlists: [] };
    state.total = 0;
    renderSoon();
    return;
  }
  state.searching = true;
  state.error = null;
  state.view = 'search';
  state.detail = null;
  renderSoon();
  try {
    const mediaTypes = overrides.mediaType && overrides.mediaType !== 'track' ? [overrides.mediaType] : ['track'];
    const result = await invokeMain('search', {
      provider: state.provider,
      query,
      mediaTypes,
      page: 1,
      pageSize: Math.max(10, Math.min(50, Number(config.pageSize) || 30)),
    });
    state.results = {
      tracks: Array.isArray(result?.tracks) ? result.tracks : [],
      albums: Array.isArray(result?.albums) ? result.albums : [],
      artists: Array.isArray(result?.artists) ? result.artists : [],
      playlists: Array.isArray(result?.playlists) ? result.playlists : [],
    };
    state.total = Number(result?.total) || 0;
  } catch (error) {
    state.results = { tracks: [], albums: [], artists: [], playlists: [] };
    reportError(error);
  } finally {
    state.searching = false;
    renderSoon();
  }
};

const openDetail = async (kind, id) => {
  state.detailLoading = true;
  markDetailOrigin();
  state.view = 'detail';
  state.detail = { kind, id, tracks: [] };
  state.error = null;
  renderSoon();
  try {
    if (kind === 'album') {
      const detail = await invokeMain('getAlbum', { provider: state.provider, providerAlbumId: id });
      state.detail = { kind, id, ...detail, tracks: detail?.tracks || [] };
    } else if (kind === 'artist') {
      const detail = await invokeMain('getArtist', { provider: state.provider, providerArtistId: id });
      state.detail = { kind, id, ...detail, tracks: detail?.topTracks || [] };
    } else if (kind === 'playlist') {
      const detail = await invokeMain('getAlbum', { provider: state.provider, providerAlbumId: id });
      state.detail = { kind, id, ...detail, tracks: detail?.tracks || [] };
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.detailLoading = false;
    renderSoon();
  }
};

/**
 * Imports a playlist from a pasted link and opens it.
 *
 * The community importer answers with the cache-store playlist id, not the
 * tracks, so the tracks are read back through `getStoredPlaylist` and shown as a
 * detail page — the list can be played straight away, and the user decides
 * separately whether to keep it on this machine (`保存到本地`).
 */
const importPlaylist = async (rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url) {
    reportNotice(copy.importNeedUrl);
    return;
  }

  markDetailOrigin();
  state.busy = copy.importing;
  renderSoon();
  try {
    const result = await invokeMain('importPlaylistFromUrl', { url });
    const playlistId = result?.playlistId || null;
    let tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    if (!tracks.length && playlistId) {
      const stored = await invokeMain('getStoredPlaylist', { playlistId }).catch(() => null);
      tracks = Array.isArray(stored?.tracks) ? stored.tracks : [];
    }
    const provider = result?.provider || state.provider;
    const key = `link:${provider}:${url}`;
    const saved = state.playlistStore?.collections?.[key];
    state.detail = {
      kind: 'playlist',
      id: `imported:${playlistId || url}`,
      name: result?.playlistName && result.playlistName !== 'Streaming' ? result.playlistName : copy.importPlaylist,
      description: copy.importHint,
      coverUrl: saved?.coverUrl || null,
      tracks,
      // A link import behaves like an account playlist on the detail page: it can
      // be re-fetched and kept locally, both keyed by the same link.
      accountEntry: {
        id: key,
        storeKey: key,
        provider,
        url,
        providerPlaylistId: url,
        title: result?.playlistName || copy.importPlaylist,
        kind: 'link',
      },
      collectionKey: key,
      importSource: 'link',
      cached: Boolean(saved?.tracks?.length),
      savedAt: saved?.savedAt || null,
    };
    state.view = 'detail';
    if (!tracks.length) reportNotice(copy.empty);
    else reportNotice(copy.imported(tracks.length));
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
  }
};

/**
 * The signed-in account's own playlists.
 *
 * NetEase / QQ Music / Qobuz answer with their cloud playlists, Bilibili with
 * the favourites folders the account created and follows plus "watch later"
 * (a mod-level addition — see `bilibiliAccountPlaylists` in the bridge).
 */
const loadAccountPlaylists = async ({ force = false } = {}) => {
  const provider = state.provider;
  const stored = state.playlistStore?.accounts?.[provider];
  const storedEntries = Array.isArray(stored?.entries) ? stored.entries : [];
  const previous = state.playlists?.provider === provider ? state.playlists.entries : [];
  const entries = storedEntries.length ? storedEntries : previous;

  // The list is kept on disk, so entering the page shows it immediately; only an
  // explicit refresh goes back to the platform.
  if (!force && entries.length) {
    state.playlists = {
      provider,
      loading: false,
      error: null,
      entries,
      cached: true,
      fetchedAt: stored?.fetchedAt || null,
    };
    renderSoon();
    return;
  }

  state.playlists = { provider, loading: true, error: null, entries, cached: entries.length > 0, fetchedAt: stored?.fetchedAt || null };
  renderSoon();
  try {
    const result = await invokeMain('listAccountPlaylists', { provider });
    const fresh = Array.isArray(result?.playlists) ? result.playlists : [];
    const fetchedAt = result?.fetchedAt || new Date().toISOString();
    state.playlists = { provider, loading: false, error: null, entries: fresh, cached: false, fetchedAt };
    if (fresh.length) void saveAccountPlaylists(provider, fresh, fetchedAt);
  } catch (error) {
    state.playlists = {
      provider,
      loading: false,
      error: error instanceof Error ? error.message : String(error),
      entries,
      cached: entries.length > 0,
      fetchedAt: stored?.fetchedAt || null,
    };
  }
  renderSoon();
};

/** Keeps the account's playlist list locally for the next visit. */
const saveAccountPlaylists = async (provider, entries, fetchedAt) => {
  try {
    const saved = await invokeMain('playlistStoreSaveAccount', { provider, entries, fetchedAt });
    if (saved?.accounts && typeof saved.accounts === 'object') {
      state.playlistStore = { ...(state.playlistStore || {}), ready: true, accounts: saved.accounts };
    }
  } catch {
    /* keeping the list locally is best effort */
  }
};

/**
 * Opens one of those playlists / favourites folders and shows its tracks.
 *
 * NetEase and QQ Music describe an account playlist with `webUrl` (the community
 * shape); Bilibili adds `url`. Reading only `url` and falling back to the bare
 * provider id is what made every NetEase playlist fail with "Please enter a
 * valid streaming playlist URL" — the id is not a URL. The main process turns a
 * bare id into a canonical link as well, so both sides are covered.
 *
 * Opening a playlist only *reads* it: keeping it on disk is the user's explicit
 * choice (`保存到本地`), not a side effect of looking at it.
 */
const openAccountPlaylist = async (entry) => {
  const provider = entry?.provider || state.provider;
  const url = String(entry?.url || entry?.webUrl || entry?.providerPlaylistId || '').trim();
  const key = playlistStoreKeyOf(entry);
  const stored = state.playlistStore?.collections?.[key];
  const storedTracks = Array.isArray(stored?.tracks) ? stored.tracks : [];
  // A locally kept playlist opens even when its link is gone (an imported list has
  // no platform entry behind it any more).
  if (!url && !storedTracks.length) return;
  // The playlist's own cover, so the detail page shows the real artwork instead
  // of the placeholder.
  const coverUrl = stored?.coverUrl || entryCoverOf(entry);

  markDetailOrigin();
  state.busy = copy.loading;
  renderSoon();
  try {
    if (storedTracks.length) {
      // Saved earlier: read straight from the local copy. No round trip, and it
      // works even when the platform is rate-limiting or offline.
      state.detail = {
        kind: 'playlist',
        id: `account:${entry.id || url || key}`,
        name: stored.name || entry.title || entry.name || copy.myPlaylists,
        description: stored.description || entry.description || copy.playlistsHint,
        coverUrl,
        tracks: storedTracks,
        accountEntry: entry,
        collectionKey: key,
        cached: true,
        savedAt: stored.savedAt || null,
      };
      state.view = 'detail';
      return;
    }

    const result = await invokeMain('importAccountCollection', {
      provider,
      url,
      providerPlaylistId: entry?.providerPlaylistId || null,
    });
    const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    state.detail = {
      kind: 'playlist',
      id: `account:${entry.id || url}`,
      name: result?.playlistName || entry.title || entry.name || copy.myPlaylists,
      description: entry.description || copy.playlistsHint,
      coverUrl,
      tracks,
      accountEntry: entry,
      collectionKey: key,
      cached: false,
      savedAt: null,
    };
    state.view = 'detail';
    if (!tracks.length) reportNotice(copy.empty);
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
  }
};

/** The cover an account playlist entry carries, whichever field the platform used. */
const entryCoverOf = (entry) => entry?.coverUrl || entry?.coverThumb || entry?.cover || null;

/** Re-reads an account playlist from the platform. */
const refreshAccountCollection = async () => {
  const detail = state.detail;
  const entry = detail?.accountEntry;
  if (!entry) return;
  const provider = entry.provider || state.provider;
  const url = String(entry.url || entry.webUrl || entry.providerPlaylistId || '').trim();
  const key = detail.collectionKey || playlistStoreKeyOf(entry);
  const stored = state.playlistStore?.collections?.[key];

  state.busy = copy.playlistsReimport;
  renderSoon();
  try {
    const result = await invokeMain('importAccountCollection', {
      provider,
      url,
      providerPlaylistId: entry?.providerPlaylistId || null,
    });
    const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    state.detail = {
      ...detail,
      name: result?.playlistName || detail.name,
      coverUrl: detail.coverUrl || entryCoverOf(entry),
      tracks,
      cached: Boolean(stored),
      savedAt: stored?.savedAt || null,
    };
    if (!tracks.length) {
      reportNotice(copy.empty);
    } else if (stored) {
      // Already kept locally: a refresh updates the copy the user asked to keep.
      const updated = await savePlaylistCollection(key, provider, state.detail, tracks, entry);
      if (updated?.savedAt) state.detail = { ...state.detail, cached: true, savedAt: updated.savedAt };
      reportNotice(copy.playlistsSaved(countLabel(tracks.length)));
    }
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
  }
};

/** Where a locally kept collection came from: the account, or a pasted link. */
const collectionSourceOf = (entry) => (entry?.kind === 'link' ? 'link' : 'account');

/** Keeps one playlist's tracks locally; returns the stored record (or null). */
const savePlaylistCollection = async (key, provider, detail, tracks, entry = null) => {
  const source = collectionSourceOf(entry || detail?.accountEntry);
  try {
    const saved = await invokeMain('playlistStoreSaveCollection', {
      key,
      provider,
      source,
      linkUrl: source === 'link'
        ? String(entry?.url || detail?.accountEntry?.url || '').trim() || null
        : null,
      name: detail?.name || '',
      description: detail?.description || '',
      coverUrl: detail?.coverUrl || null,
      tracks,
    });
    if (saved?.collections && typeof saved.collections === 'object') {
      state.playlistStore = { ...(state.playlistStore || {}), ready: true, collections: saved.collections };
      return saved.collections[key] || null;
    }
  } catch {
    /* best effort */
  }
  return null;
};

/** Forgets one playlist's local copy (the user's choice, per playlist). */
const removeStoredPlaylist = async (key) => {
  try {
    const saved = await invokeMain('playlistStoreRemoveCollection', { key });
    if (saved?.collections && typeof saved.collections === 'object') {
      state.playlistStore = { ...(state.playlistStore || {}), ready: true, collections: saved.collections };
    } else {
      const collections = { ...(state.playlistStore?.collections || {}) };
      delete collections[key];
      state.playlistStore = { ...(state.playlistStore || {}), ready: true, collections };
    }
  } catch (error) {
    reportError(error);
    return false;
  }
  if (state.detail?.collectionKey === key) state.detail = { ...state.detail, cached: false, savedAt: null };
  reportNotice(copy.playlistsRemoved);
  renderSoon();
  return true;
};

/**
 * Reads an account playlist and keeps it on disk.
 *
 * This is what 「保存到本地」 does on a card and on the detail page: nothing is
 * stored until the user asks for it.
 */
const saveStoredPlaylist = async (entry) => {
  const provider = entry?.provider || state.provider;
  const url = String(entry?.url || entry?.webUrl || entry?.providerPlaylistId || '').trim();
  if (!url) return false;
  const key = playlistStoreKeyOf(entry);

  state.busy = copy.playlistsSaving;
  renderSoon();
  try {
    const result = await invokeMain('importAccountCollection', {
      provider,
      url,
      providerPlaylistId: entry?.providerPlaylistId || null,
    });
    const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    if (!tracks.length) {
      reportNotice(copy.empty);
      return false;
    }
    const name = result?.playlistName || entry.title || entry.name || copy.myPlaylists;
    const record = await savePlaylistCollection(key, provider, {
      name,
      description: entry.description || copy.playlistsHint,
      coverUrl: entryCoverOf(entry),
    }, tracks, entry);
    if (state.detail?.collectionKey === key) {
      state.detail = { ...state.detail, name, tracks, cached: true, savedAt: record?.savedAt || new Date().toISOString() };
    }
    reportNotice(copy.playlistsSaved(countLabel(tracks.length)));
    return true;
  } catch (error) {
    reportError(error);
    return false;
  } finally {
    state.busy = null;
    renderSoon();
  }
};

/** The save / remove toggle used by the playlist cards and the detail page. */
const toggleStoredPlaylist = async (entry, event) => {
  // The card itself opens the playlist, so the toggle must not bubble into it.
  event?.stopPropagation?.();
  event?.preventDefault?.();
  const key = playlistStoreKeyOf(entry);
  if (state.playlistStore?.collections?.[key]) {
    await removeStoredPlaylist(key);
    return;
  }
  await saveStoredPlaylist(entry);
};

/** Drops every locally kept playlist / favourite folder. */
const clearLocalPlaylists = async () => {
  try {
    await invokeMain('playlistStoreClear');
  } catch (error) {
    reportError(error);
    return;
  }
  state.playlistStore = { ready: true, accounts: {}, collections: {} };
  // The page is left empty on purpose: re-fetching right away would immediately
  // write the same list back into the store the user just cleared.
  state.playlists = {
    provider: state.provider,
    loading: false,
    error: null,
    entries: [],
    cached: false,
    fetchedAt: null,
    cleared: true,
  };
  reportNotice(copy.playlistsCleared);
  renderSoon();
};

/**
 * Reads the NetEase 每日推荐 list (once per session unless `force`).
 *
 * The 歌单 page previews it and the detail page renders all of it, so both go
 * through here instead of calling the RPC twice.
 */
const loadDailyTracks = async ({ force = false } = {}) => {
  if (state.daily.loading) return state.daily.tracks;
  if (state.daily.loaded && !force) return state.daily.tracks;
  state.daily = { ...state.daily, loading: true, error: null };
  renderSoon();
  try {
    const result = await invokeMain('refreshNeteaseDailyRecommend');
    state.daily = {
      tracks: Array.isArray(result?.tracks) ? result.tracks : [],
      loaded: true,
      loading: false,
      error: null,
      name: result?.playlistName && result.playlistName !== 'Streaming' ? result.playlistName : copy.dailyRecommend,
    };
  } catch (error) {
    state.daily = { tracks: [], loaded: true, loading: false, error: error instanceof Error ? error.message : String(error), name: copy.dailyRecommend };
  }
  renderSoon();
  return state.daily.tracks;
};

const openDailyRecommend = async () => {
  markDetailOrigin();
  state.busy = copy.refresh;
  renderSoon();
  try {
    const tracks = await loadDailyTracks({ force: true });
    if (state.daily.error) throw new Error(state.daily.error);
    state.detail = {
      kind: 'playlist',
      id: 'daily-recommend',
      name: state.daily.name || copy.dailyRecommend,
      description: copy.dailyHint,
      tracks,
    };
    state.view = 'detail';
    if (!tracks.length) {
      reportNotice(copy.empty);
    }
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
  }
};

const saveAccountCookie = async (provider, cookie) => {
  if (!cookie.trim()) return;
  state.busy = copy.saveCookie;
  renderSoon();
  try {
    await invokeMain('accountSaveCookie', { provider, cookie: cookie.trim() });
    state.accountDraft = { provider: null, cookie: '' };
    await loadAccounts();
    reportNotice(copy.loggedIn(''));
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
  }
};

const clearAccount = async (provider) => {
  state.busy = '…';
  renderSoon();
  try {
    await invokeMain('accountClear', { provider });
    await loadAccounts();
    renderSoon();
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
  }
};

// ---------------------------------------------------------------------------
// QR sign-in
// ---------------------------------------------------------------------------

const QR_POLL_INTERVAL_MS = 2000;
let qrPollTimer = null;

const stopQrPolling = () => {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
};

const startQrLogin = async (provider) => {
  stopQrPolling();
  state.busy = copy.qrLogin;
  const mode = supportsQrImage(provider) ? 'image' : 'window';
  state.qr = { provider, mode, state: 'waiting', image: '', message: '', key: null, hint: '' };
  renderSoon();
  try {
    const started = await invokeMain('startQrLogin', { provider });
    state.qr = {
      provider,
      mode: started?.qrUrl ? 'image' : mode,
      state: started?.state || 'waiting',
      image: started?.qrUrl || '',
      message: started?.message || '',
      key: started?.key || null,
      hint: started?.expiresAt ? `expires ${new Date(started.expiresAt).toLocaleTimeString()}` : '',
    };
    if (state.qr.key) {
      qrPollTimer = setInterval(() => void pollQrLogin(), QR_POLL_INTERVAL_MS);
    }
  } catch (error) {
    state.qr = { provider, mode, state: 'failed', image: '', message: error instanceof Error ? error.message : String(error), key: null, hint: '' };
  } finally {
    state.busy = null;
    renderSoon();
  }
};

const pollQrLogin = async () => {
  const current = state.qr;
  if (!current?.key) {
    stopQrPolling();
    return;
  }
  try {
    const polled = await invokeMain('pollQrLogin', { key: current.key, provider: current.provider });
    // The panel may have been closed or replaced while the poll was in flight.
    if (state.qr?.key !== current.key) return;
    state.qr = {
      ...state.qr,
      state: polled?.state || state.qr.state,
      message: polled?.message || state.qr.message,
    };
    if (polled?.saved || polled?.state === 'confirmed') {
      stopQrPolling();
      state.qr = null;
      await loadAccounts();
      reportNotice(copy.qrSuccess);
      return;
    }
    if (polled?.state === 'expired' || polled?.state === 'failed') {
      stopQrPolling();
    }
    renderSoon();
  } catch (error) {
    stopQrPolling();
    if (state.qr?.key === current.key) {
      state.qr = { ...state.qr, state: 'failed', message: error instanceof Error ? error.message : String(error) };
      renderSoon();
    }
  }
};

const checkAccounts = async (provider) => {
  state.busy = copy.checking;
  renderSoon();
  try {
    if (provider) {
      await invokeMain('accountCheck', { provider });
    } else {
      await invokeMain('accountCheckAll');
    }
    await loadAccounts();
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
  }
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let pageRoot = null;
// The 「MV 背景」 sidebar page has its own root: the two pages live side by side in
// the sidebar and must not overwrite each other's DOM.
let backgroundPageRoot = null;

/**
 * Cover images are sometimes only published over plain `http:` (Bilibili's
 * favourite folders do this), which a Chromium renderer refuses to load in some
 * contexts. Every platform CDN in use answers on https as well, and the caller
 * keeps the original address as the fallback for hosts that do not.
 */
const safeCoverUrl = (url) => String(url || '').trim().replace(/^http:\/\//iu, 'https://');

const cover = (url, className) => {
  const img = h('img', className);
  const original = String(url || '').trim();
  img.src = safeCoverUrl(original) || DEFAULT_COVER;
  img.loading = 'lazy';
  img.alt = '';
  img.addEventListener('error', () => {
    // Upgraded https first, then the address as the platform gave it, then the
    // placeholder — so a cover that cannot be fetched never renders as broken.
    if (original && !original.startsWith('data:') && img.src !== original) img.src = original;
    else if (!String(img.src).startsWith('data:')) img.src = DEFAULT_COVER;
  });
  return img;
};

// ---------------------------------------------------------------------------
// Song background (auto-searched Bilibili MV behind the lyrics page)
// ---------------------------------------------------------------------------
// The knobs mirror ECHO-main's persisted `mv*` settings one for one — same
// names, defaults and ranges — so the background behaves like the community
// build. The mod's original `songBackground*` keys are still honoured as
// fallbacks so an existing configuration keeps working.

const BACKDROP_POLL_MS = 2000;
// A source that never reaches `playing` (a stalled CDN request, a variant the
// protocol handler could not refresh) must not leave a blank background behind:
// after this long it is retried, then escalated to the next acquisition step.
const BACKDROP_STALL_MS = 7000;
const BACKDROP_STALL_RETRIES = 2;

/** ECHO-main's continuous MV/audio drift-correction profiles. */
const MV_SYNC_PROFILES = {
  stable: { intervalMs: 750, tolerance: 1.2, hardSeek: 4, maxRateDelta: 0.06 },
  balanced: { intervalMs: 400, tolerance: 0.45, hardSeek: 2, maxRateDelta: 0.12 },
  precise: { intervalMs: 250, tolerance: 0.2, hardSeek: 0.9, maxRateDelta: 0.18 },
};

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

/** The effective background settings (mv* with songBackground* fallbacks). */
const backgroundConfig = () => {
  const pick = (legacyKey, key, fallback) => {
    const value = config[key];
    if (value !== undefined && value !== null && value !== '') return value;
    const legacy = config[legacyKey];
    return legacy !== undefined && legacy !== null ? legacy : fallback;
  };

  return {
    // The MV background is opt-in: without either key (or with them false) the
    // lyrics page keeps ECHO's own backdrop and nothing is matched online.
    enabled: pick('songBackgroundEnabled', 'mvEnabled', false) !== false,
    autoScale: config.mvImmersiveBackgroundAutoScale !== false,
    scalePercent: clampNumber(config.mvImmersiveBackgroundScalePercent, 70, 220, 115),
    widthPercent: clampNumber(config.mvImmersiveBackgroundWidthPercent, 10, 200, 100),
    heightPercent: clampNumber(config.mvImmersiveBackgroundHeightPercent, 10, 200, 100),
    fit: ['cover', 'contain', 'fill', 'none'].includes(config.mvImmersiveBackgroundFit)
      ? config.mvImmersiveBackgroundFit
      : 'cover',
    // 「默认（左右贴合）」: the video is scaled so its picture is exactly as wide
    // as the page, whatever its aspect ratio, and nothing is done about the
    // height — a tall video simply runs past the bottom edge. This is a per-user
    // setting (mvImmersiveBackgroundFitWidthPinned) rather than a fitting value
    // so it survives a restart and applies to every MV.
    fitWidth: config.mvImmersiveBackgroundFitWidthPinned === true,
    offsetX: clampNumber(config.mvImmersiveBackgroundOffsetXPercent, 0, 100, 50),
    offsetY: clampNumber(config.mvImmersiveBackgroundOffsetYPercent, 0, 100, 50),
    blur: clampNumber(pick('songBackgroundBlurPx', 'mvImmersiveBackgroundBlurPx', 0), 0, 32, 0),
    brightness: clampNumber(
      pick('songBackgroundBrightnessPercent', 'mvImmersiveBackgroundBrightnessPercent', 100),
      60,
      140,
      100,
    ),
    overlay: clampNumber(
      pick('songBackgroundOverlayOpacityPercent', 'mvImmersiveBackgroundOverlayOpacityPercent', 0),
      0,
      100,
      0,
    ),
    threshold: clampNumber(pick('songBackgroundMinScore', 'mvAutoApplyThreshold', 0.7), 0.3, 1, 0.7),
    autoSearch: config.mvAutoSearch !== false,
    autoPreload: config.mvAutoPreload !== false,
    titleOnly: config.mvTitleOnlySearch === true,
    searchSuffix: typeof config.mvSearchSuffix === 'string' ? config.mvSearchSuffix.trim() : 'MV',
    preferViews: config.mvPreferHighestViewCount !== false,
    maxQuality: typeof config.mvMaxQuality === 'string' ? config.mvMaxQuality : 'max',
    allow60fps: config.mvAllow60fps !== false,
    syncMode: ['stable', 'balanced', 'precise'].includes(config.mvSyncMode) ? config.mvSyncMode : 'balanced',
    followProgress: config.mvRestartAudioOnLoad === true,
    replayOnChange: config.mvReplayAudioOnChange !== false,
    hideLyrics: config.mvHideLyrics === true,
    readability: config.mvLyricsReadabilityEnhanced === true,
    // Whether the song detail page offers its ⚙ 设置 button (the one that opens
    // the full MV settings drawer). On by default.
    showSettingsButton: config.mvShowSettingsButton !== false,
    // How many search results the automatic match considers and the candidate
    // list in the settings page shows.
    candidateLimit: Math.round(clampNumber(config.mvCandidateLimit, 2, 20, 8)),
    // Background video pipeline: the community MV engine picks the variant, the
    // main process streams it (same as ECHO-main's echo-mv:// handler).
    matchMode: ['first', 'score', 'views'].includes(config.mvMatchMode) ? config.mvMatchMode : 'first',
    sourceMode: ['engine', 'progressive'].includes(config.mvSourceMode) ? config.mvSourceMode : 'engine',
  };
};

/**
 * The picture presets of the MV background.
 *
 * A preset is nothing but a coherent set of the size / fitting / zoom / position
 * keys, so after picking one every value stays editable by hand. `match` finds
 * the preset the current configuration corresponds to (or 'custom').
 *
 * `widthPinned` is what 「默认（左右贴合）」 uses: it is a preset of its own rather
 * than another fitting, because no single `object-fit` value scales a picture to
 * exactly the width of its box in both directions. It is also the shipped
 * default, so a fresh install already fits left and right exactly.
 */
const BACKDROP_PRESET_BASE = {
  mvImmersiveBackgroundAutoScale: false,
  mvImmersiveBackgroundWidthPercent: 100,
  mvImmersiveBackgroundHeightPercent: 100,
  mvImmersiveBackgroundScalePercent: 100,
  mvImmersiveBackgroundOffsetXPercent: 50,
  mvImmersiveBackgroundOffsetYPercent: 50,
  mvImmersiveBackgroundFitWidthPinned: false,
};

const BACKDROP_PRESETS = [
  {
    id: 'fitwidth',
    labelKey: 'presetFitWidth',
    // 按宽度贴合：cover 让画面不留黑边，宽度贴合再把它缩到与窗口同宽。
    patch: { ...BACKDROP_PRESET_BASE, mvImmersiveBackgroundFit: 'cover', mvImmersiveBackgroundFitWidthPinned: true },
  },
  { id: 'cover', labelKey: 'presetCover', patch: { ...BACKDROP_PRESET_BASE, mvImmersiveBackgroundFit: 'cover' } },
  { id: 'contain', labelKey: 'presetContain', patch: { ...BACKDROP_PRESET_BASE, mvImmersiveBackgroundFit: 'contain' } },
  { id: 'stretch', labelKey: 'presetStretch', patch: { ...BACKDROP_PRESET_BASE, mvImmersiveBackgroundFit: 'fill' } },
  { id: 'original', labelKey: 'presetOriginal', patch: { ...BACKDROP_PRESET_BASE, mvImmersiveBackgroundFit: 'none' } },
  {
    id: 'zoom',
    labelKey: 'presetZoom',
    patch: { ...BACKDROP_PRESET_BASE, mvImmersiveBackgroundFit: 'cover', mvImmersiveBackgroundScalePercent: 115 },
  },
  {
    id: 'cinema',
    labelKey: 'presetCinema',
    patch: { ...BACKDROP_PRESET_BASE, mvImmersiveBackgroundFit: 'cover', mvImmersiveBackgroundWidthPercent: 125 },
  },
  {
    id: 'auto',
    labelKey: 'presetAuto',
    patch: { ...BACKDROP_PRESET_BASE, mvImmersiveBackgroundAutoScale: true, mvImmersiveBackgroundFit: 'cover', mvImmersiveBackgroundScalePercent: 115 },
  },
];

const matchBackdropPreset = () => {
  for (const preset of BACKDROP_PRESETS) {
    const matches = Object.entries(preset.patch).every(([key, value]) => String(config[key]) === String(value));
    if (matches) return preset.id;
  }
  return 'custom';
};

const backdrop = {
  node: null,
  video: null,
  statusNode: null,
  trackId: null,
  candidate: null,
  state: 'idle',
  message: '',
  ready: false,
  lookupToken: 0,
  pollTimer: null,
  syncTimer: null,
  wheelSaveTimer: null,
  // 'engine' when the video came from the community MV service (the normal
  // path), 'progressive' when the plain playurl MP4 had to stand in for it.
  source: null,
  // The per-track MV offset the community service stores (milliseconds).
  offsetMs: 0,
  // Retries the current track through the next acquisition step after a media
  // error; installed by `runBackdropSteps`, cleared once a step takes over.
  retry: null,
  // Jumps straight to the complete MP4 (used when a stream is only a fragment).
  escalate: null,
  // The message of the last failed step, so the status pill can explain why
  // every source was given up on.
  lastError: null,

  // Machine-readable reason for the status pill (localised on render).
  reason: null,
  // The video's own duration as reported by the resolver (used for the loop
  // decision and for aligning with the song position).
  videoDuration: null,
  // Lyrics-page MV panel (the actions ECHO-main's MvPanel exposes).
  panel: null,
  // The full settings drawer on the right edge of the lyrics page.
  drawer: null,
  // Set when a setting changed while the drawer is open, so it can be rebuilt
  // on the next tick instead of on every poll (which would fight the sliders).
  drawerDirty: false,
  // The transient notice shown on the lyrics page after a panel action.
  notice: null,
  noticePrevious: null,
  noticeTimer: null,
  // The matched video, for the panel and the settings page.
  matched: null,
  // Which track the video currently in the layer was matched FOR (a stable
  // signature, not just the player's track id). A video whose owner no longer
  // matches the playing track is stale and has to be re-matched — that is what
  // made the previous song's MV keep playing after a track change.
  matchedFor: null,
  // Tracks this session played, so the current track can be identified from the
  // player's status without re-reading ECHO's queue shape.
  known: new Map(),
  // Bumped whenever the background layer has to be built again. ECHO re-renders
  // the lyrics page (dropping the injected nodes with it) more often than the
  // supervisor timer runs, so the layer knows when it is brand new and the
  // current track has to be matched once more.
  generation: 0,
  // True while the lyrics page is on screen, so entering it can be told apart
  // from the DOM churn the mutation observer otherwise reports.
  pageVisible: false,
  // Guards against overlapping match attempts (the observer and the timer can
  // both ask for one on the same tick).
  loading: false,
  // When the current source was handed to the <video>, so a stream that never
  // starts playing can be retried instead of leaving the layer blank until the
  // player-bar switch is toggled by hand.
  startedAt: 0,
  stalls: 0,
  // Title of the source currently loading, for the "matched / loading" message.
  pendingTitle: '',
};

/**
 * Forgets everything that was matched into the current background layer.
 *
 * The layer is rebuilt whenever ECHO re-renders the lyrics page — the lyrics
 * arriving is enough to drop the injected nodes — and the old `<video>` (with
 * the only copy of the stream URL) goes with it. Without this reset the
 * supervisor timer still believed the track was matched, so it never loaded a
 * video into the new element: the song detail page showed an empty background
 * until the player-bar switch was toggled off and on again.
 */
const resetBackdropMatch = () => {
  backdrop.trackId = null;
  backdrop.matchedFor = null;
  backdrop.ready = false;
  backdrop.source = null;
  backdrop.retry = null;
  backdrop.escalate = null;
  backdrop.offsetMs = 0;
  backdrop.videoDuration = null;
  backdrop.candidate = null;
  backdrop.matched = null;
  backdrop.lastError = null;
  backdrop.startedAt = 0;
  backdrop.stalls = 0;
  backdrop.pendingTitle = '';
  backdrop.state = 'idle';
  backdrop.message = '';
  backdrop.reason = null;
};

const backdropEnabled = () => backgroundConfig().enabled;

/** Toggles the document flag that hides the lyric column (see the CSS block). */
const setHideLyricsFlag = (on) => {
  const root = document?.documentElement;
  if (!root) return;
  if (on) {
    root.dataset.mmsHideLyrics = 'true';
  } else {
    root.removeAttribute('data-mms-hide-lyrics');
  }
};

// ECHO-main renders the immersive layer as an absolutely positioned sibling of
// the page backdrop. The Steam build's `.lyrics-backdrop` is
// `position:absolute; z-index:0; isolation:isolate; contain:paint`, so a layer
// inserted BEFORE it (or at z-index:-1) is painted underneath the app's own
// gradient and never visible. It is inserted directly AFTER `.lyrics-backdrop`
// instead: equal z-index + later DOM order wins, and `.lyrics-left-panel`
// (z-index 7) still keeps every lyric line above the video.
const LYRICS_PAGE_SELECTOR = '.lyrics-page';
const LYRICS_BACKDROP_SELECTOR = ':scope > .lyrics-backdrop';
const LYRICS_BG_CLASS = 'mms-lyrics-bg';
const LYRICS_STATUS_CLASS = 'mms-backdrop-status';
const MV_PANEL_CLASS = 'mms-mv-panel';
const DRAWER_CLASS = 'mms-mv-drawer';

const lyricsPage = () => document.querySelector(LYRICS_PAGE_SELECTOR);

/**
 * Puts the background layer directly AFTER ECHO's own `.lyrics-backdrop`.
 *
 * This is the whole stacking contract: both are absolutely positioned with
 * z-index 0, so the later sibling paints on top. On the first injection ECHO's
 * backdrop may not be mounted yet (the lyrics page commits before its cover /
 * lyrics exist), in which case the layer was inserted as the page's FIRST child —
 * and then the backdrop, being opaque in every theme
 * (`.lyrics-backdrop{background: radial-gradient(...), linear-gradient(#fbfbfc…)}`),
 * painted straight over the video. That is exactly the reported symptom: instead
 * of the MV you saw ECHO's own bright-white centre fading to grey at the sides.
 * Toggling the player-bar switch re-created the nodes while the backdrop already
 * existed, so the layer landed in the right place and the MV appeared.
 */
const placeBackdropLayer = (page, node) => {
  if (!page || !node) return;
  const anchor = page.querySelector(LYRICS_BACKDROP_SELECTOR);
  // Still mounting: leave it at the end of the page and let the next poll (or the
  // mutation observer) place it once the backdrop exists.
  if (!anchor || anchor === node) return;
  if (anchor.nextElementSibling === node) return;
  // insertBefore moves an existing node, and a null reference appends.
  page.insertBefore(node, anchor.nextElementSibling);
};

/**
 * Creates (or reuses) the immersive background layer inside ECHO's lyrics page.
 * Returns null when the lyrics page is not on screen, which keeps the video out
 * of every other route.
 */
const ensureBackdrop = () => {
  const page = lyricsPage();
  if (!page) {
    backdrop.node = null;
    backdrop.video = null;
    backdrop.pageVisible = false;
    return null;
  }

  const existing = page.querySelector(`:scope > .${LYRICS_BG_CLASS}`);
  // The layer is usable only when it is the node we track *and* the <video> we
  // handed the stream URL to is still inside it. ECHO replacing the page, or
  // rebuilding its children, leaves the tracked node detached — and then the
  // old <video> is gone even though `existing` may still be found.
  const live = Boolean(existing) && backdrop.node === existing && backdrop.video?.parentNode === existing;
  if (live) {
    // Re-assert the stacking order on every pass: ECHO inserting its backdrop
    // after our layer (or React reordering the page) must not bury the MV.
    placeBackdropLayer(page, existing);
    return existing;
  }

  const node = existing ?? h('div', LYRICS_BG_CLASS);
  node.replaceChildren();
  node.dataset.state = 'idle';
  // No stream yet: the layer stays transparent and the app's cover wallpaper is
  // the background (ECHO-main renders its wrapper only once a URL exists).
  node.dataset.source = 'none';
  node.dataset.playing = 'false';
  // A rebuilt layer starts empty, so the track that used to play in it has to be
  // matched again (see resetBackdropMatch).
  resetBackdropMatch();

  const video = h('video', 'mms-backdrop-video');
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  // Same preload hint ECHO-main's background <video> uses: metadata early, so the
  // explicit play on loadedmetadata/canplay can do its job.
  video.preload = 'metadata';
  // Deliberately NOT crossOrigin: Bilibili's CDN sends no CORS headers, and a
  // CORS-mode request fails outright (media error 4). The main process injects
  // the Referer/UA headers the CDN requires instead.
  video.addEventListener('loadedmetadata', () => {
    if (backdrop.video !== video) return;
    applyBackdropStyle();
    void alignBackdropToAudio({ force: true });
    escalateShortBackdropSource();
    // ECHO-main's own background <video> calls playVideo() on loadedmetadata when
    // the audio is playing; without this an early play() that was refused while
    // the media was still loading would never be retried until the next poll.
    if (!video.paused) return;
    void video.play?.().catch(() => {
      /* the supervisor timer keeps retrying */
    });
  });
  video.addEventListener('playing', () => {
    // A detached element (the layer was rebuilt) must not reveal the new one.
    if (backdrop.video !== video || backdrop.node !== node) return;
    backdrop.ready = true;
    // `data-playing` is what the stylesheet reveals the layer with: it follows the
    // video itself, so no other state label (a notice, a retry, a stale restore)
    // can hide a video that is demonstrably playing.
    node.dataset.playing = 'true';
    setBackdropMessage('playing', copy.backdropMatched(backdrop.pendingTitle || ''));
    applyBackdropStyle();
  });
  // Keeps the reveal flag honest while the video runs (and recovers it if
  // anything cleared the attribute behind our back).
  video.addEventListener('timeupdate', () => {
    if (backdrop.video !== video || video.paused) return;
    if (node.dataset.playing !== 'true') node.dataset.playing = 'true';
  });
  video.addEventListener('emptied', () => {
    if (backdrop.video !== video) return;
    node.dataset.playing = 'false';
  });
  // A refused early play() (media not ready yet) is retried as soon as the element
  // can play, which is what the community build gets from autoPlay + its
  // loadedmetadata playVideo() call.
  video.addEventListener('canplay', () => {
    if (backdrop.video !== video || !video.paused) return;
    void video.play?.().catch(() => {
      /* the supervisor timer keeps retrying */
    });
  });
  video.addEventListener('ended', () => {
    if (backdrop.video !== video) return;
    // ECHO-main keeps the MV background looping under the song.
    try {
      video.currentTime = 0;
      void video.play?.().catch(() => {});
    } catch {
      /* ignore */
    }
  });
  video.addEventListener('error', () => {
    if (backdrop.video !== video) return;
    // A media error on the community stream (expired variant, CDN refusal) is
    // retried through the fallback chain before the background is given up on.
    if (typeof backdrop.retry === 'function' && backdrop.retry()) return;
    node.dataset.state = 'error';
    setBackdropMessage('error', copy.backdropFailed, 'failed');
  });

  const overlay = h('div', 'mms-backdrop-overlay');
  node.append(video, overlay);
  backdrop.video = video;
  backdrop.node = node;
  backdrop.generation += 1;

  if (!existing) {
    // Appended first, then placed directly after ECHO's backdrop (see
    // placeBackdropLayer — never as the first child, which would put the video
    // underneath the app's opaque backdrop).
    page.append(node);
    attachBackdropGestures(node);
  }
  placeBackdropLayer(page, node);

  syncBackdropLoop();
  return node;
};

/**
 * The status pill lives next to the video layer (not inside it): the layer is
 * transparent unless it is actually playing, so a message inside it would never
 * be visible while the match or the resolution is running.
 */
const ensureBackdropStatus = () => {
  const page = lyricsPage();
  if (!page) {
    backdrop.statusNode = null;
    return null;
  }
  const existing = page.querySelector(`:scope > .${LYRICS_STATUS_CLASS}`);
  if (existing) {
    backdrop.statusNode = existing;
    return existing;
  }
  const node = h('div', LYRICS_STATUS_CLASS);
  node.setAttribute('role', 'status');
  const text = h('span', 'mms-backdrop-status-text', '');
  node.append(text);
  const anchor = page.querySelector(`:scope > .${LYRICS_BG_CLASS}`);
  if (anchor?.nextSibling) page.insertBefore(node, anchor.nextSibling);
  else page.append(node);
  backdrop.statusNode = node;
  return node;
};

/** Shows/hides the pill and keeps its text in step with the match state. */
const updateBackdropStatus = () => {
  const node = backdrop.statusNode;
  if (!node) return;
  const settings = backgroundConfig();
  const visible = settings.enabled
    && ['searching', 'resolving', 'loading', 'nomatch', 'error', 'notice'].includes(backdrop.state);
  node.dataset.visible = String(visible);
  node.dataset.state = backdrop.state;

  const text = node.querySelector('.mms-backdrop-status-text');
  if (text) text.textContent = backdrop.message || '';
};

/** ECHO-main always loops the MV background under the song. */
const syncBackdropLoop = () => {
  const video = backdrop.video;
  if (!video) return;
  video.loop = true;
};

/** Below this a video is treated as a fragment rather than a whole MV. */
const BACKDROP_MIN_PLAUSIBLE_SECONDS = 60;

/**
 * Bilibili's DASH URLs are *fragmented* streams: handed to a `<video>` they
 * report only the few seconds they contain and then loop, which is what made the
 * background play its first seconds forever and never follow the song. The
 * community service normally resolves a usable variant, but when the loaded
 * source turns out to be far shorter than the track it belongs to, the
 * acquisition escalates to the complete MP4 instead.
 */
const escalateShortBackdropSource = () => {
  const video = backdrop.video;
  const duration = Number(video?.duration);
  if (!Number.isFinite(duration) || duration <= 0) return;
  if (duration >= BACKDROP_MIN_PLAUSIBLE_SECONDS) return;

  const expected = Number(state.lastTrack?.duration) || Number(backdrop.videoDuration) || 0;
  if (!(expected > duration * 2)) return;
  if (typeof backdrop.escalate !== 'function') return;

  backdrop.lastError = copy.backdropShortSource;
  backdrop.escalate();
};

// ---------------------------------------------------------------------------
// Where the lyrics-page MV panel and its settings drawer live
// ---------------------------------------------------------------------------
//
// Neither floats freely: the panel sits at the bottom-left of the song detail
// page and the settings drawer opens from the right edge. Both are positioned by
// the stylesheet, so there is nothing to remember and no drag to keep in step.

const ensureBackdropPanel = () => {
  const page = lyricsPage();
  if (!page) {
    backdrop.panel = null;
    return null;
  }
  if (backdrop.panel?.isConnected) return backdrop.panel;

  const panel = h('div', MV_PANEL_CLASS);
  panel.dataset.open = 'false';
  const head = h('div', 'mms-mv-panel-head');
  const title = h('span', 'mms-mv-panel-title', copy.panelTitle);
  const toggleOpen = () => {
    panel.dataset.open = panel.dataset.open === 'true' ? 'false' : 'true';
  };
  const settings = button('mms-mv-panel-action', copy.panelSettings, (event) => {
    event?.stopPropagation?.();
    openBackdropDrawer();
  });
  settings.title = copy.drawerTitle;
  const toggle = button('mms-mv-panel-action', '▾', (event) => {
    event?.stopPropagation?.();
    toggleOpen();
  });
  // The ⚙ button is the detail page's own way into the settings, so it can be
  // switched off in the settings (mvShowSettingsButton).
  const setRow = backgroundConfig().showSettingsButton
    ? [settings]
    : [];
  head.append(title, h('span', 'mms-mv-panel-head-actions', '') , ...setRow, toggle);
  head.addEventListener('click', () => toggleOpen());
  const body = h('div', 'mms-mv-panel-body');
  panel.append(head, body);

  const anchor = page.querySelector(`:scope > .${LYRICS_STATUS_CLASS}`);
  if (anchor?.nextSibling) page.insertBefore(panel, anchor.nextSibling);
  else page.append(panel);
  backdrop.panel = panel;
  // The panel is anchored above the player bar (see syncBottomChrome).
  syncBottomChrome();
  renderBackdropPanelBody();
  return panel;
};

/**
 * Keeps the settings drawer clear of ECHO's titlebar.
 *
 * The window controls live in the app titlebar, which is its own stacking
 * context painted above the page surface — and the drawer is anchored to the
 * page, which sits a few pixels above the viewport. Measuring the titlebar is the
 * only reliable way to know where the drawer has to start (fullscreen hides it,
 * themes change its height), and the offset of the page against the viewport has
 * to be added to it: without that the drawer's own header ended up a couple of
 * pixels under the window controls and its buttons were covered.
 */
const DRAWER_TOP_MARGIN_PX = 10;

const syncDrawerTop = () => {
  const drawer = backdrop.drawer;
  if (!drawer?.style?.setProperty) return;

  let top = 0;
  const titlebar = document.querySelector ? document.querySelector('.app-titlebar') : null;
  const rect = typeof titlebar?.getBoundingClientRect === 'function' ? titlebar.getBoundingClientRect() : null;
  if (rect && Number(rect.height) > 0 && Number(rect.bottom) > 0) {
    top = Math.ceil(Number(rect.bottom));
  }
  if (!(top > 0)) {
    try {
      const root = document?.documentElement;
      const raw = typeof getComputedStyle === 'function' && root
        ? getComputedStyle(root).getPropertyValue('--titlebar-height')
        : '';
      const parsed = Number.parseFloat(String(raw || ''));
      if (Number.isFinite(parsed) && parsed > 0) top = Math.ceil(parsed);
    } catch {
      /* the token is optional */
    }
  }
  if (!(top > 0)) top = 44;

  // The page the drawer is positioned against starts a little below the
  // viewport's top edge, so the titlebar's own bottom has to be shifted by that
  // much before it means anything inside the page.
  let pageOffset = 0;
  const page = lyricsPage();
  const pageRect = typeof page?.getBoundingClientRect === 'function' ? page.getBoundingClientRect() : null;
  if (pageRect && Number(pageRect.top) > 0) pageOffset = Number(pageRect.top);
  drawer.style.setProperty('--mms-drawer-top', `${Math.ceil(top + pageOffset + DRAWER_TOP_MARGIN_PX)}px`);
};

/**
 * Measures the player bar into a CSS variable the panel and the drawer keep clear of.
 *
 * Both float inside `.lyrics-page`, which is a stacking context of its own
 * (`z-index: 1`) sitting BELOW the player bar (`z-index: 12`) — that order has to
 * stay, or the transport controls would be buried under the lyrics page. An
 * absolutely positioned child cannot paint above its own stacking context, so the
 * only reliable way to keep a bottom-anchored panel clickable is to stop it from
 * reaching under the bar: `bottom: calc(bar + inset)`. The bar's height changes
 * with the layout (window width, mini-player, fullscreen), so it is measured
 * rather than hard-coded.
 */
const syncBottomChrome = () => {
  const root = document?.documentElement;
  if (!root?.style?.setProperty) return;
  if (!document.querySelector) return;

  const bar = document.querySelector('.player-bar');
  const rect = typeof bar?.getBoundingClientRect === 'function' ? bar.getBoundingClientRect() : null;
  const viewport = Number(window.innerHeight) || 0;
  let height = 0;
  if (bar) {
    let hidden = false;
    try {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(bar) : null;
      hidden = style?.display === 'none' || style?.visibility === 'hidden';
    } catch {
      /* a host without getComputedStyle is treated as visible */
    }
    if (!hidden) {
      const measured = Number(rect?.height) || 0;
      const bottom = Number(rect?.bottom) || 0;
      if (measured > 0) height = Math.ceil(measured);
      // Laid out but not measured: whatever room is left under it is its own.
      else if (bottom > 0 && viewport > 0) height = Math.max(0, Math.ceil(viewport - bottom));
    }
  }
  // A host that renders no player bar at all (or one that is hidden) needs no
  // room reserved, so the floaters fall back to their plain bottom inset.
  root.style.setProperty('--mms-chrome-bottom', `${Math.max(0, height)}px`);
};

/**
 * The settings drawer: the same content as the sidebar's 「背景设置」 page, so
 * everything can be adjusted without leaving the song detail page. Opening it
 * slides it in from the right edge of the page.
 */
const ensureBackdropDrawer = () => {
  const page = lyricsPage();
  if (!page) {
    backdrop.drawer = null;
    return null;
  }
  if (backdrop.drawer?.isConnected) return backdrop.drawer;

  const drawer = h('aside', DRAWER_CLASS);
  drawer.dataset.open = 'false';
  const head = h('div', 'mms-mv-drawer-head');
  head.append(
    h('strong', 'mms-mv-drawer-title', copy.drawerTitle),
    button('mms-mv-panel-action', copy.drawerClose, () => closeBackdropDrawer()),
  );
  const body = h('div', 'mms-mv-drawer-body');
  drawer.append(head, body);
  page.append(drawer);
  backdrop.drawer = drawer;
  syncDrawerTop();
  // The drawer is anchored above the player bar too (see syncBottomChrome).
  syncBottomChrome();
  return drawer;
};

const openBackdropDrawer = () => {
  const drawer = ensureBackdropDrawer();
  if (!drawer) return;
  syncDrawerTop();
  syncBottomChrome();
  // Ask for the engine state on open: a session that never visited the sidebar
  // 背景设置 page has no account information yet, and the drawer's account card
  // (and its 刷新状态 button) needs it right away.
  if (!state.mvEngine) void loadMvEngine();
  drawer.dataset.open = 'true';
  renderBackdropDrawerBody();
  bodyClicked(drawer);
};

const closeBackdropDrawer = () => {
  if (!backdrop.drawer) return;
  backdrop.drawer.dataset.open = 'false';
};

/** Keeps the drawer in step with clicks inside it (switch state, not focus). */
const bodyClicked = (node) => {
  node.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || target === node) return;
    const tag = String(target.tagName || '').toUpperCase();
    // Sliders/inputs keep their own interaction; buttons and selects re-render.
    if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'OPTION') renderSoon();
  });
};

/**
 * The nearest scrollable ancestor, so a re-render can restore its offset.
 *
 * Replacing a panel's children resets its scroll position, and the settings page /
 * drawer are long: adjusting a value near the bottom used to snap the panel back to
 * the top ("the page slides up").
 */
const scrollableAncestor = (node) => {
  for (let parent = node?.parentNode; parent; parent = parent.parentNode) {
    const height = Number(parent.scrollHeight);
    const visible = Number(parent.clientHeight);
    if (Number.isFinite(height) && Number.isFinite(visible) && visible > 0 && height > visible) return parent;
  }
  return null;
};

/** Rebuilds the drawer body from the current configuration, keeping its scroll. */
const renderBackdropDrawerBody = () => {
  const drawer = backdrop.drawer;
  if (!drawer) return;
  const body = drawer.querySelector('.mms-mv-drawer-body');
  if (!body) return;
  const scrollTop = Number(body.scrollTop) || 0;
  body.replaceChildren(renderBackgroundSettings());
  if (scrollTop > 0) body.scrollTop = scrollTop;
  backdrop.drawerDirty = false;
};

/** Nudges the per-track MV offset and confirms it on the lyrics page. */
const nudgeBackdropOffset = async (delta, reset = false) => {
  const next = reset ? 0 : (Number(state.mvOffset) || 0) + delta;
  await engineSetOffset(next);
  reportNotice(`${copy.engineOffset}：${(Number(state.mvOffset ?? next) / 1000).toFixed(1)}s`);
};

/** Rebuilds the panel body from the current background/engine state. */
const renderBackdropPanelBody = (force = false) => {
  const panel = backdrop.panel;
  if (!panel) return;
  const body = panel.querySelector('.mms-mv-panel-body');
  if (!body) return;
  // The supervisor timer calls this every couple of seconds. Replacing the
  // buttons while the user is pressing one swallows the click (a click needs
  // mousedown and mouseup on the same element), which is what made the offset
  // buttons feel dead; only rebuild when something they show actually changed.
  // The pill state is not part of the signature: it is a data attribute, so it is
  // updated in place even while a 4.2s notice is on screen.
  panel.dataset.state = backdrop.state;
  const settings = backgroundConfig();
  const signature = [
    backdrop.matched?.title || '',
    backdrop.matched?.uploader || '',
    backdrop.matched?.bvid || '',
    backdrop.matched?.url || '',
    Number(state.mvOffset) || 0,
    settings.hideLyrics ? 'hide' : 'show',
  ].join('|');
  if (!force && body.dataset.signature === signature) return;
  body.dataset.signature = signature;
  body.replaceChildren();

  const matched = backdrop.matched;
  body.append(h('small', 'mms-muted', matched
    ? `${matched.title || matched.bvid}${matched.uploader ? ` · ${matched.uploader}` : ''}`
    : copy.backdropNoMatch));

  const row = h('div', 'mms-mv-panel-actions');
  row.append(
    button('mms-ghost', copy.panelRematch, () => {
      // Same correction the transport button runs: drop the current video,
      // match this track again and seek it onto the audio.
      void rematchCurrentTrack('panel').then((ok) => {
        if (!ok) {
          backdrop.trackId = null;
          backdrop.matchedFor = null;
          reportNotice(copy.panelRematch);
          void pollBackdrop();
        }
      });
    }),
    button('mms-ghost', copy.panelOffsetMinus, () => void nudgeBackdropOffset(-500)),
    button('mms-ghost', copy.panelOffsetPlus, () => void nudgeBackdropOffset(500)),
    button('mms-ghost', copy.panelOffsetReset, () => void nudgeBackdropOffset(0, true)),
  );
  row.append(
    button('mms-ghost', settings.hideLyrics ? copy.panelShow : copy.panelHide, () => {
      void persistBackgroundSettings({ mvHideLyrics: !settings.hideLyrics });
    }),
    button('mms-ghost', copy.panelSettings, () => openBackdropDrawer()),
  );
  if (matched?.url) {
    row.append(button('mms-ghost', copy.engineOpen, () => {
      try {
        window.open(matched.url, '_blank');
      } catch {
        /* ignore */
      }
    }));
  }
  row.append(button('mms-ghost', copy.panelDisable, () => void setBackdropEnabled(false)));
  body.append(row);
};

/** Drag-to-pan and Ctrl+wheel zoom, mirroring ECHO-main's immersive layer. */
const attachBackdropGestures = (node) => {
  if (node.dataset.gestures === 'true') return;
  node.dataset.gestures = 'true';

  let drag = null;
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const bounds = node.getBoundingClientRect();
    if (!(bounds.width > 0) || !(bounds.height > 0)) return;
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: backgroundConfig().offsetX,
      offsetY: backgroundConfig().offsetY,
      width: bounds.width,
      height: bounds.height,
    };
    node.dataset.dragging = 'true';
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best effort */
    }
  });

  const applyDrag = (event) => {
    if (!drag) return false;
    const nextX = clampNumber(drag.offsetX + ((event.clientX - drag.startX) / drag.width) * 100, 0, 100, 50);
    const nextY = clampNumber(drag.offsetY + ((event.clientY - drag.startY) / drag.height) * 100, 0, 100, 50);
    node.style.setProperty('--mms-immersive-position-x', `${Math.round(nextX)}%`);
    node.style.setProperty('--mms-immersive-position-y', `${Math.round(nextY)}%`);
    return true;
  };

  node.addEventListener('pointermove', (event) => {
    applyDrag(event);
  });

  node.addEventListener('pointerup', (event) => {
    if (!drag) return;
    const moved = applyDrag(event);
    const nextX = clampNumber(drag.offsetX + ((event.clientX - drag.startX) / drag.width) * 100, 0, 100, 50);
    const nextY = clampNumber(drag.offsetY + ((event.clientY - drag.startY) / drag.height) * 100, 0, 100, 50);
    drag = null;
    node.dataset.dragging = 'false';
    try {
      node.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (moved) {
      void persistBackgroundSettings({
        mvImmersiveBackgroundOffsetXPercent: Math.round(nextX),
        mvImmersiveBackgroundOffsetYPercent: Math.round(nextY),
      });
    }
  });

  node.addEventListener('pointercancel', () => {
    drag = null;
    node.dataset.dragging = 'false';
  });

  // ECHO-main zooms with Ctrl + wheel in a 5% step and saves 360ms after the
  // last notch.
  node.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || !event.deltaY) return;
    event.preventDefault();
    event.stopPropagation();
    const current = clampNumber(backgroundConfig().scalePercent, 70, 220, 115);
    const next = Math.round(clampNumber(current + (event.deltaY > 0 ? -5 : 5), 70, 220, 115));
    config.mvImmersiveBackgroundScalePercent = next;
    applyBackdropStyle();
    if (backdrop.wheelSaveTimer) clearTimeout(backdrop.wheelSaveTimer);
    backdrop.wheelSaveTimer = setTimeout(() => {
      backdrop.wheelSaveTimer = null;
      void persistBackgroundSettings({ mvImmersiveBackgroundScalePercent: next });
    }, 360);
  }, { passive: false });
};

/**
 * ECHO-main's automatic scale: the aspect-mismatch ratio between the layer and
 * the video, clamped to 3.5. With auto-scale on the video is `contain`ed and the
 * ratio compensates the letterbox; with it off the video simply covers.
 */
const calculateImmersiveAutoScale = () => {
  const node = backdrop.node;
  const video = backdrop.video;
  if (!node || !video) return 1;
  const bounds = typeof node.getBoundingClientRect === 'function'
    ? node.getBoundingClientRect()
    : { width: window.innerWidth, height: window.innerHeight };
  const width = bounds.width || window.innerWidth;
  const height = bounds.height || window.innerHeight;
  const videoWidth = video.videoWidth || 0;
  const videoHeight = video.videoHeight || 0;
  if (!(width > 0 && height > 0 && videoWidth > 0 && videoHeight > 0)) return 1;
  const coverRatio = Math.max(width / videoWidth, height / videoHeight);
  const containRatio = Math.min(width / videoWidth, height / videoHeight);
  if (!(containRatio > 0)) return 1;
  return Math.min(3.5, Math.max(1, coverRatio / containRatio));
};

/**
 * The scale that makes a `cover`ed picture exactly as wide as its box.
 *
 * With `object-fit: cover` the picture is already scaled to cover the box; it is
 * exactly the width of the box only when the box and the picture share an aspect
 * ratio. Otherwise the picture overflows sideways (box taller than the picture)
 * or has its sides cropped (box wider than the picture), and this factor brings
 * whichever edge is off back to the box — left and right then line up precisely,
 * at an unchanged aspect ratio, while the height is left to overflow or crop on
 * its own. Measured from the live element, so it follows every window resize.
 */
const calculateFittedWidthScale = () => {
  const node = backdrop.node;
  const video = backdrop.video;
  const bounds = typeof node?.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
  const boxWidth = Number(bounds?.width) || Number(window.innerWidth) || 0;
  const boxHeight = Number(bounds?.height) || Number(window.innerHeight) || 0;
  const videoWidth = Number(video?.videoWidth) || 0;
  const videoHeight = Number(video?.videoHeight) || 0;
  if (!(boxWidth > 0 && boxHeight > 0 && videoWidth > 0 && videoHeight > 0)) return 1;
  const coverRatio = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  const fittedRatio = boxWidth / videoWidth;
  if (!(coverRatio > 0) || !(fittedRatio > 0)) return 1;
  // The same clamp the community build uses for its own automatic scale, so a
  // freak aspect ratio cannot blow the picture up out of all proportion.
  return Math.min(3.5, coverRatio / fittedRatio);
};

const applyBackdropStyle = () => {
  const node = backdrop.node;
  if (!node) {
    setHideLyricsFlag(false);
    return;
  }

  const settings = backgroundConfig();
  const autoScale = settings.autoScale ? calculateImmersiveAutoScale() : 1;
  // 「默认（左右贴合）」 wins over the fitting: it pins the *picture* to the width
  // of the page instead of filling the box, which no object-fit value can do.
  // The zoom (and, while auto scale is on, the letterbox ratio) still applies.
  const fitted = settings.fitWidth ? calculateFittedWidthScale() : null;
  const scale = fitted === null ? (settings.scalePercent / 100) * autoScale : fitted * (settings.scalePercent / 100);
  node.dataset.autoScale = String(settings.autoScale);
  node.dataset.readability = String(settings.readability);
  node.dataset.fitWidth = String(settings.fitWidth);
  node.dataset.fit = settings.fitWidth ? 'fit-width' : (settings.autoScale ? 'contain' : settings.fit);
  node.style.setProperty('--mms-immersive-scale', scale.toFixed(4));
  node.style.setProperty('--mms-immersive-auto-scale', autoScale.toFixed(2));
  // Size / fitting of the video box; auto-scale always contains the video so the
  // computed ratio can compensate the letterbox (ECHO-main's behaviour). With the
  // width fitting the box is exactly the page and the video covers it, so the
  // picture fills the full width and is scaled as one piece (no distortion).
  node.style.setProperty('--mms-immersive-width', `${settings.widthPercent}%`);
  node.style.setProperty('--mms-immersive-height', `${settings.heightPercent}%`);
  node.style.setProperty('--mms-immersive-fit', settings.fitWidth ? 'cover' : (settings.autoScale ? 'contain' : settings.fit));
  node.style.setProperty('--mms-immersive-position-x', `${settings.offsetX}%`);
  node.style.setProperty('--mms-immersive-position-y', `${settings.offsetY}%`);
  node.style.setProperty('--mms-immersive-blur', `${settings.blur}px`);
  node.style.setProperty('--mms-immersive-brightness', `${settings.brightness}%`);
  node.style.setProperty('--mms-immersive-overlay', (settings.overlay / 100).toFixed(2));

  if (settings.hideLyrics && node.dataset.state === 'playing') {
    setHideLyricsFlag(true);
  } else {
    setHideLyricsFlag(false);
  }
};

const setBackdropMessage = (state, message, reason = null) => {
  backdrop.state = state;
  backdrop.message = message || '';
  backdrop.reason = reason;
  if (backdrop.node) backdrop.node.dataset.state = state;
  if (state !== 'playing') setHideLyricsFlag(false);
  updateBackdropStatus();
  // The transport button reports whether an MV is on screen, so every state the
  // match goes through has to reach it (searching → loading → playing/failed).
  syncPlayerToggle();
};

const stopBackdrop = (state = 'idle') => {
  backdrop.lookupToken += 1;
  const video = backdrop.video;
  if (video) {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      /* ignore */
    }
  }
  backdrop.candidate = null;
  backdrop.ready = false;
  backdrop.trackId = null;
  backdrop.matchedFor = null;
  backdrop.source = null;
  backdrop.retry = null;
  backdrop.escalate = null;
  backdrop.offsetMs = 0;
  backdrop.startedAt = 0;
  backdrop.pendingTitle = '';
  if (backdrop.node) {
    backdrop.node.dataset.playing = 'false';
    backdrop.node.dataset.source = 'none';
  }
  setBackdropMessage(state);
};

/**
 * Picks the video for a track.
 *
 * `first` (the default) is deliberately dumb: whatever Bilibili's own search
 * returns first for the track name, which is what "match by name, take the first
 * video" means. The other two modes keep ECHO-main's ranking.
 */
const chooseBackdropCandidate = (candidates) => {
  const settings = backgroundConfig();
  const list = (Array.isArray(candidates) ? candidates : []).filter((item) => item?.id);
  if (!list.length) return null;
  if (settings.matchMode === 'first') return list[0];

  if (settings.matchMode === 'score') {
    const eligible = list.filter((item) => Number(item.score) >= settings.threshold);
    if (!eligible.length) return null;
    return [...eligible].sort((left, right) => (Number(right.score) || 0) - (Number(left.score) || 0))[0];
  }

  const eligible = settings.preferViews ? list : list.filter((item) => Number(item.score) >= settings.threshold);
  const pool = eligible.length ? eligible : list;
  return [...pool].sort((left, right) => {
    const views = (Number(right.viewCount) || 0) - (Number(left.viewCount) || 0);
    if (views !== 0) return views;
    return (Number(right.score) || 0) - (Number(left.score) || 0);
  })[0];
};

/** The Bilibili query for a track: title (+ artist) (+ an MV hint by setting). */
const backdropQueryFor = (track) => {
  const settings = backgroundConfig();
  const title = String(track?.title || '').trim();
  const artist = String(track?.artist || '').trim();
  const parts = settings.titleOnly || !artist ? [title] : [title, artist];
  if (settings.searchSuffix) parts.push(settings.searchSuffix);
  return parts.filter(Boolean).join(' ');
};

/** The Bilibili video id inside any of the shapes the sources hand back. */
const bvidOf = (value) => {
  const match = /(BV[0-9A-Za-z]{4,})/u.exec(String(value || ''));
  return match ? match[1] : '';
};

/**
 * The snapshot request ECHO-main's renderer builds for a streaming track. The
 * community MvService answers it with its normal search/scoring pipeline.
 */
const snapshotRequestFor = (track, query) => ({
  trackId: String(trackKey(track)),
  title: track?.title || 'Untitled',
  artist: track?.artist || 'Unknown Artist',
  album: track?.album ?? null,
  albumArtist: track?.albumArtist ?? null,
  durationSeconds: Number(track?.duration) || null,
  coverThumb: track?.coverThumb || track?.coverUrl || null,
  mediaType: 'streaming',
  query: query ?? null,
});

/** Attaches a source URL to the layer and starts playback. */
const playBackdropSource = (url, best, track, source) => {
  const node = ensureBackdrop();
  const video = node ? backdrop.video : null;
  if (!node || !video || !url) {
    setBackdropMessage('error', copy.backdropFailed, 'failed');
    return false;
  }
  backdrop.source = source;
  backdrop.pendingTitle = best.title || track?.title || '';
  backdrop.ready = false;
  // This layer now owns a stream: that is what reveals it (and hands the backdrop
  // over), exactly like ECHO-main rendering `.lyrics-mv-background` once a URL
  // exists. A new source has no frames yet, so the playing flag is cleared.
  if (backdrop.node) backdrop.node.dataset.source = 'ready';
  if (backdrop.node) backdrop.node.dataset.playing = 'false';
  backdrop.startedAt = Date.now();
  syncBackdropLoop();
  // Deliberately NOT 'playing': the layer is revealed by the video's own
  // `playing` event (see ensureBackdrop), so a stream that never starts cannot
  // masquerade as a playing background. Set before play() so the ordering holds
  // even where `playing` is delivered synchronously.
  setBackdropMessage('loading', copy.backdropLoading(backdrop.pendingTitle));
  video.src = url;
  video.load();
  void video.play?.().catch(() => {
    // Autoplay refusal is not fatal: the element will start once the page has
    // been interacted with, and the supervisor timer keeps nudging it.
  });
  // Follow the song from the start: ECHO-main force-aligns the MV whenever a new
  // video is loaded, whatever the continuous-sync setting says.
  void alignBackdropToAudio({ force: true, restart: backgroundConfig().replayOnChange });
  return true;
};

/** Copies a resolved community video into the state the panel/status read. */
const applyEngineVideo = (video, best) => {
  state.mvSelected = video;
  state.mvOffset = Number(video.offsetMs) || 0;
  backdrop.offsetMs = Number(video.offsetMs) || 0;
  backdrop.videoDuration = Number(video.durationSeconds) || null;
  const bvid = bvidOf(best?.id) || bvidOf(video.sourceId) || bvidOf(video.providerUrl) || bvidOf(video.url);
  const title = video.title || best?.title || '';
  const url = video.providerUrl || best?.url || null;
  backdrop.candidate = { bvid, url, title };
  backdrop.matched = { bvid, title, uploader: video.artist ?? best?.uploader ?? null, url };
  // The quality chips of the lyrics-page panel come from the resolved streams;
  // MvService caches them, so this re-read is cheap.
  void invokeMain('mvResolveStreams', { videoId: video.id })
    .then((variants) => {
      state.mvVariants = variants;
      renderSoon();
    })
    .catch(() => {
      state.mvVariants = null;
    });
};

/**
 * The community acquisition path, exactly as ECHO-main's MvPanel drives it:
 *
 *   1. `searchNetworkCandidatesForSnapshot` runs the community search and
 *      persists the candidates for this track,
 *   2. the candidate the background matched by name is selected through
 *      `selectVideo`, which resolves and stores the stream variant,
 *   3. `mediaUrl` (`echo-mv://stream/<videoId>/<variantId>`) is handed to the
 *      renderer's <video>, and the registered `echo-mv://` handler streams it.
 *
 * When no persisted candidate works — an unlisted video, a provider that only
 * resolves on demand — the community's temporary-playback route
 * (`echo-mv://ephemeral/<token>`) stands in. Nothing is downloaded.
 */
const acquireEngineVideo = async (track, best) => {
  const query = backdropQueryFor(track);
  const request = snapshotRequestFor(track, query);
  const bvid = bvidOf(best?.id);

  let candidates = [];
  try {
    candidates = await invokeMain('mvSearchNetworkCandidatesForSnapshot', request);
  } catch {
    candidates = [];
  }
  const list = Array.isArray(candidates) ? candidates : [];
  state.mvCandidates = { request, candidates: list };

  // The name-matched video wins; otherwise the configured ranking decides.
  const named = bvid
    ? list.find((item) => bvidOf(item?.providerUrl) === bvid || bvidOf(item?.url) === bvid)
    : null;
  const chosen = named ?? chooseBackdropCandidate(list);

  if (chosen?.id) {
    try {
      const video = await invokeMain('mvSelectVideo', { trackId: request.trackId, videoId: chosen.id });
      if (video?.mediaUrl) return video;
    } catch {
      /* fall through to the temporary route */
    }
  }

  try {
    const video = await invokeMain('mvGetTemporaryPlayableForSnapshot', {
      ...request,
      query: best?.title || query,
    });
    if (video?.mediaUrl) return video;
  } catch {
    /* fall through to the progressive fallback */
  }

  return null;
};

/**
 * The three steps the background tries, in community-first order.
 *
 * `resolved` short-circuits the first step for the manual paths (apply a
 * candidate, preview one, bind a file), where the community service has already
 * produced the video: the caller has stored it with `applyEngineVideo`.
 */
const backdropPlanFor = (track, best, resolved = null) => {
  const context = { video: resolved };
  const title = () => best?.title || context.video?.title || track?.title || '';

  const engineStep = async () => {
    if (resolved) {
      return resolved.mediaUrl ? { url: resolved.mediaUrl, title: resolved.title || title(), source: 'engine' } : null;
    }
    setBackdropMessage('resolving', copy.backdropResolvingFor(title()));
    const video = await acquireEngineVideo(track, best);
    if (!video?.mediaUrl || video.playableInApp === false) return null;
    context.video = video;
    applyEngineVideo(video, best);
    return { url: video.mediaUrl, title: video.title || title(), source: 'engine' };
  };

  // Same variant, relayed through the main process: some hosts refuse the
  // custom scheme but accept the identical stream over the loopback proxy.
  const proxyStep = async () => {
    if (!context.video?.mediaUrl) return null;
    const served = await invokeMain('mvResolveMediaUrl', { mediaUrl: context.video.mediaUrl });
    if (!served?.url) return null;
    return { url: served.url, title: context.video.title || title(), source: 'engine' };
  };

  // Last resort: Bilibili's progressive (non-DASH) MP4 for the same video,
  // which is one complete file with a real duration.
  const progressiveStep = async () => {
    const bvid = bvidOf(best?.id) || bvidOf(context.video?.providerUrl) || bvidOf(context.video?.url);
    if (!bvid) return null;
    setBackdropMessage('resolving', copy.backdropResolvingFor(title()));
    const stream = await invokeMain('prepareMvProgressive', {
      bvid,
      title: title(),
      durationSeconds: track?.duration,
      maxQuality: backgroundConfig().maxQuality,
      allow60fps: backgroundConfig().allow60fps,
    });
    if (!stream?.url) return null;
    backdrop.videoDuration = Number(stream.durationSeconds) || null;
    return { url: stream.url, title: title(), source: 'progressive' };
  };

  return { context, engineStep, proxyStep, progressiveStep };
};

/**
 * Runs the acquisition steps until one of them produces a playing video.
 *
 * A later media error (an expired variant, a refused CDN request) moves on to
 * the next step instead of leaving the background black, which is why the
 * remaining steps are kept as `backdrop.retry`. A source that turns out to be
 * only a few seconds long (Bilibili's DASH segments) jumps straight to the last
 * step — the complete MP4 — through `backdrop.escalate`.
 */
const runBackdropSteps = async (steps, track, token) => {
  for (let index = 0; index < steps.length; index += 1) {
    if (token !== backdrop.lookupToken) return false;
    let resolved = null;
    try {
      resolved = await steps[index]();
    } catch (error) {
      backdrop.lastError = error instanceof Error ? error.message : String(error);
    }
    if (token !== backdrop.lookupToken) return false;
    if (!resolved?.url) continue;

    const remaining = steps.slice(index + 1);
    backdrop.retry = remaining.length
      ? () => {
        backdrop.retry = null;
        backdrop.escalate = null;
        return runBackdropSteps(remaining, track, token);
      }
      : null;
    const lastStep = steps[steps.length - 1];
    backdrop.escalate = index < steps.length - 1
      ? () => {
        backdrop.retry = null;
        backdrop.escalate = null;
        return runBackdropSteps([lastStep], track, token);
      }
      : null;
    return playBackdropSource(resolved.url, resolved, track, resolved.source);
  }

  if (token === backdrop.lookupToken) {
    setBackdropMessage('error', backdrop.lastError || copy.backdropNoStream, 'no-source');
  }
  return false;
};

/**
 * The identity a matched video belongs to: the player's track id plus the title
 * and artist the match was made from.
 *
 * The id alone is not enough. ECHO's queue can hand the same id to a different
 * item, a re-queued item keeps its id, and the status can arrive before the new
 * track's metadata — and in all of those cases the layer would keep the previous
 * song's video, which is exactly the "switching songs does not re-match" bug.
 */
const trackSignature = (track, id) => [
  String(id ?? track?.stableKey ?? track?.id ?? ''),
  String(track?.title || '').trim(),
  String(track?.artist || '').trim(),
].join('\u0001');

/** Stops and unloads the video currently in the layer (keeps the layer itself). */
const dropBackdropVideo = () => {
  const video = backdrop.video;
  if (video) {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      /* ignore */
    }
  }
  backdrop.ready = false;
  backdrop.source = null;
  backdrop.retry = null;
  backdrop.escalate = null;
  backdrop.offsetMs = 0;
  backdrop.startedAt = 0;
  backdrop.stalls = 0;
  if (backdrop.node) {
    backdrop.node.dataset.source = 'none';
    backdrop.node.dataset.playing = 'false';
  }
};

const loadBackdropFor = async (track) => {
  const settings = backgroundConfig();
  const token = ++backdrop.lookupToken;
  backdrop.candidate = null;
  backdrop.ready = false;
  backdrop.source = null;
  backdrop.retry = null;
  backdrop.escalate = null;
  backdrop.offsetMs = 0;
  backdrop.lastError = null;
  // The match that is starting belongs to this track from here on, so the video
  // left in the layer is dropped: it is the previous song's until this one
  // replaces it, and leaving it playing is what the automatic correction fixes.
  dropBackdropVideo();
  const query = backdropQueryFor(track);
  setBackdropMessage('searching', `${copy.backdropSearchingFor(query)}`);

  // A video the user bound to this song (a candidate they picked or a custom
  // link) is remembered by the MV service and wins over a fresh search, so the
  // choice survives restarts.
  let selected = null;
  try {
    selected = await invokeMain('mvGetSelected', { trackId: String(trackKey(track)) });
  } catch {
    selected = null;
  }
  if (token !== backdrop.lookupToken) return false;
  const bound = selected && (selected.sourceType === 'manual' || selected.sourceType === 'local') ? selected : null;
  if (bound?.id) {
    let video = bound;
    if (!video.mediaUrl || video.playableInApp === false) {
      const resolved = await invokeMain('mvResolveStreams', { videoId: bound.id }).catch(() => null);
      video = resolved?.video ?? bound;
    }
    if (token !== backdrop.lookupToken) return false;
    if (video?.mediaUrl && video.playableInApp !== false) {
      applyEngineVideo(video, { id: video.sourceId ?? bound.id, title: video.title });
      if (bound.filePath) {
        // A bound local file is served by the Range-capable loopback proxy.
        const served = await invokeMain('mvServeLocalFile', { filePath: bound.filePath }).catch(() => null);
        if (served?.url) {
          return playBackdropSource(served.url, { title: video.title || '' }, track, 'local');
        }
      }
      return playEngineVideo(video, { id: video.sourceId, title: video.title, url: video.providerUrl });
    }
  }

  let payload = null;
  try {
    payload = await invokeMain('findMvCandidates', {
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      query,
      limit: settings.candidateLimit,
      mode: settings.matchMode,
    });
  } catch {
    // A failed name search must not keep the community engine from trying.
    payload = null;
  }
  if (token !== backdrop.lookupToken) return false;

  const candidates = Array.isArray(payload) ? payload : (Array.isArray(payload?.candidates) ? payload.candidates : []);
  const best = chooseBackdropCandidate(candidates) || { id: '', title: track?.title || '', uploader: null, url: null };
  const bvid = bvidOf(best.id);
  if (bvid) {
    backdrop.candidate = { bvid, url: best.url, title: best.title };
    backdrop.matched = { bvid, title: best.title, uploader: best.uploader ?? null, url: best.url ?? null };
  }

  const plan = backdropPlanFor(track, best);
  const steps = settings.sourceMode === 'progressive'
    ? [plan.progressiveStep]
    : [plan.engineStep, plan.proxyStep, plan.progressiveStep];
  return runBackdropSteps(steps, track, token);
};

/**
 * Resolves the currently playing track from the player's status.
 *
 * Tracks started from the mod page are remembered as they are played, but
 * ECHO's own library / queue / radio playback never goes through that path —
 * and then the MV background, the lyrics-page panel and its offset buttons all
 * had nothing to work with (a click looked like it did nothing). The player
 * status carries the full track object, so it is used as the fallback and the
 * track is registered with the MV engine on the spot.
 *
 * The registry is keyed by the player's track id, and that id is NOT unique over
 * a session: a queue that reuses ids, a re-queued item or a rebuilt queue hands
 * the same id to a different song. Returning the remembered entry blindly kept
 * the previous song's title (and so its MV) alive for the new one, which is the
 * "switching songs does not re-match" bug: the remembered track is only used
 * when it still describes what the status says is playing.
 */
const currentTrackFromStatus = (status) => {
  const id = status?.currentTrackId ?? status?.trackId ?? null;
  if (!id) return null;
  const fresh = status?.currentTrack ?? status?.currentItem?.track ?? null;
  const known = backdrop.known.get(String(id));
  if (known) {
    const sameSong = !fresh
      || ((!fresh.title || fresh.title === known.title) && (!fresh.artist || fresh.artist === known.artist));
    if (sameSong) return known;
    // The id was reused by a different song: fall through and re-register the
    // track the status describes, so the match is made for what is playing now.
  }

  if (!fresh || (!fresh.title && !fresh.id)) return null;
  // The status id is authoritative for keying, so the registry and the engine
  // look the track up under exactly the id the player reports.
  const candidate = {
    ...fresh,
    id: fresh.id ?? String(id),
    stableKey: String(id),
    mediaType: fresh.mediaType ?? 'streaming',
  };
  rememberTrack(candidate);
  return candidate;
};

/** The video's duration: the element's own, or the resolver's when it is unknown. */
const effectiveVideoDuration = () => {
  const own = Number(backdrop.video?.duration);
  if (Number.isFinite(own) && own > 0) return own;
  return Number(backdrop.videoDuration) || 0;
};

/**
 * The song position (seconds) reported by the loader's player runtime.
 *
 * ECHO's player runtime answers with `positionSeconds` / `durationSeconds`
 * (`echoExternalMod.player.status()`), while earlier community builds used
 * `positionMs` / `durationMs`; the reference mod tolerates both. Only a real
 * number is accepted: a status that cannot be read must never be treated as
 * "position 0", because that is what used to force-seek the MV back to its first
 * seconds every few hundred milliseconds.
 */
const statusPositionSeconds = (status) => {
  if (!status || typeof status !== 'object') return null;
  for (const value of [status.positionSeconds, status.currentPositionSeconds]) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds);
  }
  for (const value of [status.positionMs, status.progressMs]) {
    const millis = Number(value);
    if (Number.isFinite(millis)) return Math.max(0, millis / 1000);
  }
  return null;
};

/**
 * Corrects the layer when it comes back on screen: the video there has to belong
 * to the track that is playing, and it has to be at the song's position.
 *
 * `pollBackdrop` re-matches a stale video, but only once its status round-trip
 * has answered — by then the previous song's MV has already been visible. This
 * runs first on (re-)entering the page and drops the layer's video without
 * waiting when the identity it was matched for is not the one playing.
 */
const verifyBackdropTrack = async () => {
  if (!backdropEnabled() || !lyricsPage()) return;
  const player = playerApi();
  if (!player?.status) return;
  const status = await player.status().catch(() => null);
  const id = status?.currentTrackId ?? status?.trackId ?? null;
  if (!id) return;
  const track = currentTrackFromStatus(status);
  if (!track) return;
  const signature = trackSignature(track, id);
  const sameTrack = String(id) === String(backdrop.trackId) && backdrop.matchedFor === signature;
  if (!sameTrack) {
    // Stale (or the id matches but the video was matched for another song).
    backdrop.trackId = null;
    backdrop.matchedFor = null;
    dropBackdropVideo();
    return;
  }
  // Right song: line the video up with the audio instead of resuming where the
  // user left the page.
  await alignBackdropToAudio({ force: true });
};

/** Aligns the background video with the audio position (ECHO-main's drift model). */
const alignBackdropToAudio = async ({ force = false, restart = false } = {}) => {
  const video = backdrop.video;
  if (!video || !video.src) return;
  const settings = backgroundConfig();
  if (!settings.followProgress && !force) return;

  const player = playerApi();
  if (!player?.status) return;
  let status = null;
  try {
    status = await player.status();
  } catch {
    return;
  }

  const state = String(status?.state || '');
  const playing = state === 'playing' || state === 'loading' || state === 'buffering';
  const idle = state === 'paused' || state === 'stopped' || state === 'idle' || state === 'ended';
  if (playing) {
    if (video.paused) void video.play?.().catch(() => {});
  } else if (idle && !video.paused) {
    video.pause();
  }
  if (!force && !settings.followProgress) return;

  const audioSeconds = statusPositionSeconds(status);
  // Nothing to align to: leave the video playing where it is rather than
  // pinning it to the first seconds.
  if (audioSeconds === null) return;

  const duration = effectiveVideoDuration();
  if (!(duration > 0)) return;

  // ECHO-main's target time: the song position plus the per-track MV offset,
  // wrapped into the video because the background loops.
  const positionSeconds = Math.max(0, audioSeconds + (Number(backdrop.offsetMs) || 0) / 1000);
  const target = ((positionSeconds % duration) + duration) % duration;
  const profile = MV_SYNC_PROFILES[settings.syncMode] || MV_SYNC_PROFILES.balanced;

  // A forced alignment (new video, track change) always seeks, exactly like the
  // community player; the tolerance/cooldown rules only govern the drift timer.
  if (force || restart) {
    try {
      video.currentTime = target;
    } catch {
      /* ignore */
    }
    try {
      video.playbackRate = 1;
    } catch {
      /* ignore */
    }
    return;
  }

  // ECHO-main's signed drift: positive means the MV is behind the song, so a
  // positive correction speeds the video up. Getting this sign wrong pushes the
  // video further away from the song instead of pulling it back.
  let drift = target - video.currentTime;
  if (Math.abs(drift) > duration / 2) {
    drift -= Math.sign(drift) * duration;
  }

  // Inside the tolerance band the video is left at its natural rate.
  if (Math.abs(drift) <= profile.tolerance) {
    try {
      video.playbackRate = 1;
    } catch {
      /* ignore */
    }
    return;
  }

  if (Math.abs(drift) >= profile.hardSeek) {
    try {
      video.currentTime = target;
    } catch {
      /* ignore */
    }
    try {
      video.playbackRate = 1;
    } catch {
      /* ignore */
    }
    return;
  }

  if (!playing) return;
  const delta = clampNumber(drift / profile.hardSeek, -profile.maxRateDelta, profile.maxRateDelta, 0);
  try {
    video.playbackRate = 1 + delta;
  } catch {
    /* ignore */
  }
};

const pollBackdrop = async () => {
  if (!backdropEnabled()) {
    syncPlayerToggle();
    return;
  }
  // The background only exists on the lyrics page; without it there is nothing
  // to inject into, so the search is deferred until the page is opened. The
  // transport button still has to go dim here — "an MV is on screen" is false as
  // soon as the page is gone.
  if (!lyricsPage()) {
    syncPlayerToggle();
    return;
  }
  ensureBackdrop();
  ensureBackdropStatus();
  ensureBackdropPanel();
  ensureBackdropDrawer();
  applyBackdropStyle();
  updateBackdropStatus();
  renderBackdropPanelBody();
  // The drawer is rebuilt only when a setting changed, so dragging a slider is
  // not interrupted by the poll.
  if (backdrop.drawer?.dataset.open === 'true' && backdrop.drawerDirty) renderBackdropDrawerBody();
  syncBackdropSyncTimer();
  const player = playerApi();
  if (!player?.status) return;
  let status = null;
  try {
    status = await player.status();
  } catch {
    return;
  }

  const settings = backgroundConfig();
  const id = status?.currentTrackId ?? status?.trackId ?? null;
  const track = id ? currentTrackFromStatus(status) : null;

  // The injected layer must stay a child of the lyrics page: if ECHO re-rendered
  // the page and our node ended up detached (or re-parented), the app's own
  // backdrop would paint instead — the "MV loaded but is not shown" report.
  if (backdrop.node && backdrop.node.parentNode !== lyricsPage()) {
    ensureBackdrop();
  }

  // The layer is revealed by `data-source`, which is what the stylesheet keys on.
  // Re-assert it here as well: ECHO re-renders the lyrics page, re-parents nodes
  // and re-applies styles, and a layer that owns a stream must never be left
  // transparent behind the app's own backdrop. (The user-visible symptom was an MV
  // that loaded but was not shown, fixed only by toggling the switch.)
  if (backdrop.node && backdrop.video?.src) {
    if (backdrop.node.dataset.source !== 'ready') backdrop.node.dataset.source = 'ready';
    if (!backdrop.video.paused
        && (backdrop.video.readyState === undefined || Number(backdrop.video.readyState) >= 2)) {
      if (backdrop.node.dataset.playing !== 'true') backdrop.node.dataset.playing = 'true';
      if (!backdrop.ready) backdrop.ready = true;
      if (backdrop.state !== 'playing') {
        setBackdropMessage('playing', copy.backdropMatched(backdrop.pendingTitle || ''));
      }
    }
  }

  // A <video> that was handed a URL but never reached `playing` is stuck: a
  // stalled CDN request, or a variant the echo-mv:// handler could not refresh.
  // This is exactly the case the user used to fix by toggling the player-bar
  // switch off and on, so nudge playback first and escalate on our own if that
  // does not help.
  if (track && backdrop.trackId === String(id) && backdrop.video?.src) {
    if (!backdrop.ready) {
      if (backdrop.video.paused) void backdrop.video.play?.().catch(() => {});
      if (Number(backdrop.startedAt) > 0 && Date.now() - Number(backdrop.startedAt) > BACKDROP_STALL_MS) {
        backdrop.stalls = Number(backdrop.stalls || 0) + 1;
        backdrop.startedAt = Date.now();
        if (backdrop.stalls <= BACKDROP_STALL_RETRIES && typeof backdrop.retry === 'function') {
          // Next acquisition step (loopback proxy → complete MP4).
          const next = backdrop.retry;
          backdrop.retry = null;
          backdrop.escalate = null;
          setBackdropMessage('loading', copy.backdropRetrying);
          void next();
          return;
        }
        if (backdrop.stalls > BACKDROP_STALL_RETRIES) {
          // Every source failed to start: acquire the video for this track again.
          backdrop.stalls = 0;
          backdrop.trackId = null;
          backdrop.lastError = null;
          setBackdropMessage('resolving', copy.backdropRetrying);
        }
      }
    }
  }

  // Collecting the tracks the background matched is what "entering the song
  // detail page" means, so a failed attempt must not latch the track id: the next
  // poll has to be able to try again (otherwise the MV only appears after the
  // background switch is toggled off and on again).
  //
  // A layer without a source is likewise not "already matched": ECHO can rebuild
  // the lyrics page under us and take the <video> (and its URL) with it, which
  // used to leave the track id set and the background permanently blank.
  const hasSource = Boolean(backdrop.video?.src);
  // The video in the layer must belong to the track that is playing NOW. The
  // player's id can survive a track change (a queue that reuses ids, a re-queued
  // item, a status that lands late), so the signature the video was matched for
  // is compared as well: anything else means the layer is showing the previous
  // song's MV and has to be re-matched.
  const signature = trackSignature(track, id);
  const stale = backdrop.matchedFor !== null && backdrop.matchedFor !== signature;
  if (track && (settings.autoSearch || settings.autoPreload)
      && (String(id) !== backdrop.trackId || !hasSource || stale)) {
    if (backdrop.loading) return;
    // A track change drops the previous video before the new match starts, so
    // the old MV cannot keep playing underneath the new song.
    if (stale) dropBackdropVideo();
    backdrop.trackId = String(id);
    backdrop.loading = true;
    try {
      const loaded = await loadBackdropFor(track);
      backdrop.trackId = loaded ? String(id) : null;
      if (loaded) backdrop.matchedFor = signature;
    } finally {
      backdrop.loading = false;
    }
    return;
  }

  if (backdrop.state === 'playing') {
    await alignBackdropToAudio({ force: !settings.followProgress });
  }
  // The button's light follows what is on screen, so it is re-read once per tick
  // as well (a stream can start or die without a status change).
  syncPlayerToggle();
};

/**
 * The supervisor timer. It runs for the whole session and returns immediately
 * while the background is switched off, so the feature does not depend on
 * ECHO's DOM mutating at exactly the right moment.
 */
const startBackdropPolling = () => {
  if (!backdrop.pollTimer) {
    // The 「MV 背景」 page must keep up even while the background is OFF, which is
    // exactly when pollBackdrop() returns early — hence the separate refresh.
    backdrop.pollTimer = setInterval(() => {
      refreshBackgroundPage();
      void pollBackdrop();
    }, BACKDROP_POLL_MS);
  }
  syncBackdropSyncTimer();
};

/** ECHO-main's continuous drift correction only runs in "follow progress" mode. */
const syncBackdropSyncTimer = () => {
  const settings = backgroundConfig();
  const profile = MV_SYNC_PROFILES[settings.syncMode] || MV_SYNC_PROFILES.balanced;
  const interval = settings.enabled && settings.followProgress ? profile.intervalMs : 0;
  if (!interval) {
    if (backdrop.syncTimer) {
      clearInterval(backdrop.syncTimer);
      backdrop.syncTimer = null;
    }
    return;
  }
  if (!backdrop.syncTimer) {
    backdrop.syncTimer = setInterval(() => void alignBackdropToAudio(), interval);
  }
};

const stopBackdropPolling = () => {
  if (backdrop.pollTimer) {
    clearInterval(backdrop.pollTimer);
    backdrop.pollTimer = null;
  }
  if (backdrop.syncTimer) {
    clearInterval(backdrop.syncTimer);
    backdrop.syncTimer = null;
  }
};

const rememberTrack = (track) => {
  const key = trackKey(track);
  backdrop.known.set(String(key), track);
  // The background settings page uses this for its "test the match" action.
  state.lastTrack = track;
  // The ported community MV engine looks tracks up by id, so every track the
  // page plays is registered with it.
  void invokeMain('rememberTrack', {
    id: String(key),
    stableKey: track?.stableKey || String(key),
    title: track?.title,
    artist: track?.artist,
    album: track?.album,
    albumArtist: track?.albumArtist,
    duration: track?.duration,
    coverThumb: track?.coverThumb || track?.coverUrl,
    provider: track?.provider,
    providerTrackId: track?.providerTrackId,
  }).catch(() => {
    /* the MV engine is optional */
  });
  // Keep the recent history bounded.
  if (backdrop.known.size > 200) {
    const oldest = backdrop.known.keys().next().value;
    backdrop.known.delete(oldest);
  }
};

/**
 * Persists background settings.
 *
 * Two write paths exist on purpose: the mod's own keys go through the main
 * process settings, while everything the ported community MV engine owns is
 * written through `mvSetSettings` so ECHO-main's normalisation applies. The
 * merged result is then stored in the loader's config.json through
 * `external.settings.set`, so the values survive a restart.
 */
const persistBackgroundSettings = async (patch, options = {}) => {
  Object.assign(config, patch);

  const enginePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (MV_ENGINE_KEYS.has(key)) enginePatch[key] = value;
  }

  try {
    const merged = await invokeMain('setSettings', patch);
    if (merged && typeof merged === 'object') Object.assign(config, merged);
  } catch {
    /* the local change still applies for this session */
  }

  if (Object.keys(enginePatch).length || engineReady()) {
    try {
      const result = await invokeMain('mvSetSettings', enginePatch);
      if (result?.config && typeof result.config === 'object') Object.assign(config, result.config);
      if (result?.settings) state.mvSettings = result.settings;
    } catch {
      /* the engine may be unavailable */
    }
  }

  try {
    external.settings?.set?.({ ...config });
  } catch {
    /* hosts without the config API keep the in-memory value */
  }
  // Two layers remember the choice: the host's per-package store (so the next
  // start has it) and the host's config.json view (so the config dialog agrees).
  commitInstanceConfig(patch);

  applyBackdropStyle();
  syncBackdropLoop();
  // The ⚙ button is part of the panel's markup, so a change to it rebuilds the
  // panel rather than only its body (its open/closed state is kept).
  if (patch && 'mvShowSettingsButton' in patch) {
    const wasOpen = backdrop.panel?.dataset.open === 'true';
    backdrop.panel?.remove();
    backdrop.panel = null;
    const rebuilt = lyricsPage() ? ensureBackdropPanel() : null;
    if (rebuilt && wasOpen) rebuilt.dataset.open = 'true';
  }
  // The lyrics-page drawer shows the same settings, so it is rebuilt on the next
  // poll tick (not immediately, which would interrupt a slider drag).
  if (backdrop.drawer?.dataset.open === 'true') backdrop.drawerDirty = true;
  if (options.reload) {
    // Matching/source changes must take effect for the current track too.
    backdrop.trackId = null;
    backdrop.matchedFor = null;
    void pollBackdrop();
  }
  if (options.render !== false) renderSoon();
};

// ---------------------------------------------------------------------------
// Remembered user configuration
// ---------------------------------------------------------------------------
//
// The package's config.json is the *default* file: it ships with the archive,
// so a value the user picks while playing can never be written back into it.
// Everything the user changes here (picture preset, fitting, zoom, sync, the
// lyrics-page panel positions) is therefore kept per user and merged over the
// defaults on every start, which is what makes one choice — "默认（左右贴合）",
// say — apply to every MV of every song and survive a restart.
//
// Two layers hold the same object on purpose:
//   1. the host's per-package store (`echoExternalMod.settings`, localStorage
//      backed) — the normal path;
//   2. the host's config.json (`echoExternalMod.config`) — kept in step so the
//      config dialog and the sidebar read the same values;
// plus a direct localStorage write as a last-resort fallback for hosts whose
// per-package store is missing.

const STORED_CONFIG_KEY = 'echo.mms.user-config.v2';
// A guard against unbounded growth: values are primitives, so this is plenty.
const STORED_CONFIG_MAX_BYTES = 200_000;

const readJsonRecord = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const safeLocalStorage = () => {
  try {
    return window?.localStorage || null;
  } catch {
    // A locked-down store throws on access rather than returning null.
    return null;
  }
};

const readStoredConfig = () => {
  try {
    const fromHost = external.settings?.get?.();
    if (fromHost && typeof fromHost === 'object') return fromHost;
  } catch {
    /* fall through to the direct store */
  }
  const store = safeLocalStorage();
  if (!store) return {};
  try {
    return readJsonRecord(store.getItem(STORED_CONFIG_KEY));
  } catch {
    return {};
  }
};

/**
 * Merges the remembered values over the package defaults, once per start.
 *
 * Runs again when the host's store resolves late (a host that returns a promise)
 * — but only until the user has changed something, so a slow read can never
 * overwrite a fresh choice.
 */
let instanceConfigDirty = false;
const loadInstanceConfig = (stored) => {
  if (!stored || typeof stored !== 'object' || instanceConfigDirty) return false;
  const overlay = {};
  for (const [key, value] of Object.entries(stored)) {
    if (value === undefined) continue;
    if (config[key] === value) continue;
    overlay[key] = value;
    config[key] = value;
  }
  applyBackdropStyle();
  if (Object.keys(overlay).length) {
    // The lyrics-page panel and the drawer mirror the configuration, so they are
    // rebuilt when a remembered value arrives.
    if (backdrop.drawer?.dataset.open === 'true') backdrop.drawerDirty = true;
    renderBackdropPanelBody(true);
    refreshBackgroundPage({ force: true });
    return true;
  }
  return false;
};

const resolveStoredConfigRead = () => {
  let value = null;
  try {
    value = external.settings?.get?.();
  } catch {
    value = null;
  }
  if (value && typeof value === 'object') {
    loadInstanceConfig(value);
    return;
  }
  if (value && typeof value.then === 'function') {
    void value.then((resolved) => {
      if (resolved && typeof resolved === 'object') loadInstanceConfig(resolved);
    }).catch(() => {});
    return;
  }
  loadInstanceConfig(readStoredConfig());
};

/**
 * Writes a patch to every layer that remembers it.
 *
 * Called for every user-visible setting change, so it stays deliberately small:
 * one object merge, one host call, one localStorage fallback.
 */
const commitInstanceConfig = (patch) => {
  if (patch && typeof patch === 'object') {
    Object.assign(config, patch);
    instanceConfigDirty = true;
  }
  try {
    external.settings?.set?.({ ...config });
  } catch {
    /* the config object above still reflects the change */
  }
  const store = safeLocalStorage();
  if (!store) return;
  try {
    const payload = JSON.stringify({ ...config });
    if (payload.length <= STORED_CONFIG_MAX_BYTES) store.setItem(STORED_CONFIG_KEY, payload);
  } catch {
    /* a full or disabled store must not break the page */
  }
};

/**
 * Pushes the remembered configuration into main.cjs once at start.
 *
 * The main process keeps its own settings object for the parts only it needs
 * (the MV request pipeline), and it starts from config.json, so without this a
 * restart would resolve the first video with the shipped defaults instead of the
 * values the user chose.
 */
const syncStoredConfigToMain = async () => {
  const patch = { ...config };
  if (!Object.keys(patch).length) return;
  try {
    await invokeMain('setSettings', patch);
  } catch {
    /* the page still uses the local values */
  }
};

// ---------------------------------------------------------------------------
// Player-bar toggle
// ---------------------------------------------------------------------------

// Mirrors ECHO's transport button markup so the control matches the player bar.
// The class list is the app's own lyrics-button list (`icon-button
// transport-media-button`), which also keeps the button out of the
// `max-width:1180px` rule that hides `transport-tool-button`.
const PLAYER_TOGGLE_CLASS = 'mms-backdrop-toggle';
const BACKDROP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>';

const transportBar = () => document.querySelector('.player-bar .player-transport-shell > .transport')
  || document.querySelector('.player-bar .player-transport-shell .transport')
  || document.querySelector('.player-transport-shell .transport')
  || document.querySelector('.transport');

/**
 * Sends the user to ECHO's song detail page — the lyrics route, the only place
 * the MV background is rendered. The app navigates between renderer routes with
 * window CustomEvents (there is no navigation bridge), and re-dispatching the
 * event while already on that route would toggle straight back out, so being
 * there is a no-op. `lyrics` is not one of ECHO's kept-alive routes, so the page
 * being in the DOM means it is the route on screen.
 */
const enterSongDetailPage = () => {
  if (lyricsPage()) return false;
  try {
    window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'lyrics' } }));
    return true;
  } catch {
    /* hosts without the route event stay on the current page */
    return false;
  }
};

/**
 * Whether an MV is on screen right now: the layer is attached to the song detail
 * page, it owns a stream and its <video> is really there.
 *
 * This is the button's lit condition (and what "there is an MV to watch" means
 * everywhere else). A match that is still resolving, a track with no match, or a
 * page the user has left are all "no MV", so the button stays dim.
 */
const backdropOnScreen = () => {
  const node = backdrop.node;
  const page = lyricsPage();
  // `isConnected` alone is not enough: ECHO keeps the detached lyrics page (and
  // our layer inside it) in memory when the route changes, so the page itself has
  // to be part of the document before its MV counts as on screen.
  if (!node?.isConnected || !page || !document.body.contains(page)) return false;
  const video = backdrop.video;
  if (!video?.isConnected) return false;
  if (node.dataset.source !== 'ready' && !video.src) return false;
  return true;
};

/**
 * Runs the match again for the track that is playing now and re-aligns the video
 * with it.
 *
 * This is the automatic correction the panel and the transport button trigger:
 * the previous video is dropped first (a live cross-fade, not a fresh layer),
 * the match is re-resolved for the current track and the result is seeked onto
 * the audio position — so a video left over from the previous song can never keep
 * playing under the new one.
 */
const rematchCurrentTrack = async (reason = '') => {
  if (!backdropEnabled()) return false;
  if (!lyricsPage()) return false;
  ensureBackdrop();
  const token = ++backdrop.lookupToken;
  // Drop the stale video, but keep the layer: this avoids a visible rebuild.
  backdrop.trackId = null;
  backdrop.matchedFor = null;
  backdrop.ready = false;
  backdrop.source = null;
  backdrop.retry = null;
  backdrop.escalate = null;
  backdrop.candidate = null;
  backdrop.lastError = null;
  backdrop.stalls = 0;
  if (backdrop.video) {
    try {
      backdrop.video.pause();
      backdrop.video.removeAttribute('src');
      backdrop.video.load();
    } catch {
      /* ignore */
    }
  }
  if (backdrop.node) {
    backdrop.node.dataset.source = 'none';
    backdrop.node.dataset.playing = 'false';
  }
  backdrop.lookupToken = token;
  const player = playerApi();
  if (!player?.status) return false;
  const status = await player.status().catch(() => null);
  if (token !== backdrop.lookupToken) return false;
  const id = status?.currentTrackId ?? status?.trackId ?? null;
  const track = id ? currentTrackFromStatus(status) : null;
  if (!track) return false;
  const loaded = await loadBackdropFor(track);
  if (token !== backdrop.lookupToken) return false;
  backdrop.trackId = loaded ? String(id) : null;
  if (loaded) {
    // The audio has moved on while the video was being resolved; line them up.
    await alignBackdropToAudio({ force: true });
    reportNotice(copy.backdropRematched(reason));
  }
  renderBackdropPanelBody(true);
  syncPlayerToggle();
  return loaded;
};

/**
 * The transport switch.
 *
 * Lit (accent colour + the transport's own dot, and lit only) while the song
 * detail page is showing an MV that is really on screen. Anywhere else — another
 * page, a match still resolving, a track without a match — it stays dim.
 *
 * A press follows the light: while lit it switches the MV background off, while
 * dim it brings the MV up. On the song detail page that means a re-match plus a
 * seek (no navigation, which would throw the user off the page); anywhere else it
 * switches the background on, walks to the page and matches right away.
 */
const syncPlayerToggle = () => {
  const bar = transportBar();
  if (!bar) return;
  const onScreen = backdropOnScreen();
  const enabled = backdropEnabled();
  const title = onScreen
    ? `${copy.backdrop} · ${copy.backdropVisible}`
    : `${copy.backdrop} · ${enabled ? copy.backdropOn : copy.backdropOff}${lyricsPage() && enabled ? copy.backdropPressToReload : ''}`;
  const existing = bar.querySelector(`.${PLAYER_TOGGLE_CLASS}`);
  if (existing) {
    existing.dataset.active = String(onScreen);
    existing.classList.toggle('is-soft-active', onScreen);
    existing.setAttribute('aria-pressed', String(onScreen));
    existing.title = title;
    existing.setAttribute('aria-label', title);
    return;
  }

  const toggle = h('button', `icon-button transport-media-button ${PLAYER_TOGGLE_CLASS}`);
  toggle.type = 'button';
  toggle.dataset.workshopIcon = 'transport-mms-background';
  toggle.dataset.active = String(onScreen);
  toggle.classList.toggle('is-soft-active', onScreen);
  toggle.title = title;
  toggle.setAttribute('aria-label', title);
  toggle.setAttribute('aria-pressed', String(onScreen));
  toggle.innerHTML = BACKDROP_ICON;
  toggle.addEventListener('click', () => {
    if (backdropOnScreen()) {
      // Lit → the MV is on screen, so this press takes it away.
      void setBackdropEnabled(false);
      return;
    }
    if (lyricsPage()) {
      // Dim on the detail page → re-match the current track and seek it.
      if (!backdropEnabled()) void setBackdropEnabled(true);
      void rematchCurrentTrack('button');
      return;
    }
    // Dim elsewhere → bring the MV up and go where it is visible.
    if (!backdropEnabled()) void setBackdropEnabled(true);
    enterSongDetailPage();
    void pollBackdrop();
  });
  // ECHO renders the lyrics button last; the toggle sits next to it.
  const lyricsButton = bar.querySelector('.transport-lyrics-button');
  if (lyricsButton?.parentNode === bar) lyricsButton.parentNode.insertBefore(toggle, lyricsButton);
  else bar.append(toggle);
};

/** Persists the background switch and applies it immediately. */
const setBackdropEnabled = async (next) => {
  const enabled = next === true;
  config.mvEnabled = enabled;
  // Keep the legacy key in step so an older config file stays meaningful.
  config.songBackgroundEnabled = enabled;
  try {
    await invokeMain('setSettings', { mvEnabled: enabled, songBackgroundEnabled: enabled });
  } catch {
    /* the local toggle still applies for this session */
  }
  applyBackdropMode();
  syncPlayerToggle();
  renderSoon();
};

/** Switches the current platform; a running search is re-run for the new one. */
const selectProvider = (name) => {
  state.provider = name;
  if (state.query.trim()) {
    void runSearch();
  } else {
    renderSoon();
  }
};

const renderProviderStrip = () => {
  const strip = h('div', 'mms-providers');
  const platforms = visiblePlatforms();
  if (!platforms.length) {
    strip.append(h('p', 'mms-muted', copy.noProviders));
    return strip;
  }
  for (const name of platforms) {
    const status = providerState(name);
    const chip = button('mms-chip', null, () => selectProvider(name), { disabled: status.kind === 'missing' });
    chip.dataset.state = status.kind;
    chip.classList.toggle('is-active', name === state.provider);
    const dot = h('span', 'mms-dot');
    const label = h('span', 'mms-chip-label', currentProviderLabel(name));
    const meta = h('span', 'mms-chip-state', status.text);
    chip.append(dot, label, meta);
    strip.append(chip);
  }
  return strip;
};

/**
 * The platform picker of the 歌单 page.
 *
 * `compact` drops the per-platform login state: the 歌单 page must not carry
 * account UI (the one place it may is the single 「去登录」 hint), so it shows
 * platform names only. A narrow window swaps the chip row for a dropdown — the
 * same media query ECHO itself uses for its transport buttons.
 */
const renderProviderPicker = ({ compact = false } = {}) => {
  const wrap = h('div', 'mms-provider-picker');
  const platforms = visiblePlatforms();
  if (!platforms.length) {
    wrap.append(h('p', 'mms-muted', copy.noProviders));
    return wrap;
  }

  const strip = h('div', 'mms-providers');
  for (const name of platforms) {
    const status = providerState(name);
    const chip = button('mms-chip', null, () => selectProvider(name), { disabled: status.kind === 'missing' });
    chip.dataset.state = status.kind;
    chip.classList.toggle('is-active', name === state.provider);
    chip.append(h('span', 'mms-chip-label', currentProviderLabel(name)));
    if (!compact) {
      chip.prepend(h('span', 'mms-dot'));
      chip.append(h('span', 'mms-chip-state', status.text));
    }
    strip.append(chip);
  }

  const select = h('select', 'mms-select mms-providers-select');
  select.setAttribute('aria-label', copy.providersLabel);
  for (const name of platforms) {
    const option = h('option', null, currentProviderLabel(name));
    option.value = name;
    if (name === state.provider) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => selectProvider(select.value));
  wrap.append(strip, select);
  return wrap;
};

const renderToolbar = () => {
  const row = h('div', 'mms-toolbar');

  const form = h('form', 'mms-search');
  const input = h('input', 'mms-search-input');
  input.type = 'search';
  input.placeholder = copy.searchPlaceholder;
  input.value = state.query;
  input.setAttribute('aria-label', copy.search);
  input.addEventListener('input', () => {
    state.query = input.value;
  });
  form.append(input);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.query = input.value;
    void runSearch();
  });

  const tabs = h('div', 'mms-tabs');
  for (const type of MEDIA_TYPES) {
    const tab = button('mms-tab', copy[type.labelKey], () => {
      state.mediaType = type.value;
      if (state.query.trim()) {
        void runSearch({ mediaType: type.value });
      } else {
        renderSoon();
      }
    });
    tab.classList.toggle('is-active', type.value === state.mediaType);
    tabs.append(tab);
  }

  const tools = h('div', 'mms-tools');
  const qualitySelect = h('select', 'mms-select mms-quality-select');
  for (const quality of QUALITIES) {
    const option = h('option', null, `${copy.quality}: ${quality.label}`);
    option.value = quality.value;
    qualitySelect.append(option);
  }
  qualitySelect.value = state.quality;
  qualitySelect.addEventListener('change', () => {
    state.quality = qualitySelect.value;
    renderSoon();
  });

  // The MV switch is not here any more: the player-bar MV button and the
  // 「MV 背景」 page own it. Refresh stays as an icon button so a narrow window
  // keeps the toolbar on one row.
  const refreshButton = button('mms-tool-icon', '↻', () => {
    void (async () => {
      await loadProviders();
      await loadAccounts();
      if (state.query.trim()) await runSearch();
      renderSoon();
    })();
  }, { title: copy.refresh });
  refreshButton.setAttribute('aria-label', copy.refresh);

  tools.append(refreshButton, qualitySelect);

  row.append(form, tabs, tools);
  return row;
};

const renderTrackRow = (track, index) => {
  const row = h('div', 'mms-row');
  row.dataset.unavailable = track.playable === false ? 'true' : 'false';

  const number = h('span', 'mms-row-index', String(index + 1));
  const art = cover(track.coverThumb || track.coverUrl, 'mms-row-cover');

  const main = h('div', 'mms-row-main');
  const titleLine = h('div', 'mms-row-title');
  titleLine.append(h('strong', null, track.title || '—'));
  if (config.showProviderBadges !== false) {
    titleLine.append(h('span', 'mms-badge', currentProviderLabel(track.provider)));
  }
  main.append(titleLine, h('small', null, `${track.artist || '—'}${track.album ? ` · ${track.album}` : ''}`));

  const quality = h('span', 'mms-row-quality', (track.qualities || []).join(' / ') || '—');
  const duration = h('span', 'mms-row-duration', formatDuration(track.duration));

  const actions = h('div', 'mms-row-actions');
  actions.append(
    button('mms-icon', '▶', () => {
      void playTrack(track).catch(reportError);
    }, { title: copy.play }),
    button('mms-icon', '+', () => {
      reportNotice(queueTrack(track) ? `${copy.queue}: ${track.title}` : copy.bridgeDown);
    }, { title: copy.queue }),
  );

  // Right-click offers the platform-specific actions a row has no room for.
  const webUrl = trackWebUrl(track);
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openTrackMenu(event, track, webUrl);
  });
  row.addEventListener('dblclick', () => {
    void playTrack(track).catch(reportError);
  });

  row.append(number, art, main, quality, duration, actions);
  if (track.playable === false) {
    row.append(h('span', 'mms-row-warning', track.unavailableReason || copy.unavailable));
  }
  return row;
};

// ---------------------------------------------------------------------------
// Track context menu
// ---------------------------------------------------------------------------

let openMenu = null;

const closeOnEscape = (event) => {
  if (event.key === 'Escape') closeTrackMenu();
};

function closeTrackMenu() {
  if (!openMenu) return;
  openMenu.remove();
  openMenu = null;
  document.removeEventListener('click', closeTrackMenu);
  document.removeEventListener('keydown', closeOnEscape);
}

const openTrackMenu = (event, track, webUrl) => {
  closeTrackMenu();

  const menu = h('div', 'mms-menu');
  const add = (label, handler, disabled = false) => {
    const item = h('button', 'mms-menu-item', label);
    item.type = 'button';
    item.disabled = disabled;
    item.addEventListener('click', () => {
      closeTrackMenu();
      handler();
    });
    menu.append(item);
  };

  add(copy.play, () => void playTrack(track).catch(reportError));
  add(copy.queue, () => reportNotice(queueTrack(track) ? `${copy.queue}: ${track.title}` : copy.bridgeDown));
  if (webUrl) {
    add(copy.copyLink, () => {
      void copyText(webUrl).then((done) => reportNotice(done ? webUrl : copy.bridgeDown));
    });
    add(copy.openInBrowser, () => {
      if (typeof window !== 'undefined' && typeof window.open === 'function') window.open(webUrl, '_blank');
      else window?.echo?.app?.openExternal?.(webUrl);
    });
  }

  // Keep the menu inside the viewport.
  const left = Math.min(Number(event.clientX) || 0, Math.max(0, (window?.innerWidth || 1200) - 220));
  const top = Math.min(Number(event.clientY) || 0, Math.max(0, (window?.innerHeight || 800) - 180));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  document.body.append(menu);
  openMenu = menu;

  // Defer so the click that opened the menu does not immediately close it.
  setTimeout(() => {
    document.addEventListener('click', closeTrackMenu);
    document.addEventListener('keydown', closeOnEscape);
  }, 0);
};

const copyText = async (text) => {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand?.('copy') === true;
    area.remove();
    return ok;
  } catch {
    return false;
  }
};

const renderCardGrid = (items, kind) => {
  const grid = h('div', 'mms-grid');
  for (const item of items) {
    const card = h('article', 'mms-card');
    card.tabIndex = 0;
    const open = () => void openDetail(kind, kind === 'album'
      ? (item.providerAlbumId || item.id)
      : (item.providerArtistId || item.id));
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    card.append(
      cover(kind === 'artist' ? (item.avatarUrl || item.coverUrl) : (item.coverThumb || item.coverUrl), 'mms-card-cover'),
    );
    const main = h('div', 'mms-card-main');
    main.append(
      h('strong', null, item.title || item.name || '—'),
      h('small', null, item.artist || item.creator || item.provider || ''),
      h('span', 'mms-muted', formatCount(item.trackCount ?? item.albumCount ?? 0)),
    );
    card.append(main);
    grid.append(card);
  }
  return grid;
};

const renderSearchResults = () => {
  const wrap = h('div', 'mms-results');
  if (state.searching) {
    wrap.append(h('p', 'mms-muted', copy.searching));
    return wrap;
  }
  if (!state.query.trim()) {
    wrap.append(h('p', 'mms-muted', copy.searchHint));
    return wrap;
  }

  const { tracks, albums, artists, playlists } = state.results;
  const available = config.hideUnavailable === true ? tracks.filter((track) => track.playable !== false) : tracks;
  const shown = available.slice(0, MAX_RENDERED_TRACKS);

  if (state.mediaType === 'album') {
    if (!albums.length) {
      wrap.append(h('p', 'mms-muted', copy.empty));
      return wrap;
    }
    wrap.append(renderCardGrid(albums, 'album'));
    return wrap;
  }
  if (state.mediaType === 'artist') {
    if (!artists.length) {
      wrap.append(h('p', 'mms-muted', copy.empty));
      return wrap;
    }
    wrap.append(renderCardGrid(artists, 'artist'));
    return wrap;
  }
  if (state.mediaType === 'playlist') {
    if (!playlists.length) {
      wrap.append(h('p', 'mms-muted', copy.empty));
      return wrap;
    }
    const list = h('div', 'mms-rows');
    for (const playlist of playlists) {
      const row = h('div', 'mms-row');
      row.append(
        h('span', 'mms-row-index', '♬'),
        cover(playlist.coverThumb || playlist.coverUrl, 'mms-row-cover'),
      );
      const main = h('div', 'mms-row-main');
      main.append(
        h('div', 'mms-row-title', playlist.title || playlist.name || '—'),
        h('small', null, `${playlist.creator || ''} ${formatCount(playlist.trackCount)}`),
      );
      row.append(main);
      list.append(row);
    }
    wrap.append(list);
    return wrap;
  }

  if (!shown.length) {
    wrap.append(h('p', 'mms-muted', copy.empty));
    return wrap;
  }

  const header = h('div', 'mms-results-head');
  header.append(
    h('span', 'mms-muted', copy.results(state.total || shown.length)),
    button('mms-ghost', copy.playAll, () => void queueTracks(shown, { startPlayback: true }).catch(reportError)),
    button('mms-ghost', copy.queueAll, () => void queueTracks(shown, { startPlayback: false }).catch(reportError)),
  );
  wrap.append(header);

  const rows = h('div', 'mms-rows');
  shown.forEach((track, index) => rows.append(renderTrackRow(track, index)));
  wrap.append(rows);
  if (tracks.length > shown.length) {
    wrap.append(h('p', 'mms-muted', copy.truncated));
  }
  return wrap;
};
const renderDetail = () => {
  const wrap = h('div', 'mms-results');
  const detail = state.detail;
  const back = button('mms-ghost', `← ${copy.back}`, () => {
    // A playlist opened from the 歌单 page goes back there (its list is already in
    // memory, so nothing is re-fetched); anything else returns to the search results.
    state.view = state.detailFrom === 'playlists' ? 'playlists' : 'search';
    state.detail = null;
    state.detailFrom = null;
    renderSoon();
  });
  const head = h('div', 'mms-results-head');
  head.append(back);
  // An account playlist can be re-read from the platform on demand, and keeping it
  // locally is the user's explicit choice — never a side effect of opening it.
  if (detail?.accountEntry) {
    const key = detail.collectionKey
      || collectionKeyOf(detail.accountEntry.provider || state.provider, detail.accountEntry);
    const stored = state.playlistStore?.collections?.[key];
    head.append(button('mms-ghost', copy.playlistsReimport, () => void refreshAccountCollection()));
    head.append(button(stored ? 'mms-ghost' : 'mms-primary', stored ? copy.playlistsUnsave : copy.playlistsSave,
      (event) => void toggleStoredPlaylist(detail.accountEntry, event)));
  }
  wrap.append(head);

  if (state.detailLoading) {
    wrap.append(h('p', 'mms-muted', copy.loading || copy.searching));
    return wrap;
  }
  if (!detail) {
    wrap.append(h('p', 'mms-muted', copy.empty));
    return wrap;
  }

  const hero = h('div', 'mms-hero');
  hero.append(cover(detail.coverThumb || detail.coverUrl || detail.avatarUrl, 'mms-hero-cover'));
  const heroMain = h('div', 'mms-hero-main');
  heroMain.append(
    h('span', 'mms-muted', detail.kind === 'album' ? copy.albums : detail.kind === 'artist' ? copy.artists : copy.playlists),
    h('h3', 'mms-hero-title', detail.name || detail.title || '—'),
    h('span', 'mms-muted', [detail.artist, detail.creator, formatCount(detail.trackCount ?? (detail.tracks || []).length)].filter(Boolean).join(' · ')),
  );
  if (detail.accountEntry) {
    // Says where the list came from (and whether it is kept on this machine), so
    // "no fetch happened" is visible instead of something to guess at.
    const savedAt = formatStoreTime(detail.savedAt);
    heroMain.append(h('span', 'mms-muted', detail.cached
      ? [copy.playlistsFromLocal, savedAt, copy.playlistsSavedHint].filter(Boolean).join(' · ')
      : [copy.playlistsNotSaved, copy.playlistsSaveHint].filter(Boolean).join(' · ')));
  }
  const heroActions = h('div', 'mms-hero-actions');
  heroActions.append(button('mms-primary', copy.playAll, () => void queueTracks(detail.tracks || [], { startPlayback: true }).catch(reportError)));
  heroMain.append(heroActions);
  hero.append(heroMain);
  wrap.append(hero);

  const tracks = detail.tracks || [];
  if (!tracks.length) {
    wrap.append(h('p', 'mms-muted', copy.noTracks));
    return wrap;
  }
  const rows = h('div', 'mms-rows');
  tracks.slice(0, MAX_RENDERED_TRACKS).forEach((track, index) => rows.append(renderTrackRow(track, index)));
  wrap.append(rows);
  return wrap;
};

/**
 * Account card: shows the signed-in identity (avatar, nickname, uid, VIP, last
 * check and any error) and offers the sign-in routes the platform supports.
 */
const renderAccounts = () => {
  const wrap = h('div', 'mms-accounts');
  wrap.append(h('p', 'mms-muted', copy.accountHint));

  const head = h('div', 'mms-results-head');
  head.append(button('mms-ghost', copy.checkAll, () => void checkAccounts(null)));
  wrap.append(head);

  for (const name of visiblePlatforms()) {
    const status = accountStatus(name);
    const provider = providerInfo(name);
    const card = h('div', 'mms-account');
    if (status?.connected) card.dataset.connected = 'true';

    const identity = h('div', 'mms-identity');
    if (status?.connected) {
      const avatar = h('img', 'mms-avatar');
      avatar.src = status.avatarUrl || DEFAULT_COVER;
      avatar.alt = '';
      avatar.loading = 'lazy';
      avatar.addEventListener('error', () => {
        if (avatar.src !== DEFAULT_COVER) avatar.src = DEFAULT_COVER;
      });
      identity.append(avatar);
    }

    const main = h('div', 'mms-account-main');
    const nameLine = h('div', 'mms-account-name');
    nameLine.append(h('strong', null, status?.connected
      ? (status.displayName || status.username || currentProviderLabel(name))
      : currentProviderLabel(name)));
    if (status?.connected && status.vipLabel) {
      nameLine.append(h('span', 'mms-badge', status.vipLabel));
    }
    main.append(nameLine);
    main.append(h('small', 'mms-muted', status?.connected
      ? copy.loggedIn(status.displayName || status.username || '')
      : copy.notLoggedIn));
    if (status?.connected && status.username && status.username !== status.displayName) {
      main.append(h('small', 'mms-muted', copy.accountUid(status.username)));
    }
    if (status?.connected && status.lastCheckedAt) {
      main.append(h('small', 'mms-muted', copy.accountChecked(new Date(status.lastCheckedAt).toLocaleString())));
    }
    if (status?.error) {
      main.append(h('small', 'mms-account-error', copy.accountError(status.error)));
    }
    if (provider?.requiresAccount && !status?.connected) {
      main.append(h('small', 'mms-muted', copy.needsAccount));
    }
    identity.append(main);
    card.append(identity);

    const actions = h('div', 'mms-account-actions');
    if (status?.connected) {
      actions.append(
        button('mms-ghost', copy.check, () => void checkAccounts(name)),
        button('mms-ghost', copy.logout, () => void clearAccount(name)),
      );
    } else {
      if (supportsQrImage(name)) {
        actions.append(button('mms-primary', copy.qrLogin, () => void startQrLogin(name)));
      } else if (supportsLoginWindow(name)) {
        actions.append(button('mms-primary', copy.qrWindowLogin, () => void startQrLogin(name)));
      }
      actions.append(button('mms-ghost', copy.login, () => {
        state.accountDraft = { provider: name, cookie: '' };
        state.qr = null;
        renderSoon();
      }));
    }
    card.append(actions);

    if (state.accountDraft.provider === name) {
      const editor = h('div', 'mms-account-editor');
      const input = h('input', 'mms-search-input');
      input.type = 'password';
      input.placeholder = copy.cookiePlaceholder;
      input.value = state.accountDraft.cookie;
      input.addEventListener('input', () => {
        state.accountDraft.cookie = input.value;
      });
      editor.append(
        input,
        button('mms-primary', copy.saveCookie, () => void saveAccountCookie(name, state.accountDraft.cookie)),
        button('mms-ghost', copy.back, () => {
          state.accountDraft = { provider: null, cookie: '' };
          renderSoon();
        }),
      );
      card.append(editor);
    }

    if (state.qr?.provider === name) {
      card.append(renderQrPanel(name));
    }
    wrap.append(card);
  }
  return wrap;
};

/** QR panel: the platform's code (or its login window) and the poll status. */
const renderQrPanel = (provider) => {
  const qr = state.qr;
  const panel = h('div', 'mms-qr');
  panel.dataset.mode = qr.mode;

  if (qr.mode === 'image' && qr.image) {
    const image = h('img', 'mms-qr-image');
    image.alt = copy.qrLogin;
    image.src = qr.image;
    panel.append(image);
  } else {
    panel.append(h('div', 'mms-qr-placeholder', '▣'));
  }

  const side = h('div', 'mms-qr-side');
  const label = {
    waiting: qr.mode === 'image' ? copy.qrWaiting : copy.qrWindowLogin,
    scanned: copy.qrScanned,
    expired: copy.qrExpired,
    failed: copy.qrFailed,
    confirmed: copy.qrSuccess,
  }[qr.state] || copy.qrWaiting;
  side.append(
    h('strong', null, label),
    h('small', 'mms-muted', qr.message || ''),
    h('small', 'mms-muted', qr.mode === 'window' ? copy.qrWindowHint : qr.hint || ''),
  );

  const controls = h('div', 'mms-account-actions');
  controls.append(
    button('mms-ghost', copy.qrRefresh, () => void startQrLogin(provider)),
    button('mms-ghost', copy.back, () => {
      state.qr = null;
      renderSoon();
    }),
  );
  side.append(controls);
  panel.append(side);
  return panel;
};

const renderBanner = () => {
  const parts = [];
  if (state.error) parts.push(['error', state.error]);
  if (state.notice) parts.push(['notice', state.notice]);
  if (state.busy) parts.push(['busy', state.busy]);
  if (!parts.length) return null;
  const banner = h('div', 'mms-banner');
  for (const [kind, text] of parts) {
    const line = h('span', `mms-banner-${kind}`, text);
    line.addEventListener('click', () => {
      if (kind === 'error') state.error = null;
      if (kind === 'notice') state.notice = null;
      renderSoon();
    });
    banner.append(line);
  }
  return banner;
};

// ---------------------------------------------------------------------------
// Community MV engine (ECHO-main's MvService, running in the main process)
// ---------------------------------------------------------------------------
// The matching, scoring, quality ladder and per-track offset below are the
// community implementation; the mod only drives them and hands the resulting
// `mediaUrl` (an `echo-mv://` stream) to the background layer, exactly like
// ECHO-main's MvPanel does.

/** mv* keys the community engine owns; everything else is mod-level. */
const MV_ENGINE_KEYS = new Set([
  'mvEnabled', 'mvEnabledProviders', 'mvProviderOrder', 'mvAutoSearch', 'mvAutoPreload',
  'mvAutoApplyThreshold', 'mvTitleOnlySearch', 'mvPreferHighestViewCount',
  'mvImmersiveBackground', 'mvImmersiveBackgroundAutoScale', 'mvImmersiveBackgroundScalePercent',
  'mvImmersiveBackgroundOffsetXPercent', 'mvImmersiveBackgroundOffsetYPercent',
  'mvImmersiveBackgroundBlurPx', 'mvImmersiveBackgroundBrightnessPercent',
  'mvImmersiveBackgroundOverlayOpacityPercent', 'mvLyricsReadabilityEnhanced', 'mvHideLyrics',
  'mvRestartAudioOnLoad', 'mvSyncMode', 'mvReplayAudioOnChange', 'mvMaxQuality', 'mvAllow60fps',
]);

const engineReady = () => state.mvEngine?.ready === true;

/** Reads the engine state and pushes the mod config into it. */
const loadMvEngine = async () => {
  // Re-entrancy guard: rebuilding the drawer below renders the same panel, whose
  // tail calls this again when the engine is unavailable.
  if (state.mvEngineLoading) return;
  state.mvEngineLoading = true;
  state.busy = null;
  try {
    const status = await invokeMain('mvEngineStatus');
    state.mvEngine = status && typeof status === 'object' ? status : null;
    if (engineReady()) {
      state.mvSettings = state.mvEngine.settings || null;
      const patch = {};
      for (const key of MV_ENGINE_KEYS) {
        if (config[key] !== undefined) patch[key] = config[key];
      }
      if (Object.keys(patch).length) {
        try {
          const result = await invokeMain('mvSetSettings', patch);
          if (result?.settings) state.mvSettings = result.settings;
        } catch {
          /* the engine keeps its own defaults */
        }
      }
    }
  } catch {
    state.mvEngine = null;
  } finally {
    state.mvEngineLoading = false;
  }
  renderSoon();
  // The lyrics-page drawer shows the same panel: without this it kept rendering
  // the state from before the engine answered — after a restart it showed "未登录"
  // for a signed-in Bilibili account and its 刷新状态 button looked like it did
  // nothing, because only the sidebar page was re-rendered.
  if (backdrop.drawer?.dataset.open === 'true') renderBackdropDrawerBody();
  // …and the sidebar's 「MV 背景」 page renders the same panel, so it is refreshed
  // in place as well (the poll tick only catches this a couple of seconds later).
  refreshBackgroundPage({ force: true });
};

/** The snapshot request ECHO-main's renderer builds for streaming tracks. */
const trackSnapshotRequest = () => {
  const track = state.lastTrack;
  if (!track) return null;
  return {
    trackId: String(trackKey(track)),
    title: track.title || 'Untitled',
    artist: track.artist || 'Unknown Artist',
    album: track.album ?? null,
    durationSeconds: Number(track.duration) || null,
    coverThumb: track.coverThumb || track.coverUrl || null,
    mediaType: 'streaming',
    query: backdropQueryFor(track),
  };
};

const engineSearchCandidates = async () => {
  const request = trackSnapshotRequest();
  if (!request) {
    reportNotice(copy.testMatchNeedTrack);
    return;
  }
  state.busy = copy.engineSearching;
  renderSoon();
  try {
    const candidates = await invokeMain('mvSearchNetworkCandidatesForSnapshot', request);
    state.mvCandidates = { request, candidates: Array.isArray(candidates) ? candidates : [] };
    state.mvSelected = null;
    state.mvVariants = null;
    if (!state.mvCandidates.candidates.length) reportNotice(copy.testNoMatch);
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
  }
};

/** Plays a video the community service already resolved, with the fallbacks. */
const playEngineVideo = async (video, candidate) => {
  const best = {
    id: bvidOf(candidate?.id) || bvidOf(video?.providerUrl) || bvidOf(video?.url),
    title: video?.title || candidate?.title || '',
    uploader: candidate?.uploader ?? video?.artist ?? null,
    url: video?.providerUrl || candidate?.url || null,
  };
  const track = state.lastTrack || {};
  const token = ++backdrop.lookupToken;
  backdrop.retry = null;
  backdrop.escalate = null;
  backdrop.lastError = null;
  const plan = backdropPlanFor(track, best, video);
  const settings = backgroundConfig();
  const steps = settings.sourceMode === 'progressive'
    ? [plan.progressiveStep]
    : [plan.engineStep, plan.proxyStep, plan.progressiveStep];
  return runBackdropSteps(steps, track, token);
};

/** Plays a candidate of the merged list — kept for the panel/panel tests. */
const engineApplyCandidate = async (candidate) => {
  const url = candidateUrlOf(candidate);
  if (!url) {
    reportNotice(copy.testNoMatch);
    return;
  }
  await applyVideoForTrack(url, candidate?.title || '');
};

const engineSetQuality = async (qualityId) => {
  if (!state.mvSelected?.id) return;
  try {
    const updated = await invokeMain('mvSetQuality', { videoId: state.mvSelected.id, qualityId });
    const variants = state.mvVariants?.variants || [];
    const chosen = variants.find((item) => item.id === qualityId);
    reportNotice(`${copy.engineQuality}：${chosen?.label || updated?.qualityLabel || qualityId}`);
    applyEngineVideo({ ...state.mvSelected, ...updated }, { id: updated?.sourceId, title: updated?.title });
    if (updated?.mediaUrl && chosen) {
      await playEngineVideo(updated, { id: updated.sourceId, title: updated.title, url: updated.providerUrl });
    }
  } catch (error) {
    reportError(error);
  }
  renderSoon();
};

/** Per-track MV offset (ECHO-main allows ±10 minutes, in 100 ms steps). */
const engineSetOffset = async (offsetMs) => {
  const request = trackSnapshotRequest();
  if (!request) {
    reportNotice(copy.testMatchNeedTrack);
    return;
  }
  const value = Math.round(clampNumber(offsetMs, -600000, 600000, 0));
  try {
    const updated = await invokeMain('mvSetOffset', { trackId: request.trackId, offsetMs: value });
    state.mvOffset = Number(updated?.offsetMs) ?? value;
  } catch (error) {
    reportError(error);
  }
  // The alignment math reads `backdrop.offsetMs`, not `state.mvOffset`: without
  // this the notice changed and the stored value changed, but the running video
  // never moved — the offset buttons looked like they did nothing.
  backdrop.offsetMs = Number(state.mvOffset) || 0;
  if (backdrop.video?.src) void alignBackdropToAudio({ force: true });
  // Show it straight away in the lyrics-page panel and in the open drawer.
  renderBackdropPanelBody(true);
  if (backdrop.drawer?.dataset.open === 'true') renderBackdropDrawerBody();
  renderSoon();
};

const engineBindLocalFile = async () => {
  const request = trackSnapshotRequest();
  if (!request) {
    reportNotice(copy.testMatchNeedTrack);
    return;
  }
  try {
    const bound = await invokeMain('mvChooseLocalVideo', { trackId: request.trackId });
    if (!bound) return;
    applyEngineVideo(bound, { id: bound.id, title: bound.title || '' });
    if (bound.filePath) {
      // A local file is served by the same Range-capable loopback proxy.
      const served = await invokeMain('mvServeLocalFile', { filePath: bound.filePath });
      if (served?.url) playBackdropSource(served.url, { title: bound.title || '' }, state.lastTrack || {}, 'local');
    }
    reportNotice(copy.engineBound(bound.title || bound.id));
  } catch (error) {
    reportError(error);
  }
  renderSoon();
};

const engineLoadSelected = async () => {
  const request = trackSnapshotRequest();
  if (!request) return;
  try {
    const selected = await invokeMain('mvGetSelected', { trackId: request.trackId });
    state.mvSelected = selected || null;
    state.mvOffset = selected?.offsetMs ?? 0;
    backdrop.offsetMs = Number(selected?.offsetMs) || 0;
    state.mvVariants = selected?.id
      ? await invokeMain('mvResolveStreams', { videoId: selected.id }).catch(() => null)
      : null;
  } catch {
    state.mvSelected = null;
  }
  renderSoon();
};

const engineClearSelected = async () => {
  const request = trackSnapshotRequest();
  if (!request) return;
  try {
    await invokeMain('mvClearSelected', { trackId: request.trackId });
    state.mvSelected = null;
    state.mvVariants = null;
    state.mvOffset = 0;
    backdrop.offsetMs = 0;
    reportNotice(copy.engineCleared);
  } catch (error) {
    reportError(error);
  }
  renderSoon();
};

const engineOpenExternal = async (videoId) => {
  try {
    await invokeMain('mvOpenExternal', { videoId });
  } catch (error) {
    reportError(error);
  }
};

const copyEngineDiagnostics = async () => {
  const report = {
    generatedAt: new Date().toISOString(),
    engine: state.mvEngine
      ? {
        ready: state.mvEngine.ready,
        error: state.mvEngine.error,
        database: state.mvEngine.database,
        tracks: state.mvEngine.tracks,
        account: state.mvEngine.account || null,
      }
      : null,
    settings: state.mvSettings || null,
    sourceMode: backgroundConfig().sourceMode,
    matchMode: backgroundConfig().matchMode,
    track: trackSnapshotRequest(),
    selected: state.mvSelected,
    variants: (state.mvVariants?.variants || []).map((item) => ({ id: item.id, label: item.label, protocol: item.protocol, playableInApp: item.playableInApp })),
    candidates: (state.mvCandidates?.candidates || []).map((item) => ({ id: item.id, title: item.title, score: item.score, reasons: item.reasons, viewCount: item.viewCount })),
    background: {
      state: backdrop.state,
      source: backdrop.source,
      reason: backdrop.reason,
      message: backdrop.message,
      matched: backdrop.matched,
      offsetMs: backdrop.offsetMs,
      videoDuration: backdrop.videoDuration,
    },
  };
  await copyText(JSON.stringify(report, null, 2));
  reportNotice(copy.engineDiagnosticsCopied);
};

// ---------------------------------------------------------------------------
// Background settings view (the dedicated MV / song-background page)
// ---------------------------------------------------------------------------

const bgRow = (label, control, hint) => {
  const row = h('div', 'mms-bg-row');
  const main = h('div', 'mms-bg-row-main');
  main.append(h('strong', null, label));
  if (hint) main.append(h('small', 'mms-muted', hint));
  row.append(main, control);
  return row;
};

const bgSelect = (key, options, onChanged, options2 = {}) => {
  const select = h('select', 'mms-select');
  // A value the element shows without being the stored one (the width fitting
  // pins the picture by itself, so the fitting dropdown still reads 「铺满」).
  const shown = options2.displayValue !== undefined ? options2.displayValue : config[key];
  for (const [value, label] of options) {
    const option = h('option', null, label);
    option.value = value;
    if (String(shown ?? '') === String(value)) option.selected = true;
    select.append(option);
  }
  if (options2.disabled) select.disabled = true;
  select.addEventListener('change', () => {
    void persistBackgroundSettings({ [key]: select.value }, onChanged ? { reload: true } : {});
  });
  return select;
};

const bgToggle = (key, strict = false) => {
  const wrap = h('label', 'mms-switch');
  const input = h('input');
  input.type = 'checkbox';
  input.checked = strict ? config[key] === true : config[key] !== false;
  input.addEventListener('change', () => void persistBackgroundSettings({ [key]: input.checked }));
  wrap.append(input);
  return wrap;
};

/**
 * A slider with a paired number field.
 *
 * Dragging a range is imprecise for values like "偏移 X 50%" or "候选数量 8", so
 * every slider also accepts a typed value: both controls drive the same
 * `persistBackgroundSettings` write, and either one updates the other.
 */
const bgSlider = (key, min, max, step, suffix, options = {}) => {
  const wrap = h('div', 'mms-bg-slider');
  const input = h('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const raw = Number(config[key]);
  const display = options.transform ? options.transform.to(raw) : clampNumber(raw, min, max, min);
  input.value = String(Number.isFinite(display) ? display : min);

  const out = h('output', null, `${input.value}${suffix}`);
  const number = h('input', 'mms-bg-number');
  number.type = 'number';
  number.min = String(min);
  number.max = String(max);
  number.step = String(step);
  number.value = input.value;
  number.setAttribute('aria-label', key);
  // Focusing (or clicking the spinner of) a number field makes the browser scroll
  // its panel to reveal the element, which slid the settings panel around while
  // adjusting values. Put the scroll offset back where it was.
  const holdScroll = () => {
    const scrollers = [];
    for (let node = wrap.parentNode; node; node = node.parentNode) {
      if (Number.isFinite(Number(node.clientHeight)) && Number(node.clientHeight) > 0
          && Number(node.scrollHeight) > Number(node.clientHeight)) scrollers.push(node);
    }
    if (!scrollers.length) return;
    const positions = scrollers.map((node) => node.scrollTop);
    const restore = () => scrollers.forEach((node, index) => { node.scrollTop = positions[index]; });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
    else setTimeout(restore, 0);
  };
  number.addEventListener('focus', holdScroll);
  number.addEventListener('mousedown', holdScroll);

  const commit = (value) => {
    const stored = options.transform ? options.transform.from(Number(value)) : Number(value);
    void persistBackgroundSettings({ [key]: stored });
  };
  /** Writes a typed value back to the slider (clamped) and persists it. */
  const applyTyped = () => {
    const parsed = Number(number.value);
    if (!Number.isFinite(parsed)) {
      number.value = input.value;
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    number.value = String(clamped);
    input.value = String(clamped);
    out.textContent = `${clamped}${suffix}`;
    commit(clamped);
  };

  input.addEventListener('input', () => {
    out.textContent = `${input.value}${suffix}`;
    number.value = input.value;
  });
  input.addEventListener('change', () => commit(input.value));
  number.addEventListener('change', applyTyped);
  number.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyTyped();
    }
  });

  wrap.append(input, number, out);
  return wrap;
};

const bgText = (key, placeholder, onChanged) => {
  const input = h('input', 'mms-search-input');
  input.type = 'text';
  input.placeholder = placeholder || '';
  input.value = typeof config[key] === 'string' ? config[key] : '';
  input.addEventListener('change', () => {
    void persistBackgroundSettings({ [key]: input.value.trim() }, onChanged ? { reload: true } : {});
  });
  return input;
};

/** The custom-link row: a text field plus an explicit bind button. */
const bgLinkBinding = (onSubmit) => {
  const wrap = h('div', 'mms-bg-offset');
  const input = h('input', 'mms-search-input');
  input.type = 'text';
  input.placeholder = copy.customLinkPlaceholder;
  const submit = () => {
    const value = String(input.value || '').trim();
    if (!value) return;
    input.value = '';
    onSubmit(value);
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  wrap.append(input, button('mms-primary', copy.customLinkApply, submit));
  return wrap;
};

const bgSection = (title, hint) => {
  const node = h('section', 'mms-bg-section');
  node.append(h('h3', 'mms-bg-title', title));
  if (hint) node.append(h('p', 'mms-muted', hint));
  return node;
};

/** The picture-preset dropdown: picking one writes its keys and re-renders. */
const bgPresetSelect = () => {
  const select = h('select', 'mms-select');
  const current = matchBackdropPreset();
  for (const preset of BACKDROP_PRESETS) {
    const option = h('option', null, copy[preset.labelKey]);
    option.value = preset.id;
    if (preset.id === current) option.selected = true;
    select.append(option);
  }
  const custom = h('option', null, copy.presetCustom);
  custom.value = 'custom';
  if (current === 'custom') custom.selected = true;
  select.append(custom);
  select.addEventListener('change', () => {
    const preset = BACKDROP_PRESETS.find((item) => item.id === select.value);
    if (preset) void persistBackgroundSettings(preset.patch);
    else renderSoon();
  });
  return select;
};

/** The Bilibili watch URL (or plain URL) of a candidate, for binding. */
const candidateUrlOf = (candidate) => {
  const url = String(candidate?.url || '').trim();
  if (url) return url;
  const bvid = bvidOf(candidate?.id);
  return bvid ? `https://www.bilibili.com/video/${bvid}` : '';
};

/**
 * The thumbnail of a candidate row. Searching the first pictures is what makes a
 * wrong match obvious at a glance; a picture that will not load (hot-link
 * protection, offline) falls back to the placeholder instead of a broken icon.
 */
const candidateCover = (candidate) => {
  const img = h('img', 'mms-bg-candidate-cover');
  img.loading = 'lazy';
  img.alt = '';
  const url = String(candidate?.thumbnailUrl || candidate?.coverThumb || candidate?.coverUrl || '').trim();
  img.onerror = () => {
    img.onerror = null;
    img.src = DEFAULT_COVER;
  };
  img.src = url || DEFAULT_COVER;
  return img;
};

/** The video the user bound to the playing track, when there is one. */
const boundVideoForTrack = () => {
  const selected = state.mvSelected;
  if (!selected?.id) return null;
  const explicit = selected.sourceType === 'manual' || selected.sourceType === 'local';
  return explicit ? selected : null;
};

/**
 * Remembers a video for the playing track and switches the background to it.
 *
 * Both the candidate list and the custom-link field go through here: the link is
 * stored by the community MV service for that track (`bindUrl`, which persists
 * it), the streams are resolved, and the background is re-attached — which seeks
 * once to the current song position and then keeps playing from there.
 */
const applyVideoForTrack = async (url, label) => {
  const request = trackSnapshotRequest();
  if (!request) {
    reportNotice(copy.testMatchNeedTrack);
    return false;
  }
  const value = String(url || '').trim();
  if (!value) return false;

  state.busy = copy.engineResolving;
  renderSoon();
  try {
    const bound = await invokeMain('mvBindUrl', { trackId: request.trackId, url: value });
    const resolved = await invokeMain('mvResolveStreams', { videoId: bound.id }).catch(() => null);
    const video = resolved?.video ?? bound;
    if (!video?.mediaUrl && video?.playableInApp === false) throw new Error(copy.backdropNoStream);

    applyEngineVideo(video, { id: video.sourceId ?? bound.id, title: video.title || label || value });
    if (video?.mediaUrl) {
      await playEngineVideo(video, { id: video.sourceId, title: video.title, url: video.providerUrl });
    }
    reportNotice(copy.engineBound(video.title || label || value));
    return true;
  } catch (error) {
    reportError(error);
    return false;
  } finally {
    state.busy = null;
    renderSoon();
  }
};

/** Loads the name-search candidates for a track (also used by auto-matching). */
const loadBackdropCandidates = async (track, options = {}) => {
  if (!track) {
    if (!options.silent) reportNotice(copy.testMatchNeedTrack);
    return;
  }
  if (!options.silent) {
    state.busy = copy.testMatch;
    renderSoon();
  }
  try {
    const mode = backgroundConfig().matchMode;
    const query = backdropQueryFor(track);
    const payload = await invokeMain('findMvCandidates', {
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      query,
      limit: backgroundConfig().candidateLimit,
      mode,
    });
    const candidates = Array.isArray(payload) ? payload : (Array.isArray(payload?.candidates) ? payload.candidates : []);
    const chosen = chooseBackdropCandidate(candidates);
    state.backgroundTest = { track, result: { mode, query, candidates, chosen } };
    if (!options.silent) {
      if (chosen) reportNotice(copy.testMatched(chosen.title, chosen.uploader));
      else reportNotice(copy.testNoMatch);
    }
  } catch (error) {
    if (!options.silent) reportError(error);
  } finally {
    if (!options.silent) state.busy = null;
    renderSoon();
  }
};

/** Plays a specific candidate immediately, so a wrong match can be checked. */
const previewBackgroundCandidate = async (candidate) => {
  const bvid = bvidOf(candidate?.id);
  if (!bvid) return;
  const settings = backgroundConfig();
  const token = ++backdrop.lookupToken;
  backdrop.retry = null;
  backdrop.escalate = null;
  backdrop.lastError = null;
  backdrop.offsetMs = 0;
  backdrop.candidate = { bvid, url: candidate.url, title: candidate.title };
  backdrop.matched = { bvid, title: candidate.title, uploader: candidate.uploader ?? null, url: candidate.url ?? null };
  const track = state.lastTrack || {};
  if (!lyricsPage()) {
    reportNotice(copy.testMatchNeedTrack);
    return;
  }
  const best = { id: candidate.id, title: candidate.title, uploader: candidate.uploader ?? null, url: candidate.url ?? null };
  const plan = backdropPlanFor(track, best);
  const steps = settings.sourceMode === 'progressive'
    ? [plan.progressiveStep]
    : [plan.engineStep, plan.proxyStep, plan.progressiveStep];
  await runBackdropSteps(steps, track, token);
};

/**
 * The candidate videos for the playing track, from both search paths, as ONE list.
 *
 * The settings page used to render two lists side by side — the mod's name search
 * and the community engine's scored search — which are the same Bilibili query for
 * the same song, so the same videos appeared twice with different buttons. They are
 * merged by BV id (the entry carrying more information wins) and rendered once.
 */
const mergedBackdropCandidates = () => {
  const byBvid = new Map();
  const richness = (item) => (item?.thumbnailUrl ? 2 : 0)
    + (Number.isFinite(Number(item?.score)) ? 1 : 0)
    + (Array.isArray(item?.reasons) && item.reasons.length ? 1 : 0)
    + (Number.isFinite(Number(item?.viewCount)) && Number(item.viewCount) > 0 ? 1 : 0);
  const add = (item) => {
    if (!item) return;
    const bvid = bvidOf(item.id) || bvidOf(item.url) || bvidOf(item.providerUrl);
    const key = bvid || String(item.id || item.url || '');
    if (!key) return;
    const previous = byBvid.get(key);
    if (!previous) {
      byBvid.set(key, { ...item, bvid });
      return;
    }
    const merged = richness(item) > richness(previous) ? { ...previous, ...item } : { ...item, ...previous };
    byBvid.set(key, { ...merged, bvid });
  };
  // The name-search result first (it is the order the automatic match uses).
  for (const item of state.backgroundTest?.result?.candidates || []) add(item);
  for (const item of state.mvCandidates?.candidates || []) add(item);
  return [...byBvid.values()];
};

/**
 * A Bilibili search by a title the user typed, independent of the playing song.
 *
 * The automatic match derives its query from the song (title + artist + suffix),
 * which is wrong surprisingly often for covers, live versions, and songs whose
 * title is not the video's. This searches exactly what was typed and lets the
 * result be bound to the current song like any other candidate.
 */
const searchBackdropByTitle = async (rawQuery) => {
  const query = String(rawQuery || '').trim();
  if (!query) {
    reportNotice(copy.titleSearchEmpty);
    return;
  }
  const track = state.lastTrack;
  const limit = Math.max(backgroundConfig().candidateLimit, 8);
  state.busy = copy.titleSearching;
  renderSoon();
  try {
    let candidates = [];
    if (track) {
      // The engine searches for the current song but with the typed query, so its
      // scoring, quality handling and persistence stay in play.
      const snapshot = await invokeMain('mvSearchNetworkCandidatesForSnapshot', {
        ...snapshotRequestFor(track, query),
        query,
      }).catch(() => null);
      const list = Array.isArray(snapshot) ? snapshot : (snapshot?.candidates || []);
      candidates = list.slice(0, limit);
      if (candidates.length) state.mvCandidates = { trackId: String(trackKey(track)), candidates };
    }
    if (!candidates.length) {
      // No playing track (or the engine had nothing): a plain name search.
      const payload = await invokeMain('findMvCandidates', { title: query, query, limit, mode: 'first' }).catch(() => null);
      const list = Array.isArray(payload) ? payload : (payload?.candidates || []);
      candidates = list.slice(0, limit);
    }
    state.titleSearch = { for: track ? String(trackKey(track)) : '', query, result: { query, candidates } };
    if (!candidates.length) reportNotice(copy.testNoMatch);
    else reportNotice(copy.titleSearchFound(candidates.length));
  } catch (error) {
    reportError(error);
  } finally {
    state.busy = null;
    renderSoon();
    refreshBackgroundPage({ force: true });
  }
};

/** One candidate row: cover, title/uploader/score, and its actions. */
const renderCandidateRow = (candidate, marks = {}) => {
  const row = h('div', 'mms-bg-candidate');
  const bvid = candidate.bvid || bvidOf(candidate.id);
  if (bvid && marks.chosenBvid && bvid === marks.chosenBvid) row.dataset.chosen = 'true';
  if (bvid && marks.boundBvid && bvid === marks.boundBvid) row.dataset.current = 'true';
  else if (bvid && marks.selectedBvid && bvid === marks.selectedBvid) row.dataset.current = 'true';
  const main = h('div', 'mms-bg-candidate-main');
  main.append(
    h('strong', null, candidate.title || '—'),
    h('small', 'mms-muted', [
      candidate.uploader || '',
      candidate.duration ? formatDuration(candidate.duration) : candidate.durationSeconds ? formatDuration(candidate.durationSeconds) : '',
      Number.isFinite(Number(candidate.viewCount)) && Number(candidate.viewCount) > 0 ? formatCount(candidate.viewCount) : '',
      Number.isFinite(Number(candidate.score)) && candidate.score !== null ? `匹配度 ${(Number(candidate.score) * 100).toFixed(0)}%` : '',
      (candidate.reasons || []).slice(0, 2).join(' / '),
    ].filter(Boolean).join(' · ')),
  );
  const actions = h('div', 'mms-account-actions');
  actions.append(
    button('mms-primary', copy.candidateApply, () => void applyVideoForTrack(candidateUrlOf(candidate), candidate.title)),
  );
  if (bvid) actions.append(button('mms-ghost', copy.preview, () => void previewBackgroundCandidate(candidate)));
  if (candidate.url) {
    actions.append(button('mms-ghost', copy.engineOpen, () => {
      try {
        window.open(candidate.url, '_blank');
      } catch {
        /* ignore */
      }
    }));
  }
  row.append(candidateCover(candidate), main, actions);
  return row;
};

const renderBackgroundSettings = ({ masterSwitch = false } = {}) => {
  const wrap = h('div', 'mms-background');
  const settings = backgroundConfig();
  const engine = state.mvEngine;
  const account = engine?.account || null;

  // The 「MV 背景」 page carries the master switch itself (the lyrics-page drawer is
  // only mounted while the background is on, so it does not need one).
  if (masterSwitch) {
    const switchSection = bgSection(copy.enableBackdropRow, copy.enableBackdropHint);
    const switchWrap = h('label', 'mms-switch');
    const input = h('input');
    input.type = 'checkbox';
    input.checked = backdropEnabled();
    input.addEventListener('change', () => void setBackdropEnabled(input.checked));
    switchWrap.append(input);
    switchSection.append(bgRow(copy.enableBackdropRow, switchWrap));
    wrap.append(switchSection);
  }

  // ---- status ------------------------------------------------------------
  const statusSection = bgSection(copy.backgroundStatus, copy.backgroundSubtitle);
  const statusGrid = h('div', 'mms-bg-status');

  const engineCard = h('div', 'mms-bg-card');
  engineCard.dataset.state = engine?.ready ? 'ok' : 'missing';
  engineCard.append(h('strong', null, copy.engineLine));
  engineCard.append(h('small', 'mms-muted', engine?.ready
    ? [
      copy.engineOk,
      engine.database ? copy.engineDatabaseLine(engine.database) : '',
      copy.engineTracksLine(engine.tracks ?? 0),
    ].filter(Boolean).join(' · ')
    : `${copy.engineMissing}${engine?.error ? ` · ${engine.error}` : ''}`));
  const engineCardActions = h('div', 'mms-account-actions');
  engineCardActions.append(button('mms-ghost', copy.refreshStatus, () => void loadMvEngine()));
  engineCard.append(engineCardActions);
  statusGrid.append(engineCard);

  const accountCard = h('div', 'mms-bg-card');
  accountCard.dataset.state = account?.connected ? 'ok' : 'warn';
  accountCard.append(h('strong', null, copy.accountLine));
  accountCard.append(h('small', 'mms-muted', account?.connected
    ? copy.accountUsed(account.displayName)
    : account?.hasCookie ? copy.accountCookieReady : copy.accountMissing));
  statusGrid.append(accountCard);

  statusSection.append(statusGrid);
  wrap.append(statusSection);

  // ---- matching ----------------------------------------------------------
  const matchSection = bgSection(copy.matchMode, copy.matchModeHint);
  matchSection.append(bgRow(copy.matchMode, bgSelect('mvMatchMode', [
    ['first', copy.matchModeFirst],
    ['score', copy.matchModeScore],
    ['views', copy.matchModeViews],
  ], true)));
  matchSection.append(bgRow(copy.sourceMode, bgSelect('mvSourceMode', [
    ['engine', copy.sourceModeEngine],
    ['progressive', copy.sourceModeProgressive],
  ], true)));
  matchSection.append(bgRow(copy.threshold, bgSlider('mvAutoApplyThreshold', 30, 100, 1, '%', {
    transform: { to: (value) => Math.round(clampNumber(value, 0.3, 1, 0.7) * 100), from: (value) => value / 100 },
  }), copy.matchModeScore));
  matchSection.append(bgRow(copy.titleOnly, bgToggle('mvTitleOnlySearch')));
  matchSection.append(bgRow(copy.searchSuffix, bgText('mvSearchSuffix', 'MV')));
  matchSection.append(bgRow(copy.autoSearch, bgToggle('mvAutoSearch')));
  matchSection.append(bgRow(copy.autoPreload, bgToggle('mvAutoPreload')));
  matchSection.append(bgRow(copy.candidateCount, bgSlider('mvCandidateLimit', 2, 20, 1, '', {
    transform: { to: (value) => Math.round(clampNumber(value, 2, 20, 8)), from: (value) => Math.round(Number(value) || 8) },
  }), copy.candidateCountHint));

  const testActions = h('div', 'mms-account-actions');
  testActions.append(button('mms-primary', copy.testMatch, () => void loadBackdropCandidates(state.lastTrack, {})));
  matchSection.append(testActions);

  // Search Bilibili by a title the user types, instead of the song-derived query.
  const searchValue = state.titleSearch?.query || (state.lastTrack?.title || '');
  const titleInput = h('input', 'mms-search-input');
  titleInput.type = 'text';
  titleInput.placeholder = state.lastTrack?.title ? copy.titleSearchPlaceholderTrack(state.lastTrack.title) : copy.titleSearchPlaceholder;
  titleInput.value = searchValue;
  titleInput.setAttribute('aria-label', copy.titleSearchLabel);
  const runTitleSearch = () => void searchBackdropByTitle(titleInput.value);
  titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runTitleSearch();
    }
  });
  const searchRow = h('div', 'mms-bg-offset');
  searchRow.append(titleInput, button('mms-primary', copy.titleSearchAction, runTitleSearch));
  matchSection.append(bgRow(copy.titleSearchLabel, searchRow, copy.titleSearchHint));
  if (state.titleSearch?.result) {
    const found = state.titleSearch.result.candidates || [];
    matchSection.append(h('p', 'mms-muted', copy.titleSearchShown(state.titleSearch.result.query, found.length)));
    const titleList = h('div', 'mms-bg-candidates');
    for (const candidate of found.slice(0, Math.max(settings.candidateLimit, 8))) {
      titleList.append(renderCandidateRow(candidate, { selectedBvid: bvidOf(state.mvSelected?.sourceId) }));
    }
    if (!titleList.children.length) titleList.append(h('p', 'mms-muted', copy.testNoMatch));
    matchSection.append(titleList);
  }

  // Candidates for the playing track: clicking one remembers it for that song and
  // switches the background to it (seeked to the current song position). One list,
  // merged from the name search and the engine's scored search (see
  // mergedBackdropCandidates).
  const bound = boundVideoForTrack();
  const candidateResult = state.backgroundTest?.result;
  const mergedCandidates = mergedBackdropCandidates();
  if (mergedCandidates.length || candidateResult) {
    const title = state.backgroundTest?.track?.title || state.lastTrack?.title || '';
    matchSection.append(h('p', 'mms-muted', title ? copy.candidatesFor(title) : copy.candidatesShown(mergedCandidates.length)));
    const list = h('div', 'mms-bg-candidates');
    const chosenBvid = bvidOf(candidateResult?.chosen?.id) || bvidOf(candidateResult?.chosen?.url);
    const boundBvid = bound ? bvidOf(bound.providerUrl || bound.url) : '';
    const selectedBvid = bvidOf(state.mvSelected?.sourceId);
    for (const candidate of mergedCandidates.slice(0, Math.max(settings.candidateLimit, 8))) {
      list.append(renderCandidateRow(candidate, { chosenBvid, boundBvid, selectedBvid }));
    }
    if (!list.children.length) list.append(h('p', 'mms-muted', copy.testNoMatch));
    matchSection.append(list);
  } else {
    matchSection.append(h('p', 'mms-muted', state.busy === copy.testMatch ? copy.loadingCandidates : copy.candidatesEmpty));
  }

  // A custom link is remembered for this song (persisted by the MV service), so
  // the same video comes back the next time the track plays.
  matchSection.append(bgRow(copy.customLinkLabel, bgLinkBinding((value) => {
    void applyVideoForTrack(value, value);
  })));
  if (bound) {
    const boundRow = h('div', 'mms-bg-offset');
    boundRow.append(
      h('span', 'mms-muted', copy.engineBound(bound.title || bvidOf(bound.providerUrl) || '')),
      button('mms-ghost', copy.engineClear, () => void engineClearSelected()),
    );
    matchSection.append(boundRow);
  }
  matchSection.append(h('p', 'mms-muted', copy.customLinkHint));
  wrap.append(matchSection);

  // ---- picture -----------------------------------------------------------
  const pictureSection = bgSection(copy.backdrop, copy.backdropDragHint);
  pictureSection.append(bgRow(copy.immersive, bgToggle('mvImmersiveBackground')));
  pictureSection.append(bgRow(copy.preset, bgPresetSelect(), copy.presetHint));
  pictureSection.append(bgRow(copy.autoScale, bgToggle('mvImmersiveBackgroundAutoScale')));
  pictureSection.append(bgRow(copy.widthLabel, bgSlider('mvImmersiveBackgroundWidthPercent', 10, 200, 1, '%')));
  pictureSection.append(bgRow(copy.heightLabel, bgSlider('mvImmersiveBackgroundHeightPercent', 10, 200, 1, '%')));
  pictureSection.append(bgRow(copy.fitLabel, bgSelect('mvImmersiveBackgroundFit', [
    ['cover', copy.fitCover],
    ['contain', copy.fitContain],
    ['fill', copy.fitFill],
    ['none', copy.fitOriginal],
  ], false, {
    // Under 「默认（左右贴合）」 the width fitting decides the picture size, so the
    // fitting reads 铺满 (what it covers with) and does not pretend to apply.
    displayValue: config.mvImmersiveBackgroundFitWidthPinned === true ? 'cover' : undefined,
    disabled: config.mvImmersiveBackgroundFitWidthPinned === true,
  })));
  pictureSection.append(bgRow(copy.scaleLabel, bgSlider('mvImmersiveBackgroundScalePercent', 70, 220, 1, '%')));
  pictureSection.append(bgRow(copy.offsetXLabel, bgSlider('mvImmersiveBackgroundOffsetXPercent', 0, 100, 1, '%')));
  pictureSection.append(bgRow(copy.offsetYLabel, bgSlider('mvImmersiveBackgroundOffsetYPercent', 0, 100, 1, '%')));
  pictureSection.append(bgRow(copy.blur, bgSlider('mvImmersiveBackgroundBlurPx', 0, 32, 1, 'px')));
  pictureSection.append(bgRow(copy.brightness, bgSlider('mvImmersiveBackgroundBrightnessPercent', 60, 140, 1, '%')));
  pictureSection.append(bgRow(copy.overlay, bgSlider('mvImmersiveBackgroundOverlayOpacityPercent', 0, 100, 1, '%')));
  pictureSection.append(bgRow(copy.readability, bgToggle('mvLyricsReadabilityEnhanced', true)));
  pictureSection.append(bgRow(copy.hideLyrics, bgToggle('mvHideLyrics', true)));
  // The detail page's own way into this panel; off means the panel keeps only the
  // title, the collapse arrow and its actions.
  pictureSection.append(bgRow(copy.settingsButton, bgToggle('mvShowSettingsButton'), copy.settingsButtonHint));
  wrap.append(pictureSection);

  // ---- sync --------------------------------------------------------------
  const syncSection = bgSection(copy.syncMode, null);
  syncSection.append(bgRow(copy.followProgress, bgToggle('mvRestartAudioOnLoad', true)));
  syncSection.append(bgRow(copy.syncMode, bgSelect('mvSyncMode', [
    ['stable', locale === 'en-US' ? 'Stable' : '稳定'],
    ['balanced', locale === 'en-US' ? 'Balanced' : '均衡'],
    ['precise', locale === 'en-US' ? 'Precise' : '精准'],
  ])));
  syncSection.append(bgRow(copy.replayOnChange, bgToggle('mvReplayAudioOnChange')));
  syncSection.append(bgRow(copy.quality, bgSelect('mvMaxQuality', [
    ['720p', '720p'],
    ['1080p', '1080p'],
    ['1440p', '1440p'],
    ['2160p', '2160p'],
    ['max', 'max'],
  ])));
  syncSection.append(bgRow(copy.allow60fps, bgToggle('mvAllow60fps')));
  wrap.append(syncSection);

  // ---- community MV engine ------------------------------------------------
  const engineSection = bgSection(copy.engineTitle, copy.engineUsage);
  const engineStatusLine = h('p', 'mms-muted', engineReady()
    ? `${copy.engineReady} · ${copy.engineDatabase(state.mvEngine.database || '')} · ${copy.engineTracks(state.mvEngine.tracks ?? 0)}`
    : `${copy.engineUnavailable}${state.mvEngine?.error ? ` · ${state.mvEngine.error}` : ''}`);
  engineSection.append(engineStatusLine);

  const engineActions = h('div', 'mms-account-actions');
  engineActions.append(
    button('mms-primary', copy.engineSearch, () => void engineSearchCandidates(), { disabled: !engineReady() }),
    button('mms-ghost', copy.engineBindLocal, () => void engineBindLocalFile(), { disabled: !engineReady() }),
    button('mms-ghost', copy.engineClear, () => void engineClearSelected(), { disabled: !engineReady() }),
    button('mms-ghost', copy.engineDiagnostics, () => void copyEngineDiagnostics()),
    button('mms-ghost', copy.engineReload, () => void loadMvEngine()),
  );
  engineSection.append(engineActions);

  // Current selection: title, provider, quality variants, offset.
  const selected = state.mvSelected;
  if (selected) {
    const card = h('div', 'mms-bg-card');
    card.dataset.state = 'ok';
    card.append(h('strong', null, copy.engineSelected));
    card.append(h('small', 'mms-muted', [
      selected.title || selected.id,
      selected.provider || '',
      selected.qualityLabel || '',
      selected.playableInApp === false ? copy.unavailable : '',
    ].filter(Boolean).join(' · ')));
    const qualityRow = h('div', 'mms-bg-candidate-quality');
    const variants = Array.isArray(state.mvVariants?.variants) ? state.mvVariants.variants : [];
    const currentQualityId = String(selected.selectedQualityId || '');
    // The quality ladder is a dropdown: Bilibili reports up to half a dozen
    // variants and, as a row of chips, they ran past the panel's right edge.
    const qualitySelect = h('select', 'mms-select');
    const optionValues = [];
    for (const variant of variants) {
      const value = String(variant.id);
      optionValues.push(value);
      const option = h('option', null, `${variant.label}${variant.playableInApp === false ? ' (×)' : ''}`);
      option.value = value;
      if (value === currentQualityId) option.selected = true;
      qualitySelect.append(option);
    }
    if (!optionValues.length) {
      const option = h('option', null, copy.qualityAuto);
      option.value = 'auto';
      option.selected = true;
      qualitySelect.append(option);
    } else if (!optionValues.includes(currentQualityId)) {
      // The engine can still report "auto" (or a variant that is gone): fall back
      // to the first ladder entry so the dropdown is never blank.
      qualitySelect.value = optionValues[0];
    } else {
      qualitySelect.value = currentQualityId;
    }
    qualitySelect.addEventListener('change', () => void engineSetQuality(qualitySelect.value));
    qualityRow.append(
      h('span', 'mms-muted', copy.engineQuality),
      qualitySelect,
      button('mms-ghost', copy.engineOpen, () => void engineOpenExternal(selected.id)),
    );
    card.append(qualityRow);

    const offset = Number(state.mvOffset) || 0;
    card.append(bgRow(copy.engineOffset, (() => {
      const wrap = h('div', 'mms-bg-offset');
      wrap.append(
        button('mms-ghost', copy.panelOffsetMinus, () => void engineSetOffset(offset - 500)),
        h('span', 'mms-bg-offset-value', `${(offset / 1000).toFixed(1)}s`),
        button('mms-ghost', copy.panelOffsetPlus, () => void engineSetOffset(offset + 500)),
        button('mms-ghost', copy.panelOffsetReset, () => void engineSetOffset(0)),
      );
      return wrap;
    })(), copy.engineOffsetHint));
    engineSection.append(card);
  }

  // The candidate list lives in the 匹配 section above (one merged list); this
  // section only reports the engine and the video it currently has selected.
  if (state.mvCandidates?.candidates?.length) {
    engineSection.append(h('p', 'mms-muted', copy.engineCandidates(state.mvCandidates.candidates.length)));
  }

  wrap.append(engineSection);

  // Keep the numbers fresh the first time the page is opened, and fetch the
  // candidates of the playing track once per track so a wrong match can be
  // corrected without pressing anything.
  const lastTrack = state.lastTrack;
  const lastTrackId = lastTrack ? String(trackKey(lastTrack)) : null;
  if (lastTrackId && state.backgroundTestFor !== lastTrackId) {
    state.backgroundTestFor = lastTrackId;
    void loadBackdropCandidates(lastTrack, { silent: true });
  }

  if (!state.mvEngine) {
    void loadMvEngine();
  } else {
    // Load the persisted selection once per track — a re-render must not clobber
    // a video that was just picked in memory.
    const trackId = trackSnapshotRequest()?.trackId ?? null;
    if (state.mvSelectedLoadedFor !== trackId) {
      state.mvSelectedLoadedFor = trackId;
      void engineLoadSelected();
    }
  }

  return wrap;
};

/**
 * The one account-related line the 歌单 page is allowed to show: it says why the
 * list is empty and hands the user over to the 账号 tab. Nothing else on this
 * page mentions accounts or sign-in state.
 */
const renderLoginHint = () => {
  const row = h('div', 'mms-login-hint');
  row.append(h('span', 'mms-muted', copy.playlistsLoginHint));
  row.append(button('mms-primary', copy.goLogin, () => {
    state.view = 'accounts';
    renderSoon();
  }));
  return row;
};

/** The 每日推荐 group of the 歌单 page (it used to be a nav tab of its own). */
const renderDailyGroup = () => {
  const group = h('section', 'mms-group mms-daily');
  const head = h('div', 'mms-group-head');
  const titleWrap = h('div', 'mms-group-title');
  titleWrap.append(h('strong', null, copy.dailyGroup), h('small', 'mms-muted', copy.dailyGroupHint));
  const actions = h('div', 'mms-group-actions');
  actions.append(
    button('mms-primary', copy.dailyOpen, () => void openDailyRecommend()),
    button('mms-ghost', copy.refresh, () => void loadDailyTracks({ force: true })),
  );
  head.append(titleWrap, actions);
  group.append(head);

  const daily = state.daily;
  if (daily.error) {
    group.append(h('p', 'mms-account-error', daily.error));
    return group;
  }
  if (!daily.tracks.length) {
    group.append(h('p', 'mms-muted', daily.loading ? copy.dailyLoading : copy.empty));
    // Read the list once per session, lazily: the group is a preview, opening it
    // is what fetches the tracks again.
    if (!daily.loading && !daily.loaded) void loadDailyTracks();
    return group;
  }

  const list = h('div', 'mms-rows');
  const preview = daily.tracks.slice(0, DAILY_PREVIEW_LIMIT);
  preview.forEach((track, index) => list.append(renderTrackRow(track, index)));
  group.append(list);
  if (daily.tracks.length > preview.length) {
    group.append(h('p', 'mms-muted', copy.dailyRest(daily.tracks.length - preview.length)));
  }
  return group;
};

const renderPlaylists = () => {
  const wrap = h('div', 'mms-results');
  const head = h('div', 'mms-results-head');
  head.append(
    h('strong', null, `${copy.myPlaylists} · ${currentProviderLabel(state.provider)}`),
    button('mms-ghost', copy.refresh, () => void loadAccountPlaylists({ force: true })),
    button('mms-ghost', copy.playlistsClearLocal, () => void clearLocalPlaylists()),
  );
  wrap.append(head);
  wrap.append(renderDailyGroup());
  wrap.append(renderPlaylistTools());

  const account = accountStatus(state.provider);
  const data = state.playlists;

  // The link-imported playlists that were saved are independent of any account, so
  // they are listed no matter what the account list is doing.
  const localGroup = () => renderLocalPlaylistGroup();
  const signedOut = () => !account?.connected;

  if (!data || data.provider !== state.provider) {
    void loadAccountPlaylists();
    if (signedOut()) wrap.append(renderLoginHint());
    else wrap.append(h('p', 'mms-muted', copy.loading));
    wrap.append(localGroup());
    return wrap;
  }
  if (data.loading) {
    if (signedOut()) wrap.append(renderLoginHint());
    else wrap.append(h('p', 'mms-muted', copy.loading));
    wrap.append(localGroup());
    return wrap;
  }
  // Right after the local store was cleared: press 刷新 to read the platform again.
  if (data.cleared) {
    wrap.append(h('p', 'mms-muted', copy.playlistsCleared));
    wrap.append(localGroup());
    return wrap;
  }

  // The list itself is kept on disk; say so, so "no network call happened" is
  // visible rather than something the user has to guess from the speed.
  const savedAccount = state.playlistStore?.accounts?.[state.provider];
  const savedAt = formatStoreTime(data.fetchedAt || savedAccount?.fetchedAt);
  wrap.append(h('p', 'mms-muted', [
    copy.playlistsLocalHint,
    data.cached && savedAt ? copy.playlistsLocal(savedAt) : '',
  ].filter(Boolean).join(' ')));

  if (data.error) {
    if (signedOut()) {
      // Signed out: one hint instead of the platform's own "please sign in" text.
      wrap.append(renderLoginHint());
    } else {
      wrap.append(h('p', 'mms-account-error', data.error));
    }
    if (data.entries.length) {
      // A failed refresh must not hide the locally kept list.
      wrap.append(renderPlaylistGrid(data.entries));
    }
    wrap.append(localGroup());
    return wrap;
  }
  if (!data.entries.length) {
    if (signedOut()) wrap.append(renderLoginHint());
    else wrap.append(h('p', 'mms-muted', copy.playlistsEmpty));
    wrap.append(localGroup());
    return wrap;
  }

  wrap.append(renderPlaylistGrid(data.entries));
  wrap.append(h('p', 'mms-muted', copy.playlistsHint));
  wrap.append(h('p', 'mms-muted', copy.playlistsSaveHint));
  wrap.append(localGroup());
  return wrap;
};

/** The link-import form plus the layout selector of the 歌单 page. */
const renderPlaylistTools = () => {
  const tools = h('div', 'mms-playlist-tools');

  const form = h('form', 'mms-import-form');
  const input = h('input', 'mms-search-input');
  input.type = 'text';
  input.placeholder = copy.importPlaceholder;
  input.setAttribute('aria-label', copy.importPlaylist);
  form.append(input, button('mms-primary', copy.importAction, (event) => {
    event?.preventDefault?.();
    const value = String(input.value || '').trim();
    input.value = '';
    void importPlaylist(value);
  }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = String(input.value || '').trim();
    input.value = '';
    void importPlaylist(value);
  });
  tools.append(form);

  const layout = h('label', 'mms-view-mode');
  layout.append(h('span', 'mms-muted', copy.playlistViewMode));
  const select = h('select', 'mms-select');
  for (const [value, label] of [['grid', copy.viewModeGrid], ['list', copy.viewModeList], ['compact', copy.viewModeCompact]]) {
    const option = h('option', null, label);
    option.value = value;
    if (playlistViewMode() === value) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => {
    config.playlistViewMode = select.value;
    try {
      external.settings?.set?.({ ...config });
    } catch {
      /* hosts without the config API keep the in-memory value */
    }
    renderSoon();
  });
  layout.append(select);
  tools.append(layout);

  tools.append(h('p', 'mms-muted', copy.importHint));
  return tools;
};

/**
 * The link-imported playlists the user chose to keep.
 *
 * Account playlists are already cards in the account grid (with a 本地已存 badge),
 * so only `source === 'link'` collections are listed here — those have no account
 * entry to be shown under.
 */
const renderLocalPlaylistGroup = () => {
  const collections = Object.values(state.playlistStore?.collections || {})
    .filter((item) => item && item.source === 'link' && Array.isArray(item.tracks) && item.tracks.length)
    .sort((left, right) => String(right.savedAt || '').localeCompare(String(left.savedAt || '')));

  const section = h('section', 'mms-local-playlists');
  section.append(h('h3', 'mms-bg-title', copy.playlistsLocalGroup));
  if (!collections.length) {
    section.append(h('p', 'mms-muted', copy.playlistsLocalGroupEmpty));
    return section;
  }
  section.append(h('p', 'mms-muted', copy.playlistsLocalGroupHint));
  section.append(renderPlaylistGrid(collections.map(storedEntryAsPlaylist)));
  return section;
};

/**
 * A locally kept collection in the shape the playlist cards expect.
 *
 * `storedEntry` is what `playlistStoreSaveCollection` wrote: the same fields plus
 * the saved tracks, so a card can be built from it without a round trip.
 */
const storedEntryAsPlaylist = (stored) => ({
  id: stored.key,
  storeKey: stored.key,
  title: stored.name || stored.key,
  name: stored.name || stored.key,
  provider: stored.provider || state.provider,
  // The link acts as the playlist id, which is also what re-fetching needs.
  providerPlaylistId: stored.linkUrl || stored.key,
  url: stored.linkUrl || '',
  trackCount: Number(stored.trackCount) || (Array.isArray(stored.tracks) ? stored.tracks.length : 0),
  coverUrl: stored.coverUrl || null,
  creator: stored.provider ? PLATFORM_LABELS[stored.provider] || stored.provider : null,
  kind: 'link',
  stored,
});

/**
 * The playlist cards, in the layout the user picked.
 *
 * Keeping a playlist on this machine is an explicit per-card choice, and a
 * locally kept collection has no URL to re-read — it opens straight from disk.
 */
const renderPlaylistGrid = (entries) => {
  const mode = playlistViewMode();
  const grid = h('div', mode === 'grid' ? 'mms-grid' : mode === 'list' ? 'mms-playlist-list' : 'mms-playlist-compact');

  for (const entry of entries) {
    const card = h('div', 'mms-card');
    card.dataset.mode = mode;
    const coverUrl = entryCoverOf(entry) || entry.stored?.coverUrl || null;
    const cover = h('img', 'mms-card-cover');
    cover.src = safeCoverUrl(coverUrl) || DEFAULT_COVER;
    cover.loading = 'lazy';
    cover.alt = '';
    cover.addEventListener('error', () => {
      const original = String(coverUrl || '').trim();
      // An https upgrade that the host does not serve falls back to the original
      // address before the placeholder.
      if (original && !original.startsWith('data:') && cover.src !== original) cover.src = original;
      else if (!String(cover.src).startsWith('data:')) cover.src = DEFAULT_COVER;
    });

    const key = String(entry.key || entry.storeKey || entry.stored?.key
      || playlistStoreKeyOf(entry));
    const stored = entry.stored || state.playlistStore?.collections?.[key];
    const main = h('div', 'mms-card-main');
    main.append(
      h('strong', null, entry.title || entry.name || '—'),
      h('small', 'mms-muted', [
        copy.trackCount(Number(entry.trackCount) || 0),
        entry.kind === 'collected' ? copy.playlistsCollected : entry.kind === 'watchlater' ? copy.playlistsWatchLater : '',
        entry.kind === 'link' ? copy.importedLabel : '',
        entry.creator || '',
      ].filter(Boolean).join(' · ')),
    );
    if (stored) {
      main.append(h('small', 'mms-stored-badge', copy.playlistsStored(countLabel(Array.isArray(stored.tracks) ? stored.tracks.length : 0))));
      const savedAt = formatStoreTime(stored.savedAt);
      if (savedAt) main.append(h('small', 'mms-muted', copy.playlistsLocal(savedAt)));
    }

    const actions = h('div', 'mms-card-actions');
    actions.append(button(stored ? 'mms-ghost' : 'mms-primary', stored ? copy.playlistsUnsave : copy.playlistsSave,
      (event) => void toggleStoredPlaylist(entry, event)));

    card.append(cover, main, actions);
    card.addEventListener('click', () => void openAccountPlaylist(entry));
    grid.append(card);
  }
  return grid;
};

/** "2026-01-01 12:30" for the locally-kept timestamps, or '' when unreadable. */
const formatStoreTime = (value) => {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const render = () => {
  if (!pageRoot) return;
  // Re-rendering must not throw the user back to the top of a long settings page
  // (adjusting a slider near the bottom used to scroll the page up).
  const scroller = scrollableAncestor(pageRoot);
  const scrollTop = Number(scroller?.scrollTop) || 0;
  renderPage();
  if (scroller && scrollTop > 0) scroller.scrollTop = scrollTop;
};

/**
 * What the 「MV 背景」 page shows. Only state that can change *behind the user's
 * back* is in here (engine, selection, offset, candidates); the controls the user
 * is editing are deliberately left out, so a rebuild never fights a slider drag.
 */
const backgroundPageSignature = () => [
  backdropEnabled() ? 'on' : 'off',
  backdrop.state,
  // The song that is playing: without it the page (and with it 当前歌曲 / 候选歌曲)
  // kept showing the previous track after a song change.
  state.lastTrack ? String(trackKey(state.lastTrack)) : '',
  state.lastTrack?.title || '',
  state.mvEngine?.ready ? `ready:${state.mvEngine.tracks ?? 0}` : 'missing',
  state.mvSelected?.id || '',
  Number(state.mvOffset) || 0,
  state.backgroundTest?.track?.id || '',
  mergedBackdropCandidates().length,
  state.titleSearch?.for || '',
  state.titleSearch?.query || '',
  (state.titleSearch?.result?.candidates || []).length,
  (state.mvVariants?.variants || []).length,
  state.busy || '',
].join('|');

const renderBackgroundPage = () => {
  if (!backgroundPageRoot) return;
  const scroller = scrollableAncestor(backgroundPageRoot);
  const scrollTop = Number(scroller?.scrollTop) || 0;

  const root = h('div', 'mms-root mms-root--mv');
  const head = h('header', 'mms-header');
  const titleWrap = h('div', 'mms-title-wrap');
  titleWrap.append(
    h('h2', 'mms-title', copy.mvPageTitle),
    h('p', 'mms-subtitle', copy.mvPageSubtitle),
  );
  head.append(titleWrap);
  root.append(head, renderBackgroundSettings({ masterSwitch: true }));
  root.append(h('p', 'mms-muted', copy.mvPageDrawerHint));

  backgroundPageRoot.replaceChildren(root);
  backgroundPageRoot.dataset.signature = backgroundPageSignature();
  if (scroller && scrollTop > 0) scroller.scrollTop = scrollTop;
};

/** Rebuilds the page only when what it shows actually moved (poll tick). */
const refreshBackgroundPage = ({ force = false } = {}) => {
  if (!backgroundPageRoot) return;
  if (!force && backgroundPageRoot.dataset.signature === backgroundPageSignature()) return;
  renderBackgroundPage();
};

const renderPage = () => {
  if (!pageRoot) return;
  pageRoot.replaceChildren();

  const root = h('div', 'mms-root');
  const head = h('header', 'mms-header');
  const titleWrap = h('div', 'mms-title-wrap');
  titleWrap.append(
    h('h2', 'mms-title', copy.title),
    h('p', 'mms-subtitle', copy.subtitle),
  );
  const nav = h('nav', 'mms-nav');
  // 我的歌单 first: it is the page the mod opens on. 背景设置 is not a tab any
  // more — it is its own sidebar page (and the lyrics-page MV drawer), so the
  // audio page only carries what plays music.
  for (const [view, label] of [['playlists', copy.myPlaylists], ['search', copy.search], ['accounts', copy.accounts]]) {
    const tab = button('mms-nav-tab', label, () => {
      state.view = view === 'search' ? (state.detail ? 'detail' : 'search') : view;
      if (view === 'playlists') void loadAccountPlaylists();
      // Choosing 搜索 moves the context: a detail page's ← must go to the search
      // results again, not back to the 歌单 page it was opened from.
      if (view === 'search') state.detailFrom = 'search';
      renderSoon();
    });
    tab.classList.toggle('is-active', view === 'accounts' ? state.view === 'accounts' : state.view === view
      || (view === 'search' && state.view === 'detail'));
    nav.append(tab);
  }
  head.append(titleWrap, nav);
  root.append(head);

  if (!state.ready) {
    const blocked = h('div', 'mms-blocked');
    blocked.append(h('p', null, state.readyError ? `${copy.loadFailed}: ${state.readyError}` : copy.searching));
    root.append(blocked);
    pageRoot.append(root);
    return;
  }

  const banner = renderBanner();
  if (banner) root.append(banner);

  if (state.view === 'accounts') {
    root.append(renderAccounts());
  } else if (state.view === 'playlists') {
    root.append(renderProviderPicker({ compact: true }), renderPlaylists());
  } else {
    root.append(renderProviderStrip(), renderToolbar());
    if (state.view === 'detail') {
      root.append(renderDetail());
    } else {
      root.append(renderSearchResults());
    }
  }

  pageRoot.append(root);
};

// ---------------------------------------------------------------------------
// Styles — uses the current ECHO theme tokens.
// ---------------------------------------------------------------------------

const CSS = `
.mms-root{display:flex;flex-direction:column;gap:14px;padding:18px 20px 32px;color:var(--theme-text,inherit);font:13px/1.5 -apple-system,system-ui,"Segoe UI",sans-serif}
.mms-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.mms-title{margin:0;font-size:20px;font-weight:650}
.mms-subtitle{margin:2px 0 0;color:var(--theme-muted-text,#64748b);font-size:12px}
/* Navigation mirrors ECHO's own transport idiom: flat labels, the active one in
   the accent colour with a short underline bar — no self-drawn pills. */
.mms-nav{display:flex;gap:2px;flex-wrap:wrap;align-items:center}
.mms-nav-tab{position:relative;padding:7px 12px 11px;border:0;border-radius:8px;background:transparent;color:var(--theme-muted-text,#64748b);cursor:pointer;font-size:13px;font-weight:600;transition:color .15s ease,background-color .15s ease}
.mms-nav-tab:hover{color:var(--theme-heading-text,inherit);background:color-mix(in srgb,var(--theme-accent-bg,rgba(127,127,127,.12)) 54%,transparent)}
.mms-nav-tab.is-active{color:var(--theme-accent-text-strong,var(--theme-accent-solid-bg,#4b55e8))}
.mms-nav-tab.is-active:after{position:absolute;left:50%;bottom:3px;width:16px;height:2px;border-radius:999px;background:currentColor;content:"";transform:translateX(-50%);opacity:.85}
.mms-provider-picker{display:flex;flex-direction:column;gap:8px}
.mms-providers{display:flex;gap:4px;flex-wrap:wrap}
.mms-chip{display:flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--theme-muted-text,#64748b);cursor:pointer;font-size:12px}
.mms-chip:hover:not(:disabled){color:var(--theme-heading-text,inherit);background:var(--theme-list-row-bg-hover,rgba(127,127,127,.1))}
.mms-chip.is-active{color:var(--theme-accent-text-strong,var(--theme-accent-solid-bg,#4b55e8));background:var(--theme-accent-bg,rgba(127,127,127,.12))}
.mms-chip:disabled{opacity:.5;cursor:not-allowed}
.mms-chip[data-state="account"] .mms-dot,.mms-chip[data-state="disabled"] .mms-dot{background:#f59e0b}
.mms-chip[data-state="ok"] .mms-dot{background:#22c55e}
.mms-chip[data-state="missing"] .mms-dot{background:#94a3b8}
.mms-dot{width:7px;height:7px;border-radius:50%;background:#94a3b8;flex:0 0 auto}
.mms-chip-label{font-weight:600}
.mms-chip-state{color:var(--theme-muted-text,#64748b);font-size:11px}
/* Narrow windows swap the chip row for a dropdown (see the media queries). */
.mms-providers-select{display:none}
.mms-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.mms-search{flex:1 1 260px;min-width:220px}
.mms-search-input{width:100%;padding:9px 12px;border:1px solid var(--theme-button-border,var(--theme-panel-border,#d8dee9));border-radius:10px;background:var(--theme-field-bg,var(--theme-panel-bg,transparent));color:inherit;font-size:13px;outline:none}
.mms-search-input:focus{border-color:var(--theme-accent-border,var(--theme-accent-solid-bg,#4b55e8))}
.mms-tabs{display:flex;gap:2px}
.mms-tab{position:relative;padding:6px 11px;border:0;border-radius:8px;background:transparent;color:var(--theme-muted-text,#64748b);cursor:pointer;font-size:12px}
.mms-tab:hover{color:var(--theme-heading-text,inherit);background:var(--theme-list-row-bg-hover,rgba(127,127,127,.1))}
.mms-tab.is-active{color:var(--theme-accent-text-strong,var(--theme-heading-text,inherit));font-weight:600;background:var(--theme-accent-bg,rgba(127,127,127,.12))}
.mms-tools{display:flex;gap:8px;align-items:center}
/* Controls use the same tokens as ECHO's own .tool-button / .secondary-action. */
.mms-ghost,.mms-primary,.mms-icon{border-radius:10px;cursor:pointer;font-size:12px;border:1px solid var(--theme-button-border,var(--theme-panel-border,#d8dee9));background:var(--theme-field-bg,transparent);color:inherit;padding:7px 12px}
.mms-primary{background:var(--theme-accent-solid-bg,#4b55e8);border-color:transparent;color:var(--theme-overlay-text,#fff);font-weight:600}
.mms-ghost:hover:not(:disabled),.mms-icon:hover:not(:disabled){border-color:var(--theme-accent-border,var(--theme-accent-solid-bg,#4b55e8));color:var(--theme-accent-text-strong,inherit)}
.mms-icon{padding:5px 9px;min-width:30px}
.mms-tool-icon{display:grid;place-items:center;width:34px;height:34px;padding:0;font-size:15px;line-height:1;border:1px solid var(--theme-button-border,var(--theme-panel-border,#d8dee9));border-radius:10px;background:var(--theme-field-bg,transparent);color:var(--theme-muted-text,#64748b);cursor:pointer}
.mms-tool-icon:hover{color:var(--theme-heading-text,inherit);border-color:var(--theme-accent-border,var(--theme-accent-solid-bg,#4b55e8))}
.mms-ghost:disabled,.mms-primary:disabled,.mms-icon:disabled,.mms-tool-icon:disabled{opacity:.45;cursor:not-allowed}
.mms-select{padding:7px 10px;border:1px solid var(--theme-button-border,var(--theme-panel-border,#d8dee9));border-radius:10px;background:var(--theme-field-bg,transparent);color:inherit;font-size:12px}
.mms-banner{display:flex;flex-direction:column;gap:4px}
.mms-banner span{padding:7px 11px;border-radius:9px;font-size:12px;cursor:pointer}
.mms-banner-error{background:rgba(239,68,68,.14);color:#ef4444}
.mms-banner-notice{background:rgba(34,197,94,.14);color:#16a34a}
.mms-banner-busy{background:rgba(59,130,246,.14);color:#3b82f6}
.mms-results{display:flex;flex-direction:column;gap:10px}
.mms-results-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
/* Groups (每日推荐, and anything later folded into 我的歌单). */
.mms-group{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:14px;background:var(--theme-panel-bg,transparent)}
.mms-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.mms-group-title{display:flex;flex-direction:column;gap:1px;min-width:0}
.mms-group-title strong{font-size:13px;font-weight:650}
.mms-group-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
/* The only account-shaped thing the 歌单 page may show. */
.mms-login-hint{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px;border:1px dashed var(--theme-panel-border,#d8dee9);border-radius:12px}
.mms-rows{display:flex;flex-direction:column;gap:2px}
.mms-row{display:grid;grid-template-columns:26px 44px minmax(0,1fr) auto auto auto;gap:10px;align-items:center;padding:6px 8px;border-radius:9px}
.mms-row:hover{background:var(--theme-list-row-bg-hover,rgba(127,127,127,.1))}
.mms-row[data-unavailable="true"]{opacity:.55}
.mms-row-index{color:var(--theme-muted-text,#64748b);font-size:11px;text-align:right}
.mms-row-cover{width:44px;height:44px;border-radius:8px;object-fit:cover;background:rgba(127,127,127,.12)}
.mms-row-main{min-width:0;display:flex;flex-direction:column;gap:1px}
.mms-row-title{display:flex;align-items:center;gap:6px;min-width:0}
.mms-row-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.mms-row-main small{color:var(--theme-muted-text,#64748b);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mms-row-quality,.mms-row-duration{color:var(--theme-muted-text,#64748b);font-size:11px;white-space:nowrap}
.mms-row-actions{display:flex;gap:4px}
.mms-row-warning{grid-column:3 / -1;color:#f59e0b;font-size:11px}
.mms-badge{padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.16);color:var(--theme-muted-text,#64748b);font-size:10px;flex:0 0 auto}
.mms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.mms-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:12px;cursor:pointer;background:var(--theme-panel-bg,transparent)}
.mms-card:hover{border-color:var(--theme-accent-solid-bg,#4b55e8)}
.mms-card-cover{width:100%;aspect-ratio:1/1;border-radius:9px;object-fit:cover;background:rgba(127,127,127,.12)}
.mms-card-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.mms-card-main strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mms-card-main small{color:var(--theme-muted-text,#64748b);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mms-stored-badge{color:var(--theme-accent-solid-bg,#4b55e8)!important;font-weight:600}
.mms-card-actions{display:flex;gap:6px;flex-wrap:wrap}
.mms-card-actions button{flex:1 1 auto;padding:5px 9px;font-size:11px}
/* 歌单 page: the link import + layout picker, and the list/compact layouts the
   picker switches between (the grid stays the default card layout above). */
.mms-playlist-tools{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:12px;background:var(--theme-panel-bg,transparent)}
.mms-import-form{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mms-import-form .mms-search-input{flex:1 1 280px;min-width:200px}
.mms-view-mode{display:flex;align-items:center;gap:8px}
.mms-local-playlists{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:14px}
.mms-playlist-list{display:flex;flex-direction:column;gap:6px}
.mms-playlist-list .mms-card{flex-direction:row;align-items:center;gap:12px;padding:8px 10px}
.mms-playlist-list .mms-card-cover{width:64px;height:64px;aspect-ratio:auto;flex:0 0 auto}
.mms-playlist-list .mms-card-main{flex:1 1 auto}
.mms-playlist-list .mms-card-actions{flex:0 0 auto;flex-wrap:nowrap}
.mms-playlist-compact{display:flex;flex-direction:column;gap:2px}
.mms-playlist-compact .mms-card{flex-direction:row;align-items:center;gap:10px;padding:4px 8px;border-color:transparent;background:transparent}
.mms-playlist-compact .mms-card:hover{background:var(--theme-list-row-bg-hover,rgba(127,127,127,.1))}
.mms-playlist-compact .mms-card-cover{width:30px;height:30px;aspect-ratio:auto;border-radius:6px;flex:0 0 auto}
.mms-playlist-compact .mms-card-main{flex:1 1 auto;flex-direction:row;align-items:center;gap:10px}
.mms-playlist-compact .mms-card-main strong{font-size:12px}
.mms-playlist-compact .mms-card-actions{flex:0 0 auto;flex-wrap:nowrap}
.mms-playlist-compact .mms-card-actions button{padding:3px 8px;font-size:11px}
.mms-hero{display:flex;gap:14px;align-items:center}
.mms-hero-cover{width:104px;height:104px;border-radius:12px;object-fit:cover;background:rgba(127,127,127,.12)}
.mms-hero-main{display:flex;flex-direction:column;gap:4px;min-width:0}
.mms-hero-title{margin:0;font-size:17px;font-weight:650}
.mms-hero-actions{display:flex;gap:8px;margin-top:4px}
.mms-accounts{display:flex;flex-direction:column;gap:10px}
.mms-account{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:11px}
.mms-account[data-connected="true"]{border-color:color-mix(in srgb,var(--theme-accent-solid-bg,#4b55e8) 45%,transparent)}
.mms-identity{display:flex;gap:10px;align-items:center;min-width:0;flex:1 1 260px}
.mms-avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;background:rgba(127,127,127,.14);flex:0 0 auto}
.mms-account-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.mms-account-name{display:flex;align-items:center;gap:6px;min-width:0}
.mms-account-name strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mms-account-error{color:#ef4444;font-size:11px}
.mms-account-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.mms-account-editor{display:flex;gap:8px;width:100%}
.mms-account-editor .mms-search-input{flex:1}
.mms-qr{display:flex;gap:14px;align-items:flex-start;width:100%;padding:12px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:12px;background:var(--theme-panel-bg,transparent)}
.mms-qr-image{width:180px;height:180px;border-radius:10px;background:#fff;padding:6px;flex:0 0 auto}
.mms-qr-placeholder{width:180px;height:180px;border-radius:10px;border:1px dashed var(--theme-panel-border,#d8dee9);display:grid;place-items:center;font-size:44px;color:var(--theme-muted-text,#64748b);flex:0 0 auto}
.mms-qr-side{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
.mms-qr-side strong{font-size:13px}
.mms-muted{color:var(--theme-muted-text,#64748b);font-size:12px;margin:0}
/* Song background: an immersive MV layer inside ECHO's lyrics page. It is a
   later sibling of the app's .lyrics-backdrop (which is isolation:isolate +
   contain:paint, so a z-index:-1 layer would never be visible); equal z-index
   with later DOM order paints over the app's gradient, and .lyrics-left-panel
   (z-index 7) keeps every lyric line above the video.

   Visibility mirrors ECHO-main's own MV wrapper (.lyrics-mv-background): the
   community renders it only once a playable URL exists and keys the backdrop
   hand-over on its *presence* — .lyrics-page:has(.lyrics-mv-background)
   .lyrics-backdrop { background: transparent } — never on a playback state.
   Gating the layer on "is it playing yet" is what left an MV that was still
   buffering (or whose state label had been restored by an expiring notice)
   invisible until the player-bar switch was toggled by hand. data-source="ready"
   means "this layer owns a stream URL"; the video paints itself as soon as it has
   frames. */
.mms-lyrics-bg{--mms-immersive-blur:0px;--mms-immersive-brightness:100%;--mms-immersive-overlay:0;position:absolute;inset:0;z-index:0;overflow:hidden;background:#101820;cursor:grab;touch-action:none;opacity:0;transition:opacity .35s ease}
.mms-lyrics-bg[data-source="ready"]{opacity:1}
.mms-lyrics-bg[data-dragging="true"]{cursor:grabbing}
.mms-lyrics-bg::after{position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,11,16,.72),rgba(8,11,16,.42) 48%,rgba(8,11,16,.62)),linear-gradient(180deg,rgba(8,11,16,.22),rgba(8,11,16,.68));content:"";opacity:var(--mms-immersive-overlay);pointer-events:none}
/* Size / fitting / zoom / position of the MV: the box is centred and the video
   fills it according to the chosen fitting, exactly like background-size +
   object-fit. X/Y pan the picture (and are the zoom origin), Z is the zoom. */
.mms-backdrop-video{position:absolute;left:50%;top:50%;width:var(--mms-immersive-width,100%);height:var(--mms-immersive-height,100%);border:0;object-fit:var(--mms-immersive-fit,cover);object-position:var(--mms-immersive-position-x,50%) var(--mms-immersive-position-y,50%);transform:translate(-50%,-50%) translateZ(0) scale(var(--mms-immersive-scale,1.15));transform-origin:var(--mms-immersive-position-x,50%) var(--mms-immersive-position-y,50%);transition:transform 180ms cubic-bezier(.2,0,.2,1);filter:blur(var(--mms-immersive-blur)) saturate(1.05) brightness(var(--mms-immersive-brightness));backface-visibility:hidden;will-change:transform;pointer-events:none}
/* The fit preset list; the raw value lives on the layer as data-fit. */
/* ECHO-main floors the dark-theme overlay so lyrics stay readable. */
html[data-theme="dark"] .mms-lyrics-bg::after{opacity:max(var(--mms-immersive-overlay),.42)}
/* The app's own backdrop steps aside as soon as the layer owns a stream — the
   same "presence, not playback" rule ECHO-main uses — so the cover wallpaper comes
   back only when there is nothing to show. */
.lyrics-page:has(> .mms-lyrics-bg[data-source="ready"]) > .lyrics-backdrop{background:transparent}
.lyrics-page:has(> .mms-lyrics-bg[data-source="ready"]) > .lyrics-backdrop::before,
.lyrics-page:has(> .mms-lyrics-bg[data-source="ready"]) > .lyrics-backdrop::after,
.lyrics-page:has(> .mms-lyrics-bg[data-source="ready"]) > .lyrics-backdrop > .lyrics-backdrop-source{opacity:0}
/* mvLyricsReadabilityEnhanced — ECHO-main's stronger readability block. */
.mms-lyrics-bg[data-readability="true"] ~ .lyrics-left-panel .lyrics-line,
.mms-lyrics-bg[data-readability="true"] ~ .lyrics-left-panel .lyrics-line[data-active="true"]{color:var(--lyrics-readable-color,#fff);text-shadow:0 2px 18px rgba(0,0,0,.62),0 1px 2px rgba(0,0,0,.52);-webkit-text-stroke:.012em rgba(0,0,0,.48);paint-order:stroke fill}
/* mvHideLyrics — hides the lyric column while the MV background is playing. */
html[data-mms-hide-lyrics="true"] .lyrics-page .lyrics-scroll{display:none}
html[data-mms-hide-lyrics="true"] .lyrics-page .lyrics-left-panel::after{content:"♪";position:absolute;inset:0;display:grid;place-items:center;font-size:64px;color:rgba(255,255,255,.2);pointer-events:none}
.mms-backdrop-toggle{position:relative;display:inline-flex!important;align-items:center;justify-content:center}
/* The transport MV button is lit (accent colour + a filled dot + the transport
   underline ECHO draws from .is-soft-active / aria-pressed) ONLY while the song
   detail page is showing an MV that is really on screen. Everywhere else — another
   page, a match still resolving, a track without a match — it is dimmed, so the
   light means "there is an MV to watch" and a dim press means "bring it up". The
   repeated class and !important are needed to outrank ECHO's own
   .transport-media-button colour rule, which is itself !important. */
html .player-bar .transport .mms-backdrop-toggle.mms-backdrop-toggle[data-active="false"]{color:color-mix(in srgb,var(--theme-muted-text,#64748b) 74%,transparent)!important;opacity:.66}
html .player-bar .transport .mms-backdrop-toggle.mms-backdrop-toggle[data-active="true"]{color:var(--theme-accent-text-strong,var(--theme-accent-solid-bg,#4b55e8))!important;opacity:1}
.mms-backdrop-toggle:after{position:absolute;top:3px;right:3px;width:5px;height:5px;border-radius:50%;background:currentColor;content:"";opacity:0;transition:opacity .18s ease}
html .player-bar .transport .mms-backdrop-toggle.mms-backdrop-toggle[data-active="true"]:after{opacity:1}
/* Status pill for the background match/resolution. It sits next to the
   video layer (the layer itself is transparent until it plays). */
.mms-backdrop-status{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:22;display:none;flex-direction:column;gap:6px;min-width:220px;max-width:min(520px,70%);padding:9px 14px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:12px;background:rgba(12,16,22,.78);color:#eef4fc;font:12px/1.4 -apple-system,system-ui,"Segoe UI",sans-serif;pointer-events:none;backdrop-filter:blur(6px)}
.mms-backdrop-status[data-visible="true"]{display:flex}
.mms-backdrop-status[data-state="error"]{border-color:rgba(239,68,68,.6)}
.mms-backdrop-status-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Background settings page */
.mms-background{display:flex;flex-direction:column;gap:14px}
.mms-bg-section{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:14px;background:var(--theme-panel-bg,transparent)}
.mms-bg-title{margin:0;font-size:14px;font-weight:650}
.mms-bg-status{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.mms-bg-card{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:12px;min-width:0}
.mms-bg-card[data-state="ok"]{border-color:color-mix(in srgb,var(--theme-accent-solid-bg,#4b55e8) 42%,transparent)}
.mms-bg-card[data-state="warn"]{border-color:rgba(245,158,11,.5)}
.mms-bg-card[data-state="missing"]{border-color:rgba(239,68,68,.5)}
.mms-bg-card strong{font-size:12px}
.mms-bg-card small{font-size:11px;word-break:break-all}
.mms-bg-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:6px 0;border-top:1px solid var(--theme-panel-border,#d8dee9)}
.mms-bg-row:first-of-type{border-top:0}
.mms-bg-row-main{display:flex;flex-direction:column;gap:1px;min-width:0}
.mms-bg-row-main strong{font-size:12px;font-weight:600}
.mms-bg-row-main small{font-size:11px}
.mms-bg-row .mms-select{min-width:190px}
.mms-bg-row .mms-search-input{max-width:280px}
.mms-bg-slider{display:flex;align-items:center;gap:8px;min-width:230px}
.mms-bg-slider input[type="range"]{flex:1 1 auto;min-width:70px;accent-color:var(--theme-accent-solid-bg,#4b55e8)}
.mms-bg-number{flex:0 0 auto;width:5.2em;padding:4px 6px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:7px;background:var(--theme-field-bg,transparent);color:inherit;font-size:11px;font-variant-numeric:tabular-nums;text-align:right}
.mms-bg-slider output{min-width:3.2em;text-align:right;font-size:11px;color:var(--theme-muted-text,#64748b);font-variant-numeric:tabular-nums}
.mms-switch{display:inline-flex;align-items:center;cursor:pointer;flex:0 0 auto}
/* ECHO's own switch shape (see .toggle-btn): a 40x22 track with a round knob,
   drawn from theme tokens so it reads as a native control in every theme. */
.mms-switch input{appearance:none;-webkit-appearance:none;position:relative;width:40px;height:22px;margin:0;border:1px solid var(--theme-button-border,var(--theme-panel-border,#d8dee9));border-radius:999px;background:var(--theme-control-bg,rgba(127,127,127,.22));cursor:pointer;transition:background-color .16s ease,border-color .16s ease}
.mms-switch input:after{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--theme-heading-text,#fff);box-shadow:0 1px 2px rgba(0,0,0,.25);content:"";transition:transform .16s ease}
.mms-switch input:checked{background:var(--theme-accent-solid-bg,#4b55e8);border-color:transparent}
.mms-switch input:checked:after{transform:translateX(18px);background:#fff}
.mms-switch input:focus-visible{outline:2px solid var(--theme-accent-border,var(--theme-accent-solid-bg,#4b55e8));outline-offset:2px}
.mms-bg-candidates{display:flex;flex-direction:column;gap:4px;margin-top:4px}
.mms-bg-candidate{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px;border-radius:9px;background:var(--theme-list-row-bg-hover,rgba(127,127,127,.08))}
.mms-bg-candidate[data-chosen="true"]{box-shadow:inset 0 0 0 1px var(--theme-accent-solid-bg,#4b55e8)}
.mms-bg-candidate[data-current="true"]{background:color-mix(in srgb,var(--theme-accent-solid-bg,#4b55e8) 18%,transparent)}
.mms-bg-candidate-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto}
.mms-bg-candidate-main strong{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mms-bg-candidate-main small{font-size:11px;color:var(--theme-muted-text,#64748b)}
.mms-bg-candidate-cover{width:72px;aspect-ratio:16 / 9;border-radius:6px;object-fit:cover;background:rgba(127,127,127,.14);flex:0 0 auto}
.mms-bg-candidate-quality{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.mms-bg-candidate-quality .mms-select{min-width:150px;max-width:100%}
.mms-bg-offset{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mms-bg-offset .mms-search-input{flex:1 1 220px;min-width:0;max-width:none}
.mms-bg-offset-value{min-width:4.2em;text-align:center;font-variant-numeric:tabular-nums;color:var(--theme-muted-text,#64748b);font-size:11px}
/* Lyrics-page MV panel: the actions ECHO-main's MvPanel exposes, on the lyrics page.
   It sits at the bottom-left of the page, fixed — there is nothing to drag or to
   remember — and stops ABOVE the player bar: the page is a stacking context of its
   own that paints below .player-bar, so a child anchored 18px off the page bottom
   had its lower half covered by the transport (and was unclickable there). The
   bar's measured height lives in --mms-chrome-bottom. The whole header toggles the
   body and the ⚙ (optional, see mvShowSettingsButton) opens the settings drawer. */
.mms-mv-panel{position:absolute;left:16px;bottom:calc(var(--mms-chrome-bottom,0px) + 18px);z-index:24;display:flex;flex-direction:column;gap:6px;max-width:min(460px,64%);padding:8px 10px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:12px;background:rgba(12,16,22,.82);color:#eef4fc;font:12px/1.4 -apple-system,system-ui,"Segoe UI",sans-serif;backdrop-filter:blur(6px)}
.mms-mv-panel-head{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.mms-mv-panel-head-actions{flex:1 1 auto}
.mms-mv-panel-title{font-weight:600;font-size:11px;letter-spacing:.02em;text-transform:uppercase;opacity:.85;white-space:nowrap}
.mms-mv-panel-action{border:1px solid rgba(255,255,255,.22);border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:11px;padding:2px 7px;white-space:nowrap}
.mms-mv-panel-action:hover{background:rgba(255,255,255,.12)}
.mms-mv-panel[data-open="false"] .mms-mv-panel-body{display:none}
.mms-mv-panel-body{display:flex;flex-direction:column;gap:6px}
.mms-mv-panel-body small{color:rgba(238,244,252,.72);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mms-mv-panel-actions{display:flex;flex-wrap:wrap;gap:4px}
.mms-mv-panel-actions .mms-ghost{padding:4px 8px;font-size:11px;border-color:rgba(255,255,255,.24);color:inherit}
.mms-mv-panel[data-state="error"]{border-color:rgba(239,68,68,.6)}
/* Full MV settings drawer on the right edge of the lyrics page: the same
   content as the sidebar's background page, usable while the MV plays.
   It starts BELOW ECHO's titlebar on purpose: .page-surface (and therefore
   .lyrics-page) spans the whole window while .app-titlebar is its own stacking
   context above it, so a full-height drawer had its header — including the
   "收起" button — painted over by the app's window controls in the top-right
   corner, and the clicks landed on those buttons instead. --mms-drawer-top is
   measured from the live titlebar; the theme token is only the fallback, and the
   same applies to the player bar at the bottom (--mms-chrome-bottom), so the
   drawer's lowest controls stay clickable.
   It is anchored to the right edge and slides in from there (transform only). */
.mms-mv-drawer{position:absolute;right:0;top:var(--mms-drawer-top,var(--titlebar-height,44px));bottom:calc(var(--mms-chrome-bottom,0px) + 10px);z-index:32;display:flex;flex-direction:column;width:min(430px,94%);max-height:calc(100% - 24px);border:1px solid var(--theme-panel-border,#d8dee9);border-radius:14px 0 0 14px;background:rgba(10,13,18,.95);color:var(--theme-text,#eef4fc);font:12px/1.5 -apple-system,system-ui,"Segoe UI",sans-serif;box-shadow:-18px 0 42px rgba(0,0,0,.34);backdrop-filter:blur(12px);-webkit-app-region:no-drag;transform:translateX(102%);transition:transform .26s cubic-bezier(.2,0,.2,1);visibility:hidden}
.mms-mv-drawer[data-open="true"]{transform:none;visibility:visible}
.mms-mv-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--theme-panel-border,#d8dee9)}
.mms-mv-drawer-title{font-size:13px;font-weight:650}
.mms-mv-drawer-body{flex:1 1 auto;overflow:auto;padding:10px 12px 26px;overscroll-behavior:contain}
.mms-mv-drawer-body .mms-background{padding:0}
.mms-mv-drawer-body .mms-bg-row{gap:10px}
.mms-mv-drawer-body .mms-bg-row .mms-select{min-width:150px}
.mms-mv-drawer-body .mms-bg-row .mms-search-input{max-width:200px}
.mms-mv-drawer-body .mms-bg-slider{min-width:150px}
.mms-backdrop-status[data-state="notice"]{border-color:rgba(59,130,246,.6)}
.mms-menu{position:fixed;z-index:2147483000;min-width:190px;display:flex;flex-direction:column;gap:2px;padding:5px;border:1px solid var(--theme-panel-border,#d8dee9);border-radius:11px;background:var(--theme-panel-bg,#1f2430);box-shadow:0 12px 32px rgba(0,0,0,.32)}
.mms-menu-item{padding:7px 10px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer;font-size:12px}
.mms-menu-item:hover{background:var(--theme-list-row-bg-hover,rgba(127,127,127,.14))}
.mms-menu-item:disabled{opacity:.45;cursor:not-allowed}
.mms-blocked{padding:28px;text-align:center;color:var(--theme-muted-text,#64748b)}
/* The MV page is a settings page: cap the line length on ultrawide windows. */
.mms-root--mv{max-width:1180px}
@media (max-width:860px){.mms-row{grid-template-columns:22px 38px minmax(0,1fr) auto}.mms-row-quality,.mms-row-duration{display:none}}
/* Narrow window (ECHO hides its own transport buttons at 1180px): the platform
   chips become one dropdown and the toolbar keeps only icons, so the header does
   not stack into four rows on a mini-player-width window. */
@media (max-width:1180px){.mms-root{padding:14px 14px 28px}
.mms-header{align-items:flex-start}
.mms-quality-select{max-width:160px}}
@media (max-width:1100px){.mms-providers{display:none}
.mms-providers-select{display:block;width:100%;max-width:420px}
.mms-bg-row{flex-wrap:wrap}
.mms-bg-row .mms-select,.mms-bg-row .mms-search-input{min-width:0;max-width:100%}
.mms-bg-slider{min-width:0;flex:1 1 190px}}
@media (max-width:720px){.mms-accounts .mms-account{align-items:flex-start}
.mms-tools{width:100%;justify-content:flex-end}}
`;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/** Applies the current background settings to the live page. */
const applyBackdropMode = () => {
  if (!backdropEnabled()) {
    stopBackdrop();
    backdrop.node?.remove();
    backdrop.node = null;
    backdrop.video = null;
    backdrop.statusNode?.remove();
    backdrop.statusNode = null;
    backdrop.panel?.remove();
    backdrop.panel = null;
    backdrop.drawer?.remove();
    backdrop.drawer = null;
    setHideLyricsFlag(false);
    syncBackdropSyncTimer();
    syncPlayerToggle();
    return;
  }
  ensureBackdrop();
  ensureBackdropStatus();
  // The panel/drawer are anchored above the player bar, so its room is measured
  // before they are placed.
  syncBottomChrome();
  ensureBackdropPanel();
  ensureBackdropDrawer();
  applyBackdropStyle();
  updateBackdropStatus();
  startBackdropPolling();
  syncPlayerToggle();
  // Opening the song detail page is what triggers the match, so do not wait for
  // the first poll tick once the lyrics page is already on screen.
  if (lyricsPage()) void pollBackdrop();
};

/** Keeps the player-bar control and the lyrics layer in step with ECHO's DOM. */
const installBackdropObserver = () => {
  const refresh = () => {
    syncPlayerToggle();
    if (!backdropEnabled() || !lyricsPage()) {
      backdrop.pageVisible = false;
      return;
    }
    const generation = backdrop.generation;
    ensureBackdrop();
    applyBackdropStyle();
    // Entering the song detail page (or having the layer rebuilt underneath us)
    // starts the match right away instead of waiting for the next timer tick.
    const entered = !backdrop.pageVisible || backdrop.generation !== generation;
    backdrop.pageVisible = true;
    if (entered) {
      void pollBackdrop();
      // …and re-align the video that came with the page with the audio that is
      // playing now: entering the page must never show the previous song's MV
      // from wherever it happened to stop.
      const id = backdrop.trackId;
      if (backdropEnabled() && id && backdrop.video?.src) {
        void verifyBackdropTrack();
      }
    }
    syncPlayerToggle();
  };
  refresh();
  // A window resize changes the auto-scale ratio and the room the player bar
  // takes at the bottom of the page.
  const onResize = () => {
    if (backdropEnabled()) applyBackdropStyle();
    syncBottomChrome();
  };
  window.addEventListener('resize', onResize);
  if (typeof MutationObserver !== 'function') {
    // The supervisor timer still keeps everything in step on hosts without it.
    return () => window.removeEventListener('resize', onResize);
  }
  const observer = new MutationObserver(() => refresh());
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', onResize);
  };
};

const disposeCss = external.extend?.css?.('echo-mms-page', CSS);

const disposeSidebar = external.sidebar?.register({
  id: PAGE_ID,
  label: copy.title,
  icon: '♫',
  order: 60,
  render(root) {
    pageRoot = root;
    root.classList.add('mms-page');
    render();
  },
});

// 背景设置 is a page of its own: the audio page keeps only 我的歌单 / 搜索 / 账号,
// and this page stays reachable whether or not the background is switched on
// (the lyrics-page drawer disappears while it is off).
const disposeMvSidebar = external.sidebar?.register({
  id: `${PAGE_ID}-mv`,
  label: copy.mvPageTitle,
  icon: '🎬',
  order: 61,
  render(root) {
    backgroundPageRoot = root;
    root.classList.add('mms-page', 'mms-page--mv');
    renderBackgroundPage();
  },
});

void (async () => {
  // The remembered user configuration is laid over the package defaults before
  // anything is rendered, so the first MV of the session already uses the values
  // the user chose (see loadInstanceConfig).
  resolveStoredConfigRead();
  try {
    const status = await waitForBridge();
    if (status?.bridgeError) {
      state.readyError = status.bridgeError;
    }
    // …and main.cjs gets the same values, so the parts it resolves itself (the MV
    // request pipeline: quality, frame rate, engine settings) do too.
    await syncStoredConfigToMain();
    await loadProviders();
    await loadAccounts();
    await loadQrCapabilities();
    // The locally kept playlists are read before anything renders, so the 歌单
    // page can show them without going back to the platform.
    await loadPlaylistStore();
    state.ready = true;
  } catch (error) {
    state.readyError = error instanceof Error ? error.message : String(error);
    state.ready = true;
  }
  renderSoon();
})();

// The supervisor timer runs for the whole session so the background follows the
// current route without depending on a mutation landing at the right moment.
startBackdropPolling();
applyBackdropMode();
const disposeBackdropObserver = installBackdropObserver();

// React to loader appearance changes so the page keeps matching the theme.
const disposeSettingsWatch = external.loaderSettings?.onChange?.(() => renderSoon());

return () => {
  stopQrPolling();
  stopBackdropPolling();
  if (backdrop.wheelSaveTimer) clearTimeout(backdrop.wheelSaveTimer);
  if (backdrop.noticeTimer) clearTimeout(backdrop.noticeTimer);
  stopBackdrop();
  disposeBackdropObserver?.();
  backdrop.node?.remove();
  backdrop.node = null;
  backdrop.video = null;
  backdrop.statusNode?.remove();
  backdrop.statusNode = null;
  backdrop.panel?.remove();
  backdrop.panel = null;
  backdrop.drawer?.remove();
  backdrop.drawer = null;
  setHideLyricsFlag(false);
  document.querySelector(`.${PLAYER_TOGGLE_CLASS}`)?.remove();
  disposeSettingsWatch?.();
  disposeSidebar?.();
  disposeMvSidebar?.();
  disposeCss?.();
  pageRoot = null;
  backgroundPageRoot = null;
};
