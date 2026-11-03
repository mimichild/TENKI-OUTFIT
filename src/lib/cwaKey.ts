/**
 * 內建的氣象署授權碼：打包時從 `.env.local` 的 EXPO_PUBLIC_CWA_API_KEY 編進 App（檔案不進 git）。
 * 有內建授權碼時使用者不用自己申請；想用自己額度的人仍可在設定頁填自己的（自己的優先）。
 * 注意：編進 App 的值可以從安裝檔拆出來，所有使用者共用同一組額度。
 *
 * 必須寫成 `process.env.EXPO_PUBLIC_CWA_API_KEY`（不能解構或用變數當鍵），Metro 打包時才會替換成實際值。
 */
export function builtInCwaKey(): string {
  return (process.env.EXPO_PUBLIC_CWA_API_KEY ?? '').trim();
}

/** 實際使用的授權碼：使用者在設定頁填的優先，留空才用內建的 */
export function effectiveCwaKey(userKey: string): string {
  return userKey.trim() || builtInCwaKey();
}
