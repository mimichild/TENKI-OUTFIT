#!/bin/bash
set -e

PORT=8092
BASE_URL="http://localhost:$PORT"
OUT_DIR="${TMPDIR:-/tmp}/tenki-e2e"
mkdir -p "$OUT_DIR"
PASS=0
FAIL=0

log_pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
log_fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

expect_text() {
  local label="$1" needle="$2" body="$3"
  if echo "$body" | grep -q "$needle"; then log_pass "$label"; else log_fail "${label}（找不到「${needle}」）"; fi
}

echo "🔨 Building web export..."
# 視覺測試固定用「沒有內建授權碼」的版本：不把 .env.local 的授權碼編進 dist，也不會從瀏覽器打氣象署
if ! EXPO_PUBLIC_CWA_API_KEY= npx expo export --platform web > "$OUT_DIR/expo-export.log" 2>&1; then
  echo "❌ Web export failed:"; tail -20 "$OUT_DIR/expo-export.log"; exit 1
fi

echo "🌐 Starting static server on port $PORT..."
npx serve dist --listen $PORT > "$OUT_DIR/serve.log" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
  npx agent-browser close 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 15); do
  if curl -s "$BASE_URL" > /dev/null 2>&1; then break; fi
  sleep 1
done

# ── 首頁 = 每日氣象，四個分頁都要在 ──
npx agent-browser open "$BASE_URL" > /dev/null 2>&1
npx agent-browser wait --load networkidle > /dev/null 2>&1
npx agent-browser wait 2000 > /dev/null 2>&1
HOME_TEXT=$(npx agent-browser get text body 2>/dev/null)
for tab in 設定 服裝 每日氣象 穿搭建議; do
  expect_text "分頁「${tab}」存在" "$tab" "$HOME_TEXT"
done
npx agent-browser screenshot "$OUT_DIR/home.png" > /dev/null 2>&1

# ── 設定頁 ──
npx agent-browser close > /dev/null 2>&1 || true
npx agent-browser open "$BASE_URL/settings" > /dev/null 2>&1
npx agent-browser wait --load networkidle > /dev/null 2>&1
npx agent-browser wait 3000 > /dev/null 2>&1
SETTINGS_TEXT=$(npx agent-browser get text body 2>/dev/null)
echo "$SETTINGS_TEXT" > "$OUT_DIR/settings.txt"
for label in 語言 幣別 主題色 地區 氣象署授權碼 暫存區 備份與還原; do
  expect_text "設定項目「${label}」存在" "$label" "$SETTINGS_TEXT"
done
npx agent-browser screenshot "$OUT_DIR/settings.png" > /dev/null 2>&1

# ── 第 2 階段：服裝頁、新增單品頁、暫存區 ──
visit() {
  npx agent-browser close > /dev/null 2>&1 || true
  npx agent-browser open "$BASE_URL$1" > /dev/null 2>&1
  npx agent-browser wait --load networkidle > /dev/null 2>&1
  npx agent-browser wait 3000 > /dev/null 2>&1
  npx agent-browser get text body 2>/dev/null
}

expect_text "設定頁暫存區顯示件數" "0 件" "$SETTINGS_TEXT"

CLOSET_TEXT=$(visit /closet)
echo "$CLOSET_TEXT" > "$OUT_DIR/closet.txt"
for label in 全部 上衣 下著 連身 外套 鞋子 包包 配件 其他 還沒有單品; do
  expect_text "服裝頁「${label}」存在" "$label" "$CLOSET_TEXT"
done
npx agent-browser screenshot "$OUT_DIR/closet.png" > /dev/null 2>&1

NEW_TEXT=$(visit /item/new)
echo "$NEW_TEXT" > "$OUT_DIR/item-new.txt"
for label in 新增單品 從相簿選擇 拍照 品牌 名稱 分類 價格 場合 季節 儲存 取消 'NT\$'; do
  expect_text "新增頁「${label}」存在" "$label" "$NEW_TEXT"
