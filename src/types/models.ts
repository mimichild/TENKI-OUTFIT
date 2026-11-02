export type Category =
  | 'top'
  | 'bottom'
  | 'onepiece'
  | 'outerwear'
  | 'shoes'
  | 'bag'
  | 'accessory'
  | 'other';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type Occasion = 'casual' | 'work' | 'formal' | 'sport' | 'date' | 'travel';

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

export interface Outfit {
  id: string;
  name: string;
  /** YYYY-MM-DD, null = 不指定日期 */
  date: string | null;
  items: OutfitItemPlacement[];
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
