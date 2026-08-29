/* ReGen - renders brand/logo.html into every icon size the three targets
 * need: Windows .ico, Android mipmaps, the web favicon and the store art. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'brand', 'out');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function shoot(id, w, h, sizes, prefix) {
  for (const s of sizes) {
    const scale = s / w;
    const ctx = await browser.newContext({
      viewport: { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) },
      deviceScaleFactor: scale
    });
    const page = await ctx.newPage();
    await page.goto('file://' + path.join(root, 'brand', 'logo.html'));
    await page.evaluate((sel) => {
      for (const el of document.querySelectorAll('.stage')) el.style.display = 'none';
      document.getElementById(sel).style.display = 'block';
    }, id);
    await page.waitForTimeout(120);
    const el = await page.$('#' + id);
    const name = `${prefix}-${s}.png`;
    await el.screenshot({ path: path.join(out, name), omitBackground: true });
    await ctx.close();
    console.log('  ' + name);
  }
}

console.log('Rendering brand assets...');
/* the detailed mark for anything 64px and up */
await shoot('mark', 512, 512, [1024, 512, 256, 192, 144, 128, 96, 72, 64], 'icon');
/* a simplified mark below that, so it still reads at favicon size */
await shoot('markFlat', 512, 512, [48, 32, 24, 16], 'icon');
await shoot('wordmark', 1600, 480, [1600, 800], 'wordmark');
await shoot('banner', 1200, 680, [1200], 'banner');
await shoot('sidebar', 164, 314, [164], 'sidebar');
await shoot('header', 150, 57, [150], 'header');

await browser.close();

/* Windows .ico bundles every size the shell asks for. */
const icoParts = [16, 24, 32, 48, 64, 96, 128, 256].map(s => path.join(out, `icon-${s}.png`));
execFileSync('convert', [...icoParts, path.join(out, 'ReGen.ico')]);
console.log('  ReGen.ico');

/* NSIS wants BMPs for the installer chrome. */
execFileSync('convert', [path.join(out, 'sidebar-164.png'), '-background', '#101a3c',
  '-alpha', 'remove', '-alpha', 'off', 'BMP3:' + path.join(out, 'installerSidebar.bmp')]);
execFileSync('convert', [path.join(out, 'header-150.png'), '-background', 'white',
  '-alpha', 'remove', '-alpha', 'off', 'BMP3:' + path.join(out, 'installerHeader.bmp')]);
console.log('  installerSidebar.bmp / installerHeader.bmp');

/* the web build's favicon */
fs.copyFileSync(path.join(out, 'icon-256.png'), path.join(root, 'game', 'icon.png'));

/* electron-builder reads its icons out of the build-resources directory */
const buildDir = path.join(root, 'build');
fs.mkdirSync(buildDir, { recursive: true });
fs.copyFileSync(path.join(out, 'ReGen.ico'), path.join(buildDir, 'icon.ico'));
fs.copyFileSync(path.join(out, 'icon-512.png'), path.join(buildDir, 'icon.png'));
fs.copyFileSync(path.join(out, 'installerSidebar.bmp'), path.join(buildDir, 'installerSidebar.bmp'));
fs.copyFileSync(path.join(out, 'installerHeader.bmp'), path.join(buildDir, 'installerHeader.bmp'));

console.log('Brand assets written to brand/out/');
