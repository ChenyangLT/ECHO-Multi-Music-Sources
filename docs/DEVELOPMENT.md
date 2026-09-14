# ECHO 多平台音源 / ECHO Multi Music Sources

> **这份文档是开发与实现细节**（移植方式、踩过的坑、RPC 表、验证覆盖、源码补丁清单）。
> 安装与使用请看仓库根目录的 [README.md](../README.md)。
> 依赖的加载器是 [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader)。

把 **ECHO 社区版（ECHO Community）** 的在线音源移植到 **Steam 版 ECHO** 的 ShinawaseLoader 模组。

Steam 版本身把第三方音乐平台的能力裁掉了：`app.asar` 里仍然保留 `streaming:*` / `account:*` 的 IPC 通道名和
账号存储，但主进程不注册这些 handler、preload 里 `window.echo.streaming` 与 `window.echo.accounts` 都是
`null`。本模组把社区版里那套平台算法搬进模组自己的主进程，让 Steam 版重新拥有这些音源。

- 音源实现：**直接移植自 `ECHO-main/src/main/streaming`**（搜索、专辑、艺人、歌单、歌词、MV、播放地址解析）。
- 运行位置：模组主进程（`main.cjs` + `bridge/provider-bridge.cjs`）。
- 播放：通过 ShinawaseLoader 的 player runtime 交给 ECHO 真实播放器，队列、歌词、DSP、迷你播放器行为与本地歌曲一致。

## 支持的平台

| 平台 | 搜索 | 播放 | 歌词 | MV | 需要登录 |
| --- | :---: | :---: | :---: | :---: | --- |
| 网易云音乐 NetEase | ✅ | ✅ | ✅ | ✅ | 高音质 / VIP 曲目需要 |
| QQ 音乐 | ✅ | ✅ | ✅ | ✅ | 会员曲目需要 |
| 酷狗音乐 KuGou | ✅ | ✅ | ✅ | — | 部分曲目需要 |
| 哔哩哔哩 Bilibili | ✅ | ✅（原生音频流） | — | ✅ | 无需（登录可解锁更高码率） |
| YouTube | ✅ | ✅ | — | — | 部分内容需要 |
| SoundCloud | ✅ | ✅ | — | — | 部分内容需要 |
| Spotify | ✅ | ✅ | ✅ | — | 需要（见下） |
| TIDAL | ✅ | ✅ | — | — | 需要自己的开发者凭据 |
| Qobuz | ✅ | ✅ | — | — | 需要 |

> 哔哩哔哩的播放**只解析音频**（DASH 音频流，`x/player/wbi/playurl`），不再依赖 `yt-dlp.exe`；
> 视频只用于歌词页的背景 MV。
> Spotify / TIDAL / Qobuz 依赖 OAuth 登录或开发者凭据，模组内只提供 Cookie / 凭据入口，不会代替你在浏览器里完成授权。
> 其余平台的「灰色 / 不可播放」曲目会像社区版一样在解析失败时给出明确提示并自动降级音质。

## 安装

1. 安装 **ShinawaseLoader**（<https://github.com/ChunchunOwO/ShinawaseLoader>）：
   运行 `scripts\setup-modloader.ps1 install`，或在 Loader UI 里完成安装。
2. 把 `dist/echo.multi-music-sources-<version>.echomod` 拖进 Loader 的 **Mods** 页面（或放进 `Mods/` 放入口）。
   **从源码装则用 `cd build; npm run deploy`** —— 它直接把包写进 Loader 的 `Mods/installed/<id>/`，不必等 Loader 处理。
3. 在 Mods 页面启用 **ECHO 多平台音源**，重启 ECHO。
4. 左侧边栏会出现 **♪ 多平台音源** 页面。

网易云的增强客户端（`@neteasecloudmusicapienhanced/api`）是可选加速项：Loader 自带一份，
模组会把它所在的 `node_modules` 加进解析路径，缺失时网易云走公开接口，其他平台不受影响。
> **请让 Loader 进程保持运行**（正常安装流程下它本来就是常驻的）。模组界面需要它转发到主进程，原因见下方「部署时必须让 Loader 进程常驻」。

## 使用

- **搜索**：选择平台 → 输入关键词 → 回车。歌曲 / 专辑 / 艺人 / 歌单四个标签分别检索。
- **播放**：点行内 ▶，或 `播放全部`（替换队列并从第一首开始）。
- **加入队列**：点行内 `+`，或 `加入队列`（全部追加到当前队列）。
- **音质**：工具栏右侧选择，失败会自动降级（哔哩哔哩会自动依次尝试多档）。
- **账号**：`账号` 页面为每个平台粘贴 Cookie，或点 `扫码登录`
  （网易云、哔哩哔哩、QQ 音乐在页面里直接显示二维码；酷狗 / SoundCloud / osu! 会打开登录窗口，
  在窗口里用手机扫码即可）。登录成功后页面会显示**登录的账户信息**：头像、昵称、UID、VIP 标记、
  最后检测时间和错误原因。账号数据存在 ECHO 的 `%APPDATA%\ECHO Steam\accounts.json`，
  与 ECHO 本体共用（加密存储，见下）。
- **歌曲详情页 MV 背景**：默认开启。**点进歌曲详情页（歌词页）就会用「歌曲名 + 艺人 + MV」在哔哩哔哩搜索，
  取第一个视频**，显示在歌词后面，并**跟随歌曲播放进度**。播放栏右侧有一个开关按钮可以随时
  显示 / 关闭；侧栏页面里新增了专门的 **「背景设置」** 页。
- **背景视频怎么来**：**和社区版完全一致** —— 社区版 MV 引擎解析出视频流
  （`echo-mv://stream/<videoId>/<variantId>` / `echo-mv://ephemeral/<token>`），渲染进程把
  `mediaUrl` 直接交给 `<video>`，主进程的 `echo-mv://` handler 按社区 `videoProtocol.ts` 的方式
  带着该画质的 Referer / UA / Cookie 与渲染进程的 `Range` 转发 CDN 响应。**不下载、不缓存、不占磁盘。**
  只有引擎确实拿不到可播放视频流时，才回退到 B 站**渐进式完整 MP4**（`fnval=1` 的 durl 地址：
  一个完整文件、带真实时长、支持 Range）；之所以不用 DASH 地址，是因为那是**分段流**，
  `<video>` 播它只会拿到几秒钟的内容 —— 表现就是「背景反复循环前几秒、也跟不上歌曲」。
  引擎若给出的是这种分段流（`loadedmetadata` 报告的时长不足 60 秒且远短于歌曲），模组会**自动升级**
  到同一个视频的完整 MP4，不会退化成「循环前几秒」。
  两条路都不可用时保持主题背景，并在状态条说明原因。
- **背景交互**：在歌词页上**拖动**背景可调整画面位置，**Ctrl + 滚轮**缩放（与社区版一致，缩放会写回配置）。
- **账号**：扫码登录见上；背景解析会**自动使用已登录 B 站账号的 Cookie**，登录后可用更高画质。
- **我的歌单（账号歌单 / B 站收藏夹）**：左侧「多平台音源」→ **我的歌单**，
  登录后直接列出该账号自己的内容：网易云 / QQ 音乐的云歌单，以及 **B 站的收藏夹**、
  **订阅的收藏夹**与**稍后再看**（B 站这几项是模组自己加的：社区版没有账号收藏夹接口）。
  点封面即载入该歌单的曲目（B 站收藏夹里的视频按音频流播放），随后可以整列表播放或加入队列。
  **点开歌单只读取，不会自动保存**；从歌单明细点 `← 返回` 会回到「我的歌单」页（不是搜索页）。