done
npx agent-browser screenshot "$OUT_DIR/item-new.png" > /dev/null 2>&1

# ── 實際操作：從服裝頁按 ＋ 新增一件單品，存檔後要出現在照片牆（證明 JS 有正常 hydrate）──
visit /closet > /dev/null
npx agent-browser click '[aria-label="新增單品"]' > /dev/null 2>&1
npx agent-browser wait 1500 > /dev/null 2>&1
npx agent-browser fill '[aria-label="名稱"]' 'E2E白襯衫' > /dev/null 2>&1
npx agent-browser fill '[aria-label="價格"]' '1290' > /dev/null 2>&1
npx agent-browser click '[aria-label="儲存"]' > /dev/null 2>&1
npx agent-browser wait 1500 > /dev/null 2>&1
if npx agent-browser eval '!!document.querySelector("[aria-label=\"E2E白襯衫\"]")' 2>/dev/null | grep -q true; then
  log_pass "新增單品後出現在照片牆"
else
  log_fail "新增單品後沒有出現在照片牆"
fi
npx agent-browser screenshot "$OUT_DIR/closet-added.png" > /dev/null 2>&1

# ── 第 5 階段：從每日氣象按 ＋ 打開穿搭畫布，放上剛新增的單品並存檔 ──
npx agent-browser find text 每日氣象 click > /dev/null 2>&1 || true
npx agent-browser wait 1500 > /dev/null 2>&1
npx agent-browser click '[aria-label="新增穿搭"]' > /dev/null 2>&1
npx agent-browser wait 1500 > /dev/null 2>&1
OUTFIT_TEXT=$(npx agent-browser get text body 2>/dev/null)
echo "$OUTFIT_TEXT" > "$OUT_DIR/outfit-new.txt"
for label in 新增穿搭 日期 加入單品 '總金額 —'; do
  expect_text "穿搭畫布「${label}」存在" "$label" "$OUTFIT_TEXT"
done
if echo "$OUTFIT_TEXT" | grep -q "要先選日期才能儲存"; then log_fail "從每日氣象打開時沒有帶入日期"; else log_pass "從每日氣象打開時帶入日期"; fi
npx agent-browser click '[data-testid="add-items"]' > /dev/null 2>&1 || true
npx agent-browser wait 1000 > /dev/null 2>&1
npx agent-browser click '[role="checkbox"][aria-label="E2E白襯衫"]' > /dev/null 2>&1 || log_fail "單品選擇清單裡找不到剛新增的單品"
npx agent-browser wait 500 > /dev/null 2>&1
npx agent-browser find text 完成 click > /dev/null 2>&1 || true
npx agent-browser wait 1000 > /dev/null 2>&1
OUTFIT_TEXT=$(npx agent-browser get text body 2>/dev/null)
expect_text "放上單品後顯示總金額" '總金額 NT\$1,290' "$OUTFIT_TEXT"
npx agent-browser screenshot "$OUT_DIR/outfit-canvas.png" > /dev/null 2>&1
npx agent-browser click '[data-testid="save-outfit"]' > /dev/null 2>&1 || true
npx agent-browser wait 1500 > /dev/null 2>&1
if npx agent-browser get url 2>/dev/null | grep -q "/outfit/edit"; then log_fail "穿搭存檔後沒有關閉畫布"; else log_pass "穿搭存檔後關閉畫布"; fi
if npx agent-browser eval '!!document.querySelector("[aria-label=\"編輯穿搭，1 件單品，NT$1,290\"]")' 2>/dev/null | grep -q true; then
  log_pass "每日氣象頁顯示剛存的穿搭與總金額"
else
  log_fail "每日氣象頁沒有顯示剛存的穿搭"
