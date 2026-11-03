# TENKI OUTFIT 天氣穿搭 — v1 開發計畫

> 建立：2026-11-02　狀態：**第 6 階段進行中**
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
- 右下 ＋：在白色畫布上拖拉、縮放、雙指旋轉單品組成穿搭；可存成當日或指定其他日期（**必須有日期**，使用者決定 2026-11-02）
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
- 【使用者決定 2026-11-02，第 5 階段實作】使用者看到的流程不變：刪除單品 → 進暫存區保留 30 天（可還原）→ 期滿或手動永久刪除後，從使用者介面上完全消失。背後的資料處理：
  - 單品永久刪除（含 30 天自動清除）時：
  - **過去的穿搭**（日期 < 今天）保留該單品，當作穿搭日記；單品轉為「已封存」：不出現在服裝牆與暫存區，但照片與資料保留，過去穿搭仍顯示它
  - **今天與未來的穿搭**（日期 ≥ 今天）與**未指定日期的穿搭**：移除該單品，原位置留白；穿搭因此變空時自動刪除該穿搭
  - 當最後一套參照已封存單品的穿搭被刪除時，才真正刪除單品資料與照片
  - 暫存區頁要說明「永久刪除後，過去穿搭仍會保留這件單品的照片」
  - 使用者已同意第 5 階段新增一版 DB 遷移（items 加封存狀態欄位）
  - 使用者已確認：今天算未來、未指定日期算未來
  - 第 2 階段現行 `purge` 是「全部穿搭都移除、不刪穿搭」，第 5 階段要改寫並更新測試

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
- 待確認：Web 預覽截圖上 Ionicons 圖示未顯示，需在實機確認（第 2 階段已找到原因並修正：見批次 C）
- 地區目前只到縣市；鄉鎮清單在第 4 階段依氣象署資料集一起加入
- 程式碼審查後修正：設定存檔值不合法時退回預設（避免啟動當掉）、啟動畫面等設定讀完才收起、金額 -0 顯示修正、遷移檔加上外鍵注意事項。
- 測試現為 23 項，回歸腳本全過
- 氣象署授權碼改存 expo-secure-store（iOS Keychain / Android Keystore），不再寫入 AsyncStorage；Web 預覽只放記憶體。測試 26 項全過

### 第 2 階段 — 完成（2026-11-02，分支 `feat/phase-2-closet`，每批 commit）

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

#### 批次 C — 完成（2026-11-02）
- 暫存區頁 `app/trash.tsx`：最近刪除的在前、顯示「剩 N 天後自動刪除」、還原、永久刪除（點兩次確認，不用系統對話框）；設定頁「暫存區」顯示件數並可點進去
- **修正第 1 階段就存在的 Web 預覽問題**：`zustand/middleware` 的 `import.meta` 讓 Web bundle 一載入就 SyntaxError，React 從未掛載（之前的視覺測試只讀到伺服器預先產生的靜態 HTML 所以沒發現；Ionicons 不顯示也是同一原因）。新增 `babel.config.js`（`unstable_transformImportMeta: true`）並把 `babel-preset-expo` 加進 devDependencies
- 視覺測試新增：服裝頁、新增頁、暫存區頁文字檢查，以及「按 ＋ → 填名稱與價格 → 儲存 → 照片牆出現該單品」的實際操作（同時證明 JS 有正常 hydrate）
- Code review 修正：
  - 照片改存相對路徑（`photos/<uuid>.jpg`），顯示時用 `resolvePhotoUri` 組完整路徑（iOS 更新 App 後絕對路徑會變）
  - 永久刪除改用 `withExclusiveTransactionAsync`，`outfit_items` 與 `items` 一起成功或一起失敗
  - 記憶體版 update 只合併可編輯欄位；單品頁傳給表單的初始值只挑可編輯欄位
  - 已在暫存區的單品從單品頁打開視為「找不到」
  - 表單「刪除」加上防連點與失敗提示；`update` 找不到單品時回收新照片、不刪舊照片
  - 清單分隔符號、暫存天數改為 i18n 參數；分類分頁加 `tablist`、遮罩加 role
- 驗證：Jest 83 項通過；`bash scripts/regression.sh` 4/4 全過（視覺測試 38 項）

#### 留待之後處理
- ~~待使用者決定~~ → 已決定（2026-11-02），見「我做的決定」：過去穿搭保留、未來穿搭移除，第 5 階段實作
- 自動清除目前只在開 App 時跑；之後可在 App 回到前景時也跑一次
- ~~`File.copy` 是同步的，大張照片存檔可能頓一下~~ → 第 3 階段批次 B 改用 `copyAsync`
- 英文單複數（1 days / 1 items）
- 讀取單品失敗時目前只記錄 log，畫面停在讀取中；之後加錯誤狀態與重試
- 實機（相簿／相機選照片、SQLite）尚未驗證，第 3 階段做 dev build 時一起驗

### 第 3 階段 — 完成（2026-11-02，分支 `feat/phase-3-bg-removal`，每批 commit，PR #2）

使用者已同意（2026-11-02）：
- Android 這階段不驗證（沒有模擬器/手機），留到第 7 階段打包時實機驗；本階段只在 iOS 模擬器驗證
- 不改 DB：遮罩從去背 PNG 的透明度反推（重新編輯 = 原圖 + 目前去背圖）
- 顯示圖改存 `.png`（透明背景），原圖維持原格式
- 每批 commit
- 去背成功時不保留使用者選的原尺寸照片；不做「改回原圖」切換；去背效果不好也顯示去背結果，由使用者手動修改。只在背景保留「轉正＋縮到 1600px 的原圖 JPEG」（與去背圖同尺寸，介面不顯示），讓批次 C 的「補回」筆刷能取像素（使用者選 a，2026-11-02）
- 自動去背只支援 iOS 17+（Expo SDK 54 最低 iOS 15.1，iOS 14 無法安裝）；iOS 15.1–16 不內建 Core ML 模型，退回原圖＋批次 C 的手動筆刷（使用者確認 2026-11-02）