- **通过链接导入歌单**：页面顶部的输入框粘贴**网易云 / QQ 音乐 / 酷狗 / Spotify 歌单链接**后点 `导入`，
  导入结果会作为歌单明细打开，可以直接播放或加入队列 —— 同样**不会自动保存**。
- **保存到本地（由用户决定）**：**只有点 `保存到本地` 才会把歌单写进这台机器**。
  账号歌单的卡片和明细页都有这个按钮（已保存时变成 `取消保存`），
  保存后卡面标 `本地已存 N 首`、明细页标 `来自本地保存`，之后打开**不再联网**（离线、平台限流时都能用）。
  链接导入并保存下来的歌单会出现在页面底部的 **「本地保存的歌单」** 分组里，不依赖账号。
  整份存档在 `%APPDATA%\ECHO Steam\echo-mms-playlists.json`（主进程 RPC `playlistStore*`），
  页面上的 `刷新` = 重新联网获取账号歌单列表，`清除本地歌单` = 清空这份存档（不影响平台账号）。
  账号歌单**列表本身**是自动缓存的（这正是「不用每次都重新获取」的实现），歌单内容才是可选的。
- **显示方式**：`图标`（大封面卡片）/ `列表`（封面 + 信息 + 按钮一行）/ `紧凑`（小封面单行）。
  选择写入配置（`playlistViewMode`），也可以在本体的配置弹窗里改。
- **每日推荐**：直接读取网易云账号的每日推荐并在模组页面里列出结果，可以整列表播放或加入队列。
  「我喜欢」不再需要单独的同步按钮 —— 它本来就是网易云账号歌单列表里的一项，在「我的歌单」里点开即可。

## 「背景设置」页面

侧栏「多平台音源」→ **背景设置**（和搜索 / 账号 / 每日推荐并列），里面能直接看到并调整全部背景行为：

- **状态**：**社区版 MV 引擎**是否可用（数据库路径 + 已登记曲目数）、当前 B 站账号（是否使用登录 Cookie）、
  `刷新状态`。
- **匹配**：匹配方式（**按名称取第一个视频** / 匹配度评分 / 播放量）、背景视频来源
  （**社区 MV 引擎** / B 站完整 MP4）、匹配度阈值、只用歌名搜索、自动搜索、预加载、
  **候选数量**（2–20，同时决定自动匹配取前几个和候选列表显示多少个）。
- **候选视频**：进入这一页就会自动为**当前播放的歌曲**取一次候选（第一个标为“已选中”、
  已绑定的标为“当前”），每行都有**视频封面**、`用这个`（把这首歌换成该视频并记住）、`预览`
  （只在歌词页试播，不改变绑定）、`在浏览器打开`。
- **当前 MV**：已解析的视频、**画质下拉框**（一档一个 `<select>` 选项，当前档选中；
  引擎只报 `auto` 或档位失效时回退到第一档）、`在浏览器打开`、逐曲偏移。
- **自定义视频链接**：粘贴 `BV 号` / `b23.tv 短链` / `B 站视频链接`（也支持 `av` 号与 YouTube 链接）
  后点 `绑定到当前歌曲`，这条绑定会**记在这首歌上并持久化**，下次播放同一首歌直接用它；
  页面会显示 `已绑定：…` 与 `清除绑定`。
  **点候选或绑定链接后都会 seek 一次到歌曲当前进度**，然后从同一时间点继续播放新视频。
- **画面**：沉浸式背景、**画面预设**（铺满 / 窄边 / 拉伸 / 原始尺寸 / 放大铺满 / 宽银幕 / 自动适配 / 自定义）、
  自动缩放、**画面宽度 / 高度**、**填充方式**（铺满裁切 / 窄边完整 / 拉伸 / 原始尺寸）、
  **缩放（Z）**、**水平位置（X）**、**垂直位置（Y）**、模糊、亮度、暗色遮罩、
  歌词可读性增强、MV 播放时隐藏歌词。歌词页上仍然可以**拖动**改 X/Y、**Ctrl + 滚轮**改 Z。
- **同步**：MV 跟随音乐进度、同步模式、切换后从头对齐、MV 最高画质、60fps。

歌词页底部还有一个状态条：匹配中 / 正在解析视频流 / 匹配失败原因 / 面板操作的确认（例如 `MV 偏移：0.5s`）
都会显示在那里（背景层本身在播放前是透明的，所以提示放在它外面）。

### 歌词页右下角：快捷面板 + 完整设置抽屉

歌词页（歌曲详情页）右下角有一个 **MV 面板**：**整条标题都可以点击**展开/收起，标题右侧的 `⚙ 设置`
直接打开**右侧完整设置抽屉**——抽屉里就是「背景设置」页的那一整套界面（画面预设、尺寸、填充、X-Y-Z、
候选视频、自定义链接、同步、画质、引擎状态），可以边看 MV 边调，`收起` 关闭。
抽屉**从标题栏下方开始**（`--mms-drawer-top` 按实测的标题栏高度写入），不会和右上角的窗口
最小化 / 最大化 / 关闭按钮重合，`收起` 一直点得到。

- 面板内的快捷操作：`重新匹配`、`-0.5s` / `+0.5s` / `偏移归零`、`隐藏歌词` / `显示歌词`、
  `⚙ 设置`、`在浏览器打开`、`关闭背景`。
- **任何操作都会在歌词页状态条上给出反馈**（例如偏移变化、重新匹配、失败原因），
  不会再出现「点了没反应」的情况。
- **从 ECHO 自带界面播放的歌曲同样有效**：模组会从播放状态里拿到当前曲目并自动登记给 MV 引擎，
  所以本机曲库 / 队列 / 电台播放时，歌词页一样会自动匹配 MV，面板按钮也都能用。

## MV 引擎是从社区版整段移植的

背景 MV 的**匹配、评分、画质档位、自动应用、逐曲偏移和沉浸式设置**不是模组自己写的，而是直接把
ECHO 社区版的 MV 子系统搬进 bridge（和音源一样的做法）：

```
bridge/provider-bridge.cjs
  ├─ ECHO-main/src/main/mv/MvService.ts          ← 社区版编排（原样编译）
  ├─ ECHO-main/src/main/mv/OnlineMvProviders.ts  ← Bilibili + YouTube provider
  ├─ ECHO-main/src/main/mv/LocalMvProvider.ts    ← 本地同名视频
  └─ ECHO-main/src/main/mv/MvScoring.ts          ← 匹配打分
        ▲
        │ 构建期只替换它依赖的守护进程模块（build/shims）
        ├─ database/LibraryDatabaseManager → node:sqlite 文件 + ECHO 的 track_videos 表结构
        ├─ library/LibraryService          → 正在播放的曲目登记表（getTrack）
        ├─ app/appSettings                 → mv* 读写 + 变更回传到模组配置
        └─ app/dataProtection              → 恒可用
```

