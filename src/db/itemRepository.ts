import type { Item } from '@/types/models';

export type ItemInput = Pick<
  Item,
  'name' | 'brand' | 'category' | 'price' | 'occasions' | 'seasons' | 'imageUri' | 'originalUri'
>;

export interface RepositoryDeps {
  now: () => string;
  newId: () => string;
}

/** 單品存取介面：實機用 SQLite，Web 預覽與測試用記憶體版本 */
export interface ItemRepository {
  /** 未刪除的單品 */
  list(): Promise<Item[]>;
  /** 暫存區（已刪除、尚未永久刪除），最近刪除的在前 */
  listTrash(): Promise<Item[]>;
  get(id: string): Promise<Item | null>;
  create(input: ItemInput): Promise<Item>;
  update(id: string, input: ItemInput): Promise<Item | null>;
  moveToTrash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  /** 永久刪除，回傳被刪的單品（呼叫端負責刪照片檔） */
  purge(id: string): Promise<Item | null>;
  /** 刪除進暫存區超過 days 天的單品 */
  purgeExpired(days: number): Promise<Item[]>;
}

export function trashCutoff(nowIso: string, days: number): string {
  return new Date(new Date(nowIso).getTime() - days * 86_400_000).toISOString();
}
