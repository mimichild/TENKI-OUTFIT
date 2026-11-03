import { useSettingsStore } from '@/store/settingsStore';
import { en } from './en';
import { ja } from './ja';
import { zhTW } from './zh-TW';

export type Language = 'zh-TW' | 'en' | 'ja';
export type TranslationKey = keyof typeof zhTW;

export const LANGUAGES: Language[] = ['zh-TW', 'en', 'ja'];

export const LANGUAGE_LABELS: Record<Language, string> = {
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
};

export const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  'zh-TW': zhTW,
  en,
  ja,
};

/**
 * 模板語法：
 * - `{name}` → 參數值
 * - `{count|item|items}` → 參數值＋單數或複數字（值為 1 用第一個，其他用第二個），例如「1 item」「2 items」
 */
const PARAM_RE = /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g;

export function translate(
  language: Language,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[language][key] ?? dictionaries['zh-TW'][key] ?? key;
  if (!params) return template;
  return template.replace(PARAM_RE, (match, name: string, one?: string, other?: string) => {
    if (!(name in params)) return match;
    const value = params[name];
    if (one === undefined) return String(value);
    return `${value} ${Number(value) === 1 ? one : other}`;
  });
}

export function useT() {
  const language = useSettingsStore(s => s.language);
  return (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(language, key, params);
}