因此这些行为与社区版逐字一致：`order=click` 之上的候选排序与 `mvAutoApplyThreshold`
（`preferHighestViewCount` 开启时阈值不参与筛选）、`bilibiliQualityOrder` 画质阶梯与 60fps 过滤、
`MvScoring` 的标题/艺人/专辑打分、`±600000ms` 逐曲偏移、以及全部沉浸式背景设置。
**获取方式也和社区版一样**：`searchNetworkCandidates(ForSnapshot)` → `selectVideo` 解析出视频流 →
`mediaUrl` 直接交给 `<video>`；社区版没有 BBDown 之类的下载步骤，模组这一版也没有。

主进程暴露的 MV RPC（`mvIpc` 的完整对应）：

| 方法 | 对应社区版 IPC |
| --- | --- |
| `mvEngineStatus` | （新增）引擎/数据库/曲目登记状态 |
| `mvGetSettings` / `mvSetSettings` | `MvGetSettings` / `MvSetSettings` |
| `mvGetSelected` | `MvGetSelected` |
| `mvFindLocalCandidates` | `MvFindLocalCandidates` |
| `mvSearchNetworkCandidates` | `MvSearchNetworkCandidates` |
| `mvSearchNetworkCandidatesForSnapshot` | `MvSearchNetworkCandidatesForSnapshot` |
| `mvGetTemporaryPlayableForSnapshot` | `MvGetTemporaryPlayableForSnapshot` |
| `mvGetCandidates` | `MvGetCandidates` |
| `mvResolveStreams` | `MvResolveStreams` |
| `mvSetQuality` / `mvSetOffset` | `MvSetQuality` / `MvSetOffset` |
| `mvBindLocalVideo` / `mvBindUrl` | `MvBindLocalVideo` / `MvBindUrl` |
| `mvSelectVideo` / `mvClearSelected` | `MvSelectVideo` / `MvClearSelected` |
| `mvOpenExternal` / `mvChooseLocalVideo` | `MvOpenExternal` / `MvChooseLocalVideo` |
| `mvResolveMediaUrl` | （新增）把 `echo-mv://` / `echo-video://` 解析成回环 URL（自定义协议不可用时的备用通道） |
| `mvServeLocalFile` | （新增）把绑定的本地视频送进回环代理 |
| `rememberTrack` | （新增）把正在播放的曲目登记给引擎 |

界面也按社区版的 `MvSettingsDrawer` / `MvPanel` 复刻（原生 DOM 实现，React 组件不能原样搬）：

- **背景设置 → 社区版 MV 引擎**：引擎状态与数据库路径、`用引擎搜索候选`（候选列表带
  匹配度 / 播放量 / 时长 / 理由）、`应用`（引擎解析并播放）、画质档位按钮、逐曲偏移
  （±0.5s / 归零）、`选择本地视频`、`绑定视频链接`、`清除绑定`、`复制诊断信息`。
- **歌词页 MV 面板**（右下角，可折叠）：当前匹配的 MV 标题/UP 主、`重新匹配`、`-0.5s` / `+0.5s` /
  `偏移归零`、`隐藏歌词` / `显示歌词`、`在浏览器打开`、`关闭背景`。
- 所有设置写入都会同步到引擎（`mvSetSettings`）并保存到 Loader 的 `config.json`
  （`echoExternalMod.settings.set`），重启后保留。

## 歌曲背景是怎么实现的

```
歌词页 (.lyrics-page)
  ├─ .lyrics-backdrop            ← ECHO 自己的主题/封面背景
  ├─ .mms-lyrics-bg              ← 模组注入，紧跟 backdrop 之后
  │    └─ <video>                ← src = 社区版给的那条流（echo-mv://…，失败时回退 http://127.0.0.1:<port>/<token>）
  └─ .mms-backdrop-status        ← 匹配 / 解析 / 报错提示
     .lyrics-left-panel (z-index 7)  ← 歌词文字保持在视频之上
```

Steam 版的 `.lyrics-backdrop` 带 `isolation:isolate` + `contain:paint`，
所以「插到 backdrop 之前 / 用 z-index:-1」的视频层永远看不见。
模组把背景层插到 **backdrop 之后**（同 z-index 时后出现的元素在上），
并在视频真正播放时把 ECHO 自己的背景渐变让位（`:has()` 选择器），
歌词所在的 `.lyrics-left-panel` 是 z-index 7，仍然压在视频之上。

视频地址就是社区版 `MvService` 生成的 `mediaUrl`：

- `echo-mv://stream/<videoId>/<variantId>`（选中并持久化的画质）、`echo-mv://ephemeral/<token>`（临时解析）、
  `echo-video://mv/<videoId>`（绑定的本地文件）。ECHO Steam 的 `protocol.registerSchemesAsPrivileged`
  名单里本来就有 `echo-mv` / `echo-video`（`standard + secure + supportFetchAPI + stream`），只是没有 handler，
  于是模组按社区版 `src/main/protocol/videoProtocol.ts` 注册了同名的 handler：取该 variant 的
  headers（Referer / UA / Cookie）、把渲染进程的 `Range` 一并转发、把 CDN 的
  `Content-Type / Content-Length / Content-Range / Accept-Ranges` 原样回传。
- 如果这台机器上自定义协议不可用（handler 注册失败、上游 CDN 拒绝等），同一条变体流还可以走
  模组的回环 HTTP 代理（`http://127.0.0.1:<随机端口>/<一次性 token>`）：用 `node:https` 带着同一套
  headers 转发，并补上 `Accept-Ranges: bytes`（部分 B 站节点返回 206 却不申明该能力，
  渲染进程会因此判定不可拖动）。渲染进程永远不直接碰 CDN，也就没有防盗链和跨域问题。
- 持久化的 `echo-mv://stream/…` 地址会过期（B 站 URL 有时效）：handler 在 CDN 拒绝时会像社区版
  `videoProtocol.ts` 一样调用 `refreshStreamVariantForProtocol` **重新解析一次**再重试。

### MV 与歌曲进度对齐（两个移植期 bug）

「MV 跟随音乐进度」（`mvRestartAudioOnLoad`，社区版默认关、模组默认开）就是社区版那套 400ms 漂移校正。
移植时有两点与原实现不一致，表现都是**背景卡在前几秒反复循环、无法向后播放**：

1. **位置字段读错**：Loader 播放运行时的 `player.status()` 给的是 `positionSeconds` / `durationSeconds`
   （社区版旧构建用 `positionMs`，参考实现写成 `playerStatus?.positionMs || positionSeconds * 1000` 两者都认）。
   模组原来只读 `positionMs` → 目标时间恒为 0 → 每 400ms 把视频 seek 回 0。
   现在两者都读，并且**读不到位置时完全不动视频**（绝不把「读不到」当成 0）。
2. **漂移符号反了**：社区版 `drift = target - currentTime`（正值 = MV 落后 → 加速追上），
   移植时写成了 `currentTime - target`，倍速微调会把视频推得更远。现在与社区版一致，
   并补上社区版的容差带（`|drift| <= tolerance` 时恢复 1×）。

