// ShinawaseLoader 自动安装器
//
// 单人可双击的 GUI 安装器：自动找到 Steam 版 ECHO，下载最新的 ShinawaseLoader，
// 调用官方 setup-modloader.ps1 完成安装（隔离运行时 ECHO.modded.exe + modded-runtime
// + node 运行时 + 四个启动脚本），最后逐项校验。
//
// 安装完成后游戏内会出现 Loader 的「拖入此处添加模组」模组管理界面，
// 把 .echomod 拖进去即可。本工具不负责管理模组。
//
// 只依赖 .NET Framework 4.x（Windows 10/11 自带），无需安装任何运行时。
//
// 命令行：
//   ShinawaseLoader-Installer.exe                     打开 GUI
//   ShinawaseLoader-Installer.exe --install [--echo-root <路径>] [--force]   无界面安装
//   ShinawaseLoader-Installer.exe --check   [--echo-root <路径>]             无界面检查

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ShinawaseInstaller
{
    // ---------------------------------------------------------------- 常量 ----

    internal static class Const
    {
        // 与 ShinawaseLoader 官方 setup-modloader.ps1 保持一致
        public const string RepoRaw = "https://raw.githubusercontent.com/ChunchunOwO/ShinawaseLoader/main";
        public const string ArchiveUrl = "https://codeload.github.com/ChunchunOwO/ShinawaseLoader/zip/refs/heads/main";
        public const string CommitApi = "https://api.github.com/repos/ChunchunOwO/ShinawaseLoader/commits/main";
        public const string ZipRoot = "ShinawaseLoader-main";
        public const string SourceSubDir = "ShinawaseLoader";   // 仓库里的 Loader 源目录
        public const string SetupScript = "scripts\\setup-modloader.ps1";
        public const string UserAgent = "ShinawaseLoader-Installer/1.0";
        public const string MinLoaderVersion = "1.6.7";        // 本模组要求的最低 Loader 版本
    }

    // ---------------------------------------------------------------- 日志 ----

    internal interface ILog
    {
        void Line(string text, LogKind kind);
        void Progress(int percent);
        void Step(int index, int total, string title);
        void Busy(bool busy);
    }

    internal enum LogKind { Info, Good, Warn, Bad, Dim, Head }

    // ------------------------------------------------------------ 安装目标 ----

    internal class Target
    {
        public string EchoExe;
        public string EchoRoot;
        public string LoaderRoot;
        public string InstalledVersion;
        public string NodeVersion;

        public bool HasLoader
        {
            get { return this.InstalledVersion != null; }
        }
    }

    // ------------------------------------------------------------ 核心逻辑 ----

    internal class InstallerCore
    {
        private readonly string cacheRoot;
        private readonly string localAppData;
        private readonly ILog log;
        private volatile bool cancelled;

        public InstallerCore(ILog log)
        {
            this.log = log;
            this.localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            this.cacheRoot = Path.Combine(this.localAppData, "ShinawaseLoader", "installer-cache");
            EnsureTls();
        }

        public void Cancel() { this.cancelled = true; }

        // ---- 基础工具 ---------------------------------------------------

        private static void EnsureDir(string path)
        {
            if (!Directory.Exists(path)) Directory.CreateDirectory(path);
        }

        private static string ReadJsonString(string path, string key)
        {
            if (!File.Exists(path)) return null;
            try
            {
                string text = File.ReadAllText(path, Encoding.UTF8);
                Match m = Regex.Match(text, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"([^\"]*)\"");
                return m.Success ? m.Groups[1].Value.Replace("\\\\", "\\") : null;
            }
            catch { return null; }
        }

        private static string JsonEscape(string value)
        {
            return (value ?? string.Empty).Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        // 读取 loader-version.json（形如 {"version":"1.7.3","nodeVersion":"22.23.2"}）
        private static string[] ReadLoaderVersion(string path)
        {
            if (!File.Exists(path)) return null;
            string version = ReadJsonString(path, "version");
            if (string.IsNullOrEmpty(version)) return null;
            string node = ReadJsonString(path, "nodeVersion");
            return new string[] { version, node };
        }

        private static int CompareVersion(string left, string right)
        {
            Version a, b;
            if (!Version.TryParse(Clean(left), out a)) return 0;
            if (!Version.TryParse(Clean(right), out b)) return 0;
            return a.CompareTo(b);
        }

        private static string Clean(string version)
        {
            if (string.IsNullOrEmpty(version)) return "0.0";
            Match m = Regex.Match(version, "\\d+(\\.\\d+)*");
            return m.Success ? m.Value : "0.0";
        }

        private static string FirstExistingDir(params string[] paths)
        {
            foreach (string p in paths)
            {
                if (!string.IsNullOrEmpty(p) && Directory.Exists(p)) return p;
            }
            return null;
        }

        private static string ProgramFilesX86
        {
            get { return Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86); }
        }

        private static string ProgramFiles
        {
            get { return Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles); }
        }

        // ---- 查找 ECHO --------------------------------------------------

        // 1) 上一次的选择  2) Steam 注册表 + libraryfolders.vdf 里的库  3) 常见路径
        public List<string> FindEchoCandidates()
        {
            List<string> found = new List<string>();

            string saved = ReadJsonString(Path.Combine(this.localAppData, "ShinawaseLoader", "selection.json"), "echoExe");
            if (_Exists(saved)) found.Add(saved);

            foreach (string common in this.SteamCommonFolders())
            {
                string direct = Path.Combine(common, "ECHO", "ECHO.exe");
                if (_Exists(direct)) found.Add(direct);
                foreach (string exe in _GlobEcho(common, 2)) found.Add(exe);
            }

            foreach (string hint in new string[] {
                Path.Combine(ProgramFiles, "ECHO"),
                Path.Combine(ProgramFilesX86, "ECHO"),
                Path.Combine(this.localAppData, "Programs"),
            })
            {
                foreach (string exe in _GlobEcho(hint, 2)) found.Add(exe);
            }

            // 去重 + 排序（正式版优先，Playtest / NEXT 往后放）
            Dictionary<string, bool> seen = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            List<string> unique = new List<string>();
            foreach (string item in found)
            {
                if (string.IsNullOrEmpty(item)) continue;
                string full;
                try { full = Path.GetFullPath(item); } catch { continue; }
                if (seen.ContainsKey(full)) continue;
                seen[full] = true;
                unique.Add(full);
            }
            unique.Sort(delegate(string a, string b)
            {
                int ra = Rank(a), rb = Rank(b);
                if (ra != rb) return ra.CompareTo(rb);
                return string.Compare(a, b, StringComparison.OrdinalIgnoreCase);
            });
            return unique;
        }

        private static bool _Exists(string path)
        {
            return !string.IsNullOrEmpty(path) && File.Exists(path);
        }

        private static IEnumerable<string> _GlobEcho(string root, int depth)
        {
            List<string> result = new List<string>();
            if (string.IsNullOrEmpty(root) || !Directory.Exists(root) || depth < 0) return result;
            try
            {
                foreach (string file in Directory.GetFiles(root, "ECHO*.exe"))
                {
                    string name = Path.GetFileName(file);
                    if (Regex.IsMatch(name, "^(?i:ECHO)(\\s+(?:NEXT|Playtest|Steam))?\\.exe$")) result.Add(file);
                }
            }
            catch { }
            if (depth > 0)
            {
                try
                {
                    foreach (string dir in Directory.GetDirectories(root))
                    {
                        // 不钻进 Steam 的下载/缓存目录
                        string leaf = Path.GetFileName(dir);
                        if (leaf.Equals("steamapps", StringComparison.OrdinalIgnoreCase)) continue;
                        result.AddRange(_GlobEcho(dir, depth - 1));
                    }
                }
                catch { }
            }
            return result;
        }

        private static int Rank(string exePath)
        {
            string normalized = exePath.Replace('/', '\\');
            string name = Path.GetFileName(normalized);
            string parent = Path.GetFileName(Path.GetDirectoryName(normalized));
            if (name.Equals("ECHO Playtest.exe", StringComparison.OrdinalIgnoreCase)
                || normalized.ToLowerInvariant().Contains("\\echo playtest\\")) return 80;
            if (name.Equals("ECHO NEXT.exe", StringComparison.OrdinalIgnoreCase)) return 70;
            if (normalized.ToLowerInvariant().EndsWith("\\common\\echo\\echo.exe")) return 0;
            if (name.Equals("ECHO Steam.exe", StringComparison.OrdinalIgnoreCase)) return 10;
            if (name.Equals("ECHO.exe", StringComparison.OrdinalIgnoreCase)) return 20;
            return 40;
        }

        private List<string> SteamCommonFolders()
        {
            List<string> commons = new List<string>();
            List<string> steamRoots = new List<string>();

            // Steam 客户端安装位置（注册表最可靠，其它是兜底）
            string fromRegistry = null;
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam"))
                {
                    if (key != null) fromRegistry = key.GetValue("SteamPath") as string;
                }
            }
            catch { }
            if (string.IsNullOrEmpty(fromRegistry))
            {
                try
                {
                    using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Valve\Steam"))
                    {
                        if (key != null) fromRegistry = key.GetValue("InstallPath") as string;
                    }
                }
                catch { }
            }

            foreach (string root in new string[] {
                fromRegistry,
                Path.Combine(ProgramFilesX86, "Steam"),
                Path.Combine(ProgramFiles, "Steam"),
                Path.Combine(this.localAppData, "Steam"),
            })
            {
                if (!string.IsNullOrEmpty(root) && Directory.Exists(root) && !steamRoots.Contains(root)) steamRoots.Add(root);
            }

            foreach (string root in steamRoots)
            {
                commons.Add(Path.Combine(root, "steamapps", "common"));
                string vdf = Path.Combine(root, "steamapps", "libraryfolders.vdf");
                if (!File.Exists(vdf)) continue;
                try
                {
                    string text = File.ReadAllText(vdf);
                    foreach (Match m in Regex.Matches(text, "\"path\"\\s+\"([^\"]+)\""))
                    {
                        string library = m.Groups[1].Value.Replace("\\\\", "\\");
                        commons.Add(Path.Combine(library, "steamapps", "common"));
                        commons.Add(library);
                    }
                }
                catch { }
            }

            // 常见的非默认库位置
            foreach (DriveInfo drive in DriveInfo.GetDrives())
            {
                try
                {
                    if (drive.DriveType != DriveType.Fixed) continue;
                    commons.Add(Path.Combine(drive.RootDirectory.FullName, "SteamLibrary", "steamapps", "common"));
                    commons.Add(Path.Combine(drive.RootDirectory.FullName, "steamapps", "common"));
                    commons.Add(Path.Combine(drive.RootDirectory.FullName, "Steam", "steamapps", "common"));
                    commons.Add(Path.Combine(drive.RootDirectory.FullName, "Program Files (x86)", "Steam", "steamapps", "common"));
                }
                catch { }
            }

            return commons;
        }

        public Target Describe(string echoExe)
        {
            Target t = new Target();
            t.EchoExe = echoExe;
            t.EchoRoot = Path.GetDirectoryName(echoExe);
            t.LoaderRoot = Path.Combine(t.EchoRoot, "ShinawaseLoader");
            string[] installed = ReadLoaderVersion(Path.Combine(t.LoaderRoot, "loader-version.json"));
            if (installed != null)
            {
                t.InstalledVersion = installed[0];
                t.NodeVersion = installed[1];
            }
            return t;
        }

        public bool IsUsableEcho(string echoExe)
        {
            if (string.IsNullOrEmpty(echoExe) || !File.Exists(echoExe)) return false;
            string root = Path.GetDirectoryName(echoExe);
            if (!File.Exists(Path.Combine(root, "resources", "app.asar"))) return false;
            if (!File.Exists(Path.Combine(root, "version"))) return false;
            return true;
        }

        // 只靠「有 version + app.asar」判断会把假的 / 残缺的目录也算成 ECHO，
        // 一旦被写进 selection.json，官方脚本之后就会一直装到错的地方。
        // 所以再要求几个 Electron 必备载荷文件，并检查 asar 体积像不像真游戏。
        public bool LooksLikeRealEcho(string echoExe)
        {
            if (!this.IsUsableEcho(echoExe)) return false;
            string root = Path.GetDirectoryName(echoExe);

            int markers = 0;
            foreach (string name in new string[] { "icudtl.dat", "resources.pak", "chrome_100_percent.pak", "snapshot_blob.bin" })
            {
                if (File.Exists(Path.Combine(root, name))) markers++;
            }
            if (markers < 2) return false;

            FileInfo asar = new FileInfo(Path.Combine(root, "resources", "app.asar"));
            return asar.Length >= 4L * 1024 * 1024;   // 真游戏是几十 MB；测试桩只有几百字节
        }

        // ---- 网络 -------------------------------------------------------

        public string FetchRemoteVersion()
        {
            try
            {
                using (WebClient client = NewClient())
                {
                    string json = client.DownloadString(Const.RepoRaw + "/ShinawaseLoader/loader-version.json");
                    Match m = Regex.Match(json, "\"version\"\\s*:\\s*\"([^\"]+)\"");
                    return m.Success ? m.Groups[1].Value : null;
                }
            }
            catch
            {
                return null;
            }
        }

        private string FetchRemoteCommit()
        {
            try
            {
                using (WebClient client = NewClient())
                {
                    string json = client.DownloadString(Const.CommitApi);
                    Match m = Regex.Match(json, "\"sha\"\\s*:\\s*\"([0-9a-f]{7,40})\"");
                    return m.Success ? m.Groups[1].Value : null;
                }
            }
            catch { return null; }
        }

        private static WebClient NewClient()
        {
            WebClient client = new WebClient();
            client.Headers.Add("User-Agent", Const.UserAgent);
            client.Encoding = Encoding.UTF8;
            return client;
        }

        // .NET Framework 默认只协商 SSL3/TLS1.0，2026 年的 GitHub 会直接拒掉
        // （报「未能创建 SSL/TLS 安全通道」）。这里显式打开 TLS 1.2+。
        private static void EnsureTls()
        {
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12
                    | SecurityProtocolType.Tls11
                    | SecurityProtocolType.Tls
                    | (SecurityProtocolType)12288;   // Tls13（旧框架上该值不存在，用字面量）
            }
            catch { }
        }

        private void Download(string url, string destination, string label)
        {
            EnsureTls();
            Exception last = null;
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                if (this.cancelled) throw new OperationCanceledException("已取消");
                try
                {
                    this.DownloadOnce(url, destination, label);
                    return;
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    last = ex;
                    try { if (File.Exists(destination)) File.Delete(destination); } catch { }
                    if (attempt < 3)
                    {
                        this.log.Line("下载失败（第 " + attempt + " 次）：" + ex.Message + "，重试中...", LogKind.Warn);
                        Thread.Sleep(1500 * attempt);
                    }
                }
            }
            throw new IOException("下载 " + label + " 失败（已重试 3 次）：" + (last != null ? last.Message : "未知错误")
                + Environment.NewLine
                + "可以把 GitHub 上的 ShinawaseLoader 源码 zip 手动放到 "
                + Path.Combine(this.cacheRoot, "ShinawaseLoader-main.zip") + "，再用 --offline 安装。");
        }

        // 自己读流写文件：WebClient 的异步下载在部分代理 / TLS 环境下会提前收工，
        // 落一个截断的 zip（表现为「中央目录损坏」），所以不用它。
        private void DownloadOnce(string url, string destination, string label)
        {
            EnsureDir(Path.GetDirectoryName(destination));
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.UserAgent = Const.UserAgent;
            request.Timeout = 30000;
            request.ReadWriteTimeout = 120000;
            request.AllowAutoRedirect = true;

            using (WebResponse response = request.GetResponse())
            using (Stream input = response.GetResponseStream())
            using (FileStream output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                long total = response.ContentLength;
                long loaded = 0;
                byte[] buffer = new byte[128 * 1024];
                int reported = -1;
                int read;
                while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                {
                    if (this.cancelled) throw new OperationCanceledException("已取消");
                    output.Write(buffer, 0, read);
                    loaded += read;
                    if (total > 0)
                    {
                        int percent = (int)Math.Min(100, loaded * 100 / total);
                        if (percent != reported)
                        {
                            reported = percent;
                            this.log.Progress(percent);
                        }
                    }
                }
                output.Flush(true);

                if (total > 0 && loaded != total)
                {
                    throw new IOException("下载不完整：" + loaded + " / " + total + " 字节");
                }
                if (loaded < 1024)
                {
                    throw new IOException("下载内容异常，只有 " + loaded + " 字节");
                }
                this.log.Progress(100);
            }

            // 代理 / 劫持页会返回 200 和一堆 HTML，所以再验一次这确实是能打开的 zip
            VerifyZip(destination);
        }

        private static void VerifyZip(string path)
        {
            FileInfo info = new FileInfo(path);
            if (!info.Exists || info.Length < 4096)
            {
                throw new IOException("下载内容异常（只有 " + (info.Exists ? info.Length : 0) + " 字节）");
            }
            try
            {
                using (ZipArchive archive = ZipFile.OpenRead(path))
                {
                    if (archive.Entries.Count == 0) throw new IOException("zip 是空的");
                }
            }
            catch (InvalidDataException ex)
            {
                throw new IOException("下载到的不是有效 zip（" + ex.Message + "）");
            }
        }

        // ---- 主流程 -----------------------------------------------------

        public string LatestVersion;

        public void Run(Target target, bool force, bool noNetwork)
        {
            this.log.Step(1, 5, "读取远端版本");
            string remote = noNetwork ? null : this.FetchRemoteVersion();
            this.LatestVersion = remote;
            if (remote == null)
            {
                this.log.Line(noNetwork
                    ? "已跳过联网，使用本地缓存 / 已安装版本。"
                    : "无法连接 GitHub 读取版本号，将尝试使用本地缓存。", LogKind.Warn);
            }
            else
            {
                this.log.Line("Loader 最新版本： " + remote, LogKind.Info);
            }

            bool needInstall = true;
            if (!force && remote != null && target.InstalledVersion != null)
            {
                if (CompareVersion(target.InstalledVersion, remote) >= 0)
                {
                    needInstall = false;
                    this.log.Line("已安装版本 " + target.InstalledVersion + " 不低于最新版，跳过下载。", LogKind.Good);
                }
            }

            if (needInstall)
            {
                this.log.Step(2, 5, "准备安装源");
                string source = this.PrepareSource(remote);
                if (source == null) throw new IOException("无法获取 ShinawaseLoader 安装源（联网失败且本地无缓存）。");

                this.log.Step(3, 5, "下载并解压");
                // 下载/解压已在 PrepareSource 内完成，这里只报告
                this.log.Line("解压目录：" + source, LogKind.Dim);

                this.CancelCheck();
                this.log.Step(4, 5, "构建隔离运行时");
                this.log.Line("正在调用官方安装脚本（复制 Loader / 准备 Node / 同步运行时 / 编译 ECHO.modded.exe）...", LogKind.Info);
                this.log.Line("首次安装需要下载 Node 运行时并复制 asar，通常 1-3 分钟，请勿关闭窗口。", LogKind.Dim);
                this.RunSetupScript(source, target, force ? "update" : "install");
            }
            else
            {
                this.log.Step(2, 5, "准备安装源");
                this.log.Line("跳过下载。", LogKind.Dim);
                this.log.Step(3, 5, "下载并解压");
                this.log.Line("跳过解压。", LogKind.Dim);
                this.log.Step(4, 5, "构建隔离运行时");
                this.log.Line("跳过安装。", LogKind.Dim);
            }

            this.log.Step(5, 5, "校验");
            Target after = this.Describe(target.EchoExe);
            this.EnsureUsablePorts(after);
            this.Verify(after);
            this.TryInstallBridgeDeps(after);
        }

        // Windows 会把一批 TCP 端口保留给 Hyper-V / WSL / Docker，被保留的端口任何进程都绑不上
        // （错误是 "An attempt was made to access a socket in a way forbidden by its access
        // permissions"）。Loader 默认的 CDP 端口 9229 / inspector 9230 经常正好落在保留范围
        // （例如 9185-9284）里，于是游戏开不出调试端口、Loader 永远连不上，用户看到的就是
        // 「点了 ECHO.modded.exe 但模组不显示」。这里检测并自动换成可用端口。
        private void EnsureUsablePorts(Target target)
        {
            string configPath = Path.Combine(target.LoaderRoot, "loader.config.json");
            if (!File.Exists(configPath)) return;

            int debugPort, inspectPort;
            string text;
            try
            {
                text = File.ReadAllText(configPath, Encoding.UTF8);
                debugPort = ParseJsonInt(text, "debugPort", 9229);
                inspectPort = ParseJsonInt(text, "inspectPort", 9230);
            }
            catch (Exception ex)
            {
                this.log.Line("读不到 loader.config.json 的端口配置：" + ex.Message, LogKind.Dim);
                return;
            }

            bool debugOk = IsPortUsable(debugPort);
            bool inspectOk = IsPortUsable(inspectPort);
            if (debugOk && inspectOk) return;

            this.log.Line("检测到 Loader 端口不可用（通常是被 Windows 保留端口范围占用）：", LogKind.Warn);
            if (!debugOk) this.log.Line("  CDP debugPort " + debugPort + " 绑不上 —— 这正是模组不显示的原因。", LogKind.Warn);
            if (!inspectOk) this.log.Line("  inspector inspectPort " + inspectPort + " 绑不上。", LogKind.Warn);

            int newDebug = debugOk ? debugPort : FindFreePort(debugPort + 10000);
            int newInspect = inspectOk ? inspectPort : FindFreePort(inspectPort + 10000);
            if (newDebug <= 0 || newInspect <= 0)
            {
                this.log.Line("自动找可用端口失败，请手动改 ShinawaseLoader\\loader.config.json。", LogKind.Bad);
                return;
            }

            try
            {
                File.Copy(configPath, configPath + ".bak", true);
                string updated = SetJsonInt(SetJsonInt(text, "debugPort", newDebug), "inspectPort", newInspect);
                File.WriteAllText(configPath, updated, new UTF8Encoding(false));
                this.log.Line("已把 Loader 端口改为 debugPort=" + newDebug + " / inspectPort=" + newInspect + "（原配置备份为 loader.config.json.bak）。", LogKind.Good);
                this.log.Line("重启游戏后 CDP 注入即可正常工作。", LogKind.Info);
            }
            catch (Exception ex)
            {
                this.log.Line("写回端口配置失败：" + ex.Message, LogKind.Warn);
            }
        }

        private static int ParseJsonInt(string text, string key, int fallback)
        {
            Match m = Regex.Match(text, "\"" + Regex.Escape(key) + "\"\\s*:\\s*(\\d+)");
            if (!m.Success) return fallback;
            int value;
            return int.TryParse(m.Groups[1].Value, out value) ? value : fallback;
        }

        private static string SetJsonInt(string text, string key, int value)
        {
            // Regex.Replace 的 4 参重载第 4 个参数是 RegexOptions（不是替换次数），
            // 所以这里用 Regex 对象来限定只替换第一次出现。
            Regex pattern = new Regex("(\"" + Regex.Escape(key) + "\"\\s*:\\s*)\\d+");
            if (!pattern.IsMatch(text)) return text;
            return pattern.Replace(text, "${1}" + value.ToString(CultureInfo.InvariantCulture), 1);
        }

        // 先问 Windows 的保留范围，再真的试绑一次；
        // 绑不上但端口本身正处于 LISTENING，说明是游戏在用（工作正常），不算问题。
        private static bool IsPortUsable(int port)
        {
            if (port <= 0 || port > 65535) return false;
            try
            {
                ProcessStartInfo info = new ProcessStartInfo("netsh", "int ipv4 show excludedportrange protocol=tcp");
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.RedirectStandardOutput = true;
                using (Process process = Process.Start(info))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();
                    foreach (Match m in Regex.Matches(output, @"^\s*(\d+)\s+(\d+)", RegexOptions.Multiline))
                    {
                        int start = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
                        int end = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
                        if (port >= start && port <= end) return false;
                    }
                }
            }
            catch { }

            try
            {
                System.Net.Sockets.TcpListener listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, port);
                listener.Start();
                listener.Stop();
                return true;
            }
            catch
            {
                return IsPortListening(port);
            }
        }

        private static bool IsPortListening(int port)
        {
            // 直接问 Windows 的 TCP 表（按端口匹配），比解析 netstat 文本可靠
            foreach (bool ipv6 in new bool[] { false, true })
            {
                int bufferSize = 0;
                uint family = (uint)(ipv6 ? 23 : 2);   // AF_INET6 = 23, AF_INET = 2
                if (GetExtendedTcpTable(IntPtr.Zero, ref bufferSize, false, family, 3, 0) != 0 || bufferSize <= 0) continue;
                IntPtr buffer = System.Runtime.InteropServices.Marshal.AllocHGlobal(bufferSize);
                try
                {
                    if (GetExtendedTcpTable(buffer, ref bufferSize, false, family, 3, 0) != 0) continue;
                    int rowSize = ipv6 ? 56 : 24;      // MIB_TCPROW_OWNER_PID / MIB_TCP6ROW_OWNER_PID
                    int count = System.Runtime.InteropServices.Marshal.ReadInt32(buffer);
                    for (int i = 0; i < count; i++)
                    {
                        IntPtr row = new IntPtr(buffer.ToInt64() + 4 + i * rowSize);
                        int state = ipv6
                            ? System.Runtime.InteropServices.Marshal.ReadInt32(row, 48)
                            : System.Runtime.InteropServices.Marshal.ReadInt32(row, 0);
                        if (state != 2) continue;      // MIB_TCP_STATE_LISTEN
                        int localPort = ipv6 ? ReadPortAt(row, 20) : ReadPortAt(row, 8);
                        if (localPort == port) return true;
                    }
                }
                finally
                {
                    System.Runtime.InteropServices.Marshal.FreeHGlobal(buffer);
                }
            }
            return false;
        }

        // 端口号在 DWORD 的低 16 位，网络字节序
        private static int ReadPortAt(IntPtr row, int offset)
        {
            int raw = System.Runtime.InteropServices.Marshal.ReadInt32(row, offset);
            return ((raw & 0xFF) << 8) | ((raw >> 8) & 0xFF);
        }

        [System.Runtime.InteropServices.DllImport("iphlpapi.dll", SetLastError = true)]
        private static extern uint GetExtendedTcpTable(IntPtr tcpTable, ref int size, bool order, uint family, int tableClass, int reserved);

        private static int FindFreePort(int start)
        {
            for (int port = start; port < start + 2000 && port <= 65535; port++)
            {
                if (IsPortUsable(port)) return port;
            }
            return -1;
        }

        // Loader 只用 npm 装 @neteasecloudmusicapienhanced/api（网易云增强客户端）。
        // 官方脚本走 PATH 上的 npm，机器上 npm 装坏时（npm.cmd 指向不存在的
        // npm-cli.js）就会静默失败，网易云退化成公开接口。这里兜一层：
        // 依赖缺失时直接调 node + npm-cli.js，并多找几个候选路径。
        private void TryInstallBridgeDeps(Target target)
        {
            string packageJson = Path.Combine(target.LoaderRoot, "package.json");
            if (!File.Exists(packageJson)) return;

            string marker = Path.Combine(target.LoaderRoot, "node_modules", "@neteasecloudmusicapienhanced", "api");
            if (Directory.Exists(marker)) return;

            string node = File.Exists(Path.Combine(target.LoaderRoot, "node.exe"))
                ? Path.Combine(target.LoaderRoot, "node.exe") : this.FindNodeExe(target);
            if (node == null) return;
            string nodeDir = Path.GetDirectoryName(node);

            List<string> candidates = new List<string>();
            string fromEnvironment = Environment.GetEnvironmentVariable("npm_config_prefix");
            if (!string.IsNullOrEmpty(fromEnvironment))
            {
                candidates.Add(Path.Combine(fromEnvironment, @"node_modules\npm\bin\npm-cli.js"));
            }
            candidates.Add(Path.Combine(nodeDir, @"node_modules\npm\bin\npm-cli.js"));
            candidates.Add(Path.Combine(this.localAppData, @"npm\node_modules\npm\bin\npm-cli.js"));
            try
            {
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                candidates.Add(Path.Combine(appData, @"npm\node_modules\npm\bin\npm-cli.js"));
                candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"nodejs\node_modules\npm\bin\npm-cli.js"));
                candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"nodejs\node_modules\npm\bin\npm-cli.js"));
            }
            catch { }

            // 系统 Node 装在别处（nvm / 自定义目录）时，从注册表拿安装位置
            foreach (string installPath in this.RegistryNodePaths())
            {
                candidates.Add(Path.Combine(installPath, @"node_modules\npm\bin\npm-cli.js"));
            }
            // 最后兜底：PATH 上目录旁边的 npm
            try
            {
                foreach (string dir in Environment.GetEnvironmentVariable("PATH").Split(';'))
                {
                    string trimmed = dir.Trim();
                    if (trimmed.Length == 0) continue;
                    candidates.Add(Path.Combine(trimmed, @"node_modules\npm\bin\npm-cli.js"));
                }
            }
            catch { }

            string npmCli = null;
            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate)) { npmCli = candidate; break; }
            }
            if (npmCli == null)
            {
                this.log.Line("没找到可用的 npm，跳过网易云增强客户端的安装（不影响其他平台）。", LogKind.Dim);
                return;
            }

            this.log.Line("补装 streaming bridge 依赖（@neteasecloudmusicapienhanced/api）...", LogKind.Info);
            List<string> args = new List<string>();
            args.Add(Quote(npmCli));
            args.Add("install");
            args.Add("--omit=dev");
            args.Add("--no-audit");
            args.Add("--no-fund");
            try
            {
                this.RunProcess(node, args, target.LoaderRoot, "npm");
            }
            catch (Exception ex)
            {
                this.log.Line("补装依赖失败：" + ex.Message, LogKind.Warn);
            }
            if (Directory.Exists(marker)) this.log.Line("依赖已就绪。", LogKind.Good);
            else this.log.Line("依赖仍未装上，网易云会走公开接口（其他平台不受影响）。", LogKind.Warn);
        }

        private void CancelCheck()
        {
            if (this.cancelled) throw new OperationCanceledException("已取消");
        }

        // 返回解压出来的 Loader 源目录（含 setup-modloader.ps1 的那一层）
        private string PrepareSource(string remoteVersion)
        {
            EnsureDir(this.cacheRoot);

            // 1) 用户手动放进缓存的压缩包优先（离线安装）
            string manual = Path.Combine(this.cacheRoot, "ShinawaseLoader-main.zip");
            if (File.Exists(manual) && !_Exists(Path.Combine(this.cacheRoot, ".ignore-manual")))
            {
                string extracted = Path.Combine(this.cacheRoot, "src-manual");
                if (!Directory.Exists(Path.Combine(extracted, Const.ZipRoot)))
                {
                    this.log.Line("发现本地压缩包，直接解压（离线安装）。", LogKind.Info);
                    this.log.Progress(30);
                    ExtractZip(manual, extracted);
                    this.log.Progress(70);
                }
                return this.FindSourceRoot(extracted);
            }

            // 2) 网络下载
            string commit = this.FetchRemoteCommit();
            string tag = commit != null ? commit.Substring(0, Math.Min(12, commit.Length)) : (remoteVersion ?? "main");
            string zipPath = Path.Combine(this.cacheRoot, "ShinawaseLoader-main-" + tag + ".zip");
            string srcDir = Path.Combine(this.cacheRoot, "src-" + tag);
            string setupPresent = Path.Combine(srcDir, Const.ZipRoot, Const.SetupScript);

            if (File.Exists(setupPresent))
            {
                this.log.Line("命中本地缓存（" + tag + "），跳过下载。", LogKind.Good);
                this.log.Progress(60);
                return this.FindSourceRoot(srcDir);
            }

            if (!File.Exists(zipPath))
            {
                this.log.Line("正在下载安装源（约 40 MB）...", LogKind.Info);
                this.Download(Const.ArchiveUrl, zipPath, "ShinawaseLoader 源码");
            }
            else
            {
                this.log.Line("复用已下载的压缩包 " + Path.GetFileName(zipPath), LogKind.Dim);
            }

            this.CancelCheck();
            this.log.Line("正在解压...", LogKind.Info);
            if (Directory.Exists(srcDir)) { try { Directory.Delete(srcDir, true); } catch { } }
            ExtractZip(zipPath, srcDir);
            this.log.Progress(100);
            return this.FindSourceRoot(srcDir);
        }

        // scripts/setup-modloader.ps1 位于仓库根（ShinawaseLoader-main/），
        // 而同级的 ShinawaseLoader/ 只是它要复制的 Loader 本体。
        private string FindSourceRoot(string extracted)
        {
            string nested = Path.Combine(extracted, Const.ZipRoot);
            if (File.Exists(Path.Combine(nested, Const.SetupScript))) return nested;
            if (File.Exists(Path.Combine(extracted, Const.SetupScript))) return extracted;
            try
            {
                foreach (string hit in Directory.GetFiles(extracted, "setup-modloader.ps1", SearchOption.AllDirectories))
                {
                    return Path.GetDirectoryName(Path.GetDirectoryName(hit));
                }
            }
            catch { }
            throw new IOException("解压结果里找不到 scripts\\setup-modloader.ps1。");
        }

        private static void ExtractZip(string zipPath, string destination)
        {
            EnsureDir(destination);
            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string name = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                    string target = Path.Combine(destination, name);
                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        EnsureDir(target);
                        continue;
                    }
                    EnsureDir(Path.GetDirectoryName(target));
                    entry.ExtractToFile(target, true);
                }
            }
        }

        // 预置 selection.json，让官方脚本不再弹语言选择 / 游戏目录选择
        private void SeedSelection(Target target)
        {
            string dir = Path.Combine(this.localAppData, "ShinawaseLoader");
            EnsureDir(dir);
            string path = Path.Combine(dir, "selection.json");
            string existing = ReadJsonString(path, "locale");
            string locale = string.IsNullOrEmpty(existing) ? "zh" : existing;
            string json = "{\r\n"
                + "  \"echoExe\": \"" + JsonEscape(target.EchoExe) + "\",\r\n"
                + "  \"locale\": \"" + locale + "\",\r\n"
                + "  \"selectedAt\": \"" + DateTime.UtcNow.ToString("o") + "\"\r\n"
                + "}\r\n";
            File.WriteAllText(path, json, new UTF8Encoding(false));
        }

        private void RunSetupScript(string source, Target target, string action)
        {
            this.SeedSelection(target);
            string script = Path.Combine(source, Const.SetupScript);
            if (!File.Exists(script)) throw new IOException("缺少官方安装脚本：" + script);

            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
            if (!File.Exists(powershell)) powershell = "powershell.exe";

            string arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\""
                + " -Action " + action
                + " -EchoRoot \"" + target.EchoExe + "\" -Force";

            ProcessStartInfo info = new ProcessStartInfo(powershell, arguments);
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.StandardOutputEncoding = Encoding.UTF8;
            info.StandardErrorEncoding = Encoding.UTF8;
            info.WorkingDirectory = target.EchoRoot;

            StringBuilder tail = new StringBuilder();
            using (Process process = new Process())
            {
                process.StartInfo = info;
                DataReceivedEventHandler onLine = delegate(object s, DataReceivedEventArgs e)
                {
                    if (e.Data == null) return;
                    string line = e.Data.TrimEnd();
                    if (line.Length == 0) return;
                    tail.AppendLine(line);
                    if (tail.Length > 6000) tail.Remove(0, tail.Length - 6000);
                    this.log.Line("  " + line, LogKind.Dim);
                };
                process.OutputDataReceived += onLine;
                process.ErrorDataReceived += onLine;
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                while (!process.WaitForExit(200))
                {
                    if (this.cancelled)
                    {
                        try { process.Kill(); } catch { }
                        throw new OperationCanceledException("已取消");
                    }
                }
                process.WaitForExit();
                if (process.ExitCode != 0)
                {
                    // 官方脚本会在「隔离运行时同步」失败时直接退出（例如 Loader 的 asar
                    // 补丁锚点对不上当前 ECHO 构建）。这时 Loader 文件、Node、modded-runtime
                    // 通常已经就绪，只是宿主和启动器还没生成——能补就补完，别让用户卡住。
                    string exitInfo = "官方安装脚本返回错误码 " + process.ExitCode + "。";
                    if (this.TryCompleteInstall(target))
                    {
                        this.log.Line(exitInfo + " 已自动补完剩余步骤。", LogKind.Warn);
                        this.log.Line("末尾输出：" + LastLines(tail.ToString(), 4), LogKind.Dim);
                        return;
                    }
                    throw new IOException(exitInfo
                        + Environment.NewLine + "最后输出：" + Environment.NewLine + tail.ToString().Trim());
                }
            }
        }

        private static string LastLines(string text, int count)
        {
            string[] lines = text.Trim().Split(new char[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
            StringBuilder sb = new StringBuilder();
            for (int i = Math.Max(0, lines.Length - count); i < lines.Length; i++)
            {
                if (sb.Length > 0) sb.Append(" / ");
                sb.Append(lines[i].Trim());
            }
            return sb.ToString();
        }

        // 官方脚本半途失败时的兜底：宿主 exe 与四个启动脚本，逻辑与 setup-modloader.ps1 一致。
        private bool TryCompleteInstall(Target target)
        {
            try
            {
                if (!Directory.Exists(Path.Combine(target.LoaderRoot, "modded-runtime")))
                {
                    this.log.Line("modded-runtime 不存在，兜底补完不适用。", LogKind.Dim);
                    return false;
                }

                string node = this.FindNodeExe(target);
                if (node == null)
                {
                    this.log.Line("找不到 node 运行时，兜底补完不适用。", LogKind.Dim);
                    return false;
                }

                string host = Path.Combine(target.EchoRoot, "ECHO.modded.exe");
                if (!File.Exists(host))
                {
                    this.log.Line("正在补编译 ECHO.modded.exe ...", LogKind.Info);
                    if (!this.BuildModdedHost(target, host)) return false;
                }

                this.WriteLaunchers(target, node, host);
                this.log.Line("已补写四个启动脚本。", LogKind.Good);
                return true;
            }
            catch (Exception ex)
            {
                this.log.Line("兜底补完失败：" + ex.Message, LogKind.Warn);
                return false;
            }
        }

        private string FindNodeExe(Target target)
        {
            string local = Path.Combine(target.LoaderRoot, "node.exe");
            if (File.Exists(local)) return local;

            // 官方脚本会把 Node 缓存到 %LOCALAPPDATA%\ShinawaseLoader\runtimes\node-<版本>
            string runtimes = Path.Combine(this.localAppData, "ShinawaseLoader", "runtimes");
            if (Directory.Exists(runtimes))
            {
                try
                {
                    foreach (string dir in Directory.GetDirectories(runtimes, "node-*"))
                    {
                        string candidate = Path.Combine(dir, "node.exe");
                        if (File.Exists(candidate))
                        {
                            try { File.Copy(candidate, local, true); return local; }
                            catch { return candidate; }
                        }
                    }
                }
                catch { }
            }

            string[] fromPath = new string[] { };
            try { fromPath = Environment.GetEnvironmentVariable("PATH").Split(';'); }
            catch { }
            foreach (string dir in fromPath)
            {
                try
                {
                    string candidate = Path.Combine(dir.Trim(), "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch { }
            }
            return null;
        }

        private bool BuildModdedHost(Target target, string output)
        {
            string source = Path.Combine(target.LoaderRoot, "modded-host.cs");
            if (!File.Exists(source))
            {
                this.log.Line("缺少 modded-host.cs，无法补编译宿主。", LogKind.Warn);
                return false;
            }

            string icon = Path.Combine(target.LoaderRoot, "echo-original.ico");
            if (!File.Exists(icon) && File.Exists(target.EchoExe))
            {
                try
                {
                    using (Icon extracted = Icon.ExtractAssociatedIcon(target.EchoExe))
                    {
                        if (extracted != null)
                        {
                            using (FileStream stream = File.Create(icon)) extracted.Save(stream);
                        }
                    }
                }
                catch { }
            }

            string compiler = null;
            foreach (string candidate in new string[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"Microsoft.NET\Framework\v4.0.30319\csc.exe"),
            })
            {
                if (File.Exists(candidate)) { compiler = candidate; break; }
            }
            if (compiler == null)
            {
                this.log.Line("找不到 C# 编译器（csc.exe），无法补编译宿主。", LogKind.Warn);
                return false;
            }

            List<string> args = new List<string>();
            args.Add("/nologo");
            args.Add("/target:winexe");
            args.Add("/optimize+");
            if (File.Exists(icon)) args.Add(Quote("/win32icon:" + icon));
            args.Add(Quote("/out:" + output));
            args.Add(Quote(source));

            this.RunProcess(compiler, args, target.EchoRoot, "csc");
            if (!File.Exists(output))
            {
                this.log.Line("补编译 ECHO.modded.exe 失败。", LogKind.Warn);
                return false;
            }
            return true;
        }

        private void WriteLaunchers(Target target, string node, string host)
        {
            string root = target.EchoRoot;
            string[] specs = new string[] {
                "start-echo-with-mods.cmd|host",
                "start-echo-debug.cmd|run --debug --log-level debug",
                "start-echo-safe.cmd|run --safe-mode",
                "attach-to-echo.cmd|attach",
            };
            foreach (string spec in specs)
            {
                string[] parts = spec.Split('|');
                string path = Path.Combine(target.LoaderRoot, parts[0]);
                string command = parts[1];
                string content;
                if (command == "host")
                {
                    content = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "cd /d \"" + root + "\"\r\n"
                        + "\"" + node + "\" \"%~dp0runtime-sync.mjs\" --echo \"" + root + "\"\r\n"
                        + "start \"\" \"" + host + "\" %*\r\n";
                }
                else
                {
                    content = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "cd /d \"" + root + "\"\r\n"
                        + "start \"\" \"" + node + "\" \"%~dp0ShinawaseLoader.mjs\" " + command + " --echo \"" + target.EchoExe + "\" %*\r\n";
                }
                File.WriteAllText(path, content, new UTF8Encoding(true));
            }
        }

        private static string Quote(string argument)
        {
            return argument.IndexOf(' ') >= 0 ? "\"" + argument + "\"" : argument;
        }

        // Node.js 安装程序会写 InstallPath / NodePath 注册表项
        private List<string> RegistryNodePaths()
        {
            List<string> found = new List<string>();
            string[] keys = new string[] {
                @"SOFTWARE\Node.js",
                @"SOFTWARE\WOW6432Node\Node.js",
            };
            RegistryKey[] roots = new RegistryKey[] { Registry.CurrentUser, Registry.LocalMachine };
            foreach (RegistryKey root in roots)
            {
                foreach (string keyName in keys)
                {
                    try
                    {
                        using (RegistryKey key = root.OpenSubKey(keyName))
                        {
                            if (key == null) continue;
                            foreach (string valueName in new string[] { "InstallPath", "NodePath" })
                            {
                                string value = key.GetValue(valueName) as string;
                                if (!string.IsNullOrEmpty(value) && !found.Contains(value)) found.Add(value);
                            }
                        }
                    }
                    catch { }
                }
            }
            return found;
        }

        private void RunProcess(string fileName, List<string> arguments, string workingDirectory, string label)
        {
            ProcessStartInfo info = new ProcessStartInfo(fileName);
            foreach (string argument in arguments) info.Arguments += (info.Arguments.Length > 0 ? " " : "") + argument;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.WorkingDirectory = workingDirectory;
            using (Process process = new Process())
            {
                process.StartInfo = info;
                DataReceivedEventHandler onLine = delegate(object s, DataReceivedEventArgs e)
                {
                    if (e.Data == null) return;
                    string line = e.Data.TrimEnd();
                    if (line.Length > 0) this.log.Line("  [" + label + "] " + line, LogKind.Dim);
                };
                process.OutputDataReceived += onLine;
                process.ErrorDataReceived += onLine;
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();
            }
        }

        // ---- 校验 -------------------------------------------------------

        public List<string> Verify(Target target)
        {
            List<string> problems = new List<string>();

            Check(target, problems, "ECHO.modded.exe", Path.Combine(target.EchoRoot, "ECHO.modded.exe"), true);
            Check(target, problems, "node.exe 运行时", Path.Combine(target.LoaderRoot, "node.exe"), true);
            Check(target, problems, "ShinawaseLoader.mjs", Path.Combine(target.LoaderRoot, "ShinawaseLoader.mjs"), true);
            Check(target, problems, "runtime-sync.mjs", Path.Combine(target.LoaderRoot, "runtime-sync.mjs"), true);
            Check(target, problems, "loader.config.json", Path.Combine(target.LoaderRoot, "loader.config.json"), true);
            Check(target, problems, "隔离运行时 modded-runtime", Path.Combine(target.LoaderRoot, "modded-runtime"), false);
            Check(target, problems, "启动器 start-echo-with-mods.cmd", Path.Combine(target.LoaderRoot, "start-echo-with-mods.cmd"), true);
            Check(target, problems, "Mods 目录", Path.Combine(target.EchoRoot, "Mods"), false);

            if (target.InstalledVersion == null)
            {
                problems.Add("未读到 ShinawaseLoader\\loader-version.json");
            }
            else if (CompareVersion(target.InstalledVersion, Const.MinLoaderVersion) < 0)
            {
                problems.Add("Loader 版本 " + target.InstalledVersion + " 低于本模组要求的 " + Const.MinLoaderVersion);
            }

            if (problems.Count == 0)
            {
                this.log.Line("全部校验通过（Loader " + target.InstalledVersion + "）。", LogKind.Good);
            }
            else
            {
                foreach (string p in problems) this.log.Line("缺项：" + p, LogKind.Bad);
            }

            // 隔离运行时有没有真的被注入 Loader 桥接：拷过去但没打上补丁的运行时
            // （copied-unpatched）不会报错，但模组在游戏里会取不到 Loader 服务。
            this.ReportRuntimePatch(target);
            return problems;
        }

        private void ReportRuntimePatch(Target target)
        {
            string asar = Path.Combine(target.LoaderRoot, "modded-runtime", "resources", "app.asar");
            if (!File.Exists(asar)) return;

            bool patched = ContainsMarker(asar, "shinawase-loader-preload-bridge-v1");
            if (patched)
            {
                this.log.Line("隔离运行时已注入 Loader 桥接。", LogKind.Good);
            }
            else
            {
                this.log.Line("隔离运行时是「已复制但未打补丁」的状态：Loader 的 asar 补丁没能套上当前 ECHO 构建。", LogKind.Warn);
                this.log.Line("Loader 界面仍可用（走 CDP 注入），但游戏内的流媒体桥接不会生效。", LogKind.Dim);
            }
        }

        // 大 asar（几十 MB）用流式分块查找，避免整体读进内存
        private static bool ContainsMarker(string path, string marker)
        {
            byte[] needle = Encoding.UTF8.GetBytes(marker);
            int chunkSize = 1024 * 1024;
            byte[] buffer = new byte[chunkSize + needle.Length];
            int carry = 0;
            try
            {
                using (FileStream stream = File.OpenRead(path))
                {
                    while (true)
                    {
                        int read = stream.Read(buffer, carry, chunkSize);
                        if (read <= 0) break;
                        int total = carry + read;
                        int at = IndexOf(buffer, total, needle);
                        if (at >= 0) return true;
                        carry = Math.Min(needle.Length - 1, total);
                        Array.Copy(buffer, total - carry, buffer, 0, carry);
                    }
                }
            }
            catch { }
            return false;
        }

        private static int IndexOf(byte[] haystack, int length, byte[] needle)
        {
            int limit = length - needle.Length;
            for (int i = 0; i <= limit; i++)
            {
                int j = 0;
                while (j < needle.Length && haystack[i + j] == needle[j]) j++;
                if (j == needle.Length) return i;
            }
            return -1;
        }

        private void Check(Target target, List<string> problems, string label, string path, bool isFile)
        {
            bool ok = isFile ? File.Exists(path) : Directory.Exists(path);
            if (ok)
            {
                this.log.Line("OK   " + label, LogKind.Good);
            }
            else
            {
                this.log.Line("缺失 " + label + "   -> " + path, LogKind.Bad);
                problems.Add(label + " 缺失（" + path + "）");
            }
        }
    }

    // ---------------------------------------------------------------- 控件 ----

    internal class FlatButton : Button
    {
        public Color BackNormal = Color.FromArgb(88, 101, 242);
        public Color BackHover = Color.FromArgb(104, 116, 247);
        public Color BackPress = Color.FromArgb(74, 86, 214);

        public FlatButton()
        {
            this.FlatStyle = FlatStyle.Flat;
            this.FlatAppearance.BorderSize = 0;
            this.BackColor = this.BackNormal;
            this.ForeColor = Color.White;
            this.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold);
            this.Cursor = Cursors.Hand;
            this.UseVisualStyleBackColor = false;
        }

        protected override void OnMouseEnter(EventArgs e) { this.BackColor = this.BackHover; base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { this.BackColor = this.BackNormal; base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { this.BackColor = this.BackPress; base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { this.BackColor = this.BackHover; base.OnMouseUp(e); }

        public void MakeGhost()
        {
            this.BackNormal = Color.FromArgb(48, 52, 66);
            this.BackHover = Color.FromArgb(62, 67, 84);
            this.BackPress = Color.FromArgb(40, 44, 56);
            this.BackColor = this.BackNormal;
            this.ForeColor = Color.FromArgb(222, 226, 238);
            this.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular);
        }
    }

    internal class LogBox : RichTextBox
    {
        public LogBox()
        {
            this.BackColor = Color.FromArgb(22, 24, 32);
            this.ForeColor = Color.FromArgb(214, 219, 232);
            this.BorderStyle = BorderStyle.None;
            this.Font = new Font("Consolas", 9.5F);
            this.ReadOnly = true;
            this.WordWrap = true;
            this.DetectUrls = false;
            this.ScrollBars = RichTextBoxScrollBars.Vertical;
        }

        // 线程安全追加
        public void Append(string text, Color color)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                try { this.BeginInvoke(new Action<string, Color>(this.Append), text, color); } catch { }
                return;
            }
            this.SelectionStart = this.TextLength;
            this.SelectionLength = 0;
            this.SelectionColor = color;
            this.AppendText(text + Environment.NewLine);
            this.SelectionColor = this.ForeColor;
            this.SelectionStart = this.TextLength;
            this.ScrollToCaret();
        }

        public void ClearAll()
        {
            if (this.InvokeRequired) { try { this.BeginInvoke(new Action(this.ClearAll)); } catch { } return; }
            this.Clear();
        }
    }

    // ------------------------------------------------------------------ 窗口 ----

    internal class MainForm : Form, ILog
    {
        private readonly InstallerCore core;
        private Target target;
        private bool busy;

        private Label pathValue;
        private Label stateValue;
        private Label loaderValue;
        private Label nodeValue;
        private Label stepLabel;
        private ProgressBar bar;
        private LogBox logBox;
        private FlatButton installButton;
        private FlatButton cancelButton;
        private FlatButton refreshButton;
        private FlatButton openFolderButton;
        private FlatButton launchOptionsButton;
        private FlatButton launchButton;
        private FlatButton browseButton;
        private Label hintLabel;

        private static readonly Color Ink = Color.FromArgb(233, 236, 244);
        private static readonly Color Muted = Color.FromArgb(140, 148, 168);
        private static readonly Color Ok = Color.FromArgb(96, 210, 140);
        private static readonly Color Bad = Color.FromArgb(248, 118, 118);
        private static readonly Color Warn = Color.FromArgb(240, 196, 100);

        public MainForm(string startEchoExe)
        {
            this.core = new InstallerCore(this);
            this.Text = "ShinawaseLoader 安装器";
            this.ClientSize = new Size(720, 640);
            this.MinimumSize = new Size(640, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(30, 32, 42);
            this.ForeColor = Ink;
            this.Font = new Font("Microsoft YaHei UI", 9F);
            try { this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            this.BuildUi();
            this.Shown += delegate { this.RefreshStatus(startEchoExe); };
        }

        // ---- 界面构建 ---------------------------------------------------

        private void BuildUi()
        {
            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 74;
            header.BackColor = Color.FromArgb(36, 39, 52);
            this.Controls.Add(header);

            Label title = new Label();
            title.Text = "ShinawaseLoader 安装器";
            title.Font = new Font("Microsoft YaHei UI", 16F, FontStyle.Bold);
            title.ForeColor = Ink;
            title.AutoSize = true;
            title.Location = new Point(22, 14);
            header.Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "把模组加载器装进 Steam 版 ECHO —— 装好后在游戏里拖入 .echomod 即可管理模组";
            subtitle.Font = new Font("Microsoft YaHei UI", 9F);
            subtitle.ForeColor = Muted;
            subtitle.AutoSize = true;
            subtitle.Location = new Point(24, 46);
            header.Controls.Add(subtitle);

            // 状态区
            TableLayoutPanel status = new TableLayoutPanel();
            status.Dock = DockStyle.Top;
            status.Height = 132;
            status.Padding = new Padding(24, 12, 24, 6);
            status.ColumnCount = 2;
            status.RowCount = 4;
            status.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 96));
            status.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int i = 0; i < 4; i++) status.RowStyles.Add(new RowStyle(SizeType.Percent, 25));
            this.Controls.Add(status);

            pathValue = AddStatusRow(status, 0, "游戏目录");
            stateValue = AddStatusRow(status, 1, "状态");
            loaderValue = AddStatusRow(status, 2, "Loader 版本");
            nodeValue = AddStatusRow(status, 3, "Node 运行时");

            // 中间：步骤 + 进度条 + 日志
            // Dock 的填充规则是「后加的排前面」，所以先加 Fill，再依次加 Top，顺序反了日志区会被挤掉。
            Panel middle = new Panel();
            middle.Dock = DockStyle.Fill;
            middle.Padding = new Padding(24, 8, 24, 0);
            this.Controls.Add(middle);

            logBox = new LogBox();
            logBox.Dock = DockStyle.Fill;
            middle.Controls.Add(logBox);

            Panel logHost = new Panel();
            logHost.Dock = DockStyle.Fill;
            logHost.Padding = new Padding(0, 8, 0, 0);
            logHost.Controls.Add(logBox);
            middle.Controls.Add(logHost);

            bar = new ProgressBar();
            bar.Dock = DockStyle.Top;
            bar.Height = 6;
            bar.Style = ProgressBarStyle.Continuous;
            bar.Maximum = 100;
            middle.Controls.Add(bar);

            stepLabel = new Label();
            stepLabel.Dock = DockStyle.Top;
            stepLabel.Height = 24;
            stepLabel.ForeColor = Muted;
            stepLabel.Text = "准备就绪。";
            middle.Controls.Add(stepLabel);

            // 底部按钮
            Panel footer = new Panel();
            footer.Dock = DockStyle.Bottom;
            footer.Height = 92;
            footer.Padding = new Padding(24, 10, 24, 14);
            this.Controls.Add(footer);

            installButton = new FlatButton();
            installButton.Text = "安装 / 更新";
            installButton.Size = new Size(132, 38);
            installButton.Location = new Point(24, 10);
            installButton.Click += delegate { StartInstall(false); };
            footer.Controls.Add(installButton);

            cancelButton = new FlatButton();
            cancelButton.Text = "取消";
            cancelButton.MakeGhost();
            cancelButton.Size = new Size(78, 38);
            cancelButton.Location = new Point(166, 10);
            cancelButton.Enabled = false;
            cancelButton.Click += delegate { this.RequestCancel(); };
            footer.Controls.Add(cancelButton);

            refreshButton = new FlatButton();
            refreshButton.Text = "重新检测";
            refreshButton.MakeGhost();
            refreshButton.Size = new Size(96, 38);
            refreshButton.Location = new Point(254, 10);
            refreshButton.Click += delegate { this.RefreshStatus(null); };
            footer.Controls.Add(refreshButton);

            openFolderButton = new FlatButton();
            openFolderButton.Text = "打开游戏目录";
            openFolderButton.MakeGhost();
            openFolderButton.Size = new Size(112, 38);
            openFolderButton.Location = new Point(360, 10);
            openFolderButton.Click += delegate { this.OpenGameFolder(); };
            footer.Controls.Add(openFolderButton);

            browseButton = new FlatButton();
            browseButton.Text = "手动指定 ECHO.exe";
            browseButton.MakeGhost();
            browseButton.Size = new Size(136, 38);
            browseButton.Location = new Point(482, 10);
            browseButton.Click += delegate { this.Browse(); };
            footer.Controls.Add(browseButton);

            launchOptionsButton = new FlatButton();
            launchOptionsButton.Text = "复制 Steam 启动选项";
            launchOptionsButton.MakeGhost();
            launchOptionsButton.Size = new Size(152, 38);
            launchOptionsButton.Location = new Point(24, 52);
            launchOptionsButton.Click += delegate { this.CopyLaunchOptions(); };
            footer.Controls.Add(launchOptionsButton);

            launchButton = new FlatButton();
            launchButton.Text = "启动 ECHO.modded.exe";
            launchButton.MakeGhost();
            launchButton.Size = new Size(160, 38);
            launchButton.Location = new Point(186, 52);
            launchButton.Click += delegate { this.LaunchGame(); };
            footer.Controls.Add(launchButton);

            hintLabel = new Label();
            hintLabel.Text = "必须始终通过 ECHO.modded.exe 启动；直接开原版 ECHO.exe 不会加载任何模组。";
            hintLabel.ForeColor = Muted;
            hintLabel.AutoSize = false;
            hintLabel.Size = new Size(340, 36);
            hintLabel.Location = new Point(360, 56);
            footer.Controls.Add(hintLabel);
        }

        private Label AddStatusRow(TableLayoutPanel table, int row, string caption)
        {
            Label name = new Label();
            name.Text = caption;
            name.ForeColor = Muted;
            name.Dock = DockStyle.Fill;
            name.TextAlign = ContentAlignment.MiddleLeft;
            table.Controls.Add(name, 0, row);

            Label value = new Label();
            value.Text = "—";
            value.ForeColor = Ink;
            value.Dock = DockStyle.Fill;
            value.TextAlign = ContentAlignment.MiddleLeft;
            value.AutoEllipsis = true;
            table.Controls.Add(value, 1, row);
            return value;
        }

        // ---- 状态检测 ---------------------------------------------------

        public void RefreshStatus(string preferred)
        {
            string chosen = null;
            List<string> candidates = this.core.FindEchoCandidates();

            if (!string.IsNullOrEmpty(preferred))
            {
                foreach (string c in candidates)
                {
                    if (string.Equals(c, preferred, StringComparison.OrdinalIgnoreCase)) { chosen = c; break; }
                }
                if (chosen == null && this.core.IsUsableEcho(preferred)) chosen = preferred;
            }
            if (chosen == null)
            {
                // 自动挑选只认「看起来是真游戏」的目录：以前只要求有 version + app.asar，
                // 结果测试用的桩目录也会被选中，一旦写进 selection.json 就会一直装错地方。
                foreach (string c in candidates)
                {
                    if (this.core.LooksLikeRealEcho(c)) { chosen = c; break; }
                }
            }
            if (chosen == null)
            {
                foreach (string c in candidates)
                {
                    if (this.core.IsUsableEcho(c)) { chosen = c; break; }
                }
            }
            if (chosen == null && candidates.Count > 0) chosen = candidates[0];

            if (chosen == null)
            {
                this.target = null;
                pathValue.Text = "未找到 Steam 版 ECHO";
                pathValue.ForeColor = Bad;
                stateValue.Text = "请点「手动指定 ECHO.exe」选择游戏主程序";
                stateValue.ForeColor = Warn;
                loaderValue.Text = "—";
                nodeValue.Text = "—";
                installButton.Enabled = false;
                return;
            }

            this.target = this.core.Describe(chosen);
            pathValue.Text = this.target.EchoRoot;
            pathValue.ForeColor = Ink;
            installButton.Enabled = !this.busy;

            bool explainable = this.core.LooksLikeRealEcho(chosen);
            if (!explainable)
            {
                // 让「看起来是残缺 / 假安装」的目标显眼，并挡住误装
                stateValue.Text = this.core.IsUsableEcho(chosen)
                    ? "不像真正的 Steam ECHO 安装（asar 过小或缺 Electron 载荷文件）"
                    : "这个目录不像完整的 ECHO 安装（缺少 resources\\app.asar）";
                stateValue.ForeColor = Warn;
                installButton.Enabled = false;
            }
            else if (!this.target.HasLoader)
            {
                stateValue.Text = "尚未安装模组加载器";
                stateValue.ForeColor = Warn;
            }
            else
            {
                stateValue.Text = "已安装";
                stateValue.ForeColor = Ok;
            }

            loaderValue.Text = this.target.HasLoader ? this.target.InstalledVersion : "未安装";
            loaderValue.ForeColor = this.target.HasLoader ? Ink : Muted;
            nodeValue.Text = string.IsNullOrEmpty(this.target.NodeVersion) ? "—" : this.target.NodeVersion;
            this.UpdateStep(this.target.HasLoader
                ? "目标：" + this.target.EchoRoot + "（可点「安装 / 更新」修复或升级）"
                : "目标：" + this.target.EchoRoot, Muted);
        }

        private void Browse()
        {
            using (OpenFileDialog dialog = new OpenFileDialog())
            {
                dialog.Title = "选择 ECHO.exe";
                dialog.Filter = "ECHO 主程序|ECHO*.exe|所有程序 (*.exe)|*.exe";
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                if (!this.core.IsUsableEcho(dialog.FileName))
                {
                    if (MessageBox.Show(this,
                        "这个 exe 旁边没有 resources\\app.asar，看起来不是 Steam 版 ECHO。仍然使用它吗？",
                        "确认目录", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
                }
                this.RefreshStatus(dialog.FileName);
            }
        }

        // ---- 安装 -------------------------------------------------------

        private void StartInstall(bool force)
        {
            if (this.busy) return;
            if (this.target == null)
            {
                MessageBox.Show(this, "先指定 ECHO 的安装目录。", "缺少目标", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            List<string> running = this.RunningEchoProcesses();
            if (running.Count > 0)
            {
                string names = string.Join("、", running.ToArray());
                if (MessageBox.Show(this,
                    "检测到这些进程还在运行：" + names + "。\r\n\r\n安装会重建隔离运行时，继续前建议先关掉游戏。是否现在强制结束它们？",
                    "ECHO 正在运行", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                {
                    this.KillEchoProcesses();
                    Thread.Sleep(1500);
                }
            }

            this.busy = true;
            this.installButton.Enabled = false;
            this.browseButton.Enabled = false;
            this.cancelButton.Enabled = true;
            this.refreshButton.Enabled = false;
            this.bar.Value = 0;
            this.logBox.ClearAll();
            this.Line("=== ShinawaseLoader 安装器 ===", LogKind.Head);
            this.Line("目标游戏：" + this.target.EchoExe, LogKind.Info);
            this.Line("Loader 目录：" + this.target.LoaderRoot, LogKind.Dim);
            this.Line("", LogKind.Dim);

            Target snapshot = this.target;
            Thread worker = new Thread(delegate ()
            {
                try
                {
                    this.core.Run(snapshot, force, false);
                    Target after = this.core.Describe(snapshot.EchoExe);
                    this.Line("", LogKind.Dim);
                    if (after.HasLoader)
                    {
                        this.Line("安装完成：ShinawaseLoader " + after.InstalledVersion, LogKind.Good);
                        this.Line("下一步：点「启动 ECHO.modded.exe」，或在 Steam 启动选项里填下面这一行——", LogKind.Info);
                        this.Line("   \"" + Path.Combine(after.EchoRoot, "ECHO.modded.exe") + "\" %command%", LogKind.Dim);
                        this.Line("启动后左侧就会有 Loader 界面，把 .echomod 拖进「拖入此处添加模组」即可。", LogKind.Info);
                    }
                    else
                    {
                        this.Line("安装似乎没有成功：没读到 loader-version.json。", LogKind.Bad);
                    }
                    this.UpdateStep("完成。", Ok);
                    this.SetUiBusy(false);
                    this.AppendStatusRefresh(snapshot.EchoExe);
                }
                catch (OperationCanceledException)
                {
                    this.Line("已取消。", LogKind.Warn);
                    this.UpdateStep("已取消。", Warn);
                    this.SetUiBusy(false);
                }
                catch (Exception ex)
                {
                    this.Line("", LogKind.Dim);
                    this.Line("安装失败：" + ex.Message, LogKind.Bad);
                    this.UpdateStep("失败。", Bad);
                    this.SetUiBusy(false);
                    MessageBox.Show(this, ex.Message, "安装失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            });
            worker.IsBackground = true;
            worker.SetApartmentState(ApartmentState.STA);
            worker.Start();
        }

        private void AppendStatusRefresh(string echoExe)
        {
            if (this.IsDisposed) return;
            try { this.BeginInvoke(new Action<string>(this.RefreshStatus), echoExe); } catch { }
        }

        private void SetUiBusy(bool value)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired) { try { this.BeginInvoke(new Action<bool>(this.SetUiBusy), value); } catch { } return; }
            this.busy = value;
            this.installButton.Enabled = !value && this.target != null;
            this.browseButton.Enabled = !value;
            this.cancelButton.Enabled = value;
            this.refreshButton.Enabled = !value;
            this.bar.Value = value ? this.bar.Value : 100;
        }

        private void RequestCancel()
        {
            this.core.Cancel();
            this.Line("正在取消...", LogKind.Warn);
        }

        private List<string> RunningEchoProcesses()
        {
            List<string> names = new List<string>();
            foreach (string name in new string[] { "ECHO", "ECHO.modded", "ECHO Steam", "ECHO NEXT" })
            {
                try
                {
                    Process[] found = Process.GetProcessesByName(name);
                    if (found.Length > 0) names.Add(name + ".exe");
                }
                catch { }
            }
            return names;
        }

        private void KillEchoProcesses()
        {
            foreach (string name in new string[] { "ECHO", "ECHO.modded", "ECHO Steam", "ECHO NEXT" })
            {
                try
                {
                    foreach (Process p in Process.GetProcessesByName(name))
                    {
                        try { p.Kill(); } catch { }
                    }
                }
                catch { }
            }
        }

        private void OpenGameFolder()
        {
            if (this.target == null) return;
            try { Process.Start("explorer.exe", "\"" + this.target.EchoRoot + "\""); }
            catch (Exception ex) { MessageBox.Show(this, ex.Message, "无法打开目录", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }

        private void CopyLaunchOptions()
        {
            if (this.target == null) return;
            string line = "\"" + Path.Combine(this.target.EchoRoot, "ECHO.modded.exe") + "\" %command%";
            try
            {
                Clipboard.SetText(line);
                this.Line("已复制到剪贴板： " + line, LogKind.Good);
                this.Line("粘贴位置：Steam → 库 → ECHO → 属性 → 启动选项", LogKind.Dim);
            }
            catch (Exception ex)
            {
                this.Line("写入剪贴板失败：" + ex.Message + "　内容：" + line, LogKind.Warn);
            }
        }

        private void LaunchGame()
        {
            if (this.target == null) return;
            string modded = Path.Combine(this.target.EchoRoot, "ECHO.modded.exe");
            if (!File.Exists(modded))
            {
                MessageBox.Show(this, "还没有 ECHO.modded.exe，请先安装加载器。", "未安装", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(modded);
                info.WorkingDirectory = this.target.EchoRoot;
                info.UseShellExecute = true;
                Process.Start(info);
                this.Line("已启动 " + modded, LogKind.Good);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ---- ILog -------------------------------------------------------

        public void Line(string text, LogKind kind)
        {
            Color color = logBox.ForeColor;
            switch (kind)
            {
                case LogKind.Good: color = Ok; break;
                case LogKind.Warn: color = Warn; break;
                case LogKind.Bad: color = Bad; break;
                case LogKind.Dim: color = Color.FromArgb(150, 158, 178); break;
                case LogKind.Head: color = Color.FromArgb(150, 180, 255); break;
                case LogKind.Info: color = Ink; break;
            }
            logBox.Append(text, color);
        }

        public void Progress(int percent)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired) { try { this.BeginInvoke(new Action<int>(this.Progress), percent); } catch { } return; }
            if (percent < 0) percent = 0;
            if (percent > 100) percent = 100;
            try { this.bar.Value = percent; } catch { }
            if (percent > 0 && percent < 100) this.UpdateStep(string.Format("下载中… {0}%", percent), Muted);
        }

        public void Step(int index, int total, string title)
        {
            this.UpdateStep(string.Format("[{0}/{1}] {2}", index, total, title), Muted);
            this.Line("", LogKind.Dim);
            this.Line(string.Format("── [{0}/{1}] {2} ──", index, total, title), LogKind.Head);
        }

        public void Busy(bool value)
        {
            this.SetUiBusy(value);
        }

        private void UpdateStep(string text, Color color)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired) { try { this.BeginInvoke(new Action<string, Color>(this.UpdateStep), text, color); } catch { } return; }
            this.stepLabel.Text = text;
            this.stepLabel.ForeColor = color;
        }
    }

    // ------------------------------------------------------------------ 入口 ----

    internal static class Program
    {
        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        private static extern bool SetConsoleOutputCP(uint codePage);

        [STAThread]
        private static int Main(string[] args)
        {
            bool headless = false;
            bool force = false;
            bool noNetwork = false;
            string echoRoot = null;
            string mode = null;

            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                switch (a)
                {
                    case "--install": mode = "install"; headless = true; break;
                    case "--check": mode = "check"; headless = true; break;
                    case "--force": force = true; break;
                    case "--offline": noNetwork = true; break;
                    case "--echo-root":
                        if (i + 1 < args.Length) { echoRoot = args[++i]; }
                        break;
                    case "--help":
                    case "-h":
                        Console.WriteLine(HelpText());
                        return 0;
                    default:
                        if (!a.StartsWith("-") && echoRoot == null) echoRoot = a;
                        break;
                }
            }

            if (headless)
            {
                // 控制台默认代码页是 GBK，中文会乱码；这里切到 UTF-8（65001）。
                try
                {
                    SetConsoleOutputCP(65001);
                    Console.OutputEncoding = new UTF8Encoding(false);
                }
                catch { }
                return RunHeadless(mode, echoRoot, force, noNetwork);
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(echoRoot));
            return 0;
        }

        private static string HelpText()
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("ShinawaseLoader 安装器");
            sb.AppendLine();
            sb.AppendLine("  ShinawaseLoader-Installer.exe                     打开图形界面");
            sb.AppendLine("  ShinawaseLoader-Installer.exe --install [选项]    无界面安装");
            sb.AppendLine("  ShinawaseLoader-Installer.exe --check   [选项]    无界面检查");
            sb.AppendLine();
            sb.AppendLine("选项：");
            sb.AppendLine("  --echo-root <ECHO.exe 或游戏目录>   指定游戏位置（不给就自动查找）");
            sb.AppendLine("  --force                            即使已是最新版也重装");
            sb.AppendLine("  --offline                           不联网，只用已缓存 / 已安装的版本");
            return sb.ToString();
        }

        private static int RunHeadless(string mode, string echoRoot, bool force, bool noNetwork)
        {
            ConsoleLog log = new ConsoleLog();
            InstallerCore core = new InstallerCore(log);

            string chosen = null;
            if (!string.IsNullOrEmpty(echoRoot))
            {
                if (Directory.Exists(echoRoot))
                {
                    string direct = Path.Combine(echoRoot, "ECHO.exe");
                    if (File.Exists(direct)) chosen = direct;
                }
                else if (File.Exists(echoRoot))
                {
                    chosen = echoRoot;
                }
                if (chosen == null)
                {
                    Console.WriteLine("指定的路径里没找到 ECHO.exe：" + echoRoot);
                    return 2;
                }
            }
            else
            {
                // 先挑看起来是真游戏的；都没有时才退而求其次，并明确提示
                foreach (string c in core.FindEchoCandidates())
                {
                    if (core.LooksLikeRealEcho(c)) { chosen = c; break; }
                }
                if (chosen == null)
                {
                    foreach (string c in core.FindEchoCandidates())
                    {
                        if (core.IsUsableEcho(c)) { chosen = c; break; }
                    }
                    if (chosen != null)
                    {
                        Console.WriteLine("注意：自动挑到的这个目录不像真正的 Steam ECHO 安装：" + chosen);
                        Console.WriteLine("      如果不对，请用 --echo-root 指定 ECHO.exe。");
                    }
                }
                if (chosen == null)
                {
                    Console.WriteLine("没有找到 Steam 版 ECHO，用 --echo-root 指定。");
                    return 2;
                }
            }

            Target target = core.Describe(chosen);
            Console.WriteLine("游戏目录：" + target.EchoRoot);
            Console.WriteLine("已安装版本：" + (target.HasLoader ? target.InstalledVersion : "未安装"));
            if (!core.LooksLikeRealEcho(chosen))
            {
                Console.WriteLine("警告：这个目录不像真正的 Steam ECHO 安装（asar 过小或缺 Electron 载荷文件），");
                Console.WriteLine("      继续安装很可能白装一场 —— 请用 --echo-root 指向真正的 ECHO.exe。");
            }

            if (mode == "check")
            {
                List<string> problems = core.Verify(target);
                return problems.Count == 0 ? 0 : 1;
            }

            core.Run(target, force, noNetwork);
            Target after = core.Describe(target.EchoExe);
            Console.WriteLine();
            Console.WriteLine("结束状态：Loader " + (after.HasLoader ? after.InstalledVersion : "未安装"));
            return after.HasLoader ? 0 : 1;
        }
    }

    internal class ConsoleLog : ILog
    {
        public void Line(string text, LogKind kind) { Console.WriteLine(text); }
        public void Progress(int percent) { }
        public void Step(int index, int total, string title)
        {
            Console.WriteLine();
            Console.WriteLine("== [" + index + "/" + total + "] " + title + " ==");
        }
        public void Busy(bool value) { }
    }
}
