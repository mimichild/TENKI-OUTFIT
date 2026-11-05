import type { Category, ColorTag, Item, Occasion, OutfitItemPlacement, OutfitPiece, Season, StyleTag } from '@/types/models';
import { colorGroup, isNeutralGroup, type ColorGroup } from './itemColor';
import { inferStyle } from './itemStyle';
import { layoutOutfit, type PieceShape } from './outfitLayout';

/**
 * 穿搭建議引擎（純邏輯）。
 * - 溫度：最高／最低體感的平均分段；缺體感時改用氣溫
 * - 單品沒有厚薄資料，用季節代表厚薄；沒填季節 = 四季、沒填場合 = 全場合
 * - 組合：上衣＋下著 或 連身 ＋ 外套（依溫度）＋ 鞋子；包包有就配一件；配件、「其他」不推薦（2026-11-05 起不放配件）
 * - 內著（內搭）可以當上衣，但一定要搭外套（炎熱時有一般上衣就不用內著）；
 *   外搭（例如小背心）只會疊在一般上衣外面，不單穿（2026-11-04）
 * - 細肩帶／吊帶的上衣、洋裝和內著一樣一定要搭外套（夏天搭短袖外套也可以）（2026-11-05）
 * - 淑女風和休閒風的單品不混搭（2026-11-05）：先看風格、再看場合——只從符合場合的單品裡，挑同風格或
 *   「可休閒可淑女」的單品湊一套，不只是評分扣分；真的湊不出一套才退而求其次。
 *   風格沒手動設定時先用名稱推測，名稱看不出來再用場合推測
 * - 包包（2026-11-05）：先挑同風格的；沒有同風格的包包，改挑場合相近的（選了場合 = 那個場合；
 *   不限場合 = 和這套衣服的場合相同）
 * - 包包和鞋子同色系（2026-11-05）：有同色系的鞋子＋包包就配同色系；配不出同色系時，鞋子改成和下著（連身）同色系
 * - 缺少符合天氣／場合的單品時，用次之的單品湊成一套，並在說明裡註明是系統補上的（2026-11-05）：
 *   先找場合符合的、其次天氣符合的、最後任何一件；只補上衣、下著、連身、內著（湊不出基本一套時）、
 *   一定要穿的外套、鞋子
 * - 長裙、長洋裝、長褲不搭長靴（短靴、一般鞋子可以）（2026-11-05）
 * - 按「更新」時盡量用不同的單品：最近幾套出現過的單品扣分（衣服扣比較多）（2026-11-05）
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
  /** 整套一致的風格；null = 看不出來或混搭（「可休閒可淑女」的單品不影響） */
  style: Exclude<StyleTag, 'both'> | null;
  /** 衣服的顏色（不重複，依單品順序） */
  colors: ColorTag[];
  /** 每件衣服都知道顏色、而且全身同一個色系時是哪個色系（說明文字才寫「大地色系」等） */
  family: ColorGroup | null;
}

export interface SuggestionOptions {
  /** 0 ≤ rng() < 1；預設 Math.random */
  rng?: () => number;
  /** 上一套的單品 id，盡量不要重複 */
  previous?: string[];
  /**
   * 最近幾套建議的單品 id（最新的在前面，通常第一套就是 previous）。
   * 按「更新」時盡量換不同的單品：最近用過的單品扣分，越近扣越多
   */
  recent?: string[][];
}

export interface Suggestion {
  status: 'ok' | 'empty';
  /** 由下而上：外套、上衣、下著／連身、鞋子、包包 */
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
  /** 沒有完全符合天氣／場合、由系統補上的單品 */
  filled: FilledPiece[];
}

export type BaseCategory = 'top' | 'bottom';

