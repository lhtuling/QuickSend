# QuickSend Development Guide

## Stack

- Tauri 2 for the desktop shell
- React 18 and TypeScript for UI
- Rust for commands, global input listening, tray, clipboard, platform integration, and SQLite access
- SQLite for local storage
- Tailwind CSS for styling

## Commands

Install dependencies:

```bash
npm install
```

Run frontend only:

```bash
npm run dev
```

Run desktop app:

```bash
npm run tauri dev
```

Build frontend:

```bash
npm run build
```

Run Rust tests:

```bash
cd src-tauri
cargo test --lib
```

Build release:

```bash
npm run tauri build
```

## Structure

```text
src/
  App.tsx                 Hash route between popup and settings
  components/Popup.tsx    Quick phrase popup
  components/Settings.tsx Settings, phrase management, clipboard, app rules
  hooks/useTauri.ts       Frontend wrappers for Tauri commands
  types/index.ts          Shared TypeScript types
  utils/pinyin.ts         Search and pinyin matching helpers

src-tauri/src/
  lib.rs                  Tauri setup, tray, windows, command registration
  main.rs                 Desktop entry
  commands/mod.rs         Tauri commands
  db/mod.rs               SQLite schema, migrations, CRUD, import/export
  input.rs                Global input listener, hotkeys, text expansion
  platform/mod.rs         Cursor, foreground process, autostart
```

## Adding a Tauri Command

1. Implement core logic in Rust.
2. Add a `#[tauri::command]` function in `src-tauri/src/commands/mod.rs`.
3. Register it in `tauri::generate_handler!` in `src-tauri/src/lib.rs`.
4. Add a wrapper in `src/hooks/useTauri.ts`.
5. Call the wrapper from React.

## Data Model

Main tables:

- `groups`
- `phrases`
- `text_expansions`
- `process_rules`
- `settings`

Phrase fields include:

- `favorite`
- `usage_count`
- `last_used_at`
- `tags`
- `hotkey`
- `abbreviation`

Database migrations are handled in `Database::ensure_phrase_columns`.

## Verification Checklist

Before release:

```bash
npm run build
cd src-tauri
cargo test --lib
```

Also manually check:

- Settings page opens
- Phrase create/edit/delete works
- Tags and filters work
- Popup search works
- Template variables render
- Expansion settings save
- App blacklist saves
- Clipboard capture works
- Export/import works

## Coding Notes

- Keep frontend Tauri calls in `useTauri.ts`.
- Keep database operations in `db/mod.rs`.
- Keep platform-specific code in `platform/mod.rs`.
- Keep user data local.
- Avoid committing `node_modules`, `dist`, `src-tauri/target`, or local database files.
