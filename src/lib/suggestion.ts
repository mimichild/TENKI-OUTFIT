import type { Category, ColorTag, Item, Occasion, OutfitItemPlacement, OutfitPiece, Season, StyleTag } from '@/types/models';
import { colorGroup, isNeutralGroup } from './itemColor';
import { inferStyle } from './itemStyle';
import { layoutOutfit, type PieceShape } from './outfitLayout';

/**
 * 穿搭建議引擎（純邏輯）。
 * - 溫度：最高／最低體感的平均分段；缺體感時改用氣溫
 * - 單品沒有厚薄資料，用季節代表厚薄；沒填季節 = 四季、沒填場合 = 全場合
 * - 組合：上衣＋下著 或 連身 ＋ 外套（依溫度）＋ 鞋子；包包、配件有就各配一件；「其他」不推薦
 * - 內著（內搭）可以當上衣，但一定要搭外套（炎熱時有一般上衣就不用內著）；
 *   外搭（例如小背心）只會疊在一般上衣外面，不單穿（2026-11-04）
 * - 配色與風格（2026-11-04）：隨機產生多組候選，依配色（同色系、黑白灰、大地色、一點亮色；撞色扣分）
 *   與風格（淑女風、休閒風是否一致、是否符合場合）評分，從接近最高分的候選中挑一組，按「更新」才有變化
 */

export type TempBand = 'hot' | 'warm' | 'cool' | 'cold';
export type OuterwearRule = 'none' | 'optional' | 'required';

export interface SuggestionWeather {
  maxAT: number | null;
  minAT: number | null;
  maxT: number | null;
  minT: number | null;
  pop: number | null;
}

export interface WeatherBasis {
  min: number;
  max: number;
  avg: number;
  kind: 'feels' | 'air';
}

export interface SuggestionInput {
  /** 可推薦的單品（不含暫存區、已封存） */
  items: Item[];
  weather: SuggestionWeather | null;
  /** null = 不限場合 */
  occasion: Occasion | null;
  /** 單品的顏色（手動設定或照片自動判斷）；沒給時只用 item.color */
  colorOf?: (item: Item) => ColorTag | null;
}

/**
 * 配色：
 * - tonal：同色系（兩件以上同一色系，其餘黑白灰／大地色）
 * - mono：黑白灰
 * - earth：大地色（可搭黑白灰）
 * - accent：一件有彩色＋其餘中性色
 * - clash：兩種以上不同色系（扣分，盡量不推薦）
 * - unknown：知道顏色的衣服不到兩件
 */
export type ColorScheme = 'tonal' | 'mono' | 'earth' | 'accent' | 'clash' | 'unknown';

export interface Look {
  scheme: ColorScheme;
  /** tonal、accent 時是哪個顏色 */
  schemeColor: ColorTag | null;
  /** 整套一致的風格；null = 看不出來或混搭 */
  style: StyleTag | null;
}

export interface SuggestionOptions {
  /** 0 ≤ rng() < 1；預設 Math.random */
  rng?: () => number;
  /** 上一套的單品 id，盡量不要重複 */
  previous?: string[];
}

export interface Suggestion {
  status: 'ok' | 'empty';
  /** 由下而上：外套、上衣、下著／連身、鞋子、包包、配件 */
  pieces: Item[];
  /** 該有卻挑不到的分類（必要的外套、鞋子） */
  missing: Category[];
  basis: WeatherBasis | null;
  band: TempBand | null;
  outerwear: OuterwearRule;
  rainy: boolean;
  pop: number | null;
  /** 有給 previous，但找不到其他組合 */
  noAlternative: boolean;
  /** status 為 empty 時：湊不成一套缺哪一類；ok 時為 null */
  emptyReason: EmptyReason | null;
  /** 配色與風格（說明文字用） */
  look: Look;
}

export type BaseCategory = 'top' | 'bottom';

export interface EmptyReason {
  /** 還差的分類（上衣、下著；有連身的話兩個都不缺） */
  need: BaseCategory[];
  /** need 之中，衣櫃裡其實有、但季節或場合不符合的分類 */
  filtered: BaseCategory[];
}

export const RAIN_POP_THRESHOLD = 60;
/** 最低溫低於這個值就一定加外套（早晚偏涼） */
const OUTERWEAR_LOW = 20;

const BAND_SEASONS: Record<TempBand, Season[]> = {
  hot: ['summer'],
  warm: ['spring', 'summer', 'autumn'],
  cool: ['spring', 'autumn', 'winter'],
  cold: ['winter'],
};

