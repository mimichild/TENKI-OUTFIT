export type Category =
  | 'top'
  /** 內著（內搭，例如細肩帶、坦克背心）：穿搭建議一定會搭外套，不單穿 */
  | 'inner'
  /** 外搭（例如外罩小背心）：穿搭建議一定會內搭上衣，不單穿 */
  | 'overlay'
  | 'bottom'
  | 'onepiece'
  | 'outerwear'
  | 'shoes'
  | 'bag'
  | 'accessory'
  | 'other';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type Occasion = 'casual' | 'work' | 'formal' | 'dinner' | 'date' | 'travel';

/** 單品主色（穿搭建議配色用） */
export type ColorTag =
  | 'black' | 'white' | 'gray'
  /** beige 畫面上叫「杏」 */
  | 'beige' | 'khaki' | 'brown'
  | 'red' | 'pink' | 'orange' | 'green' | 'blue' | 'navy' | 'purple';

/** 單品風格：淑女風、休閒風；null = 不限（兩種都搭） */
/** both = 可休閒可淑女（建議穿搭時兩種風格都能搭） */
export type StyleTag = 'feminine' | 'casual' | 'both';

export interface Item {
  id: string;
  name: string;
  brand: string;
  category: Category;
  price: number | null;
  occasions: Occasion[];
  seasons: Season[];
  imageUri: string | null;
  originalUri: string | null;
  /** 主色；null / 沒有 = 沒設定（穿搭建議改用照片自動判斷的顏色） */
  color?: ColorTag | null;
  /** 風格；null / 沒有 = 沒設定（穿搭建議改用名稱與場合推測） */
  style?: StyleTag | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  deletedAt: string | null;
}

export interface OutfitItemPlacement {
  itemId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
}

/** 穿搭裡的一件單品；位置以畫布寬度的比例存（0–1），rotation v1 固定 0 */
export interface OutfitPiece extends OutfitItemPlacement {
  /** 已封存（永久刪除但過去穿搭仍參照）的單品也會帶出來 */
  item: Item;
}

export interface Outfit {
  id: string;
  name: string;
  /** YYYY-MM-DD。新存的穿搭一定有日期；null 只會出現在舊資料，視為未來 */
  date: string | null;
  /** 依 z 由下而上 */
  pieces: OutfitPiece[];
  /** 畫布高 / 寬：每套穿搭記住編輯時的畫布形狀（舊穿搭 4/3） */
  canvasRatio: number;
  createdAt: string;
  updatedAt: string;
}

export interface WeatherDay {
  county: string;
  town: string;
  /** YYYY-MM-DD */
  date: string;
  maxT: number | null;
  minT: number | null;
  maxAT: number | null;
  minAT: number | null;
  pop: number | null;
  wxCode: string | null;
  wxText: string | null;
  fetchedAt: string;
}
