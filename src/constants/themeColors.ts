export type ThemeColorKey = 'sky' | 'sakura' | 'matcha' | 'sunset' | 'lavender' | 'charcoal';

export const THEME_COLORS: Record<ThemeColorKey, { primary: string; soft: string }> = {
  sky: { primary: '#3B82C4', soft: '#E3F0FB' },
  sakura: { primary: '#D9668A', soft: '#FBE7EE' },
  matcha: { primary: '#5E8C4A', soft: '#E8F1E2' },
  sunset: { primary: '#E07B39', soft: '#FCEBDD' },
  lavender: { primary: '#7D6BC2', soft: '#ECE8F8' },
  charcoal: { primary: '#3F4650', soft: '#E6E8EB' },
};

export const THEME_COLOR_KEYS = Object.keys(THEME_COLORS) as ThemeColorKey[];