拆成四批：
- **A｜去背原生模組**：專案內 Expo 本機模組 `modules/tenki-bg-removal`（iOS Vision `VNGenerateForegroundInstanceMaskRequest`，iOS 17+；Android ML Kit Subject Segmentation）；JS 包裝 `src/lib/backgroundRemoval.ts`（+ `.web.ts` 一律回報不支援），先縮到長邊 1600px 再去背；單元測試用假原生模組
- **B｜接到新增／編輯流程**：選照片 → 去背中 → 顯示結果；失敗/不支援時退回原圖並提示；`saveItem` 分開存原圖與去背圖；照片複製改非同步
- **C｜手動修改遮罩**：加 `@shopify/react-native-skia`，筆刷「擦除／補回」編輯畫面，存成新的去背 PNG；單品頁「重新編輯照片」
- **D｜iOS dev build + 模擬器驗證**（含第 2 階段未驗的相簿、SQLite）；Android 只做 Gradle 編譯檢查

#### 批次 A — 完成（2026-11-02）
- `modules/tenki-bg-removal/`：Expo 本機模組（autolinking 已確認 iOS/Android 都抓得到）
  - `ios/TenkiBgRemovalModule.swift`：讀檔 → 轉正並縮到長邊 maxSize → Vision 前景遮罩（iOS 17+）→ 不裁切、與輸入同尺寸的透明 PNG，存到 `Caches/bg-removal/`；在背景佇列執行
  - `android/.../TenkiBgRemovalModule.kt`：inSampleSize 縮圖 + EXIF 轉正 → ML Kit Subject Segmentation 前景圖 → PNG 存到 `cacheDir/bg-removal/`；`AndroidManifest.xml` 加 `subject_segment` 讓安裝時預先下載模型
  - 錯誤碼：`ERR_NO_SUBJECT`、`ERR_UNAVAILABLE`、`ERR_LOAD_IMAGE`、`ERR_SEGMENTATION`
  - `src/TenkiBgRemovalModule.ts`：`requireOptionalNativeModule`，Expo Go / Web / 測試時為 null
- `src/lib/backgroundRemoval.ts`（+ `.web.ts`）：`removeBackground(uri)` 不丟例外，回傳 `ok / unavailable / noSubject / failed`；`BG_REMOVAL_MAX_SIZE = 1600`
- 驗證：Jest 90 項通過（新增 7 項）；`bash scripts/regression.sh` 4/4 全過（視覺 38 項）
- **尚未驗證**：Swift / Kotlin 還沒編譯過（還沒 prebuild），批次 D 做 dev build 時才會編譯；Android 本階段只做 Gradle 編譯檢查

#### 批次 B — 完成（2026-11-02）
- `ItemForm`：選照片後立刻顯示原圖並開始去背（顯示「正在自動去背…」、儲存按鈕暫時停用），成功換成去背圖並顯示「已自動去背」；不支援／找不到主體／失敗時保留原圖並顯示對應提示；去背還沒回來又選了新照片時，丟掉舊結果；刪除照片會取消進行中的去背
- `PhotoChange.replace` 改成 `{ originalUri, imageUri }`；`saveItem` 分別複製原圖與去背圖（沒去背時只複製一次），任一張失敗就回收已複製的檔案
- `photoStorage.savePhoto` 改為非同步（`expo-file-system/legacy` 的 `copyAsync`），保留 `.png` 副檔名
- 新增／單品頁注入 `removeBackground`；三語字串新增 5 組、移除 `item.cutoutPending`
- 驗證：Jest 98 項通過（新增 8 項）、tsc、lint；`bash scripts/regression.sh` 4/4 全過（Web 一律走「不支援」路徑）
- 和計畫不同的地方：沒有做「改用原圖／改用去背圖」切換；去背結果不好時改用批次 C 的手動修改
- 回饋調整（2026-11-02）：原生模組多輸出縮小原圖 JPEG（`originalUri`）；去背成功時存「縮小原圖 + 去背 PNG」，丟掉原尺寸照片；去背沒成功時仍存使用者選的照片。Jest 98 項、regression 4/4 全過

#### 批次 C — 完成（2026-11-02，編輯器本身待批次 D 在模擬器驗證）
- 新增套件 `@shopify/react-native-skia` 2.2.12（`npx expo install`）
- `src/lib/maskEditing.ts`：等比置中、觸控座標 → 圖片像素、存檔尺寸（長邊最多 1600）、筆畫新增／復原；筆畫存圖片像素座標
- `src/components/PhotoEditor.tsx`：全螢幕編輯器（Modal + GestureHandlerRootView）。Skia 圖層：底圖 → 依序「擦除」（blendMode clear）與「補回」（原圖 ImageShader）；筆刷大／中／小、復原、完成時用 `drawAsImage` 輸出 PNG 到 `Caches/bg-removal/`；灰底讓透明區看得出來
- `PhotoEditor.web.tsx`：Web 不載入 Skia、不顯示「重新編輯照片」
- `ItemForm`：有照片且不在去背中時顯示「重新編輯照片」；新選的照片用（去背圖, 縮小原圖），已存的單品用（imageUri, originalUri，沒有原圖時用顯示圖）；完成後以 `replace` 存新去背圖、原圖沿用
- Jest 用 `src/__mocks__/react-native-skia.ts` 取代 Skia（`moduleNameMapper`）
- 三語字串新增 12 組
- 驗證：Jest 111 項通過（新增 13 項）、tsc、lint；`bash scripts/regression.sh` 4/4 全過
- 和計畫不同的地方：編輯器做成表單內的 Modal，不是獨立路由（結果要回到表單尚未存檔的狀態，Modal 最直接）
- 已知限制：編輯已存單品時，存檔會把原圖再複製一份新檔、刪掉舊檔（`saveItem` 的 replace 流程），功能正確但多一次複製
- 回饋調整（2026-11-02，使用者要求筆刷可自由選大小、用拉 bar）：大／中／小按鈕改成 `BrushSizeSlider` 滑桿（4–80 畫面像素，預設 28，拖拉或點軌道直接跳到該位置，左側圓點即時顯示粗細，螢幕閱讀器可用增減手勢每次 ±4）；`maskEditing` 新增 `brushFromSlider`／`sliderFromBrush`；移除三語 `editor.small/medium/large`。Jest 117 項、regression 4/4 全過