fi
npx agent-browser screenshot "$OUT_DIR/weather-day-outfit.png" > /dev/null 2>&1
npx agent-browser click '[role="tab"][aria-label="週"]' > /dev/null 2>&1 || log_fail "找不到「週」"
npx agent-browser wait 1000 > /dev/null 2>&1
WEEK_TEXT=$(npx agent-browser get text body 2>/dev/null)
expect_text "週檢視顯示整週日期" "（日）" "$WEEK_TEXT"
expect_text "週檢視顯示整週日期" "（六）" "$WEEK_TEXT"
npx agent-browser screenshot "$OUT_DIR/weather-week.png" > /dev/null 2>&1
npx agent-browser click '[role="tab"][aria-label="月"]' > /dev/null 2>&1 || log_fail "找不到「月」"
npx agent-browser wait 1000 > /dev/null 2>&1
if npx agent-browser eval '[...document.querySelectorAll("[aria-label]")].some(e => / 今天 有穿搭$/.test(e.getAttribute("aria-label")))' 2>/dev/null | grep -q true; then
  log_pass "月曆在今天標示有穿搭"
else
  log_fail "月曆沒有在今天標示有穿搭"
fi
npx agent-browser screenshot "$OUT_DIR/weather-month.png" > /dev/null 2>&1
npx agent-browser click '[role="tab"][aria-label="日"]' > /dev/null 2>&1 || true


# ── 第 6 階段：穿搭建議（同一個工作階段，沿用剛新增的白襯衫，再加一件下著）──
npx agent-browser click 'a[href="/closet"]' > /dev/null 2>&1 || log_fail "切不到服裝分頁"
npx agent-browser wait 1500 > /dev/null 2>&1
npx agent-browser click '[aria-label="新增單品"]' > /dev/null 2>&1 || log_fail "服裝頁找不到「新增單品」"
npx agent-browser wait 1500 > /dev/null 2>&1
npx agent-browser fill '[aria-label="名稱"]' 'E2E牛仔褲' > /dev/null 2>&1 || log_fail "新增頁找不到「名稱」"
npx agent-browser click '[role="button"][aria-label="下著"]' > /dev/null 2>&1 || log_fail "新增頁找不到分類「下著」"
npx agent-browser click '[aria-label="儲存"]' > /dev/null 2>&1 || log_fail "新增頁找不到「儲存」"
npx agent-browser wait 1500 > /dev/null 2>&1
npx agent-browser click 'a[href="/suggest"]' > /dev/null 2>&1 || log_fail "切不到穿搭建議分頁"
npx agent-browser wait 2000 > /dev/null 2>&1
SUGGEST_TEXT=$(npx agent-browser get text body 2>/dev/null)
echo "$SUGGEST_TEXT" > "$OUT_DIR/suggest.txt"
for label in 今日 明日 全部場合 上班 沒有這天的天氣資料 'E2E白襯衫搭配E2E牛仔褲' '目前沒有這天的天氣資料，這套只依場合挑選。' '缺少：鞋子' '總金額 NT\$1,290' 更新 存成穿搭; do
  expect_text "穿搭建議頁「${label}」存在" "$label" "$SUGGEST_TEXT"
done
if echo "$SUGGEST_TEXT" | grep -q "第 6 階段"; then log_fail "穿搭建議頁還有舊的佔位文字"; else log_pass "穿搭建議頁沒有舊的佔位文字"; fi
npx agent-browser screenshot "$OUT_DIR/suggest.png" > /dev/null 2>&1
npx agent-browser click '[role="button"][aria-label="更新"]' > /dev/null 2>&1 || log_fail "找不到「更新」"
npx agent-browser wait 800 > /dev/null 2>&1
expect_text "只有一種組合時按更新顯示「沒有其他組合了」" "沒有其他組合了" "$(npx agent-browser get text body 2>/dev/null)"
npx agent-browser click '[role="tab"][aria-label="明日"]' > /dev/null 2>&1 || log_fail "找不到「明日」"
npx agent-browser wait 800 > /dev/null 2>&1
npx agent-browser click '[role="button"][aria-label="存成穿搭"]' > /dev/null 2>&1 || log_fail "找不到「存成穿搭」"
npx agent-browser wait 1500 > /dev/null 2>&1
if npx agent-browser get url 2>/dev/null | grep -q "/outfit/edit"; then log_pass "「存成穿搭」打開穿搭畫布"; else log_fail "「存成穿搭」沒有打開穿搭畫布"; fi
SUGGEST_CANVAS_TEXT=$(npx agent-browser get text body 2>/dev/null)
echo "$SUGGEST_CANVAS_TEXT" > "$OUT_DIR/suggest-canvas.txt"
expect_text "畫布帶入建議的單品（總金額）" '總金額 NT\$1,290' "$SUGGEST_CANVAS_TEXT"
if echo "$SUGGEST_CANVAS_TEXT" | grep -q "要先選日期才能儲存"; then log_fail "畫布沒有帶入建議的日期"; else log_pass "畫布帶入建議的日期"; fi
npx agent-browser screenshot "$OUT_DIR/suggest-canvas.png" > /dev/null 2>&1

