import type Ionicons from '@expo/vector-icons/Ionicons';
import type { WxCategory } from '@/lib/cwaWeather';

/** 天氣分類 → 圖示（天氣穿搭、穿搭建議共用） */
export const WX_ICONS: Record<WxCategory, keyof typeof Ionicons.glyphMap> = {
  clear: 'sunny-outline',
  partlyCloudy: 'partly-sunny-outline',
  cloudy: 'cloudy-outline',
  rain: 'rainy-outline',
  thunder: 'thunderstorm-outline',
  fog: 'cloudy-outline',
  snow: 'snow-outline',
  unknown: 'help-circle-outline',
};
