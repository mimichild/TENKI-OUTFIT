#!/bin/bash
# 完整回歸測試
# 用法: bash scripts/regression.sh [--skip-visual]

SKIP_VISUAL=false
for arg in "$@"; do
  [ "$arg" = "--skip-visual" ] && SKIP_VISUAL=true
done

PASS_COUNT=0
FAIL_COUNT=0
FAILED_STEPS=()

step_pass() { echo "  ✅ $1"; PASS_COUNT=$((PASS_COUNT+1)); }
step_fail() { echo "  ❌ $1"; FAIL_COUNT=$((FAIL_COUNT+1)); FAILED_STEPS+=("$1"); }

echo "【1/4】TypeScript 型別檢查"
if npx tsc --noEmit 2>&1; then step_pass "TypeScript 型別檢查通過"; else step_fail "TypeScript 型別錯誤"; fi

echo "【2/4】ESLint"
if npx expo lint 2>&1; then step_pass "ESLint 通過"; else step_fail "ESLint 錯誤"; fi

echo "【3/4】Jest 單元測試"
if npx jest --passWithNoTests --forceExit 2>&1; then step_pass "Jest 單元測試全部通過"; else step_fail "Jest 單元測試失敗"; fi

if [ "$SKIP_VISUAL" = false ]; then
  echo "【4/4】視覺回歸測試（Web + agent-browser）"
  if bash e2e/visual.sh 2>&1; then step_pass "視覺回歸測試通過"; else step_fail "視覺回歸測試失敗"; fi
else
  echo "【4/4】視覺回歸測試 ⏭  (--skip-visual)"
fi

printf "✅ 通過: %-3s  ❌ 失敗: %-3s\n" "$PASS_COUNT" "$FAIL_COUNT"

if [ ${#FAILED_STEPS[@]} -gt 0 ]; then
  echo "失敗項目："
  for step in "${FAILED_STEPS[@]}"; do echo "  • $step"; done
  exit 1
fi
