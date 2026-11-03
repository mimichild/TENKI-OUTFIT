// Web 預覽沒有本機檔案系統：直接沿用選到的網址
export async function savePhoto(sourceUri: string): Promise<string> {
  return sourceUri;
}

export function resolvePhotoUri(stored: string | null): string | null {
  return stored;
}

export function deletePhotos(_stored: (string | null | undefined)[]): void {}

export function clearCutoutCache(): void {}

export function listPhotoPaths(): string[] {
  return [];
}

export function clearBackupTemp(): void {}
