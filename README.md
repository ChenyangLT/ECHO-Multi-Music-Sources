<div align="center">

# 多平台音源 · ECHO Multi Music Sources

一个音乐播放器**插件**：把 9 个在线音乐平台接进播放器，搜索、播放、歌单、歌词、MV 背景全在一个侧栏页面里。

[![Version](https://img.shields.io/badge/version-2.0.0-7c5cff?style=flat-square)](https://github.com/ChenyangLT/ECHO-Multi-Music-Sources/releases)
[![License](https://img.shields.io/badge/license-LGPL--3.0-7c5cff?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011%20x64-22c55e?style=flat-square)]()

</div>

---

## 这个插件能做什么

- **9 个平台**：网易云音乐、QQ 音乐、酷狗音乐、哔哩哔哩、YouTube、SoundCloud、Spotify、TIDAL、Qobuz。
- **搜索与播放**：歌曲 / 专辑 / 艺人 / 歌单四类结果，单曲播放、播放全部、加入队列，右键可在浏览器打开或复制链接。
- **在线播放**：直接用播放器自己的播放链路，队列、歌词、音效、迷你播放器的表现和本地歌曲一致；播放地址即用即取，不下载、不写曲库。
- **我的歌单**：打开插件页就是这一页——登录后的账号歌单、收藏夹、稍后再看、每日推荐，都可整列表播放。
- **歌单导入与保存**：粘贴歌单链接即可导入；想留下就点「保存到本地」，之后离线也能打开。
- **账号**：每个平台粘贴 Cookie 或扫码登录，登录后可播放更高音质与会员曲目。
- **音质选择**：可选音质，失败自动降级。
- **MV 背景**（默认关闭）：在歌曲详情页用歌曲名匹配在线 MV，作为歌词页背景并跟随歌曲进度播放；不下载、不缓存、不占磁盘。
- **MV 设置面板与设置抽屉**：都能用标题栏**拖动**，默认停在左下角 / 右上角，松手自动吸附到最近的边，位置会被记住。
- **配置会记忆**：画面预设、填充、缩放、位置、同步模式、画质等任何改动都会写进你的配置，**对所有 MV 生效，重启后依然保留**。默认画面是「**默认（左右贴合）**」——画面缩放到左右两侧恰好贴住窗口宽度并随窗口自适应，高度不做限制。

## 支持情况

| 平台 | 搜索 | 播放 | 歌词 | MV | 需要登录 |
| --- | :---: | :---: | :---: | :---: | --- |
| 网易云音乐 | ✅ | ✅ | ✅ | ✅ | 高音质 / VIP 曲目需要 |
| QQ 音乐 | ✅ | ✅ | ✅ | ✅ | 会员曲目需要 |
| 酷狗音乐 | ✅ | ✅ | ✅ | — | 部分曲目需要 |
| 哔哩哔哩 | ✅ | ✅ | — | ✅ | 无需（登录可解锁更高码率） |
| YouTube | ✅ | ✅ | — | — | 部分内容需要 |
| SoundCloud | ✅ | ✅ | — | — | 部分内容需要 |
| Spotify | ✅ | ✅ | ✅ | — | 需要 |
| TIDAL | ✅ | ✅ | — | — | 需要自己的开发者凭据 |
| Qobuz | ✅ | ✅ | — | — | 需要 |

> 哔哩哔哩只解析音频流，视频仅用于歌曲详情页的 MV 背景。

## 安装

1. 到 [**Releases**](https://github.com/ChenyangLT/ECHO-Multi-Music-Sources/releases/latest) 下载
   **`echo.multi-music-sources-2.0.0.echomod`**；
2. 把它拖进模组加载器的 Mods 页面，或直接放进加载器的 `Mods/` 目录；
3. 在加载器里**启用「ECHO 多平台音源」**，然后重启软件；
4. 左侧边栏会出现 **♫ 多平台音源** 与 **🎬 MV 背景** 两个页面。

### 环境要求

| 项目 | 要求 |
| --- | --- |
| 系统 | Windows 10 / 11 x64 |
| 加载器 | [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader) 1.6.7 或更高（1.7.2 已验证） |
| 运行 | Electron 43（随应用提供，无需另装） |
| Node.js | 只有从源码构建时才需要（22.x），使用者不需要 |

## 使用

- **搜索**：选平台 → 输入关键词 → 回车。点 `▶` 播单曲，`播放全部` 替换队列，`加入队列` 追加到当前队列。
- **我的歌单**：登录后列出账号内容，顶部是每日推荐分组；点封面载入曲目，可整列表播放。
- **导入歌单**：在顶部输入框粘贴歌单链接（网易云 / QQ 音乐 / 酷狗 / Spotify）后点 `导入`；点 `保存到本地` 可离线使用。
- **账号**：`账号` 标签里粘贴 Cookie，或点 `扫码登录`。
- **MV 背景**：在侧栏 `🎬 MV 背景` 页打开总开关，或在播放栏点 MV 按钮（在主界面点它会直接进入歌曲详情页）。
  进入歌曲详情页后，MV 会显示在歌词后面并跟随歌曲进度；`⚙ 设置` 打开完整设置面板。
  面板和设置面板都能**拖动标题栏移动**，靠近边缘会自动吸附，位置会被记住。
- **画面调整**：在歌词页上拖动背景改位置，`Ctrl + 滚轮` 缩放。

## 设置保存在哪里

| 内容 | 位置 |
| --- | --- |
| 插件设置（画面预设、MV、面板位置等） | 插件自己的配置存储，随软件重启保留 |
| 你保存的歌单 | 随软件数据目录下的 `echo-mms-playlists.json` |
| 平台账号 | 随软件数据目录下的加密账号存储 |

页面上：`刷新` = 重新联网获取账号歌单，`清除本地歌单` = 清空本地存档（不影响平台账号）。

## 常见问题

**侧边栏没有出现插件页面？**
确认加载器正在运行、插件是启用状态，然后重启软件。

**某个平台的搜索结果为空？**
先在 `账号` 页登录该平台；部分平台对匿名请求限流，稍等再试。

**MV 画质偏低？**
未登录时通常只有 360P / 480P；登录后可到 1080P 以上，也可在 `🎬 MV 背景` 页用 `MV 最高画质` 限制上限。

**在线歌曲会存到本地曲库吗？**
不会。只有你主动点 `保存到本地` 的歌单会写进本地存档。

**换了一首歌，我的画面设置还在吗？**
在。所有画面 / 同步 / 画质设置都属于插件配置，对每个 MV 都生效，重启软件后依然保留。

## 从源码构建

构建需要本机装有 Node.js 22.x：

```powershell
cd build
npm install            # 只需一次
npm run release        # 编译 + 打包 + 部署到本机
```

产物：`dist/echo.multi-music-sources-<版本>.echomod`。

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 重新编译插件的主进程桥接 |
| `npm run pack` | 只打包 `.echomod` |
| `npm run test` | 跑页面 / 配置弹窗 / 主进程的验证套件 |

## 许可

本项目以 [`LGPL-3.0-only`](LICENSE) 发布。
模组加载与播放桥接能力来自 [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader)（作者 ChunchunOwO）。
音源仅用于个人学习与自用，请遵守各音乐平台的服务条款；本项目与任何平台均无隶属关系。

---

## English

A music-player **plugin** that brings nine online music services into the player: search, playback,
playlists, lyrics and an optional MV background, all on one sidebar page.

**Highlights** — 9 platforms (NetEase, QQ Music, KuGou, Bilibili, YouTube, SoundCloud, Spotify,
TIDAL, Qobuz); search, queue and streaming playback with per-platform quality; an account
**playlists / favourites** page with **link import** and opt-in local saving; QR sign-in; and an
opt-in **MV background** on the song page that follows the music (streamed, never downloaded).

Both the MV panel and its settings drawer can be **dragged by their header**, start at the
bottom-left / top-right, snap to the nearest edge and **remember where you left them**. Every
setting — picture preset, fitting, zoom, position, sync mode, quality — is **remembered per user**,
applies to every MV and survives a restart. The default picture is **“Default (fits left & right)”**:
the picture is scaled to exactly the width of the window and follows resizing, with the height left
free.

**Requirements** — Windows 10/11 x64 and [ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader)
1.6.7+ (tested with 1.7.2). Grab `echo.multi-music-sources-2.0.0.echomod` from
[**Releases**](https://github.com/ChenyangLT/ECHO-Multi-Music-Sources/releases/latest), drop it into
the loader's Mods page, enable it and restart.

**License** — `LGPL-3.0-only`. The mod loader and playback bridge are
[ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader)'s. Not affiliated with any music
platform.
