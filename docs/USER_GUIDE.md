# QuickSend User Guide

QuickSend helps you paste repeated content quickly into any input box.

## Remember These Shortcuts

| Action | Shortcut |
| --- | --- |
| Open popup | `Ctrl + Alt + Q` |
| Paste selected phrase | `Enter` or click |
| Copy phrase only | Right click |
| Switch group | `Tab` / `Shift + Tab` |
| Close popup | `Esc` |
| Expand abbreviation | Type abbreviation, then Space |

## Phrases

Open `Phrases` in settings to create, edit, delete, favorite, tag, and organize phrases.

Phrase types:

- `Text`: normal or multi-line text
- `Image`: pasted or selected image data

Phrase tools:

- `Groups`: primary organization
- `Tags`: comma-separated cross-category labels
- `Favorites`: pin important phrases
- `Recent`: phrases used recently
- `Frequent`: phrases with usage count
- `Duplicates`: possible duplicate content

## Templates

Variables are written with braces:

```text
Hello {customer}, your order {order_id} has been handled.
```

Defaults are supported:

```text
Please provide {detail=the order number}.
```

When a template phrase is selected from the popup, QuickSend asks for values before pasting.

## Text Expansion

Expansion turns short abbreviations into longer text.

Example:

```text
;email
```

Type `;email` and press Space.

To reduce accidental triggers, QuickSend can require intent prefixes. Configure this in `Expansion`.

## App Rules

Open `Apps` in settings.

Use:

- `Disabled apps`: one process name per line. Hotkeys and expansion are disabled there.
- `Default group by app`: choose which group opens first for specific processes.

Use `Add current` or `Current` to capture the foreground process name.

## Clipboard History

Open `Clipboard` in settings.

You can:

- Capture current clipboard text
- Turn on auto-capture while settings is open
- Search history
- Favorite entries
- Convert an entry to a phrase
- Delete entries

Sensitive-looking content is skipped, including likely verification codes, cards, passwords, tokens, secrets, and API keys.

## Backup

Open `Settings`.

- `Export JSON`: save all groups, phrases, expansions, rules, and settings
- `Import JSON`: replace current data with a previous export

Always export a fresh backup before importing.
