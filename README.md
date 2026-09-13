<div align="center">

# ECHO 多平台音源 · ECHO Multi Music Sources

把 **ECHO 社区版（ECHO Community）** 的在线音源移植到 **Steam 版 ECHO** 的
[**ShinawaseLoader**](https://github.com/ChunchunOwO/ShinawaseLoader) 模组。

[![Release](https://img.shields.io/github/v/release/ChenyangLT/ECHO-Multi-Music-Sources?style=flat-square&color=7c5cff)](https://github.com/ChenyangLT/ECHO-Multi-Music-Sources/releases/latest)
[![License](https://img.shields.io/badge/license-LGPL--3.0-7c5cff?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/ECHO-Steam-22c55e?style=flat-square)](https://store.steampowered.com/)
[![Loader](https://img.shields.io/badge/ShinawaseLoader-1.6.7%2B-0ea5e9?style=flat-square)](https://github.com/ChunchunOwO/ShinawaseLoader)
[![Electron](https://img.shields.io/badge/Electron-43-47848f?style=flat-square)]()

</div>

---

## 这是什么

Steam 版 ECHO 把第三方音乐平台的能力裁掉了：`app.asar` 里仍然留着 `streaming:*` 的 IPC 通道名和账号存储，
但主进程不注册这些 handler，preload 里 `window.echo.streaming` 与 `window.echo.accounts` 都是 `null`。

本模组把 **ECHO 社区版那套平台算法**搬进模组自己的主进程，让 Steam 版重新拥有这些音源：
搜索、专辑、艺人、歌单、歌词、MV 与在线播放，全部走社区版的实现
（`ECHO-main/src/main/streaming`），播放则通过 [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader)
的 player runtime 交给 ECHO 真实播放器 —— 队列、歌词、DSP、迷你播放器的行为与本地歌曲完全一致。

> **这是 [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader) 的模组（`.echomod`），不是独立程序。**
> 必须先安装 Loader 才能使用，安装步骤见下方。

## 支持的平台

| 平台 | 搜索 | 播放 | 歌词 | MV | 需要登录 |
| --- | :---: | :---: | :---: | :---: | --- |
| 网易云音乐 NetEase | ✅ | ✅ | ✅ | ✅ | 高音质 / VIP 曲目需要 |
| QQ 音乐 | ✅ | ✅ | ✅ | ✅ | 会员曲目需要 |
| 酷狗音乐 KuGou | ✅ | ✅ | ✅ | — | 部分曲目需要 |
| 哔哩哔哩 Bilibili | ✅ | ✅（原生音频流） | — | ✅ | 无需（登录可解锁更高码率） |
| YouTube | ✅ | ✅ | — | — | 部分内容需要 |
| SoundCloud | ✅ | ✅ | — | — | 部分内容需要 |
| Spotify | ✅ | ✅ | ✅ | — | 需要（Cookie / 凭据） |
| TIDAL | ✅ | ✅ | — | — | 需要自己的开发者凭据 |
| Qobuz | ✅ | ✅ | — | — | 需要 |

> 哔哩哔哩的播放**只解析音频**（DASH 音频流），视频只用于歌词页的背景 MV，不依赖 `yt-dlp`。

## 功能一览

- **搜索 / 播放 / 队列**：四个标签（歌曲 / 专辑 / 艺人 / 歌单）分别检索；`播放全部`、`加入队列`、行内 `▶` `+`、右键菜单（在浏览器打开 / 复制链接）。
- **音质**：工具栏选择，失败自动降级（哔哩哔哩会依次尝试多档）。
- **我的歌单（收藏与歌单）**：登录后列出账号内容 —— 网易云 / QQ 音乐的云歌单，以及 **B 站的收藏夹、订阅的收藏夹、稍后再看**。
- **通过链接导入歌单**：粘贴 **网易云 / QQ 音乐 / 酷狗 / Spotify** 歌单链接，导入即可播放。
- **保存到本地（由你决定）**：点 `保存到本地` 才会把歌单写进本机；之后打开**不再联网**，平台限流或离线时也能用。账号歌单**列表**自动缓存，歌单**内容**由你选择。
- **显示方式**：`图标` / `列表` / `紧凑` 三种歌单布局，选择会持久化。
- **账号**：每个平台粘贴 Cookie，或 `扫码登录`（网易云 / 哔哩哔哩 / QQ 音乐页面内二维码；酷狗 / SoundCloud / osu! 打开登录窗口）。登录后显示头像、昵称、UID、VIP 标记、最后检测时间。
- **每日推荐**：直接读取网易云账号的每日推荐。
- **歌曲详情页 MV 背景**：点进歌曲详情页（歌词页）就用「歌名 + 艺人 + MV」在 B 站匹配视频，渲染在歌词后面并**跟随歌曲进度**。

## 安装

### 1. 安装 ShinawaseLoader

模组运行在 [**ShinawaseLoader**](https://github.com/ChunchunOwO/ShinawaseLoader) 上，先按它的说明装好：

1. 打开 <https://github.com/ChunchunOwO/ShinawaseLoader/releases> 下载最新版；
2. 解压后运行 `setup-modloader.bat`（或 `scripts/setup-modloader.ps1 install`），按提示选择 ECHO 的安装目录；
3. 安装器会生成隔离运行时 `ECHO.modded.exe`、编好播放桥接，并把四个启动脚本放进 `ECHO/ShinawaseLoader/`。

> 装完后请**始终通过 `ECHO.modded.exe` 启动游戏**（Steam 的启动项会被安装器指向它，桌面快捷方式同理）。
> 直接开原版 `ECHO.exe` 不会加载任何模组。

### 2. 安装本模组

1. 到 [**Releases**](https://github.com/ChenyangLT/ECHO-Multi-Music-Sources/releases/latest) 下载
   **`echo.multi-music-sources-1.10.0.echomod`**（[直链](https://github.com/ChenyangLT/ECHO-Multi-Music-Sources/releases/download/v1.10.0/echo.multi-music-sources-1.10.0.echomod)；
   仓库里的 `dist/` 也放了同一份）；
2. 把它**拖进 Loader 的 Mods 页面**，或者直接放进 `ECHO/Mods/`（Loader 会自动导入并移到 `Mods/.processed/`）；
3. 在 Loader 里**启用「ECHO 多平台音源」**；
4. 重启 ECHO，左侧边栏会出现 **♫ 多平台音源**。

### 环境要求

| 项目 | 要求 |
| --- | --- |
| 系统 | Windows 10 / 11 x64 |
| 游戏 | ECHO **Steam** 版（`minEchoVersion` 26.8.15） |
| 加载器 | [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader) **1.6.7 或更高**（1.7.2 已验证） |
| 运行时 | Electron 43（随游戏提供，无需另装） |
| Node.js | **只有从源码构建时才需要**（22.x），使用者不需要 |

> **请让 Loader 进程保持运行**（正常安装流程下它本来就是常驻的）：
> 模组页面通过 `mod.js → Loader 服务 → native host → main.cjs` 转发到主进程，
> 只启动 `ECHO.modded.exe` 时主进程侧照常工作，但页面会因为取不到 RPC 而显示「没有可用的音乐平台」。

## 使用

### 搜索与播放

选择平台 → 输入关键词 → 回车。点行内 `▶` 播放单曲，`播放全部` 替换队列并从第一首开始，
`加入队列` / `全部加入队列` 追加到当前队列。播放地址只在播放时解析，不会写进队列。

### 我的歌单（收藏与歌单）

登录后进入 **我的歌单**，列出该账号的内容；点封面即载入曲目，可整列表播放或加入队列。
**点开歌单只读取，不会自动保存**；从歌单明细点 `← 返回` 回到这一页（不是搜索页）。

### 通过链接导入歌单

页面顶部的输入框粘贴歌单链接后点 `导入`（回车也行）：

- 支持 **网易云 / QQ 音乐 / 酷狗 / Spotify** 歌单链接；
- 导入后直接以歌单明细打开，可以马上播放；
- 想留着就点 `保存到本地`，它会出现在页面底部的 **「本地保存的歌单」** 分组里，**不依赖账号**。

### 歌单保存在哪里

| 内容 | 位置 |
| --- | --- |
| 账号歌单列表 + 你选择保存的歌单 | `%APPDATA%\ECHO Steam\echo-mms-playlists.json` |
| MV 绑定 / 逐曲偏移（社区版 MV 引擎） | `%APPDATA%\ECHO Steam\echo-mms-mv.sqlite` |
| 各平台账号（与 ECHO 本体共用，加密存储） | `%APPDATA%\ECHO Steam\accounts.json` |
| MV 背景等模组设置 | ECHO 的 `%APPDATA%\ECHO Steam\echo-settings.json` |

页面上：`刷新` = 重新联网获取账号歌单列表，`清除本地歌单` = 清空本地存档（不影响平台账号）。

### 歌曲详情页 MV 背景

**默认开启。** 点进歌曲详情页（歌词页）就会用「歌曲名 + 艺人 + MV」在 B 站搜索并取匹配的视频，
显示在歌词后面并跟随歌曲播放进度。

- **背景视频怎么来**：和社区版完全一致 —— 社区版 MV 引擎解析出视频流（`echo-mv://stream/…`），
  主进程按社区版 `videoProtocol.ts` 的方式带着该画质的 Referer / UA / Cookie 与渲染进程的 `Range`
  转发 CDN 响应。**不下载、不缓存、不占磁盘。**
- **背景交互**：在歌词页上**拖动**改画面位置，**Ctrl + 滚轮**缩放。
- **歌词页右下角面板**：`重新匹配`、`-0.5s` / `+0.5s` / `偏移归零`、`隐藏歌词`、`在浏览器打开`、
  `关闭背景`，以及 `⚙ 设置` 打开的**右侧完整设置抽屉**（画面预设、尺寸、填充、X-Y-Z、候选视频、
  自定义链接、同步、画质、引擎状态），可以边看 MV 边调。
- **背景设置页**：侧栏 → **背景设置**，包含状态、匹配方式（按名称取第一个 / 匹配度评分 / 播放量）、
  候选数量、画面预设、填充方式、缩放与位置、模糊 / 亮度 / 遮罩、同步模式、MV 最高画质等。
  候选列表带**视频封面**与匹配理由；`当前 MV` 的画质是一个**下拉框**。
- 从 ECHO 自带界面播放的歌曲同样有效：模组会从播放状态里拿到当前曲目并自动登记给 MV 引擎。

### 账号

`账号` 页面为每个平台粘贴 Cookie，或点 `扫码登录`
（网易云、哔哩哔哩、QQ 音乐在页面里直接显示二维码；酷狗 / SoundCloud / osu! 会打开登录窗口）。
账号数据与 ECHO 本体共用 `accounts.json`；模组会读取本体已加密保存的账号，不需要重新登录。

## 常见问题

**页面显示「没有可用的音乐平台」？**
Loader 没在跑，或者模组没启用。让 Loader 常驻并确认 `Mods` 页面里本模组是启用状态。

**某个平台的搜索结果为空？**
先在 `账号` 页面登录该平台；部分平台对匿名请求限流，稍等再试。`调试日志` 打开后可在
`ShinawaseLoader/Logs/loader.log` 里搜 `[echo.multi-music-sources]` 看具体原因。

**B 站歌曲只有声音没有画面？**
这是设计如此：哔哩哔哩只解析音频流，视频只用作歌词页背景。码率取决于登录状态（未登录通常 64K / 132K）。

**MV 背景画质很低？**
未登录 B 站时通常只有 360P / 480P；在 `账号` 页登录 B 站后可选到 1080P 以上，
也可在 `背景设置` 里用 `MV 最高画质` 限制上限。

**Spotify / TIDAL / Qobuz 用不了？**
这三个需要 OAuth 登录或自己的开发者凭据。TIDAL 需要在配置里填 Client ID / Secret；
Spotify / Qobuz 需要先在 ECHO 本体里完成登录或填入凭据。

**在线歌曲会存到本地曲库吗？**
不会。模组用内存缓存，队列 / 每日推荐 / `导入歌单链接` 导入的歌单在重启后不再保留。
唯一的例外是 **「我的歌单」**：账号歌单列表与你选择保存的歌单会写进
`%APPDATA%\ECHO Steam\echo-mms-playlists.json`，重启后仍在。

**网易云音质 / 可用性不如预期？**
网易云的增强客户端 `@neteasecloudmusicapienhanced/api` 是可选加速项（Loader 自带一份）。
缺失时网易云走公开接口，其他平台不受影响。试听 / VIP 限制与社区版一致。

## 从源码构建

构建需要 **ECHO 社区版源码**（本模组不包含它）：

```powershell
git clone https://github.com/Moekotori/ECHO.git ECHO-main   # 或设置 ECHO_MAIN_ROOT 指向别处
cd build
npm install            # 只需一次
npm run release        # = build-provider-bridge + pack-echomod + deploy-echomod
```

产物：`dist/echo.multi-music-sources-<版本>.echomod`。

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 只重新编译 `mod/bridge/provider-bridge.cjs`（社区版音源 → 单个包） |
| `npm run pack` | 只打包 `.echomod` |
| `npm run deploy` | 把 `dist/` 里最新的 `.echomod` 装进本机游戏（等价于 Loader 的导入，含备份与逐字节校验） |
| `npm test` | 依次跑下面几套验证 |
| `npm run verify:renderer` | 在 DOM 桩里跑 `mod.js`（页面、搜索、播放、歌单、MV 背景、抽屉） |
| `npm run verify:config-ui` | 配置弹窗的 DOM 桩验证 |
| `npm run verify:electron` | 在 Electron 43 主进程里加载 provider bridge，真实平台请求 |
| `npm run verify:mod` | 模拟 Loader host 跑 `main.cjs`（RPC、播放解析挂钩、账号、本地歌单存档、MV 引擎） |
| `npm run verify:mv` | 渲染进程里用真实 `<video>` 播 `echo-mv://` 流 |
| `npm run audit` / `npm run check` | 检查产物是否混进守护进程模块 |

## 目录结构

```
mod/                        模组包（打包进 .echomod 的内容）
  echo.mod.json             清单
  main.cjs                  主进程入口：RPC、设置、播放解析挂钩、MV 设置转发、
                            echo-mv:// 协议 handler、本地文件回环代理、本地歌单存档
  mod.js                    渲染进程页面（侧边栏「多平台音源」+「背景设置」）
                            + 歌词页背景层 + 播放栏开关 + 状态提示条
  config.json / schema      默认配置与配置项 schema（mv* 键与社区版一致）
  config-ui.js              配置弹窗
  bridge/provider-bridge.cjs  构建产物：社区版音源（由 build/ 生成，不入库）
build/                      构建脚本（不打包）
  provider-bridge.ts        桥接入口（社区版 provider 的装配 + 模组扩展）
  source-patches.mjs        针对社区版源码的定向补丁
  deploy-echomod.mjs        把 dist/ 的包装进游戏的 Loader 目录
  shims/                    社区版守护进程模块的等价替代实现
tools/asar-extract.mjs      读取 app.asar 的小工具
docs/DEVELOPMENT.md         实现细节：移植方式、踩过的坑、验证覆盖（长文）
```

## 致谢与许可

- **音源与 MV 算法来自 [ECHO Community](https://github.com/Moekotori/ECHO)**（作者 Moekotori，`LGPL-3.0-only`）：
  `StreamingService` / 各平台 provider / `MvService` 等由社区版源码编译进本模组。
  **本模组是它的衍生作品，因此同样以 [`LGPL-3.0-only`](LICENSE) 发布。**
- **模组加载、播放桥接与隔离运行时来自 [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader)**（作者 ChunchunOwO）。
  本模组以 `.echomod` 形式运行在它之上，并复用它的 `echoExternalMod` API 与 player runtime。
- **哔哩哔哩原生音频解析**使用平台自身的 playurl / WBI 接口（与社区版 MV provider 同一套签名表）。
- 本项目与 ECHO 官方无隶属关系；请遵守各音乐平台的服务条款，音源仅用于个人学习与自用。

---

## English

A [**ShinawaseLoader**](https://github.com/ChunchunOwO/ShinawaseLoader) mod that brings the
**ECHO Community** streaming sources to the **Steam** build of ECHO.

The Steam build ships the `streaming:*` IPC channel names and the account store but registers no
handlers, so `window.echo.streaming` is `null`. This mod runs the community platform algorithms
(search, album, artist, playlist, lyrics, MV, playback URLs) inside its own main process and hands
playback to ECHO's real player through ShinawaseLoader's player runtime.

**Requirements** — Windows, ECHO **Steam**, [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader) **1.6.7+**
(tested with 1.7.2). Install the loader first, then grab `echo.multi-music-sources-1.10.0.echomod` from
[**Releases**](https://github.com/ChenyangLT/ECHO-Multi-Music-Sources/releases/latest) and drop it into the
loader's Mods page (or into `ECHO/Mods/`), enable it, and restart the game. Always launch through
`ECHO.modded.exe`, never the stock `ECHO.exe`.

**Highlights** — 9 platforms (NetEase, QQ Music, KuGou, Bilibili, YouTube, SoundCloud, Spotify, TIDAL, Qobuz);
an account **playlists / favourites** page with **link import** and **opt-in local saving** (so a saved
playlist opens offline); three list layouts; QR sign-in; daily recommendations; and a
**Bilibili MV background** on the song page that follows the music (streamed, never downloaded).

**License** — `LGPL-3.0-only`. The streaming and MV algorithms are derived from
[ECHO Community](https://github.com/Moekotori/ECHO) (LGPL-3.0-only); the mod loader, playback bridge and
isolated runtime are [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader)'s.
Not affiliated with ECHO.

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the porting notes, verification suites and internals.
