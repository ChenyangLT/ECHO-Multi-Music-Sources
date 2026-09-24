# ShinawaseLoader 自动安装器

一个可双击的 Windows 安装器（`dist/ShinawaseLoader-Installer.exe`），把
[ShinawaseLoader](https://github.com/ChunchunOwO/ShinawaseLoader) 自动装进 Steam 版 ECHO。

**它只负责装模组加载器本身**，不管理模组 —— 装好后游戏里就是 Loader 自带的界面，
把 `.echomod` 拖进「拖入此处添加模组」即可。

- 依赖：Windows 10/11 自带的 .NET Framework（无需另装运行时，无需 Node/npm）
- 体积：约 43 KB，单文件
- 不修改 Steam 的 `ECHO.exe` / `resources\app.asar`，全部走隔离运行时 `ECHO.modded.exe`

## 怎么用

双击 `ShinawaseLoader-Installer.exe`：

1. 自动找到 Steam 版 ECHO（先看上一次的选择，再扫注册表里的 Steam 库、`libraryfolders.vdf`
   和各盘常见路径）；找不到或找错了就点 **手动指定 ECHO.exe**。
2. 顶部会显示游戏目录、是否已安装、已装版本与 Node 版本。
3. 点 **安装 / 更新** 开始。首次安装要下载约 40 MB 的 Loader 源码 + 约 30 MB 的 Node 运行时，
   然后复制 asar 构建隔离运行时，通常 1–3 分钟。
4. 完成后点 **启动 ECHO.modded.exe**；或在 Steam 里点 **复制 Steam 启动选项** 再粘到
   `Steam → 库 → ECHO → 属性 → 启动选项`。

> 装完请**始终用 `ECHO.modded.exe` 启动**。直接开原版 `ECHO.exe` 不会加载任何模组。

### 命令行（可选）

```text
ShinawaseLoader-Installer.exe                                  打开图形界面
ShinawaseLoader-Installer.exe --install [--echo-root <路径>] [--force] [--offline]
ShinawaseLoader-Installer.exe --check   [--echo-root <路径>]
```

`--echo-root` 可以是游戏目录或 `ECHO.exe`；`--force` 即使已是最新版也重装；
`--offline` 只用缓存里已下载的源码。退出码 `0` 成功、`1` 校验不通过、`2` 没找到 ECHO。

## 它到底做了什么

与官方 `scripts/setup-modloader.ps1` 的 `install` 流程一致：

| 步骤 | 内容 |
| --- | --- |
| 1 | 从 `raw.githubusercontent.com` 读 `loader-version.json` 拿最新版本号 |
| 2 | 按 `codeload.github.com` 的 main 分支 commit 下载源码 zip 并缓存到 `%LOCALAPPDATA%\ShinawaseLoader\installer-cache` |
| 3 | 预置 `%LOCALAPPDATA%\ShinawaseLoader\selection.json`（语言 + ECHO 路径），让官方脚本无交互运行 |
| 4 | 调用官方 `setup-modloader.ps1 -Action install -EchoRoot <ECHO.exe> -Force`：复制 Loader、下载 Node 22、`init`、`npm install`、同步隔离运行时、编译宿主、写四个启动脚本 |
| 5 | 校验产物（见下），任何缺失都会点名 |

安装位置（都在游戏目录里，随时可删）：

```text
ECHO\ECHO.modded.exe                     隔离运行时宿主
ECHO\ShinawaseLoader\                    加载器本体 + node.exe + 四个启动脚本
ECHO\ShinawaseLoader\modded-runtime\     隔离运行时（asar 的副本，不动原版）
ECHO\Mods\  ECHO\Plugins\                模组 / 插件
```

### 装错地方了：先看 `selection.json`

Loader 的官方脚本用 `%LOCALAPPDATA%\ShinawaseLoader\selection.json` 里的 `echoExe`
来定位游戏。这个文件一旦指向一个**假的 / 残缺的**目录，之后无论怎么重装都会装到那里，
症状是 `Isolated runtime sync failed` 里带着一个莫名其妙的路径。

安装器现在的做法：

- 自动检测**只认「看起来是真游戏」的目录**（要有 `icudtl.dat` / `resources.pak` 等 Electron
  载荷文件，且 `resources\app.asar` 不小于 4 MB），不再被几百字节的测试桩骗过去；
- 手工指定的路径如果不像真安装会**明确警告**，GUI 里还会把「安装 / 更新」按钮置灰；
- 每次安装都会把正确的 `echoExe` 写回 `selection.json`，所以从安装器走一遍就能把错的目标纠正过来。

已经在别处装错了的话，直接用 `--echo-root` 指向真正的 `ECHO.exe` 再跑一次即可。

### 模组不显示（注入失败）：多半是 9229 端口被 Windows 保留了

Loader 靠 CDP 注入渲染进程，默认端口 `debugPort=9229` / `inspectPort=9230`。
Windows 会把一批 TCP 端口**保留**给 Hyper-V / WSL / Docker 等，被保留的端口**任何进程都绑不上**，
报错是：

```
An attempt was made to access a socket in a way forbidden by its access permissions
```

常见机器的保留范围里就有 `9185-9284`，正好把 9229 和 9230 圈进去。这时 ECHO 起不来调试端口，
Loader 只会一直打 `interval injection failed TypeError: fetch failed`，用户看到的就是
「双击了 `ECHO.modded.exe` 但侧边栏没有模组」——**跟安装无关，换端口就好**。

自查一条命令：

```powershell
netsh int ipv4 show excludedportrange protocol=tcp
```

安装器现在会在校验后自动检查这两个端口：能绑就跳过；被保留就自动换成可用端口
（例如 19229 / 19230），原配置备份为 `loader.config.json.bak`，并在日志里说明。
判断时会先用 `netsh` 查保留范围，再用 `GetExtendedTcpTable` 看端口是否已被监听
（游戏正在运行属于正常，不会误改配置）。

也可以单独跑修复脚本：

```powershell
powershell -File tools\fix-loader-ports.ps1            # 自动检查并修复
powershell -File tools\fix-loader-ports.ps1 -CheckOnly  # 只看不改
```

改完端口后**关掉 ECHO 重新启动**即可。验证方式：`%APPDATA%\ECHO Steam\DevToolsActivePort`
里应该写着新端口，Loader 日志里会出现 `watching ECHO CDP on <新端口>`，
接着是 `ECHO main targets=1, enabledPackages=N`。

### 官方脚本半途失败时会自动补完

上游 Loader 的 asar 补丁锚点**跟随 ECHO 版本变化**：1.7.3 依赖
`steamStreamingValidation('provider2')` 这类锚点，以及 preload 里的
`streaming: null,` 或 `const echoApi = {`。如果某个 ECHO 构建把这段代码改掉了，
`runtime-sync` 就会以 `patch-failed` 结束，官方脚本随即抛
「Isolated runtime sync failed」并在**编译宿主、写启动器之前**退出。

安装器检测到这种情况会自己补完剩下的步骤（编译 `ECHO.modded.exe` + 写四个 `.cmd`），
并在日志里说明「已自动补完剩余步骤」。补完后校验照常通过，Loader 界面可用。

校验阶段还会检查隔离运行时**是否真的被注入了 Loader 桥接**（在 asar 里找
`shinawase-loader-preload-bridge-v1` 标记）：

- 找到了 → `隔离运行时已注入 Loader 桥接。`
- 没找到 → 明确提示「已复制但未打补丁」，这种情况下 Loader 界面仍可用（走 CDP 注入），
  但游戏内的流媒体桥接不会生效 —— 该重新同步或等上游适配。

## 从源码构建

```powershell
powershell -File tools/loader-installer/Build.ps1
# 或指定输出
powershell -File tools/loader-installer/Build.ps1 -Output dist\my-name.exe
```

- 只用 Windows 自带的 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` 编译，不需要 .NET SDK。
- 版本号从 `mod/echo.mod.json` 的 `version` 取，写进程序集版本属性。
- 源码约定：UTF-8 带 BOM + CRLF（Windows PowerShell 5.1 解析中文脚本的硬要求），
  `Build.ps1` 在编译前会统一归一化编码。
- 编译时会把源码复制到无空格的 `build\src\` 再编译：这台机器的工作目录带空格，
  而 csc 的参数由 PowerShell 拼接时不会自动加引号。
