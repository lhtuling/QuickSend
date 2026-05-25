import { useCallback, useEffect, useMemo, useState } from "react";
import { readImage, readText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Clipboard,
  ClipboardList,
  Download,
  FileImage,
  FolderPlus,
  Monitor,
  Pencil,
  Plus,
  Save,
  Search,
  Settings as SettingsIcon,
  Star,
  Trash2,
  Type,
  Upload,
  Zap,
} from "lucide-react";
import {
  createGroup,
  createPhrase,
  createTextExpansion,
  deleteGroup,
  deletePhrase,
  deleteProcessRule,
  deleteTextExpansion,
  exportData,
  getActiveProcessName,
  getAutostartEnabled,
  getGroups,
  getPhrases,
  getPhrasesByGroup,
  getProcessRules,
  getSettings,
  getTextExpansions,
  importData,
  setAutostartEnabled,
  setProcessRule,
  updateGroup,
  updatePhrase,
  updatePhraseFavorite,
  updateSetting,
  updateTextExpansion,
} from "../hooks/useTauri";
import { useI18n } from "../i18n";
import {
  addClipboardItem,
  isSensitiveClipboardText,
  readClipboardHistory,
  saveClipboardHistory,
  type ClipboardHistoryItem,
} from "../utils/clipboardHistory";
import { pinyinMatch } from "../utils/pinyin";
import type { Group, Phrase, ProcessRule, Setting, TextExpansion } from "../types";

type Tab = "phrases" | "expansions" | "clipboard" | "process" | "settings";
type PhraseView = "all" | "favorites" | "recent" | "frequent" | "duplicates";
type PhraseDraft = Partial<Phrase> & { group_id: string; title: string; content_type: "text" | "image" };
type ClipboardPhraseDraft = Pick<PhraseDraft, "content_type" | "content" | "image_data" | "title">;

const GROUP_ICONS = ["*", "#", "@", "AI", "S", "T", "1", "2", "3", "A", "B", "C"];
const DEFAULT_TRIGGER_PREFIXES = ";/#:\\";

