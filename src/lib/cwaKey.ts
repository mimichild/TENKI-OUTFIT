/**
 * 內建的氣象署授權碼：打包時從 `.env.local` 的 EXPO_PUBLIC_CWA_API_KEY 編進 App（檔案不進 git）。
 * 有內建授權碼時，設定頁不顯示授權碼欄位，使用者不用自己申請。
 * 注意：編進 App 的值可以從安裝檔拆出來，所有使用者共用同一組額度。
 *
 * 必須寫成 `process.env.EXPO_PUBLIC_CWA_API_KEY`（不能解構或用變數當鍵），Metro 打包時才會替換成實際值。
 */
export function builtInCwaKey(): string {
  return (process.env.EXPO_PUBLIC_CWA_API_KEY ?? '').trim();
}

/** 實際使用的授權碼：內建優先，沒有才用使用者在設定頁輸入的 */
export function effectiveCwaKey(userKey: string): string {
  return builtInCwaKey() || userKey.trim();
}
