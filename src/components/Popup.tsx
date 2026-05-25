import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { Clipboard, Image, Keyboard, Search, Star } from "lucide-react";
import {
  copyPhraseToClipboard,
  getActiveProcessName,
  getGroups,
  getPhrasesByGroup,
  getProcessRules,
  getSettings,
  hidePopup,
  pastePhrase,
  pasteTextContent,
} from "../hooks/useTauri";
import { useI18n } from "../i18n";
import {
  addClipboardItem,
  isSensitiveClipboardText,
  readClipboardHistory,
  saveClipboardHistory,
  type ClipboardHistoryItem,
} from "../utils/clipboardHistory";
import { matchScore, pinyinMatch } from "../utils/pinyin";
import type { Group, Phrase } from "../types";

type PopupItem =
  | { type: "phrase"; phrase: Phrase }
  | { type: "clipboard"; item: ClipboardHistoryItem };

const CLIPBOARD_CATEGORY_ID = "__clipboard__";

export default function Popup() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardHistoryItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [templatePhrase, setTemplatePhrase] = useState<Phrase | null>(null);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadInitialData() {
      const [loadedGroups, settings, rules] = await Promise.all([getGroups(), getSettings(), getProcessRules()]);

      setGroups(loadedGroups);
      if (loadedGroups.length === 0) {
        setActiveCategory(CLIPBOARD_CATEGORY_ID);
        return;
      }

      const settingsMap = new Map(settings.map((item) => [item.key, item.value]));
      let groupId = settingsMap.get("default_group_id") || loadedGroups[0].id;

      try {
        const processName = await getActiveProcessName();
        const matchedRule = rules.find((rule) => rule.process_name.toLowerCase() === processName.toLowerCase());
        if (matchedRule) groupId = matchedRule.group_id;
      } catch {
        // Process detection is best-effort; fall back to the configured default.
      }

      if (!loadedGroups.some((group) => group.id === groupId)) groupId = loadedGroups[0].id;
      setActiveCategory(groupId);
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    async function loadPhrases() {
      if (!activeCategory || activeCategory === CLIPBOARD_CATEGORY_ID) return;
      setPhrases(await getPhrasesByGroup(activeCategory));
      setSelectedIndex(0);
    }

    loadPhrases();
  }, [activeCategory]);

  const refreshClipboardHistory = useCallback(async () => {
    let history = readClipboardHistory();
    try {
      const text = (await readText()).trim();
      if (text && !isSensitiveClipboardText(text)) {
        history = addClipboardItem(history, text);
        saveClipboardHistory(history);
      }
    } catch {
      // Clipboard may hold non-text data.
    }
    setClipboardHistory(history);
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
    refreshClipboardHistory();
    const timer = window.setInterval(refreshClipboardHistory, 2500);
    const unlistenPromise = listen("popup-opened", () => {
      refreshClipboardHistory();
      searchRef.current?.focus();
    });
    return () => {
      window.clearInterval(timer);
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refreshClipboardHistory]);

  useEffect(() => {
    const hideOnBlur = () => {
      if (!templatePhrase) setTimeout(() => hidePopup(), 80);
    };
    window.addEventListener("blur", hideOnBlur);
    return () => window.removeEventListener("blur", hideOnBlur);
  }, [templatePhrase]);

  const filteredPhrases = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return phrases;

    return phrases
      .map((phrase) => {
        const score = Math.max(
          matchScore(phrase.title, query),
          matchScore(phrase.content, query) * 0.75,
          phrase.abbreviation ? matchScore(phrase.abbreviation, query) : 0,
          phrase.tags ? matchScore(phrase.tags, query) * 0.8 : 0
        );
        const matched =
          score > 0 ||
          pinyinMatch(phrase.title, query) ||
          pinyinMatch(phrase.content, query) ||
          (phrase.abbreviation ? pinyinMatch(phrase.abbreviation, query) : false) ||
          (phrase.tags ? pinyinMatch(phrase.tags, query) : false);
        const usageScore = Math.min(phrase.usage_count || 0, 20) * 0.03;
        const favoriteScore = phrase.favorite ? 0.75 : 0;
        return { phrase, score: score + usageScore + favoriteScore, matched };
      })
      .filter((item) => item.matched)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.phrase);
  }, [phrases, searchQuery]);

  const filteredClipboardHistory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return clipboardHistory.filter((item) => !query || item.text.toLowerCase().includes(query)).slice(0, 20);
  }, [clipboardHistory, searchQuery]);

  const popupItems = useMemo<PopupItem[]>(() => {
    if (activeCategory === CLIPBOARD_CATEGORY_ID) {
      return filteredClipboardHistory.map((item) => ({ type: "clipboard", item }));
    }
    return filteredPhrases.map((phrase) => ({ type: "phrase", phrase }));
  }, [activeCategory, filteredClipboardHistory, filteredPhrases]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, activeCategory]);

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handlePaste = useCallback(async (id: string) => {
    try {
      const phrase = phrases.find((item) => item.id === id);
      const variables = phrase ? extractTemplateVariables(phrase.content) : [];
      if (phrase?.content_type === "text" && variables.length > 0) {
        setTemplatePhrase(phrase);
        setTemplateValues(extractTemplateDefaults(phrase.content));
        return;
      }
      await pastePhrase(id);
    } catch (error) {
      console.error("Paste failed:", error);
    }
  }, [phrases]);

  const pasteClipboardHistoryItem = useCallback(async (item: ClipboardHistoryItem) => {
    try {
      await pasteTextContent(item.text);
    } catch (error) {
      console.error("Clipboard paste failed:", error);
    }
  }, []);

  const handleTemplatePaste = useCallback(async () => {
    if (!templatePhrase) return;
    try {
      await pasteTextContent(renderTemplate(templatePhrase.content, templateValues), templatePhrase.id);
      setTemplatePhrase(null);
      setTemplateValues({});
    } catch (error) {
      console.error("Template paste failed:", error);
    }
  }, [templatePhrase, templateValues]);

  const handleCopy = useCallback(async (id: string) => {
    try {
      await copyPhraseToClipboard(id);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (templatePhrase) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, popupItems.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && popupItems[selectedIndex]) {
      event.preventDefault();
      const item = popupItems[selectedIndex];
      if (item.type === "phrase") {
        handlePaste(item.phrase.id);
      } else {
        pasteClipboardHistoryItem(item.item);
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      hidePopup();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const categories = [...groups.map((group) => group.id), CLIPBOARD_CATEGORY_ID];
      const currentIndex = Math.max(0, categories.findIndex((id) => id === activeCategory));
      const nextIndex = event.shiftKey
        ? (currentIndex - 1 + categories.length) % categories.length
        : (currentIndex + 1) % categories.length;
      setActiveCategory(categories[nextIndex]);
    }
  }, [activeCategory, groups, handlePaste, pasteClipboardHistoryItem, popupItems, selectedIndex, templatePhrase]);

  function preview(phrase: Phrase) {
    if (phrase.content_type === "image") return t("popup.imagePhrase");
    const text = phrase.content.replace(/\s+/g, " ").trim();
    return text.length > 72 ? `${text.slice(0, 72)}...` : text;
  }

  function imageSrc(phrase: Phrase) {
    if (!phrase.image_data) return "";
    return phrase.image_data.startsWith("data:") ? phrase.image_data : `data:image/png;base64,${phrase.image_data}`;
  }

  function renderPhraseItem(phrase: Phrase, index: number) {
    return (
      <button
        key={`phrase-${phrase.id}`}
        onClick={() => handlePaste(phrase.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          handleCopy(phrase.id);
        }}
        className={`mb-1 flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
          selectedIndex === index ? "border-qs-accent/60 bg-qs-accent/20" : "border-transparent hover:bg-qs-surface"
        }`}
      >
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-qs-surface2 text-qs-accent">
          {phrase.content_type === "image" && phrase.image_data ? (
            <img src={imageSrc(phrase)} alt="" className="h-full w-full object-cover" />
          ) : phrase.content_type === "image" ? (
            <Image className="h-4 w-4" />
          ) : (
            <span className="font-mono text-[11px]">T</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-qs-text">{phrase.title}</span>
            {phrase.hotkey && <kbd className="shrink-0 rounded bg-qs-surface2 px-1.5 py-0.5 font-mono text-[10px] text-qs-textMuted">{phrase.hotkey}</kbd>}
            {phrase.abbreviation && <kbd className="shrink-0 rounded bg-qs-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-qs-accent">{phrase.abbreviation}</kbd>}
            {phraseTags(phrase).slice(0, 2).map((tag) => <span key={tag} className="shrink-0 rounded bg-qs-surface2 px-1.5 py-0.5 text-[10px] text-qs-textMuted">#{tag}</span>)}
            {(phrase.usage_count || 0) > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-qs-textMuted"><Star className="h-3 w-3" />{phrase.usage_count}</span>}
            {phrase.favorite && (phrase.usage_count || 0) === 0 && <Star className="h-3 w-3 shrink-0 fill-current text-qs-warning" />}
          </div>
          <p className="mt-0.5 truncate text-xs text-qs-textMuted">{preview(phrase)}</p>
        </div>
        <Clipboard className="mt-1 h-3.5 w-3.5 shrink-0 text-qs-textMuted opacity-60" />
      </button>
    );
  }

  function renderClipboardItem(item: ClipboardHistoryItem, index: number) {
    const lines = item.text.trim().split(/\r?\n/).filter(Boolean);
    const title = lines[0] || item.text.trim();
    const detail = lines.length > 1 ? lines.slice(1).join(" ") : "";

    return (
      <button
        key={`clipboard-${item.id}`}
        onClick={() => pasteClipboardHistoryItem(item)}
        className={`mb-1 flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
          selectedIndex === index ? "border-qs-accent/60 bg-qs-accent/20" : "border-transparent hover:bg-qs-surface"
        }`}
      >
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-qs-surface2 text-qs-textMuted">
          <Clipboard className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-medium leading-5 text-qs-text">{title}</span>
            <span className="mt-0.5 shrink-0 rounded bg-qs-surface2 px-1.5 py-0.5 text-[10px] text-qs-textMuted">
              {new Date(item.created_at).toLocaleTimeString()}
            </span>
          </div>
          {detail && <p className="mt-1 line-clamp-1 text-xs text-qs-textMuted">{detail}</p>}
        </div>
      </button>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-qs-border bg-qs-bg shadow-2xl" onKeyDown={handleKeyDown}>
      <div className="border-b border-qs-border p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-qs-textMuted" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("popup.search")}
            className="w-full rounded-lg border border-qs-border bg-qs-surface py-2 pl-9 pr-3 text-sm text-qs-text outline-none placeholder:text-qs-textMuted focus:border-qs-accent"
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-qs-border px-2 py-1.5 no-scrollbar">
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => setActiveCategory(group.id)}
            className={`flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
              activeCategory === group.id ? "bg-qs-accent text-white" : "bg-qs-surface text-qs-textMuted hover:bg-qs-surface2 hover:text-qs-text"
            }`}
          >
            <span>{group.icon}</span>
            <span>{group.name}</span>
          </button>
        ))}
        <button
          onClick={() => setActiveCategory(CLIPBOARD_CATEGORY_ID)}
          className={`flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
            activeCategory === CLIPBOARD_CATEGORY_ID ? "bg-qs-accent text-white" : "bg-qs-surface text-qs-textMuted hover:bg-qs-surface2 hover:text-qs-text"
          }`}
        >
          <Clipboard className="h-3.5 w-3.5" />
          <span>{t("popup.clipboardHistory")}</span>
        </button>
      </div>

      <div ref={listRef} className="h-[calc(100%-104px)] overflow-y-auto p-1.5">
        {popupItems.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-qs-textMuted">{t("popup.none")}</div>
        ) : (
          popupItems.map((item, index) => item.type === "phrase" ? renderPhraseItem(item.phrase, index) : renderClipboardItem(item.item, index))
        )}
      </div>

      <div className="flex h-8 items-center justify-between border-t border-qs-border px-3 text-[10px] text-qs-textMuted">
        <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> {t("popup.footer")}</span>
        <span>{t("popup.count", { count: popupItems.length })}</span>
      </div>

      {templatePhrase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="w-[360px] rounded-lg border border-qs-border bg-qs-surface p-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-qs-text">{templatePhrase.title}</h3>
            <div className="mt-3 space-y-2">
              {extractTemplateVariables(templatePhrase.content).map((name, index) => (
                <label key={`${name}-${index}`} className="block">
                  <span className="mb-1 block text-xs text-qs-textMuted">{name}</span>
                  <input
                    autoFocus={index === 0}
                    value={templateValues[name] || ""}
                    onChange={(event) => setTemplateValues((current) => ({ ...current, [name]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && event.ctrlKey) {
                        event.preventDefault();
                        handleTemplatePaste();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setTemplatePhrase(null);
                      }
                    }}
                    className="w-full rounded-md border border-qs-border bg-qs-bg px-3 py-2 text-sm text-qs-text outline-none focus:border-qs-accent"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-md bg-qs-surface2 px-3 py-2 text-sm text-qs-text hover:bg-qs-border" onClick={() => setTemplatePhrase(null)}>{t("action.cancel")}</button>
              <button className="rounded-md bg-qs-accent px-3 py-2 text-sm font-medium text-white hover:bg-qs-accentHover" onClick={handleTemplatePaste}>{t("popup.templatePaste")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function extractTemplateVariables(content: string) {
  const variables = new Map<string, string>();
  const pattern = /\{([^{}\r\n]{1,32})\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const { name, defaultValue } = parseTemplateVariable(match[1]);
    if (name && !variables.has(name)) variables.set(name, defaultValue);
  }
  return Array.from(variables.keys());
}

function renderTemplate(content: string, values: Record<string, string>) {
  return content.replace(/\{([^{}\r\n]{1,32})\}/g, (_, rawName: string) => {
    const { name, defaultValue } = parseTemplateVariable(rawName);
    return values[name] ?? defaultValue;
  });
}

function phraseTags(phrase: Phrase) {
  return (phrase.tags || "")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function extractTemplateDefaults(content: string) {
  const values: Record<string, string> = {};
  const pattern = /\{([^{}\r\n]{1,32})\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const { name, defaultValue } = parseTemplateVariable(match[1]);
    if (name && values[name] === undefined) values[name] = defaultValue;
  }
  return values;
}

function parseTemplateVariable(raw: string) {
  const [name, ...rest] = raw.split("=");
  return {
    name: name.trim(),
    defaultValue: rest.join("=").trim(),
  };
}