function pair(max: number | null, min: number | null): { max: number; min: number } | null {
  if (max === null && min === null) return null;
  const hi = max ?? (min as number);
  const lo = min ?? (max as number);
  return { max: Math.max(hi, lo), min: Math.min(hi, lo) };
}

export function weatherBasis(w: SuggestionWeather | null): WeatherBasis | null {
  if (!w) return null;
  // 優先順序：完整體感 → 完整氣溫 → 只有一個體感值 → 只有一個氣溫值
  type Source = { max: number | null; min: number | null; kind: WeatherBasis['kind'] };
  const feels: Source = { max: w.maxAT, min: w.minAT, kind: 'feels' };
  const air: Source = { max: w.maxT, min: w.minT, kind: 'air' };
  const complete = (s: Source) => s.max !== null && s.min !== null;
  const order = [feels, air].sort((a, b) => Number(complete(b)) - Number(complete(a)));
  for (const s of order) {
    const p = pair(s.max, s.min);
    if (p) return { ...p, avg: (p.max + p.min) / 2, kind: s.kind };
  }
  return null;
}

export function tempBand(avg: number): TempBand {
  if (avg >= 28) return 'hot';
  if (avg >= 20) return 'warm';
  if (avg >= 13) return 'cool';
  return 'cold';
}

export function outerwearRule(basis: WeatherBasis | null): OuterwearRule {
  if (!basis) return 'optional';
  const band = tempBand(basis.avg);
  if (band === 'cool' || band === 'cold' || basis.min < OUTERWEAR_LOW) return 'required';
  return band === 'hot' ? 'none' : 'optional';
}

export function candidatesFor(
  items: Item[],
  category: Category,
  filter: { band: TempBand | null; occasion: Occasion | null },
): Item[] {
  const seasons = filter.band ? BAND_SEASONS[filter.band] : null;
  return items.filter(
    i =>
      i.category === category &&
      (!seasons || i.seasons.length === 0 || i.seasons.some(s => seasons.includes(s))) &&
      (!filter.occasion || i.occasions.length === 0 || i.occasions.includes(filter.occasion)),
  );
}

/** top 這一格可能放上衣或內著 */
type Slot = 'outerwear' | 'top' | 'overlay' | 'bottom' | 'onepiece' | 'shoes' | 'bag' | 'accessory';
const SLOT_ORDER: Slot[] = ['outerwear', 'top', 'overlay', 'bottom', 'onepiece', 'shoes', 'bag', 'accessory'];
type Picks = Partial<Record<Slot, Item>>;
type Pool = Record<Slot | 'inner', Item[]>;

/** top 這一格可以放的單品：有外套可搭時內著也可以（炎熱、不需要外套時，有一般上衣就只用上衣） */
function topChoices(pool: Pool, rule: OuterwearRule): Item[] {
  if (pool.inner.length === 0 || pool.outerwear.length === 0) return pool.top;
  if (rule === 'none' && pool.top.length > 0) return pool.top;
  return [...pool.top, ...pool.inner];
}

/** 內著一定有外套；外搭一定疊在一般上衣外面 */
const isValid = (p: Picks) => (p.top?.category !== 'inner' || !!p.outerwear) && (!p.overlay || p.top?.category === 'top');

const pick = (list: Item[], rng: () => number) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

function randomPicks(pool: Pool, rule: OuterwearRule, rng: () => number): Picks | null {
  const tops = topChoices(pool, rule);
  const separates = tops.length > 0 && pool.bottom.length > 0;
  const onepiece = pool.onepiece.length > 0;
  if (!separates && !onepiece) return null;
  const useSeparates = separates && onepiece ? rng() < 0.5 : separates;
  const picks: Picks = {};
  if (useSeparates) {
    picks.top = pick(tops, rng);
    picks.bottom = pick(pool.bottom, rng);
  } else {
    picks.onepiece = pick(pool.onepiece, rng);
  }
  const innerNeedsOuter = picks.top?.category === 'inner';
  if (pool.outerwear.length > 0 && (innerNeedsOuter || rule === 'required' || (rule === 'optional' && rng() < 0.5))) {
    picks.outerwear = pick(pool.outerwear, rng);
  }
  if (picks.top?.category === 'top' && pool.overlay.length > 0 && rng() < 0.5) picks.overlay = pick(pool.overlay, rng);
  if (pool.shoes.length > 0) picks.shoes = pick(pool.shoes, rng);
  if (pool.bag.length > 0) picks.bag = pick(pool.bag, rng);
  if (pool.accessory.length > 0) picks.accessory = pick(pool.accessory, rng);
  return picks;
}

