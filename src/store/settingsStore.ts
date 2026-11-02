import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { COUNTIES, type County } from '@/constants/options';
import { THEME_COLORS, type ThemeColorKey } from '@/constants/themeColors';
import type { Language } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';
import { getSecure, setSecure } from '@/lib/secureStorage';
import type { CurrencyCode } from '@/lib/currency';

const CWA_KEY_SECURE_NAME = 'cwaApiKey';

export interface Settings {
  language: Language;
  county: County;
  /** 鄉鎮市區；v1 只做到縣市，一律為空字串（保留欄位給之後的鄉鎮層級） */
  town: string;
  currency: CurrencyCode;
  themeColor: ThemeColorKey;
  /** 只存在加密儲存區，不寫入 AsyncStorage */
  cwaApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'zh-TW',
  county: '臺北市',
  town: '',
  currency: 'TWD',
  themeColor: 'sky',
  cwaApiKey: '',
};

// 不從 @/i18n 匯入，避免 i18n ↔ store 循環依賴
const VALID_LANGUAGES: readonly string[] = ['zh-TW', 'en', 'ja'];

/** 舊版或損壞的存檔值一律退回預設，避免查表拿到 undefined 而當掉 */
export function sanitizeSettings(raw: Partial<Settings>): Omit<Settings, 'cwaApiKey'> {
  const { cwaApiKey: _ignored, ...s } = { ...DEFAULT_SETTINGS, ...raw };
  if (!VALID_LANGUAGES.includes(s.language)) s.language = DEFAULT_SETTINGS.language;
  if (!(s.themeColor in THEME_COLORS)) s.themeColor = DEFAULT_SETTINGS.themeColor;
  if (!(s.currency in CURRENCIES)) s.currency = DEFAULT_SETTINGS.currency;
  if (!(COUNTIES as readonly string[]).includes(s.county)) s.county = DEFAULT_SETTINGS.county;
  // v1 只做到縣市：舊版存的鄉鎮（例如預設的中正區）一律清掉
  s.town = '';
  return s;
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      ...DEFAULT_SETTINGS,
      update: patch => {
        if (patch.cwaApiKey === undefined) return set(patch);
        const cwaApiKey = patch.cwaApiKey.trim();
        set({ ...patch, cwaApiKey });
        setSecure(CWA_KEY_SECURE_NAME, cwaApiKey).catch(e => console.warn('授權碼儲存失敗', e));
      },
    }),
    {
      name: 'tenki-settings',
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeSettings((persisted ?? {}) as Partial<Settings>),
      }),
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ update: _update, cwaApiKey: _secret, ...settings }) => settings,
    },
  ),
);

/** 開 App 時把加密儲存區的授權碼讀回 store */
export async function loadSecureSettings(): Promise<void> {
  const cwaApiKey = (await getSecure(CWA_KEY_SECURE_NAME)) ?? '';
  useSettingsStore.setState({ cwaApiKey });
}