`verify-renderer` 用真实 `positionSeconds` 状态、不可读状态和两个漂移方向把这四点全部钉住了
（跟随到 149.13s、不可读时不动、落后 1s → 1.12×、超前 1s → 0.88×）。

### 首次进入歌曲详情页背景空白（第三个移植期 bug）

表现为：**第一次**点进歌曲详情页时背景是空的（状态条说已经匹配上，画面却没有），
把播放栏那颗 MV 开关**关掉再打开**就正常了。

原因是**注入的背景层被 ECHO 丢掉之后匹配状态没有跟着重置**。ECHO 会重绘歌词页 —— 歌词到达、
视图切换都够 —— React 重绘时把模组插进 `.lyrics-page` 的 `.mms-lyrics-bg`（连同里面那个持有
`echo-mv://` 地址的 `<video>`）一起移除。模组下一次 `ensureBackdrop()` 会**新建**一个空层，但
`backdrop.trackId` 还留着刚才那首歌的 id，于是监督定时器认为「这首歌已经匹配过了」，
再也不会往里塞视频 —— 层是空的（`data-state="idle"` → 透明），而开关关/开会把 `trackId` 清掉，
所以手动开关一次就好了。

现在：

1. `ensureBackdrop()` 在**重建层**时调用 `resetBackdropMatch()`（清掉 `trackId` / 播放状态 /
   匹配结果），新建的层一定会重新匹配；
2. 层是否可用不只看节点，还要看**那个 `<video>` 是否仍在这个节点里**（`video.parentNode === node`），
   被 React 丢掉的视频会被重建；
3. 监督定时器额外判断「层里到底有没有视频地址」：`trackId` 相同但 `<video>` 没有 `src` 时同样重新加载；
4. `MutationObserver` 只在**刚进入歌词页**或**层刚被重建**时立刻触发一次匹配
   （`backdrop.generation` / `pageVisible`），不用等下一个 2 秒 tick；同时用 `backdrop.loading`
   防止重复请求。

`verify-renderer` 覆盖了「层被重建后自动重新匹配」与「失败后自动重试」两种回归。

### 视频流没开始播放就宣称 playing（第四个移植期 bug，1.11.0）

上面四条修完之后，仍然有一种「点进详情页 MV 不加载、要手动开关一次播放栏开关」的情况：
**视频流本身没有开始播放**（CDN 请求卡住、`echo-mv://` 变体过期而协议 handler 没能刷新成功）。

两个原因叠在一起：

1. `playBackdropSource()` 在把 URL 交给 `<video>` 之后**立刻** `setBackdropMessage('playing', …)`，
   于是背景层马上变成不透明 —— 但画面还没有任何一帧，用户看到的是一块黑（看起来就是「MV 没加载」）；
2. `pollBackdrop()` 判断「这首歌是否已经匹配过」时只看 `<video>` **有没有 `src`**。src 一旦设上，
   即使视频从没开始播放，监督定时器也不会再试 —— 只有手动开关（会 `stopBackdrop()` 清掉 src）
   才会重新走一遍。

现在：

1. 交给 `<video>` 之后状态是 `loading`（状态条写「MV 已匹配：…（正在加载视频流…）」），
   **背景层仍然透明**，露出 ECHO 自己的封面 / 主题背景；只有 `<video>` 自己的 `playing` 事件
   才会把层点亮（`data-state="playing"`）。所以「没播起来」永远不会伪装成「正在播」。
2. 新增**卡住看门狗**：`backdrop.startedAt` 记录把 URL 交给视频的时刻，每次 poll 里
   - 还没 `playing` 且视频是 paused → 先轻轻 `play()` 一下；
   - 超过 `BACKDROP_STALL_MS`（7s）仍然没开始 → 依次升级到 `backdrop.retry` 的下一档
     （回环代理 → 完整 MP4），两次之后**重新为这首歌取一遍视频**；
   - `<video>` 的事件都带归属判断（`backdrop.video !== video` 直接返回），
     被重建/卸载的旧视频不会误报新层。

`verify-renderer` 用一个「`play()` 永不触发 `playing`」的桩覆盖了这两点：
层保持 `loading`、状态条显示「正在加载」、并且在 20 秒内自动走到了 `mvResolveMediaUrl`（重试档位）。

### MV 在播放却不显示 / 一闪而过变全白（1.13.0）

症状：进歌曲详情页背景一片空白；把主窗口关掉再打开时 MV **一闪而过**，随后又变回全白背景 ——
MV 确实在加载、也确实在播，但没画在背景上，必须手动开关一次播放栏的 MV 开关。

1.11.0 把「层是否显示」挂在状态标签上（CSS 里 `[data-state="playing"]` 才不透明），
而 `showBackdropNotice()` 会在 **4.2 秒后把它当初记住的旧标签写回去**：

```js
backdrop.noticePrevious = { state: backdrop.state, ... };   // 记下「loading」
... 4.2s 后 ...
setBackdropMessage(previous.state, ...)                     // 把 loading 写回去
```

提示条如果是在**视频还在缓冲时**弹出的（偏移 / 画质 / 匹配确认都会弹），那一刻它就把已经在播放的视频
降级成 `loading` —— 层立刻变透明，`.lyrics-page:has(> .mms-lyrics-bg[data-state="playing"])`
也不再命中，ECHO 自己的白色 backdrop 重新露出来。手动开关会重建整层并重新走一遍流程，所以看起来「开关一次就好」。

现在：

1. **显示与标签解耦**：层由视频自身的 `data-playing` 点亮（`playing` 事件设置、`timeupdate` 复核、
   `emptied` / 重建 / `stopBackdrop` 清除），CSS 的透明规则也改用 `[data-playing="true"]`；
2. **提示条过期不降级**：`backdrop.ready`（视频真的在播）时恢复成 `playing` + 匹配标题，
   而不是那个记下来的旧标签；
3. **每轮轮询自愈**：视频 `!paused && readyState >= 2` 却标记丢了 → 补回 `data-playing` 与 `playing`
   标签；注入层被 ECHO 重绘挤出 `.lyrics-page`（`parentNode` 不对）→ 重新建层并重新匹配。

`verify-renderer` 覆盖：缓冲中弹出的提示条过期后视频仍然 `playing` / `data-playing="true"`、
被改掉的显示标记会在一个轮询周期内自愈、以及既有的「卡住的流会自动重试」。
另外把 DOM 桩的 `<video>` 变得更接近规范（`play()` 置 `readyState=4`、`load()` 重置 `paused`/`readyState`），
否则「卡住」和「在播」在桩里无法区分。

### 偏移按钮点了没反应 / 拉条不能输入数值（1.12.0）

**偏移**：`engineSetOffset()` 只更新了 `state.mvOffset` 与数据库里的值，**没有更新
`backdrop.offsetMs`** —— 而 `alignBackdropToAudio()` 算目标时间用的是
`audioSeconds + backdrop.offsetMs / 1000`。于是状态条弹出「MV 偏移：0.5s」、值也确实存进了引擎，
**画面却一动不动**，看起来就是按钮坏了。现在 `engineSetOffset()` 会把新值写回 `backdrop.offsetMs`、
立刻强制对齐一次，并同步刷新歌词页面板与（打开着的）抽屉。