SUGGEST_EMPTY_TEXT=$(visit /suggest)
expect_text "穿搭建議頁衣櫃空的提示" "衣櫃裡還沒有單品" "$SUGGEST_EMPTY_TEXT"

# ── 第 4 階段：每日氣象（沒有授權碼時引導到設定）──
WEATHER_TEXT=$(visit /)
echo "$WEATHER_TEXT" > "$OUT_DIR/weather.txt"
for label in 請先到設定輸入氣象署授權碼 前往設定; do
  expect_text "每日氣象頁「${label}」存在" "$label" "$WEATHER_TEXT"
done
if echo "$WEATHER_TEXT" | grep -q "第 4–5 階段"; then log_fail "每日氣象頁還有舊的佔位文字"; else log_pass "每日氣象頁沒有舊的佔位文字"; fi
npx agent-browser screenshot "$OUT_DIR/weather-nokey.png" > /dev/null 2>&1
npx agent-browser find text 前往設定 click > /dev/null 2>&1 || true
npx agent-browser wait 1500 > /dev/null 2>&1
if npx agent-browser get url 2>/dev/null | grep -q "/settings"; then log_pass "「前往設定」切到設定頁"; else log_fail "「前往設定」沒有切到設定頁"; fi
SETTINGS_KEY_TEXT=$(npx agent-browser get text body 2>/dev/null)
for label in 氣象署授權碼 儲存; do
  expect_text "設定頁授權碼欄位「${label}」存在（沒有內建授權碼時）" "$label" "$SETTINGS_KEY_TEXT"
done

TRASH_TEXT=$(visit /trash)
for label in 暫存區 暫存區是空的 過去穿搭仍會保留這件單品的照片; do
  expect_text "暫存區頁「${label}」存在" "$label" "$TRASH_TEXT"
done

# ── 第 7 階段：備份與還原（Web 預覽不支援，只顯示說明）──
visit /settings > /dev/null
npx agent-browser click '[aria-label="備份與還原"]' > /dev/null 2>&1
npx agent-browser wait 1500 > /dev/null 2>&1
if npx agent-browser get url 2>/dev/null | grep -q "/backup"; then log_pass "設定頁「備份與還原」打開備份頁"; else log_fail "設定頁「備份與還原」沒有打開備份頁"; fi
BACKUP_TEXT=$(npx agent-browser get text body 2>/dev/null)
echo "$BACKUP_TEXT" > "$OUT_DIR/backup.txt"
for label in 備份與還原 備份與還原只支援手機版; do
  expect_text "備份頁「${label}」存在" "$label" "$BACKUP_TEXT"
done
if echo "$BACKUP_TEXT" | grep -q "分享備份檔"; then log_fail "Web 預覽不該顯示「分享備份檔」"; else log_pass "Web 預覽不顯示匯出匯入按鈕"; fi
npx agent-browser screenshot "$OUT_DIR/backup-web.png" > /dev/null 2>&1

echo "截圖：$OUT_DIR"
echo "✅ 通過: $PASS  ❌ 失敗: $FAIL"
[ $FAIL -eq 0 ]
