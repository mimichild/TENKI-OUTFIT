import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { alphaBounds, type PieceShape } from './outfitLayout';
import { boundsCache } from './photoBoundsCache';
import { dominantColor } from './itemColor';
import { alphaMask } from './pieceHit';
import { isOwnedPhotoPath } from './photoPath';
import { resolvePhotoUri } from './photoStorage';

/** 量測時縮成的最長邊（像素）；只需要大概的範圍 */
const SAMPLE = 160;

// 照片存檔後不會原地改寫（重新去背會存成新檔），用路徑當 key 快取即可。
// 記憶體快取之外，App 的照片（photos/…）另存在檔案快取，重開 App 不必再解碼
const cache = new Map<string, Promise<PieceShape | null>>();

/** Skia 物件都是原生記憶體，Hermes 的 GC 不知道實際大小，用完一定要釋放 */
type Disposable = { dispose(): void } | null | undefined;
const disposeAll = (list: Disposable[]) => list.forEach(o => o?.dispose());

async function measure(uri: string): Promise<PieceShape | null> {
  const owned: Disposable[] = [];
  try {
    const data = await Skia.Data.fromURI(uri);
    owned.push(data);
    // 這些失敗可能是暫時的（檔案還沒寫完、記憶體不足）：丟例外，不寫進快取，下次再量
    const image = Skia.Image.MakeImageFromEncoded(data);
    owned.push(image);
    if (!image) throw new Error('cannot decode photo');
    const W = image.width();
    const H = image.height();
    if (W <= 0 || H <= 0) throw new Error('photo has no size');
    const k = Math.min(1, SAMPLE / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k));
    const h = Math.max(1, Math.round(H * k));
    const surface = Skia.Surface.Make(w, h);
    owned.push(surface);
    if (!surface) throw new Error('cannot create surface');
    const paint = Skia.Paint();
    owned.push(paint);
    surface.getCanvas().drawImageRect(image, Skia.XYWHRect(0, 0, W, H), Skia.XYWHRect(0, 0, w, h), paint);
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    owned.push(snapshot);
    const pixels = snapshot.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
    if (!(pixels instanceof Uint8Array)) throw new Error('cannot read pixels');
    // 整張透明：量不到範圍（照片不會改，可以快取 null）
    const bounds = alphaBounds(pixels, w, h);
    if (!bounds) return null;
    const color = dominantColor(pixels, w, h);
    return { aspect: W / H, bounds, mask: alphaMask(pixels, w, h), ...(color ? { color } : {}) };
  } finally {
    disposeAll(owned.reverse());
  }
}

async function measureOrCached(stored: string, uri: string): Promise<PieceShape | null> {
  if (!isOwnedPhotoPath(stored)) return measure(uri);
  const cached = await boundsCache.get(stored);
  if (cached !== undefined) return cached;
  const shape = await measure(uri);
  await boundsCache.set(stored, shape);
  return shape;
}

/** 單品照片裡真正有衣服的範圍；沒照片或讀不到回傳 null（排版退回整張照片） */
export function measurePhoto(stored: string | null): Promise<PieceShape | null> {
  const uri = resolvePhotoUri(stored);
  if (!uri) return Promise.resolve(null);
  let p = cache.get(uri);
  if (!p) {
    p = measureOrCached(stored!, uri).catch(e => {
      // 失敗不快取（例如照片檔還沒寫完），下次再量
      cache.delete(uri);
      console.warn('量測照片範圍失敗', e);
      return null;
    });
    cache.set(uri, p);
  }
  return p;
}
