import {
  candidatesFor,
  lookOf,
  needsOuterwear,
  outerwearRule,
  suggestOutfit,
  presetPieces,
  suggestionLayout,
  tempBand,
  weatherBasis,
  type SuggestionInput,
} from '@/lib/suggestion';
import { describeSuggestion } from '@/lib/suggestionText';
import { CANVAS_HEIGHT_RATIO } from '@/lib/outfitCanvas';
import type { Category, ColorTag, Item, Occasion, Season, StyleTag } from '@/types/models';

let seq = 0;
function item(
  category: Category,
  opts: { seasons?: Season[]; occasions?: Occasion[]; name?: string; color?: ColorTag; style?: StyleTag } = {},
): Item {
  seq += 1;
  return {
    id: `i${seq}`,
    name: opts.name ?? `${category}${seq}`,
    brand: '',
    category,
    price: null,
    occasions: opts.occasions ?? [],
    seasons: opts.seasons ?? [],
    imageUri: null,
    originalUri: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    lastUsedAt: null,
    deletedAt: null,
    color: opts.color ?? null,
    style: opts.style ?? null,
  };
}

const weather = (maxAT: number | null, minAT: number | null, extra: Partial<{ maxT: number; minT: number; pop: number }> = {}) => ({
  maxAT,
  minAT,
  maxT: extra.maxT ?? null,
  minT: extra.minT ?? null,
  pop: extra.pop ?? null,
});