export default function SettingsPage() {
  const { t, configuredLanguage, languages, languageDir, setLanguage } = useI18n();
  const [tab, setTab] = useState<Tab>("phrases");
  const [groups, setGroups] = useState<Group[]>([]);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [phraseView, setPhraseView] = useState<PhraseView>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [autostartEnabled, setAutostartEnabledState] = useState(false);
  const [autostartStatus, setAutostartStatus] = useState("");
  const [expansions, setExpansions] = useState<TextExpansion[]>([]);
  const [processRules, setProcessRules] = useState<ProcessRule[]>([]);
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardHistoryItem[]>([]);
  const [clipboardSearch, setClipboardSearch] = useState("");
  const [clipboardStatus, setClipboardStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingGroup, setEditingGroup] = useState<Partial<Group> | null>(null);
  const [editingPhrase, setEditingPhrase] = useState<PhraseDraft | null>(null);
  const [editingExpansion, setEditingExpansion] = useState<Partial<TextExpansion> | null>(null);
  const [editingRule, setEditingRule] = useState<Partial<ProcessRule> | null>(null);
  const [importText, setImportText] = useState("");

  const settingsMap = useMemo(() => new Map(settings.map((item) => [item.key, item.value])), [settings]);
  const requireTriggerPrefix = settingsMap.get("text_expansion_require_prefix") !== "false";
  const triggerPrefixes = settingsMap.get("text_expansion_prefixes") || DEFAULT_TRIGGER_PREFIXES;
  const disabledProcesses = settingsMap.get("disabled_processes") || "";
  const autoCaptureClipboard = settingsMap.get("auto_capture_clipboard") === "true";

  const loadGroups = useCallback(async () => {
    const loaded = await getGroups();
    setGroups(loaded);
    setSelectedGroup((current) => current ?? loaded[0]?.id ?? null);
  }, []);

  const loadPhrases = useCallback(async () => {
    setPhrases(selectedGroup ? await getPhrasesByGroup(selectedGroup) : await getPhrases());
  }, [selectedGroup]);

  const loadSettings = useCallback(async () => setSettings(await getSettings()), []);

  const loadAutostart = useCallback(async () => {
    try {
      setAutostartEnabledState(await getAutostartEnabled());
      setAutostartStatus("");
    } catch (error) {
      setAutostartStatus(String(error));
    }
  }, []);

  const loadExpansions = useCallback(async () => setExpansions(await getTextExpansions()), []);
  const loadRules = useCallback(async () => setProcessRules(await getProcessRules()), []);

  useEffect(() => {
    loadGroups();
    loadSettings();
    loadAutostart();
    setClipboardHistory(readClipboardHistory());
  }, [loadAutostart, loadGroups, loadSettings]);

  useEffect(() => {
    loadPhrases();
  }, [loadPhrases]);

  useEffect(() => {
    if (tab === "expansions") loadExpansions();
    if (tab === "process") loadRules();
  }, [loadExpansions, loadRules, tab]);

  useEffect(() => {
    if (!autoCaptureClipboard) return;
    const timer = window.setInterval(async () => {
      try {
        const text = (await readText()).trim();
        if (!text || isSensitiveClipboardText(text)) return;
        setClipboardHistory((current) => {
          const next = addClipboardItem(current, text);
          if (next === current) return current;
          saveClipboardHistory(next);
          return next;
        });
      } catch {
        // Clipboard can temporarily hold non-text data.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [autoCaptureClipboard]);

  const filteredPhrases = useMemo(() => {
    const duplicateIds = phraseView === "duplicates" ? findDuplicatePhraseIds(phrases) : new Set<string>();
    const scoped = phrases.filter((phrase) => {
      if (phraseView === "favorites" && !phrase.favorite) return false;
      if (phraseView === "recent" && !phrase.last_used_at) return false;
      if (phraseView === "frequent" && (phrase.usage_count || 0) === 0) return false;
      if (phraseView === "duplicates" && !duplicateIds.has(phrase.id)) return false;
      if (selectedTag && !phraseTags(phrase).includes(selectedTag)) return false;
      return true;
    });
    const sorted = [...scoped].sort((a, b) => {
      if (phraseView === "recent") return compareDateDesc(a.last_used_at, b.last_used_at);
      if (phraseView === "frequent") return (b.usage_count || 0) - (a.usage_count || 0);
      if (phraseView === "duplicates") return normalizePhraseContent(a).localeCompare(normalizePhraseContent(b));
      return 0;
    });
    const query = searchQuery.trim();
    if (!query) return sorted;
    return sorted.filter((phrase) =>
      pinyinMatch(phrase.title, query) ||
      pinyinMatch(phrase.content, query) ||
      (phrase.abbreviation ? pinyinMatch(phrase.abbreviation, query) : false) ||
      (phrase.tags ? pinyinMatch(phrase.tags, query) : false)
    );
  }, [phraseView, phrases, searchQuery, selectedTag]);

  const phraseViewCounts = useMemo(() => {
    const duplicateIds = findDuplicatePhraseIds(phrases);
    return {
      all: phrases.length,
      favorites: phrases.filter((phrase) => phrase.favorite).length,
      recent: phrases.filter((phrase) => Boolean(phrase.last_used_at)).length,
      frequent: phrases.filter((phrase) => (phrase.usage_count || 0) > 0).length,
      duplicates: duplicateIds.size,
    };
  }, [phrases]);

  const allTags = useMemo(() => Array.from(new Set(phrases.flatMap(phraseTags))).sort((a, b) => a.localeCompare(b)), [phrases]);
  const filteredClipboardHistory = useMemo(() => {
    const query = clipboardSearch.trim().toLowerCase();
    return clipboardHistory.filter((item) => !query || item.text.toLowerCase().includes(query));
  }, [clipboardHistory, clipboardSearch]);

  async function saveGroup() {
    if (!editingGroup?.name?.trim()) return;
    if (editingGroup.id) {
      await updateGroup(editingGroup.id, editingGroup.name.trim(), editingGroup.icon || "*");
    } else {
      const group = await createGroup(editingGroup.name.trim(), editingGroup.icon || "*");
      setSelectedGroup(group.id);
    }
    setEditingGroup(null);
    await loadGroups();
  }

  async function removeGroup(groupId: string) {
    if (!confirm(t("phrase.groupDeleteConfirm"))) return;
    await deleteGroup(groupId);
    setSelectedGroup(null);
    await loadGroups();
    await loadPhrases();
  }

  async function savePhrase() {
    if (!editingPhrase?.title.trim() || !editingPhrase.group_id) return;
    const args = [
      editingPhrase.group_id,
      editingPhrase.title.trim(),
      editingPhrase.content || "",
      editingPhrase.content_type,
      editingPhrase.image_data || null,
      editingPhrase.hotkey || null,
      editingPhrase.abbreviation || null,
      normalizeTags(editingPhrase.tags || ""),
    ] as const;
    if (editingPhrase.id) {
      await updatePhrase(editingPhrase.id, ...args);
    } else {
      await createPhrase(...args);
    }
    setEditingPhrase(null);
    await loadPhrases();
  }

  async function saveExpansion() {
    if (!editingExpansion?.abbreviation?.trim() || !editingExpansion.expanded_text?.trim()) return;
    if (editingExpansion.id) {
      await updateTextExpansion(editingExpansion.id, editingExpansion.abbreviation.trim(), editingExpansion.expanded_text, editingExpansion.enabled ?? true);
    } else {
      await createTextExpansion(editingExpansion.abbreviation.trim(), editingExpansion.expanded_text);
    }
    setEditingExpansion(null);
    await loadExpansions();
  }

  async function saveRule() {
    if (!editingRule?.process_name?.trim() || !editingRule.group_id) return;
    await setProcessRule(editingRule.process_name.trim(), editingRule.group_id);
    setEditingRule(null);
    await loadRules();
  }

  async function captureProcess() {
    const processName = await getActiveProcessName();
    setEditingRule((current) => ({ ...(current || {}), process_name: processName }));
  }

  async function addCurrentProcessToBlacklist() {
    const processName = await getActiveProcessName();
    const values = new Set(disabledProcesses.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
    values.add(processName);
    await saveSetting("disabled_processes", Array.from(values).join("\n"));
  }

  async function saveSetting(key: string, value: string) {
    await updateSetting(key, value);
    await loadSettings();
  }

  async function toggleAutostart() {
    const next = !autostartEnabled;
    setAutostartStatus(next ? t("settings.autostartEnabling") : t("settings.autostartDisabling"));
    try {
      const actual = await setAutostartEnabled(next);
      setAutostartEnabledState(actual);
      setAutostartStatus(actual ? t("settings.autostartEnabled") : t("settings.autostartDisabled"));
    } catch (error) {
      setAutostartStatus(t("settings.failed", { error: String(error) }));
      await loadAutostart();
    }
  }

  async function handleImageFile(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setEditingPhrase((current) => current ? { ...current, content_type: "image", image_data: dataUrl.split(",")[1] || dataUrl, content: file.name } : current);
  }

  async function handleExport() {
    const data = await exportData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quicksend-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!importText.trim()) return;
    if (!confirm(t("settings.importConfirm"))) return;
    await importData(importText);
    setImportText("");
    await Promise.all([loadGroups(), loadPhrases(), loadExpansions(), loadRules(), loadSettings()]);
  }

  function newPhraseDraft(): PhraseDraft {
    return {
      group_id: selectedGroup || groups[0]?.id || "",
      title: "",
      content: "",
      content_type: "text",
      image_data: null,
      hotkey: null,
      abbreviation: null,
      tags: null,
    };
  }

  async function newPhraseFromClipboard() {
    setEditingPhrase({ ...newPhraseDraft(), ...(await readClipboardPhraseDraft()) });
  }

  async function readClipboardPhraseDraft(): Promise<Partial<ClipboardPhraseDraft>> {
    const imageDraft = await readClipboardImageDraft();
    if (imageDraft) return imageDraft;
    try {
      const text = await readText();
      if (text.trim()) return { content_type: "text", title: toTitle(text, t("clipboard.title")), content: text, image_data: null };
    } catch {
      // Clipboard may not contain text.
    }
    return {};
  }

  async function readClipboardImageDraft(): Promise<Partial<ClipboardPhraseDraft> | null> {
    try {
      const image = await readImage();
      const [rgba, size] = await Promise.all([image.rgba(), image.size()]);
      const dataUrl = rgbaToPngDataUrl(rgba, size.width, size.height);
      return { content_type: "image", title: t("clipboard.imageTitle"), content: t("clipboard.imageTitle"), image_data: dataUrl.split(",")[1] || dataUrl };
    } catch {
      return null;
    }
  }

  async function handlePhrasePaste(event: React.ClipboardEvent) {
    if (!editingPhrase) return;
    const imageFile = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (imageFile) {
      event.preventDefault();
      await handleImageFile(imageFile);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    if (text && editingPhrase.content_type === "image") {
      event.preventDefault();
      setEditingPhrase({ ...editingPhrase, content_type: "text", title: editingPhrase.title || toTitle(text, t("clipboard.title")), content: text, image_data: null });
    }
  }

  function captureHotkey(event: React.KeyboardEvent<HTMLInputElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Backspace" || event.key === "Delete") {
      setEditingPhrase((current) => (current ? { ...current, hotkey: null } : current));
      return;
    }
    const key = hotkeyKeyLabel(event);
    if (!key) return;
    const parts: string[] = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    if (parts.length === 0) return;
    setEditingPhrase((current) => (current ? { ...current, hotkey: [...parts, key].join("+") } : current));
  }

  async function captureClipboardText() {
    try {
      const trimmed = (await readText()).trim();
      if (!trimmed) return setClipboardStatus(t("clipboard.noText"));
      if (isSensitiveClipboardText(trimmed)) return setClipboardStatus(t("clipboard.sensitive"));
      const next = addClipboardItem(clipboardHistory, trimmed);
      saveClipboardHistory(next);
      setClipboardHistory(next);
      setClipboardStatus(t("clipboard.captured"));
    } catch (error) {
      setClipboardStatus(String(error));
    }
  }

  function toggleClipboardFavorite(id: string) {
    const next = clipboardHistory.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item);
    saveClipboardHistory(next);
    setClipboardHistory(next);
  }

  function deleteClipboardItem(id: string) {
    const next = clipboardHistory.filter((item) => item.id !== id);
    saveClipboardHistory(next);
    setClipboardHistory(next);
  }

  function clearClipboardHistory() {
    if (!confirm(t("clipboard.clearConfirm"))) return;
    saveClipboardHistory([]);
    setClipboardHistory([]);
  }

  function createPhraseFromClipboardItem(item: ClipboardHistoryItem) {
    setTab("phrases");
    setEditingPhrase({ ...newPhraseDraft(), title: toTitle(item.text, t("clipboard.title")), content: item.text });
  }

  async function togglePhraseFavorite(phrase: Phrase) {
    await updatePhraseFavorite(phrase.id, !phrase.favorite);
    await loadPhrases();
  }

  function phraseImageSrc(phrase: Phrase) {
    if (!phrase.image_data) return "";
    return phrase.image_data.startsWith("data:") ? phrase.image_data : `data:image/png;base64,${phrase.image_data}`;
  }

  const navItems = [
    { id: "phrases" as Tab, label: t("nav.phrases"), icon: ClipboardList },
    { id: "expansions" as Tab, label: t("nav.expansions"), icon: Type },
    { id: "clipboard" as Tab, label: t("nav.clipboard"), icon: Clipboard },
    { id: "process" as Tab, label: t("nav.apps"), icon: Monitor },
    { id: "settings" as Tab, label: t("nav.settings"), icon: SettingsIcon },
  ];

  return (
    <div className="flex h-screen bg-qs-bg text-qs-text">
      <aside className="flex w-60 shrink-0 flex-col border-r border-qs-border bg-qs-surface">
        <div className="border-b border-qs-border p-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="h-5 w-5 text-qs-accent" /> QuickSend
          </h1>
          <p className="mt-1 text-xs text-qs-textMuted">{t("app.subtitle")}</p>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${tab === item.id ? "bg-qs-accent text-white" : "text-qs-textMuted hover:bg-qs-surface2 hover:text-qs-text"}`}>
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-qs-border p-4">
          <div>
            <h2 className="text-lg font-semibold">{navItems.find((item) => item.id === tab)?.label}</h2>
            <p className="mt-0.5 text-xs text-qs-textMuted">{t("header.help")}</p>
          </div>
          <div className="flex gap-2">
            {tab === "phrases" && <>
              <button className="toolbar-button" onClick={() => setEditingGroup({ icon: "*" })}><FolderPlus className="h-4 w-4" /> {t("action.group")}</button>
              <button className="primary-button" onClick={newPhraseFromClipboard}><Plus className="h-4 w-4" /> {t("action.phrase")}</button>
            </>}
            {tab === "expansions" && <button className="primary-button" onClick={() => setEditingExpansion({ enabled: true })}><Plus className="h-4 w-4" /> {t("action.expansion")}</button>}
            {tab === "clipboard" && <button className="primary-button" onClick={captureClipboardText}><Clipboard className="h-4 w-4" /> {t("action.capture")}</button>}
            {tab === "process" && <button className="primary-button" onClick={() => setEditingRule({ group_id: groups[0]?.id })}><Plus className="h-4 w-4" /> {t("action.rule")}</button>}
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-auto p-4">
          {tab === "phrases" && (
            <div className="flex h-full gap-4">
              <div className="w-56 shrink-0 space-y-1">
                <button onClick={() => setSelectedGroup(null)} className={`group-row ${selectedGroup === null ? "group-row-active" : ""}`}>{t("phrase.allPhrases")}</button>
                {groups.map((group) => (
                  <div key={group.id} className={`group-row ${selectedGroup === group.id ? "group-row-active" : ""}`}>
                    <button className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedGroup(group.id)}>{group.icon} {group.name}</button>
                    <button className="icon-button" onClick={() => setEditingGroup(group)} title={t("group.edit")}><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="icon-button danger" onClick={() => removeGroup(group.id)} title={t("group.delete")}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap gap-2">
                  {([
                    ["all", "phrase.view.all", phraseViewCounts.all],
                    ["favorites", "phrase.view.favorites", phraseViewCounts.favorites],
                    ["recent", "phrase.view.recent", phraseViewCounts.recent],
                    ["frequent", "phrase.view.frequent", phraseViewCounts.frequent],
                    ["duplicates", "phrase.view.duplicates", phraseViewCounts.duplicates],
                  ] as [PhraseView, string, number][]).map(([id, label, count]) => (
                    <button key={id} onClick={() => setPhraseView(id)} className={`rounded-md px-2.5 py-1 text-xs transition-colors ${phraseView === id ? "bg-qs-accent text-white" : "bg-qs-surface text-qs-textMuted hover:bg-qs-surface2 hover:text-qs-text"}`}>
                      {t(label)} {count}
                    </button>
                  ))}
                </div>
                {allTags.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button onClick={() => setSelectedTag(null)} className={`rounded-md px-2.5 py-1 text-xs transition-colors ${selectedTag === null ? "bg-qs-accent text-white" : "bg-qs-surface text-qs-textMuted hover:bg-qs-surface2 hover:text-qs-text"}`}>{t("phrase.allTags")}</button>
                    {allTags.map((tag) => <button key={tag} onClick={() => setSelectedTag(tag)} className={`rounded-md px-2.5 py-1 text-xs transition-colors ${selectedTag === tag ? "bg-qs-accent text-white" : "bg-qs-surface text-qs-textMuted hover:bg-qs-surface2 hover:text-qs-text"}`}>#{tag}</button>)}
                  </div>
                )}
                <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder={t("phrase.search")} />
                <div className="space-y-2">
                  {filteredPhrases.map((phrase) => (
                    <div key={phrase.id} className="item-row">
                      {phrase.content_type === "image" && phrase.image_data ? <img src={phraseImageSrc(phrase)} alt="" className="h-12 w-12 shrink-0 rounded-md border border-qs-border object-cover" /> : phrase.content_type === "image" ? <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-qs-border bg-qs-bg text-qs-textMuted"><FileImage className="h-5 w-5" /></div> : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{phrase.title}</span>
                          {phrase.content_type === "image" && <span className="badge">{t("phrase.image")}</span>}
                          {phrase.hotkey && <kbd className="kbd">{phrase.hotkey}</kbd>}
                          {phrase.abbreviation && <kbd className="kbd accent">{phrase.abbreviation}</kbd>}
                          {phraseTags(phrase).map((tag) => <span key={tag} className="badge muted">#{tag}</span>)}
                          {phraseView === "duplicates" && <span className="badge muted">{t("phrase.duplicate")}</span>}
                          {(phrase.usage_count || 0) > 0 && <span className="text-[11px] text-qs-textMuted">{t("phrase.used", { count: phrase.usage_count })}</span>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-qs-textMuted">{phrase.content_type === "image" ? phrase.content || t("phrase.imageContent") : phrase.content}</p>
                      </div>
                      <button className={`icon-button ${phrase.favorite ? "text-qs-warning" : ""}`} onClick={() => togglePhraseFavorite(phrase)} title={phrase.favorite ? t("phrase.unfavorite") : t("phrase.favorite")}><Star className={`h-4 w-4 ${phrase.favorite ? "fill-current" : ""}`} /></button>
                      <button className="icon-button" onClick={() => setEditingPhrase({ ...phrase })} title={t("phrase.edit")}><Pencil className="h-4 w-4" /></button>
                      <button className="icon-button danger" title={t("phrase.delete")} onClick={async () => { if (!confirm(t("phrase.deleteConfirm"))) return; await deletePhrase(phrase.id); await loadPhrases(); }}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {filteredPhrases.length === 0 && <EmptyState text={t("phrase.none")} />}
                </div>
              </div>
            </div>
          )}

          {tab === "expansions" && (
            <div className="space-y-3">
              <Panel title={t("expansion.behavior")}>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between gap-4 rounded-lg bg-qs-bg p-3">
                    <span><span className="block text-sm text-qs-text">{t("expansion.requirePrefix")}</span><span className="mt-1 block text-xs text-qs-textMuted">{t("expansion.requirePrefixHint")}</span></span>
                    <input type="checkbox" checked={requireTriggerPrefix} onChange={(event) => saveSetting("text_expansion_require_prefix", String(event.target.checked))} />
                  </label>
                  <label><span className="label">{t("expansion.allowedPrefixes")}</span><input className="field" value={triggerPrefixes} onChange={(event) => saveSetting("text_expansion_prefixes", event.target.value)} placeholder={DEFAULT_TRIGGER_PREFIXES} /></label>
                </div>
              </Panel>
              {expansions.map((item) => (
                <div key={item.id} className="item-row">
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><kbd className="kbd accent">{item.abbreviation}</kbd><span className="text-xs text-qs-textMuted">{t("expansion.spaceToExpand")}</span><span className={`badge ${item.enabled ? "" : "muted"}`}>{item.enabled ? t("expansion.enabled") : t("expansion.disabled")}</span></div><p className="mt-1 whitespace-pre-wrap text-sm text-qs-text">{item.expanded_text}</p></div>
                  <button className="toolbar-button" onClick={async () => { await updateTextExpansion(item.id, item.abbreviation, item.expanded_text, !item.enabled); await loadExpansions(); }}>{item.enabled ? t("action.disable") : t("action.enable")}</button>
                  <button className="icon-button" onClick={() => setEditingExpansion(item)} title={t("dialog.editExpansion")}><Pencil className="h-4 w-4" /></button>
                  <button className="icon-button danger" title={t("phrase.delete")} onClick={async () => { if (!confirm(t("expansion.deleteConfirm"))) return; await deleteTextExpansion(item.id); await loadExpansions(); }}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {expansions.length === 0 && <EmptyState text={t("expansion.none")} />}
            </div>
          )}

          {tab === "clipboard" && (
            <div className="space-y-3">
              <Panel title={t("clipboard.history")}>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="primary-button" onClick={captureClipboardText}><Clipboard className="h-4 w-4" /> {t("clipboard.captureCurrent")}</button>
                  <button className={autoCaptureClipboard ? "primary-button" : "toolbar-button"} onClick={() => saveSetting("auto_capture_clipboard", String(!autoCaptureClipboard))}>{autoCaptureClipboard ? t("clipboard.autoOn") : t("clipboard.autoOff")}</button>
                  <button className="toolbar-button" onClick={clearClipboardHistory}>{t("action.clear")}</button>
                  {clipboardStatus && <span className="text-xs text-qs-textMuted">{clipboardStatus}</span>}
                </div>
                <p className="mt-2 text-xs text-qs-textMuted">{t("clipboard.help")}</p>
              </Panel>
              <SearchBox value={clipboardSearch} onChange={setClipboardSearch} placeholder={t("clipboard.search")} />
              {filteredClipboardHistory.map((item) => (
                <div key={item.id} className="item-row">
                  <div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-2"><span className="text-xs text-qs-textMuted">{new Date(item.created_at).toLocaleString()}</span>{item.favorite && <span className="badge">{t("clipboard.favorite")}</span>}</div><p className="line-clamp-2 whitespace-pre-wrap text-sm text-qs-text">{item.text}</p></div>
                  <button className={`icon-button ${item.favorite ? "text-qs-warning" : ""}`} onClick={() => toggleClipboardFavorite(item.id)} title={t("clipboard.favorite")}><Star className={`h-4 w-4 ${item.favorite ? "fill-current" : ""}`} /></button>
                  <button className="toolbar-button" onClick={() => createPhraseFromClipboardItem(item)}>{t("action.toPhrase")}</button>
                  <button className="icon-button danger" onClick={() => deleteClipboardItem(item.id)} title={t("phrase.delete")}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {filteredClipboardHistory.length === 0 && <EmptyState text={t("clipboard.none")} />}
            </div>
          )}

          {tab === "process" && (
            <div className="space-y-4">
              <Panel title={t("apps.disabled")}>
                <div className="flex gap-2"><textarea className="field h-28 font-mono text-xs" value={disabledProcesses} onChange={(event) => saveSetting("disabled_processes", event.target.value)} placeholder={"code.exe\nwechat.exe"} /><button className="toolbar-button shrink-0 self-start" onClick={addCurrentProcessToBlacklist}>{t("action.current")}</button></div>
                <p className="mt-2 text-xs text-qs-textMuted">{t("apps.disabledHelp")}</p>
              </Panel>
              <Panel title={t("apps.defaultByApp")}>
                <div className="space-y-2">
                  {processRules.map((rule) => {
                    const group = groups.find((item) => item.id === rule.group_id);
                    const groupName = group ? `${group.icon} ${group.name}` : t("apps.unknownGroup");
                    return <div key={rule.id} className="item-row"><Monitor className="h-4 w-4 text-qs-textMuted" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{rule.process_name}</p><p className="text-xs text-qs-textMuted">{t("apps.default", { group: groupName })}</p></div><button className="icon-button" onClick={() => setEditingRule(rule)} title={t("dialog.editRule")}><Pencil className="h-4 w-4" /></button><button className="icon-button danger" title={t("phrase.delete")} onClick={async () => { await deleteProcessRule(rule.id); await loadRules(); }}><Trash2 className="h-4 w-4" /></button></div>;
                  })}
                  {processRules.length === 0 && <EmptyState text={t("apps.none")} />}
                </div>
              </Panel>
            </div>
          )}

          {tab === "settings" && (
            <div className="max-w-2xl space-y-4">
              <Panel title={t("settings.language")}>
                <label><span className="label">{t("settings.languageMode")}</span><select className="field" value={configuredLanguage} onChange={(event) => setLanguage(event.target.value)}>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <p className="mt-2 text-xs text-qs-textMuted">{t("settings.languageHint")}</p>
                {languageDir && <p className="mt-2 break-all text-xs text-qs-textMuted">{t("settings.languageDir")}: {languageDir}</p>}
                <p className="mt-1 text-xs text-qs-textMuted">{t("settings.languageReload")}</p>
              </Panel>
              <Panel title={t("settings.defaultGroup")}><select value={settingsMap.get("default_group_id") || groups[0]?.id || ""} onChange={(event) => saveSetting("default_group_id", event.target.value)} className="field">{groups.map((group) => <option key={group.id} value={group.id}>{group.icon} {group.name}</option>)}</select></Panel>
              <Panel title={t("settings.autostart")}><div className="flex items-center justify-between gap-4"><div><p className="text-sm text-qs-text">{t("settings.autostartTitle")}</p><p className="mt-1 text-xs text-qs-textMuted">{t("settings.autostartHint")}</p>{autostartStatus && <p className="mt-2 text-xs text-qs-warning">{autostartStatus}</p>}</div><button className={autostartEnabled ? "primary-button" : "toolbar-button"} onClick={toggleAutostart}>{autostartEnabled ? t("expansion.enabled") : t("action.enable")}</button></div></Panel>
              <Panel title={t("settings.backup")}><div className="flex gap-2"><button className="primary-button" onClick={handleExport}><Download className="h-4 w-4" /> {t("action.exportJson")}</button><button className="toolbar-button" onClick={handleImport}><Upload className="h-4 w-4" /> {t("action.importJson")}</button></div><textarea value={importText} onChange={(event) => setImportText(event.target.value)} className="field mt-3 h-44 font-mono text-xs" placeholder={t("settings.backupPlaceholder")} /></Panel>
              <Panel title={t("settings.shortcuts")}><div className="grid gap-2 text-sm text-qs-textMuted"><InfoLine label={t("shortcut.openPopup")} value="Ctrl + Alt + Q" /><InfoLine label={t("shortcut.paste")} value={t("shortcut.pasteValue")} /><InfoLine label={t("shortcut.copy")} value={t("shortcut.copyValue")} /><InfoLine label={t("shortcut.expansion")} value={t("shortcut.expansionValue")} /><InfoLine label={t("shortcut.hotkey")} value={t("shortcut.hotkeyValue")} /></div></Panel>
            </div>
          )}
        </section>
      </main>

      {editingGroup && <Dialog title={editingGroup.id ? t("dialog.editGroup") : t("dialog.newGroup")} onClose={() => setEditingGroup(null)} onSave={saveGroup} saveLabel={t("action.save")} cancelLabel={t("action.cancel")}><label className="label">{t("field.name")}</label><input className="field" value={editingGroup.name || ""} onChange={(event) => setEditingGroup({ ...editingGroup, name: event.target.value })} autoFocus /><label className="label mt-3">{t("field.icon")}</label><div className="grid grid-cols-6 gap-2">{GROUP_ICONS.map((icon) => <button key={icon} onClick={() => setEditingGroup({ ...editingGroup, icon })} className={`rounded-lg bg-qs-bg p-2 text-sm ${editingGroup.icon === icon ? "ring-2 ring-qs-accent" : ""}`}>{icon}</button>)}</div></Dialog>}

      {editingPhrase && <Dialog title={editingPhrase.id ? t("dialog.editPhrase") : t("dialog.newPhrase")} onClose={() => setEditingPhrase(null)} onSave={savePhrase} onPaste={handlePhrasePaste} saveLabel={t("action.save")} cancelLabel={t("action.cancel")}><div className="grid grid-cols-2 gap-3"><div><label className="label">{t("field.group")}</label><select className="field" value={editingPhrase.group_id} onChange={(event) => setEditingPhrase({ ...editingPhrase, group_id: event.target.value })}>{groups.map((group) => <option key={group.id} value={group.id}>{group.icon} {group.name}</option>)}</select></div><div><label className="label">{t("field.type")}</label><select className="field" value={editingPhrase.content_type} onChange={(event) => setEditingPhrase({ ...editingPhrase, content_type: event.target.value as "text" | "image" })}><option value="text">{t("field.text")}</option><option value="image">{t("field.image")}</option></select></div></div><label className="label mt-3">{t("field.title")}</label><input className="field" value={editingPhrase.title} onChange={(event) => setEditingPhrase({ ...editingPhrase, title: event.target.value })} />{editingPhrase.content_type === "text" ? <><label className="label mt-3">{t("field.content")}</label><textarea className="field h-36" value={editingPhrase.content || ""} onChange={(event) => setEditingPhrase({ ...editingPhrase, content: event.target.value })} /></> : <><label className="label mt-3">{t("field.image")}</label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-qs-border bg-qs-bg p-4 text-sm text-qs-textMuted hover:border-qs-accent hover:text-qs-text"><FileImage className="h-4 w-4" /> {t("field.chooseImage")}<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleImageFile(file); }} /></label>{editingPhrase.image_data && <p className="mt-2 text-xs text-qs-success">{t("field.imageLoaded")}</p>}</>}<div className="mt-3 grid grid-cols-2 gap-3"><div><label className="label">{t("field.hotkey")}</label><input className="field" placeholder={t("field.hotkeyPlaceholder")} value={editingPhrase.hotkey || ""} onKeyDown={captureHotkey} onChange={() => {}} readOnly /><p className="mt-1 text-xs text-qs-textMuted">{t("field.hotkeyClear")}</p></div><div><label className="label">{t("field.abbreviation")}</label><input className="field" placeholder=";reply" value={editingPhrase.abbreviation || ""} onChange={(event) => setEditingPhrase({ ...editingPhrase, abbreviation: event.target.value || null })} /><p className="mt-1 text-xs text-qs-textMuted">{t("field.abbreviationHint")}</p></div></div><label className="label mt-3">{t("field.tags")}</label><input className="field" placeholder={t("field.tagsPlaceholder")} value={editingPhrase.tags || ""} onChange={(event) => setEditingPhrase({ ...editingPhrase, tags: event.target.value || null })} /><p className="mt-1 text-xs text-qs-textMuted">{t("field.tagsHint")}</p></Dialog>}

      {editingExpansion && <Dialog title={editingExpansion.id ? t("dialog.editExpansion") : t("dialog.newExpansion")} onClose={() => setEditingExpansion(null)} onSave={saveExpansion} saveLabel={t("action.save")} cancelLabel={t("action.cancel")}><label className="label">{t("field.abbreviation")}</label><input className="field" placeholder=";addr" value={editingExpansion.abbreviation || ""} onChange={(event) => setEditingExpansion({ ...editingExpansion, abbreviation: event.target.value })} /><label className="label mt-3">{t("field.expandedText")}</label><textarea className="field h-32" value={editingExpansion.expanded_text || ""} onChange={(event) => setEditingExpansion({ ...editingExpansion, expanded_text: event.target.value })} /></Dialog>}

      {editingRule && <Dialog title={editingRule.id ? t("dialog.editRule") : t("dialog.newRule")} onClose={() => setEditingRule(null)} onSave={saveRule} saveLabel={t("action.save")} cancelLabel={t("action.cancel")}><label className="label">{t("field.processName")}</label><div className="flex gap-2"><input className="field" placeholder="code.exe" value={editingRule.process_name || ""} onChange={(event) => setEditingRule({ ...editingRule, process_name: event.target.value })} /><button className="toolbar-button shrink-0" onClick={captureProcess}>{t("action.current")}</button></div><label className="label mt-3">{t("field.defaultGroup")}</label><select className="field" value={editingRule.group_id || ""} onChange={(event) => setEditingRule({ ...editingRule, group_id: event.target.value })}><option value="">{t("field.selectGroup")}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.icon} {group.name}</option>)}</select></Dialog>}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-qs-textMuted" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="field pl-9" /></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-qs-border bg-qs-surface p-8 text-center text-sm text-qs-textMuted">{text}</div>;
}

function findDuplicatePhraseIds(phrases: Phrase[]) {
  const groups = new Map<string, Phrase[]>();
  for (const phrase of phrases) {
    const key = normalizePhraseContent(phrase);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), phrase]);
  }
  const ids = new Set<string>();
  for (const items of groups.values()) {
    if (items.length > 1) items.forEach((item) => ids.add(item.id));
  }
  return ids;
}

function normalizePhraseContent(phrase: Phrase) {
  return `${phrase.content_type}:${phrase.content.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

function phraseTags(phrase: Phrase) {
  return splitTags(phrase.tags || "");
}

function normalizeTags(value: string) {
  const tags = splitTags(value);
  return tags.length > 0 ? tags.join(", ") : null;
}

function splitTags(value: string) {
  return Array.from(new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)));
}

function compareDateDesc(a: string | null, b: string | null) {
  return (b ? Date.parse(b) : 0) - (a ? Date.parse(a) : 0);
}

function toTitle(text: string, fallback: string) {
  return text.trim().split(/\r?\n/)[0].slice(0, 32) || fallback;
}

function rgbaToPngDataUrl(rgba: Uint8Array, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-qs-border bg-qs-surface p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</div>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span>{label}</span><kbd className="kbd">{value}</kbd></div>;
}

function Dialog({ title, children, onClose, onSave, onPaste, saveLabel, cancelLabel }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  onPaste?: (event: React.ClipboardEvent) => void;
  saveLabel: string;
  cancelLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="max-h-[86vh] w-[560px] overflow-y-auto rounded-xl border border-qs-border bg-qs-surface p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()} onPaste={onPaste}>
        <h3 className="mb-4 text-lg font-semibold">{title}</h3>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button className="toolbar-button" onClick={onClose}>{cancelLabel}</button>
          <button className="primary-button" onClick={onSave}><Save className="h-4 w-4" /> {saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

function hotkeyKeyLabel(event: React.KeyboardEvent<HTMLInputElement>) {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return "";
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^Numpad[0-9]$/.test(event.code)) return event.code.slice(6);
  if (/^F([1-9]|1[0-2])$/.test(event.key)) return event.key;
  const map: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Escape: "Escape",
    Tab: "Tab",
    Minus: "-",
    Equal: "=",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Backquote: "`",
    NumpadAdd: "+",
    NumpadSubtract: "-",
    NumpadMultiply: "*",
    NumpadDivide: "/",
    NumpadDecimal: ".",
  };
  return map[event.code] || "";
}
