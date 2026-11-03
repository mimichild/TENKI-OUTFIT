// 正式簽章：release 版改用開發者自己的 keystore（不用 Expo 預設、公開的 debug 鑰匙）。
// 鑰匙與密碼放在 ~/.config/tenki/keystore.properties（或環境變數 TENKI_KEYSTORE_PROPERTIES 指定的檔案），不進 git。
// 找不到設定檔時 release 建置直接失敗，避免不小心發出用 debug 鑰匙簽的 APK（使用者之後會無法覆蓋更新）。
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// tenki-release-signing';

const LOADER = `
${MARK}
def tenkiSigningFile = new File(System.getenv('TENKI_KEYSTORE_PROPERTIES') ?: "\${System.getProperty('user.home')}/.config/tenki/keystore.properties")
def tenkiSigning = new Properties()
if (tenkiSigningFile.exists()) {
    tenkiSigningFile.withInputStream { tenkiSigning.load(it) }
}
gradle.taskGraph.whenReady { graph ->
    def releaseTask = graph.allTasks.any { it.project == project && it.name ==~ /(assemble|bundle|package)Release/ }
    if (releaseTask && !tenkiSigningFile.exists()) {
        throw new GradleException("找不到正式簽章設定檔 \${tenkiSigningFile}；release 版必須用正式鑰匙簽名（見 docs/plans 第 7 階段）")
    }
}
`;

const RELEASE_CONFIG = `
        release {
            if (tenkiSigningFile.exists()) {
                storeFile file(tenkiSigning.getProperty('storeFile'))
                storePassword tenkiSigning.getProperty('storePassword')
                keyAlias tenkiSigning.getProperty('keyAlias')
                keyPassword tenkiSigning.getProperty('keyPassword')
            }
        }`;

function applySigning(src) {
  if (src.includes(MARK)) return src;
  let out = src.replace(/\nandroid \{/, `${LOADER}\nandroid {`);
  out = out.replace(/(signingConfigs \{\n\s*debug \{[\s\S]*?\n\s{8}\})/, `$1${RELEASE_CONFIG}`);
  out = out.replace(
    /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
    '$1signingConfig signingConfigs.release',
  );
  if (!out.includes('signingConfig signingConfigs.release') || !out.includes('storeFile file(tenkiSigning')) {
    throw new Error('withReleaseSigning: android/app/build.gradle 格式和預期不同，無法加入正式簽章');
  }
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applySigning = applySigning;
