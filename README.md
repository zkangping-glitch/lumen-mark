# Lumen Mark

轻量、本地优先的 Windows Markdown 阅读 / 编辑器。解压后双击就能用，没有安装包、没有账号，核心功能离线可用。

- 宿主：C# WinForms（用 Windows 自带 .NET Framework 4.8 编译，单文件 exe）
- 界面：WebView2（Windows 10/11 自带 Edge WebView2 Runtime）
- 渲染：markdown-it + highlight.js + CodeMirror 5（全部随程序打包，离线可用）

## 功能

| 功能 | 说明 |
| --- | --- |
| 打开 / 拖入 | `Ctrl+O`、命令行参数、把 `.md` 拖进窗口、最近文件列表 |
| 三种视图 | 阅读（纯排版）/ 分屏（源码 + 实时预览）/ 源码 |
| 左右互换 | 分屏时一键交换「阅读」与「源码」的左右位置（`Ctrl+Shift+X` / 工具栏 ⇄ 按钮） |
| 自由分栏 | 拖动中间的竖直分隔条任意调整两栏宽度；双击分隔条恢复默认比例（46 / 54） |
| 实时预览 | 输入后约 100ms 刷新，滚动位置双向同步 |
| 大纲目录 | 自动从标题生成，点击跳转，滚动时高亮当前章节（源码模式下会定位到对应行） |
| 保存 | `Ctrl+S` 保存、`Ctrl+Shift+S` 另存为，标题栏显示未保存标记 |
| 主题 | 浅色 / 深色 / 跟随系统，同步切换窗口标题栏颜色 |
| 排版 | 标题、列表、任务清单、表格、引用、代码高亮、相对路径图片（含 `![](./img/x.png)`）、脚注式引用 |
| 编码 | UTF-8（含 BOM）、UTF-16、GBK/GB2312 自动识别 |
| 状态栏 | 字数、预计阅读时间、当前文件路径 |
| 其他 | 窗口位置/大小记忆、最近文件持久化、外链用默认浏览器打开 |

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+O` | 打开文件 |
| `Ctrl+S` / `Ctrl+Shift+S` | 保存 / 另存为 |
| `Ctrl+E` | 阅读 → 分屏 → 源码 循环切换 |
| `Ctrl+Shift+L` | 显示 / 隐藏侧边栏 |
| `Ctrl+Shift+T` | 切换主题 |
| `Ctrl+Shift+X` | 交换阅读 / 源码左右位置 |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` / ``Ctrl+` `` | 加粗 / 斜体 / 链接 / 行内代码 |

## 目录结构

```
lumen-mark/
├─ build.ps1                 # 一键构建（csc 编译 + 组装 dist + 打包 zip）
├─ src/
│  ├─ host/                  # C# 宿主
│  │  ├─ Program.cs          # 窗口、WebView2、文件 IO、消息桥、设置
│  │  ├─ app.manifest        # DPI / 兼容性清单
│  │  ├─ LumenMark.exe.config# WinForms 高 DPI 配置
│  │  └─ app.ico             # 程序图标
│  └─ app/                   # 前端（虚拟主机 https://lumen.local）
│     ├─ index.html
│     ├─ css/app.css
│     ├─ js/app.js
│     └─ vendor/             # CodeMirror / markdown-it / highlight.js + 许可证
├─ vendor/webview2/          # WebView2 SDK 的托管程序集与加载器
├─ samples/                  # 示例文档
├─ tools/                    # 图标、示例图、截图等小脚本
└─ dist/                     # 构建产物（LumenMark.exe + app/ + dll）
```

## 构建

### 安装版与默认打开程序

在仓库 **Actions → Windows build** 中打开最新成功的运行，下载
`LumenMark-Setup-x64`，解压后运行其中的 `LumenMark-Setup-0.1.1-x64.exe`。
安装范围为当前用户，无需管理员权限，默认位置是 `%LOCALAPPDATA%\Programs\LumenMark`。

安装结束时保留“设置 Markdown 默认打开程序”选项，会打开 Windows 默认应用设置。
选择 Lumen Mark，将 `.md` 等扩展名设为默认；也可以右键任意 `.md` 文件 →
“打开方式”→“选择其他应用”→ Lumen Mark，并选“始终使用此应用”。
以后可通过开始菜单中的“设置 Markdown 默认打开程序”入口再次调整。

安装程序注册 `.md`、`.markdown`、`.mdown`、`.mkd` 的打开方式和文件图标，
默认程序由用户在 Windows 中确认。卸载会清理应用自身的关联注册，保留其他应用的注册和用户文档。
设置与最近文件保留在 `%APPDATA%\LumenMark`，便于重新安装后继续使用。
安装需要 WebView2 Runtime；缺失时应用会提示安装。

本地制作安装包需安装 **Inno Setup 6**，然后执行：

```powershell
powershell -File .\build-installer.ps1
```

产物位于 `output\LumenMark-Setup-0.1.1-x64.exe`。便携版仍可用下面的构建方式生成。

需要 Windows 自带的 **.NET Framework 4.x**（`csc.exe` 即可，无需安装 Visual Studio 或 .NET SDK）。

```powershell
pwsh -File .\build.ps1
```

产物：`dist\LumenMark.exe`、`LumenMark-win-x64.zip`。

也可在仓库 **Actions → Windows build** 中打开最新成功的运行，下载
`LumenMark-win-x64` artifact，解压后运行 `LumenMark.exe`。

图标源图位于 `art/icon.png`。安装 Pillow 后运行 `python tools/make-icon.py`，
可重新生成包含 16–256 像素尺寸的 `src/host/app.ico`；构建时会同时嵌入 EXE 并复制到便携目录。

## 运行

```powershell
.\dist\LumenMark.exe
.\dist\LumenMark.exe "C:\notes\readme.md"
```

可用启动参数（同时方便自动化测试）：

| 参数 | 说明 |
| --- | --- |
| `--mode=reader\|split\|source` | 启动时的视图 |
| `--theme=light\|dark\|auto` | 启动时的主题（会写入本地偏好） |
| `--sidebar=0\|1` | 侧边栏开关 |
| `--evalfile=<file>` / `--eval=<js>` | 页面就绪后执行一段脚本 |

首次运行会尝试把配置写到 `%APPDATA%\LumenMark\`（`settings.txt` + WebView2 缓存）；
若该目录不可写，则退回到 exe 同级的 `data\` 目录（便携模式）。

## 截图

见 `docs/screenshots/`（分屏深色、左右互换、阅读浅色、源码深色、启动页）。

## 数据与隐私

- 无遥测；应用不会主动上传打开的文档，文件在本机读写。
- 文档中的远程图片会联网加载；用户点击外链时交给默认浏览器。
- `app/` 里的资源通过 WebView2 虚拟主机映射加载，不经过本地 HTTP 服务。

## 已知限制

- 仅支持 Windows 10/11 x64（依赖 WebView2 Runtime；Win10 1803+ 通常已内置）。
- 单文档窗口：暂不支持多标签页 / 文件夹工作区。
- 拖入文件依赖宿主窗口的 OLE 拖放；若在某些输入法/文件管理器下失效，可改用 `Ctrl+O`。
- Markdown 扩展：支持 CommonMark + GFM 表格 / 任务清单；暂不支持数学公式、Mermaid、脚注。
- 为防止文档脚本访问本地文件，原始 HTML 按文本展示；不支持内嵌 HTML 图片、样式或 iframe。
- 大文件（> 几 MB）实时预览会变慢，建议切换到「源码」模式。

## 开发与审阅说明

给接手审阅 / 二次开发的人（包括 AI 审阅者）：

| 入口 | 位置 |
| --- | --- |
| 宿主逻辑（窗口、WebView2、文件读写、JSON 消息桥、设置、DWM 深色标题栏） | `src/host/Program.cs` |
| 前端（渲染、编辑、目录、主题、分栏拖拽、视图互换） | `src/app/js/app.js`、`css/app.css`、`index.html` |
| 构建（csc 编译 + 组装 + zip） | `build.ps1` |
| 图标生成（支持任意方形 PNG → 多尺寸 ico） | `tools/make-icon.py --source <png>` |

调试手段：

- `--evalfile=<js>` / `--eval=<js>`：页面就绪后执行脚本，可用 `window.__lm`（`state`、`setMode`、`setSwapped`、`applySplit`、`save`、`debug` 等）做自动化验证；
- `LUMENMARK_DEBUG=1` 时会把调试日志写到数据目录的 `debug.log`；
- `tools/capture.py` 用 `PrintWindow` 截取窗口，便于回归对比。

设计上的已知取舍：不引入前端构建工具（CodeMirror 5 直接用 `<script>` 引入），换取零依赖构建；
消息桥用自写的极简 JSON 解析，避免为宿主额外引入 DLL；左侧栏默认常驻，窗口较窄时自动收窄。

前端回归：安装 Node.js 与 Playwright 后，执行 `node tools/test-renderer.cjs`。
可用 `CHROMIUM_PATH` 指定 Chromium 可执行文件。测试覆盖 HTML 注入隔离、
Markdown 渲染、保存期间继续输入的脏状态，以及源码模式延迟预览。

## 第三方组件与许可

- [markdown-it](https://github.com/markdown-it/markdown-it) — MIT
- [highlight.js](https://github.com/highlightjs/highlight.js) — BSD-3-Clause
- [CodeMirror 5](https://github.com/codemirror/codemirror5) — MIT
- Microsoft WebView2 SDK 的托管程序集 / `WebView2Loader.dll` — 随应用再分发，遵循 Microsoft 的相关许可条款

见 `THIRD-PARTY-NOTICES.md` 与 `src/app/vendor/LICENSE-*.txt`。

---

Lumen Mark 由 DeepSeek Harness 会话内的 AI 协作开发：宿主、界面、构建脚本与测试都在同一次会话中完成；
技术选型为「成熟底座（WebView2 + markdown-it + CodeMirror）+ 薄定制层」，与 Lumen Player 的思路一脉相承。
