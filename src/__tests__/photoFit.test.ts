import { ITEM_PHOTO_ASPECT, fitContent } from '@/lib/photoFit';

describe('ITEM_PHOTO_ASPECT', () => {
  it('單品照片外框是直式 3:4', () => {
    expect(ITEM_PHOTO_ASPECT).toBe(3 / 4);
  });
});

describe('fitContent', () => {
  const close = (actual: Record<string, number>, expected: Record<string, number>) => {
    for (const k of Object.keys(expected)) expect(actual[k]).toBeCloseTo(expected[k], 5);
  };

  it('量不到範圍時整張照片等比縮放、置中（contain）', () => {
    // 1:1 照片放進 300×400：寬 300、上下各留 50
    close(fitContent(null, 1, 300, 400, 0), { left: 0, top: 50, width: 300, height: 300 });
  });

  it('衣服只佔照片中間一小塊時，放大到填滿外框，不受原照片留白影響', () => {
    // 1000×1000 照片，衣服在中間 x 0.4–0.6、y 0.35–0.65（200×300，正好 2:3）
    const shape = { aspect: 1, bounds: { x0: 0.4, y0: 0.35, x1: 0.6, y1: 0.65 } };
    const r = fitContent(shape, 1, 300, 400, 0);
    // 衣服 2:3 放進 3:4 外框 → 高度先頂到 400，寬 266.67；照片放大 = 400 / 0.3
    const scale = 400 / 0.3;
    close(r, { width: scale, height: scale });
    // 衣服在外框裡水平置中、上緣貼齊
    expect(r.left + 0.4 * r.width).toBeCloseTo((300 - 0.2 * scale) / 2, 5);
    expect(r.top + 0.35 * r.height).toBeCloseTo(0, 5);
  });

  it('同一件衣服，原照片大小不同、放大後在外框裡的大小一樣', () => {
    const small = fitContent({ aspect: 1, bounds: { x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 } }, 1, 300, 400, 0);
    const big = fitContent({ aspect: 1, bounds: { x0: 0.45, y0: 0.45, x1: 0.55, y1: 0.55 } }, 1, 300, 400, 0);
    expect(0.5 * small.width).toBeCloseTo(0.1 * big.width, 5);
  });

  it('四周保留 margin 比例的空白', () => {
    const shape = { aspect: 1, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } };
    // 正方形衣服、外框 300×400、四周留 5% → 寬 270，置中
    close(fitContent(shape, 1, 300, 400, 0.05), { left: 15, top: 65, width: 270, height: 270 });
  });

  it('外框還沒量到大小（0）時不放大', () => {
    close(fitContent(null, 1, 0, 0, 0), { left: 0, top: 0, width: 0, height: 0 });
  });
});