/** 固定序列的亂數，用完重頭 */
function seqRng(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('weatherBasis', () => {
  it('uses the feels-like temperatures and their average', () => {
    expect(weatherBasis(weather(29, 19))).toEqual({ min: 19, max: 29, avg: 24, kind: 'feels' });
  });
  it('falls back to air temperature when feels-like is missing', () => {
    expect(weatherBasis(weather(null, 18, { maxT: 26, minT: 17 }))).toEqual({ min: 17, max: 26, avg: 21.5, kind: 'air' });
  });
  it('prefers complete air temperatures over incomplete feels-like', () => {
    expect(weatherBasis(weather(25, null, { maxT: 24, minT: 18 }))).toEqual({ min: 18, max: 24, avg: 21, kind: 'air' });
  });
  it('uses a single feels-like value when that is all there is', () => {
    expect(weatherBasis(weather(25, null))).toEqual({ min: 25, max: 25, avg: 25, kind: 'feels' });
  });
  it('is null without usable temperatures', () => {
    expect(weatherBasis(null)).toBeNull();
    expect(weatherBasis(weather(null, null))).toBeNull();
  });
});

describe('tempBand / outerwearRule', () => {
  it.each([
    [28, 'hot'],
    [27.5, 'warm'],
    [20, 'warm'],
    [19.9, 'cool'],
    [13, 'cool'],
    [12.9, 'cold'],
  ] as const)('%s° → %s', (avg, band) => {
    expect(tempBand(avg)).toBe(band);
  });

  it('decides outerwear from the band and the low', () => {
    expect(outerwearRule({ min: 28, max: 33, avg: 30.5, kind: 'feels' })).toBe('none');
    expect(outerwearRule({ min: 21, max: 27, avg: 24, kind: 'feels' })).toBe('optional');
    expect(outerwearRule({ min: 19, max: 29, avg: 24, kind: 'feels' })).toBe('required');
    expect(outerwearRule({ min: 14, max: 18, avg: 16, kind: 'feels' })).toBe('required');
    expect(outerwearRule({ min: 5, max: 12, avg: 8.5, kind: 'feels' })).toBe('required');
    expect(outerwearRule(null)).toBe('optional');
  });
});

describe('candidatesFor', () => {
  const summer = item('top', { seasons: ['summer'] });
  const winter = item('top', { seasons: ['winter'] });
  const allSeason = item('top');
  const work = item('top', { occasions: ['work'] });
  const items = [summer, winter, allSeason, work];

  it('keeps items whose season fits the band (no season = all seasons)', () => {
    const ids = candidatesFor(items, 'top', { band: 'hot', occasion: null }).map(i => i.id);
    expect(ids).toEqual([summer.id, allSeason.id, work.id]);
  });
  it('ignores season when there is no weather', () => {
    expect(candidatesFor(items, 'top', { band: null, occasion: null })).toHaveLength(4);
  });
  it('keeps items for the occasion (no occasion = every occasion)', () => {
    const ids = candidatesFor(items, 'top', { band: null, occasion: 'formal' }).map(i => i.id);
    expect(ids).toEqual([summer.id, winter.id, allSeason.id]);
  });
  it('only returns the requested category', () => {
    expect(candidatesFor([item('bottom')], 'top', { band: null, occasion: null })).toEqual([]);
  });
});

describe('suggestOutfit', () => {
  const base = (items: Item[], extra: Partial<SuggestionInput> = {}): SuggestionInput => ({
    items,
    weather: weather(29, 19),
    occasion: null,
    ...extra,
  });

  it('for 29°/19° picks spring–autumn pieces and always adds outerwear', () => {
    const top = item('top', { seasons: ['summer'] });
    const winterTop = item('top', { seasons: ['winter'] });
    const bottom = item('bottom');
    const jacket = item('outerwear', { seasons: ['spring', 'autumn'] });
    const shoes = item('shoes');
    const r = suggestOutfit(base([top, winterTop, bottom, jacket, shoes]), { rng: () => 0 });
    expect(r.status).toBe('ok');
    expect(r.band).toBe('warm');
    expect(r.outerwear).toBe('required');
    expect(r.pieces.map(i => i.id)).toEqual([jacket.id, top.id, bottom.id, shoes.id]);
    expect(r.missing).toEqual([]);
  });

  it('does not add outerwear when it is hot', () => {
    const r = suggestOutfit(base([item('top'), item('bottom'), item('outerwear'), item('shoes')], { weather: weather(34, 28) }), {
      rng: () => 0,
    });
    expect(r.pieces.map(i => i.category)).toEqual(['top', 'bottom', 'shoes']);
  });

  it('adds optional outerwear only sometimes', () => {
    const items = [item('top'), item('bottom'), item('outerwear')];
    const w = weather(26, 21);
    expect(suggestOutfit(base(items, { weather: w }), { rng: seqRng([0, 0, 0.9]) }).pieces.map(i => i.category)).not.toContain('outerwear');
    expect(suggestOutfit(base(items, { weather: w }), { rng: seqRng([0, 0, 0.1, 0]) }).pieces.map(i => i.category)).toContain('outerwear');
  });

  it('can choose a one-piece instead of top + bottom', () => {
    const dress = item('onepiece');
    const r = suggestOutfit(base([item('top'), item('bottom'), dress], { weather: weather(30, 28) }), { rng: seqRng([0.99, 0]) });
    expect(r.pieces.map(i => i.id)).toEqual([dress.id]);
  });

  it('adds one bag and one accessory when there are any, never "other"', () => {
    const r = suggestOutfit(base([item('onepiece'), item('bag'), item('accessory'), item('other'), item('shoes')], { weather: weather(30, 28) }), {
      rng: () => 0,
    });
    expect(r.pieces.map(i => i.category)).toEqual(['onepiece', 'shoes', 'bag', 'accessory']);
  });

  it('reports missing shoes and required outerwear', () => {
    const r = suggestOutfit(base([item('top'), item('bottom')], { weather: weather(16, 12) }), { rng: () => 0 });
    expect(r.status).toBe('ok');
    expect(r.missing).toEqual(['outerwear', 'shoes']);
  });

  it('is empty when no top + bottom or one-piece fits', () => {
    const r = suggestOutfit(base([item('top'), item('shoes')]), { rng: () => 0 });
    expect(r.status).toBe('empty');
    expect(r.pieces).toEqual([]);
  });

  describe('emptyReason', () => {
    it('needs a bottom when there are only tops', () => {
      const r = suggestOutfit(base([item('top'), item('shoes')]), { rng: () => 0 });
      expect(r.status).toBe('empty');
      expect(r.emptyReason).toEqual({ need: ['bottom'], filtered: [] });
    });

    it('needs a top when there are only bottoms', () => {
      const r = suggestOutfit(base([item('bottom')]), { rng: () => 0 });
      expect(r.emptyReason).toEqual({ need: ['top'], filtered: [] });
    });

    it('needs both when there are only shoes', () => {
      const r = suggestOutfit(base([item('shoes')]), { rng: () => 0 });
      expect(r.emptyReason).toEqual({ need: ['top', 'bottom'], filtered: [] });
    });

    it('says the bottom is filtered out when it only fits winter on a warm day', () => {
      const r = suggestOutfit(base([item('top'), item('bottom', { seasons: ['winter'] })], { weather: weather(30, 28) }), { rng: () => 0 });
      expect(r.emptyReason).toEqual({ need: ['bottom'], filtered: ['bottom'] });
    });

    it('says the top is filtered out by occasion', () => {
      const r = suggestOutfit(base([item('top', { occasions: ['dinner'] }), item('bottom')], { occasion: 'work' }), { rng: () => 0 });
      expect(r.emptyReason).toEqual({ need: ['top'], filtered: ['top'] });
    });

    it('is null when an outfit is found', () => {
      const r = suggestOutfit(base([item('onepiece')]), { rng: () => 0 });
      expect(r.status).toBe('ok');
      expect(r.emptyReason).toBeNull();
    });
  });

  it('respects the occasion filter', () => {
    const workTop = item('top', { occasions: ['work'] });
    const dinnerTop = item('top', { occasions: ['dinner'] });
    const r = suggestOutfit(base([workTop, dinnerTop, item('bottom')], { occasion: 'work', weather: weather(30, 28) }), { rng: () => 0.99 });
    expect(r.pieces[0].id).toBe(workTop.id);
  });

  it('ignores temperature without weather', () => {
    const winterTop = item('top', { seasons: ['winter'] });
    const r = suggestOutfit(base([winterTop, item('bottom')], { weather: null }), { rng: () => 0 });
    expect(r.status).toBe('ok');
    expect(r.basis).toBeNull();
    expect(r.pieces[0].id).toBe(winterTop.id);
  });

  it('avoids repeating the previous outfit when another one exists', () => {
    const a = item('top');
    const b = item('top');
    const bottom = item('bottom');
    const w = weather(30, 28);
    const first = suggestOutfit(base([a, b, bottom], { weather: w }), { rng: () => 0 });
    expect(first.pieces[0].id).toBe(a.id);
    const next = suggestOutfit(base([a, b, bottom], { weather: w }), { rng: () => 0, previous: first.pieces.map(i => i.id) });
    expect(next.pieces[0].id).toBe(b.id);
    expect(next.noAlternative).toBe(false);
  });

  it('finds the other base (one-piece ↔ top + bottom) when random picks keep repeating', () => {
    const top = item('top');
    const bottom = item('bottom');
    const dress = item('onepiece');
    const w = weather(30, 28);
    const input = base([top, bottom, dress], { weather: w });
    const next = suggestOutfit(input, { rng: () => 0, previous: [top.id, bottom.id] });
    expect(next.pieces.map(i => i.id)).toEqual([dress.id]);
  });

  it('toggles optional outerwear when that is the only other choice', () => {
    const top = item('top');
    const bottom = item('bottom');
    const jacket = item('outerwear');
    const input = base([top, bottom, jacket], { weather: weather(26, 21) });
    // rng 0 → 一定加外套；上一套就是有外套的 → 找不同的就只能拿掉外套
    const next = suggestOutfit(input, { rng: () => 0, previous: [jacket.id, top.id, bottom.id] });
    expect(next.pieces.map(i => i.id)).toEqual([top.id, bottom.id]);
    expect(next.noAlternative).toBe(false);
  });

  it('says there is no alternative when only one outfit is possible', () => {
    const items = [item('top'), item('bottom')];
    const w = weather(30, 28);
    const first = suggestOutfit(base(items, { weather: w }), { rng: Math.random });
    const next = suggestOutfit(base(items, { weather: w }), { rng: Math.random, previous: first.pieces.map(i => i.id) });
    expect(next.pieces.map(i => i.id)).toEqual(first.pieces.map(i => i.id));
    expect(next.noAlternative).toBe(true);
  });

  it('flags rain at 60% or more', () => {
    const items = [item('top'), item('bottom')];
    expect(suggestOutfit(base(items, { weather: weather(30, 28, { pop: 60 }) })).rainy).toBe(true);
    expect(suggestOutfit(base(items, { weather: weather(30, 28, { pop: 50 }) })).rainy).toBe(false);
  });
});

describe('suggestionLayout', () => {
  it('places every piece inside the canvas, by category, with distinct z', () => {
    const items = [item('outerwear'), item('top'), item('bottom'), item('shoes'), item('bag'), item('accessory')];
    const layout = suggestionLayout(items);
    expect(layout.map(p => p.itemId)).toEqual(items.map(i => i.id));
    for (const p of layout) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(CANVAS_HEIGHT_RATIO);
      expect(p.rotation).toBe(0);
    }
    expect(new Set(layout.map(p => p.z)).size).toBe(items.length);
    const y = (c: Category) => layout[items.findIndex(i => i.category === c)].y;
    expect(y('top')).toBeLessThan(y('bottom'));
    expect(y('bottom')).toBeLessThan(y('shoes'));
  });
});

