/** 穿搭總金額：有填價格的單品才加總；全部沒填時回傳 null（畫面顯示「—」） */
export function outfitTotal(pieces: { item: { price: number | null } }[]): number | null {
  const prices = pieces.map(p => p.item.price).filter((p): p is number => p !== null);
  return prices.length === 0 ? null : prices.reduce((sum, p) => sum + p, 0);
}
