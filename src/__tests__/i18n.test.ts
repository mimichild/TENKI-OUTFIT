import { dictionaries, translate, LANGUAGES } from '@/i18n';

describe('i18n dictionaries', () => {
  const baseKeys = Object.keys(dictionaries['zh-TW']).sort();

  it.each(LANGUAGES.filter(l => l !== 'zh-TW'))('%s has exactly the same keys as zh-TW', lang => {
    expect(Object.keys(dictionaries[lang]).sort()).toEqual(baseKeys);
  });

  it('has no empty strings', () => {
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        expect([key, value.trim().length > 0]).toEqual([key, true]);
      }
    }
  });
});

describe('translate', () => {
  it('returns the string in the requested language', () => {
    expect(translate('en', 'tab.settings')).toBe('Settings');
    expect(translate('ja', 'tab.settings')).toBe('設定');
  });
  it('interpolates params', () => {
    expect(translate('zh-TW', 'settings.trashCount', { count: 3 })).toBe('3 件');
  });
});
