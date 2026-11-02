import * as SecureStore from 'expo-secure-store';

// iOS Keychain / Android Keystore 加密儲存
export const getSecure = (key: string) => SecureStore.getItemAsync(key);

export function setSecure(key: string, value: string): Promise<void> {
  return value ? SecureStore.setItemAsync(key, value) : SecureStore.deleteItemAsync(key);
}
