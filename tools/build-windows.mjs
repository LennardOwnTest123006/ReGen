/* ReGen - Windows build.
 *
 * electron-builder packages the app directory; the installer itself is
 * compiled by NSIS directly from build/regen-installer.nsi, which runs
 * natively on Linux and macOS as well as Windows. That keeps the whole
 * pipeline reproducible on any machine with Node, NSIS and (for stamping
 * the exe icon on non-Windows hosts) wine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unpacked = path.join(root, 'dist', 'win-unpacked');
const installer = path.join(root, 'dist', 'ReGen Setup.exe');

function run(cmd, args, opts) {
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
}

/* On a Linux host electron-builder shells out to wine to stamp the icon and
   version info into ReGen.exe, and wine wants a display. */
const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const wrap = (cmd, args) => needsXvfb
  ? ['xvfb-run', ['-a', cmd, ...args]]
  : [cmd, args];

console.log('\n== Packaging the Electron app');
{
  const [cmd, args] = wrap('npx', ['electron-builder', '--win', '--x64', '--publish', 'never']);
  run(cmd, args, { env: { ...process.env, WINEDEBUG: '-all', WINEDLLOVERRIDES: 'mscoree,mshtml=' } });
}
if (!fs.existsSync(path.join(unpacked, 'ReGen.exe'))) {
  throw new Error('electron-builder did not produce dist/win-unpacked/ReGen.exe');
}

console.log('\n== Compiling the installer');
fs.rmSync(installer, { force: true });
run('makensis', [
  '-V2',
  '-DSRC=' + unpacked,
  '-DOUT=' + installer,
  'regen-installer.nsi'
], { cwd: path.join(root, 'build') });

const size = fs.statSync(installer).size;
console.log('\nReGen Setup.exe -> ' + installer + '  (' + (size / 1048576).toFixed(1) + ' MB)');
