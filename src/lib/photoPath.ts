/** App 自己存的照片相對路徑：`photos/<檔名>.<副檔名>`；其他路徑（含 `../`、完整 URI）一律不是 */
const OWNED_PHOTO = /^photos\/[\w-]+\.[a-z0-9]+$/;

export function isOwnedPhotoPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && OWNED_PHOTO.test(path);
}
