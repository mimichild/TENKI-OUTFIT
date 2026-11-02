// Web 預覽沒有本機檔案系統：直接沿用選到的網址
export function savePhoto(sourceUri: string): string {
  return sourceUri;
}

export function deletePhotos(_uris: (string | null | undefined)[]): void {}
