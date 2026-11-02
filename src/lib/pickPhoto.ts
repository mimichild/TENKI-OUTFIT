import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'library' | 'camera';

export class PhotoPermissionError extends Error {
  constructor(public source: PhotoSource) {
    super(`${source} permission denied`);
  }
}

/** 回傳暫存 URI；使用者取消時回傳 null */
export async function pickPhoto(source: PhotoSource): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError('camera');
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError('library');
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}
