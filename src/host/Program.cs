// Lumen Mark - a small, fast, local Markdown reader & editor for Windows.
// Host: WinForms + WebView2 (WebView2 runtime ships with Windows 10/11).
// Compiled with the in-box .NET Framework compiler (C# 5 language level).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LumenMark
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(args));
        }
    }

    internal sealed class MainForm : Form
    {
        private const string AppName = "Lumen Mark";
        private const string VirtualHost = "lumen.local";
        private const string ImageHost = "mdimg.local";
        private const string ImagePrefix = "https://" + ImageHost + "/r/";
        private const int MaxRecents = 12;

        private readonly WebView2 webView;
        private readonly string appDir;
        private readonly string dataDir;
        private readonly List<string> recents = new List<string>();

        private string currentPath;
        private string mdDir;
        private bool isDirty;
        private bool allowClose;
        private bool changingDocument;
        private bool hasSavedBounds;
        private string pendingOpenPath;
        private string startMode;
        private string startTheme;
        private bool? startSidebar;
        private string evalScript;

        public MainForm(string[] args)
        {
            Text = AppName;
            BackColor = Color.FromArgb(22, 24, 29);

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            appDir = Path.Combine(baseDir, "app");
            dataDir = ResolveDataDir(baseDir);
            LoadSettings();

            ParseArgs(args);

            StartPosition = FormStartPosition.CenterScreen;
            KeyPreview = true;
            AllowDrop = true;

            webView = new WebView2();
            string iconPath = Path.Combine(baseDir, "app.ico");
            if (File.Exists(iconPath)) Icon = new Icon(iconPath);
            webView.Dock = DockStyle.Fill;
            webView.DefaultBackgroundColor = Color.FromArgb(22, 24, 29);
            Controls.Add(webView);

            Load += OnFormLoad;
            HandleCreated += OnHandleCreated;
            FormClosing += OnFormClosing;
            DragEnter += OnDragEnter;
            DragDrop += OnDragDrop;
        }

        private void ParseArgs(string[] args)
        {
            foreach (string a in args)
            {
                if (string.IsNullOrEmpty(a)) continue;
                if (a.StartsWith("--mode=", StringComparison.OrdinalIgnoreCase)) startMode = a.Substring(7);
                else if (a.StartsWith("--theme=", StringComparison.OrdinalIgnoreCase)) startTheme = a.Substring(8);
                else if (a.StartsWith("--sidebar=", StringComparison.OrdinalIgnoreCase)) startSidebar = a.Substring(10) != "0";
                else if (a.StartsWith("--eval=", StringComparison.OrdinalIgnoreCase)) evalScript = a.Substring(7);
                else if (a.StartsWith("--evalfile=", StringComparison.OrdinalIgnoreCase))
                {
                    try { evalScript = File.ReadAllText(a.Substring(11)); }
                    catch { }
                }
                else if (!a.StartsWith("--", StringComparison.Ordinal) && File.Exists(a) && string.IsNullOrEmpty(pendingOpenPath)) pendingOpenPath = a;
            }
        }

        [DllImport("user32.dll")]
        private static extern uint GetDpiForWindow(IntPtr hwnd);

        private int WindowDpi()
        {
            try
            {
                if (IsHandleCreated)
                {
                    uint dpi = GetDpiForWindow(Handle);
                    if (dpi >= 96) return (int)dpi;
                }
            }
            catch { /* Windows < 10 1607 */ }
            try { return DeviceDpi; }
            catch { return 96; }
        }

        private void ApplyDefaultWindowSize()
        {
            double scale = WindowDpi() / 96.0;
            int targetW = (int)(1180 * scale);
            int targetH = (int)(740 * scale);
            Rectangle work = Screen.PrimaryScreen.WorkingArea;
            targetW = Math.Min(targetW, work.Width - (int)(60 * scale));
            targetH = Math.Min(targetH, work.Height - (int)(60 * scale));
            int w = Math.Max(targetW, (int)(900 * scale));
            int h = Math.Max(targetH, (int)(560 * scale));
            StartPosition = FormStartPosition.Manual;
            Bounds = new Rectangle(work.X + (work.Width - w) / 2, work.Y + (work.Height - h) / 2, w, h);
        }

        private void OnHandleCreated(object sender, EventArgs e)
        {
            double scale = WindowDpi() / 96.0;
            MinimumSize = new Size((int)(880 * scale), (int)(560 * scale));
            if (!hasSavedBounds) ApplyDefaultWindowSize();
            ApplyDarkTitleBar(SystemPrefersDark());
        }

        [DllImport("dwmapi.dll", PreserveSig = true)]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        [DllImport("user32.dll")]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);

        private void ApplyDarkTitleBar(bool dark)
        {
            if (!IsHandleCreated) return;
            int value = dark ? 1 : 0;
            int hr20 = -1;
            int hr19 = -1;
            try { hr20 = DwmSetWindowAttribute(Handle, 20, ref value, 4); }
            catch { /* Windows 10 < 1809 */ }
            try
            {
                int legacy = dark ? 1 : 0;
                hr19 = DwmSetWindowAttribute(Handle, 19, ref legacy, 4);
            }
            catch { /* ignore */ }
            try
            {
                // ask DWM to repaint the non-client area
                SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0027);
            }
            catch { /* ignore */ }
            LogDebug("dwm dark=" + dark + " hr20=" + hr20 + " hr19=" + hr19);
        }

        private void LogDebug(string line)
        {
            try
            {
                if (Environment.GetEnvironmentVariable("LUMENMARK_DEBUG") != "1") return;
                File.AppendAllText(Path.Combine(dataDir, "debug.log"),
                    DateTime.Now.ToString("HH:mm:ss.fff") + " " + line + Environment.NewLine, Encoding.UTF8);
            }
            catch { /* ignore */ }
        }

        private static bool SystemPrefersDark()
        {
            try
            {
                object v = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 1);
                return Convert.ToInt32(v) == 0;
            }
            catch { return false; }
        }

        private static string ResolveDataDir(string baseDir)
        {
            try
            {
                string roaming = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LumenMark");
                Directory.CreateDirectory(roaming);
                string probe = Path.Combine(roaming, ".write-test");
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
                return roaming;
            }
            catch
            {
                string local = Path.Combine(baseDir, "data");
                Directory.CreateDirectory(local);
                return local;
            }
        }

        // ---------------------------------------------------------------- init

        private async void OnFormLoad(object sender, EventArgs e)
        {
            try
            {
                CoreWebView2CreationProperties props = new CoreWebView2CreationProperties();
                props.UserDataFolder = Path.Combine(dataDir, "webview2");
                webView.CreationProperties = props;

                await webView.EnsureCoreWebView2Async(null);

                CoreWebView2 core = webView.CoreWebView2;
                core.Settings.AreDevToolsEnabled = true;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = true;
                core.Settings.IsZoomControlEnabled = true;
                core.Settings.IsPasswordAutosaveEnabled = false;
                core.Settings.IsGeneralAutofillEnabled = false;
                webView.AllowExternalDrop = false; // let the WinForms host handle dropped files

                core.SetVirtualHostNameToFolderMapping(VirtualHost, appDir, CoreWebView2HostResourceAccessKind.Allow);
                core.WebMessageReceived += OnWebMessage;
                core.NewWindowRequested += OnNewWindowRequested;
                core.NavigationStarting += OnNavigationStarting;
                core.WebResourceRequested += OnWebResourceRequested;
                core.AddWebResourceRequestedFilter("https://" + ImageHost + "/*", CoreWebView2WebResourceContext.All);
                core.Navigate("https://" + VirtualHost + "/index.html");
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "无法初始化 WebView2 运行时。\r\n\r\nWindows 10/11 通常已内置；若缺失，请安装 “Microsoft Edge WebView2 Runtime”。\r\n\r\n" + ex.Message,
                    AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            string uri = e.Uri ?? string.Empty;
            if (uri.StartsWith("https://" + VirtualHost + "/", StringComparison.OrdinalIgnoreCase))
                return;
            if (uri.StartsWith("https://" + ImageHost + "/", StringComparison.OrdinalIgnoreCase))
                return;
            e.Cancel = true;
            OpenExternal(uri);
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            OpenExternal(e.Uri);
        }

        // ------------------------------------------------------------- bridge

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (!string.Equals(e.Source, "https://" + VirtualHost + "/index.html", StringComparison.OrdinalIgnoreCase)) return;
            string json;
            try { json = e.WebMessageAsJson; }
            catch { return; }
            if (string.IsNullOrEmpty(json)) return;

            Dictionary<string, string> msg = ParseJsonObject(json);
            string cmd = Get(msg, "cmd");
            try
            {
                switch (cmd)
                {
                    case "ready":
                        SendInit();
                        if (!string.IsNullOrEmpty(pendingOpenPath) && File.Exists(pendingOpenPath))
                        {
                            string p = pendingOpenPath;
                            pendingOpenPath = null;
                            OpenPath(p);
                        }
                        break;
                    case "openDialog":
                        ShowOpenDialog();
                        break;
                    case "openPath":
                        OpenPath(Get(msg, "path"));
                        break;
                    case "openRelative":
                        OpenRelative(Get(msg, "href"));
                        break;
                    case "save":
                        SaveContent(Get(msg, "content"), false);
                        break;
                    case "saveAs":
                        SaveContent(Get(msg, "content"), true);
                        break;
                    case "getRecents":
                        SendRecents();
                        break;
                    case "clearRecents":
                        recents.Clear();
                        SaveSettings();
                        SendRecents();
                        break;
                    case "setDirty":
                        if (!string.Equals(Get(msg, "path"), currentPath, StringComparison.OrdinalIgnoreCase)) break;
                        isDirty = string.Equals(Get(msg, "dirty"), "true", StringComparison.OrdinalIgnoreCase);
                        UpdateWindowTitle(Get(msg, "title"));
                        break;
                    case "setTheme":
                        ApplyDarkTitleBar(string.Equals(Get(msg, "dark"), "true", StringComparison.OrdinalIgnoreCase));
                        break;
                    case "debug":
                        try
                        {
                            File.AppendAllText(Path.Combine(dataDir, "debug.log"), Get(msg, "message") + Environment.NewLine, Encoding.UTF8);
                        }
                        catch { }
                        break;
                    case "openExternal":
                        OpenExternal(Get(msg, "url"));
                        break;
                    case "exit":
                        Close();
                        break;
                }
            }
            catch (Exception ex)
            {
                SendError(ex.Message);
            }
        }

        private static string Get(Dictionary<string, string> d, string key)
        {
            string v;
            return d.TryGetValue(key, out v) ? v : string.Empty;
        }

        private void SendJson(string json)
        {
            if (webView == null || webView.CoreWebView2 == null) return;
            try { webView.CoreWebView2.PostWebMessageAsJson(json); }
            catch { /* bridge not ready */ }
        }

        private void SendError(string message)
        {
            SendJson("{\"event\":\"error\",\"message\":\"" + JsonEscape(message ?? "") + "\"}");
        }

        private void SendRecents()
        {
            SendJson("{\"event\":\"recents\",\"items\":" + RecentsJson() + "}");
        }

        private string RecentsJson()
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("[");
            for (int i = 0; i < recents.Count; i++)
            {
                if (i > 0) sb.Append(",");
                string name = Path.GetFileName(recents[i]);
                sb.Append("{\"path\":\"").Append(JsonEscape(recents[i]))
                  .Append("\",\"name\":\"").Append(JsonEscape(name))
                  .Append("\",\"exists\":").Append(File.Exists(recents[i]) ? "true" : "false")
                  .Append("}");
            }
            sb.Append("]");
            return sb.ToString();
        }

        private void SendInit()
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("{\"event\":\"init\",\"recents\":").Append(RecentsJson());
            if (!string.IsNullOrEmpty(startMode)) sb.Append(",\"mode\":\"").Append(JsonEscape(startMode)).Append("\"");
            if (!string.IsNullOrEmpty(startTheme)) sb.Append(",\"theme\":\"").Append(JsonEscape(startTheme)).Append("\"");
            if (startSidebar.HasValue) sb.Append(",\"sidebar\":").Append(startSidebar.Value ? "true" : "false");
            if (!string.IsNullOrEmpty(evalScript)) sb.Append(",\"eval\":\"").Append(JsonEscape(evalScript)).Append("\"");
            sb.Append("}");
            SendJson(sb.ToString());

            if (!string.IsNullOrEmpty(currentPath) && File.Exists(currentPath))
                SendFile(currentPath);
        }

        // ----------------------------------------------------------- documents

        private void SendFile(string path, string content = null)
        {
            if (content == null) content = ReadTextSmart(path);
            FileInfo fi = new FileInfo(path);
            string dir = Path.GetDirectoryName(path) ?? string.Empty;
            SendJson("{\"event\":\"file\",\"path\":\"" + JsonEscape(path)
                + "\",\"name\":\"" + JsonEscape(Path.GetFileName(path))
                + "\",\"dir\":\"" + JsonEscape(dir)
                + "\",\"size\":" + fi.Length
                + ",\"content\":\"" + JsonEscape(content) + "\"}");
        }

        private async void OpenPath(string path)
        {
            if (changingDocument) return;
            changingDocument = true;
            webView.Enabled = false;
            try
            {
                if (string.IsNullOrEmpty(path)) return;
                path = Path.GetFullPath(path);
                if (!File.Exists(path))
                {
                    SendError("文件不存在：" + path);
                    return;
                }
                if (new FileInfo(path).Length > 32L * 1024 * 1024)
                {
                    SendError("文件太大（超过 32 MB），暂不支持打开。");
                    return;
                }

                // Read before changing document identity so a failed read keeps the old document intact.
                if (!await ConfirmDocumentChange()) return;
                string content = ReadTextSmart(path);
                currentPath = path;
                mdDir = Path.GetDirectoryName(path);
                isDirty = false;
                AddRecent(path);
                SaveSettings();
                SendFile(path, content);
                SendRecents();
                UpdateWindowTitle(Path.GetFileName(path));
            }
            catch (Exception ex) { SendError(ex.Message); }
            finally { changingDocument = false; webView.Enabled = true; }
        }

        private async Task<bool> ConfirmDocumentChange()
        {
            if (!isDirty) return true;
            DialogResult result = MessageBox.Show(this,
                "当前文档有未保存的修改。是否先保存？\r\n选择“否”将放弃修改。",
                AppName, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
            if (result == DialogResult.Cancel) return false;
            if (result == DialogResult.No) return true;
            string json = await webView.CoreWebView2.ExecuteScriptAsync("window.__lm.editor.getValue()");
            int offset = 0;
            if (string.IsNullOrEmpty(json) || json[0] != '"') return false;
            return SaveContent(ReadJsonString(json, ref offset), false);
        }

        private void OpenRelative(string href)
        {
            if (string.IsNullOrEmpty(href) || string.IsNullOrEmpty(mdDir)) return;
            string rel = href;
            int hash = rel.IndexOf('#');
            if (hash >= 0) rel = rel.Substring(0, hash);
            int query = rel.IndexOf('?');
            if (query >= 0) rel = rel.Substring(0, query);
            if (rel.Length == 0) return;
            try
            {
                string full = Path.GetFullPath(Path.Combine(mdDir, rel.Replace('/', '\\')));
                if (File.Exists(full)) OpenPath(full);
                else SendError("找不到文件：" + rel);
            }
            catch (Exception ex) { SendError(ex.Message); }
        }

        private void ShowOpenDialog()
        {
            using (OpenFileDialog dlg = new OpenFileDialog())
            {
                dlg.Title = "打开 Markdown 文件";
                dlg.Filter = "Markdown 文件 (*.md;*.markdown;*.mdown;*.mkd)|*.md;*.markdown;*.mdown;*.mkd|文本文件 (*.txt)|*.txt|所有文件 (*.*)|*.*";
                dlg.CheckFileExists = true;
                if (!string.IsNullOrEmpty(mdDir)) dlg.InitialDirectory = mdDir;
                if (dlg.ShowDialog(this) == DialogResult.OK)
                    OpenPath(dlg.FileName);
            }
        }

        private bool SaveContent(string content, bool saveAs)
        {
            string target = currentPath;
            if (saveAs || string.IsNullOrEmpty(target))
            {
                using (SaveFileDialog dlg = new SaveFileDialog())
                {
                    dlg.Title = "保存 Markdown 文件";
                    dlg.Filter = "Markdown 文件 (*.md)|*.md|所有文件 (*.*)|*.*";
                    dlg.DefaultExt = "md";
                    dlg.AddExtension = true;
                    if (!string.IsNullOrEmpty(currentPath))
                    {
                        dlg.InitialDirectory = Path.GetDirectoryName(currentPath);
                        dlg.FileName = Path.GetFileName(currentPath);
                    }
                    else if (!string.IsNullOrEmpty(mdDir))
                    {
                        dlg.InitialDirectory = mdDir;
                        dlg.FileName = "未命名.md";
                    }
                    if (dlg.ShowDialog(this) != DialogResult.OK) return false;
                    target = dlg.FileName;
                }
            }

            try
            {
                File.WriteAllText(target, content, new UTF8Encoding(false));
                bool renamed = !string.Equals(target, currentPath, StringComparison.OrdinalIgnoreCase);
                currentPath = target;
                mdDir = Path.GetDirectoryName(target);
                isDirty = false;
                AddRecent(target);
                SaveSettings();
                SendJson("{\"event\":\"saved\",\"path\":\"" + JsonEscape(target)
                    + "\",\"name\":\"" + JsonEscape(Path.GetFileName(target))
                    + "\",\"dir\":\"" + JsonEscape(mdDir ?? string.Empty)
                    + "\",\"content\":\"" + JsonEscape(content)
                    + "\",\"renamed\":" + (renamed ? "true" : "false") + "}");
                SendRecents();
                UpdateWindowTitle(Path.GetFileName(target));
                return true;
            }
            catch (Exception ex)
            {
                SendError("保存失败：" + ex.Message);
                return false;
            }
        }

        private static string ReadTextSmart(string path)
        {
            byte[] bytes = File.ReadAllBytes(path);
            if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
                return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
            if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
                return Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2);
            if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
                return Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2);

            try
            {
                UTF8Encoding strict = new UTF8Encoding(false, true);
                return strict.GetString(bytes);
            }
            catch (DecoderFallbackException)
            {
                try
                {
                    return Encoding.GetEncoding(936).GetString(bytes);
                }
                catch
                {
                    return Encoding.UTF8.GetString(bytes);
                }
            }
        }

        // --------------------------------------------------------------- recents

        private void AddRecent(string path)
        {
            recents.RemoveAll(delegate(string p) { return string.Equals(p, path, StringComparison.OrdinalIgnoreCase); });
            recents.Insert(0, path);
            while (recents.Count > MaxRecents) recents.RemoveAt(recents.Count - 1);
        }

        // ------------------------------------------------------------ images

        private void OnWebResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            string uri = e.Request.Uri ?? string.Empty;
            if (!uri.StartsWith(ImagePrefix, StringComparison.OrdinalIgnoreCase)) return;

            string rel = Uri.UnescapeDataString(uri.Substring(ImagePrefix.Length));
            string full = ResolveInsideMdDir(rel);
            CoreWebView2Environment env = webView.CoreWebView2.Environment;

            if (full != null && File.Exists(full))
            {
                try
                {
                    byte[] data = File.ReadAllBytes(full);
                    MemoryStream stream = new MemoryStream(data);
                    e.Response = env.CreateWebResourceResponse(stream, 200, "OK", "Content-Type: " + MimeFor(full));
                }
                catch
                {
                    e.Response = env.CreateWebResourceResponse(new MemoryStream(new byte[0]), 500, "Error", "Content-Type: text/plain");
                }
            }
            else
            {
                e.Response = env.CreateWebResourceResponse(new MemoryStream(new byte[0]), 404, "Not Found", "Content-Type: text/plain");
            }
        }

        private string ResolveInsideMdDir(string rel)
        {
            if (string.IsNullOrEmpty(mdDir) || string.IsNullOrEmpty(rel)) return null;
            try
            {
                string full = Path.GetFullPath(Path.Combine(mdDir, rel.Replace('/', '\\')));
                string root = Path.GetFullPath(mdDir).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null;
                return full;
            }
            catch { return null; }
        }

        private static string MimeFor(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            switch (ext)
            {
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".webp": return "image/webp";
                case ".bmp": return "image/bmp";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                case ".avif": return "image/avif";
                default: return "application/octet-stream";
            }
        }

        // ------------------------------------------------------- window / misc

        private void UpdateWindowTitle(string name)
        {
            string suffix = isDirty ? " •" : "";
            string title = string.IsNullOrEmpty(name) ? "未命名" : name;
            Text = title + suffix + " — " + AppName;
        }

        private void OpenExternal(string url)
        {
            if (string.IsNullOrEmpty(url)) return;
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
            {
                try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
                catch (Exception ex) { SendError("无法打开链接：" + ex.Message); }
            }
        }

        private void OnDragEnter(object sender, DragEventArgs e)
        {
            if (e.Data != null && e.Data.GetDataPresent(DataFormats.FileDrop))
                e.Effect = DragDropEffects.Copy;
        }

        private void OnDragDrop(object sender, DragEventArgs e)
        {
            if (e.Data == null || !e.Data.GetDataPresent(DataFormats.FileDrop)) return;
            string[] files = e.Data.GetData(DataFormats.FileDrop) as string[];
            if (files == null || files.Length == 0) return;
            string file = files[0];
            if (File.Exists(file) && IsMarkdownLike(file)) OpenPath(file);
            else if (Directory.Exists(file)) SendError("暂不支持打开文件夹，请拖入单个 Markdown 文件。");
            else OpenPath(file);
        }

        private static bool IsMarkdownLike(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            return ext == ".md" || ext == ".markdown" || ext == ".mdown" || ext == ".mkd" || ext == ".txt";
        }

        private async void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            if (allowClose) { SaveSettings(); return; }
            e.Cancel = true;
            if (changingDocument) return;
            changingDocument = true;
            webView.Enabled = false;
            try
            {
                if (!await ConfirmDocumentChange()) return;
                allowClose = true;
                BeginInvoke(new Action(Close));
            }
            catch (Exception ex) { SendError(ex.Message); }
            finally { changingDocument = false; webView.Enabled = true; }
            SaveSettings();
        }

        // ------------------------------------------------------------- settings

        private string SettingsPath()
        {
            return Path.Combine(dataDir, "settings.txt");
        }

        private void LoadSettings()
        {
            recents.Clear();
            try
            {
                if (!File.Exists(SettingsPath())) return;
                foreach (string line in File.ReadAllLines(SettingsPath(), Encoding.UTF8))
                {
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string key = line.Substring(0, eq);
                    string val = line.Substring(eq + 1);
                    if (key == "recent")
                    {
                        if (File.Exists(val) && !recents.Contains(val)) recents.Add(val);
                    }
                    else if (key == "bounds")
                    {
                        ApplyBounds(val);
                    }
                }
            }
            catch { /* ignore broken settings */ }
        }

        private void ApplyBounds(string value)
        {
            try
            {
                string[] parts = value.Split(',');
                if (parts.Length != 4) return;
                int x = int.Parse(parts[0]);
                int y = int.Parse(parts[1]);
                int w = int.Parse(parts[2]);
                int h = int.Parse(parts[3]);
                if (w < 400 || h < 300) return;

                bool visible = false;
                foreach (Screen s in Screen.AllScreens)
                {
                    Rectangle r = new Rectangle(x, y, w, h);
                    if (s.WorkingArea.IntersectsWith(r)) { visible = true; break; }
                }
                if (!visible) return;

                StartPosition = FormStartPosition.Manual;
                Bounds = new Rectangle(x, y, w, h);
                hasSavedBounds = true;
            }
            catch { /* ignore */ }
        }

        private void SaveSettings()
        {
            try
            {
                StringBuilder sb = new StringBuilder();
                Rectangle b = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                sb.Append("bounds=").Append(b.X).Append(',').Append(b.Y).Append(',').Append(b.Width).Append(',').Append(b.Height).AppendLine();
                foreach (string r in recents)
                    sb.Append("recent=").AppendLine(r);
                File.WriteAllText(SettingsPath(), sb.ToString(), new UTF8Encoding(false));
            }
            catch { /* ignore */ }
        }

        // ---------------------------------------------------------------- json

        private static string JsonEscape(string s)
        {
            if (s == null) return string.Empty;
            StringBuilder sb = new StringBuilder(s.Length + 16);
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }

        private static Dictionary<string, string> ParseJsonObject(string json)
        {
            Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.Ordinal);
            int i = 0;
            SkipWs(json, ref i);
            if (i >= json.Length || json[i] != '{') return result;
            i++;
            while (i < json.Length)
            {
                SkipWs(json, ref i);
                if (i < json.Length && json[i] == '}') break;
                if (i >= json.Length || json[i] != '"') break;
                string key = ReadJsonString(json, ref i);
                SkipWs(json, ref i);
                if (i < json.Length && json[i] == ':') i++;
                SkipWs(json, ref i);
                string val;
                if (i < json.Length && json[i] == '"')
                {
                    val = ReadJsonString(json, ref i);
                }
                else
                {
                    int start = i;
                    while (i < json.Length && json[i] != ',' && json[i] != '}' && !char.IsWhiteSpace(json[i])) i++;
                    val = json.Substring(start, i - start);
                }
                result[key] = val;
                SkipWs(json, ref i);
                if (i < json.Length && json[i] == ',') i++;
            }
            return result;
        }

        private static void SkipWs(string json, ref int i)
        {
            while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
        }

        private static string ReadJsonString(string json, ref int i)
        {
            StringBuilder sb = new StringBuilder();
            i++; // opening quote
            while (i < json.Length)
            {
                char c = json[i++];
                if (c == '"') break;
                if (c != '\\') { sb.Append(c); continue; }
                if (i >= json.Length) break;
                char esc = json[i++];
                switch (esc)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 <= json.Length)
                        {
                            int code = 0;
                            for (int k = 0; k < 4; k++)
                            {
                                char h = json[i + k];
                                int d;
                                if (h >= '0' && h <= '9') d = h - '0';
                                else if (h >= 'a' && h <= 'f') d = h - 'a' + 10;
                                else if (h >= 'A' && h <= 'F') d = h - 'A' + 10;
                                else { d = 0; }
                                code = code * 16 + d;
                            }
                            i += 4;
                            sb.Append((char)code);
                        }
                        break;
                    default: sb.Append(esc); break;
                }
            }
            return sb.ToString();
        }
    }
}
