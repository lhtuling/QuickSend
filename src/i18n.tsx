import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getI18nContext, getSettings, updateSetting } from "./hooks/useTauri";
import type { ExternalLanguagePack, I18nContext } from "./types";

type LanguageOption = { id: string; name: string; source: "system" | "built-in" | "custom" };
type Translations = Record<string, string>;

type I18nValue = {
  language: string;
  configuredLanguage: string;
  systemLocale: string;
  languageDir: string;
  languages: LanguageOption[];
  t: (key: string, values?: Record<string, string | number>) => string;
  setLanguage: (language: string) => Promise<void>;
};

const DEFAULT_LANGUAGE = "zh-CN";
const SYSTEM_LANGUAGE = "system";
const LANGUAGE_SETTING_KEY = "language";

const ZH_CN: Translations = {
  "app.subtitle": "常用短语、快捷键和缩写输入管理器",
  "nav.phrases": "短语",
  "nav.expansions": "快捷输入",
  "nav.clipboard": "剪贴板",
  "nav.apps": "应用规则",
  "nav.settings": "设置",
  "header.help": "Ctrl+Alt+Q 打开弹窗。Enter 粘贴，右键复制，Space 触发缩写。",
  "action.group": "分组",
  "action.phrase": "短语",
  "action.expansion": "快捷输入",
  "action.capture": "捕获",
  "action.rule": "规则",
  "action.cancel": "取消",
  "action.save": "保存",
  "action.clear": "清空",
  "action.current": "当前应用",
  "action.toPhrase": "转为短语",
  "action.enable": "启用",
  "action.disable": "停用",
  "action.exportJson": "导出 JSON",
  "action.importJson": "导入 JSON",
  "phrase.allPhrases": "全部短语",
  "phrase.view.all": "全部",
  "phrase.view.favorites": "收藏",
  "phrase.view.recent": "最近使用",
  "phrase.view.frequent": "高频",
  "phrase.view.duplicates": "重复",
  "phrase.allTags": "全部标签",
  "phrase.search": "搜索标题、内容、缩写或拼音首字母",
  "phrase.image": "图片",
  "phrase.duplicate": "重复",
  "phrase.used": "已用 {count} 次",
  "phrase.imageContent": "图片内容",
  "phrase.none": "暂无短语",
  "phrase.deleteConfirm": "确定删除这个短语？",
  "phrase.groupDeleteConfirm": "确定删除这个分组和其中所有短语？",
  "phrase.favorite": "收藏",
  "phrase.unfavorite": "取消收藏",
  "phrase.edit": "编辑短语",
  "phrase.delete": "删除短语",
  "group.edit": "编辑分组",
  "group.delete": "删除分组",
  "expansion.behavior": "触发行为",
  "expansion.requirePrefix": "需要意图前缀",
  "expansion.requirePrefixHint": "开启后，只有以允许前缀开头的缩写才会触发。",
  "expansion.allowedPrefixes": "允许的前缀",
  "expansion.spaceToExpand": "按 Space 展开",
  "expansion.enabled": "已启用",
  "expansion.disabled": "已停用",
  "expansion.none": "暂无快捷输入",
  "expansion.deleteConfirm": "确定删除这个快捷输入？",
  "clipboard.history": "剪贴板历史",
  "clipboard.captureCurrent": "捕获当前剪贴板",
  "clipboard.autoOn": "自动捕获已开",
  "clipboard.autoOff": "自动捕获已关",
  "clipboard.help": "自动捕获只在设置窗口打开时运行。疑似密码、验证码、银行卡号和令牌的文本会被跳过。",
  "clipboard.search": "搜索剪贴板历史",
  "clipboard.none": "暂无剪贴板历史",
  "clipboard.clearConfirm": "确定清空剪贴板历史？",
  "clipboard.noText": "剪贴板里没有文本。",
  "clipboard.sensitive": "已跳过疑似敏感文本。",
  "clipboard.captured": "已捕获。",
  "clipboard.favorite": "收藏",
  "clipboard.title": "剪贴板文本",
  "clipboard.imageTitle": "剪贴板图片",
  "apps.disabled": "禁用应用",
  "apps.disabledHelp": "每行一个进程名。这些应用里会禁用文本扩展和短语快捷键。",
  "apps.defaultByApp": "按应用设置默认分组",
  "apps.default": "默认：{group}",
  "apps.unknownGroup": "未知分组",
  "apps.none": "暂无应用规则",
  "settings.defaultGroup": "默认分组",
  "settings.autostart": "开机启动",
  "settings.autostartTitle": "跟随系统启动 QuickSend",
  "settings.autostartHint": "开启后，QuickSend 会在后台启动。",
  "settings.backup": "备份",
  "settings.importConfirm": "导入会替换当前数据，是否继续？",
  "settings.backupPlaceholder": "在这里粘贴备份 JSON",
  "settings.shortcuts": "快捷键",
  "settings.language": "语言",
  "settings.languageMode": "界面语言",
  "settings.languageSystem": "跟随系统（{language}）",
  "settings.languageHint": "内置中文和英文。可以在语言目录中新增 JSON 文件扩展其他语言。",
  "settings.languageDir": "语言包目录",
  "settings.languageReload": "新增语言包后，重启应用即可加载。",
  "settings.autostartEnabling": "正在启用开机启动...",
  "settings.autostartDisabling": "正在停用开机启动...",
  "settings.autostartEnabled": "开机启动已启用。",
  "settings.autostartDisabled": "开机启动已停用。",
  "settings.failed": "失败：{error}",
  "shortcut.openPopup": "打开弹窗",
  "shortcut.paste": "粘贴选中短语",
  "shortcut.copy": "复制短语",
  "shortcut.expansion": "文本扩展",
  "shortcut.hotkey": "短语快捷键",
  "shortcut.pasteValue": "Enter 或点击",
  "shortcut.copyValue": "右键短语",
  "shortcut.expansionValue": "输入缩写后按 Space",
  "shortcut.hotkeyValue": "例如：Ctrl+Shift+1",
  "dialog.editGroup": "编辑分组",
  "dialog.newGroup": "新建分组",
  "dialog.editPhrase": "编辑短语",
  "dialog.newPhrase": "新建短语",
  "dialog.editExpansion": "编辑快捷输入",
  "dialog.newExpansion": "新建快捷输入",
  "dialog.editRule": "编辑应用规则",
  "dialog.newRule": "新建应用规则",
  "field.name": "名称",
  "field.icon": "图标",
  "field.group": "分组",
  "field.type": "类型",
  "field.text": "文本",
  "field.image": "图片",
  "field.title": "标题",
  "field.content": "内容。变量支持 {name} 和 {name=默认值}",
  "field.chooseImage": "选择图片文件，或按 Ctrl+V 粘贴图片",
  "field.imageLoaded": "图片已加载",
  "field.hotkey": "快捷键",
  "field.hotkeyPlaceholder": "按一个快捷键，例如 Ctrl+Shift+1",
  "field.hotkeyClear": "按 Backspace 或 Delete 清空。",
  "field.abbreviation": "缩写",
  "field.abbreviationHint": "建议使用 ; / # 等前缀，避免误触发。",
  "field.tags": "标签",
  "field.tagsPlaceholder": "客服, 提示词, 账号",
  "field.tagsHint": "多个标签用逗号分隔，会显示为短语列表筛选项。",
  "field.expandedText": "展开文本",
  "field.processName": "进程名",
  "field.defaultGroup": "默认分组",
  "field.selectGroup": "选择分组",
  "popup.search": "搜索短语、拼音首字母、缩写",
  "popup.none": "没有找到匹配的短语",
  "popup.imagePhrase": "图片短语",
  "popup.clipboardHistory": "剪贴板历史",
  "popup.footer": "Enter 粘贴 · 右键复制 · Tab 切组",
  "popup.count": "{count} 条",
  "popup.templatePaste": "填充并粘贴",
  "error.canvasUnavailable": "当前环境不可用 Canvas",
};