**按钮点不动**：监督定时器每 2 秒无条件执行 `renderBackdropPanelBody()`，而它开头就是
`body.replaceChildren()` —— 如果 mousedown 与 mouseup 之间正好撞上这次重建，**点击事件根本不会产生**
（click 要求按下与抬起在同一个元素上）。现在面板（和抽屉一样）带一个**内容签名**
（匹配标题 / UP 主 / BV 号 / 链接 / 当前偏移 / 是否隐藏歌词），签名没变就不重建；
`data-state` 这种纯属性改成原地更新（所以 4.2 秒的提示条不会再重建面板）。

**拉条加数值输入**：`bgSlider()` 现在每个拉条都配一个 `<input type="number">`，与拉条双向同步、
按范围夹紧、回车或失焦即写入（走同一套 `persistBackgroundSettings`）。配置弹窗里的
`rangeField()` 同样加了数值输入框，所以两边的拉条都能直接敲数字。

`verify-renderer` 覆盖：`+0.5s` 之后 `<video>.currentTime` 必须从 30.0 变成 30.5、
一个 poll tick 之后按钮还是同一个 DOM 节点、以及数值框输入 15 / 999（夹到 20）都写进了设置。

### 抽屉不认账号 / 刷新没反应（1.11.0）

重启游戏后，歌词页打开 **MV 背景设置**抽屉，B 站明明已登录却显示「未登录」，点 `刷新状态` 也像没反应。

原因是 `loadMvEngine()` 结束后只 `renderSoon()`（重绘侧栏页面），而抽屉的 body 只在
`openBackdropDrawer()` 与 `backdrop.drawerDirty` 时重建。抽屉如果先于引擎应答渲染，就会一直停在
「引擎不可用 / 未登录」那一帧，`刷新状态` 按钮虽然被点到、状态也确实重新取了，抽屉却不会更新。

现在：

1. `openBackdropDrawer()` 在 `state.mvEngine` 还没有值时立刻 `loadMvEngine()`；
2. `loadMvEngine()` 结束时，如果抽屉是打开的，顺手 `renderBackdropDrawerBody()` 重建它
   （用 `state.mvEngineLoading` 防重入，因为面板末尾在引擎不可用时会再次调用 `loadMvEngine()`）；
3. 引擎只报告「有 Cookie 但还没校验昵称」时，账号卡显示「已读取到 B 站 Cookie（还没校验昵称，点「刷新状态」）」，
   不再一口咬定「未登录」。

`verify-renderer` 覆盖：打开抽屉 → 改掉 `mvEngineStatus` 里的账号名 → 点 `刷新状态` →
抽屉里必须出现新的账号名。

### 歌词页「MV 背景设置」抽屉与窗口按钮重合

Steam 版里 `.page-surface`（也就是 `.lyrics-page`）跨整个窗口高度，而 `.app-titlebar` 是它**上面
另一套层叠上下文**（`z-index: 5`）。抽屉原来是 `top:0;bottom:0` 的满高元素，于是**抽屉头连同
`收起` 按钮被右上角的窗口按钮盖住**，点下去落到的是窗口按钮，抽屉也就收不起来。

现在抽屉从标题栏**下方**开始：CSS 用 `top: var(--mms-drawer-top, var(--titlebar-height, 44px))`，
而 `--mms-drawer-top` 由 `syncDrawerTop()` 按**实测**的 `.app-titlebar` 底边写入（全屏时标题栏为 0，
主题换高度也跟得上），并给抽屉加上 `-webkit-app-region: no-drag`。

### 「当前 MV」画质改成下拉框

社区 MV 引擎一档画质就是一个 variant，B 站可能报出六档（1080P60 / 1080P / 720P …）。
它们原来是一排 chip，`.mms-account-actions` 不换行，于是**超出卡片右边界**。
现在是一个 `<select>`（当前档选中，引擎只报 `auto` 或档位已失效时回退到第一档），
旁边保留 `在浏览器打开`；`.mms-account-actions` 也补了 `flex-wrap`。

候选列表（名称匹配候选与引擎候选）现在都显示**视频封面**（`thumbnailUrl`），
加载失败时回退到默认封面，一眼就能看出匹配错了没有。

### 背景设置与 ECHO 社区版一一对应

持久化的键名、默认值和取值范围都照搬社区版的 `mv*` 设置（旧配置里的 `songBackground*` 仍然兼容）：

| 设置 | 键 | 默认 | 范围 |
| --- | --- | --- | --- |
| 启用 MV 背景（= 播放栏开关） | `mvEnabled` | 开 | — |
| 自动搜索 / 预加载 | `mvAutoSearch` / `mvAutoPreload` | 开 | — |
| 只用歌曲名搜索 | `mvTitleOnlySearch` | 关（用「歌名 + 艺人」） | — |
| 搜索后缀 | `mvSearchSuffix` | `MV` | 任意文本 |
| 按播放量优先匹配 | `mvPreferHighestViewCount` | 开 | — |
| 自动应用匹配度 | `mvAutoApplyThreshold` | 0.7 | 0.3 – 1 |
| 沉浸式背景 / 自动缩放 | `mvImmersiveBackground` / `mvImmersiveBackgroundAutoScale` | 开 | — |
| 填充方式 | `mvImmersiveBackgroundFit` | `cover` | cover / contain / fill / none |
| 画面宽度 / 高度 | `mvImmersiveBackgroundWidthPercent` / `…HeightPercent` | 100% | 10 – 200 |
| 缩放（Z） | `mvImmersiveBackgroundScalePercent` | 115% | 70 – 220 |
| 水平 / 垂直位置（X / Y） | `mvImmersiveBackgroundOffsetXPercent` / `…YPercent` | 50% | 0 – 100 |
| 毛玻璃模糊 | `mvImmersiveBackgroundBlurPx` | 0 | 0 – 32 |
| 背景亮度 | `mvImmersiveBackgroundBrightnessPercent` | 100% | 60 – 140 |
| 暗色遮罩 | `mvImmersiveBackgroundOverlayOpacityPercent` | 0 | 0 – 100（深色主题最低 42%） |
| 歌词可读性增强 | `mvLyricsReadabilityEnhanced` | 关 | — |
| MV 播放时隐藏歌词 | `mvHideLyrics` | 关 | — |
| MV 跟随音乐进度 | `mvRestartAudioOnLoad` | 开（社区版为关） | — |
| 同步模式 | `mvSyncMode` | balanced | stable / balanced / precise |
| 切换 MV 后从头对齐 | `mvReplayAudioOnChange` | 开 | — |
| MV 最高画质 / 60fps | `mvMaxQuality` / `mvAllow60fps` | max / 开 | 720p – 2160p / max |
| **匹配方式** | `mvMatchMode` | `first`（B 站第一个视频） | first / score / views |
| **候选数量** | `mvCandidateLimit` | 8 | 2 – 20 |
| **背景视频来源** | `mvSourceMode` | `engine`（社区 MV 引擎，与社区版一致，不下载不缓存） | engine / progressive |