#### 批次 D — 完成（2026-11-02）
- **驗證方式變更（使用者決定 2026-11-02）**：不在 iPhone／iOS 模擬器做操作驗證，改成打包 Android release APK 給使用者實機檢測（推翻先前「Android 留到第 7 階段」的決定）
- iOS dev build（`expo prebuild` + `pod install` + `expo run:ios`，iPhone 17 模擬器）**編譯成功**：Swift 去背模組與 Skia 都能編譯、App 能安裝啟動；未做操作驗證
- `prebuild` 把 `package.json` 的 `ios`／`android` 指令改成 `expo run:*`（需要 dev build，保留）
- Android release APK（`/build-apk`，本機簽章）**建置成功**：Kotlin 去背模組、ML Kit、Skia 都編譯通過；APK manifest 確認含 `com.google.mlkit.vision.DEPENDENCIES = subject_segment`。檔案：Google Drive `SPARK-Builds/TENKI-OUTFIT/tenki-outfit-v0.1.0-20261102-1715.apk`（約 126 MB，含全部 CPU 架構）
- **Android 實機檢測通過（使用者回報 2026-11-02）**：自動去背、拍照、手動擦除／補回／滑桿／復原、存檔、重開 App 資料仍在、編輯已存單品，皆無問題
- 意外：上一個 commit 誤含 `modules/tenki-bg-removal/android/build/`（1,357 個建置產物），尚未推送，已 amend 移除並加入 `.gitignore`
- **Code review 後修正**（code-reviewer：無 Critical，2 High）：
  - High：Android `Tasks.await` 加 30 秒逾時；JS `removeBackground` 加 45 秒逾時 → `failed`（避免表單一直鎖在「去背中」）
  - High＋Medium：新增原生 `normalizeAsync`（只轉正＋縮到 1600px＋JPEG，不需要 iOS 17／Play 服務）；去背沒成功時也改用它，編輯器不再載入原尺寸大圖、EXIF 方向也正確。**行為變更**：去背沒成功時存的是 1600px 版本，不是原尺寸照片
  - 編輯器在兩張圖相同時只解碼一次；`drawAsImage` 的圖用完 `dispose()`；`containRect` 在還沒量到尺寸時回傳 null
  - iOS 改用 `CGImageSourceCreateThumbnailAtIndex`（直接解碼成縮圖並套用 EXIF），不再先解碼原尺寸
  - App 啟動時清除 `cache/bg-removal/`（`clearCutoutCache`）
  - 原生寫檔檢查結果、失敗時刪除殘留檔（新錯誤碼 `ERR_WRITE`）；Android bitmap 用完 `recycle()`
  - 未處理（Low、只影響效能）：筆畫路徑每次移動重建；編輯已存單品時原圖多複製一次
- 修正後驗證：Jest 121 項通過、tsc、lint；`bash scripts/regression.sh` 4/4 全過；iOS `xcodebuild` BUILD SUCCEEDED；Android APK 重新建置成功：`SPARK-Builds/TENKI-OUTFIT/tenki-outfit-v0.1.0-20261102-1735.apk`（修正後版本尚未實機複測）

#### 第 3 階段留待之後處理
- 修正後 APK 尚未實機複測（建議第 4 階段開工前順手裝一次）
- iOS 只驗證到編譯與安裝，沒有操作驗證（使用者決定不測 iPhone）
- `cache/bg-removal/` 只在啟動時清除
- 上述兩個 Low 效能項目

### 第 4 階段 — 完成（2026-11-02，分支 `feat/phase-4-weather`，每批 commit）

使用者決定（2026-11-02）：
- **只做到縣市，不做鄉鎮**：改用 `F-D0047-091`（全臺未來 1 週，22 縣市），不需要鄉鎮清單；`weather_days.town` 一律存空字串，設定的 `town` 預設改為空字串
- 使用者有授權碼；真實回傳格式用本機 `~/.config/tenki/cwa_key` 抓一份比對（授權碼不進對話、不進 git）
- 先出 APK 給使用者實測，再做視覺測試與 code review

規格核對（2026-11-02，`opendata.cwa.gov.tw/apidoc/v1`）：欄位已改中文名稱——最高溫度、最低溫度、最高體感溫度、最低體感溫度、12小時降雨機率、天氣現象（計畫原寫的 MaxT/PoP12h 為舊格式）

做法：
- ~~一天 = 白天＋晚上兩個 12 小時時段~~ → 改為做法 B（見批次 C 的使用者決定）；日期用台灣時間
- 快取優先；超過 3 小時或下拉時重抓；只寫入今天（含）以後的日期，過去日期不再更新；今天的新資料若已沒有白天時段，保留舊的今天資料
- en / ja 用天氣代碼分類顯示（晴、多雲、陰、雨、雷雨、霧、雪），zh-TW 顯示氣象署原文

分批：
- **A｜資料層**：API 連線與解析、天氣資料存取（SQLite／記憶體）、快取規則
- **B｜畫面**：每日氣象頁天氣卡＋前後日期、下拉更新、各種狀態；設定頁移除鄉鎮；三語 → 打包 APK 給使用者實測
- **C｜收尾**：Web 視覺測試、code review、依實測回饋修正

