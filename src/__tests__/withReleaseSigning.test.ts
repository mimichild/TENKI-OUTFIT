// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applySigning } = require('../../plugins/withReleaseSigning') as { applySigning: (s: string) => string };

const TEMPLATE = `
def jscFlavor = 'x'

android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

describe('withReleaseSigning', () => {
  it('release 改用正式鑰匙，debug 不變', () => {
    const out = applySigning(TEMPLATE);
    expect(out).toContain('.config/tenki/keystore.properties');
    expect(out).toMatch(/release \{\n\s*if \(tenkiSigningFile\.exists\(\)\) \{\n\s*storeFile file\(tenkiSigning/);
    expect(out).toMatch(/release \{\n(\s*\/\/.*\n)*\s*signingConfig signingConfigs\.release/);
    expect(out).toMatch(/debug \{\n\s*signingConfig signingConfigs\.debug/);
    expect(out).toContain('GradleException');
  });

  it('重複套用不會再加一次', () => {
    const once = applySigning(TEMPLATE);
    expect(applySigning(once)).toBe(once);
  });

  it('格式不同時丟錯，不會默默產生用 debug 鑰匙簽的版本', () => {
    expect(() => applySigning('android {\n}\n')).toThrow('withReleaseSigning');
  });
});
