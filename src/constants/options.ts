import type { Category, ColorTag, Occasion, Season, StyleTag } from '@/types/models';

export const CATEGORIES: Category[] = [
  'top', 'inner', 'overlay', 'bottom', 'onepiece', 'outerwear', 'shoes', 'bag', 'accessory', 'other',
];

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

// 2026-11-04：拿掉「運動」、新增「聚餐」。舊資料存的 sport 讀取時會被略過
export const OCCASIONS: Occasion[] = ['casual', 'work', 'formal', 'dinner', 'date', 'travel'];

export const COLORS: ColorTag[] = [
  'black', 'white', 'gray', 'beige', 'khaki', 'brown',
  'red', 'pink', 'orange', 'green', 'blue', 'navy', 'purple',
];

/** 顏色選擇器的色塊：多數用低彩度的甜美色系；黑、紅維持原本的深色（使用者指定 2026-11-04） */
export const COLOR_SWATCHES: Record<ColorTag, string> = {
  black: '#222222', white: '#FFFFFF', gray: '#BDB8B8',
  beige: '#F3D5BD', khaki: '#CDBA9A', brown: '#A88270',
  red: '#C9343B', pink: '#EAAFB3', orange: '#F5B26B',
  green: '#B5DDA4', blue: '#9EC3E6', navy: '#6B7A9C', purple: '#BFAEE0',
};

export const STYLES: StyleTag[] = ['feminine', 'casual'];

export const COUNTIES = [
  '臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市',
  '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
] as const;

export type County = (typeof COUNTIES)[number];

export const TRASH_RETENTION_DAYS = 30;
