import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { alphaBounds, type PieceShape } from './outfitLayout';
import { resolvePhotoUri } from './photoStorage';

/** 量測時縮成的最長邊（像素）；只需要大概的範圍 */
const SAMPLE = 160;

// 照片存檔後不會原地改寫（重新去背會存成新檔），用路徑當 key 快取即可
const cache = new Map<string, Promise<PieceShape | null>>();

async function measure(uri: string): Promise<PieceShape | null> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) return null;
  const W = image.width();
  const H = image.height();
  if (W <= 0 || H <= 0) return null;
  const k = Math.min(1, SAMPLE / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k));
  const h = Math.max(1, Math.round(H * k));
  const surface = Skia.Surface.Make(w, h);
  if (!surface) return null;
  surface.getCanvas().drawImageRect(image, Skia.XYWHRect(0, 0, W, H), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  surface.flush();
  const pixels = surface
    .makeImageSnapshot()
    .readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!(pixels instanceof Uint8Array)) return null;
  const bounds = alphaBounds(pixels, w, h);
  return bounds ? { aspect: W / H, bounds } : null;
}

/** 單品照片裡真正有衣服的範圍；沒照片或讀不到回傳 null（排版退回整張照片） */
export function measurePhoto(stored: string | null): Promise<PieceShape | null> {
  const uri = resolvePhotoUri(stored);
  if (!uri) return Promise.resolve(null);
  let p = cache.get(uri);
  if (!p) {
    p = measure(uri).catch(e => {
      console.warn('量測照片範圍失敗', e);
      return null;
    });
    cache.set(uri, p);
  }
  return p;
}
