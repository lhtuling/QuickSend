import { pinyin } from "pinyin-pro";

const CHINESE_RE = /[\u4e00-\u9fff]/;

export function getPinyinInitials(text: string): string {
  return pinyin(text, {
    pattern: "first",
    toneType: "none",
    type: "array",
  }).join("").toLowerCase();
}

export function getFullPinyin(text: string): string {
  return pinyin(text, {
    toneType: "none",
    type: "array",
  }).join("").toLowerCase();
}

export function pinyinMatch(target: string, query: string): boolean {
  if (!query || !target) return false;

  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  if (lowerTarget.includes(lowerQuery)) return true;
  if (!CHINESE_RE.test(target)) return false;

  return (
    getPinyinInitials(target).includes(lowerQuery) ||
    getFullPinyin(target).includes(lowerQuery)
  );
}

export function matchScore(target: string, query: string): number {
  if (!query || !target) return 0;

  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  if (lowerTarget === lowerQuery) return 100;
  if (lowerTarget.startsWith(lowerQuery)) return 80;
  if (lowerTarget.includes(lowerQuery)) return 60;
  if (!CHINESE_RE.test(target)) return 0;

  const initials = getPinyinInitials(target);
  if (initials.startsWith(lowerQuery)) return 55;
  if (initials.includes(lowerQuery)) return 45;

  const fullPinyin = getFullPinyin(target);
  if (fullPinyin.startsWith(lowerQuery)) return 35;
  if (fullPinyin.includes(lowerQuery)) return 25;

  return 0;
}
