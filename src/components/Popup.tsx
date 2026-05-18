import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Image, Keyboard, Search } from "lucide-react";
import {
  copyPhraseToClipboard,
  getActiveProcessName,
  getGroups,
  getPhrases,
  getPhrasesByGroup,
  getProcessRules,
  getSettings,
  hidePopup,
  pastePhrase,
} from "../hooks/useTauri";
import { matchScore, pinyinMatch } from "../utils/pinyin";
import type { Group, Phrase } from "../types";

export default function Popup() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadInitialData() {
      const [loadedGroups, settings, rules] = await Promise.all([
        getGroups(),
        getSettings(),
        getProcessRules(),
      ]);

      setGroups(loadedGroups);
      if (loadedGroups.length === 0) return;

      const settingsMap = new Map(settings.map((item) => [item.key, item.value]));
      let groupId = settingsMap.get("default_group_id") || loadedGroups[0].id;

      try {
        const processName = await getActiveProcessName();
        const matchedRule = rules.find(
          (rule) => rule.process_name.toLowerCase() === processName.toLowerCase()
        );
        if (matchedRule) groupId = matchedRule.group_id;
      } catch {
        // Process detection is best-effort; fall back to the configured default.
      }

      if (!loadedGroups.some((group) => group.id === groupId)) {
        groupId = loadedGroups[0].id;
      }

      setActiveGroup(groupId);
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    async function loadPhrases() {
      if (!activeGroup) return;
      setPhrases(await getPhrasesByGroup(activeGroup));
      setSelectedIndex(0);
    }

    loadPhrases();
  }, [activeGroup]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const hideOnBlur = () => {
      setTimeout(() => hidePopup(), 80);
    };

    window.addEventListener("blur", hideOnBlur);
    return () => window.removeEventListener("blur", hideOnBlur);
  }, []);

  const filteredPhrases = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return phrases;

    return phrases
      .map((phrase) => {
        const score = Math.max(
          matchScore(phrase.title, query),
          matchScore(phrase.content, query) * 0.75,
          phrase.abbreviation ? matchScore(phrase.abbreviation, query) : 0
        );
        const matched =
          score > 0 ||
          pinyinMatch(phrase.title, query) ||
          pinyinMatch(phrase.content, query) ||
          (phrase.abbreviation ? pinyinMatch(phrase.abbreviation, query) : false);
        return { phrase, score, matched };
      })
      .filter((item) => item.matched)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.phrase);
  }, [phrases, searchQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, activeGroup]);

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handlePaste = useCallback(async (id: string) => {
    try {
      await pastePhrase(id);
    } catch (error) {
      console.error("Paste failed:", error);
    }
  }, []);

  const handleCopy = useCallback(async (id: string) => {
    try {
      await copyPhraseToClipboard(id);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, filteredPhrases.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter" && filteredPhrases[selectedIndex]) {
        event.preventDefault();
        handlePaste(filteredPhrases[selectedIndex].id);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        hidePopup();
      }
      if (event.key === "Tab" && groups.length > 0) {
        event.preventDefault();
        const currentIndex = groups.findIndex((group) => group.id === activeGroup);
        const nextIndex = event.shiftKey
          ? (currentIndex - 1 + groups.length) % groups.length
          : (currentIndex + 1) % groups.length;
        setActiveGroup(groups[nextIndex].id);
      }
    },
    [activeGroup, filteredPhrases, groups, handlePaste, selectedIndex]
  );

  function preview(phrase: Phrase) {
    if (phrase.content_type === "image") return "图片短语";
    const text = phrase.content.replace(/\s+/g, " ").trim();
    return text.length > 72 ? `${text.slice(0, 72)}...` : text;
  }

  function imageSrc(phrase: Phrase) {
    if (!phrase.image_data) return "";
    return phrase.image_data.startsWith("data:")
      ? phrase.image_data
      : `data:image/png;base64,${phrase.image_data}`;
  }

  return (
    <div
      className="h-full w-full overflow-hidden rounded-xl border border-qs-border bg-qs-bg shadow-2xl"
      onKeyDown={handleKeyDown}
    >
      <div className="border-b border-qs-border p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-qs-textMuted" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索短语、拼音首字母、缩写"
            className="w-full rounded-lg border border-qs-border bg-qs-surface py-2 pl-9 pr-3 text-sm text-qs-text outline-none placeholder:text-qs-textMuted focus:border-qs-accent"
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-qs-border px-2 py-1.5 no-scrollbar">
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => setActiveGroup(group.id)}
            className={`flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
              activeGroup === group.id
                ? "bg-qs-accent text-white"
                : "bg-qs-surface text-qs-textMuted hover:bg-qs-surface2 hover:text-qs-text"
            }`}
          >
            <span>{group.icon}</span>
            <span>{group.name}</span>
          </button>
        ))}
      </div>

      <div ref={listRef} className="h-[calc(100%-104px)] overflow-y-auto p-1.5">
        {filteredPhrases.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-qs-textMuted">
            没有找到匹配的短语
          </div>
        ) : (
          filteredPhrases.map((phrase, index) => (
            <button
              key={phrase.id}
              onClick={() => handlePaste(phrase.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                handleCopy(phrase.id);
              }}
              className={`mb-1 flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                selectedIndex === index
                  ? "border-qs-accent/60 bg-qs-accent/20"
                  : "border-transparent hover:bg-qs-surface"
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
                  {phrase.hotkey && (
                    <kbd className="shrink-0 rounded bg-qs-surface2 px-1.5 py-0.5 font-mono text-[10px] text-qs-textMuted">
                      {phrase.hotkey}
                    </kbd>
                  )}
                  {phrase.abbreviation && (
                    <kbd className="shrink-0 rounded bg-qs-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-qs-accent">
                      {phrase.abbreviation}
                    </kbd>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-qs-textMuted">{preview(phrase)}</p>
              </div>
              <Clipboard className="mt-1 h-3.5 w-3.5 shrink-0 text-qs-textMuted opacity-60" />
            </button>
          ))
        )}
      </div>

      <div className="flex h-8 items-center justify-between border-t border-qs-border px-3 text-[10px] text-qs-textMuted">
        <span className="flex items-center gap-1">
          <Keyboard className="h-3 w-3" /> Enter 粘贴 · 右键复制 · Tab 切组
        </span>
        <span>{filteredPhrases.length} 条</span>
      </div>
    </div>
  );
}