export interface EmptyReason {
  /** 還差的分類（上衣、下著；有連身的話兩個都不缺） */
  need: BaseCategory[];
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

const fitsSeason = (i: Item, band: TempBand | null) =>
  !band || i.seasons.length === 0 || i.seasons.some(s => BAND_SEASONS[band].includes(s));
const fitsOccasion = (i: Item, occasion: Occasion | null) => !occasion || i.occasions.length === 0 || i.occasions.includes(occasion);

/** 系統補上的單品：哪一件、不符合什麼 */
export interface FilledPiece {
  itemId: string;
  category: Category;
  /** occasion：場合不符合；weather：季節（天氣）不符合；both：都不符合 */
  reason: 'occasion' | 'weather' | 'both';
}

/** 沒有完全符合的單品時，次之的候選：場合符合 → 天氣符合 → 任何一件 */
function fallbackFor(items: Item[], category: Category, filter: { band: TempBand | null; occasion: Occasion | null }): Item[] {
  const all = items.filter(i => i.category === category);
  const byOccasion = all.filter(i => fitsOccasion(i, filter.occasion));
  if (byOccasion.length > 0) return byOccasion;
  const bySeason = all.filter(i => fitsSeason(i, filter.band));
  return bySeason.length > 0 ? bySeason : all;
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
type Slot = 'outerwear' | 'top' | 'overlay' | 'bottom' | 'onepiece' | 'shoes' | 'bag';
const SLOT_ORDER: Slot[] = ['outerwear', 'top', 'overlay', 'bottom', 'onepiece', 'shoes', 'bag'];
type Picks = Partial<Record<Slot, Item>>;
/** shoesAlt：符合的鞋子都是長靴、又穿長裙或長褲時，改用的次之鞋子（不是長靴） */
type Pool = Record<Slot | 'inner' | 'shoesAlt', Item[]>;

const STRAPPY_WORDS = ['細肩帶', '吊帶', '肩帶', 'camisole', 'cami', 'spaghetti', 'キャミ'];

/** 不能單穿、一定要搭外套：內著，以及名稱有「細肩帶」「吊帶」的上衣、洋裝 */
export function needsOuterwear(item: Pick<Item, 'category' | 'name'>): boolean {
  if (item.category === 'inner') return true;
  if (item.category !== 'top' && item.category !== 'onepiece') return false;
  const name = item.name.toLowerCase();
  return STRAPPY_WORDS.some(w => name.includes(w));
}

/** top 這一格可以放的單品：有外套可搭時內著、細肩帶也可以（炎熱、不需要外套時，有一般上衣就只用上衣） */
function topChoices(pool: Pool, rule: OuterwearRule): Item[] {
  const plain = pool.top.filter(i => !needsOuterwear(i));
  const needy = [...pool.top.filter(needsOuterwear), ...pool.inner];
  if (needy.length === 0 || pool.outerwear.length === 0) return plain;
  if (rule === 'none' && plain.length > 0) return plain;
  return [...plain, ...needy];
}

/** 連身：細肩帶洋裝要有外套可搭才推薦 */
const onepieceChoices = (pool: Pool) => (pool.outerwear.length > 0 ? pool.onepiece : pool.onepiece.filter(i => !needsOuterwear(i)));

const needsOuter = (p: Picks) => (!!p.top && needsOuterwear(p.top)) || (!!p.onepiece && needsOuterwear(p.onepiece));

/** 內著、細肩帶一定有外套；外搭一定疊在一般上衣外面 */
const LONG_WORDS = ['長裙', '長洋裝', '長版洋裝', '長版裙', '長紗裙', 'maxi', 'long skirt', 'long dress', 'ロングスカート', 'ロングワンピース'];
const LONG_PANTS_WORDS = ['長褲', '寬褲', '寬管褲', '闊腿褲', '喇叭褲', '直筒褲', '西裝褲', 'trousers', 'wide-leg', 'wide leg', 'ロングパンツ', 'ワイドパンツ'];
const TALL_BOOT_WORDS = ['長靴', '長筒靴', '高筒靴', '過膝靴', '膝上靴', 'long boots', 'knee boots', 'knee-high', 'over-the-knee', 'ロングブーツ', 'ニーハイ'];
const nameHas = (item: Item, words: string[]) => {
  const name = item.name.toLowerCase();
  return words.some(w => name.includes(w.toLowerCase()));
};

/** 不搭長靴的長下身：長裙、長洋裝（「中長裙」不算）、長褲（名稱判斷） */
export function isLongBottom(item: Item): boolean {
  if (item.category !== 'bottom' && item.category !== 'onepiece') return false;
  if (nameHas(item, LONG_WORDS) && !item.name.includes('中長')) return true;
  return item.category === 'bottom' && nameHas(item, LONG_PANTS_WORDS);
}

/** 長靴（短靴、一般鞋子不算） */
export function isTallBoots(item: Item): boolean {
  return item.category === 'shoes' && nameHas(item, TALL_BOOT_WORDS);
}

/** 這套可以穿的鞋子：長裙、長洋裝、長褲不搭長靴（短靴、一般鞋子可以） */
const shoeChoices = (p: Picks, shoes: Item[]) =>
  [p.bottom, p.onepiece].some(i => i && isLongBottom(i)) ? shoes.filter(s => !isTallBoots(s)) : shoes;

/** 內著、細肩帶一定有外套；外搭一定疊在一般上衣外面；長裙、長褲不搭長靴 */
const isValid = (p: Picks) =>
  (!needsOuter(p) || !!p.outerwear) && (!p.overlay || p.top?.category === 'top') && (!p.shoes || shoeChoices(p, [p.shoes]).length > 0);

const pick = (list: Item[], rng: () => number) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

type ColorOf = (item: Item) => ColorTag | null;

const groupOf = (i: Item, colorOf: ColorOf): ColorGroup | null => {
  const c = colorOf(i);
  return c ? colorGroup(c) : null;
};

/** 同色系；不知道顏色的看不出來，當作可以搭 */
const sameGroup = (a: Item, b: Item, colorOf: ColorOf) => {
  const [x, y] = [groupOf(a, colorOf), groupOf(b, colorOf)];
  return x === null || y === null || x === y;
};

/** 包包和鞋子是不同色系 */
const bagClash = (p: Picks, colorOf: ColorOf) => !!p.bag && !!p.shoes && !sameGroup(p.bag, p.shoes, colorOf);

/** 這套衣服的場合（包包沒有同風格時，挑場合相近的用）：選了場合就是那個場合，否則是衣服勾的場合 */
function outfitOccasions(p: Picks, occasion: Occasion | null): Occasion[] {
  if (occasion) return [occasion];
  return [...new Set(CLOTHES_SLOTS.flatMap(s => p[s]?.occasions ?? []))];
}
const CLOTHES_SLOTS: Slot[] = ['outerwear', 'top', 'overlay', 'bottom', 'onepiece'];

/** 可以配的包包：同風格（或「可休閒可淑女」）的；沒有就挑場合相近的 */
function bagsFor(bags: Item[], style: OneStyle | null, p: Picks, occasion: Occasion | null): Item[] {
  const styled = style ? bags.filter(b => { const s = styleOf(b); return s === null || s === style; }) : bags;
  if (styled.length > 0) return styled;
  const target = outfitOccasions(p, occasion);
  return bags.filter(b => b.occasions.length === 0 || b.occasions.some(o => target.includes(o)));
}

/**
 * 隨機湊一套。strict：一件件挑的時候只挑和已選單品同風格（或「可休閒可淑女」）的，
 * 必要的單品挑不到同風格的就回傳 null（重抽）；不 strict 時不管風格（湊不出風格一致的才用）
 */
function randomPicks(
  pool: Pool,
  rule: OuterwearRule,
  rng: () => number,
  colorOf: ColorOf,
  occasion: Occasion | null,
  strict = false,
): Picks | null {
  const tops = topChoices(pool, rule);
  const separates = tops.length > 0 && pool.bottom.length > 0;
  const onepieces = onepieceChoices(pool);
  const onepiece = onepieces.length > 0;
  if (!separates && !onepiece) return null;
  let style: OneStyle | null = null;
  const fit = (list: Item[]) => (strict && style ? list.filter(i => { const s = styleOf(i); return s === null || s === style; }) : list);
  const take = (list: Item[]) => {
    const it = pick(list, rng);
    style ??= styleOf(it);
    return it;
  };
  const useSeparates = separates && onepiece ? rng() < 0.5 : separates;
  const picks: Picks = {};
  if (useSeparates) {
    picks.top = take(tops);
    const bottoms = fit(pool.bottom);
    if (bottoms.length === 0) return null;
    picks.bottom = take(bottoms);
  } else {
    picks.onepiece = take(onepieces);
  }
  if (pool.outerwear.length > 0 && (needsOuter(picks) || rule === 'required' || (rule === 'optional' && rng() < 0.5))) {
    const outers = fit(pool.outerwear);
    if (outers.length > 0) picks.outerwear = take(outers);
    else if (needsOuter(picks) || rule === 'required') return null;
  }
  if (picks.top?.category === 'top' && pool.overlay.length > 0 && rng() < 0.5) {
    const overlays = fit(pool.overlay);
    if (overlays.length > 0) picks.overlay = take(overlays);
  }
  let shoes = fit(shoeChoices(picks, pool.shoes));
  if (shoes.length === 0 && pool.shoes.length > 0 && shoeChoices(picks, pool.shoes).length === 0) shoes = fit(pool.shoesAlt);
  if (shoes.length === 0 && strict && pool.shoes.length > 0) return null;
  // 鞋子＋包包盡量同色系；配不出同色系時，鞋子和下著（連身）同色系
  const bagsWith = (s: Item | undefined) => bagsFor(pool.bag, style ?? (s ? styleOf(s) : null), picks, occasion);
  if (shoes.length > 0) {
    const paired = shoes.filter(s => bagsWith(s).some(b => sameGroup(s, b, colorOf)));
    const base = picks.bottom ?? picks.onepiece;
    const likeBase = base ? shoes.filter(s => sameGroup(s, base, colorOf)) : [];
    picks.shoes = take(paired.length > 0 ? paired : likeBase.length > 0 ? likeBase : shoes);
  }
  const bags = bagsWith(picks.shoes);
  const sameBags = picks.shoes ? bags.filter(b => sameGroup(b, picks.shoes!, colorOf)) : [];
  if (bags.length > 0) picks.bag = pick(sameBags.length > 0 ? sameBags : bags, rng);
  return picks;
}

const idsOf = (picks: Picks) => SLOT_ORDER.flatMap(s => (picks[s] ? [picks[s].id] : []));
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

/** 隨機抽不到不同的組合時，逐一換掉某一格，找第一個不同的組合 */
function alternativePicks(base: Picks, pool: Pool, rule: OuterwearRule, previous: string[], colorOf: ColorOf): Picks | null {
  const variants: Picks[] = [];
  const tops = topChoices(pool, rule);
  for (const slot of SLOT_ORDER) {
    const current = base[slot];
    if (!current) continue;
    for (const other of slot === 'top' ? tops : slot === 'onepiece' ? onepieceChoices(pool) : pool[slot]) if (other.id !== current.id) variants.push({ ...base, [slot]: other });
  }
  if (rule === 'optional' && pool.outerwear.length > 0) {
    if (base.outerwear) variants.push({ ...base, outerwear: undefined });
    else for (const o of pool.outerwear) variants.push({ ...base, outerwear: o });
  }
  if (base.top?.category === 'top' && pool.overlay.length > 0) {
    if (base.overlay) variants.push({ ...base, overlay: undefined });
    else for (const o of pool.overlay) variants.push({ ...base, overlay: o });
  }
  const rest = { outerwear: base.outerwear ?? pool.outerwear[0], shoes: base.shoes, bag: base.bag };
  if (base.onepiece && tops.length > 0 && pool.bottom.length > 0) {
    for (const top of tops) for (const bottom of pool.bottom) variants.push({ ...rest, outerwear: needsOuterwear(top) ? rest.outerwear : base.outerwear, top, bottom });
  } else if (!base.onepiece) {
    for (const onepiece of onepieceChoices(pool)) variants.push({ ...rest, outerwear: needsOuterwear(onepiece) ? rest.outerwear : base.outerwear, onepiece });
  }
  const fresh = variants.filter(v => isValid(v) && !sameSet(idsOf(v), previous));
  const ok = (v: Picks) => !mixedStyle(picked(v));
  const bagStyled = (v: Picks) => {
    const s = v.bag ? styleOf(v.bag) : null;
    const clothes = styleSet(picked(v));
    return s === null || clothes.size === 0 || clothes.has(s);
  };
  return (
    fresh.find(v => ok(v) && bagStyled(v) && !bagClash(v, colorOf)) ??
    fresh.find(v => ok(v) && bagStyled(v)) ??
    fresh.find(ok) ??
    fresh[0] ??
    null
  );
}

/** 有顏色／風格資料時，一次產生幾組候選來評分 */
const CANDIDATES = 40;
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
  const groups = new Set(colors.map(colorGroup));
  const family = colors.length >= 2 && colors.length === clothes.length && groups.size === 1 ? [...groups][0] : null;
  return { scheme, schemeColor, style: styles.size === 1 ? [...styles][0] : null, colors: [...new Set(colors)], family };
}

/** 淑女風和休閒風混在一起（不推薦） */
const mixedStyle = (pieces: Item[]) => styleSet(pieces).size >= 2;

type OneStyle = Exclude<StyleTag, 'both'>;

/** 單品的風格：手動設定的優先，沒設定的用名稱與場合推測；「可休閒可淑女」、看不出來 = null（都能搭） */
function styleOf(item: Item): OneStyle | null {
  const s = item.style ?? inferStyle(item);
  return s === 'both' ? null : s;
}

/** 風格看衣服和鞋子（包包另外挑：先同風格、沒有再挑場合相近的；配件不推薦） */
function styleSet(pieces: Item[]): Set<OneStyle> {
  return new Set(
    pieces
      .filter(p => p.category !== 'bag' && p.category !== 'accessory' && p.category !== 'other')
      .map(styleOf)
      .filter((x): x is OneStyle => x !== null),
  );
}

/** 最近第 1、2、3 套出現過的單品，每件扣多少（再乘上分類的權重） */
const REPEAT_WEIGHTS = [1, 0.6, 0.3];
/** 衣服重複扣比較多；鞋子、包包、配件通常件數少，重複難免，扣少一點 */
const REPEAT_CLOTHES = 1.5;
const REPEAT_OTHER = 0.5;

/** 和最近幾套重複的程度（越大越重複） */
function repeatPenalty(pieces: Item[], recent: string[][]): number {
  let total = 0;
  for (const p of pieces) {
    const w = (CLOTHES as string[]).includes(p.category) ? REPEAT_CLOTHES : REPEAT_OTHER;
    recent.slice(0, REPEAT_WEIGHTS.length).forEach((ids, i) => {
      if (ids.includes(p.id)) total += w * REPEAT_WEIGHTS[i];
    });
  }
  return total;
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
  // 包包和鞋子同色系
  const bag = pieces.find(p => p.category === 'bag');
  const shoes = pieces.find(p => p.category === 'shoes');
  const bagGroup = bag && colorOf(bag) ? colorGroup(colorOf(bag)!) : null;
  if (bagGroup && shoes && colorOf(shoes) && colorGroup(colorOf(shoes)!) === bagGroup) score += 1;
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
  pool.shoesAlt = [];
  const colorOf: ColorOf = input.colorOf ?? ((item: Item) => item.color ?? null);
  // 缺少完全符合的單品：用次之的補上（記下來，說明裡要註明）
  const filledIds = new Set<string>();
  const fill = (c: Slot | 'inner') => {
    if (pool[c].length > 0) return;
    pool[c] = fallbackFor(input.items, c, filter);
    for (const i of pool[c]) filledIds.add(i.id);
  };
  const canDress = () => (topChoices(pool, rule).length > 0 && pool.bottom.length > 0) || onepieceChoices(pool).length > 0;
  if (rule === 'required') fill('outerwear');
  fill('shoes');
  if (!canDress()) for (const c of ['top', 'bottom', 'onepiece', 'inner'] as const) fill(c);
  // 長裙、長褲不搭長靴：符合的鞋子都是長靴時，準備次之的其他鞋子
  if (pool.shoes.length > 0 && pool.shoes.every(isTallBoots)) {
    pool.shoesAlt = fallbackFor(input.items.filter(i => !isTallBoots(i)), 'shoes', filter);
    for (const i of pool.shoesAlt) filledIds.add(i.id);
  }

  const emptyReason = (): EmptyReason => {
    const need = (['top', 'bottom'] as const).filter(c => (c === 'top' ? topChoices(pool, rule) : pool[c]).length === 0);
    return { need };
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
      filled: pieces
        .filter(p => filledIds.has(p.id))
        .map(p => {
          const occ = !fitsOccasion(p, input.occasion);
          const season = !fitsSeason(p, band);
          return { itemId: p.id, category: p.category, reason: occ && season ? 'both' : occ ? 'occasion' : 'weather' };
        }),
    };
  };

