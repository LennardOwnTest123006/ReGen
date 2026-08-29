/* ReGen - builds every deliverable: brand assets, the Windows installer and
 * the Android APK, with the browser smoke test in between so nothing ships
 * that does not run. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const steps = [
  ['Brand assets', 'node', ['tools/render-logo.mjs']],
  ['Smoke test', 'node', ['tools/smoke-test.mjs']],
  ['Windows installer', 'node', ['tools/build-windows.mjs']],
  ['Android APK', 'node', ['tools/build-apk.mjs']]
];

for (const [name, cmd, args] of steps) {
  console.log('\n\n########## ' + name + ' ##########');
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
}
console.log('\n\nAll deliverables are in dist/.');