#### 批次 A｜資料層 — 完成（2026-11-02）
- `src/lib/cwaWeather.ts`：組網址（`F-D0047-091`、縣市、6 個中文欄位名）、解析（12 小時時段 → 每天一筆；`-` 視為未知；接受 `Locations`／`locations` 大小寫；ElementValue 鍵名不同時退回取第一個數值）、`fetchForecast` 回傳 `ok / noKey / unauthorized / network / timeout(15 秒) / badResponse`、`taipeiDate`、天氣代碼分類 `wxCategory`
- `src/db/weatherRepository.ts`（介面）、`sqliteWeatherRepository.ts`（upsert 在單一 transaction）、`memoryWeatherRepository.ts`
- `src/lib/weatherService.ts`：`refreshWeather`（3 小時快取、只寫今天以後、今天沒有白天時段就不覆蓋舊資料）
- 不需要改 DB
- 解析用的範例資料 `src/__tests__/fixtures/cwa-f-d0047-091.json` 是**照規格做的**，還沒和真實回傳比對

#### 批次 B｜畫面 — 完成（2026-11-02）
- `app/(tabs)/index.tsx`：天氣卡（日期＋今天/明天/昨天、縣市、天氣圖示、最高/最低溫、天氣描述、體感溫度、降雨機率、更新時間）；左右箭頭或左右滑動切換日期（範圍：最早快取 ~ 最晚預報）；下拉更新；沒有授權碼 → 「前往設定」；錯誤橫幅（保留快取資料）；沒有資料／讀取中；下方白色畫布先放第 5 階段提示；資料來源標示
- `src/db/WeatherContext.tsx`（注入 repository、fetcher、now）、`src/db/useWeather.ts`（換縣市或授權碼時丟棄舊請求的結果）、`src/lib/weatherDates.ts`
- 手機版與網頁版 `DatabaseProvider` 都掛上 `WeatherProvider`
- 設定：`town` 預設改空字串，讀回舊存檔時一律清成空字串
- 三語字串：新增 `weather.*`（31 組）、`wx.*`（8 組），移除 `placeholder.weather`
- 驗證：Jest 170 項通過（新增 52 項）、tsc、lint；Web 視覺測試 38 項通過（還沒加天氣頁的檢查，批次 C 補上）
- 和計畫不同的地方：滑動用 React Native 內建的 `PanResponder`，不用 gesture-handler（比較簡單、測試不用另外 mock）
- APK 建置成功（2026-11-02）：`SPARK-Builds/TENKI-OUTFIT/tenki-outfit-v0.1.0-20261102-1939.apk`，已確認 bundle 內含新天氣程式碼；**待使用者實機檢測**（含真實 API 回傳格式）

- 實測回饋 1（2026-11-02）：
  - 「每日氣象仍顯示第 4–5 階段才完成」→ 那是舊版畫面，新版已移除這段文字；推測手機裝到舊 APK 或沒有覆蓋成功
  - 「授權碼沒有地方按儲存」→ 原本每打一個字就自動存、沒有任何提示，天氣頁也會跟著每個字重抓。新增 `src/components/ApiKeyField.tsx`：先打在草稿，按「儲存」（或鍵盤完成鍵）才生效；顯示「尚未儲存／已儲存／已設定」；可切換顯示或隱藏授權碼。三語字串新增 7 組。Jest 172 項、視覺 38 項通過
  - 新 APK：`tenki-outfit-v0.1.0-20261102-1951.apk`
- 實測回饋 2（2026-11-02）：
  - 「1951 在 Google Drive 看不到」→ Google Drive 上傳卡住；使用者重開 Google Drive 後已上傳
  - **使用者決定：授權碼由開發者輸入一次、編進 App，使用者不用自己申請；設定頁隱藏授權碼欄位**（推翻原本「授權碼不寫進程式碼、在設定頁輸入」的決定）
    - 授權碼放在 `.env.local` 的 `EXPO_PUBLIC_CWA_API_KEY`（已在 `.gitignore`，不進 git），打包時由 Metro 編進 bundle
    - `src/lib/cwaKey.ts`：`builtInCwaKey()`、`effectiveCwaKey()`（內建優先，沒有才用設定頁的）
    - 有內建授權碼時設定頁不顯示授權碼欄位；沒有時（例如沒放 `.env.local` 的建置）維持原本的欄位
    - 已告知使用者：編進 App 的授權碼可從 APK 拆出、所有使用者共用額度；被濫用時換授權碼重新打包
    - Jest 176 項通過
- 真實回傳比對（2026-11-02 20:00，臺北市）：結構與規格一致，解析正確；存成 `src/__tests__/fixtures/cwa-f-d0047-091-real-taipei.json`（內容不含授權碼）並新增 `cwaWeatherReal.test.ts`。Jest 178 項通過
- 授權碼內建 APK：`tenki-outfit-v0.1.0-20261102-2008.apk`，已確認 bundle 內含授權碼、已上傳 Google Drive（Google Drive App 當時沒在執行，重新開啟後上傳）
- 降雨機率只到約 3.5 天：查證（2026-11-02）F-D0047-091、F-D0047-063（中正區）、「天氣預報綜合描述」與氣象署官網鄉鎮一週預報頁，第 4 天起都是 `-`；縣市一週預報頁完全沒有降雨機率。這是氣象署資料本身的限制，App 顯示「降雨機率 —」。待使用者說明在哪裡看到 7 天的降雨機率

#### 批次 C｜收尾 — 完成（2026-11-02）
- 視覺測試新增 6 項：每日氣象沒有授權碼時的提示與「前往設定」、沒有舊佔位文字、「前往設定」切到設定頁、設定頁授權碼欄位與「儲存」；網頁版打包時用 `EXPO_PUBLIC_CWA_API_KEY=` 不編入授權碼（已確認 `dist/` 不含授權碼）
- Code review（code-reviewer：無 Critical，2 Medium，6 Low；確認授權碼不在任何 git 紀錄）修正：
  - Medium：App 回到前景時更新「今天」並檢查快取（過期才重抓）；App 開著跨過台灣時間午夜也會更新
  - Low：回傳內容不是 JSON → `badResponse`（原本誤報「無法連線」）；換縣市／換授權碼／畫面關掉時取消進行中的請求（`AbortSignal`，新狀態 `aborted`）；下拉更新進行中不重複送出；快取時間在未來（裝置時間曾經比較快）時視為過期；本機快取讀寫失敗顯示「無法讀取本機天氣資料」（新錯誤 `storage`），不再誤報氣象署問題；天氣寫入改用 `withTransactionAsync`（不另開連線，避免 SQLITE_BUSY；沒有改 DB 設定）
  - 無障礙：日期區塊 `accessibilityLiveRegion`、裝飾圖示不朗讀、溫度念成一句「最高 25°，最低 19°」、Android 下拉更新顏色
  - 三語字串新增 2 組