describe('describeSuggestion', () => {
  const top = item('top', { name: '白色短袖' });
  const bottom = item('bottom', { name: '牛仔褲' });
  const jacket = item('outerwear', { name: '' });
  const shoes = item('shoes');

  const vibeOf = (line: string, prefix: string) => line.slice(prefix.length, -1);

  it('第一句寫穿搭和風格，第二句體感與降雨，第三句溫度和穿搭合不合適', () => {
    const r = suggestOutfit(
      { items: [top, bottom, jacket, shoes], weather: weather(29, 19, { pop: 70 }), occasion: 'travel' },
      { rng: () => 0 },
    );
    const lines = describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: 'travel' });
    expect(lines).toHaveLength(3);
    const [line1, line2, line3] = lines;
    // 外套（沒填名稱用分類名）內搭上衣，配上下著；牛仔褲看得出是休閒風
    expect(line1.startsWith('外套內搭白色短袖，配上牛仔褲，')).toBe(true);
    expect(['休閒風，輕鬆自在', '休閒風，隨性有型', '休閒風，清爽好活動']).toContain(vibeOf(line1, '外套內搭白色短袖，配上牛仔褲，'));
    expect(line2).toBe('今天體感 19–29°，降雨機率 70%。');
    expect(line3).toBe('早晚偏涼、中午偏暖，這套有外套方便穿脫。容易下雨，記得帶傘。');
  });

  it('同一套穿搭每次的風格形容都一樣', () => {
    const r = suggestOutfit({ items: [top, bottom], weather: weather(25, 21), occasion: null }, { rng: () => 0 });
    const a = describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })[0];
    expect(describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })[0]).toBe(a);
    expect(['休閒風，輕鬆自在', '休閒風，隨性有型', '休閒風，清爽好活動']).toContain(vibeOf(a, '白色短袖搭配牛仔褲，'));
  });

  it('看不出配色和風格時，用場合的形容', () => {
    const plain = [item('top', { name: '上衣' }), item('bottom', { name: '褲子' })];
    const r = suggestOutfit({ items: plain, weather: weather(25, 21), occasion: null }, { rng: () => 0 });
    const line1 = describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })[0];
    expect(['知性溫柔', '簡約大方', '清爽自在', '溫柔有氣質', '俐落有型']).toContain(vibeOf(line1, '上衣搭配褲子，'));
  });

  it('說明配色與風格', () => {
    const blouse = item('top', { name: '白襯衫', color: 'white', style: 'feminine' });
    const skirt = item('bottom', { name: '卡其長裙', color: 'khaki', style: 'feminine' });
    const r = suggestOutfit({ items: [blouse, skirt], weather: weather(25, 21), occasion: null }, { rng: () => 0 });
    const line1 = describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })[0];
    // 白＋卡其不是同一個色系，寫出兩個顏色
    expect(line1).toMatch(/^白襯衫搭配卡其長裙，白色＋卡其色，簡約低調；淑女風，.+。$/);
    const en = describeSuggestion(r, { language: 'en', day: 'today', occasion: null })[0];
    expect(en).toContain('white + khaki, simple and understated');
  });

  it('同色系、點綴色會說出顏色', () => {
    const r = (top: ColorTag, bottom: ColorTag) =>
      describeSuggestion(
        suggestOutfit({ items: [item('top', { name: 'A', color: top }), item('bottom', { name: 'B', color: bottom })], weather: weather(25, 21), occasion: null }, { rng: () => 0 }),
        { language: 'zh-TW', day: 'today', occasion: null },
      )[0];
    expect(r('navy', 'blue')).toContain('深藍色系同色搭配');
    expect(r('red', 'white')).toContain('紅色＋白色，用紅色點亮整體');
    expect(r('black', 'gray')).toContain('黑白灰色系');
    expect(r('beige', 'brown')).toContain('大地色系');
    // 上下身不同色系：不寫大地色系，寫「某色＋某色」
    expect(r('gray', 'beige')).toContain('灰色＋杏色，簡約低調');
    expect(r('gray', 'beige')).not.toContain('色系');
  });

  it('有一件衣服不知道顏色時，不說全身同色系', () => {
    const r = suggestOutfit(
      { items: [item('top', { name: 'A', color: 'beige' }), item('bottom', { name: 'B' }), item('outerwear', { name: 'C', color: 'brown' })], weather: weather(16, 14), occasion: null },
      { rng: () => 0 },
    );
    const line1 = describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })[0];
    expect(line1).toContain('咖啡色＋杏色');
    expect(line1).not.toContain('大地色系');
  });

  it('describes a one-piece and hot weather', () => {
    const dress = item('onepiece', { name: '洋裝' });
    const r = suggestOutfit({ items: [dress], weather: weather(33, 28), occasion: null }, { rng: () => 0 });
    const [line1, line2, line3] = describeSuggestion(r, { language: 'zh-TW', day: 'tomorrow', occasion: null });
    expect(line1).toMatch(/^洋裝一件完成造型，.+。$/);
    expect(line2).toBe('明天體感 28–33°，降雨機率未知。');
    expect(line3).toBe('天氣炎熱，這套輕薄透氣，穿起來清爽。');
  });

  it('天氣偏涼卻沒有外套時，提醒加外套', () => {
    const r = suggestOutfit({ items: [top, bottom], weather: weather(16, 14, { pop: 20 }), occasion: null }, { rng: () => 0 });
    expect(describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })[2]).toBe('天氣偏涼，記得再加一件外套。');
  });

  it('says when there is no weather data', () => {
    const r = suggestOutfit({ items: [top, bottom], weather: null, occasion: null }, { rng: () => 0 });
    expect(describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })[1]).toBe(
      '目前沒有這天的天氣資料，這套只依場合挑選。',
    );
  });

  it('works in English and Japanese', () => {
    const r = suggestOutfit({ items: [top, bottom], weather: weather(16, 14, { maxT: 18 }), occasion: null }, { rng: () => 0 });
    const en = describeSuggestion(r, { language: 'en', day: 'today', occasion: null });
    const ja = describeSuggestion(r, { language: 'ja', day: 'today', occasion: null });
    expect(en).toHaveLength(3);
    expect(ja).toHaveLength(3);
    expect(en[1]).toContain('14–16°');
    expect(ja[1]).toContain('14–16°');
  });

  it('returns nothing for an empty suggestion', () => {
    const r = suggestOutfit({ items: [], weather: null, occasion: null });
    expect(describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })).toEqual([]);
  });
});