const EN_US: Translations = {
  "app.subtitle": "Phrase, hotkey, and text expansion manager",
  "nav.phrases": "Phrases",
  "nav.expansions": "Expansion",
  "nav.clipboard": "Clipboard",
  "nav.apps": "Apps",
  "nav.settings": "Settings",
  "header.help": "Ctrl+Alt+Q opens the popup. Enter pastes, right click copies, and Space expands abbreviations.",
  "action.group": "Group",
  "action.phrase": "Phrase",
  "action.expansion": "Expansion",
  "action.capture": "Capture",
  "action.rule": "Rule",
  "action.cancel": "Cancel",
  "action.save": "Save",
  "action.clear": "Clear",
  "action.current": "Current",
  "action.toPhrase": "To phrase",
  "action.enable": "Enable",
  "action.disable": "Disable",
  "action.exportJson": "Export JSON",
  "action.importJson": "Import JSON",
  "phrase.allPhrases": "All phrases",
  "phrase.view.all": "All",
  "phrase.view.favorites": "Favorites",
  "phrase.view.recent": "Recent",
  "phrase.view.frequent": "Frequent",
  "phrase.view.duplicates": "Duplicates",
  "phrase.allTags": "All tags",
  "phrase.search": "Search title, content, abbreviation, or pinyin initials",
  "phrase.image": "Image",
  "phrase.duplicate": "Duplicate",
  "phrase.used": "Used {count}",
  "phrase.imageContent": "Image content",
  "phrase.none": "No phrases",
  "phrase.deleteConfirm": "Delete this phrase?",
  "phrase.groupDeleteConfirm": "Delete this group and all phrases inside it?",
  "phrase.favorite": "Favorite",
  "phrase.unfavorite": "Unfavorite",
  "phrase.edit": "Edit phrase",
  "phrase.delete": "Delete phrase",
  "group.edit": "Edit group",
  "group.delete": "Delete group",
  "expansion.behavior": "Trigger behavior",
  "expansion.requirePrefix": "Require intent prefix",
  "expansion.requirePrefixHint": "When enabled, only abbreviations starting with the allowed prefixes trigger.",
  "expansion.allowedPrefixes": "Allowed prefixes",
  "expansion.spaceToExpand": "Space to expand",
  "expansion.enabled": "Enabled",
  "expansion.disabled": "Disabled",
  "expansion.none": "No text expansions",
  "expansion.deleteConfirm": "Delete this expansion?",
  "clipboard.history": "Clipboard history",
  "clipboard.captureCurrent": "Capture current clipboard",
  "clipboard.autoOn": "Auto capture on",
  "clipboard.autoOff": "Auto capture off",
  "clipboard.help": "Auto capture runs while this settings window is open. Sensitive-looking text such as passwords, verification codes, cards, and tokens is skipped.",
  "clipboard.search": "Search clipboard history",
  "clipboard.none": "No clipboard history",
  "clipboard.clearConfirm": "Clear clipboard history?",
  "clipboard.noText": "Clipboard has no text.",
  "clipboard.sensitive": "Skipped sensitive-looking text.",
  "clipboard.captured": "Captured.",
  "clipboard.favorite": "Favorite",
  "clipboard.title": "Clipboard text",
  "clipboard.imageTitle": "Clipboard image",
  "apps.disabled": "Disabled apps",
  "apps.disabledHelp": "One process name per line. Text expansion and phrase hotkeys are disabled in these apps.",
  "apps.defaultByApp": "Default group by app",
  "apps.default": "Default: {group}",
  "apps.unknownGroup": "Unknown group",
  "apps.none": "No app rules",
  "settings.defaultGroup": "Default group",
  "settings.autostart": "Autostart",
  "settings.autostartTitle": "Start QuickSend with the system",
  "settings.autostartHint": "When enabled, QuickSend starts in the background.",
  "settings.backup": "Backup",
  "settings.importConfirm": "Import will replace current data. Continue?",
  "settings.backupPlaceholder": "Paste backup JSON here",
  "settings.shortcuts": "Shortcuts",
  "settings.language": "Language",
  "settings.languageMode": "Interface language",
  "settings.languageSystem": "Follow system ({language})",
  "settings.languageHint": "Chinese and English are built in. Add JSON files to the language directory to extend other languages.",
  "settings.languageDir": "Language pack directory",
  "settings.languageReload": "Restart the app after adding a language pack.",
  "settings.autostartEnabling": "Enabling autostart...",
  "settings.autostartDisabling": "Disabling autostart...",
  "settings.autostartEnabled": "Autostart enabled.",
  "settings.autostartDisabled": "Autostart disabled.",
  "settings.failed": "Failed: {error}",
  "shortcut.openPopup": "Open popup",
  "shortcut.paste": "Paste selected phrase",
  "shortcut.copy": "Copy phrase",
  "shortcut.expansion": "Text expansion",
  "shortcut.hotkey": "Phrase hotkey",
  "shortcut.pasteValue": "Enter or click",
  "shortcut.copyValue": "Right click phrase",
  "shortcut.expansionValue": "Type abbreviation then Space",
  "shortcut.hotkeyValue": "Example: Ctrl+Shift+1",
  "dialog.editGroup": "Edit group",
  "dialog.newGroup": "New group",
  "dialog.editPhrase": "Edit phrase",
  "dialog.newPhrase": "New phrase",
  "dialog.editExpansion": "Edit expansion",
  "dialog.newExpansion": "New expansion",
  "dialog.editRule": "Edit app rule",
  "dialog.newRule": "New app rule",
  "field.name": "Name",
  "field.icon": "Icon",
  "field.group": "Group",
  "field.type": "Type",
  "field.text": "Text",
  "field.image": "Image",
  "field.title": "Title",
  "field.content": "Content. Variables support {name} and defaults like {name=default}",
  "field.chooseImage": "Choose image file or paste image with Ctrl+V",
  "field.imageLoaded": "Image loaded",
  "field.hotkey": "Hotkey",
  "field.hotkeyPlaceholder": "Press a shortcut, e.g. Ctrl+Shift+1",
  "field.hotkeyClear": "Press Backspace or Delete to clear.",
  "field.abbreviation": "Abbreviation",
  "field.abbreviationHint": "Use ; / # prefixes to avoid accidental triggers.",
  "field.tags": "Tags",
  "field.tagsPlaceholder": "support, prompt, account",
  "field.tagsHint": "Comma-separated tags. They appear as filters in the phrase list.",
  "field.expandedText": "Expanded text",
  "field.processName": "Process name",
  "field.defaultGroup": "Default group",
  "field.selectGroup": "Select group",
  "popup.search": "Search phrases, pinyin initials, abbreviations",
  "popup.none": "No matching phrases",
  "popup.imagePhrase": "Image phrase",
  "popup.clipboardHistory": "Clipboard history",
  "popup.footer": "Enter paste · Right click copy · Tab switch group",
  "popup.count": "{count} items",
  "popup.templatePaste": "Fill and paste",
  "error.canvasUnavailable": "Canvas is not available",
};

