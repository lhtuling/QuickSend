import { invoke } from "@tauri-apps/api/core";
import type { Group, Phrase, TextExpansion, ProcessRule, Setting } from "../types";

// ==================== Groups ====================
export async function getGroups(): Promise<Group[]> {
  return invoke("get_groups");
}

export async function createGroup(name: string, icon: string): Promise<Group> {
  return invoke("create_group", { name, icon });
}

export async function updateGroup(id: string, name: string, icon: string): Promise<void> {
  return invoke("update_group", { id, name, icon });
}

export async function deleteGroup(id: string): Promise<void> {
  return invoke("delete_group", { id });
}

export async function reorderGroups(ids: string[]): Promise<void> {
  return invoke("reorder_groups", { ids });
}

// ==================== Phrases ====================
export async function getPhrases(): Promise<Phrase[]> {
  return invoke("get_phrases");
}

export async function getPhrasesByGroup(groupId: string): Promise<Phrase[]> {
  return invoke("get_phrases_by_group", { groupId });
}

export async function searchPhrases(query: string): Promise<Phrase[]> {
  return invoke("search_phrases", { query });
}

export async function createPhrase(
  groupId: string,
  title: string,
  content: string,
  contentType: string = "text",
  imageData?: string | null,
  hotkey?: string | null,
  abbreviation?: string | null
): Promise<Phrase> {
  return invoke("create_phrase", {
    groupId,
    title,
    content,
    contentType,
    imageData: imageData ?? null,
    hotkey: hotkey ?? null,
    abbreviation: abbreviation ?? null,
  });
}

export async function updatePhrase(
  id: string,
  groupId: string,
  title: string,
  content: string,
  contentType: string = "text",
  imageData?: string | null,
  hotkey?: string | null,
  abbreviation?: string | null
): Promise<void> {
  return invoke("update_phrase", {
    id,
    groupId,
    title,
    content,
    contentType,
    imageData: imageData ?? null,
    hotkey: hotkey ?? null,
    abbreviation: abbreviation ?? null,
  });
}

export async function deletePhrase(id: string): Promise<void> {
  return invoke("delete_phrase", { id });
}

export async function pastePhrase(id: string): Promise<void> {
  return invoke("paste_phrase", { id });
}

export async function copyPhraseToClipboard(id: string): Promise<void> {
  return invoke("copy_phrase_to_clipboard", { id });
}

// ==================== Popup ====================
export async function togglePopup(): Promise<void> {
  return invoke("toggle_popup");
}

export async function hidePopup(): Promise<void> {
  return invoke("hide_popup");
}

// ==================== Text Expansions ====================
export async function getTextExpansions(): Promise<TextExpansion[]> {
  return invoke("get_text_expansions");
}

export async function createTextExpansion(
  abbreviation: string,
  expandedText: string
): Promise<TextExpansion> {
  return invoke("create_text_expansion", { abbreviation, expandedText });
}

export async function updateTextExpansion(
  id: string,
  abbreviation: string,
  expandedText: string,
  enabled: boolean
): Promise<void> {
  return invoke("update_text_expansion", { id, abbreviation, expandedText, enabled });
}

export async function deleteTextExpansion(id: string): Promise<void> {
  return invoke("delete_text_expansion", { id });
}

// ==================== Process Rules ====================
export async function getProcessRules(): Promise<ProcessRule[]> {
  return invoke("get_process_rules");
}

export async function setProcessRule(processName: string, groupId: string): Promise<ProcessRule> {
  return invoke("set_process_rule", { processName, groupId });
}

export async function deleteProcessRule(id: string): Promise<void> {
  return invoke("delete_process_rule", { id });
}

export async function getActiveProcessName(): Promise<string> {
  return invoke("get_active_process_name");
}

export async function getAutostartEnabled(): Promise<boolean> {
  return invoke("get_autostart_enabled");
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  return invoke("set_autostart_enabled", { enabled });
}

// ==================== Settings ====================
export async function getSettings(): Promise<Setting[]> {
  return invoke("get_settings");
}

export async function updateSetting(key: string, value: string): Promise<void> {
  return invoke("update_setting", { key, value });
}

// ==================== Import/Export ====================
export async function exportData(): Promise<string> {
  const data = await invoke("export_data");
  return JSON.stringify(data, null, 2);
}

export async function importData(jsonStr: string): Promise<void> {
  const data = JSON.parse(jsonStr);
  return invoke("import_data", { data });
}
