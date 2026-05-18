# QuickSend 开发指南

这份文档面向开发者，说明本地开发、构建、编码约定和上传 GitHub 的准备工作。

## 技术栈

- Tauri 2：桌面应用外壳和系统能力。
- React 18：设置页和快捷面板 UI。
- TypeScript：前端类型约束。
- Rust：剪贴板、输入监听、数据库、系统托盘和平台能力。
- SQLite：本地数据存储。
- Tailwind CSS：界面样式。

## 本地开发

安装依赖：

```bash
npm install
```

启动 Tauri 开发模式：

```bash
npm run tauri dev
```

只启动 Vite 前端：

```bash
npm run dev
```

只构建前端：

```bash
npm run build
```

构建桌面应用：

```bash
npm run tauri build
```

Windows 一键构建：

```bat
build.bat
```

## 目录说明

```text
src/
├─ App.tsx                  根据 hash 路由显示 popup 或 settings
├─ components/Popup.tsx     快捷短语面板
├─ components/Settings.tsx  设置和数据管理页
├─ hooks/useTauri.ts        前端调用后端命令的封装
├─ types/index.ts           共享数据类型
└─ utils/pinyin.ts          搜索评分和拼音匹配

src-tauri/src/
├─ lib.rs                   Tauri 初始化、窗口、托盘、命令注册
├─ main.rs                  桌面入口
├─ commands/mod.rs          Tauri 命令实现
├─ db/mod.rs                SQLite 表结构和 CRUD
├─ input.rs                 全局键盘监听、热键、文本扩展
└─ platform/mod.rs          鼠标位置、前台进程、自启动等平台实现
```

## 前后端接口

前端统一通过 `src/hooks/useTauri.ts` 调用 Tauri 命令。新增后端能力时，建议按下面顺序修改：

1. 在 `src-tauri/src/db/mod.rs` 或对应 Rust 模块中实现核心逻辑。
2. 在 `src-tauri/src/commands/mod.rs` 添加 `#[tauri::command]`。
3. 在 `src-tauri/src/lib.rs` 的 `generate_handler!` 中注册命令。
4. 在 `src/hooks/useTauri.ts` 添加前端封装函数。
5. 在组件中调用封装函数，而不是直接散落 `invoke`。

## 数据模型

核心表：

- `groups`：短语分组。
- `phrases`：文本或图片短语。
- `text_expansions`：缩写展开规则。
- `process_rules`：前台进程到默认分组的映射。
- `settings`：全局设置键值。

导入导出使用 JSON，当前格式版本为 `version: 1`。

## 构建产物

不要把下面目录提交到 GitHub：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- 本地数据库文件，例如 `*.db`、`*.sqlite`

这些规则已经写入 `.gitignore`。

## 上传 GitHub 前检查

```bash
npm run build
git status --short
```

首次上传流程：

```bash
git init
git branch -M main
git add .
git commit -m "docs: add project documentation"
git remote add origin <your-repo-url>
git push -u origin main
```

`<your-repo-url>` 需要替换成 GitHub 仓库地址，例如：

```bash
git remote add origin https://github.com/<owner>/<repo>.git
```

## 编码约定

- 文档和源码统一使用 UTF-8。
- 前端新增 Tauri 调用时优先放在 `useTauri.ts`。
- Rust 数据库操作集中在 `db/mod.rs`。
- 平台差异逻辑放在 `platform/mod.rs`，避免散落在命令层。
- 避免提交构建产物、依赖目录和本机数据。

