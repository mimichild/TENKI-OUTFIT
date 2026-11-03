import { THEME_COLORS, THEME_COLOR_KEYS } from '@/constants/themeColors';

// WCAG 相對亮度與對比度
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('THEME_COLORS', () => {
  it('提供 10 個主題色，且包含指定的 #EAAFB3', () => {
    expect(THEME_COLOR_KEYS).toHaveLength(10);
    expect(Object.values(THEME_COLORS).map(c => c.primary)).toContain('#EAAFB3');
  });

  it('淺色主題在主色上用黑字、深色（酒紅）用白字', () => {
    for (const key of THEME_COLOR_KEYS) {
      const { primary, onPrimary } = THEME_COLORS[key];
      const expected = key === 'wine' ? '#FFFFFF' : '#1D2025';
      expect({ key, onPrimary }).toEqual({ key, onPrimary: expected });
      // 主色底上的文字至少要達到 WCAG AA（4.5:1）
      expect(contrast(primary, onPrimary)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('主色當文字用時（textOnLight / textOnDark），在淺色與深色模式底色上都清楚可讀', () => {
    for (const key of THEME_COLOR_KEYS) {
      const { textOnLight, textOnDark } = THEME_COLORS[key];
      // 淺色模式：背景 #F5F6F8、卡片 #FFFFFF
      expect({ key, ratio: contrast(textOnLight, '#F5F6F8') >= 4.5 }).toEqual({ key, ratio: true });
      // 深色模式：背景 #111316、卡片 #1C1F24
      expect({ key, ratio: contrast(textOnDark, '#1C1F24') >= 4.5 }).toEqual({ key, ratio: true });
    }
  });
});
