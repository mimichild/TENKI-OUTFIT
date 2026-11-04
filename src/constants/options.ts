import type { Category, ColorTag, Occasion, Season, StyleTag } from '@/types/models';

export const CATEGORIES: Category[] = [
  'top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'bag', 'accessory', 'other',
];

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const OCCASIONS: Occasion[] = ['casual', 'work', 'formal', 'sport', 'date', 'travel'];

export const COLORS: ColorTag[] = [
  'black', 'white', 'gray', 'beige', 'khaki', 'brown',
  'red', 'pink', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple',
];

/** 顏色選擇器的色塊 */
export const COLOR_SWATCHES: Record<ColorTag, string> = {
  black: '#222222', white: '#FFFFFF', gray: '#9A9A9A',
  beige: '#E8D9BE', khaki: '#BFA77A', brown: '#7A5235',
  red: '#C9343B', pink: '#F2A7B8', orange: '#EE8A3C', yellow: '#F2D04B',
  green: '#5E9B5A', blue: '#5B8FD6', navy: '#1F3157', purple: '#8E6CC0',
};

export const STYLES: StyleTag[] = ['feminine', 'casual'];

export const COUNTIES = [
  '臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市',
  '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
] as const;

export type County = (typeof COUNTIES)[number];

export const TRASH_RETENTION_DAYS = 30;
