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

describe('plurals', () => {
  it('uses the singular form for 1 and the plural form otherwise', () => {
    expect(translate('en', 'settings.trashCount', { count: 1 })).toBe('1 item');
    expect(translate('en', 'settings.trashCount', { count: 2 })).toBe('2 items');
    expect(translate('en', 'settings.trashCount', { count: 0 })).toBe('0 items');
    expect(translate('en', 'trash.daysLeft', { days: 1 })).toBe('Auto-deletes in 1 day');
    expect(translate('en', 'trash.daysLeft', { days: 5 })).toBe('Auto-deletes in 5 days');
  });

  it('judges each number param separately', () => {
    expect(translate('en', 'backup.imported', { items: 1, trash: 2, outfits: 3 })).toBe('Import complete: 1 item, 2 in trash, 3 outfits');
    expect(translate('en', 'backup.summaryNoDate', { items: 2, trash: 0, outfits: 1 })).toBe('Backup contents: 2 items, 0 in trash, 1 outfit');
    expect(translate('en', 'outfit.openLabel', { count: 1, total: '$10' })).toBe('Edit outfit, 1 item, $10');
  });

  it('leaves an unknown param untouched', () => {
    expect(translate('en', 'settings.trashCount')).toBe('{count|item|items}');
  });

  it('does not affect Chinese or Japanese', () => {
    expect(translate('zh-TW', 'settings.trashCount', { count: 1 })).toBe('1 件');
    expect(translate('ja', 'trash.daysLeft', { days: 1 })).not.toMatch(/[|{}]/);
  });

  it('has no leftover "(s)" plurals in English', () => {
    for (const value of Object.values(dictionaries.en)) expect(value).not.toMatch(/\(s\)/);
  });
});