> 画面预设（`画面预设` 下拉）只是把「填充方式 + 宽/高 + 缩放 + X/Y + 自动缩放」写成一组值，
> 选完之后每一项都还能单独微调；预设与当前值不匹配时下拉显示「自定义」。
> 「铺满」= cover 100%×100% 1×，「窄边」= contain，「拉伸」= fill，「原始尺寸居中」= none，
> 「放大铺满」= cover + 1.15×，「宽银幕」= 宽 125% 高 100%，「自动适配」= 社区版的按画面比例缩放。

> 与社区版一致的细节：**「按播放量优先匹配」开启时匹配度阈值不参与筛选**（社区版默认如此，
> 只在 `mvMatchMode` 为 views/score 时生效）；自动缩放用的是社区版的
> `clamp(max(cover/contain), 1, 3.5)`，开启时会切成 `contain`；深色主题下遮罩最低 0.42；
> Ctrl + 滚轮每次 5%，停止 360ms 后写回；「MV 跟随音乐进度」打开后才启用社区版那套漂移校正。

> 默认的 `mvMatchMode: first` 不走社区版的“按播放量重排 + 阈值筛选”：它就是
> 「用歌曲名搜 B 站 → 取第一个结果」，与社区版的 `order=click` + 播放量排序不同，
> 这是有意为之（按播放量排会挑到热门但不相干的视频）。想回到社区版行为把匹配方式改成
> 「按播放量」或「按匹配度评分」即可。

> 背景只注入歌词页；其他页面不会出现视频。播放栏的开关状态会持久化到模组配置。


### 账号为什么一开始「未登录」

ECHO Steam 自己的账号文件 `%APPDATA%\ECHO Steam\accounts.json` 把密钥存在
`encryptedCookie` / `encryptedAccessToken` / `encryptedRefreshToken` 里，
用 Electron `safeStorage` 包成 `safe:<base64>`（没有系统加密时退化成 `plain:<base64>`）。
社区版的 `AccountService` 只认识明文 `cookie` 字段，于是**本体已经登录的账号在模组里显示为未登录**，
每日推荐会报「请先登录网易云」、我喜欢同步拿不到任何歌曲、高音质也用不上。

模组在构建期给 `AccountService` 打了一个补丁（`accounts-encrypted-store`）：
读的时候解开信封、写的时候重新加密，并且**不破坏本体的字段**（解不开的信封会原样保留，
`authInvalid` 等未知字段也会带过去，文件权限保持 0600）。如果模组进程恰好解不开信封
（例如换了 Electron 构建），会退回到 ECHO 本体在 `globalThis` 上暴露的账号读取器。

### 哔哩哔哩为什么只播音频

社区版的哔哩哔哩 provider 只用 `yt-dlp` 解析播放地址，而 Steam 版**不带 `yt-dlp.exe`**，
所以任何哔哩哔哩歌曲都会报 `spawn yt-dlp.exe ENOENT`。
补丁 `bilibili-native-audio-playback` 改成先用平台自己的接口（`x/web-interface/view` 拿 cid、
`x/web-interface/nav` 拿 WBI 密钥、`x/player/wbi/playurl` 拿 DASH 音频流，签名表与 MV provider 完全一致），
只有接口拒绝时才回退到 `yt-dlp`。同一个文件还补了搜索：未签名的 `search/type` 现在返回 412，
改为**优先 WBI 签名接口，其次 `search/all/v2` 聚合接口**，否则哔哩哔哩搜索一直是空的。

## 它是怎么工作的

```
渲染进程 (mod.js)
    │  echoExternalMod.main.invoke('search' | 'getAlbum' | 'resolvePlayback' | ...)
    ▼
主进程 (main.cjs)
    │  私有 RPC 命名空间，不污染 ECHO 的 IPC 通道
    ▼
bridge/provider-bridge.cjs          ← 由 ECHO-main 的社区版音源编译而成
    │  StreamingProviderRegistry + StreamingService（社区版编排：缓存 / 限流 / 音质降级）
    ▼
各平台 provider（netease / qqmusic / kugou / bilibili / youtube / soundcloud / spotify / tidal / qobuz）
```

播放路径上，模组会**包裹**（而不是替换）ShinawaseLoader 装好的
`globalThis.__shinawaseResolveStreamingPlayback`：

- 平台属于本模组（上表九个）→ 用社区版算法解析；
- 解析失败 → 自动回退到 Loader 自带音源；
- 其他 provider（`m3u8` 电台、`plugin` 插件音源等）→ 完全不拦截，原样交给 Loader。

这样 Loader 原有能力不会被削弱，模组停用后 `globalThis` 也会被还原。

## 从源码构建

```powershell
cd build
npm install            # 只需要一次
npm run release        # = build-provider-bridge + pack-echomod + deploy-echomod
```

产物：`dist/echo.multi-music-sources-<version>.echomod`，并会**直接装进游戏**（见下）。

其它脚本：

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 只重新编译 `mod/bridge/provider-bridge.cjs` |
| `npm run pack` | 只打包 `.echomod` |
| `npm run deploy` | 把 `dist/` 里最新的 `.echomod` 装进游戏（等价于 Loader 的导入） |
| `npm run audit` | 打印从入口可达的 ECHO 模块与外部依赖（用于确认没有把守护进程模块带进来） |
| `npm run check` | 检查产物里是否残留需要裁剪的守护进程模块 |

### `npm run deploy` 做了什么

ShinawaseLoader 真正加载的是**解包后的**目录：

```
<ECHO>/Mods/installed/<mod id>/        ← ECHO 实际读的就是这里
<ECHO>/Mods/*.echomod                  ← 拖进来由 Loader 自动导入（然后移到 Mods/.processed/）
```

`deploy-echomod.mjs` 把 Loader 的 `importPackage()` 走一遍：先备份当前已装版本到
`work/installed-backup-<旧版本>-<时间戳>/`，清空并重建 `Mods/installed/<id>/`，写入清单与全部文件，
再把每个文件**读回来和压缩包逐字节比对**（清单按版本比对），最后把 `.echomod` 也放进 `Mods/`，
这样正在运行的 Loader 会把同一版本登记进 `loader-state.json` 并通知 native host。

ECHO 的位置按这个顺序找：`$ECHO_MMS_ECHO_ROOT` → `%LOCALAPPDATA%\ShinawaseLoader\selection.json`
（Loader 自己记住的那个 ECHO.exe）→ 常见 Steam 库路径。装完**重启 ECHO** 才会加载新的 `main.cjs`。

`ECHO_MAIN_ROOT` 环境变量可以指向别处的社区版源码；默认使用仓库里的 `ECHO-main/`。

### 移植时做了哪些裁剪
社区版的 `StreamingService` 直接挂在 ECHO 的守护进程上：它要访问受保护的 SQLite 曲库、Electron 授权窗口、
本地文件扫描器和插件运行时。模组不能也不该加载这些，所以构建时把这些模块换成 `build/shims/` 下的等价实现：