describe('presetPieces', () => {
  it('lays out the given ids that are still in the closet, in suggestion order', () => {
    const top = item('top');
    const shoes = item('shoes');
    const jacket = item('outerwear');
    const pieces = presetPieces(`${top.id},missing,${shoes.id},${jacket.id},${top.id}`, [shoes, top, jacket]);
    expect(pieces.map(p => p.item.id)).toEqual([top.id, shoes.id, jacket.id]);
    // 外套在最後面
    expect(pieces.map(p => p.z)).toEqual([1, 2, 0]);
    expect(pieces.map(p => p.y)).toEqual(suggestionLayout([top, shoes, jacket]).map(p => p.y));
  });
  it('is empty without ids', () => {
    expect(presetPieces(undefined, [item('top')])).toEqual([]);
    expect(presetPieces('', [item('top')])).toEqual([]);
  });
});

describe('配色與風格', () => {
  // 固定種子的亂數，讓候選有變化又能重現
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const tops = (...colors: ColorTag[]) => colors.map(c => item('top', { name: `${c}上衣`, color: c }));

  it('lookOf 判斷配色', () => {
    const look = (...colors: ColorTag[]) => lookOf(colors.map(c => item('top', { color: c })), i => i.color ?? null);
    expect(look('navy', 'blue').scheme).toBe('tonal');
    expect(look('navy', 'blue').schemeColor).toBe('navy');
    expect(look('black', 'white', 'gray').scheme).toBe('mono');
    expect(look('beige', 'brown', 'white').scheme).toBe('earth');
    expect(look('red', 'white').scheme).toBe('accent');
    expect(look('red', 'green').scheme).toBe('clash');
    expect(look('red').scheme).toBe('unknown');
    // 包包、鞋子不算在配色裡
    expect(lookOf([item('top', { color: 'red' }), item('bag', { color: 'green' })], i => i.color ?? null).scheme).toBe('unknown');
  });

  it('避開撞色，優先同色系', () => {
    const jeans = item('bottom', { name: '褲子', color: 'blue' });
    for (let seed = 1; seed <= 20; seed++) {
      const r = suggestOutfit({ items: [...tops('red', 'green', 'navy'), jeans], weather: null, occasion: null }, { rng: seeded(seed) });
      expect(r.pieces.find(p => p.category === 'top')!.color).toBe('navy');
      expect(r.look.scheme).toBe('tonal');
    }
  });

  it('風格要一致：淑女上衣配裙子，不配運動褲', () => {
    const lace = item('top', { name: '蕾絲上衣' });
    const skirt = item('bottom', { name: '百褶裙' });
    const jogger = item('bottom', { name: '運動褲', style: 'casual' });
    for (let seed = 1; seed <= 20; seed++) {
      const r = suggestOutfit({ items: [lace, skirt, jogger], weather: null, occasion: null }, { rng: seeded(seed) });
      expect(r.pieces.map(p => p.id)).toEqual([lace.id, skirt.id]);
      expect(r.look.style).toBe('feminine');
    }
  });

  it('約會偏好淑女風、休閒場合偏好休閒風', () => {
    const items = [
      item('onepiece', { name: '碎花洋裝' }),
      item('top', { name: 'T恤' }), item('bottom', { name: '牛仔褲' }),
    ];
    for (let seed = 1; seed <= 10; seed++) {
      expect(suggestOutfit({ items, weather: null, occasion: 'date' }, { rng: seeded(seed) }).look.style).toBe('feminine');
      expect(suggestOutfit({ items, weather: null, occasion: 'casual' }, { rng: seeded(seed) }).look.style).toBe('casual');
    }
  });

  it('沒手動設定顏色時用照片判斷的顏色（colorOf）', () => {
    const [a, b] = [item('top', { name: 'A' }), item('top', { name: 'B' })];
    const bottom = item('bottom', { name: 'C' });
    const photo: Record<string, ColorTag> = { [a.id]: 'green', [b.id]: 'white', [bottom.id]: 'black' };
    for (let seed = 1; seed <= 10; seed++) {
      const r = suggestOutfit({ items: [a, b, bottom], weather: null, occasion: null, colorOf: i => photo[i.id] }, { rng: seeded(seed) });
      expect(r.look.scheme).toBe('mono');
    }
  });

  it('「更新」一定換成不同組合，而且還是挑配色好的', () => {
    const items = [...tops('white', 'black', 'gray', 'red'), item('bottom', { name: '黑褲', color: 'black' })];
    const first = suggestOutfit({ items, weather: null, occasion: null }, { rng: seeded(3) });
    const next = suggestOutfit({ items, weather: null, occasion: null }, { rng: seeded(4), previous: first.pieces.map(p => p.id) });
    expect(next.pieces.map(p => p.id)).not.toEqual(first.pieces.map(p => p.id));
    expect(next.noAlternative).toBe(false);
  });
});

