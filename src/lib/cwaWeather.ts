/**
 * 中央氣象署開放資料：F-D0047-091「鄉鎮天氣預報-臺灣未來1週天氣預報」（22 縣市，每 12 小時一筆）
 * 格式依 2026-11-02 的 opendata.cwa.gov.tw/apidoc/v1（欄位為中文名稱）
 */

export const CWA_DATASET = 'F-D0047-091';
const BASE_URL = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${CWA_DATASET}`;
export const CWA_TIMEOUT_MS = 15_000;

const EL = {
  maxT: '最高溫度',
  minT: '最低溫度',
  maxAT: '最高體感溫度',
  minAT: '最低體感溫度',
  pop: '12小時降雨機率',
  wx: '天氣現象',
} as const;

export interface DailyForecast {
  /** YYYY-MM-DD（台灣時間） */
  date: string;
  maxT: number | null;
  minT: number | null;
  maxAT: number | null;
  minAT: number | null;
  /** 0–100，取當天各時段最大值 */
  pop: number | null;
  wxCode: string | null;
  wxText: string | null;
  /** 有沒有 06:00–18:00 的白天時段（晚上才抓的「今天」只剩夜間） */
  hasDaytime: boolean;
}

export type FetchForecastResult =
  | { status: 'ok'; days: DailyForecast[] }
  | { status: 'noKey' }
  | { status: 'unauthorized' }
  | { status: 'network' }
  | { status: 'timeout' }
  | { status: 'badResponse' };

const TAIPEI_OFFSET_MS = 8 * 3_600_000;

/** ISO 時間 → 台灣日期 YYYY-MM-DD（不受裝置時區影響） */
export function taipeiDate(iso: string): string {
  return new Date(new Date(iso).getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

export function buildForecastUrl(apiKey: string, county: string): string {
  const params = new URLSearchParams({
    Authorization: apiKey,
    format: 'JSON',
    LocationName: county,
    ElementName: Object.values(EL).join(','),
  });
  return `${BASE_URL}?${params.toString()}`;
}

// ---- 解析 ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** 氣象署回傳的大小寫不一致（Locations / locations），兩種都接受 */
const pick = (o: Obj, key: string): unknown => o[key] ?? o[key.charAt(0).toLowerCase() + key.slice(1)];

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || v.trim() === '' || v.trim() === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface Period {
  date: string;
  daytime: boolean;
  values: Obj;
}

function periodsOf(element: Obj): Period[] {
  return arr(pick(element, 'Time')).flatMap(t => {
    if (!isObj(t)) return [];
    const start = pick(t, 'StartTime') ?? pick(t, 'DataTime');
    if (typeof start !== 'string' || Number.isNaN(new Date(start).getTime())) return [];
    const values = arr(pick(t, 'ElementValue')).find(isObj) ?? {};
    // 台灣時間的小時：06:00 開始的是白天時段
    const hour = new Date(new Date(start).getTime() + TAIPEI_OFFSET_MS).getUTCHours();
    return [{ date: taipeiDate(start), daytime: hour >= 6 && hour < 18, values }];
  });
}

/** ElementValue 的鍵名不固定時（MaxTemperature 等），退回取第一個數值 */
function numberIn(values: Obj, key: string): number | null {
  if (key in values) return toNumber(values[key]);
  for (const v of Object.values(values)) {
    const n = toNumber(v);
    if (n !== null) return n;
  }
  return null;
}

function findLocation(json: unknown, county: string): Obj | null {
  if (!isObj(json)) return null;
  const records = pick(json, 'Records') ?? json.records;
  if (!isObj(records)) return null;
  for (const group of arr(pick(records, 'Locations'))) {
    if (!isObj(group)) continue;
    for (const loc of arr(pick(group, 'Location'))) {
      if (isObj(loc) && pick(loc, 'LocationName') === county) return loc;
    }
  }
  return null;
}

export function parseForecast(json: unknown, county: string): DailyForecast[] {
  const loc = findLocation(json, county);
  if (!loc) return [];
  const elements = new Map<string, Period[]>();
  for (const e of arr(pick(loc, 'WeatherElement'))) {
    if (isObj(e) && typeof pick(e, 'ElementName') === 'string') {
      elements.set(pick(e, 'ElementName') as string, periodsOf(e));
    }
  }

  const days = new Map<string, DailyForecast>();
  const dayOf = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { date, maxT: null, minT: null, maxAT: null, minAT: null, pop: null, wxCode: null, wxText: null, hasDaytime: false };
      days.set(date, d);
    }
    return d;
  };
  const extreme = (name: string, key: string, field: 'maxT' | 'minT' | 'maxAT' | 'minAT' | 'pop', pickMax: boolean) => {
    for (const p of elements.get(name) ?? []) {
      const n = numberIn(p.values, key);
      const d = dayOf(p.date);
      if (p.daytime) d.hasDaytime = true;
      if (n === null) continue;
      const cur = d[field];
      d[field] = cur === null ? n : pickMax ? Math.max(cur, n) : Math.min(cur, n);
    }
  };
  extreme(EL.maxT, 'MaxTemperature', 'maxT', true);
  extreme(EL.minT, 'MinTemperature', 'minT', false);
  extreme(EL.maxAT, 'MaxApparentTemperature', 'maxAT', true);
  extreme(EL.minAT, 'MinApparentTemperature', 'minAT', false);
  extreme(EL.pop, 'ProbabilityOfPrecipitation', 'pop', true);

  // 天氣現象：有白天時段用白天，否則用當天第一個時段
  const wxFromDaytime = new Set<string>();
  for (const p of elements.get(EL.wx) ?? []) {
    const d = dayOf(p.date);
    if (p.daytime) d.hasDaytime = true;
    const code = p.values.WeatherCode;
    const text = p.values.Weather;
    if (typeof code !== 'string' && typeof text !== 'string') continue;
    const alreadySet = d.wxCode !== null || d.wxText !== null;
    if (alreadySet && (wxFromDaytime.has(p.date) || !p.daytime)) continue;
    d.wxCode = typeof code === 'string' ? code.padStart(2, '0') : null;
    d.wxText = typeof text === 'string' ? text : null;
    if (p.daytime) wxFromDaytime.add(p.date);
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---- 連線 ----

export interface FetchForecastOptions {
  apiKey: string;
  county: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

export async function fetchForecast({
  apiKey,
  county,
  fetchImpl = fetch,
  timeoutMs = CWA_TIMEOUT_MS,
}: FetchForecastOptions): Promise<FetchForecastResult> {
  const key = apiKey.trim();
  if (!key) return { status: 'noKey' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetchImpl(buildForecastUrl(key, county), { signal: controller.signal });
    if (res.status === 401 || res.status === 403) return { status: 'unauthorized' };
    if (!res.ok) return { status: 'badResponse' };
    const days = parseForecast(await res.json(), county);
    return days.length > 0 ? { status: 'ok', days } : { status: 'badResponse' };
  } catch {
    return { status: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

// ---- 天氣代碼分類（en / ja 介面與圖示用） ----

export type WxCategory = 'clear' | 'partlyCloudy' | 'cloudy' | 'rain' | 'thunder' | 'fog' | 'snow' | 'unknown';

const WX_RANGES: [WxCategory, number[]][] = [
  ['clear', [1]],
  ['partlyCloudy', [2, 3]],
  ['cloudy', [4, 5, 6, 7]],
  ['thunder', [15, 16, 17, 18, 21, 22, 33, 34, 35, 36, 41]],
  ['snow', [23, 37, 42]],
  ['fog', [24, 25, 26, 27, 28]],
  ['rain', [8, 9, 10, 11, 12, 13, 14, 19, 20, 29, 30, 31, 32, 38, 39, 40]],
];

export function wxCategory(code: string | null): WxCategory {
  if (code === null) return 'unknown';
  const n = Number(code);
  return WX_RANGES.find(([, codes]) => codes.includes(n))?.[0] ?? 'unknown';
}
