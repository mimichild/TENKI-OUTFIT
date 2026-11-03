import type { Category, Item, Occasion, OutfitItemPlacement, OutfitPiece, Season } from '@/types/models';

/**
 * 穿搭建議引擎（純邏輯）。
 * - 溫度：最高／最低體感的平均分段；缺體感時改用氣溫
 * - 單品沒有厚薄資料，用季節代表厚薄；沒填季節 = 四季、沒填場合 = 全場合
 * - 組合：上衣＋下著 或 連身 ＋ 外套（依溫度）＋ 鞋子；包包、配件有就各配一件；「其他」不推薦
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

type Slot = 'outerwear' | 'top' | 'bottom' | 'onepiece' | 'shoes' | 'bag' | 'accessory';
const SLOT_ORDER: Slot[] = ['outerwear', 'top', 'bottom', 'onepiece', 'shoes', 'bag', 'accessory'];
type Picks = Partial<Record<Slot, Item>>;
type Pool = Record<Slot, Item[]>;

const pick = (list: Item[], rng: () => number) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

function randomPicks(pool: Pool, rule: OuterwearRule, rng: () => number): Picks | null {
  const separates = pool.top.length > 0 && pool.bottom.length > 0;
  const onepiece = pool.onepiece.length > 0;
  if (!separates && !onepiece) return null;
  const useSeparates = separates && onepiece ? rng() < 0.5 : separates;
  const picks: Picks = {};
  if (useSeparates) {
    picks.top = pick(pool.top, rng);
    picks.bottom = pick(pool.bottom, rng);
  } else {
    picks.onepiece = pick(pool.onepiece, rng);
  }
  if (pool.outerwear.length > 0 && (rule === 'required' || (rule === 'optional' && rng() < 0.5))) {
    picks.outerwear = pick(pool.outerwear, rng);
  }
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
  for (const slot of SLOT_ORDER) {
    const current = base[slot];
    if (!current) continue;
    for (const other of pool[slot]) if (other.id !== current.id) variants.push({ ...base, [slot]: other });
  }
  if (rule === 'optional' && pool.outerwear.length > 0) {
    if (base.outerwear) variants.push({ ...base, outerwear: undefined });
    else for (const o of pool.outerwear) variants.push({ ...base, outerwear: o });
  }
  const rest = { outerwear: base.outerwear, shoes: base.shoes, bag: base.bag, accessory: base.accessory };
  if (base.onepiece && pool.top.length > 0 && pool.bottom.length > 0) {
    for (const top of pool.top) for (const bottom of pool.bottom) variants.push({ ...rest, top, bottom });
  } else if (!base.onepiece) {
    for (const onepiece of pool.onepiece) variants.push({ ...rest, onepiece });
  }
  return variants.find(v => !sameSet(idsOf(v), previous)) ?? null;
}

const RANDOM_TRIES = 20;

export function suggestOutfit(input: SuggestionInput, options: SuggestionOptions = {}): Suggestion {
  const rng = options.rng ?? Math.random;
  const basis = weatherBasis(input.weather);
  const band = basis ? tempBand(basis.avg) : null;
  const rule = outerwearRule(basis);
  const pop = input.weather?.pop ?? null;
  const filter = { band, occasion: input.occasion };
  const pool = Object.fromEntries(SLOT_ORDER.map(s => [s, candidatesFor(input.items, s, filter)])) as Pool;

  const result = (picks: Picks | null, noAlternative = false): Suggestion => {
    const missing: Category[] = [];
    if (picks) {
      if (rule === 'required' && !picks.outerwear) missing.push('outerwear');
      if (!picks.shoes) missing.push('shoes');
    }
    return {
      status: picks ? 'ok' : 'empty',
      pieces: picks ? SLOT_ORDER.flatMap(s => (picks[s] ? [picks[s]] : [])) : [],
      missing,
      basis,
      band,
      outerwear: rule,
      rainy: pop !== null && pop >= RAIN_POP_THRESHOLD,
      pop,
      noAlternative,
    };
  };

  let picks = randomPicks(pool, rule, rng);
  const previous = options.previous;
  if (!picks || !previous || previous.length === 0 || !sameSet(idsOf(picks), previous)) return result(picks);
  for (let i = 0; i < RANDOM_TRIES; i++) {
    const next = randomPicks(pool, rule, rng);
    if (next && !sameSet(idsOf(next), previous)) return result(next);
  }
  const alt = alternativePicks(picks, pool, rule, previous);
  if (alt) return result(alt);
  return result(picks, true);
}

/** 依分類自動排版（位置以畫布寬度為單位，畫布 3:4） */
const LAYOUT: Record<Category, Omit<OutfitItemPlacement, 'itemId' | 'z' | 'rotation'>> = {
  outerwear: { x: 0.3, y: 0.42, scale: 1.1 },
  top: { x: 0.64, y: 0.36, scale: 1 },
  onepiece: { x: 0.6, y: 0.58, scale: 1.4 },
  bottom: { x: 0.62, y: 0.8, scale: 1.1 },
  shoes: { x: 0.3, y: 1.12, scale: 0.7 },
  bag: { x: 0.8, y: 1.1, scale: 0.7 },
  accessory: { x: 0.2, y: 0.13, scale: 0.5 },
  other: { x: 0.5, y: 0.67, scale: 1 },
};

export function suggestionLayout(items: Item[]): OutfitItemPlacement[] {
  return items.map((item, z) => ({ itemId: item.id, ...LAYOUT[item.category], rotation: 0, z }));
}

/** 「存成穿搭」：網址帶來的單品 id（逗號分隔）→ 已排好位置的畫布單品；找不到或重複的 id 略過 */
export function presetPieces(idsParam: string | undefined, items: Item[]): OutfitPiece[] {
  if (!idsParam) return [];
  const byId = new Map(items.map(i => [i.id, i]));
  const picked = [...new Set(idsParam.split(','))].flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
  return suggestionLayout(picked).map((p, i) => ({ ...p, item: picked[i] }));
}
