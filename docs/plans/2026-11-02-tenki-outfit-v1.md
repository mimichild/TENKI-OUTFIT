# TENKI OUTFIT 天氣穿搭 — v1 開發計畫

> 建立：2026-11-02　狀態：**第 4 階段進行中**
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

### 第 4 階段 — 進行中（2026-11-02，分支 `feat/phase-4-weather`，每批 commit）

使用者決定（2026-11-02）：
- **只做到縣市，不做鄉鎮**：改用 `F-D0047-091`（全臺未來 1 週，22 縣市），不需要鄉鎮清單；`weather_days.town` 一律存空字串，設定的 `town` 預設改為空字串
- 使用者有授權碼；真實回傳格式用本機 `~/.config/tenki/cwa_key` 抓一份比對（授權碼不進對話、不進 git）
- 先出 APK 給使用者實測，再做視覺測試與 code review

規格核對（2026-11-02，`opendata.cwa.gov.tw/apidoc/v1`）：欄位已改中文名稱——最高溫度、最低溫度、最高體感溫度、最低體感溫度、12小時降雨機率、天氣現象（計畫原寫的 MaxT/PoP12h 為舊格式）

做法：
- 一天 = 白天＋晚上兩個 12 小時時段：最高/最低溫與體感取極值、降雨機率取較大、天氣現象取白天；日期用台灣時間
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

#### 批次 C｜收尾 — 待開始（等實測回饋）
