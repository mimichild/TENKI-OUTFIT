# TENKI OUTFIT 天氣穿搭 — v1 開發計畫

> 建立：2026-11-02　狀態：**第 2 階段進行中（批次 A、B 完成）**
> 基礎設施沿用 `/Users/mimi/Documents/REUSABLE_INFRA.md`

## 技術選型（沿用基礎文件）

- React Native 0.81 + Expo SDK 54、Expo Router v6、TypeScript strict、Zustand v5
- 本機資料：`expo-sqlite`（單品、穿搭、天氣快取）、AsyncStorage（設定）
- 圖片：`expo-image-picker`、`expo-file-system`
- 自動去背：裝置端（iOS Vision 前景遮罩 / Android ML Kit Subject Segmentation），透過原生模組套件 → **需要 dev build，不能用 Expo Go**
- 手動修改去背範圍、穿搭畫布：`@shopify/react-native-skia` + `react-native-gesture-handler` + `reanimated`
- 測試：Jest + jest-expo + RNTL；`scripts/regression.sh`、`e2e/visual.sh`（Web 預覽）
- 打包：本機 Gradle release APK（/build-apk）、EAS 備用

## 四個分頁

### 1. 設定
語言（繁中 / English / 日本語）、地區（縣市 → 鄉鎮）、幣別、主題色、暫存區（刪除的單品可還原或永久刪除）、匯出 / 匯入（含照片的 zip 備份）。

### 2. 服裝
- 小分頁：全部／上衣／下著／連身／外套／鞋子／包包／配件／其他
- 中層：Instagram 式三欄方格照片牆
- 右上：篩選與排序（新→舊、舊→新、最近使用、未使用）
- 右下 ＋：選照片/拍照 → 自動去背 → 顯示去背結果 → 填寫品牌／名稱／分類／價格／場合／季節 → 儲存／取消／刪除
- 單品頁右上「編輯」：資訊可改；照片可「重新上傳」「刪除照片」「重新編輯照片」（筆刷擦除/補回遮罩範圍後重新去背）

### 3. 每日氣象
- 上排：天氣卡，可左右切換前後日期；顯示最高／最低溫、晴雨、降雨機率、體感溫度
- 右上月曆圖示：切換日／週／月檢視，都顯示已排定的穿搭
- 中層：當日或當週的穿搭；底部白色畫布
- 右下 ＋：在白色畫布上拖拉、縮放單品組成穿搭；可存成當日、指定其他日期，或不指定日期
- 每套穿搭自動加總單品價格，以設定的幣別顯示

### 4. 穿搭建議
- 今日 / 明日切換
- 依體感溫度、降雨機率、季節給一套建議；「更新」重新抽一套；可選場合篩選；單品沒填場合時視為全場合皆可，由系統自由推薦
- 可一鍵把建議存成該日穿搭

## 天氣資料（中央氣象署開放資料）

- 來源：opendata.cwa.gov.tw 鄉鎮天氣預報「未來 1 週」（F-D0047-091 系列，依縣市分資料集），抓取 MaxT/MinT/MaxAT/MinAT/PoP12h/Wx
- 最遠可抓約 **7 天**（氣象署開放 API 沒有鄉鎮 10 日預報）。過去日期使用 App 本機快取下來的資料，所以從開始使用那天起會累積歷史
- **需要使用者到氣象署開放資料平台註冊取得授權碼**，v1 在設定頁輸入（不寫進程式碼）

## 我做的決定（可推翻）

- 幣別只切換顯示符號與格式，不做匯率換算
- 推薦規則：體感溫度分段決定層次（≥28 單層短袖、20–27 長袖/薄外套、13–19 需外套、<13 厚外套），降雨機率 ≥60% 時顯示帶傘提示（v1 不另外做雨天單品標記）
- 「最近使用」= 最後一次被排進穿搭的日期
- 刪除單品先進暫存區，保留 30 天
- 地區預設臺北市中正區，之後可加 GPS 定位

## 開發階段（每階段一個批次，完成後更新本文件）

| # | 內容 | 預估工具呼叫 |
|---|------|------|
| 1 | 專案骨架、四分頁導覽、主題/語言/設定儲存、DB schema、測試與回歸腳本 | 25–35 |
| 2 | 服裝牆、分類分頁、篩選排序、新增/編輯表單、暫存區 | 30–40 |
| 3 | 自動去背原生模組 + 手動遮罩修改（需實機/模擬器驗證） | 30–50 |
| 4 | 氣象署 API 串接、快取、天氣卡與前後日期瀏覽 | 20–30 |
| 5 | 日/週/月曆、穿搭畫布、指定日期、總金額 | 35–45 |
| 6 | 穿搭建議引擎與第四頁 | 15–25 |
| 7 | 匯出匯入、Android APK 打包、實機驗收 | 20–30 |

建議每 1–2 個階段開一個新對話，避免上下文過肥。

