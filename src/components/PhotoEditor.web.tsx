// Web 預覽不載入 Skia（需要另外下載 CanvasKit），不提供手動修改去背
export const PHOTO_EDITOR_SUPPORTED = false;

export function PhotoEditor(_props: {
  imageUri: string;
  originalUri: string;
  onDone: (uri: string) => void;
  onCancel: () => void;
}) {
  return null;
}
