export type ThemeColorKey =
  | 'sakura' | 'peach' | 'butter' | 'khaki' | 'mocha'
  | 'wine' | 'matcha' | 'mint' | 'sky' | 'lavender';

export interface ThemeColor {
  /** 主色：按鈕底色、選取框等 */
  primary: string;
  /** 淺色模式的淡底色 */
  soft: string;
  /** 放在主色底上的文字／圖示：淺色主題配黑字，深色主題配白字 */
  onPrimary: string;
  /** 淺色模式下把主色當文字／圖示用時的顏色（同色系加深，確保可讀） */
  textOnLight: string;
  /** 深色模式下把主色當文字／圖示用時的顏色 */
  textOnDark: string;
}

// 主色底上的文字／圖示顏色：淺色主題配黑字，深色主題配白字
const DARK = '#1D2025';
const LIGHT = '#FFFFFF';

// 淺色調為基底；wine（酒紅）為唯一深色，提供高對比選項
export const THEME_COLORS: Record<ThemeColorKey, ThemeColor> = {
  sakura: { primary: '#EAAFB3', soft: '#FBEEEF', onPrimary: DARK, textOnLight: '#B04A57', textOnDark: '#EAAFB3' },
  peach: { primary: '#F2B89A', soft: '#FDF1EA', onPrimary: DARK, textOnLight: '#A85532', textOnDark: '#F2B89A' },
  butter: { primary: '#E5C77A', soft: '#FBF5E4', onPrimary: DARK, textOnLight: '#8A6B1B', textOnDark: '#E5C77A' },
  khaki: { primary: '#CDBA9A', soft: '#F6F1E8', onPrimary: DARK, textOnLight: '#856C42', textOnDark: '#CDBA9A' },
  mocha: { primary: '#C8A595', soft: '#F6EEEA', onPrimary: DARK, textOnLight: '#95644D', textOnDark: '#C8A595' },
  wine: { primary: '#8C3A4B', soft: '#F3E4E7', onPrimary: LIGHT, textOnLight: '#8C3A4B', textOnDark: '#C36E80' },
  matcha: { primary: '#A9C49A', soft: '#EEF4EA', onPrimary: DARK, textOnLight: '#587846', textOnDark: '#A9C49A' },
  mint: { primary: '#9CCFC0', soft: '#EAF6F2', onPrimary: DARK, textOnLight: '#3B7B68', textOnDark: '#9CCFC0' },
  sky: { primary: '#9EC3E6', soft: '#EAF2FA', onPrimary: DARK, textOnLight: '#2E72B3', textOnDark: '#9EC3E6' },
  lavender: { primary: '#BFAEE0', soft: '#F1EDF9', onPrimary: DARK, textOnLight: '#7D5BC0', textOnDark: '#BFAEE0' },
};

export const THEME_COLOR_KEYS = Object.keys(THEME_COLORS) as ThemeColorKey[];