- 未處理：卡片左右滑動沒有自動化測試（Low）
- **使用者決定（2026-11-02）：做法 B「以出門時段為主」**——以 D 日為例：
  - 最高溫、最高體感、降雨機率、天氣：D 日 06:00–18:00（白天）
  - 最低溫、最低體感：D-1 日 18:00–D 日 06:00（前一晚到清晨）；預報裡沒有前一晚時用白天的最低溫
  - 晚上才抓的「今天」只剩當晚時段：全部用當晚時段（`hasDaytime = false`）；其他沒有白天時段的日期不產生
  - 已告知使用者：數字會和氣象署網站「白天／晚上」欄位對不太上
  - 手機上已快取的過去日期維持舊算法（今天以後的日期下次抓資料時會被覆蓋）
  - `parseForecast` 改寫；測試改為 B 的預期，新增「晚上下雨不影響白天」「沒有前一晚時用白天最低溫」；Jest 189 項、視覺 44 項通過
- 驗證：Jest 187 項、tsc、lint；`bash scripts/regression.sh` 4/4 全過（視覺 44 項）
- **實機複測通過（使用者回報 2026-11-02）**：`tenki-outfit-v0.1.0-20261102-2054.apk`（做法 B）——安裝覆蓋、內建授權碼、天氣卡數值、切換日期／滑動／下拉更新／回到前景、離線錯誤處理全部正常；降雨機率第 4 天起顯示「—」維持現狀

### 第 5 階段 — 完成（2026-11-02，分支 `feat/phase-5-outfits`，從 `feat/phase-4-weather` 分出，每批 commit）

使用者決定（2026-11-02）：
- **穿搭一定要有日期**：沒選日期不能存；不做「未排日期」清單。DB 的 `outfits.date` 維持可為 NULL（不另改 DB），由 App 存檔時檢查；讀到舊的 NULL 資料視為未來（沿用暫存區規則）
- 同一天可排多套穿搭，每日檢視依序列出
- 點穿搭打開畫布編輯；畫布上可刪除穿搭（點兩次確認，不用系統對話框）
- ~~畫布只做拖拉、縮放（`rotation` 固定 0）~~ → **使用者決定（2026-11-02，批次 A 後）：拖拉、縮放、雙指旋轉都要**（存 `outfit_items.rotation`，不需要改 DB）；點單品移到最上層；可從畫布移除單品
- 位置以畫布寬度的比例存（換手機相對位置不變）
- 總金額：有填價格的單品才加總（含已封存單品），全部沒填顯示「—」
- 「最近使用」（`last_used_at`）= 該單品所在穿搭的最晚日期（含未來日期）
- 月曆自己做（日／週／月格子），不新增套件

分批：
- **A｜資料層**：DB v2（items 加封存欄位）、穿搭 repository（SQLite／記憶體）、改寫永久刪除規則與測試、總金額與最近使用
- **B｜穿搭畫布**：選單品、拖拉／縮放／雙指旋轉、選日期（必填）存檔、編輯、刪除
- **C｜每日氣象頁**：日／週／月切換、月曆標示有穿搭的日子、當日／當週穿搭與總金額；暫存區頁說明文字
- **D｜收尾**：Web 視覺測試、code review、APK 實機測試

#### 批次 A｜資料層 — 完成（2026-11-02）
- DB v2（`src/db/migrations.ts`）：`ALTER TABLE items ADD COLUMN archived_at TEXT`，舊資料保留；沒有加其他欄位或索引
- `src/db/outfitRepository.ts`：介面、`OutfitInput`（日期必填）、`validateOutfitInput`（日期格式 `date`、沒有單品 `empty`、同一件重複 `duplicate` → `OutfitValidationError`）
- `src/db/sqliteOutfitRepository.ts`：`listInRange`（含兩端，依日期→建立時間）、`get`、`create`、`update`、`delete`，寫入都在排他交易內；讀出的穿搭帶完整單品資料（含已封存、在暫存區的）
- `src/db/sqliteOutfitRules.ts`：永久刪除規則（今天以後／沒有日期的穿搭移除該單品、變空就刪穿搭；過去穿搭還用到 → `archived_at`；否則真正刪除）、「最近使用」重算（最晚穿搭日期，含未來）、沒人參照的封存單品真正刪除
- `src/db/sqliteItemRepository.ts`：`list`／`listTrash`／`get` 排除已封存；`purge`／`purgeExpired` 套用上述規則，回傳「真正刪除」的單品
- `src/db/memoryItemRepository.ts`：新增 `createMemoryDatabase`（單品與穿搭共用一份記憶體資料，規則同 SQLite）；`createMemoryItemRepository` 保留為包裝
- `src/lib/outfitTotals.ts`（總金額，全部沒填 → null）、`src/lib/outfitService.ts`（`saveOutfit`／`deleteOutfit`：刪除真正刪掉的封存單品照片、通知畫面）；`purgeItem` 封存時不刪照片
- `src/db/OutfitRepositoryContext.tsx`；手機版與網頁版 `DatabaseProvider` 掛上穿搭資料層
- 測試：新增 `outfitData.test.ts`（同一組規則測試跑記憶體版與 **真的 SQLite**——`src/__tests__/helpers/nodeSqlite.ts` 用 Node 內建 `node:sqlite` 包成 expo-sqlite 介面，需 Node 22.5+）、`outfitService.test.ts`、`outfitTotals.test.ts`、migration v1→v2 實際升級測試；舊的永久刪除 SQL 逐字比對測試改由真 SQLite 測試取代
- 驗證：Jest 218 項通過（原 189 → 新增 29、移除 2 項舊比對）、tsc、lint 0 警告；`bash scripts/regression.sh` 4/4 全過（視覺 44 項）
- 和計畫不同的地方：
  - `Outfit` 型別的 `items` 改為 `pieces`（每件帶完整 `Item`），畫面不用再另外查單品；`Item` 型別沒有加封存欄位（封存單品只會透過穿搭讀到）
  - `ItemRepository.purge` 回傳改為 `Item[]`（真正刪除的單品），封存時回傳空陣列
  - 穿搭變動沿用 `useItemsVersion` 通知（會改到單品的最近使用），不另開版本號
  - 順手修掉第 4 階段留下的 lint 警告（`cwaKey.test.ts` 的 `require`）

