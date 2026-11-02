# TENKI OUTFIT 天氣穿搭

結合每日天氣和穿搭，利用氣象署一週預報來排定屬於自己的最佳穿著，並且提供氣象的穿搭建議。

## 開發

```bash
npm install
npx expo start          # 開發伺服器（自動去背等原生功能需要 dev build）
npm test                # Jest
bash scripts/regression.sh [--skip-visual]   # tsc + lint + jest + Web 視覺測試
```

開發計畫與進度：`docs/plans/2026-11-02-tenki-outfit-v1.md`