| 被替换的模块 | 原因 | 替代实现 |
| --- | --- | --- |
| `app/appSettings` | 读 ECHO 的设置文件 | 由模组 config 注入的轻量设置对象 |
| `app/dataProtection` | 受保护曲库可用性门禁 | 恒可用 |
| `database/createDatabase`、`database/LibraryDatabaseManager`、`database/health` | `better-sqlite3` 原生模块 | 不可用桩 / 恒健康 |
| `streaming/StreamingCacheStore` | 把在线曲目写进受保护曲库 | **等价接口的内存实现**，社区版编排逻辑原样运行 |
| `streaming/providers/PluginStreamingProvider` | 经 `privateEntitlements → PluginService → LibraryService` 拖入整个曲库子系统 | 保留 provider 身份，但报告不可用 |
| `audio/PlaybackSessionStore` | `better-sqlite3` | 内存实现，只读 `echo-playback-session.json` |
| `library/artistImages/ArtistImageCacheService`、`library/workers/TsCoverExtractor` | `sharp` | 空实现 / 内置默认封面 |
| `library/KgmConverter` | `@clamber_l/crypto` wasm | 惰性桩 |
| `accounts/SpotifyAuthService`、`accounts/TidalAuthService` | 在模组里起 OAuth 回调服务器 | 明确抛错的桩（由账号 Cookie / 凭据入口替代） |

`library/PlaylistBackup`、`library/audioAnalysis/BpmAnalyzer`、`diagnostics/SoftMemoryJanitor` 同样被替换成 no-op。

这些改动只影响「模组主进程里那份社区版音源」，**不改动 ECHO 本体、不改动 `app.asar`**。
`npm run audit` 可以复核这一点：最终产物除了 `electron` 之外没有其它顶层 `require`。

### 构建期源码补丁

除了替换模块，`build/source-patches.mjs` 还会对社区版源码打几个**定向补丁**（同样不改磁盘上的
`ECHO-main/`，只在打包时生效）。每个补丁都要求锚点必须命中，否则构建直接失败，避免上游改动后补丁被静默丢弃：

| 补丁 | 原因 |
| --- | --- |
| `streaming-skip-stale-empty-search` | `search()` 会把过期的**空结果**直接返回并在后台刷新，于是平台限流一次就会让用户在整个缓存窗口内都看到「无结果」；空结果不再走这条捷径 |
| `qqmusic-legacy-search-primary` | `musicu.fcg` 现在对匿名桌面搜索长时间返回 `req_1.code 2001`（要求登录，实测 0/6 成功），而旧的 `client_search_cp` 稳定可用（6/6）；搜索改为优先走旧接口，失败再回退 `musicu.fcg` |
| `bilibili-mv-search-origin` | 搜索请求发往 `api.bilibili.com` 却带 `Origin: search.bilibili.com`，Electron 的 `net.fetch` 直接判失败（`net::ERR_FAILED`），MV 搜索永远为空；改为与请求同源的 `www.bilibili.com` |
| `bilibili-mv-search-primary-aggregate` | `search/type` 现在对普通客户端返回 HTTP 412（限流），而 `search/all/v2` 正常返回；聚合接口改为主路径，`search/type` 作为回退 |
| `bilibili-native-audio-playback` | Steam 版不带 `yt-dlp.exe`，社区版的哔哩哔哩解析因此必然失败（`spawn yt-dlp.exe ENOENT`）。改为用平台自己的 playurl/WBI 接口解析**纯音频** DASH 流，`yt-dlp` 只作最后回退；同时把哔哩哔哩搜索改成优先 WBI 签名 / 聚合接口（未签名接口 412 时仍有结果） |
| `accounts-encrypted-store` | ECHO Steam 把账号密钥加密存在 `encryptedCookie` 等字段里（`safe:` / `plain:` 信封），社区版 `AccountService` 只认明文 `cookie`，于是本体已登录的账号在模组里显示未登录、每日推荐与「我喜欢」不可用。补丁在两个方向翻译信封，并原样保留解不开的信封与本体的其它字段 |
| `network-fetch-cookie-headers` | 社区版网络助手优先用 **Electron `net.fetch`**（Chromium），而 Chromium 会把 `Cookie` 当作禁止设置的头丢掉：于是**所有需要登录的请求都变成匿名**——「我喜欢」导入 0 首、账号歌单报「无法读取网易云账号 ID」、B 站收藏夹返回未登录（在运行中的游戏里实测：同一个 Cookie，`fetch`/`node:https` 拿到 `account.id`，助手拿到 `account:null`）。补丁让**带 Cookie/Authorization 的请求改走 Node fetch**，其余请求仍走 Electron 网络栈（保留 ECHO 的代理与会话行为） |


## 验证

仓库自带四套验证脚本。在 `build/` 下运行：

```powershell
npm test                 # 依次跑下面三套
npm run verify:renderer  # 纯 Node + 内置 DOM 桩
npm run verify:electron  # Electron 43 主进程
npm run verify:mod       # Electron 43 主进程 + 模拟 Loader host
npm run verify:mv        # Electron 43 渲染进程：真实播放 echo-mv:// 流
npm run verify:archive   # 校验打包后的 .echomod
```

| 验证 | 覆盖内容 |
| --- | --- |
| `verify-renderer` | 在 DOM 桩里跑 `mod.js`：侧边栏注册、页面渲染、搜索流程、错误提示、播放/入队调用、右键菜单、清理函数。**RPC 响应按 Loader 真实的双层信封建模**；背景层插在 ECHO 自己的 backdrop 之后（堆叠顺序回归）、社区版沉浸式 CSS 变量、播放栏开关用的是不会在窄窗口被隐藏的 `transport-media-button`、每日推荐列表、**我的歌单页（账号歌单 + B 站收藏夹卡片、点开导入并列出曲目、网易云条目走 `webUrl` 而不是裸 id、本地保存后再次打开不联网、卡面标「本地已存」、同步「我喜欢」按钮已移除）**、账号信息（头像 / 昵称 / UID / VIP）、扫码面板、**社区版获取流程（快照搜索 → 播放 `echo-mv://` 流）、引擎无流时回退到完整 MP4、分段流自动升级到完整 MP4、跟随 `positionSeconds` 与漂移方向、候选列表、自定义链接绑定、切换后 seek 一次到歌曲进度、画面预设写回并作用到 CSS、歌词页 ⚙ 打开完整设置抽屉、从 ECHO 自带界面播放的曲目会被登记且面板按钮可用、层被重建后会自动重新匹配、首次匹配失败后会自动重试而无需手动开关 MV** |
| `verify-config-ui` | 用 DOM 桩跑 `mod/config-ui.js`：配置弹窗能渲染（含状态、平台、账号信息、背景面板、社区 MV 引擎面板、画面尺寸/填充/候选数量），没有 `undefined` 标签，扫码按钮会发起会话并显示二维码，`onSave` 保留全部 mv* 键且不再带下载器键 |
| `verify-electron` | 在 **Electron 43.3.0（与 ECHO 同版本）主进程**里加载 provider bridge：`require('electron')` 解析、`app.getPath('userData')`、账号存储、`music-metadata` 等运行时依赖、真实平台搜索/歌词/播放地址解析、**哔哩哔哩原生音频解析**、**裸歌单 id 会被规范成平台歌单链接**、**渐进式完整背景视频（时长/字节/Range）**、**社区版 MV 引擎**（node:sqlite 建库、快照搜索打分、临时播放解析、绑定/偏移/选中/画质持久化）、**确认没有加载任何原生守护进程模块** |
| `verify-mod` | 在 Electron 主进程里用模拟 Loader host 跑 `main.cjs`：全部 RPC 方法注册、搜索链路、播放解析的包裹与还原、provider 回退、账号档案 / 扫码能力 / mv 默认值、**下载器 RPC 已全部移除**、**`echo-mv://` handler 已注册**、**带 Cookie 的请求绕开 Electron `net.fetch`（用本地回显服务器断言 Cookie 真的送达，且无凭据请求仍走 net.fetch）**、**B 站收藏夹在未登录时给出明确原因**、**裸歌单 id 不再报 “Please enter a valid streaming playlist URL”**、**本地歌单存档（`playlistStore*`）写入 / 读回 / 清空**、**`mvBindUrl` 的链接归一化**、**`mvResolveMediaUrl` 的 Range 回环服务**，以及 **MV 引擎 RPC** |
| `verify-mv` | 在 **Electron 渲染进程**里把 `echo-mv` 按 ECHO 的方式注册为 privileged scheme，然后让真实的 `<video>` 元素直接播放社区版解析出来的 `echo-mv://` 地址：**能解出画面（640×480）、报告完整时长与可跳转范围（317.3s）、回环代理也返回同一份字节** —— 证明「不下载、直接播社区流」这条路在渲染进程里真的能用 |
| `verify:archive` | 解包 `.echomod` 并校验清单指向的文件、CRC、体积 |

