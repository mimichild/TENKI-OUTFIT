import { THEME_COLORS } from '@/constants/themeColors';
import { TAB_STATUS_BAR_STYLE, tabScreenOptions } from '@/theme/tabScreenOptions';
import type { Theme } from '@/theme/useTheme';

const base: Omit<Theme, 'primary' | 'onPrimary' | 'primaryText'> = {
  dark: false, primarySoft: '#FBEEEF', background: '#F5F6F8', surface: '#FFFFFF',
  text: '#1D2025', textMuted: '#6B7280', border: '#E3E5E8',
};
const sakura: Theme = { ...base, primary: THEME_COLORS.sakura.primary, onPrimary: THEME_COLORS.sakura.onPrimary, primaryText: THEME_COLORS.sakura.textOnLight };
const wine: Theme = { ...base, primary: THEME_COLORS.wine.primary, onPrimary: THEME_COLORS.wine.onPrimary, primaryText: THEME_COLORS.wine.textOnLight };

describe('tabScreenOptions', () => {
  it('上方標題列與下方分頁列都用主題色填滿', () => {
    const o = tabScreenOptions(sakura);
    expect(o.headerStyle).toEqual({ backgroundColor: '#EAAFB3' });
    expect(o.tabBarStyle).toEqual({ backgroundColor: '#EAAFB3', borderTopColor: '#EAAFB3' });
  });

  it('標題與分頁文字一律白色，不隨主題深淺改變；未選中的分頁較淡', () => {
    for (const theme of [sakura, wine]) {
      const o = tabScreenOptions(theme);
      expect(o.headerTintColor).toBe('#FFFFFF');
      expect(o.tabBarActiveTintColor).toBe('#FFFFFF');
      expect(o.tabBarInactiveTintColor).toBe('#FFFFFF99');
    }
  });

  it('頁面背景維持原本的背景色', () => {
    expect(tabScreenOptions(sakura).sceneStyle).toEqual({ backgroundColor: '#F5F6F8' });
  });
});

describe('TAB_STATUS_BAR_STYLE', () => {
  it('標題列文字是白色，狀態列圖示也一律用淺色', () => {
    expect(TAB_STATUS_BAR_STYLE).toBe('light');
  });
});
