import type { ColorTag, Item, StyleTag } from '@/types/models';

export type ItemInput = Pick<
  Item,
  'name' | 'brand' | 'category' | 'price' | 'occasions' | 'seasons' | 'imageUri' | 'originalUri'
> & {
  /** 新增時沒給 = null；更新時沒給 = 保留原值（null = 清掉） */
  color?: ColorTag | null;
  style?: StyleTag | null;
};

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
  /**
   * 永久刪除。今天以後（含今天、沒有日期）的穿搭移除這件單品，穿搭變空就刪掉；
   * 過去的穿搭還用到它時改為「已封存」（保留資料與照片），否則真正刪除。
   * 回傳真正刪除的單品（呼叫端負責刪照片檔）
   */
  purge(id: string): Promise<Item[]>;
  /** 對進暫存區超過 days 天的單品做 purge，回傳真正刪除的單品 */
  purgeExpired(days: number): Promise<Item[]>;
  /** 所有單品（含暫存區、已封存）用到的照片路徑，不重複；清除孤兒照片用 */
  photoPaths(): Promise<string[]>;
}

export function trashCutoff(nowIso: string, days: number): string {
  return new Date(new Date(nowIso).getTime() - days * 86_400_000).toISOString();
}
