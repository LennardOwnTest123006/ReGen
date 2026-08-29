/* ReGen - Android build.
 *
 * Builds a real, installable APK without the Android SDK, which is not
 * available in this environment. The pieces come from Maven Central instead:
 *   - android.jar   (org.robolectric:android-all) to compile against
 *   - dx            (com.jakewharton.android.repackaged:dalvik-dx) to dex
 *   - apksig        (com.android.tools.build:apksig) to sign, v1 + v2
 * The binary manifest, the resource table and the aligned zip are produced
 * by the Python encoders in android/tools.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const toolsDir = path.join(androidDir, 'tools');
const libDir = path.join(toolsDir, 'lib');
const outDir = path.join(root, 'build', 'android');
const distDir = path.join(root, 'dist');
const cacheDir = path.join(os.homedir(), '.cache', 'regen');

const PKG = 'com.regenstudio.regen';
const VERSION_NAME = '1.0.0';
const VERSION_CODE = 1;
const MIN_SDK = 21;
const TARGET_SDK = 34;

const ANDROID_JAR_URL =
  'https://repo1.maven.org/maven2/org/robolectric/android-all/13-robolectric-9030017/android-all-13-robolectric-9030017.jar';
const ANDROID_JAR = path.join(cacheDir, 'android-all-33.jar');
const DX_JAR = path.join(libDir, 'dalvik-dx-16.0.1.jar');
const APKSIG_JAR = path.join(libDir, 'apksig-2.3.0.jar');

/* apksig 2.3.0 is the newest build published to Maven Central, and its v1
   signer calls sun.security.pkcs.PKCS7.encodeSignedData(OutputStream) - an
   internal JDK method that was removed after 17. Sign with a 17 JDK when one
   is installed so the APK carries both a v1 and a v2 signature; otherwise
   fall back to v2 only, which every Android 7 and newer device accepts. */
const JDK17 = ['/usr/lib/jvm/java-17-openjdk-amd64', '/usr/lib/jvm/java-17-openjdk']
  .find(p => fs.existsSync(path.join(p, 'bin', 'java')));
const SIGN_JAVA = JDK17 ? path.join(JDK17, 'bin', 'java') : 'java';
const SIGN_JAVAC = JDK17 ? path.join(JDK17, 'bin', 'javac') : 'javac';
const V1_OK = !!JDK17;

const KEYSTORE = path.join(outDir, 'regen-release.p12');
const STORE_PASS = 'regen-release';
const KEY_ALIAS = 'regen';

function sh(cmd, args, opts) {
  /* the JDK echoes JAVA_TOOL_OPTIONS to stderr on every invocation; it is
     noise, not output we want in the build log */
  const env = { ...process.env };
  delete env.JAVA_TOOL_OPTIONS;
  return execFileSync(cmd, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts
  });
}

function step(msg) { process.stdout.write('\n== ' + msg + '\n'); }

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

function ensure(file, url, label) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  process.stdout.write('   downloading ' + label + '...\n');
  sh('curl', ['-sSL', '--fail', '--max-time', '900', '-o', file, url], { stdio: 'inherit' });
}

/* ------------------------------------------------------------------ build */
rmrf(outDir);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

step('Fetching build tools');
ensure(ANDROID_JAR, ANDROID_JAR_URL, 'android.jar');
ensure(DX_JAR, 'https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar', 'dx');
ensure(APKSIG_JAR, 'https://repo1.maven.org/maven2/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar', 'apksig');
console.log('   android.jar, dx and apksig ready');

step('Compiling the activity');
const classesDir = path.join(outDir, 'classes');
fs.mkdirSync(classesDir, { recursive: true });
const javaSources = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.java')) javaSources.push(p);
  }
})(path.join(androidDir, 'java'));
sh('javac', ['--release', '8', '-nowarn', '-classpath', ANDROID_JAR, '-d', classesDir, ...javaSources]);
console.log('   compiled ' + javaSources.length + ' source file(s)');

step('Dexing');
const dexPath = path.join(outDir, 'classes.dex');
sh('java', ['-cp', DX_JAR, 'com.android.dx.command.Main', '--dex',
  '--min-sdk-version=' + MIN_SDK, '--output=' + dexPath, classesDir]);
console.log('   classes.dex: ' + fs.statSync(dexPath).size + ' bytes');

step('Staging assets');
const assetsDir = path.join(outDir, 'assets');
copyTree(path.join(root, 'game'), path.join(assetsDir, 'game'));
let assetCount = 0, assetBytes = 0;
(function count(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) count(p);
    else { assetCount++; assetBytes += fs.statSync(p).size; }
  }
})(assetsDir);
console.log('   ' + assetCount + ' asset files, ' + (assetBytes / 1024).toFixed(0) + ' KB');

step('Assembling the APK');
const unsigned = path.join(outDir, 'ReGen-unsigned.apk');
console.log(sh('python3', [path.join(toolsDir, 'assemble.py'),
  unsigned, dexPath, assetsDir, path.join(root, 'brand', 'out'),
  PKG, String(VERSION_CODE), VERSION_NAME, String(MIN_SDK), String(TARGET_SDK)]).trim());

step('Signing');
if (!fs.existsSync(KEYSTORE)) {
  console.log('   generating a new release keystore (keep build/android/regen-release.p12');
  console.log('   if you want future builds to install as updates over this one)');
  sh('keytool', ['-genkeypair', '-storetype', 'PKCS12', '-keystore', KEYSTORE,
    '-storepass', STORE_PASS, '-keypass', STORE_PASS, '-alias', KEY_ALIAS,
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10950',
    '-dname', 'CN=ReGen, OU=Games, O=ReGen Studio, C=DE']);
}
const signerClasses = path.join(outDir, 'signer');
fs.mkdirSync(signerClasses, { recursive: true });
sh(SIGN_JAVAC, ['-nowarn', '-classpath', APKSIG_JAR, '-d', signerClasses,
  path.join(toolsDir, 'AndroidSigner.java')]);
console.log('   signing with ' + (JDK17 ? 'JDK 17 (v1 + v2)' : 'the default JDK (v2 only)'));

const signed = path.join(distDir, 'ReGen.apk');
rmrf(signed);
/* apksig 2.3.0 predates the module system and reaches into sun.security.x509,
   which JDK 9+ encapsulates by default. */
const signOut = sh(SIGN_JAVA, [
  '--add-exports', 'java.base/sun.security.x509=ALL-UNNAMED',
  '--add-exports', 'java.base/sun.security.pkcs=ALL-UNNAMED',
  '--add-exports', 'java.base/sun.security.util=ALL-UNNAMED',
  '-cp', signerClasses + ':' + APKSIG_JAR, 'AndroidSigner',
  KEYSTORE, STORE_PASS, KEY_ALIAS, STORE_PASS, unsigned, signed,
  V1_OK ? 'v1v2' : 'v2']);
console.log(signOut.split('\n').filter(Boolean).map(l => '   ' + l).join('\n'));

step('Verifying the package');
console.log(sh('python3', [path.join(toolsDir, 'verify.py'), signed])
  .split('\n').filter(Boolean).map(l => '   ' + l).join('\n'));

const size = fs.statSync(signed).size;
console.log('\nReGen.apk -> ' + signed + '  (' + (size / 1048576).toFixed(2) + ' MB)');