#### 批次 B｜穿搭畫布 — 完成（2026-11-02，手勢待批次 D 實機驗證）
- `src/lib/outfitCanvas.ts`：畫布 3:4；位置以畫布寬度為單位（x, y = 中心點）；基本大小 = 畫布寬 0.45；縮放 0.2–4 倍；中心點限制在畫布內；旋轉正規化到 (-π, π]；新增單品放最上層並錯開；移到最上層時 z 重新編號
- `src/lib/calendar.ts`：月份加減、星期日開頭的週、月曆格子（批次 C 共用）
- `src/components/OutfitEditor.tsx`：上方「取消／標題／儲存」；日期列（沒選日期時顯示「要先選日期才能儲存」，儲存停用）；白色畫布；「加入單品」、選取時「從畫布移除」、總金額；編輯時「刪除穿搭」（點兩次確認）；儲存／刪除失敗提示
  - 每件單品：單指拖拉、雙指縮放、雙指旋轉同時辨識（gesture-handler `Gesture.Simultaneous`，`runOnJS(true)`）；手勢中只更新該單品自己的狀態，放開才回寫；手指放開再按下時把已結束的部分累加，不會跳回原位；碰到就選取並移到最上層
- `src/components/OutfitCanvasView.tsx`：唯讀畫布與共用的單品方框樣式（批次 C 用）；沒照片的單品顯示衣服圖示＋名稱
- `src/components/ItemPickerSheet.tsx`（分類分頁＋三欄方格，點一下加入、再點拿掉）、`MonthGrid.tsx`、`DatePickerSheet.tsx`
- `app/outfit/edit.tsx`（modal）：`?date=` 新增並帶入日期、`?id=` 編輯；`src/db/useOutfits.ts`（`useOutfit`、`useOutfitsInRange`）
- 每日氣象頁右下 ＋：帶目前看的日期開新增穿搭；沒有授權碼時也顯示（穿搭不需要天氣資料）
- 三語字串新增 22 組（`outfit.*`、`calendar.*`）
- 驗證：Jest 236 項通過（新增 18 項：畫布計算 7、月曆 4、編輯器 6〔含 gesture-handler 模擬拖拉／縮放／旋轉〕、每日氣象 ＋ 1）、tsc、lint；`bash scripts/regression.sh` 4/4 全過（視覺 51 項，新增 7 項：從每日氣象按 ＋ → 帶入日期 → 加入單品 → 總金額 → 存檔關閉）
- 和計畫不同的地方：
  - 手勢沒有用 reanimated（和去背編輯器一樣用 `runOnJS(true)` + React 狀態），測試不用另外 mock；如果實機拖拉不夠順再改用 reanimated
  - 疊放順序用 `zIndex`，不重新排列子元件（避免手勢進行中原生畫面被搬動）
  - 穿搭名稱欄位沒有做（計畫沒有要求；DB 有 `name`，一律存空字串）
- APK（批次 A＋B）：`SPARK-Builds/TENKI-OUTFIT/tenki-outfit-v0.1.0-20261102-2155.apk`，已確認 bundle 內含穿搭畫布程式碼與內建授權碼
  - Google Drive 上傳意外：重開 Google Drive App 時取消了進行中的上傳並刪掉雲端項目；重新複製同一個檔案後上傳成功（用 `com.google.drivefs.item-id` 屬性確認）
  - **實機檢測通過（使用者回報 2026-11-02）**：拖拉、雙指縮放、雙指旋轉都正常

#### 批次 C｜每日氣象頁 — 完成（2026-11-02）
- `app/(tabs)/index.tsx` 改寫：
  - 右上 `ViewModeSwitch`（月曆圖示＋日／週／月）
  - **日**：天氣卡＋當天的穿搭（每套一張唯讀畫布卡片＋總金額，點了打開編輯）；沒有穿搭時顯示「這天還沒有穿搭，按右下 ＋ 新增」
  - **週**：星期日～六七列，每列日期、有快取時顯示天氣圖示與高低溫、該日穿搭縮圖（點縮圖編輯、點日期切到日檢視）；上一週／下一週
  - **月**：`MonthGrid`，有穿搭的日子顯示小圓點（螢幕閱讀器念「有穿搭」）；點日期在下方列出當天穿搭；上個月／下個月
  - 沒有授權碼時：「請先到設定」改放在天氣卡裡，穿搭、檢視切換、＋ 照常使用（原本整頁只顯示提示）
  - 日檢視的前後箭頭／滑動仍限制在有天氣資料的範圍；從週、月曆選到範圍外的日期時，可以往範圍的方向一天一天走回來
  - ＋ 一律帶目前選的日期
