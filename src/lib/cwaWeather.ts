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

/**
 * 以「出門時段」為主（使用者決定 2026-11-02，做法 B）：
 * - maxT / maxAT / pop / wx：當天白天 06:00–18:00
 * - minT / minAT：前一晚 18:00–當天 06:00（預報裡沒有前一晚時，用白天的最低溫）
 * - 晚上才抓的「今天」只剩當晚時段：全部用當晚時段，hasDaytime = false
 * 和氣象署網站「白天／晚上」欄位的分法不同（網站把晚上算在前一天）。
 */
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
  | { status: 'badResponse' }
  /** 呼叫端取消（換縣市、畫面關掉），結果不用顯示 */
  | { status: 'aborted' };

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

interface Slots {
  day?: Obj;
  night?: Obj;
}

export function parseForecast(json: unknown, county: string): DailyForecast[] {
  const loc = findLocation(json, county);
  if (!loc) return [];

  // 每個欄位：開始日期 → 白天／當晚時段的值
  const elements = new Map<string, Map<string, Slots>>();
  const dates = new Set<string>();
  for (const e of arr(pick(loc, 'WeatherElement'))) {
    if (!isObj(e) || typeof pick(e, 'ElementName') !== 'string') continue;
    const byDate = new Map<string, Slots>();
    for (const p of periodsOf(e)) {
      const slots = byDate.get(p.date) ?? {};
      slots[p.daytime ? 'day' : 'night'] = p.values;
      byDate.set(p.date, slots);
      dates.add(p.date);
    }
    elements.set(pick(e, 'ElementName') as string, byDate);
  }
  const slotsOf = (name: string, date: string): Slots => elements.get(name)?.get(date) ?? {};
  const hasDay = (date: string) => [...elements.values()].some(m => m.get(date)?.day !== undefined);

  const days: DailyForecast[] = [];
  for (const date of [...dates].sort()) {
    const daytime = hasDay(date);
    const prev = addDaysIso(date, -1);
    // 白天時段；沒有白天（晚上才抓的今天）就用當晚
    const main = (name: string) => (daytime ? slotsOf(name, date).day : slotsOf(name, date).night);
    // 最低溫：前一晚；沒有前一晚時退回 main
    const low = (name: string) => (daytime ? slotsOf(name, prev).night ?? slotsOf(name, date).day : slotsOf(name, date).night);
    // 沒有白天的日期正常只會是預報的第一天（晚上才抓的今天）；其他日期缺白天時段就跳過，不用夜間數字假裝成一整天
    if (!daytime && days.length > 0) continue;

    const num = (values: Obj | undefined, key: string) => (values ? numberIn(values, key) : null);
    const wx = main(EL.wx);
    const code = wx?.WeatherCode;
    const text = wx?.Weather;
    days.push({
      date,
      maxT: num(main(EL.maxT), 'MaxTemperature'),
      minT: num(low(EL.minT), 'MinTemperature'),
      maxAT: num(main(EL.maxAT), 'MaxApparentTemperature'),
      minAT: num(low(EL.minAT), 'MinApparentTemperature'),
      pop: num(main(EL.pop), 'ProbabilityOfPrecipitation'),
      wxCode: typeof code === 'string' ? code.padStart(2, '0') : null,
      wxText: typeof text === 'string' ? text : null,
      hasDaytime: daytime,
    });
  }
  return days;
}

function addDaysIso(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// ---- 連線 ----

export interface FetchForecastOptions {
  apiKey: string;
  county: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchForecast({
  apiKey,
  county,
  fetchImpl = fetch,
  timeoutMs = CWA_TIMEOUT_MS,
  signal,
}: FetchForecastOptions): Promise<FetchForecastResult> {
  const key = apiKey.trim();
  if (!key) return { status: 'noKey' };
  if (signal?.aborted) return { status: 'aborted' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  const failure = (): FetchForecastResult =>
    signal?.aborted ? { status: 'aborted' } : timedOut ? { status: 'timeout' } : { status: 'network' };
  try {
    let res: Response;
    try {
      res = await fetchImpl(buildForecastUrl(key, county), { signal: controller.signal });
    } catch {
      return failure();
    }
    if (res.status === 401 || res.status === 403) return { status: 'unauthorized' };
    if (!res.ok) return { status: 'badResponse' };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // 逾時／取消時讀內容也會失敗；其他情況是內容不是 JSON（例如閘道器回的 HTML）
      return signal?.aborted || timedOut ? failure() : { status: 'badResponse' };
    }
    const days = parseForecast(body, county);
    return days.length > 0 ? { status: 'ok', days } : { status: 'badResponse' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
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
