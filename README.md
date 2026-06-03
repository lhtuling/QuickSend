# QuickSend

QuickSend is a local desktop productivity tool for quickly inserting frequently used text, images, templates, and AI prompts into any input box.

It is built with Tauri 2, React, TypeScript, Rust, and SQLite. Data stays on the user's machine and can be exported/imported as JSON.

## Features

- Configurable global popup shortcut, defaulting to `Ctrl + Alt + Q`
- Phrase groups for organizing repeated content
- Text and image phrases
- One-click paste and right-click copy
- Per-phrase hotkeys
- Abbreviation expansion with configurable intent prefixes
- App-specific default groups
- App blacklist for disabling hotkeys and expansion in selected processes
- Usage tracking, favorites, recent/frequent views, and duplicate detection
- Tags with tag filters and popup search support
- Variable templates, including defaults such as `{customer}` and `{detail=order number}`
- Clipboard history with manual capture, optional auto-capture while settings is open, favorites, search, and "to phrase"
- Sensitive clipboard filtering for likely passwords, codes, tokens, cards, and API keys
- JSON backup and restore
- System tray and optional autostart

## Common Workflows

### Paste a phrase

1. Place the cursor in any input box.
2. Press the configured popup shortcut. The default is `Ctrl + Alt + Q`.
3. Search or select a phrase.
4. Press `Enter` or click it.

### Create a template

Create a text phrase like:

```text
Hello {customer}, your order {order_id} has been handled.
```

When selected from the popup, QuickSend asks for the variable values before pasting.

Defaults are supported:

```text
Please provide {detail=the order number}.
```

### Use abbreviation expansion

Create an expansion or phrase abbreviation such as:

```text
;addr
```

Type `;addr` and press Space. QuickSend replaces it with the configured content.

By default, expansion requires an intent prefix such as `;`, `/`, `#`, `:`, or `\` to avoid accidental triggers.

### Use tags

Add comma-separated tags to phrases:

```text
support, prompt, account
```

Tags appear as filters in the settings page and are searchable in the popup.

### Clipboard history

Open `Clipboard` in settings:

- Capture the current clipboard manually
- Turn on auto-capture while the settings window is open
- Search, favorite, delete, or convert entries into phrases

Sensitive-looking text is skipped.

## Development

Install dependencies:

```bash
npm install
```

Run the frontend only:

```bash
npm run dev
```

Run the Tauri app:

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

Build desktop app:

```bash
npm run tauri build
```

## Data

QuickSend stores data locally in SQLite. Common locations:

- Windows: `%APPDATA%/quicksend/quicksend.db`
- macOS: `~/Library/Application Support/quicksend/quicksend.db`
- Linux: `~/.local/share/quicksend/quicksend.db`

Use JSON export/import for backup and migration.

## Verification

Current verification commands:

```bash
npm run build
cd src-tauri && cargo test --lib
```

## More Docs

- [User Guide](docs/USER_GUIDE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