Electron 二进制通过 `npm install --save-dev electron@43.3.0` 获取；若网络受限可设镜像：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
```

### 真机验证结果

已在 **ECHO Steam 26.9.10 / Electron 43.5.1 + ShinawaseLoader 1.6.7** 上完整跑通：

- 模组主进程激活：Loader 日志 `activated native package echo.multi-music-sources main=true`、`native host listening on 127.0.0.1:17863`
- 侧边栏出现「♫ 多平台音源」，页面渲染出 9 个平台的可用状态
- 页内搜索真实返回 30 条网易云结果
- 点击播放后 ECHO 播放状态为 `state: playing`，`currentTrackId: streaming:netease:210049`，`positionMs` 持续增长，`filePath` 为网易云 CDN 的真实 mp3 地址

### 部署时必须让 Loader 进程常驻

模组界面通过 Loader 的 HTTP 服务（默认 `127.0.0.1:17862`）转发到主进程：

```
mod.js  →  POST /api/native/call  →  Loader 服务  →  native host :17863  →  main.cjs
```

因此 **Loader 进程必须与游戏同时运行**。只启动 `ECHO.modded.exe` 时主进程侧照常工作（`native-host.cjs` 由打过补丁的 asar 直接加载），但模组页面会因为取不到 RPC 而显示「没有可用的音乐平台」。正常安装流程里 Loader 是常驻的（Loader UI / `start-echo-with-mods.cmd`），所以按官方流程安装即可。

排错：打开配置里的 `调试日志`，然后在 `ShinawaseLoader/Logs/loader.log` 里搜 `[echo.multi-music-sources]`。

## 目录结构

```
mod/                        模组包（打包进 .echomod 的内容）
  echo.mod.json             清单
  main.cjs                  主进程入口：RPC、设置、播放解析挂钩、MV 设置转发、
                            echo-mv:// 协议 handler、本地文件回环代理、
                            本地歌单存档（%APPDATA%\ECHO Steam\echo-mms-playlists.json）
  mod.js                    渲染进程页面（侧边栏「多平台音源」+「背景设置」页）
                            + 歌词页背景层 + 播放栏开关 + 状态提示条
  config.json               默认配置（mv* 键与社区版一致）
  config.schema.json        配置项 schema
  config-ui.js              配置弹窗（平台状态 + 歌曲背景面板 + 社区 MV 引擎 + 账号信息/扫码）
  icon.svg
  bridge/provider-bridge.cjs  构建产物：社区版音源 + 扫码登录
build/                      构建脚本（不打包）
  qr-login.ts               扫码登录（哔哩哔哩 / QQ 音乐原生二维码 + 登录窗口回退）
  source-patches.mjs        针对社区版源码的定向补丁
  deploy-echomod.mjs        把 dist/ 的包装进游戏的 Loader 目录（备份 + 逐字节校验）
  probe-account-bilibili.cjs 手动探针：账号解密、每日推荐、我喜欢、哔哩哔哩音频
  verify-config-ui.mjs      配置弹窗的 DOM 桩验证
reference/                  从上游取回的 SDK 文档与示例（不打包）
tools/asar-extract.mjs      读取 app.asar 的小工具
work/                       构建期的验证与临时产物（不打包）
dist/                       发布产物
```

## 已知限制

- **没有把在线曲目写进本地曲库。** 社区版会把在线曲目、导入的歌单落到曲库数据库；模组用的是内存缓存，
  队列、每日推荐、`导入歌单链接` 导入的歌单在重启后不再保留（当次会话内可以正常列出并播放）。
  **「我的歌单」是例外**：账号歌单列表与打开过的账号歌单会写进
  `%APPDATA%\ECHO Steam\echo-mms-playlists.json`，重启后仍在（这也是「不用每次都重新获取」的实现方式）。
- **扫码登录的二维码有效期 5 分钟**，过期后在面板里点 `重新生成二维码` 即可。
  酷狗 / SoundCloud / osu! 走的是登录窗口（在窗口里用手机扫码），不是页面内二维码。
- **背景解析画质**：登录 B 站后可选到 1080P 以上；未登录时通常只有 360P/480P。
  画质由社区版 `bilibiliQualityOrder` 阶梯决定（优先 AVC，Chromium 可解码），可在
  「背景设置」里用 `MV 最高画质` 限制上限。
- **自定义链接支持 `BV 号`、`b23.tv` 短链、`bilibili.com` 视频页、`av 号`（会先换算成 BV）和
  YouTube 链接**；短链会跟随跳转解析出 BV 号，解析不到时会明确报错而不是静默失败。
- **绑定记住的是“这首歌 + 这个视频”**：绑定写在社区版 MV 数据库里（`sourceType = manual`），
  重启、切歌、重新匹配都不会丢；只想临时看一眼请用 `预览`（不会改绑定）。
- **插件音源不可用。** 需要 ECHO 内置插件运行时，Steam 版没有向外部模组开放。
- **TIDAL 搜索需要自己的 Client ID / Secret**（配置页填写）。
- **Spotify / Qobuz** 需要先在 ECHO 本体里完成登录或填入凭据。
- 试听 / VIP 限制与社区版一致：受版权保护的曲目在没有对应账号时不会返回播放地址。
- 网易云的增强客户端（`@neteasecloudmusicapienhanced/api`）是可选加速项：Loader 自带一份，
  模组会把它所在的 `node_modules` 加进解析路径；缺失时网易云走公开接口，其他平台不受影响。
- 哔哩哔哩只能播到账号允许的码率（未登录通常 64K / 132K，登录后 192K 及以上）。

## 致谢与许可

- 音源算法来自 **ECHO Community**（Moekotori/ECHO，`LGPL-3.0-only`）。本模组按该许可证分发其衍生代码。
- 模组加载与播放桥接来自 **ShinawaseLoader**（ChunchunOwO）。
- 本项目与 ECHO 官方无隶属关系；请遵守各音乐平台的服务条款。