## 進度紀錄

### 第 1 階段 — 完成（2026-11-02）
- Expo SDK 54 骨架、Expo Router 四分頁（設定／服裝／每日氣象／穿搭建議），開 App 預設停在「每日氣象」
- 設定頁可用：語言（繁中/英/日，即時切換）、幣別、主題色 6 色、地區（22 縣市）、氣象署授權碼輸入；暫存區/匯出/匯入先顯示「即將推出」
- 設定以 Zustand + AsyncStorage 持久化；SQLite schema v1（items / outfits / outfit_items / weather_days），以 `PRAGMA user_version` 做版本遷移
- 測試：Jest 20 項通過；`bash scripts/regression.sh` = tsc + lint + jest + Web 視覺測試（12 項斷言）全過
- 待確認：Web 預覽截圖上 Ionicons 圖示未顯示，需在實機確認
- 地區目前只到縣市；鄉鎮清單在第 4 階段依氣象署資料集一起加入
- 程式碼審查後修正：設定存檔值不合法時退回預設（避免啟動當掉）、啟動畫面等設定讀完才收起、金額 -0 顯示修正、遷移檔加上外鍵注意事項。
- 測試現為 23 項，回歸腳本全過
- 氣象署授權碼改存 expo-secure-store（iOS Keychain / Android Keystore），不再寫入 AsyncStorage；Web 預覽只放記憶體。測試 26 項全過

### 第 2 階段 — 進行中（分支 `feat/phase-2-closet`，每批 commit）

拆成三批：A 資料層 → B 服裝牆與新增/編輯頁 → C 暫存區頁面、視覺測試、收尾。
- 去背維持第 3 階段做；第 2 階段的新增流程預留「去背結果」步驟，原圖（`original_uri`）與顯示圖（`image_uri`）分開存
- 篩選：季節、場合複選；單品沒填季節/場合時視為全部適用（與推薦規則一致）
- 不需要改 DB schema

#### 批次 A — 完成（2026-11-02）
- `src/lib/itemQueries.ts`：分類、季節、場合篩選＋四種排序（新→舊、舊→新、最近使用、未使用）
- `src/db/itemRepository.ts`（介面）、`sqliteItemRepository.ts`（實機）、`memoryItemRepository.ts`（Web 預覽／測試）：新增、修改、移到暫存區、還原、永久刪除、清除超過 30 天的暫存單品
- `src/db/ItemRepositoryContext.tsx`：App 啟動時自動清除過期暫存單品並刪照片檔；`useItemsVersion` 通知畫面重新讀取
- `src/lib/photoStorage.ts`（+ `.web.ts`）：照片複製到 App 的 `photos/` 資料夾；刪除時只刪 App 自己的檔案
- `src/lib/ids.ts`：新增套件 `expo-crypto` 產生 UUID
- `DatabaseProvider`（native / web）掛上單品資料層
- 和計畫不同的地方：永久刪除單品時，同時刪掉 `outfit_items` 裡用到這件單品的紀錄（外鍵沒有 CASCADE，不刪會擋住刪除）
- 驗證：Jest 46 項通過（新增 20 項）；`bash scripts/regression.sh` 4/4 全過

#### 批次 B — 完成（2026-11-02）
- 服裝頁 `app/(tabs)/closet.tsx`：分類小分頁（全部＋8 類）、三欄白底照片牆、右上「篩選與排序」（四種排序＋季節/場合複選，有篩選時圖示顯示小圓點）、右下 ＋（帶入目前分類）、空狀態
- 新增頁 `app/item/new.tsx`（modal）、單品頁 `app/item/[id].tsx`（檢視 → 右上「編輯」→ 表單，可儲存／取消／刪除＝移到暫存區）
- 共用元件：`ItemForm`（照片：從相簿選擇／拍照／重新上傳／刪除照片；品牌、名稱、分類、價格〔顯示幣別符號〕、場合、季節）、`ItemTile`、`ItemFilterSheet`、`Chip`、`HeaderIconButton`
- `src/lib/itemService.ts`：存檔時才把新照片複製進 App 資料夾，成功後才刪舊照片；存檔失敗會刪掉剛複製的檔案
- `src/lib/pickPhoto.ts`：相簿／相機權限，被拒時表單顯示提示（不跳系統對話框）
- `src/db/useItems.ts`：讀取單品的 hooks
- 三語字串新增 36 組；移除 `placeholder.closet`
- 和計畫不同的地方：選完照片會顯示「自動去背會在第 3 階段接上，目前先顯示原圖」；新照片目前同時存成原圖與顯示圖（同一個檔案），第 3 階段改成顯示圖存去背結果
- 驗證：Jest 69 項通過（新增 23 項）、tsc、lint 0 警告；`bash scripts/regression.sh` 4/4 全過（Web 視覺測試尚未涵蓋服裝頁，批次 C 補上）