const idsOf = (picks: Picks) => SLOT_ORDER.flatMap(s => (picks[s] ? [picks[s].id] : []));
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

/** 隨機抽不到不同的組合時，逐一換掉某一格，找第一個不同的組合 */
function alternativePicks(base: Picks, pool: Pool, rule: OuterwearRule, previous: string[]): Picks | null {
  const variants: Picks[] = [];
  const tops = topChoices(pool, rule);
  for (const slot of SLOT_ORDER) {
    const current = base[slot];
    if (!current) continue;
    for (const other of slot === 'top' ? tops : pool[slot]) if (other.id !== current.id) variants.push({ ...base, [slot]: other });
  }
  if (rule === 'optional' && pool.outerwear.length > 0) {
    if (base.outerwear) variants.push({ ...base, outerwear: undefined });
    else for (const o of pool.outerwear) variants.push({ ...base, outerwear: o });
  }
  if (base.top?.category === 'top' && pool.overlay.length > 0) {
    if (base.overlay) variants.push({ ...base, overlay: undefined });
    else for (const o of pool.overlay) variants.push({ ...base, overlay: o });
  }
  const rest = { outerwear: base.outerwear ?? pool.outerwear[0], shoes: base.shoes, bag: base.bag, accessory: base.accessory };
  if (base.onepiece && tops.length > 0 && pool.bottom.length > 0) {
    for (const top of tops) for (const bottom of pool.bottom) variants.push({ ...rest, outerwear: top.category === 'inner' ? rest.outerwear : base.outerwear, top, bottom });
  } else if (!base.onepiece) {
    for (const onepiece of pool.onepiece) variants.push({ ...rest, outerwear: base.outerwear, onepiece });
  }
  return variants.filter(isValid).find(v => !sameSet(idsOf(v), previous)) ?? null;
}

const RANDOM_TRIES = 20;
/** 有顏色／風格資料時，一次產生幾組候選來評分 */
const CANDIDATES = 24;
/** 和最高分差距小於這個值的候選都可能被選中（讓「更新」有變化；差一個等級就不選） */
const NEAR_BEST = 0.5;

const CLOTHES: Category[] = ['outerwear', 'top', 'inner', 'overlay', 'bottom', 'onepiece'];

/** 整套的配色與風格 */
export function lookOf(pieces: Item[], colorOf: (item: Item) => ColorTag | null): Look {
  const clothes = pieces.filter(p => (CLOTHES as string[]).includes(p.category));
  const colors = clothes.map(colorOf).filter((c): c is ColorTag => c !== null);
  let scheme: ColorScheme = 'unknown';
  let schemeColor: ColorTag | null = null;
  if (colors.length >= 2) {
    const chromatic = colors.filter(c => !isNeutralGroup(colorGroup(c)));
    const families = new Set(chromatic.map(colorGroup));
    if (families.size >= 2) scheme = 'clash';
    else if (families.size === 1) {
      scheme = chromatic.length >= 2 ? 'tonal' : 'accent';
      schemeColor = chromatic[0];
    } else scheme = colors.some(c => colorGroup(c) === 'earth') ? 'earth' : 'mono';
  }
  const styles = styleSet(pieces);
  return { scheme, schemeColor, style: styles.size === 1 ? [...styles][0] : null };
}

/** 風格看衣服和鞋子（包包、配件不算）；沒手動設定的用名稱與場合推測 */
function styleSet(pieces: Item[]): Set<StyleTag> {
  return new Set(
    pieces
      .filter(p => p.category !== 'bag' && p.category !== 'accessory')
      .map(p => p.style ?? inferStyle(p))
      .filter((x): x is StyleTag => x !== null),
  );
}

const SCHEME_SCORE: Record<ColorScheme, number> = { tonal: 3, mono: 3, earth: 3, accent: 2.5, unknown: 1.5, clash: 0 };

/** 配色＋風格一致＋符合場合 */
function scoreLook(pieces: Item[], colorOf: (item: Item) => ColorTag | null, occasion: Occasion | null): number {
  const look = lookOf(pieces, colorOf);
  let score = SCHEME_SCORE[look.scheme];
  const styles = styleSet(pieces);
  // 風格一致加分、淑女混休閒扣分
  score += styles.size === 1 ? 2 : styles.size === 0 ? 1 : 0;
  if (occasion === 'date' || occasion === 'formal') score += look.style === 'feminine' ? 1 : 0;
  if (occasion === 'casual' || occasion === 'travel') score += look.style === 'casual' ? 1 : 0;
  if ((occasion === 'work' || occasion === 'formal') && (look.scheme === 'mono' || look.scheme === 'earth')) score += 0.5;
  return score;
}

