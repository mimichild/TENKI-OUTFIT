import type { Item, Outfit, OutfitItemPlacement } from '@/types/models';

export interface OutfitInput {
  name: string;
  /** YYYY-MM-DD，必填 */
  date: string;
  items: OutfitItemPlacement[];
}

export type OutfitValidationReason = 'date' | 'empty' | 'duplicate';

export class OutfitValidationError extends Error {
  constructor(readonly reason: OutfitValidationReason) {
    super(`invalid outfit: ${reason}`);
    this.name = 'OutfitValidationError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateOutfitInput(input: OutfitInput): void {
  if (typeof input.date !== 'string' || !DATE_RE.test(input.date)) throw new OutfitValidationError('date');
  if (input.items.length === 0) throw new OutfitValidationError('empty');
  if (new Set(input.items.map(i => i.itemId)).size !== input.items.length) throw new OutfitValidationError('duplicate');
}

/** 穿搭存取介面：實機用 SQLite，Web 預覽與測試用記憶體版本 */
export interface OutfitRepository {
  /** from ~ to（含兩端），依日期、建立時間排序 */
  listInRange(from: string, to: string): Promise<Outfit[]>;
  get(id: string): Promise<Outfit | null>;
  create(input: OutfitInput): Promise<Outfit>;
  /** purged：因此不再被任何穿搭參照、已真正刪除的封存單品（呼叫端負責刪照片檔） */
  update(id: string, input: OutfitInput): Promise<{ outfit: Outfit; purged: Item[] } | null>;
  /** 回傳因此真正刪除的封存單品（呼叫端負責刪照片檔） */
  delete(id: string): Promise<Item[]>;
}