  const previous = options.previous ?? [];
  const isPrevious = (p: Picks) => previous.length > 0 && sameSet(idsOf(p), previous);
  const recent = options.recent ?? (previous.length > 0 ? [previous] : []);

  // 衣櫃裡有顏色或風格資料、或按了「更新」：產生多組候選評分（配色、風格，扣掉和最近幾套重複的）
  const informative = SLOT_ORDER.some(s => pool[s].some(i => colorOf(i) !== null || (i.style ?? inferStyle(i)) !== null));
  if (informative || recent.length > 0) {
    if (!canDress()) return result(null);
    const candidates: { picks: Picks; score: number; mixed: boolean }[] = [];
    let first: Picks | null = null;
    const gather = (strict: boolean) => {
      for (let i = 0; i < CANDIDATES; i++) {
        const p = randomPicks(pool, rule, rng, colorOf, input.occasion, strict);
        if (!p) continue;
        first ??= p;
        if (isPrevious(p) || candidates.some(c => sameSet(idsOf(c.picks), idsOf(p)))) continue;
        const look = informative ? scoreLook(picked(p), colorOf, input.occasion) : 0;
        candidates.push({ picks: p, score: look - repeatPenalty(picked(p), recent), mixed: mixedStyle(picked(p)) });
      }
    };
    // 淑女風和休閒風不混搭：先只挑風格一致的；湊不出（或都和上一套一樣）再找別的
    gather(true);
    if (candidates.length === 0 && first) {
      const alt = alternativePicks(first, pool, rule, previous, colorOf);
      if (alt && !mixedStyle(picked(alt))) return result(alt);
    }
    if (candidates.length === 0) gather(false);
    const unmixed = candidates.some(c => !c.mixed);
    const choices = unmixed ? candidates.filter(c => !c.mixed) : candidates;
    if (choices.length > 0) {
      const best = Math.max(...choices.map(c => c.score));
      const near = choices.filter(c => c.score > best - NEAR_BEST);
      return result(near[Math.min(near.length - 1, Math.floor(rng() * near.length))].picks);
    }
    const alt = first && alternativePicks(first, pool, rule, previous, colorOf);
    return alt ? result(alt) : result(first, true);
  }

  // 沒有任何顏色、風格資料，也不是「更新」：隨機挑
  return result(randomPicks(pool, rule, rng, colorOf, input.occasion));
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
