/* ReGen - headless smoke test.
 * Boots the real game in Chromium, drives it like a player would, and fails
 * the build on any console error, page error, low frame rate or missing
 * game state. Screenshots land in build/shots for eyeballing. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = path.join(root, 'game');
const shotDir = path.join(root, 'build', 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(dir, url === '/' ? 'index.html' : url);
      if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const problems = [];
const warnings = [];

async function run() {
  const { server, port } = await serve(gameDir);
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });

  const scenarios = [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, touch: false },
    { name: 'phone-landscape', viewport: { width: 844, height: 390 }, touch: true, dpr: 3 },
    { name: 'tablet', viewport: { width: 1180, height: 820 }, touch: true, dpr: 2 },
    { name: 'small-phone', viewport: { width: 667, height: 375 }, touch: true, dpr: 2 }
  ];

  for (const sc of scenarios) {
    const ctx = await browser.newContext({
      viewport: sc.viewport,
      deviceScaleFactor: sc.dpr || 1,
      hasTouch: sc.touch,
      isMobile: sc.touch
    });
    const page = await ctx.newPage();
    page.on('console', m => {
      if (m.type() === 'error') problems.push(`[${sc.name}] console.error: ${m.text()}`);
      else if (m.type() === 'warning') warnings.push(`[${sc.name}] warn: ${m.text()}`);
    });
    page.on('pageerror', e => problems.push(`[${sc.name}] pageerror: ${e.message}\n${e.stack || ''}`));
    page.on('requestfailed', r => problems.push(`[${sc.name}] request failed: ${r.url()} ${r.failure()?.errorText}`));

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.RG && window.RG.game && window.RG.game.state === 'title', null, { timeout: 20000 });

    const fatal = await page.evaluate(() => {
      const f = document.getElementById('fatal');
      return f && f.style.display === 'flex' ? document.getElementById('fatal-detail').textContent : null;
    });
    if (fatal) problems.push(`[${sc.name}] fatal overlay: ${fatal}`);

    await page.screenshot({ path: path.join(shotDir, `${sc.name}-01-title.png`) });

    /* --- start a game --- */
    await page.evaluate(() => window.RG.game.startGame(false));
    await page.waitForFunction(() => window.RG.game.state === 'play' && window.RG.game.world.id === 'hub', null, { timeout: 15000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => { const d = document.getElementById('screen-dialog'); if (d) d.classList.remove('on'); document.body.classList.remove('modal'); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shotDir, `${sc.name}-02-hub.png`) });

    /* --- walk around with real key events --- */
    for (const key of ['KeyW', 'KeyD', 'KeyS', 'KeyA']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(320);
      await page.keyboard.up(key);
    }
    const moved = await page.evaluate(() => {
      const g = window.RG.game;
      return { x: g.player.x, y: g.player.y, hp: g.player.hp, world: g.world.id };
    });
    if (!isFinite(moved.x) || !isFinite(moved.y)) problems.push(`[${sc.name}] player position is not finite: ${JSON.stringify(moved)}`);

    /* --- travel to the first world and fight --- */
    await page.evaluate(() => window.RG.game.travelTo('verdant'));
    await page.waitForFunction(() => window.RG.game.world.id === 'verdant', null, { timeout: 15000 });
    await page.waitForTimeout(700);

    /* force a fight so combat, drops, XP and death paths all execute */
    /* Deterministic combat: a survivable player and a handful of ordinary
     * foes right in front of them, so a miss here means input or hit
     * detection is genuinely broken rather than under-levelled. */
    const before = await page.evaluate(() => {
      const g = window.RG.game;
      g.clearEntities();
      g.player.hp = g.player.maxHp = 4000;
      /* pause the spawn director: it recycles dead pool entries, which would
         otherwise refill the very objects this check is watching */
      window.__wasSafe = g.world.def.safe;
      g.world.def.safe = true;
      /* the aim point the test clicks at, so the cone definitely covers them */
      window.__marks = [];
      for (let i = 0; i < 6; i++) {
        const a = -0.45 + (i - 2.5) * 0.22;
        const e = RG.spawnEnemy(g, 'slime_green',
          g.player.x + Math.cos(a) * 30, g.player.y + Math.sin(a) * 30, 1);
        e.spawnT = 0;
        window.__marks.push(e);
      }
      return { kills: g.save.stats.kills, hp: window.__marks.reduce((s, e) => s + e.hp, 0) };
    });
    /* aim up-and-right of the player, and do not dash: dashing would carry
       the player off the test set mid-pass */
    await page.mouse.move(sc.viewport.width * 0.62, sc.viewport.height * 0.42);
    for (let i = 0; i < 40; i++) {
      await page.mouse.down();
      await page.waitForTimeout(30);
      await page.mouse.up();
      if (i % 6 === 0) await page.keyboard.press('KeyQ');
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shotDir, `${sc.name}-03-combat.png`) });

    const combat = await page.evaluate(() => {
      const g = window.RG.game;
      return {
        kills: g.save.stats.kills, coins: g.save.coins,
        particles: RG.Particles.count, enemies: g.enemyCount,
        hp: window.__marks.reduce((s, e) => s + Math.max(0, e.hp), 0),
        killedMarks: window.__marks.filter(e => !e.alive).length,
        dead: g.player.dead
      };
    });
    await page.evaluate(() => { window.RG.game.world.def.safe = window.__wasSafe; });
    if (combat.hp >= before.hp) {
      problems.push(`[${sc.name}] mouse attack dealt no damage (${before.hp} -> ${combat.hp})`);
    }
    if (combat.killedMarks === 0 || combat.kills <= before.kills) {
      problems.push(`[${sc.name}] mouse attack killed nothing (${combat.killedMarks} of 6 down)`);
    }
    if (combat.dead) problems.push(`[${sc.name}] player died during the scripted combat pass`);

    /* dash must actually move the player and grant invulnerability */
    const dash = await page.evaluate(async () => {
      const g = window.RG.game;
      g.clearEntities();
      const x0 = g.player.x, y0 = g.player.y;
      g.player.dashCd = 0;
      RG.Input._pulse.dash = true;
      for (let i = 0; i < 20; i++) g.step(1 / 60);
      return { moved: Math.hypot(g.player.x - x0, g.player.y - y0) };
    });
    if (!(dash.moved > 20)) problems.push(`[${sc.name}] dash moved the player only ${dash.moved.toFixed(1)} units`);

    /* the ability button must also land damage */
    const abilityHit = await page.evaluate(() => {
      const g = window.RG.game;
      g.clearEntities();
      const e = RG.spawnEnemy(g, 'golem_ash', g.player.x + 26, g.player.y, 1);
      e.spawnT = 0;
      const hp0 = e.hp;
      g.player.abilityCd = 0;
      g.player.doAbility(g);
      return hp0 - e.hp;
    });
    if (!(abilityHit > 0)) problems.push(`[${sc.name}] the special ability dealt no damage`);
    await page.evaluate(() => window.RG.game.clearEntities());

    /* --- dungeon --- */
    await page.evaluate(() => {
      const g = window.RG.game;
      const d = g.world.structures.find(s => s.kind === 'dungeon');
      if (d) g.enterDungeon(d);
    });
    await page.waitForFunction(() => window.RG.game.world.def.kind === 'dungeon', null, { timeout: 15000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(shotDir, `${sc.name}-04-dungeon.png`) });
    const dung = await page.evaluate(() => {
      const g = window.RG.game;
      const roomKinds = (g.world.rooms || []).map(r => r.kind);
      return {
        floor: g.world.floor, rooms: (g.world.rooms || []).length,
        hasStart: roomKinds.includes('start'),
        hasEnd: roomKinds.includes('descent') || roomKinds.includes('boss'),
        hasKey: roomKinds.includes('key'),
        spawnWalkable: g.world.isWalkable(g.world.spawn.x, g.world.spawn.y)
      };
    });
    if (!dung.hasStart || !dung.hasEnd) problems.push(`[${sc.name}] dungeon is missing required rooms: ${JSON.stringify(dung)}`);
    if (!dung.spawnWalkable) problems.push(`[${sc.name}] dungeon spawn is inside a wall`);

    /* --- every world generates and is walkable at spawn --- */
    const worldCheck = await page.evaluate(() => {
      const out = [];
      for (const w of RG.Data.WORLDS) {
        const world = window.RG.game.getWorld(w.id);
        out.push({
          id: w.id,
          walkable: world.isWalkable(world.spawn.x, world.spawn.y),
          structures: world.structures.length,
          props: world.props.length,
          hasMinimap: !!world.minimap
        });
      }
      return out;
    });
    for (const w of worldCheck) {
      if (!w.walkable) problems.push(`[${sc.name}] world ${w.id} spawns the player inside geometry`);
      if (!w.structures) problems.push(`[${sc.name}] world ${w.id} has no structures`);
      if (!w.hasMinimap) problems.push(`[${sc.name}] world ${w.id} has no minimap`);
    }

    /* --- UI screens all open and render --- */
    for (const name of ['store', 'vault', 'quests', 'records', 'settings', 'map', 'arcade', 'gate', 'pause']) {
      await page.evaluate(n => { RG.UI.closeAll(); RG.UI.open(n); }, name);
      await page.waitForTimeout(220);
      const ok = await page.evaluate(n => {
        const s = document.getElementById('screen-' + n);
        return !!s && s.classList.contains('on') && s.getBoundingClientRect().height > 0;
      }, name);
      if (!ok) problems.push(`[${sc.name}] screen "${name}" did not render`);
      if (name === 'vault' || name === 'store') {
        await page.screenshot({ path: path.join(shotDir, `${sc.name}-05-${name}.png`) });
      }
    }
    await page.evaluate(() => RG.UI.closeAll());

    /* --- economy: buying must not corrupt state --- */
    const econ = await page.evaluate(() => {
      const g = window.RG.game;
      g.save.coins = 500000; g.save.gems = 900;
      const before = { coins: g.save.coins, gems: g.save.gems, owned: g.save.owned.length };
      for (const it of RG.Data.SHOP) {
        const price = Math.round(it.price * Math.pow(it.scale || 1, g.save.purchases[it.id] || 0));
        g.buy(it, price);
      }
      for (const sk of RG.Data.SKINS) g.buySkin(sk);
      RG.UI.closeAll();
      return {
        before, coins: g.save.coins, gems: g.save.gems,
        owned: g.save.owned.length, dupes: g.save.owned.length !== new Set(g.save.owned).size,
        hp: g.player.maxHp, dmg: g.player.stats.dmg
      };
    });
    if (econ.coins < 0 || econ.gems < 0) problems.push(`[${sc.name}] currency went negative: ${JSON.stringify(econ)}`);
    if (econ.dupes) problems.push(`[${sc.name}] duplicate skins in the owned list`);
    if (!(econ.hp > 0) || !(econ.dmg > 0)) problems.push(`[${sc.name}] derived player stats are invalid: ${JSON.stringify(econ)}`);

    /* --- consumables: the reported bug. Buying a potion has to do something. --- */
    const items = await page.evaluate(() => {
      const g = window.RG.game;
      const out = { steps: [] };
      RG.UI.closeAll();
      g.save.coins = 500000; g.save.gems = 900;
      g.save.inventory = {};
      g.player.recompute(g);
      g.player.hp = g.player.maxHp;
      g.player.shield = 0;
      g.luckBoostT = 0;

      const potion = RG.Data.shopItem('potion_s');

      // 1. hurt player + buy potion -> healed immediately, nothing left in the bag
      g.player.hp = g.player.maxHp - 40;
      const hp0 = g.player.hp;
      g.buy(potion, potion.price);
      out.steps.push({ name: 'buy while hurt heals now',
        ok: g.player.hp > hp0 && (g.save.inventory.potion_s || 0) === 0,
        hp0, hp1: g.player.hp, bag: g.save.inventory.potion_s || 0 });

      // 2. buy at full health -> stored, not silently lost
      g.player.hp = g.player.maxHp;
      g.buy(potion, potion.price);
      out.steps.push({ name: 'buy at full health stores it',
        ok: (g.save.inventory.potion_s || 0) === 1, bag: g.save.inventory.potion_s || 0 });

      // 3. the stored potion is usable later
      g.player.hp = g.player.maxHp - 30;
      const used = g.useItem('potion_s');
      out.steps.push({ name: 'stored potion is usable',
        ok: used === true && (g.save.inventory.potion_s || 0) === 0 && g.player.hp > g.player.maxHp - 30 });

      // 4. using an item you do not have fails cleanly
      const none = g.useItem('potion_s');
      out.steps.push({ name: 'using an empty slot is refused',
        ok: none === false && (g.save.inventory.potion_s || 0) === 0 });

      // 5. ward grants a shield
      g.player.shield = 0;
      const ward = RG.Data.shopItem('ward');
      g.buy(ward, ward.price);
      out.steps.push({ name: 'ward grants a shield', ok: g.player.shield >= 120, shield: g.player.shield });

      // 6. lure starts the coin boost
      const lure = RG.Data.shopItem('lure');
      g.buy(lure, lure.price);
      out.steps.push({ name: 'lure starts the coin boost', ok: g.luckBoostT > 100, t: g.luckBoostT });

      // 7. a rift key lands in the key count and never in the bag
      const keys0 = g.save.keys;
      const key = RG.Data.shopItem('key');
      g.buy(key, key.price);
      out.steps.push({ name: 'rift key is added straight away',
        ok: g.save.keys === keys0 + 1 && !(g.save.inventory.key > 0) });

      // 8. a purchase that cannot be afforded changes nothing at all
      g.save.coins = 5;
      const snapshot = JSON.stringify({ c: g.save.coins, p: g.save.purchases, i: g.save.inventory });
      const bought = g.buy(potion, potion.price);
      out.steps.push({ name: 'unaffordable purchase is a clean no-op',
        ok: bought === false &&
            snapshot === JSON.stringify({ c: g.save.coins, p: g.save.purchases, i: g.save.inventory }) });

      // 9. a full bag is refused without taking the money
      g.save.coins = 500000;
      g.save.inventory.potion_s = potion.stack;
      g.player.hp = g.player.maxHp;
      const coinsBefore = g.save.coins;
      const overfilled = g.buy(potion, potion.price);
      out.steps.push({ name: 'a full bag is refused without charging',
        ok: overfilled === false && g.save.coins === coinsBefore &&
            g.save.inventory.potion_s === potion.stack });

      // 10. every consumable in the shop declares an effect the game applies
      const unhandled = RG.Data.SHOP.filter(it => it.cat === 'consumable').filter(it => {
        const e = it.effect || {};
        return !(e.heal || e.shield || e.luckBoost || e.key);
      }).map(it => it.id);
      out.steps.push({ name: 'no consumable has an effect the game ignores', ok: unhandled.length === 0, unhandled });

      g.save.inventory = {};
      RG.UI.closeAll();
      return out;
    });
    for (const st of items.steps) {
      if (!st.ok) problems.push(`[${sc.name}] consumables: ${st.name} -> ${JSON.stringify(st)}`);
    }

    /* --- purchase feedback must be visible while the store is open --- */
    const toastVisible = await page.evaluate(() => {
      RG.UI.openStore('consumable');
      RG.UI.toast('test message', 'good');
      const host = document.getElementById('toasts');
      const toast = host.lastElementChild;
      const hz = parseInt(getComputedStyle(host).zIndex, 10);
      /* the panels stack inside #screens, so that is the layer to beat */
      const sz = parseInt(getComputedStyle(document.getElementById('screens')).zIndex, 10);
      const r = toast.getBoundingClientRect();
      /* #toasts is pointer-events:none, and elementFromPoint skips those, so
         turn it on just for the hit test */
      const prev = host.style.pointerEvents;
      host.style.pointerEvents = 'auto';
      const onTop = document.elementFromPoint(
        Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      host.style.pointerEvents = prev;
      const res = {
        above: hz > sz, hz, sz,
        visible: r.width > 0 && r.height > 0 &&
                 r.top >= 0 && r.bottom <= window.innerHeight,
        hitTestReachesToast: !!(onTop && (onTop === toast || toast.contains(onTop)))
      };
      RG.UI.closeAll();
      return res;
    });
    if (!toastVisible.above || !toastVisible.visible || !toastVisible.hitTestReachesToast) {
      problems.push(`[${sc.name}] purchase feedback is hidden behind the menu: ${JSON.stringify(toastVisible)}`);
    }

    /* --- a boost must not tick away behind a menu --- */
    const boostPaused = await page.evaluate(() => {
      const g = window.RG.game;
      RG.UI.closeAll();
      g.luckBoostT = 100;
      RG.UI.open('store');
      for (let i = 0; i < 120; i++) g.step(1 / 60);
      const whileOpen = g.luckBoostT;
      RG.UI.closeAll();
      RG.Input.block(0);
      for (let i = 0; i < 120; i++) g.step(1 / 60);
      const whilePlaying = g.luckBoostT;
      g.luckBoostT = 0;
      return { whileOpen, whilePlaying };
    });
    if (boostPaused.whileOpen !== 100 || !(boostPaused.whilePlaying < 99.5)) {
      problems.push(`[${sc.name}] the coin boost timer misbehaves: ${JSON.stringify(boostPaused)}`);
    }

    /* --- leaving the arena any way at all must bank the run --- */
    const arenaBank = await page.evaluate(async () => {
      const g = window.RG.game;
      RG.UI.closeAll();
      g.save.best.arena = 0;
      g.startArena();
      await new Promise(r => setTimeout(r, 700));
      g.arena.wave = 6;
      g.arena.kills = 40;
      g.travelTo('hub');
      await new Promise(r => setTimeout(r, 700));
      RG.UI.closeAll();
      return { best: g.save.best.arena, arenaCleared: g.arena === null, world: g.world.id };
    });
    if (!(arenaBank.best > 0) || !arenaBank.arenaCleared) {
      problems.push(`[${sc.name}] the arena run was discarded on exit: ${JSON.stringify(arenaBank)}`);
    }

    /* --- toasts must not paint over the boss health bar --- */
    const bossToast = await page.evaluate(async () => {
      const g = window.RG.game;
      RG.UI.closeAll();
      g.clearEntities();
      const boss = RG.spawnEnemy(g, 'boss_warden', g.player.x + 200, g.player.y, 1);
      boss.spawnT = 0;
      for (let i = 0; i < 5; i++) g.step(1 / 60);
      g.render();
      RG.UI.toast('a message during the fight', 'warn');
      await new Promise(r => requestAnimationFrame(r));
      const bar = document.querySelector('.bossbar').getBoundingClientRect();
      const toast = document.getElementById('toasts').lastElementChild.getBoundingClientRect();
      const overlap = !(toast.bottom <= bar.top || toast.top >= bar.bottom ||
                        toast.right <= bar.left || toast.left >= bar.right);
      g.clearEntities();
      g.render();
      return { overlap, bar: Math.round(bar.bottom), toast: Math.round(toast.top),
               flagged: document.body.classList.contains('boss-active') };
    });
    if (bossToast.overlap) {
      problems.push(`[${sc.name}] toasts cover the boss bar: ${JSON.stringify(bossToast)}`);
    }

    /* --- a boss you walk away from must stay challengeable --- */
    const bossRetry = await page.evaluate(() => {
      const g = window.RG.game;
      RG.UI.closeAll();
      g.travelTo('verdant');
      return new Promise(res => setTimeout(() => {
        const boss = g.world.structures.find(s => s.kind === 'boss');
        if (!boss) return res({ ok: true, skipped: true });
        boss.used = 'fighting';
        g.clearEntities();
        res({ ok: boss.used === false, state: boss.used });
      }, 900));
    });
    if (!bossRetry.ok) problems.push(`[${sc.name}] a fled boss stays locked out: ${JSON.stringify(bossRetry)}`);

    /* --- looted chests must stay looted after the world is regenerated --- */
    const persist = await page.evaluate(() => {
      const g = window.RG.game;
      const chest = g.world.structures.find(s => s.kind === 'chest' && !s.used);
      if (!chest) return { ok: true, skipped: true };
      const sid = chest.sid;
      g.openChest(chest);
      delete g.worldCache[g.world.id];
      const fresh = g.getWorld('verdant');
      const same = fresh.structures[sid];
      return { ok: !!(same && same.used), sid, used: same && same.used };
    });
    if (!persist.ok) problems.push(`[${sc.name}] looted chests refill after a restart: ${JSON.stringify(persist)}`);

    /* --- the particle pool must never lose or alias an object --- */
    const pool = await page.evaluate(() => {
      const P = RG.Particles;
      P.clear();
      for (let i = 0; i < P.budget * 3; i++) {
        P.spawn(Math.random() * 100, Math.random() * 100, 0, 0, 1 + Math.random(), 2, '#fff', 0, {});
      }
      const unique = new Set(P.list).size;
      P.clear();
      return { unique, total: P.list.length };
    });
    if (pool.unique !== pool.total) {
      problems.push(`[${sc.name}] particle pool corrupted: ${pool.unique} distinct objects of ${pool.total}`);
    }

    /* --- every skin equips and draws --- */
    const skinCheck = await page.evaluate(() => {
      const g = window.RG.game;
      const bad = [];
      for (const sk of RG.Data.SKINS) {
        try {
          g.equipSkin(sk.id);
          const cv = document.createElement('canvas');
          cv.width = 100; cv.height = 100;
          const c = cv.getContext('2d');
          c.translate(50, 90);
          RG.Art.drawCharacter(c, sk, { t: 1, walk: 0.5, facing: 1, aim: 0.4, attack: 0.5, scale: 2 });
          if (!isFinite(g.player.stats.dmg) || !isFinite(g.player.maxHp)) bad.push(sk.id + ':stats');
        } catch (e) { bad.push(sk.id + ':' + e.message); }
      }
      RG.UI.closeAll();
      return bad;
    });
    if (skinCheck.length) problems.push(`[${sc.name}] skins failed: ${skinCheck.join(', ')}`);

    /* --- every enemy spawns, updates and dies cleanly --- */
    const foeCheck = await page.evaluate(() => {
      const g = window.RG.game;
      const bad = [];
      for (const id of Object.keys(RG.Data.ENEMIES)) {
        try {
          g.clearEntities();
          const e = RG.spawnEnemy(g, id, g.player.x + 120, g.player.y, 1);
          if (!e) { bad.push(id + ':nospawn'); continue; }
          for (let i = 0; i < 90; i++) g.step(1 / 60);
          if (!isFinite(e.x) || !isFinite(e.y)) bad.push(id + ':nan');
          e.hurt(g, 1e9, 0, 0, false);
          if (e.alive) bad.push(id + ':undying');
        } catch (err) { bad.push(id + ':' + err.message); }
      }
      g.clearEntities();
      return bad;
    });
    if (foeCheck.length) problems.push(`[${sc.name}] enemies failed: ${foeCheck.join(', ')}`);

    /* --- the world HUD must not sit on top of an arcade cabinet --- */
    const hudDuringMinigame = await page.evaluate(async () => {
      const g = window.RG.game;
      RG.UI.closeAll();
      g.startMinigame('match');
      for (let i = 0; i < 30; i++) g.step(1 / 60);
      g.render();
      const shown = [];
      for (const sel of ['.hud-topleft', '.minimap', '.world-label', '.objective', '.hotbar', '.boost', '.hud-topright .chip']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (st.display !== 'none' && r.width > 0 && r.height > 0) shown.push(sel);
      }
      const cls = document.body.classList.contains('minigame');
      g.endMinigame('match', 0);
      RG.UI.closeAll();
      const cleared = !document.body.classList.contains('minigame');
      return { shown, cls, cleared };
    });
    if (hudDuringMinigame.shown.length || !hudDuringMinigame.cls || !hudDuringMinigame.cleared) {
      problems.push(`[${sc.name}] world HUD overlaps a mini-game: ${JSON.stringify(hudDuringMinigame)}`);
    }

    /* --- mini-games --- */
    for (const id of ['pulse', 'match', 'angler']) {
      const mgErr = await page.evaluate(async (mg) => {
        const g = window.RG.game;
        try {
          g.startMinigame(mg);
          for (let i = 0; i < 240; i++) g.step(1 / 60);
          g.render();
          const score = g.minigame ? g.minigame.score : 0;
          if (g.minigame) g.endMinigame(mg, score);
          RG.UI.closeAll();
          return null;
        } catch (e) { return e.message + '\n' + e.stack; }
      }, id);
      if (mgErr) problems.push(`[${sc.name}] minigame ${id}: ${mgErr}`);
    }
    await page.evaluate(() => { RG.UI.closeAll(); window.RG.game.startArena(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => { for (let i = 0; i < 600; i++) window.RG.game.step(1 / 60); });
    await page.screenshot({ path: path.join(shotDir, `${sc.name}-06-arena.png`) });

    /* --- save round-trip --- */
    const saveOk = await page.evaluate(() => {
      const g = window.RG.game;
      const code = RG.Save.exportString(g.save);
      const back = RG.Save.importString(code);
      return back && back.level === g.save.level && back.owned.length === g.save.owned.length;
    });
    if (!saveOk) problems.push(`[${sc.name}] save export/import round trip failed`);

    /* --- performance under load --- */
    await page.evaluate(() => {
      const g = window.RG.game;
      RG.UI.closeAll();
      g.travelTo('voidr');
    });
    await page.waitForTimeout(900);
    /* This container has no GPU, so Chromium rasterises and composites the
     * canvas in software - that cost dominates wall-clock fps here and does
     * not exist on real hardware. What we can and must hold ourselves to is
     * the game's own per-frame budget: simulation plus issuing draw calls. */
    const perf = await page.evaluate(async () => {
      const g = window.RG.game;
      for (let i = 0; i < 45; i++) {
        const a = Math.random() * Math.PI * 2;
        RG.spawnEnemy(g, 'shade_void', g.player.x + Math.cos(a) * 200, g.player.y + Math.sin(a) * 200, 1);
      }
      let frames = 0, work = 0, worst = 0;
      const t0 = performance.now();
      await new Promise(res => {
        function tick() {
          const a = performance.now();
          g.step(1 / 60);
          g.render();
          const d = performance.now() - a;
          work += d;
          if (frames > 4 && d > worst) worst = d;
          frames++;
          if (performance.now() - t0 > 2500) res(); else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      const total = performance.now() - t0;
      return {
        fps: frames / (total / 1000),
        workPerFrame: work / frames,
        worstFrame: worst,
        enemies: g.enemyCount,
        particles: RG.Particles.count,
        autoScale: RG.View.autoScale
      };
    });
    console.log(`  [${sc.name}] load: game work ${perf.workPerFrame.toFixed(2)} ms/frame ` +
      `(worst ${perf.worstFrame.toFixed(1)} ms), ${perf.enemies} enemies, ` +
      `${perf.particles} particles, software-composited wall clock ${perf.fps.toFixed(1)} fps`);
    if (perf.workPerFrame > 8) {
      problems.push(`[${sc.name}] game work is ${perf.workPerFrame.toFixed(2)} ms/frame (budget 8 ms)`);
    }
    if (perf.worstFrame > 34) {
      problems.push(`[${sc.name}] worst frame spiked to ${perf.worstFrame.toFixed(1)} ms`);
    }
    await page.screenshot({ path: path.join(shotDir, `${sc.name}-07-load.png`) });

    /* --- resize / rotate --- */
    await page.setViewportSize({ width: sc.viewport.height, height: sc.viewport.width });
    await page.waitForTimeout(500);
    const resized = await page.evaluate(() => ({ w: RG.View.w, h: RG.View.h, cw: RG.View.canvas.width }));
    if (!(resized.w > 0 && resized.h > 0 && resized.cw > 0)) problems.push(`[${sc.name}] view is broken after resize: ${JSON.stringify(resized)}`);
    await page.setViewportSize(sc.viewport);
    await page.waitForTimeout(300);

    await ctx.close();
  }

  await browser.close();
  server.close();

  console.log('');
  if (warnings.length) {
    console.log('Warnings:');
    for (const w of warnings.slice(0, 20)) console.log('  - ' + w);
    console.log('');
  }
  if (problems.length) {
    console.log('FAILURES (' + problems.length + '):');
    for (const p of problems) console.log('  - ' + p);
    process.exit(1);
  }
  console.log('All smoke tests passed. Screenshots in build/shots/');
}

run().catch(e => { console.error(e); process.exit(1); });