const picked = (picks: Picks) => SLOT_ORDER.flatMap(s => (picks[s] ? [picks[s]] : []));

export function suggestOutfit(input: SuggestionInput, options: SuggestionOptions = {}): Suggestion {
  const rng = options.rng ?? Math.random;
  const basis = weatherBasis(input.weather);
  const band = basis ? tempBand(basis.avg) : null;
  const rule = outerwearRule(basis);
  const pop = input.weather?.pop ?? null;
  const filter = { band, occasion: input.occasion };
  const pool = Object.fromEntries([...SLOT_ORDER, 'inner' as const].map(s => [s, candidatesFor(input.items, s, filter)])) as Pool;
  const colorOf = input.colorOf ?? ((item: Item) => item.color ?? null);

  const emptyReason = (): EmptyReason => {
    const need = (['top', 'bottom'] as const).filter(c => (c === 'top' ? topChoices(pool, rule) : pool[c]).length === 0);
    return { need, filtered: need.filter(c => input.items.some(i => i.category === c)) };
  };

  const result = (picks: Picks | null, noAlternative = false): Suggestion => {
    const missing: Category[] = [];
    if (picks) {
      if (rule === 'required' && !picks.outerwear) missing.push('outerwear');
      if (!picks.shoes) missing.push('shoes');
    }
    const pieces = picks ? picked(picks) : [];
    return {
      status: picks ? 'ok' : 'empty',
      pieces,
      missing,
      basis,
      band,
      outerwear: rule,
      rainy: pop !== null && pop >= RAIN_POP_THRESHOLD,
      pop,
      noAlternative,
      emptyReason: picks ? null : emptyReason(),
      look: lookOf(pieces, colorOf),
    };
  };

  const previous = options.previous ?? [];
  const isPrevious = (p: Picks) => previous.length > 0 && sameSet(idsOf(p), previous);

  // 衣櫃裡有顏色或風格資料：產生多組候選評分
  const informative = SLOT_ORDER.some(s => pool[s].some(i => colorOf(i) !== null || (i.style ?? inferStyle(i)) !== null));
  if (informative) {
    const candidates: { picks: Picks; score: number }[] = [];
    let first: Picks | null = null;
    for (let i = 0; i < CANDIDATES; i++) {
      const p = randomPicks(pool, rule, rng);
      if (!p) return result(null);
      first ??= p;
      if (isPrevious(p) || candidates.some(c => sameSet(idsOf(c.picks), idsOf(p)))) continue;
      candidates.push({ picks: p, score: scoreLook(picked(p), colorOf, input.occasion) });
    }
    if (candidates.length > 0) {
      const best = Math.max(...candidates.map(c => c.score));
      const near = candidates.filter(c => c.score > best - NEAR_BEST);
      return result(near[Math.min(near.length - 1, Math.floor(rng() * near.length))].picks);
    }
    const alt = first && alternativePicks(first, pool, rule, previous);
    return alt ? result(alt) : result(first, true);
  }

  // 沒有任何顏色、風格資料：照舊隨機挑
  let picks = randomPicks(pool, rule, rng);
  if (!picks || !isPrevious(picks)) return result(picks);
  for (let i = 0; i < RANDOM_TRIES; i++) {
    const next = randomPicks(pool, rule, rng);
    if (next && !sameSet(idsOf(next), previous)) return result(next);
  }
  const alt = alternativePicks(picks, pool, rule, previous);
  if (alt) return result(alt);
  return result(picks, true);
}

/** 自動排版（「穿在身上」的疊法，見 outfitLayout.ts）；shapes 是量到的照片範圍，沒量到就用整張照片 */
export function suggestionLayout(items: Item[], shapes: ReadonlyMap<string, PieceShape | null> = new Map()): OutfitItemPlacement[] {
  return layoutOutfit(items, shapes);
}

/** 「存成穿搭」：網址帶來的單品 id（逗號分隔）→ 已排好位置的畫布單品；找不到或重複的 id 略過 */
export function presetPieces(
  idsParam: string | undefined,
  items: Item[],
  shapes: ReadonlyMap<string, PieceShape | null> = new Map(),
): OutfitPiece[] {
  if (!idsParam) return [];
  const byId = new Map(items.map(i => [i.id, i]));
  const picked = [...new Set(idsParam.split(','))].flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
  return suggestionLayout(picked, shapes).map((p, i) => ({ ...p, item: picked[i] }));
}
