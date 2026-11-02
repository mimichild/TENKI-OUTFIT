import type { Category, Occasion, Season } from '@/types/models';

export const CATEGORIES: Category[] = [
  'top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'bag', 'accessory', 'other',
];

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const OCCASIONS: Occasion[] = ['casual', 'work', 'formal', 'sport', 'date', 'travel'];

export const COUNTIES = [
  '臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市',
  '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
] as const;

export type County = (typeof COUNTIES)[number];

export const TRASH_RETENTION_DAYS = 30;
