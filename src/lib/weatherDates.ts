/** 日期字串 YYYY-MM-DD 的運算，一律用 UTC 計算，避免裝置時區影響 */

export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 0 = 星期日 */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** 可以瀏覽的日期範圍：最早的快取日期 ~ 最晚的預報日期，一定包含今天 */
export function browsableRange(dates: string[], today: string): { first: string; last: string } {
  let first = today;
  let last = today;
  for (const d of dates) {
    if (d < first) first = d;
    if (d > last) last = d;
  }
  return { first, last };
}
