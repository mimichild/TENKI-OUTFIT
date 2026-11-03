import { useColorScheme } from 'react-native';
import { THEME_COLORS } from '@/constants/themeColors';
import { useSettingsStore } from '@/store/settingsStore';

export interface Theme {
  dark: boolean;
  primary: string;
  /** 放在主色底上的文字／圖示顏色 */
  onPrimary: string;
  /** 把主色當文字／圖示用時的顏色（已確保在目前模式的底色上可讀） */
  primaryText: string;
  primarySoft: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
}

export function useTheme(): Theme {
  const dark = useColorScheme() === 'dark';
  const { primary, soft, onPrimary, textOnLight, textOnDark } = THEME_COLORS[useSettingsStore(s => s.themeColor)];
  return dark
    ? {
        dark,
        primary,
        onPrimary,
        primaryText: textOnDark,
        primarySoft: `${primary}33`,
        background: '#111316',
        surface: '#1C1F24',
        text: '#F2F3F5',
        textMuted: '#9AA0A8',
        border: '#2C3036',
      }
    : {
        dark,
        primary,
        onPrimary,
        primaryText: textOnLight,
        primarySoft: soft,
        background: '#F5F6F8',
        surface: '#FFFFFF',
        text: '#1D2025',
        textMuted: '#6B7280',
        border: '#E3E5E8',
      };
}