- `src/components/OutfitCard.tsx`、`ViewModeSwitch.tsx`；`MonthGrid` 標示有穿搭的日子
- 暫存區頁加上「永久刪除後，過去穿搭仍會保留這件單品的照片」
- 三語字串新增 11 組（`view.*`、`calendar.*`、`weather.noOutfit`、`outfit.openLabel`、`trash.archiveNote`），移除 `weather.outfitsComing`
- 驗證：Jest 243 項通過（新增 7 項：每日氣象頁穿搭 6、暫存區說明 1）、tsc、lint；`bash scripts/regression.sh` 4/4 全過（視覺 56 項，新增 5 項：存檔後日檢視出現穿搭與總金額、週檢視、月曆標示今天有穿搭、暫存區說明）
- 和計畫不同的地方：日／週／月切換放在頁面內容右上（不是導覽列的 headerRight），比較好測試，看起來一樣在右上
- APK（批次 A～C）：`SPARK-Builds/TENKI-OUTFIT/tenki-outfit-v0.1.0-20261102-2219.apk`，已確認含批次 C 程式碼與內建授權碼；Google Drive 上傳中途網路逾時後停在「等待重試」，重新複製檔案後 22:34 上傳完成；**待使用者實機檢測**

#### 批次 D｜收尾 — 完成（2026-11-02）
- 使用者決定（2026-11-02）：批次 C 的 APK 不等實機回報，有問題之後再改；直接做收尾
- Code review（code-reviewer：無 Critical，1 High，5 Medium，8 Low；確認授權碼沒有進任何追蹤檔案）修正：
  - **High**：在畫布上點一下單品會「選取後馬上又取消」（背景 `Pressable` 在手指放開時也收到 onPress），只有拖拉過才看得到「從畫布移除」。背景改用 gesture-handler 的 `Tap`，放在單品後面的兄弟元件，點單品不會觸發
  - Medium：
    - 開 App 時的自動清除只有封存、沒有真正刪除時也通知畫面重新讀取（避免舊畫面把封存單品存回未來穿搭）
    - 月檢視換月份後，下方選取日期的穿搭不見 → 查詢範圍涵蓋選取的日期
    - 拖拉中的單品還在舊的疊放層 → 手勢中也用新的 z
    - SQLite 的 `update`／`moveToTrash`／`restore` 沒有排除封存單品（記憶體版有）→ 補上，兩邊用同一組測試
    - 螢幕閱讀器可以選取畫布上的單品（`accessibilityRole="button"` + `onAccessibilityTap`）；移動、縮放、旋轉仍只能用手勢
  - Low：
    - 手勢計數改成記錄「哪些手勢已開始」，沒有 onBegin 的 onFinalize 不算
    - 手勢結束併入時先套用上下限（縮放超過 4 倍後不會有「要先縮回去才有反應」）
    - 存成今天以後的穿搭時，自動拿掉已封存的單品（和永久刪除規則一致；拿完沒有單品 → 不能存）
    - 記憶體版遇到不存在的單品也報錯（和 SQLite 外鍵一致）
    - 英文「1 items」改為「item(s)」；移除沒用到的 `outfit.needItems`
  - 未處理（Low）：讀取穿搭失敗時畫面一直轉圈（沒有錯誤狀態）；從很遠的日期按箭頭只能一天一天走回來；週標題跨年時沒有年份；螢幕閱讀器無法移動／縮放單品
- 驗證：Jest 253 項通過（新增 10 項）、tsc、lint；`bash scripts/regression.sh` 4/4 全過（視覺 56 項）

### 第 6 階段 — 進行中（2026-11-03，分支 `feat/phase-6-suggestions`，從 `feat/phase-5-outfits` 分出，每批 commit）

使用者決定（2026-11-03）：
- **溫度用體感溫度**（最高／最低體感的平均分段）；缺體感時改用氣溫
- **用季節代表厚薄**（單品沒有厚薄欄位，不改 DB）：
  - ≥28：夏季、不加外套
  - 20–27：春／夏／秋，外套可有可無（隨機）
  - 13–19：春／秋／冬，一定加外套
  - <13：冬季，一定加外套
  - 最低體感 <20 時一定加外套（例：最高 29、最低 19 → 平均 24 挑春夏秋單品，且一定加外套）
  - 單品沒填季節 = 四季；沒填場合 = 全場合
- **組合**：上衣＋下著 或 連身（兩種都湊得出來時隨機選一種）＋外套（依上面規則）＋鞋子；包包、配件有就各配一件；「其他」不推薦。缺鞋子／必要的外套時照樣給建議並提示缺少什麼；連上衣＋下著／連身都沒有 → 「沒有符合的單品」
- **隨機推薦＋「更新」按鈕**：更新後隨機再一套，盡量不和上一套相同；只有一種組合時提示「沒有其他組合了」。換分頁再回來維持同一套；換日期、換場合、按更新才重抽
- **建議下方兩句說明**（三語固定句型，不用 AI）：第一句介紹單品組合與適合場合；第二句說明體感溫度範圍、溫差／外套、降雨機率 ≥60% 帶傘提示
- **「存成穿搭」打開畫布**：日期帶入今天／明天，單品依分類自動排好位置，使用者調整後自己按儲存
- 沒有天氣資料時忽略溫度條件，並說明
- 和原計畫不同：「一鍵存成該日穿搭」改為打開畫布、自動排版後由使用者按儲存；新增兩句說明

分批：
- **A｜引擎**：`src/lib/suggestion.ts`（溫度分段、候選篩選、隨機組合、避免重複）、自動排版、兩句說明；三語字串
- **B｜畫面**：第四頁（今日／明日、天氣摘要、場合篩選、唯讀畫布＋單品清單、兩句說明、更新、存成穿搭）、編輯器接收預先選好的單品 → 打包 APK
- **C｜收尾**：Web 視覺測試、code review

#### 批次 A｜引擎 — 完成（2026-11-03）
- `src/lib/suggestion.ts`：
  - `weatherBasis`：完整體感優先 → 完整氣溫 → 只有一個值時用那個值
  - `tempBand`、`outerwearRule`（≥28 不加；20–27 可有可無；<20 或最低 <20 一定加；沒天氣 = 可有可無）
  - `candidatesFor`：季節／場合篩選
  - `suggestOutfit`：隨機組合；有 `previous` 時重抽最多 20 次，還是一樣就逐格換掉找第一個不同組合，都沒有 → `noAlternative`；回傳 `missing`（必要外套、鞋子）、`rainy`（≥60%）
  - `suggestionLayout`：依分類自動排版（批次 B 後依使用者指定改版，見下方）
