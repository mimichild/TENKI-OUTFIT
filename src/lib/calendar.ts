import { addDays, weekdayOf } from './weatherDates';

/** 月份字串 YYYY-MM */
export const monthOf = (date: string): string => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** 一週的星期順序（weekdayOf 的值，0 = 星期日）：星期一開頭、星期日最後（使用者指定 2026-11-06） */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

/** 包含 date 的那一週（星期一 ~ 星期日） */
export function weekOf(date: string): string[] {
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 月曆格子：星期一開頭，每列 7 天，前後補上相鄰月份的日期 */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const weeks: string[][] = [];
  let week = weekOf(first);
  while (monthOf(week[0]) <= month) {
    weeks.push(week);
    week = weekOf(addDays(week[6], 1));
  }
  return weeks;
}

/** 週檢視標題「頭 – 尾」；頭尾在不同年時兩端都帶年份 */
export function weekTitle(from: string, to: string, format: (date: string, withYear: boolean) => string): string {
  const withYear = from.slice(0, 4) !== to.slice(0, 4);
  return `${format(from, withYear)} – ${format(to, withYear)}`;
}