const BUILT_INS: Record<string, { name: string; translations: Translations }> = {
  "zh-CN": { name: "简体中文", translations: ZH_CN },
  "en-US": { name: "English", translations: EN_US },
};

const I18nContextObject = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<I18nContext>({ system_locale: "zh-CN", language_dir: "", languages: [] });
  const [configuredLanguage, setConfiguredLanguage] = useState(SYSTEM_LANGUAGE);

  useEffect(() => {
    async function load() {
      const [i18nContext, settings] = await Promise.all([getI18nContext(), getSettings()]);
      setContext(i18nContext);
      const settingsMap = new Map(settings.map((item) => [item.key, item.value]));
      setConfiguredLanguage(settingsMap.get(LANGUAGE_SETTING_KEY) || SYSTEM_LANGUAGE);
    }

    load().catch((error) => console.error("Failed to load i18n:", error));
  }, []);

  const languagePacks = useMemo(() => mergeLanguagePacks(context.languages), [context.languages]);
  const systemLanguage = resolveLanguage(context.system_locale, languagePacks);
  const language = configuredLanguage === SYSTEM_LANGUAGE
    ? systemLanguage
    : resolveLanguage(configuredLanguage, languagePacks);

  const translations = useMemo(() => {
    return {
      ...BUILT_INS[DEFAULT_LANGUAGE].translations,
      ...(languagePacks[language]?.translations || {}),
    };
  }, [language, languagePacks]);

  const t = useCallback((key: string, values?: Record<string, string | number>) => {
    const template = translations[key] || key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
  }, [translations]);

  const setLanguage = useCallback(async (nextLanguage: string) => {
    setConfiguredLanguage(nextLanguage);
    await updateSetting(LANGUAGE_SETTING_KEY, nextLanguage);
  }, []);

  const languages = useMemo<LanguageOption[]>(() => [
    { id: SYSTEM_LANGUAGE, name: t("settings.languageSystem", { language: languagePacks[systemLanguage]?.name || systemLanguage }), source: "system" },
    ...Object.entries(languagePacks).map(([id, pack]) => ({
      id,
      name: pack.name,
      source: BUILT_INS[id] ? "built-in" as const : "custom" as const,
    })),
  ], [languagePacks, systemLanguage, t]);

  const value = useMemo<I18nValue>(() => ({
    language,
    configuredLanguage,
    systemLocale: context.system_locale,
    languageDir: context.language_dir,
    languages,
    t,
    setLanguage,
  }), [configuredLanguage, context.language_dir, context.system_locale, language, languages, setLanguage, t]);

  return <I18nContextObject.Provider value={value}>{children}</I18nContextObject.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContextObject);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}

function mergeLanguagePacks(customPacks: ExternalLanguagePack[]) {
  const packs: Record<string, { name: string; translations: Translations }> = { ...BUILT_INS };
  for (const pack of customPacks) {
    if (!pack.id || !pack.translations) continue;
    packs[pack.id] = {
      name: pack.name || pack.id,
      translations: {
        ...(packs[pack.id]?.translations || {}),
        ...pack.translations,
      },
    };
  }
  return packs;
}

function resolveLanguage(locale: string, packs: Record<string, { name: string; translations: Translations }>) {
  const normalized = normalizeLocale(locale);
  if (packs[normalized]) return normalized;
  const base = normalized.split("-")[0].toLowerCase();
  const match = Object.keys(packs).find((id) => id.split("-")[0].toLowerCase() === base);
  return match || DEFAULT_LANGUAGE;
}

function normalizeLocale(locale: string) {
  const trimmed = (locale || DEFAULT_LANGUAGE).replace("_", "-").trim();
  if (!trimmed) return DEFAULT_LANGUAGE;
  const [language, region] = trimmed.split("-");
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}