- `src/lib/suggestionText.ts`：`describeSuggestion` 兩句說明；沒填名稱用分類名稱（英文用單數「a top」）
- 三語字串新增 24 組（`suggest.*`）
- 驗證：Jest 285 項通過（新增 32 項）、tsc、lint；`bash scripts/regression.sh` 視覺 56 項通過
- 和計畫不同的地方：沒有天氣資料時季節也不篩（溫度決定季節），第二句改為「這套只依場合挑選」

#### 批次 B｜畫面 — 完成（2026-11-03）
- `app/(tabs)/suggest.tsx` 改寫（取代佔位畫面）：
  - 上方今日／明日切換；天氣摘要（體感範圍、降雨機率；沒資料時「沒有這天的天氣資料」）
  - 場合篩選（全部場合＋6 種，單選）
  - 建議卡片：唯讀畫布（自動排版）、單品名稱、總金額（有填價格時）、兩句說明、缺少的分類、「沒有其他組合了」
  - 「更新」重抽（避開上一套）；「存成穿搭」→ `/outfit/edit?date=…&items=id1,id2`
  - 衣櫃空的 → 「衣櫃裡還沒有單品，先到「服裝」新增」；沒有符合 → 「沒有符合的單品」＋提示
  - 維持同一套的規則：只有日期、場合、天氣條件（溫度分段、外套規則）變了才重抽；重抓到相同條件的天氣不重抽；建議裡的單品被刪掉、或原本沒有建議而衣櫃變了也重抽。畫面上的單品名稱與照片、帶傘提示用最新資料
- `app/outfit/edit.tsx`：新增 `items` 參數，`presetPieces` 依分類排好位置後放上畫布（找不到、重複的 id 略過）
- 三語字串新增 15 組，移除 `placeholder.suggest`
- 驗證：Jest 297 項通過（新增 12 項：建議頁 10、`presetPieces` 2）、tsc、lint；`bash scripts/regression.sh` 4/4 全過（視覺 56 項，建議頁的視覺測試在批次 C 補）
- 和計畫不同的地方：
  - 英文「更新」用 Shuffle（比 Refresh 清楚是重抽）
  - 帶傘提示沒有另外做圖示，寫在第二句說明裡
- APK：`SPARK-Builds/TENKI-OUTFIT/tenki-outfit-v0.1.0-20261103-0941.apk`，已上傳 Google Drive；已確認 bundle 內含建議頁程式碼與內建授權碼；**待使用者實機檢測**
- 實測回饋 1（2026-11-03）：**使用者指定排版**——上衣左上、外套右上、下著左下、包包右邊中間、鞋子右下；使用者沒指定的：連身放左半邊（上衣＋下著的位置）、配件放中間空隙。上衣、外套縮成 scale 1，左右不重疊。新增 1 項排版位置測試，Jest 298 項通過；APK `tenki-outfit-v0.1.0-20261103-0950.apk` 已上傳 Google Drive，待實機檢測
- 實測回饋 2（2026-11-03）：使用者提供兩張參考圖，要「穿在身上」的疊法；**使用者決定**：包包右中、配件左中（都大一點）；外套在上衣左後方露出一半（像參考圖 2）
  - `src/lib/outfitLayout.ts`：`layoutOutfit`——上衣置中在上、下著上緣壓住上衣下襬 10%、鞋子壓在下著下緣（鞋高 45%）；有外套時上衣往右、外套往左各移開衣服寬度的 28%；包包／配件在腰線稍低處左右兩側；整套依高度與寬度等比縮小放進畫布；疊放：外套 < 下著／連身 < 上衣 < 鞋子 < 包包 < 配件
  - 以「照片裡真正有衣服的範圍」排版：`alphaBounds`（透明度 ≥24 的範圍）、`visibleRect`（contain 進方框後的實際範圍）；`src/lib/photoBounds.ts` 用 Skia 把照片縮到最長邊 160px 讀像素量測，結果在 App 執行期間快取；Web 版（`photoBounds.web.ts`）不量測，退回整張照片
  - `src/lib/usePieceShapes.ts`：建議頁與「存成穿搭」都等量測完才排版（避免畫面跳動）
  - `suggestionLayout`、`presetPieces` 改用新排版（接受 shapes）；取代實測回饋 1 的四格排版
  - 測試：新增 `outfitLayout.test.ts` 11 項，移除四格排版測試 1 項；Jest 308 項、tsc、lint；`bash scripts/regression.sh` 4/4 全過（視覺 56 項）
  - APK `tenki-outfit-v0.1.0-20261103-1007.apk` 已上傳 Google Drive，待實機檢測
  - 已知限制：衣服實際長短不知道，各分類的寬度是估的（上衣 0.52、下著 0.44、鞋子 0.24、包包 0.36、配件 0.28 畫布寬）；手機上的量測只能實機驗證
- 實測回饋 3（2026-11-03）：**使用者決定改回四格排版**（取代實測回饋 2 的疊法）——上衣左上、下著左下（比上衣長、格子比較大）、外套右上、包包右中、配件在包包左邊、鞋子右下；連身佔整個左半邊（使用者沒指定）
  - `layoutOutfit` 改為每個分類一個固定格子（`SPOTS`），衣服依量到的實際範圍等比放大塞滿格子、置中；格子之間不重疊。照片範圍量測（`photoBounds`、`usePieceShapes`）保留
  - 測試：`outfitLayout.test.ts` 疊法測試換成格子測試（6 項）；Jest 307 項、tsc、lint；`bash scripts/regression.sh` 4/4 全過（視覺 56 項）
  - APK `tenki-outfit-v0.1.0-20261103-1016.apk` 已上傳 Google Drive，待實機檢測
