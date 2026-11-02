// Web 預覽沒有安全儲存區：只放記憶體，重新整理就消失（不寫入 localStorage）
const memory: Record<string, string> = {};

export const getSecure = async (key: string) => memory[key] ?? null;

export async function setSecure(key: string, value: string): Promise<void> {
  if (value) memory[key] = value;
  else delete memory[key];
}
