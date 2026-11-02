module.exports = function (api) {
  api.cache(true);
  return {
    // zustand/middleware 的 ESM 版本用到 import.meta；Web bundle 不是 ES module，
    // 不轉換的話整個 App 在瀏覽器載入時就會 SyntaxError、React 不會掛載
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
