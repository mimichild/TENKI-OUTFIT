// Jest 沒有 Skia 原生/CanvasKit：只提供 PhotoEditor import 得到的名稱。編輯器本身在模擬器驗證
const Noop = () => null;
export const Canvas = Noop;
export const Group = Noop;
export const Image = Noop;
export const ImageShader = Noop;
export const Path = Noop;
export const ImageFormat = { PNG: 4, JPEG: 3, WEBP: 6 };
export const Skia = { Path: { Make: () => ({ moveTo() {}, lineTo() {} }) } };
export const useImage = () => null;
export const drawAsImage = async () => {
  throw new Error('drawAsImage is not available in Jest');
};
