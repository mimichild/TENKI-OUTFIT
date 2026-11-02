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
if ! npx expo export --platform web > "$OUT_DIR/expo-export.log" 2>&1; then
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
for label in 語言 幣別 主題色 地區 氣象署授權碼 暫存區 匯出資料 匯入資料; do
  expect_text "設定項目「${label}」存在" "$label" "$SETTINGS_TEXT"
done
npx agent-browser screenshot "$OUT_DIR/settings.png" > /dev/null 2>&1

echo "截圖：$OUT_DIR"
echo "✅ 通過: $PASS  ❌ 失敗: $FAIL"
[ $FAIL -eq 0 ]
