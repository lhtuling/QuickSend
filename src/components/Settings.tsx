import { useCallback, useEffect, useMemo, useState } from "react";
import { readImage, readText } from "@tauri-apps/plugin-clipboard-manager";
import {
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
  getGroups,
  getPhrases,
  getPhrasesByGroup,
  getProcessRules,
  getSettings,
  getTextExpansions,
  getAutostartEnabled,
  importData,
  setProcessRule,
  setAutostartEnabled,
  updateGroup,
  updatePhrase,
  updateSetting,
  updateTextExpansion,
} from "../hooks/useTauri";
import { pinyinMatch } from "../utils/pinyin";
import type { Group, Phrase, ProcessRule, Setting, TextExpansion } from "../types";

type Tab = "phrases" | "expansions" | "process" | "settings";
type PhraseDraft = Partial<Phrase> & { group_id: string; title: string; content_type: "text" | "image" };
type ClipboardPhraseDraft = Pick<PhraseDraft, "content_type" | "content" | "image_data" | "title">;

const GROUP_ICONS = ["📌", "📧", "💻", "🔗", "📝", "💬", "⭐", "🧰", "📁", "🏠", "🌐", "📱"];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("phrases");
  const [groups, setGroups] = useState<Group[]>([]);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [autostartEnabled, setAutostartEnabledState] = useState(false);
  const [autostartStatus, setAutostartStatus] = useState("");
  const [expansions, setExpansions] = useState<TextExpansion[]>([]);
  const [processRules, setProcessRules] = useState<ProcessRule[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingGroup, setEditingGroup] = useState<Partial<Group> | null>(null);
  const [editingPhrase, setEditingPhrase] = useState<PhraseDraft | null>(null);
  const [editingExpansion, setEditingExpansion] = useState<Partial<TextExpansion> | null>(null);
  const [editingRule, setEditingRule] = useState<Partial<ProcessRule> | null>(null);
  const [importText, setImportText] = useState("");

  const settingsMap = useMemo(() => new Map(settings.map((item) => [item.key, item.value])), [settings]);

  const loadGroups = useCallback(async () => {
    const loaded = await getGroups();
    setGroups(loaded);
    setSelectedGroup((current) => current ?? loaded[0]?.id ?? null);
  }, []);

  const loadPhrases = useCallback(async () => {
    setPhrases(selectedGroup ? await getPhrasesByGroup(selectedGroup) : await getPhrases());
  }, [selectedGroup]);

  const loadSettings = useCallback(async () => {
    setSettings(await getSettings());
  }, []);

  const loadAutostart = useCallback(async () => {
    try {
      setAutostartEnabledState(await getAutostartEnabled());
      setAutostartStatus("");
    } catch (error) {
      setAutostartStatus(String(error));
    }
  }, []);

  const loadExpansions = useCallback(async () => {
    setExpansions(await getTextExpansions());
  }, []);

  const loadRules = useCallback(async () => {
    setProcessRules(await getProcessRules());
  }, []);

  useEffect(() => {
    loadGroups();
    loadSettings();
    loadAutostart();
  }, [loadAutostart, loadGroups, loadSettings]);

  useEffect(() => {
    loadPhrases();
  }, [loadPhrases]);

  useEffect(() => {
    if (tab === "expansions") loadExpansions();
    if (tab === "process") loadRules();
  }, [loadExpansions, loadRules, tab]);

  const filteredPhrases = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return phrases;
    return phrases.filter(
      (phrase) =>
        pinyinMatch(phrase.title, query) ||
        pinyinMatch(phrase.content, query) ||
        (phrase.abbreviation ? pinyinMatch(phrase.abbreviation, query) : false)
    );
  }, [phrases, searchQuery]);

  async function saveGroup() {
    if (!editingGroup?.name?.trim()) return;
    if (editingGroup.id) {
      await updateGroup(editingGroup.id, editingGroup.name.trim(), editingGroup.icon || "📁");
    } else {
      const group = await createGroup(editingGroup.name.trim(), editingGroup.icon || "📁");
      setSelectedGroup(group.id);
    }
    setEditingGroup(null);
    await loadGroups();
  }

  async function removeGroup(groupId: string) {
    if (!confirm("删除分组会同时删除其中的短语，确定继续？")) return;
    await deleteGroup(groupId);
    setSelectedGroup(null);
    await loadGroups();
    await loadPhrases();
  }

  async function savePhrase() {
    if (!editingPhrase?.title.trim() || !editingPhrase.group_id) return;
    if (editingPhrase.id) {
      await updatePhrase(
        editingPhrase.id,
        editingPhrase.group_id,
        editingPhrase.title.trim(),
        editingPhrase.content || "",
        editingPhrase.content_type,
        editingPhrase.image_data || null,
        editingPhrase.hotkey || null,
        editingPhrase.abbreviation || null
      );
    } else {
      await createPhrase(
        editingPhrase.group_id,
        editingPhrase.title.trim(),
        editingPhrase.content || "",
        editingPhrase.content_type,
        editingPhrase.image_data || null,
        editingPhrase.hotkey || null,
        editingPhrase.abbreviation || null
      );
    }
    setEditingPhrase(null);
    await loadPhrases();
  }

  async function saveExpansion() {
    if (!editingExpansion?.abbreviation?.trim() || !editingExpansion.expanded_text?.trim()) return;
    if (editingExpansion.id) {
      await updateTextExpansion(
        editingExpansion.id,
        editingExpansion.abbreviation.trim(),
        editingExpansion.expanded_text,
        editingExpansion.enabled ?? true
      );
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

  async function saveDefaultGroup(groupId: string) {
    await updateSetting("default_group_id", groupId);
    await loadSettings();
  }

  async function toggleAutostart() {
    const next = !autostartEnabled;
    setAutostartStatus(next ? "正在写入开机自启..." : "正在关闭开机自启...");
    try {
      const actual = await setAutostartEnabled(next);
      setAutostartEnabledState(actual);
      setAutostartStatus(actual ? "已写入系统自启项。下次开机会后台启动。" : "已关闭开机自启。");
    } catch (error) {
      setAutostartStatus(`设置失败：${String(error)}`);
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
    setEditingPhrase((current) =>
      current
        ? {
            ...current,
            content_type: "image",
            image_data: dataUrl.split(",")[1] || dataUrl,
            content: file.name,
          }
        : current
    );
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
    if (!confirm("导入会覆盖现有数据，确定继续？")) return;
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
    };
  }

  async function newPhraseFromClipboard() {
    const draft = newPhraseDraft();
    const clipboardDraft = await readClipboardPhraseDraft();
    setEditingPhrase({ ...draft, ...clipboardDraft });
  }

  async function readClipboardPhraseDraft(): Promise<Partial<ClipboardPhraseDraft>> {
    const imageDraft = await readClipboardImageDraft();
    if (imageDraft) return imageDraft;

    try {
      const text = await readText();
      if (text.trim()) {
        return {
          content_type: "text",
          title: text.trim().split(/\r?\n/)[0].slice(0, 32) || "剪贴板文本",
          content: text,
          image_data: null,
        };
      }
    } catch {
      // Clipboard may not contain text. Keep an empty draft.
    }

    return {};
  }

  async function readClipboardImageDraft(): Promise<Partial<ClipboardPhraseDraft> | null> {
    try {
      const image = await readImage();
      const [rgba, size] = await Promise.all([image.rgba(), image.size()]);
      const dataUrl = rgbaToPngDataUrl(rgba, size.width, size.height);
      return {
        content_type: "image",
        title: "剪贴板图片",
        content: "剪贴板图片",
        image_data: dataUrl.split(",")[1] || dataUrl,
      };
    } catch {
      return null;
    }
  }

  function applyPastedText(text: string) {
    if (!text.trim()) return;
    setEditingPhrase((current) =>
      current
        ? {
            ...current,
            content_type: "text",
            title: current.title || text.trim().split(/\r?\n/)[0].slice(0, 32) || "粘贴文本",
            content: text,
            image_data: null,
          }
        : current
    );
  }

  async function handlePhrasePaste(event: React.ClipboardEvent) {
    if (!editingPhrase) return;

    const imageFile = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();

    if (imageFile) {
      event.preventDefault();
      await handleImageFile(imageFile);
      return;
    }

    const text = event.clipboardData.getData("text/plain");
    if (text && editingPhrase.content_type === "image") {
      event.preventDefault();
      applyPastedText(text);
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
    parts.push(key);
    setEditingPhrase((current) => (current ? { ...current, hotkey: parts.join("+") } : current));
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

  function phraseImageSrc(phrase: Phrase) {
    if (!phrase.image_data) return "";
    return phrase.image_data.startsWith("data:")
      ? phrase.image_data
      : `data:image/png;base64,${phrase.image_data}`;
  }

  return (
    <div className="flex h-screen bg-qs-bg text-qs-text">
      <aside className="flex w-60 shrink-0 flex-col border-r border-qs-border bg-qs-surface">
        <div className="border-b border-qs-border p-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="h-5 w-5 text-qs-accent" />
            QuickSend
          </h1>
          <p className="mt-1 text-xs text-qs-textMuted">快速短语、热键和文本扩展</p>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {[
            { id: "phrases" as Tab, label: "短语管理", icon: ClipboardList },
            { id: "expansions" as Tab, label: "文本扩展", icon: Type },
            { id: "process" as Tab, label: "进程规则", icon: Monitor },
            { id: "settings" as Tab, label: "设置与备份", icon: SettingsIcon },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                tab === item.id
                  ? "bg-qs-accent text-white"
                  : "text-qs-textMuted hover:bg-qs-surface2 hover:text-qs-text"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-qs-border p-4">
          <div>
            <h2 className="text-lg font-semibold">
              {tab === "phrases" && "短语管理"}
              {tab === "expansions" && "文本扩展"}
              {tab === "process" && "进程默认分组"}
              {tab === "settings" && "设置与备份"}
            </h2>
            <p className="mt-0.5 text-xs text-qs-textMuted">
              Ctrl+Alt+Q 呼出弹窗；单击粘贴，右键复制；缩写后按空格展开。
            </p>
          </div>
          <div className="flex gap-2">
            {tab === "phrases" && (
              <>
                <button className="toolbar-button" onClick={() => setEditingGroup({ icon: "📁" })}>
                  <FolderPlus className="h-4 w-4" /> 新建分组
                </button>
                <button className="primary-button" onClick={newPhraseFromClipboard}>
                  <Plus className="h-4 w-4" /> 新建短语
                </button>
              </>
            )}
            {tab === "expansions" && (
              <button className="primary-button" onClick={() => setEditingExpansion({ enabled: true })}>
                <Plus className="h-4 w-4" /> 新建扩展
              </button>
            )}
            {tab === "process" && (
              <button className="primary-button" onClick={() => setEditingRule({ group_id: groups[0]?.id })}>
                <Plus className="h-4 w-4" /> 新建规则
              </button>
            )}
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-auto p-4">
          {tab === "phrases" && (
            <div className="flex h-full gap-4">
              <div className="w-56 shrink-0 space-y-1">
                <button
                  onClick={() => setSelectedGroup(null)}
                  className={`group-row ${selectedGroup === null ? "group-row-active" : ""}`}
                >
                  <span>📚 全部短语</span>
                </button>
                {groups.map((group) => (
                  <div key={group.id} className={`group-row ${selectedGroup === group.id ? "group-row-active" : ""}`}>
                    <button className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedGroup(group.id)}>
                      {group.icon} {group.name}
                    </button>
                    <button className="icon-button" onClick={() => setEditingGroup(group)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="icon-button danger" onClick={() => removeGroup(group.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="min-w-0 flex-1">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-qs-textMuted" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索标题、内容、缩写或中文首字母"
                    className="field pl-9"
                  />
                </div>
                <div className="space-y-2">
                  {filteredPhrases.map((phrase) => (
                    <div key={phrase.id} className="item-row">
                      {phrase.content_type === "image" && phrase.image_data ? (
                        <img
                          src={phraseImageSrc(phrase)}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-md border border-qs-border object-cover"
                        />
                      ) : phrase.content_type === "image" ? (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-qs-border bg-qs-bg text-qs-textMuted">
                          <FileImage className="h-5 w-5" />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{phrase.title}</span>
                          {phrase.content_type === "image" && <span className="badge">图片</span>}
                          {phrase.hotkey && <kbd className="kbd">{phrase.hotkey}</kbd>}
                          {phrase.abbreviation && <kbd className="kbd accent">{phrase.abbreviation}</kbd>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-qs-textMuted">
                          {phrase.content_type === "image" ? phrase.content || "图片内容" : phrase.content}
                        </p>
                      </div>
                      <button className="icon-button" onClick={() => setEditingPhrase({ ...phrase })}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={async () => {
                          if (!confirm("确定删除这条短语？")) return;
                          await deletePhrase(phrase.id);
                          await loadPhrases();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {filteredPhrases.length === 0 && <EmptyState text="暂无短语" />}
                </div>
              </div>
            </div>
          )}

          {tab === "expansions" && (
            <div className="space-y-2">
              {expansions.map((item) => (
                <div key={item.id} className="item-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <kbd className="kbd accent">{item.abbreviation}</kbd>
                      <span className="text-xs text-qs-textMuted">按空格展开</span>
                      <span className={`badge ${item.enabled ? "" : "muted"}`}>
                        {item.enabled ? "启用" : "停用"}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-qs-text">{item.expanded_text}</p>
                  </div>
                  <button
                    className="toolbar-button"
                    onClick={async () => {
                      await updateTextExpansion(item.id, item.abbreviation, item.expanded_text, !item.enabled);
                      await loadExpansions();
                    }}
                  >
                    {item.enabled ? "停用" : "启用"}
                  </button>
                  <button className="icon-button" onClick={() => setEditingExpansion(item)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={async () => {
                      if (!confirm("确定删除这条文本扩展？")) return;
                      await deleteTextExpansion(item.id);
                      await loadExpansions();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {expansions.length === 0 && <EmptyState text="暂无文本扩展规则" />}
            </div>
          )}

          {tab === "process" && (
            <div className="space-y-2">
              {processRules.map((rule) => {
                const group = groups.find((item) => item.id === rule.group_id);
                return (
                  <div key={rule.id} className="item-row">
                    <Monitor className="h-4 w-4 text-qs-textMuted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{rule.process_name}</p>
                      <p className="text-xs text-qs-textMuted">默认显示：{group ? `${group.icon} ${group.name}` : "未知分组"}</p>
                    </div>
                    <button className="icon-button" onClick={() => setEditingRule(rule)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="icon-button danger"
                      onClick={async () => {
                        await deleteProcessRule(rule.id);
                        await loadRules();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              {processRules.length === 0 && <EmptyState text="暂无进程规则" />}
            </div>
          )}

          {tab === "settings" && (
            <div className="max-w-2xl space-y-4">
              <Panel title="全局默认分组">
                <select
                  value={settingsMap.get("default_group_id") || groups[0]?.id || ""}
                  onChange={(event) => saveDefaultGroup(event.target.value)}
                  className="field"
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.icon} {group.name}
                    </option>
                  ))}
                </select>
              </Panel>
              <Panel title="开机自启">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-qs-text">强力开机自启</p>
                    <p className="mt-1 text-xs text-qs-textMuted">
                      Windows 会同时写注册表和启动文件夹；macOS/Linux 使用系统标准自启目录。自启时后台启动，不弹设置窗口。
                    </p>
                    {autostartStatus && <p className="mt-2 text-xs text-qs-warning">{autostartStatus}</p>}
                  </div>
                  <button className={autostartEnabled ? "primary-button" : "toolbar-button"} onClick={toggleAutostart}>
                    {autostartEnabled ? "已开启" : "开启自启"}
                  </button>
                </div>
              </Panel>
              <Panel title="数据备份">
                <div className="flex gap-2">
                  <button className="primary-button" onClick={handleExport}>
                    <Download className="h-4 w-4" /> 导出 JSON
                  </button>
                  <button className="toolbar-button" onClick={handleImport}>
                    <Upload className="h-4 w-4" /> 导入下方 JSON
                  </button>
                </div>
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  className="field mt-3 h-44 font-mono text-xs"
                  placeholder="粘贴备份 JSON 后点击导入"
                />
              </Panel>
              <Panel title="当前快捷操作">
                <div className="grid gap-2 text-sm text-qs-textMuted">
                  <InfoLine label="呼出窗口" value="Ctrl + Alt + Q" />
                  <InfoLine label="粘贴选中短语" value="Enter 或单击" />
                  <InfoLine label="复制短语" value="右键短语" />
                  <InfoLine label="文本扩展" value="输入缩写后按空格" />
                  <InfoLine label="独立短语热键" value="在短语里填写，如 Ctrl+Shift+1" />
                </div>
              </Panel>
            </div>
          )}
        </section>
      </main>

      {editingGroup && (
        <Dialog title={editingGroup.id ? "编辑分组" : "新建分组"} onClose={() => setEditingGroup(null)} onSave={saveGroup}>
          <label className="label">名称</label>
          <input
            className="field"
            value={editingGroup.name || ""}
            onChange={(event) => setEditingGroup({ ...editingGroup, name: event.target.value })}
            autoFocus
          />
          <label className="label mt-3">图标</label>
          <div className="grid grid-cols-6 gap-2">
            {GROUP_ICONS.map((icon) => (
              <button
                key={icon}
                onClick={() => setEditingGroup({ ...editingGroup, icon })}
                className={`rounded-lg bg-qs-bg p-2 text-lg ${editingGroup.icon === icon ? "ring-2 ring-qs-accent" : ""}`}
              >
                {icon}
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {editingPhrase && (
        <Dialog
          title={editingPhrase.id ? "编辑短语" : "新建短语"}
          onClose={() => setEditingPhrase(null)}
          onSave={savePhrase}
          onPaste={handlePhrasePaste}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">分组</label>
              <select
                className="field"
                value={editingPhrase.group_id}
                onChange={(event) => setEditingPhrase({ ...editingPhrase, group_id: event.target.value })}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.icon} {group.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">类型</label>
              <select
                className="field"
                value={editingPhrase.content_type}
                onChange={(event) =>
                  setEditingPhrase({ ...editingPhrase, content_type: event.target.value as "text" | "image" })
                }
              >
                <option value="text">文本</option>
                <option value="image">图片</option>
              </select>
            </div>
          </div>
          <label className="label mt-3">标题</label>
          <input
            className="field"
            value={editingPhrase.title}
            onChange={(event) => setEditingPhrase({ ...editingPhrase, title: event.target.value })}
          />
          {editingPhrase.content_type === "text" ? (
            <>
              <label className="label mt-3">内容（支持多行）</label>
              <textarea
                className="field h-36"
                value={editingPhrase.content || ""}
                onChange={(event) => setEditingPhrase({ ...editingPhrase, content: event.target.value })}
              />
            </>
          ) : (
            <>
              <label className="label mt-3">图片</label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-qs-border bg-qs-bg p-4 text-sm text-qs-textMuted hover:border-qs-accent hover:text-qs-text">
                <FileImage className="h-4 w-4" />
                选择图片文件，或直接 Ctrl+V 粘贴图片
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                />
              </label>
              {editingPhrase.image_data && <p className="mt-2 text-xs text-qs-success">图片已载入</p>}
            </>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">独立热键</label>
              <input
                className="field"
                placeholder="按下组合键，如 Ctrl+Shift+1"
                value={editingPhrase.hotkey || ""}
                onKeyDown={captureHotkey}
                onChange={() => {}}
                readOnly
              />
              <p className="mt-1 text-xs text-qs-textMuted">按 Backspace 或 Delete 清空。</p>
            </div>
            <div>
              <label className="label">缩写</label>
              <input
                className="field"
                placeholder=";em"
                value={editingPhrase.abbreviation || ""}
                onChange={(event) => setEditingPhrase({ ...editingPhrase, abbreviation: event.target.value || null })}
              />
            </div>
          </div>
        </Dialog>
      )}

      {editingExpansion && (
        <Dialog
          title={editingExpansion.id ? "编辑文本扩展" : "新建文本扩展"}
          onClose={() => setEditingExpansion(null)}
          onSave={saveExpansion}
        >
          <label className="label">缩写</label>
          <input
            className="field"
            placeholder=";em"
            value={editingExpansion.abbreviation || ""}
            onChange={(event) => setEditingExpansion({ ...editingExpansion, abbreviation: event.target.value })}
          />
          <label className="label mt-3">展开文本</label>
          <textarea
            className="field h-32"
            value={editingExpansion.expanded_text || ""}
            onChange={(event) => setEditingExpansion({ ...editingExpansion, expanded_text: event.target.value })}
          />
        </Dialog>
      )}

      {editingRule && (
        <Dialog title={editingRule.id ? "编辑进程规则" : "新建进程规则"} onClose={() => setEditingRule(null)} onSave={saveRule}>
          <label className="label">进程名</label>
          <div className="flex gap-2">
            <input
              className="field"
              placeholder="code.exe"
              value={editingRule.process_name || ""}
              onChange={(event) => setEditingRule({ ...editingRule, process_name: event.target.value })}
            />
            <button className="toolbar-button shrink-0" onClick={captureProcess}>
              获取当前
            </button>
          </div>
          <label className="label mt-3">默认分组</label>
          <select
            className="field"
            value={editingRule.group_id || ""}
            onChange={(event) => setEditingRule({ ...editingRule, group_id: event.target.value })}
          >
            <option value="">选择分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.icon} {group.name}
              </option>
            ))}
          </select>
        </Dialog>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-qs-border bg-qs-surface p-8 text-center text-sm text-qs-textMuted">{text}</div>;
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
  return (
    <div className="rounded-lg border border-qs-border bg-qs-surface p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <kbd className="kbd">{value}</kbd>
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
  onSave,
  onPaste,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  onPaste?: (event: React.ClipboardEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        className="max-h-[86vh] w-[560px] overflow-y-auto rounded-xl border border-qs-border bg-qs-surface p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onPaste={onPaste}
      >
        <h3 className="mb-4 text-lg font-semibold">{title}</h3>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button className="toolbar-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" onClick={onSave}>
            <Save className="h-4 w-4" /> 保存
          </button>
        </div>
      </div>
    </div>
  );
}
