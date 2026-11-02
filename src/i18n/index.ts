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

export function translate(
  language: Language,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[language][key] ?? dictionaries['zh-TW'][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

export function useT() {
  const language = useSettingsStore(s => s.language);
  return (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(language, key, params);
}