describe('內著與外搭', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const cats = (r: { pieces: Item[] }) => r.pieces.map(p => p.category);

  it('用到內著時一定搭外套，即使天氣熱到不需要外套', () => {
    const items = [item('inner', { name: '細肩帶' }), item('bottom'), item('outerwear', { name: '薄襯衫外套' })];
    for (const w of [weather(33, 28), weather(25, 21), null]) {
      for (let seed = 1; seed <= 10; seed++) {
        const r = suggestOutfit({ items, weather: w, occasion: null }, { rng: seeded(seed) });
        expect(cats(r)).toEqual(expect.arrayContaining(['inner', 'outerwear']));
      }
    }
  });

  it('沒有外套可搭時不會推薦內著單穿', () => {
    const r = suggestOutfit({ items: [item('inner'), item('bottom')], weather: weather(25, 21), occasion: null }, { rng: () => 0 });
    expect(r.status).toBe('empty');
    expect(r.emptyReason?.need).toEqual(['top']);
  });

  it('炎熱時有一般上衣就用上衣，不用內著＋外套', () => {
    const items = [item('top', { name: 'T恤' }), item('inner'), item('bottom'), item('outerwear')];
    for (let seed = 1; seed <= 20; seed++) {
      const r = suggestOutfit({ items, weather: weather(33, 28), occasion: null }, { rng: seeded(seed) });
      expect(cats(r)).not.toContain('inner');
    }
  });

  it('外搭只會疊在一般上衣外面：不會單穿、不會配連身或內著', () => {
    const vest = item('overlay', { name: '針織背心' });
    const items = [item('top', { name: '白T' }), item('inner'), item('onepiece'), item('bottom'), item('outerwear'), vest];
    let withVest = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = suggestOutfit({ items, weather: weather(22, 18), occasion: null }, { rng: seeded(seed) });
      const c = cats(r);
      if (c.includes('overlay')) {
        withVest++;
        expect(c).toContain('top');
        expect(c).not.toContain('onepiece');
        expect(c).not.toContain('inner');
      }
    }
    expect(withVest).toBeGreaterThan(0);
    // 只有外搭、沒有上衣：湊不成一套
    expect(suggestOutfit({ items: [vest, item('bottom')], weather: null, occasion: null }).status).toBe('empty');
  });

  it('「更新」換組合時也遵守內著、外搭的規則', () => {
    const items = [item('inner', { name: 'A' }), item('top', { name: 'B' }), item('bottom'), item('outerwear'), item('overlay')];
    let prev: string[] = [];
    for (let i = 0; i < 15; i++) {
      const r = suggestOutfit({ items, weather: weather(22, 18), occasion: null }, { rng: seeded(i + 1), previous: prev });
      const c = cats(r);
      if (c.includes('inner')) expect(c).toContain('outerwear');
      if (c.includes('overlay')) expect(c).toContain('top');
      prev = r.pieces.map(p => p.id);
    }
  });

  it('說明寫成「上衣外搭背心」', () => {
    const r = suggestOutfit(
      { items: [item('top', { name: '白T' }), item('overlay', { name: '針織背心' }), item('bottom', { name: '長裙' })], weather: weather(25, 21), occasion: null },
      { rng: () => 0 },
    );
    expect(describeSuggestion(r, { language: 'zh-TW', day: 'today', occasion: null })[0]).toMatch(/^白T外搭針織背心搭配長裙，/);
  });

  it('排版時外搭疊在上衣上面', () => {
    const top = item('top');
    const vest = item('overlay');
    const [t, v] = suggestionLayout([top, vest]);
    expect(v.z).toBeGreaterThan(t.z);
  });
});

