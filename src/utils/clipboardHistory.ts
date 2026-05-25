export type ClipboardHistoryItem = {
  id: string;
  text: string;
  created_at: string;
  favorite: boolean;
};

export const CLIPBOARD_STORAGE_KEY = "quicksend.clipboardHistory";

export function readClipboardHistory(): ClipboardHistoryItem[] {
  try {
    const raw = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveClipboardHistory(items: ClipboardHistoryItem[]) {
  localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(items.slice(0, 100)));
}

export function addClipboardItem(items: ClipboardHistoryItem[], text: string) {
  const normalized = normalizeClipboardText(text);
  if (!normalized) return items;
  if (items[0]?.text && normalizeClipboardText(items[0].text) === normalized) return items;
  const filtered = items.filter((item) => normalizeClipboardText(item.text) !== normalized);
  return [{ id: crypto.randomUUID(), text, created_at: new Date().toISOString(), favorite: false }, ...filtered].slice(0, 100);
}

export function isSensitiveClipboardText(text: string) {
  const compact = text.replace(/\s+/g, "");
  if (/^\d{4,8}$/.test(compact)) return true;
  if (/^\d{13,19}$/.test(compact)) return true;
  if (/password|passwd|token|secret|api[_-]?key/i.test(text)) return true;
  if (/^(sk|pk|ghp|github_pat|eyJ)[A-Za-z0-9_\-.]{16,}$/.test(compact)) return true;
  return false;
}

export function normalizeClipboardText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
