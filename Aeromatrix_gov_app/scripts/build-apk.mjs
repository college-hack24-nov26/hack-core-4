// Builds the Android app: web build, copy into the native project, Gradle debug build, then copies the APK to apk/.
// Needs JDK 17 and the Android SDK (platform 34, build-tools 34). Set JAVA_HOME and ANDROID_HOME, or keep them in the
// usual places. Run: npm run android:apk
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p));
}

function findJdk() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const bases = win ? ['C:\\Program Files\\Microsoft', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java'] : ['/usr/lib/jvm'];
  for (const b of bases) {
    if (!existsSync(b)) continue;
    const hit = readdirSync(b).find((d) => /jdk-?(17|21)/i.test(d));
    if (hit) return join(b, hit);
  }
  return null;
}

const jdk = findJdk();
const sdk = firstExisting([process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, 'C:\\Android\\sdk', join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'), join(homedir(), 'Android', 'Sdk')]);
if (!jdk) throw new Error('No JDK 17 found. Install one and set JAVA_HOME.');
if (!sdk) throw new Error('No Android SDK found. Install it and set ANDROID_HOME.');

const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, PATH: `${join(jdk, 'bin')}${win ? ';' : ':'}${process.env.PATH}` };
const androidDir = join(root, 'android');
if (!existsSync(androidDir)) throw new Error('The android/ project is missing. Run: npx cap add android');
writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);

function run(cmd, args, cwd = root) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);
run(win ? 'gradlew.bat' : './gradlew', ['assembleDebug', '--console=plain'], androidDir);

const built = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(built)) throw new Error('The build finished but no APK was found.');
mkdirSync(join(root, 'apk'), { recursive: true });
const out = join(root, 'apk', 'AeroMatrix-Commissioner.apk');
copyFileSync(built, out);
console.log(`\nAPK ready: ${out}`);