describe('細肩帶與風格混搭', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const cats = (r: { pieces: Item[] }) => r.pieces.map(p => p.category);

  it('needsOuterwear：內著和細肩帶、吊帶的上衣／洋裝', () => {
    expect(needsOuterwear(item('inner'))).toBe(true);
    expect(needsOuterwear(item('onepiece', { name: '細肩帶洋裝' }))).toBe(true);
    expect(needsOuterwear(item('top', { name: '吊帶上衣' }))).toBe(true);
    expect(needsOuterwear(item('onepiece', { name: '短袖洋裝' }))).toBe(false);
    expect(needsOuterwear(item('bottom', { name: '吊帶褲' }))).toBe(false);
  });

  it('細肩帶洋裝一定搭外套，夏天也一樣（短袖外套可以）', () => {
    const items = [item('onepiece', { name: '細肩帶洋裝' }), item('outerwear', { name: '短袖外套', seasons: ['summer'] })];
    for (const w of [weather(33, 28), weather(25, 21), null]) {
      for (let seed = 1; seed <= 10; seed++) {
        expect(cats(suggestOutfit({ items, weather: w, occasion: null }, { rng: seeded(seed) }))).toEqual(['outerwear', 'onepiece']);
      }
    }
  });

  it('沒有外套時不推薦細肩帶洋裝', () => {
    const plain = item('onepiece', { name: '短袖洋裝' });
    const strappy = item('onepiece', { name: '細肩帶洋裝' });
    for (let seed = 1; seed <= 10; seed++) {
      expect(suggestOutfit({ items: [plain, strappy], weather: weather(33, 28), occasion: null }, { rng: seeded(seed) }).pieces.map(p => p.id)).toEqual([plain.id]);
    }
    expect(suggestOutfit({ items: [strappy], weather: weather(33, 28), occasion: null }).status).toBe('empty');
  });

  it('淑女風和休閒風不混搭，即使配色比較好', () => {
    const tee = item('top', { name: 'T恤', color: 'white' });
    // 蕾絲＋紅裙撞色、T恤＋紅裙配色較好，但 T恤配裙子是休閒混淑女
    const lace = item('top', { name: '蕾絲上衣', color: 'green' });
    const skirt = item('bottom', { name: '長裙', color: 'red' });
    for (let seed = 1; seed <= 20; seed++) {
      const r = suggestOutfit({ items: [tee, lace, skirt], weather: null, occasion: null }, { rng: seeded(seed) });
      expect(r.pieces.map(p => p.id)).toEqual([lace.id, skirt.id]);
    }
  });

  it('「可休閒可淑女」的單品兩種風格都能搭', () => {
    const cardigan = item('outerwear', { name: '開襟外套', style: 'both' });
    const dress = item('onepiece', { name: '碎花洋裝' });
    const tee = item('top', { name: 'T恤' });
    const jeans = item('bottom', { name: '牛仔褲' });
    // 天氣涼一定要外套，只有這件「可休閒可淑女」的外套：配洋裝、配T恤牛仔褲都算風格一致
    for (let seed = 1; seed <= 10; seed++) {
      const look = (o: Occasion) => {
        const r = suggestOutfit({ items: [cardigan, dress, tee, jeans], weather: weather(16, 14), occasion: o }, { rng: seeded(seed) });
        expect(r.pieces[0].id).toBe(cardigan.id);
        return r.look.style;
      };
      expect(look('date')).toBe('feminine');
      expect(look('casual')).toBe('casual');
    }
  });
});
