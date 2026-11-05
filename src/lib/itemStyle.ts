import type { Item, StyleTag } from '@/types/models';

/**
 * 從名稱推測單品風格（使用者沒有手動選的時候用）：
 * 看名稱和品牌裡的關鍵字；看不出來就是 null（不限，兩種風格都搭）。不用場合推測（2026-11-05）
 */
const FEMININE_WORDS = [
  '洋裝', '連身裙', '裙', '蕾絲', '雪紡', '針織', '碎花', '荷葉', '泡泡袖', '蝴蝶結', '緞面', '珍珠', '高跟', '跟鞋', '瑪莉珍', '娃娃',
  '淑女', '甜美', '優雅', 'dress', 'skirt', 'lace', 'chiffon', 'knit', 'floral', 'heels', 'pearl', 'ワンピース', 'スカート', 'レース',
];
const CASUAL_WORDS = [
  'T恤', 'Ｔ恤', 't恤', '短T', '帽T', '大學T', '衛衣', '牛仔', '丹寧', '球鞋', '運動', '休閒', '工裝', '連帽', '帆布', '老爹鞋', '拖鞋', '後背包',
  '棒球帽', '短褲', 'tee', 't-shirt', 'hoodie', 'denim', 'jeans', 'sneaker', 'jogger', 'sweatshirt', 'デニム', 'スニーカー', 'パーカー',
];

const includesAny = (text: string, words: string[]) => words.some(w => text.includes(w.toLowerCase()));

export function inferStyle(item: Pick<Item, 'name' | 'brand'>): StyleTag | null {
  const text = `${item.name} ${item.brand}`.toLowerCase();
  const feminine = includesAny(text, FEMININE_WORDS);
  const casual = includesAny(text, CASUAL_WORDS);
  if (feminine !== casual) return feminine ? 'feminine' : 'casual';
  // 名稱看不出來（或兩種都有）：不限，兩種風格都搭（不用場合推測）
  return null;
}
