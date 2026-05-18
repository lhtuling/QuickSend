# QuickSend

QuickSend 是一个跨平台快捷短语粘贴工具。它可以用全局快捷键呼出短语面板，快速搜索、复制或粘贴常用文本和图片，也支持文本扩展、进程规则、开机自启动和 JSON 数据备份。

项目使用 Tauri 2、React 18、TypeScript、Rust 和 SQLite 构建。数据保存在本机，不依赖云端服务。

## 功能特性

- 全局呼出：按 `Ctrl+Alt+Q` 在鼠标附近打开快捷短语面板。
- 快速粘贴：单击或按 `Enter` 粘贴选中的短语，右键只复制到剪贴板。
- 分组管理：按场景管理常用短语，并设置全局默认分组。
- 搜索匹配：支持按标题、内容、缩写以及中文拼音进行搜索。
- 文本和图片短语：可保存多行文本，也可保存图片并直接写入剪贴板。
- 独立热键：每条短语可设置自己的组合键，直接触发粘贴。
- 文本扩展：输入缩写后按 `Alt`，自动替换为完整文本。
- 进程规则：根据当前前台应用自动切换默认短语分组。
- 数据备份：支持导出和导入 JSON。
- 系统托盘：后台常驻运行，可从托盘进入设置或退出应用。

## 环境要求

- Node.js 18 或更高版本
- Rust stable toolchain
- Windows 10/11、macOS 或 Linux
- Windows 需要 WebView2 Runtime。多数 Windows 10/11 系统已内置。
- Linux 需要 WebKitGTK、AppIndicator、RSVG、xdotool、xclip 等依赖。

Ubuntu/Debian 可参考：

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdotool xclip
```

## 安装与运行

```bash
npm install
npm run tauri dev
```

仅构建前端：

```bash
npm run build
```

构建桌面应用：

```bash
npm run tauri build
```

Windows 也可以直接运行：

```bat
build.bat
```

构建产物通常位于：

- `src-tauri/target/release/quicksend.exe`
- `src-tauri/target/release/bundle/`

## 快速使用

1. 启动 QuickSend 后进入设置窗口。
2. 在「短语管理」里创建分组和短语。
3. 按 `Ctrl+Alt+Q` 呼出快捷面板。
4. 输入关键词搜索短语。
5. 按 `Enter` 或单击短语进行粘贴。
6. 右键短语时只复制，不自动粘贴。

常用快捷键：

| 操作 | 快捷键 |
| --- | --- |
| 呼出或隐藏短语面板 | `Ctrl+Alt+Q` |
| 上下选择短语 | `ArrowUp` / `ArrowDown` |
| 粘贴选中短语 | `Enter` |
| 切换分组 | `Tab` / `Shift+Tab` |
| 关闭面板 | `Esc` |
| 只复制短语 | 右键短语 |
| 触发文本扩展 | 输入缩写后按 `Alt` |

## 数据位置

QuickSend 使用 SQLite 保存本地数据，默认路径如下：

| 平台 | 数据库路径 |
| --- | --- |
| Windows | `%APPDATA%/quicksend/quicksend.db` |
| macOS | `~/Library/Application Support/quicksend/quicksend.db` |
| Linux | `~/.local/share/quicksend/quicksend.db` |

建议通过设置页的 JSON 导出功能做备份，不要直接提交数据库文件。

## 项目结构

```text
QuickSend/
├─ src/                         React 前端
│  ├─ components/               设置页和快捷面板
│  ├─ hooks/useTauri.ts         Tauri 命令封装
│  ├─ types/                    前端类型定义
│  └─ utils/pinyin.ts           拼音搜索工具
├─ src-tauri/                   Rust 后端
│  ├─ src/commands/             Tauri 命令入口
│  ├─ src/db/                   SQLite 数据层
│  ├─ src/input.rs              全局键盘监听和文本扩展
│  ├─ src/platform/             平台相关能力
│  └─ tauri.conf.json           Tauri 应用配置
├─ docs/                        详细文档
├─ package.json                 前端脚本与依赖
└─ build.bat                    Windows 一键构建脚本
```

## 更多文档

- [用户指南](docs/USER_GUIDE.md)
- [开发指南](docs/DEVELOPMENT.md)
- [架构说明](docs/ARCHITECTURE.md)

## 上传到 GitHub

如果本地还没有 git 仓库，可按下面流程初始化并推送。将 `<your-repo-url>` 替换为 GitHub 上新建仓库的 HTTPS 或 SSH 地址。

```bash
git init
git branch -M main
git add .
git commit -m "docs: add project documentation"
git remote add origin <your-repo-url>
git push -u origin main
```

如果仓库已经存在，只需要确认 remote 后执行：

```bash
git remote -v
git push
```

