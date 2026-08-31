/* ReGen - the game itself: the loop, the world renderer, the spawn
 * director, progression and every transition between them.
 *
 * The loop is a fixed-step accumulator (60 Hz simulation) with a rendered
 * frame per animation frame. That keeps physics, cooldowns and AI identical
 * on a 60 Hz phone and a 165 Hz monitor - the single most important thing
 * for a game that has to feel the same everywhere. */
'use strict';
(function (RG) {
  var M = RG.M, V = RG.View, Cam = RG.Cam, Data = RG.Data, Art = RG.Art;
  var P = RG.Particles, FT = RG.FloatText, L = RG.Lights, UI = RG.UI;
  var T = RG.TILE, TP = RG.TILEPROPS, TS = RG.TILE_SIZE;

  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  function byDepth(a, b) { return a.y - b.y; }

  function Game() {
    this.state = 'boot';
    this.save = null;
    this.player = null;
    this.world = null;
    this.worldCache = {};
    this.frame = 0;
    this.fps = 60;
    this.enemyCount = 0;
    this.acc = 0;
    this.lastTime = 0;
    this.hitFlash = 0;
    this.fade = 1;
    this.fadeTarget = 0;
    this.nearStructure = null;
    this.activeBoss = null;
    this.levelScale = 1;
    this.dropScale = 1;
    this.luckBoostT = 0;
    this.runStats = { kills: 0, coins: 0 };
    this.minigame = null;
    this.dungeonCtx = null;
    this.arena = null;
    this.deathMessage = '';
    this.spawnTimer = 0;
    this.paused = false;
    this._renderList = [];
    this._propScratch = [];
    this._weatherT = 0;
    this._saveTimer = 0;
    this._toastQ = [];
    this._errShown = false;
    this._frameAvg = 16.7;
    this._scaleHold = 0;
  }
  RG.Game = Game;

  /* ================================================================ boot */
  Game.prototype.init = function () {
    var canvas = document.getElementById('game');
    V.init(canvas);
    RG.Input.init(canvas, document.getElementById('touchLayer'));
    RG.Minigames.attach(canvas);
    this.save = RG.Save.load();
    this.player = new RG.Player();
    RG.makePools(this);
    UI.init(this);
    UI.refreshHotbar();
    this.updateTouchMode();
    V.onResize = this.onResize.bind(this);

    var self = this;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { RG.Audio.suspend(); self.queueSave(); }
      else { RG.Audio.resume(); self.lastTime = RG.now(); }
    });
    window.addEventListener('pagehide', function () { RG.Save.flush(self.save); });
    window.addEventListener('beforeunload', function () { RG.Save.flush(self.save); });

    this.state = 'title';
    UI.open('title');
    this.world = this.getWorld('hub');
    this.player.reset(this, this.world.spawn.x, this.world.spawn.y);
    Cam.snap(this.player.x, this.player.y);
    this.applyWorldLook();

    this.lastTime = RG.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  };

  Game.prototype.onResize = function () {
    if (this.minigame && this.minigame.init) {
      /* mini-games lay out in screen space, so rebuild them on rotate */
      var id = this.minigame.id;
      var score = this.minigame.score;
      this.minigame.init(this);
      this.minigame.score = score;
    }
  };

  Game.prototype.updateTouchMode = function () {
    var mode = this.save.settings.touch;
    var on = mode === 'on' || (mode === 'auto' && RG.Input.touchAvailable);
    UI.setTouchVisible(on);
  };

  /* ================================================================ loop */
  Game.prototype.loop = function (now) {
    requestAnimationFrame(this.loop);
    var dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!(dt > 0)) dt = STEP;
    /* a long stall (tab restored, phone unlocked) must not fast-forward */
    if (dt > 0.25) dt = STEP;
    this.fps = this.fps * 0.92 + (1 / Math.max(dt, 0.0001)) * 0.08;
    this.adaptQuality(dt * 1000);

    try {
      this.acc += dt;
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.render();
    } catch (err) {
      this.handleError(err);
    }
  };

  /* Adaptive render scale. If a device cannot hold the frame budget we back
   * the resolution off rather than let the game stutter, and we climb back
   * up once it has headroom again. The user's quality setting is the
   * ceiling, never overridden. */
  Game.prototype.adaptQuality = function (frameMs) {
    if (frameMs > 250) return;
    this._frameAvg = this._frameAvg * 0.94 + frameMs * 0.06;
    this._scaleHold -= frameMs / 1000;
    if (this._scaleHold > 0) return;
    if (this._frameAvg > 23 && V.autoScale > 0.56) {
      if (V.setAutoScale(V.autoScale - 0.15)) { this._scaleHold = 3; this._frameAvg = 16.7; }
    } else if (this._frameAvg < 13.5 && V.autoScale < 0.999) {
      if (V.setAutoScale(V.autoScale + 0.15)) { this._scaleHold = 6; this._frameAvg = 16.7; }
    }
  };

  Game.prototype.handleError = function (err) {
    if (this._errShown) return;
    this._errShown = true;
    try {
      if (window.console && console.error) console.error('[ReGen]', err);
      RG.Save.flush(this.save);
      UI.info('Something went wrong',
        'ReGen hit an unexpected error and stopped the current scene. Your progress has been saved. ' +
        'Returning to Aetherhold.\n\n' + (err && err.message ? err.message : String(err)));
      var self = this;
      setTimeout(function () {
        self._errShown = false;
        self.travelTo('hub');
      }, 60);
    } catch (e2) { /* nothing further we can safely do */ }
  };

  Game.prototype.step = function (dt) {
    this.frame++;
    RG.Input.update();

    /* global hotkeys */
    if (this.state === 'play' && !UI.isOpen() && !UI.dialogOpen()) {
      if (RG.Input.justPressed('pause')) { this.pause(); RG.Input.consume('pause'); }
      else if (RG.Input.justPressed('map')) { UI.open('map'); RG.Input.consume('map'); }
      else if (RG.Input.justPressed('inventory')) { UI.open('vault'); RG.Input.consume('inventory'); }
      else {
        for (var hb = 0; hb < Data.HOTBAR.length; hb++) {
          var slotAction = 'slot' + Data.HOTBAR[hb].slot;
          if (RG.Input.justPressed(slotAction)) {
            RG.Input.consume(slotAction);
            this.useItem(Data.HOTBAR[hb].id);
            break;
          }
        }
      }
    } else if (UI.isOpen() && !UI.dialogOpen()) {
      if (RG.Input.justPressed('cancel')) { RG.Input.consume('cancel'); UI.back(); }
    }

    this.fade = M.damp(this.fade, this.fadeTarget, 9, dt);
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);

    if (this.state === 'minigame') {
      if (!UI.isOpen()) {
        P.update(dt); FT.update(dt);
        if (this.minigame) this.minigame.update(dt, this);
        if (RG.Input.justPressed('pause')) { RG.Input.consume('pause'); this.endMinigame(this.minigame.id, this.minigame.score); }
      }
      return;
    }

    if (this.state !== 'play') { P.update(dt); FT.update(dt); return; }
    if (UI.isOpen() || UI.dialogOpen()) { this.paused = true; return; }
    this.paused = false;

    /* only counted down while actually playing: a lure must not expire behind
     * the pause menu or the store */
    if (this.luckBoostT > 0) this.luckBoostT = Math.max(0, this.luckBoostT - dt);

    this.save.playtime += dt;
    this._saveTimer += dt;
    if (this._saveTimer > 20) { this._saveTimer = 0; this.queueSave(); }

    var p = this.player;
    p.update(dt, this);
    this.updateEnemies(dt);
    RG.updateProjectiles(dt, this);
    RG.updateEffects(dt, this);
    RG.updatePickups(dt, this);
    P.update(dt);
    FT.update(dt);
    this.updateSpawns(dt);
    this.updateStructures(dt);
    this.updateWeather(dt);

    Cam.update(dt);
    Cam.follow(p.x, p.y - 8, p.vx, p.vy, dt);

    /* combat intensity drives the soundtrack */
    var threat = 0;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      var d = M.dist2(e.x, e.y, p.x, p.y);
      if (d < 520 * 520) threat += e.def.boss ? 1.4 : 0.13;
    }
    RG.Audio.setIntensity(M.clamp01(threat));
  };

  /* ============================================================ enemies */
  Game.prototype.updateEnemies = function (dt) {
    var n = 0;
    var boss = null;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      e.update(dt, this);
      if (e.alive) { n++; if (e.def.boss) boss = e; }
    }
    this.enemyCount = n;
    this.activeBoss = boss;

    /* separation: keeps a pack from stacking into one super-enemy */
    for (var a = 0; a < this.enemies.length; a++) {
      var ea = this.enemies[a];
      if (!ea.alive || ea.def.boss) continue;
      for (var b = a + 1; b < this.enemies.length; b++) {
        var eb = this.enemies[b];
        if (!eb.alive || eb.def.boss) continue;
        var dx = eb.x - ea.x, dy = eb.y - ea.y;
        var rr = ea.r + eb.r;
        var d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          var d = Math.sqrt(d2);
          var push = (rr - d) * 0.5;
          var ux = dx / d, uy = dy / d;
          ea.x -= ux * push; ea.y -= uy * push;
          eb.x += ux * push; eb.y += uy * push;
        }
      }
    }
  };

  /* Spawn director: keeps a believable population around the player without
   * ever letting the entity count run away. */
  Game.prototype.updateSpawns = function (dt) {
    var w = this.world;
    if (w.def.safe) return;
    if (this.arena) { this.updateArena(dt); return; }

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.8;

    var density = w.def.density || 1;
    var cap = Math.round((this.activeBoss ? 10 : 20) * density);
    if (this.enemyCount >= cap) return;

    var pool = w.def.kind === 'dungeon'
      ? ['skeleton_dark', 'bat_cave', 'slime_dark', 'turret_trap']
      : (w.def.enemies || []);
    if (!pool.length) return;

    var p = this.player;
    var tries = 0;
    while (tries++ < 24) {
      var a = Math.random() * M.TAU;
      var dist = 320 + Math.random() * 260;
      var x = p.x + Math.cos(a) * dist;
      var y = p.y + Math.sin(a) * dist;
      if (x < 40 || y < 40 || x > w.px - 40 || y > w.px - 40) continue;
      var t = w.tileAtWorld(x, y);
      if (TP[t].solid || TP[t].damage) continue;
      /* skip anywhere the player can currently see, so nothing pops in */
      var sx = Cam.worldToScreenX(x), sy = Cam.worldToScreenY(y);
      if (sx > -60 && sy > -60 && sx < V.w + 60 && sy < V.h + 60) continue;

      var id = pool[(Math.random() * pool.length) | 0];
      var elite = Math.random() < 0.05 + (w.def.level || 1) * 0.002;
      RG.spawnEnemy(this, id, x, y, this.levelScale, elite);
      /* small packs read better than a scatter of singles */
      if (Math.random() < 0.4) {
        var extra = 1 + (Math.random() * 2 | 0);
        for (var k = 0; k < extra && this.enemyCount + k < cap; k++) {
          RG.spawnEnemy(this, pool[(Math.random() * pool.length) | 0],
            x + (Math.random() - 0.5) * 70, y + (Math.random() - 0.5) * 70, this.levelScale);
        }
      }
      return;
    }
  };

  /* ============================================================== arena */
  Game.prototype.updateArena = function (dt) {
    var ar = this.arena;
    if (ar.done) return;
    if (this.enemyCount === 0) {
      ar.between -= dt;
      if (ar.between <= 0) this.startArenaWave();
    }
  };

  Game.prototype.startArenaWave = function () {
    var ar = this.arena;
    ar.wave++;
    ar.between = 3.2;
    var c = this.world.arenaCenter;
    var pools = [
      ['slime_green', 'bat_forest', 'spider_wood', 'imp_moss'],
      ['skeleton_burn', 'imp_fire', 'flame_lesser', 'crab_magma'],
      ['wolf_frost', 'skeleton_ice', 'wisp_frost', 'bat_ice'],
      ['shade_void', 'wisp_void', 'spider_void', 'knight_void']
    ];
    var tier = Math.min(3, Math.floor((ar.wave - 1) / 4));
    var pool = pools[tier];
    var count = Math.min(18, 3 + Math.floor(ar.wave * 1.25));
    this.levelScale = 1 + ar.wave * 0.34;
    this.dropScale = 0.5;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * M.TAU;
      var d = c.r * (0.45 + Math.random() * 0.42);
      RG.spawnEnemy(this, pool[(Math.random() * pool.length) | 0],
        c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, this.levelScale,
        ar.wave > 5 && Math.random() < 0.12);
    }
    if (ar.wave % 5 === 0) {
      RG.spawnEnemy(this, 'boss_guardian', c.x, c.y - c.r * 0.5, this.levelScale * 0.5);
      this.toast('Wave ' + ar.wave + ' - Guardian', 'warn');
    } else {
      this.toast('Wave ' + ar.wave, 'good');
    }
    RG.Audio.play('portal');
  };

  /* ========================================================= structures */
  Game.prototype.updateStructures = function (dt) {
    var w = this.world, p = this.player;
    var best = null, bestD = 999999;
    for (var i = 0; i < w.structures.length; i++) {
      var s = w.structures[i];
      var d = M.dist2(s.x, s.y, p.x, p.y);
      var reach = (s.r + 20) * (s.r + 20);
      if (d < reach && d < bestD) { bestD = d; best = s; }

      /* landmark discovery */
      if (s.kind === 'shrine' && !s.found && d < 200 * 200) {
        s.found = true;
        this.markStructureFound(s);
        this.discover(s.name);
      }
      /* ambient light from portals and shrines */
      if (s.kind === 'gate' || s.kind === 'portal') L.add(s.x, s.y - 20, 120, '#a87aff', 0.8);
      if (s.kind === 'shrine' && !s.used) L.add(s.x, s.y - 20, 90, '#7fe0ff', 0.7);
      if (s.kind === 'save') L.add(s.x, s.y - 20, 130, '#7fffd4', 0.8);
    }
    this.nearStructure = best;
    if (best && RG.Input.justPressed('interact')) {
      RG.Input.consume('interact');
      this.interact(best);
    }
  };

  Game.prototype.interact = function (s) {
    var self = this;
    switch (s.kind) {
      case 'shop': UI.openStore('consumable'); break;
      case 'vault': UI.open('vault'); break;
      case 'quests': UI.open('quests'); break;
      case 'stats': UI.open('records'); break;
      case 'arcade': UI.open('arcade'); break;
      case 'forge':
        UI.openStore('upgrade');
        break;
      case 'save':
        this.player.heal(this.player.maxHp, false);
        RG.Save.flush(this.save);
        RG.Audio.play('heal');
        P.ring(this.player.x, this.player.y - 12, 60, 'rgba(127,255,212,0.9)', 0.6, 4);
        this.toast('Rested. Health restored and progress saved.', 'good', 'star');
        break;
      case 'gate': {
        var sw = this.save.worlds[s.to];
        if (!sw || !sw.unlocked) {
          UI.open('gate');
        } else if (this.save.level + 4 < Data.worldById(s.to).level) {
          UI.confirm('Travel to ' + s.name + '?',
            'Recommended level ' + Data.worldById(s.to).level + '. You are level ' + this.save.level + '. This will hurt.',
            function () { self.travelTo(s.to); });
        } else this.travelTo(s.to);
        break;
      }
      case 'portal':
        if (s.to === 'exit') this.exitDungeon(true);
        else this.travelTo(s.to);
        break;
      case 'dungeon':
        UI.confirm('Descend into ' + s.name + '?',
          'Three floors down, one Guardian at the bottom. Dying inside costs you the run, not your profile.',
          function () { self.enterDungeon(s); });
        break;
      case 'descend':
        if (this.save.keys > 0) {
          this.save.keys--;
          RG.Audio.play('door');
          this.nextDungeonFloor();
        } else {
          RG.Audio.play('error');
          this.toast('The stair is sealed. Find the warded chest on this floor.', 'bad', 'lock');
        }
        break;
      case 'chest': this.openChest(s); break;
      case 'shrine': this.useShrine(s); break;
      case 'boss':
      case 'dungeonboss': this.startBoss(s); break;
    }
  };

  Game.prototype.openChest = function (s) {
    if (s.used) { this.toast('Already emptied.', 'bad'); RG.Audio.play('error'); return; }
    s.used = true;
    this.markStructureUsed(s);
    this.save.stats.chests++;
    this.bumpQuest('chest', 1);
    RG.Audio.play('unlock');
    P.burst(s.x, s.y - 10, 26, '#f5c542', { speed: 150, life: 0.8, size: 3.4, glow: 1, grav: 120 });
    P.ring(s.x, s.y - 10, 60, 'rgba(245,197,66,0.9)', 0.5, 3);

    var lucky = 1 + this.player.stats.luck * 0.014;
    var mult = s.quality === 'good' ? 2.6 : (s.quality === 'key' ? 1.6 : 1);
    var coins = Math.round((60 + (this.world.def.level || 1) * 22) * mult * lucky * (0.75 + Math.random() * 0.6));
    RG.spawnPickups(this, s.x, s.y - 10, 'coin', Math.min(20, 6 + (mult * 3 | 0)), coins);

    if (s.quality === 'key') {
      this.save.keys++;
      this.toast('Rift Key acquired', 'good', 'key');
    }
    if (Math.random() < (s.quality === 'good' ? 0.34 : 0.1) * lucky) {
      RG.spawnPickups(this, s.x, s.y - 10, 'gem', 1, 1 + (Math.random() * 2 | 0));
    }
    /* a small chance of a free skin keeps every chest worth opening */
    if (Math.random() < (s.quality === 'good' ? 0.14 : 0.05) * lucky) {
      var got = this.grantRandomSkin(['common', 'rare']);
      if (got) UI.showReward('Cache Find', [{ icon: 'bag', text: 'A new skin was folded inside.' }], got);
    }
  };

  Game.prototype.useShrine = function (s) {
    if (s.used) { this.toast('This shrine is spent.', 'bad'); RG.Audio.play('error'); return; }
    s.used = true;
    this.markStructureUsed(s);
    RG.Audio.play('levelup');
    P.ring(s.x, s.y - 16, 120, 'rgba(127,224,255,0.9)', 0.8, 5);
    P.burst(s.x, s.y - 16, 34, '#7fe0ff', { speed: 160, life: 1, size: 3.4, glow: 1 });
    var roll = Math.random();
    if (roll < 0.4) {
      this.player.heal(this.player.maxHp, false);
      this.player.shield += 120;
      this.toast('The shrine mends you. Health restored, ward granted.', 'good', 'heart');
    } else if (roll < 0.7) {
      var xp = 60 + (this.world.def.level || 1) * 30;
      this.gainXp(xp);
      this.toast('The shrine shares what it remembers. +' + xp + ' XP', 'good', 'star');
    } else {
      var c = 200 + (this.world.def.level || 1) * 60;
      this.gainCoins(c);
      this.toast('An old offering, still counted. +' + RG.fmt(c) + ' coins', 'good', 'coin');
    }
  };

  Game.prototype.discover = function (name) {
    this.save.stats.discovered++;
    this.bumpQuest('discover', 1);
    this.toast('Discovered: ' + name, 'good', 'map');
    this.gainXp(25 + (this.world.def.level || 1) * 8);
    this.checkAchievements();
  };

  Game.prototype.startBoss = function (s) {
    if (s.used === true) { this.toast('You have already beaten this one.', 'bad'); return; }
    if (s.used === 'fighting') { this.toast('It is already awake - find it.', 'warn', 'skull'); return; }
    var self = this;
    UI.confirm('Challenge ' + s.name + '?', 'This fight does not stop until one of you does.', function () {
      s.used = 'fighting';
      var e = RG.spawnEnemy(self, s.boss, s.x, s.y - 40, self.levelScale);
      if (e) { e.aggro = true; e.structure = s; }
      RG.Audio.play('boss');
      RG.Audio.playMusic('boss');
      RG.Cam.addShake(14);
      self.hitFlash = 0.4;
      self.toast(s.name + ' awakens', 'warn', 'skull');
    });
  };

  /* ============================================================ economy */
  Game.prototype.collect = function (kind, value, x, y) {
    if (kind === 'coin') { this.gainCoins(value); RG.Audio.play('coin'); }
    else if (kind === 'gem') {
      this.save.gems += value;
      this.save.stats.gemsEarned += value;
      RG.Audio.play('gem');
      FT.add(x, y - 10, '+' + value, '#8ceaff', 12);
    } else if (kind === 'heart') {
      this.player.heal(value);
      RG.Audio.play('heal');
    } else if (kind === 'xp') {
      this.gainXp(value);
      RG.Audio.play('pickup');
    }
  };

  Game.prototype.gainCoins = function (n) {
    n = Math.round(n);
    this.save.coins += n;
    this.save.stats.coinsEarned += n;
    this.runStats.coins += n;
  };

  Game.prototype.gainXp = function (n) {
    n = Math.round(n);
    if (this.save.level >= Data.MAX_LEVEL) return;
    this.save.xp += n;
    var guard = 0;
    while (this.save.level < Data.MAX_LEVEL && this.save.xp >= Data.xpForLevel(this.save.level) && guard++ < 60) {
      this.save.xp -= Data.xpForLevel(this.save.level);
      this.save.level++;
      this.onLevelUp();
    }
  };

  Game.prototype.onLevelUp = function () {
    var p = this.player;
    var before = p.maxHp;
    p.recompute(this);
    p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - before) + 30);
    RG.Audio.play('levelup');
    P.ring(p.x, p.y - 12, 90, 'rgba(245,197,66,0.9)', 0.7, 4);
    P.burst(p.x, p.y - 12, 34, '#ffd76a', { speed: 170, life: 0.9, size: 3.6, glow: 1, kind: 5, vrot: 4 });
    FT.add(p.x, p.y - 46, 'LEVEL ' + this.save.level, '#ffd76a', 17, true);
    this.toast('Level ' + this.save.level + '  -  stronger, faster, harder to kill', 'good', 'star');
    this.checkAchievements();
    this.queueSave();
  };

  Game.prototype.buy = function (it, price) {
    var s = this.save;
    var cur = it.cur === 'gems' ? 'gems' : 'coins';

    /* Validate everything before a single field is mutated, so a rejected
     * purchase can never leave the profile half-changed. */
    if (s[cur] < price) {
      RG.Audio.play('error');
      this.toast('Not enough ' + cur + ' - you need ' + RG.fmt(price - s[cur]) + ' more.', 'bad',
        cur === 'gems' ? 'gem' : 'coin');
      return false;
    }
    var bought = s.purchases[it.id] || 0;
    if (it.repeat !== undefined && bought >= it.repeat) {
      RG.Audio.play('error');
      this.toast(it.name + ' is already fully upgraded.', 'bad');
      return false;
    }
    var carrying = s.inventory[it.id] || 0;
    if (it.cat === 'consumable' && !it.instant && carrying >= it.stack) {
      RG.Audio.play('error');
      this.toast('You are already carrying ' + it.stack + ' ' + it.name + '. Use one first.', 'bad', it.icon);
      return false;
    }

    s[cur] -= price;
    s.purchases[it.id] = bought + 1;
    RG.Audio.play('buy');

    var eff = it.effect || {};
    if (eff.upHp) s.upgrades.hp += eff.upHp;
    if (eff.upDmg) s.upgrades.dmg += eff.upDmg;
    if (eff.upSpd) s.upgrades.spd += eff.upSpd;
    if (eff.upLuck) s.upgrades.luck += eff.upLuck;
    if (eff.upCrit) s.upgrades.crit += eff.upCrit;
    if (eff.gems) { s.gems += eff.gems; s.stats.gemsEarned += eff.gems; }

    if (it.chest) {
      this.openCache(it);
    } else if (it.cat === 'consumable') {
      if (it.instant) {
        /* a resource, not something you drink: it lands where it is used */
        if (eff.key) {
          s.keys += eff.key;
          this.toast('Rift Key added - you now carry ' + s.keys + '.', 'good', 'key');
        }
      } else {
        s.inventory[it.id] = carrying + 1;
        /* Use it right now if it would actually do something; otherwise it
         * waits on the quick bar rather than silently vanishing. */
        if (this.canUseItem(it.id)) {
          this.useItem(it.id);
        } else {
          this.toast(it.name + ' is in your bag (' + s.inventory[it.id] + '). ' + this.slotHint(it), 'good', it.icon);
        }
      }
    } else {
      this.player.recompute(this);
      this.toast(it.name + ' - ' + it.desc, 'good', it.icon);
    }

    this.checkAchievements();
    UI.refresh_store();
    UI.refreshWallets();
    UI.refreshHotbar();
    this.queueSave();
    return true;
  };

  /* Wording that matches how the player is actually holding the game. */
  Game.prototype.slotHint = function (it) {
    if (!it.slot) return '';
    return RG.Input.device === 'touch'
      ? 'Tap it on the item bar to use it.'
      : 'Press ' + it.slot + ' to use it.';
  };

  /* Would using this item right now accomplish anything? */
  Game.prototype.canUseItem = function (id) {
    var it = Data.shopItem(id);
    if (!it || !it.effect || it.instant) return false;
    if ((this.save.inventory[id] || 0) <= 0) return false;
    var p = this.player;
    if (!p || p.dead || this.state !== 'play') return false;
    var e = it.effect;
    if (e.heal) return p.hp < p.maxHp - 0.5;
    if (e.shield) return p.shield < e.shield;
    if (e.luckBoost) return this.luckBoostT < e.luckBoost * 0.5;
    return true;
  };

  /* Consumes one of the item and applies it. Returns whether anything
   * happened, so callers never have to guess. */
  Game.prototype.useItem = function (id) {
    var it = Data.shopItem(id);
    var s = this.save;
    if (!it || !it.effect) return false;
    if ((s.inventory[id] || 0) <= 0) {
      RG.Audio.play('error');
      this.toast('You have no ' + (it ? it.name : 'item') + ' left.', 'bad');
      return false;
    }
    if (!this.canUseItem(id)) {
      RG.Audio.play('error');
      var why = it.effect.heal ? 'Your health is already full.'
        : (it.effect.shield ? 'Your ward is still holding.'
          : 'That is already active.');
      this.toast(why, 'bad', it.icon);
      return false;
    }

    s.inventory[id] = s.inventory[id] - 1;
    var p = this.player;
    var e = it.effect;

    if (e.heal) {
      var before = p.hp;
      p.heal(e.heal, false);
      var gained = Math.round(p.hp - before);
      RG.Audio.play('heal');
      FT.add(p.x, p.y - 40, '+' + gained, '#4ad88a', 14, true);
      P.burst(p.x, p.y - 12, 18, '#4ad88a', { speed: 110, life: 0.7, size: 3.2, glow: 1, kind: 5, vrot: 4 });
      P.ring(p.x, p.y - 12, 46, 'rgba(74,216,138,0.85)', 0.5, 3);
      this.toast(it.name + ' - restored ' + gained + ' health', 'good', 'heart');
    } else if (e.shield) {
      p.shield = e.shield;
      RG.Audio.play('unlock');
      P.ring(p.x, p.y - 12, 54, 'rgba(140,216,255,0.9)', 0.6, 4);
      P.burst(p.x, p.y - 12, 16, '#8cd8ff', { speed: 100, life: 0.7, size: 3, glow: 1 });
      this.toast(it.name + ' - absorbing the next ' + e.shield + ' damage', 'good', 'shield');
    } else if (e.luckBoost) {
      this.luckBoostT = e.luckBoost;
      RG.Audio.play('gem');
      P.burst(p.x, p.y - 12, 22, '#f5c542', { speed: 130, life: 0.8, size: 3.4, glow: 1, kind: 5, vrot: 5 });
      this.toast(it.name + ' - double coins for ' + Math.round(e.luckBoost / 60) + ' minutes', 'good', 'star');
    }

    UI.refreshHotbar();
    if (UI.currentName() === 'store') UI.refresh_store();
    this.queueSave();
    return true;
  };

  /* Split out of buy() so a cache opened from anywhere behaves the same. */
  Game.prototype.openCache = function (it) {
    var s = this.save;
    var rar = this.pickRarity(it.chest);
    var skin = this.grantRandomSkin([rar]);
    var lines = [];
    var bonus = Math.round(it.price * 0.25);
    this.gainCoins(bonus);
    lines.push({ icon: 'coin', text: '+' + RG.fmt(bonus) + ' coins' });
    if (it.chest.gems) {
      s.gems += it.chest.gems;
      s.stats.gemsEarned += it.chest.gems;
      lines.push({ icon: 'gem', text: '+' + it.chest.gems + ' gems' });
    }
    if (!skin) {
      this.gainCoins(bonus);
      lines.push({ icon: 'star', text: 'Every skin this cache can hold is already yours, so the coins were doubled.' });
    }
    UI.showReward(it.name, lines, skin);
  };

  Game.prototype.pickRarity = function (chest) {
    var total = 0, i;
    for (i = 0; i < chest.w.length; i++) total += chest.w[i];
    var r = Math.random() * total;
    for (i = 0; i < chest.w.length; i++) { r -= chest.w[i]; if (r <= 0) return chest.pool[i]; }
    return chest.pool[0];
  };

  Game.prototype.grantRandomSkin = function (rarities) {
    var pool = [];
    for (var i = 0; i < Data.SKINS.length; i++) {
      var sk = Data.SKINS[i];
      if (sk.currency === 'locked') continue;
      if (rarities.indexOf(sk.rarity) === -1) continue;
      if (this.save.owned.indexOf(sk.id) !== -1) continue;
      pool.push(sk);
    }
    if (!pool.length) {
      /* widen the search before giving up entirely */
      for (var j = 0; j < Data.SKINS.length; j++) {
        var s2 = Data.SKINS[j];
        if (s2.currency === 'locked') continue;
        if (this.save.owned.indexOf(s2.id) === -1) pool.push(s2);
      }
    }
    if (!pool.length) return null;
    var pick = pool[(Math.random() * pool.length) | 0];
    this.save.owned.push(pick.id);
    RG.Audio.play('unlock');
    this.bumpQuest('skins', 0);
    this.checkAchievements();
    this.queueSave();
    return pick;
  };

  Game.prototype.buySkin = function (sk) {
    var s = this.save;
    if (s.owned.indexOf(sk.id) !== -1) { this.equipSkin(sk.id); return; }
    if (sk.currency === 'locked') { RG.Audio.play('error'); this.toast('This one has to be earned.', 'bad'); return; }
    var cur = sk.currency === 'gems' ? 'gems' : 'coins';
    if (s[cur] < sk.price) { RG.Audio.play('error'); this.toast('Not enough ' + cur + '.', 'bad'); return; }
    s[cur] -= sk.price;
    s.owned.push(sk.id);
    RG.Audio.play('unlock');
    this.toast('Unlocked ' + sk.name, 'good', 'bag');
    this.equipSkin(sk.id);
    this.bumpQuest('skins', 0);
    this.checkAchievements();
    UI.refresh_vault();
    UI.refreshWallets();
    this.queueSave();
  };

  Game.prototype.equipSkin = function (id) {
    if (this.save.owned.indexOf(id) === -1) return;
    this.save.skin = id;
    this.player.recompute(this);
    RG.Audio.play('buy');
    var sk = Data.skinById(id);
    this.toast('Equipped ' + sk.name + '  -  ' + sk.perkText, 'good');
    P.burst(this.player.x, this.player.y - 12, 24, sk.colors.accent || '#8ad6ff',
      { speed: 140, life: 0.7, size: 3.4, glow: 1, kind: 5, vrot: 5 });
    UI.refresh_vault();
    this.queueSave();
  };

  /* =========================================================== progress */
  Game.prototype.bumpQuest = function (type, amount, extra) {
    var s = this.save;
    for (var i = 0; i < Data.QUESTS.length; i++) {
      var q = Data.QUESTS[i];
      if (s.questsDone.indexOf(q.id) !== -1) continue;
      if (q.type !== type) continue;
      if (q.world && q.world !== this.world.id) continue;
      if (q.boss && q.boss !== extra) continue;

      var val;
      if (type === 'skins') val = s.owned.length;
      else if (type === 'minigames') val = Object.keys(s.stats.minigamesPlayed || {}).length;
      else val = (s.quests[q.id] || 0) + amount;
      s.quests[q.id] = val;

      if (val >= q.target) {
        s.questsDone.push(q.id);
        var r = q.reward;
        if (r.coins) this.gainCoins(r.coins);
        if (r.gems) { s.gems += r.gems; s.stats.gemsEarned += r.gems; }
        if (r.xp) this.gainXp(r.xp);
        RG.Audio.play('win');
        var lines = [];
        if (r.coins) lines.push({ icon: 'coin', text: '+' + RG.fmt(r.coins) + ' coins' });
        if (r.gems) lines.push({ icon: 'gem', text: '+' + r.gems + ' gems' });
        if (r.xp) lines.push({ icon: 'star', text: '+' + RG.fmt(r.xp) + ' XP' });
        UI.showReward('Quest complete: ' + q.title, lines, null);
      }
    }
    this.queueSave();
  };

  Game.prototype.achievementValue = function (ac) {
    var s = this.save;
    if (ac.stat === 'level') return s.level;
    if (ac.stat === 'skinCount') return s.owned.length;
    /* distinct world bosses, so farming dungeon guardians does not count */
    if (ac.stat === 'worldBosses') return (s.stats.bossList || []).length;
    return s.stats[ac.stat] || 0;
  };

  Game.prototype.checkAchievements = function () {
    var s = this.save;
    for (var i = 0; i < Data.ACHIEVEMENTS.length; i++) {
      var ac = Data.ACHIEVEMENTS[i];
      if (s.achievements.indexOf(ac.id) !== -1) continue;
      if (this.achievementValue(ac) < ac.target) continue;
      s.achievements.push(ac.id);
      if (ac.reward.coins) this.gainCoins(ac.reward.coins);
      if (ac.reward.gems) { s.gems += ac.reward.gems; s.stats.gemsEarned += ac.reward.gems; }
      RG.Audio.play('unlock');
      this.toast('Achievement: ' + ac.name, 'good', 'trophy');
    }
    /* mythic skins are unlocked by deed, never bought */
    this.checkMythic();
  };

  Game.prototype.checkMythic = function () {
    var s = this.save;
    var grant = function (self, id, msg) {
      if (s.owned.indexOf(id) !== -1) return;
      s.owned.push(id);
      RG.Audio.play('unlock');
      UI.showReward('Mythic unlocked', [{ icon: 'trophy', text: msg }], Data.skinById(id));
    };
    var bosses = s.stats.bossList || [];
    if (bosses.length >= 4) grant(this, 'regenesis', 'All four worlds answer to you now.');
    if (s.owned.length >= 30) grant(this, 'archivist', 'Thirty skins. The Archivist noticed.');
    if (s.stats.flawless) grant(this, 'perfectrun', 'A dungeon cleared without a scratch.');
  };

  /* ============================================================ toasts */
  Game.prototype.toast = function (text, kind, icon) { UI.toast(text, kind, icon); };

  Game.prototype.objectiveText = function () {
    var s = this.save;
    if (this.arena) return 'Wave ' + this.arena.wave + '  -  survive';
    if (this.world.def.kind === 'dungeon') {
      if (this.world.floor >= this.world.maxFloor) return 'Find and defeat the Dungeon Guardian';
      return s.keys > 0 ? 'Descend to floor ' + (this.world.floor + 1) : 'Find the warded chest for a Rift Key';
    }
    for (var i = 0; i < Data.QUESTS.length; i++) {
      var q = Data.QUESTS[i];
      if (s.questsDone.indexOf(q.id) !== -1) continue;
      var prog = s.quests[q.id] || 0;
      if (q.type === 'skins') prog = s.owned.length;
      return q.title + ': ' + Math.min(prog, q.target) + '/' + q.target;
    }
    return '';
  };

  /* ========================================================= transitions */
  Game.prototype.getWorld = function (id) {
    if (this.worldCache[id]) return this.worldCache[id];
    var def = Data.worldById(id);
    var sw = this.save.worlds[id];
    if (sw && !sw.seed) { sw.seed = (Math.random() * 0xfffffff) | 0 || 12345; }
    var seed = id === 'hub' ? 1337 : (sw ? sw.seed : 999);
    var w = new RG.World(def, seed);
    this.applyWorldProgress(w);
    this.worldCache[id] = w;
    return w;
  };

  /* A world is regenerated from its seed every session, so which caches were
   * looted and which shrines were spent has to be replayed onto it - without
   * this, restarting the game refills every chest on the map. */
  Game.prototype.applyWorldProgress = function (w) {
    var sw = this.save.worlds[w.id];
    for (var i = 0; i < w.structures.length; i++) {
      var st = w.structures[i];
      st.sid = i;
      if (!sw) continue;
      if (sw.used && sw.used.indexOf(i) !== -1) st.used = true;
      if (sw.found && sw.found.indexOf(i) !== -1) st.found = true;
    }
  };

  Game.prototype.markStructureUsed = function (st) {
    var sw = this.save.worlds[this.world.id];
    /* dungeons and the arena are throwaway worlds; nothing to remember */
    if (!sw || st.sid === undefined) return;
    if (!sw.used) sw.used = [];
    if (sw.used.indexOf(st.sid) === -1) sw.used.push(st.sid);
    this.queueSave();
  };

  Game.prototype.markStructureFound = function (st) {
    var sw = this.save.worlds[this.world.id];
    if (!sw || st.sid === undefined) return;
    if (!sw.found) sw.found = [];
    if (sw.found.indexOf(st.sid) === -1) sw.found.push(st.sid);
  };

  Game.prototype.applyWorldLook = function () {
    var b = RG.BIOMES[this.world.def.biome] || RG.BIOMES.verdant;
    this.sky = b.sky;
    L.begin(b.ambient, b.light);
    Cam.setBounds(0, 0, this.world.px, this.world.px);
    Cam.targetZoom = 1;
  };

  Game.prototype.travelTo = function (id, silent) {
    var self = this;
    this.fadeTarget = 1;
    RG.Audio.play('portal');
    this.recordArenaScore();
    setTimeout(function () {
      self.arena = null;
      self.dungeonCtx = null;
      self.minigame = null;
      document.body.classList.remove('minigame');
      self.clearEntities();
      self.world = self.getWorld(id);
      self.state = 'play';
      self.levelScale = Math.max(1, Math.pow(1.30, (self.world.def.level || 1) - 1));
      self.dropScale = 1 + ((self.world.def.level || 1) - 1) * 0.06;
      self.player.reset(self, self.world.spawn.x, self.world.spawn.y);
      self.applyWorldLook();
      Cam.snap(self.player.x, self.player.y);
      RG.Audio.playMusic(self.world.def.music || 'hub');
      self.fadeTarget = 0;
      if (!silent) self.toast(self.world.def.name, 'good', self.world.def.icon);
      self.queueSave();
    }, 260);
  };

  Game.prototype.enterDungeon = function (s) {
    var self = this;
    this.dungeonCtx = { from: this.world.id, tier: s.tier || 0, seed: s.seed || 1, floor: 1, maxFloor: 3, flawless: true };
    /* a fresh descent starts clean, whatever happened on earlier runs */
    this.player.noDamageRun = true;
    this.fadeTarget = 1;
    RG.Audio.play('door');
    setTimeout(function () { self.buildDungeonFloor(); }, 260);
  };

  Game.prototype.nextDungeonFloor = function () {
    var self = this;
    this.dungeonCtx.floor++;
    this.fadeTarget = 1;
    setTimeout(function () { self.buildDungeonFloor(); }, 260);
  };

  Game.prototype.buildDungeonFloor = function () {
    var d = this.dungeonCtx;
    this.clearEntities();
    this.world = RG.makeDungeon((d.seed + d.floor * 7919) >>> 0, d.tier, d.floor, d.maxFloor);
    this.state = 'play';
    var baseLevel = Data.worldById(d.from).level || 1;
    this.levelScale = Math.max(1, Math.pow(1.30, baseLevel - 1)) * (1 + (d.floor - 1) * 0.35 + d.tier * 0.2);
    this.dropScale = (1 + (baseLevel - 1) * 0.06) * (1 + (d.floor - 1) * 0.25);
    this.player.x = this.world.spawn.x;
    this.player.y = this.world.spawn.y;
    this.player.noDamageRun = this.player.noDamageRun && d.flawless;
    this.applyWorldLook();
    Cam.snap(this.player.x, this.player.y);
    RG.Audio.playMusic('dungeon');
    this.fadeTarget = 0;
    this.toast('Rift Depths  -  Floor ' + d.floor + ' of ' + d.maxFloor, 'warn', 'key');
    this.queueSave();
  };

  Game.prototype.exitDungeon = function (voluntary) {
    var from = this.dungeonCtx ? this.dungeonCtx.from : 'hub';
    this.dungeonCtx = null;
    this.travelTo(from);
    if (voluntary) this.toast('You climb back into daylight.', 'good');
  };

  Game.prototype.completeDungeon = function () {
    var d = this.dungeonCtx;
    var s = this.save;
    s.stats.dungeons++;
    this.bumpQuest('dungeon', 1);
    var flawless = this.player.noDamageRun && d && d.flawless;
    if (flawless) s.stats.flawless = true;
    var coins = 900 + (Data.worldById(d ? d.from : 'verdant').level || 1) * 260;
    var gems = 6 + (d ? d.tier : 0) * 2;
    this.gainCoins(coins);
    s.gems += gems; s.stats.gemsEarned += gems;
    this.gainXp(400 + (Data.worldById(d ? d.from : 'verdant').level || 1) * 120);
    var lines = [
      { icon: 'coin', text: '+' + RG.fmt(coins) + ' coins' },
      { icon: 'gem', text: '+' + gems + ' gems' }
    ];
    if (flawless) lines.push({ icon: 'trophy', text: 'Flawless: you never took a hit.' });
    var skin = Math.random() < 0.35 ? this.grantRandomSkin(['rare', 'epic']) : null;
    this.checkAchievements();
    var self = this;
    UI.showReward('Dungeon cleared', lines, skin, function () { self.exitDungeon(false); });
    this.queueSave();
  };

  /* A boss the player fled from or died to must become challengeable again;
   * otherwise the 'fighting' marker locks it out for the rest of the save. */
  Game.prototype.releaseUnfinishedBosses = function () {
    var list = this.world && this.world.structures;
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i].used === 'fighting') list[i].used = false;
    }
  };

  Game.prototype.clearEntities = function () {
    this.releaseUnfinishedBosses();
    for (var i = 0; i < this.enemies.length; i++) this.enemies[i].alive = false;
    for (var j = 0; j < this.projectiles.length; j++) this.projectiles[j].alive = false;
    for (var k = 0; k < this.pickups.length; k++) this.pickups[k].alive = false;
    for (var m = 0; m < this.effects.length; m++) this.effects[m].alive = false;
    P.clear(); FT.clear();
    this.activeBoss = null;
    this.enemyCount = 0;
    this.nearStructure = null;
  };

  /* ============================================================ events */
  Game.prototype.onEnemyKilled = function (e) {
    var s = this.save;
    s.stats.kills++;
    this.runStats.kills++;
    this.bumpQuest('kill', 1);
    if (this.arena) this.arena.kills++;
    if (e.def.boss) {
      s.stats.bossesKilled++;
      if (this.arena) {
        /* an arena guardian is a wave, not a world boss: it must not touch
         * world unlocks or pop a "world restored" screen mid-run */
        this.checkAchievements();
        return;
      }
      this.bumpQuest('boss', 1, e.id);
      if (e.structure) { e.structure.used = true; this.markStructureUsed(e.structure); }
      if (e.id === 'boss_guardian' && this.world.def.kind === 'dungeon') {
        var self = this;
        setTimeout(function () { self.completeDungeon(); }, 1400);
      } else {
        var wid = this.world.id;
        if (s.worlds[wid]) s.worlds[wid].boss = true;
        if (!s.stats.bossList) s.stats.bossList = [];
        if (s.stats.bossList.indexOf(e.id) === -1) s.stats.bossList.push(e.id);
        this.unlockNextWorld(wid);
        RG.Audio.playMusic(this.world.def.music);
      }
    }
    this.checkAchievements();
  };

  Game.prototype.unlockNextWorld = function (fromId) {
    for (var i = 0; i < Data.WORLDS.length; i++) {
      var w = Data.WORLDS[i];
      if (w.req === fromId && this.save.worlds[w.id] && !this.save.worlds[w.id].unlocked) {
        this.save.worlds[w.id].unlocked = true;
        UI.showReward('New world unlocked', [
          { icon: w.icon, text: w.name + ' is now reachable from the Aetherhold gates.' },
          { icon: 'star', text: w.desc }
        ], null);
        return;
      }
    }
    UI.showReward('World restored', [{ icon: 'trophy', text: 'You have cleared every guardian this world had.' }], null);
  };

  Game.prototype.onPlayerDeath = function () {
    var s = this.save;
    s.stats.deaths++;
    if (this.arena) this.recordArenaScore();
    var msgs = [
      'The Blight took this one. It does not get to keep it.',
      'You fall. The world keeps turning, which is the point.',
      'Down, but the Regen always comes back.',
      'That is what it costs to learn a pattern.'
    ];
    this.deathMessage = msgs[(Math.random() * msgs.length) | 0];
    /* dying costs a slice of carried coins, never progress */
    var lost = Math.round(s.coins * 0.1);
    if (lost > 0) { s.coins -= lost; this.deathMessage += '  You dropped ' + RG.fmt(lost) + ' coins.'; }
    if (this.dungeonCtx) this.dungeonCtx.flawless = false;
    this.queueSave();
    var self = this;
    setTimeout(function () { UI.open('gameover'); }, 900);
  };

  /* The Blight Arena is scored on how far the run got. Recorded on every
   * death so a revived run can only ever improve on it. */
  Game.prototype.recordArenaScore = function () {
    var a = this.arena;
    if (!a) return 0;
    var score = Math.max(0, (a.wave - 1)) * 260 + a.kills * 12;
    a.score = score;
    var s = this.save;
    if (score > (s.best.arena || 0)) s.best.arena = score;
    s.stats.miniScore = (s.stats.miniScore || 0) + score - (a.banked || 0);
    a.banked = score;
    this.checkAchievements();
    this.queueSave();
    return score;
  };

  Game.prototype.revive = function () {
    if (this.save.gems < 10) { RG.Audio.play('error'); return; }
    this.save.gems -= 10;
    UI.closeAll();
    var p = this.player;
    p.dead = false;
    p.hp = p.maxHp;
    p.shield = 60;
    p.iframes = 2.4;
    RG.Audio.play('heal');
    P.ring(p.x, p.y - 12, 120, 'rgba(127,255,212,0.9)', 0.8, 5);
    this.clearNearbyEnemies(260);
    this.queueSave();
  };

  Game.prototype.clearNearbyEnemies = function (radius) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive || e.def.boss) continue;
      if (M.dist2(e.x, e.y, this.player.x, this.player.y) < radius * radius) {
        var a = Math.atan2(e.y - this.player.y, e.x - this.player.x);
        e.vx += Math.cos(a) * 400; e.vy += Math.sin(a) * 400;
        e.stun = 1.5;
      }
    }
  };

  /* ========================================================= mini-games */
  Game.prototype.startMinigame = function (id) {
    if (id === 'arena') { this.startArena(); return; }
    var mg = RG.Minigames.get(id);
    if (!mg) return;
    this.minigame = mg;
    this.state = 'minigame';
    /* the cabinets draw their own screen; the world HUD has no business
     * sitting on top of them */
    document.body.classList.add('minigame');
    P.clear(); FT.clear();
    mg.init(this);
    this.save.stats.minigamesPlayed = this.save.stats.minigamesPlayed || {};
    this.save.stats.minigamesPlayed[id] = (this.save.stats.minigamesPlayed[id] || 0) + 1;
    this.bumpQuest('minigames', 0);
  };

  Game.prototype.startArena = function () {
    var self = this;
    this.fadeTarget = 1;
    setTimeout(function () {
      self.clearEntities();
      self.world = RG.makeArena((Math.random() * 1e9) | 0);
      self.arena = { wave: 0, between: 2.4, done: false, kills: 0, startCoins: self.save.coins };
      self.state = 'play';
      self.player.reset(self, self.world.spawn.x, self.world.spawn.y);
      self.applyWorldLook();
      Cam.snap(self.player.x, self.player.y);
      RG.Audio.playMusic('boss');
      self.fadeTarget = 0;
      self.save.stats.minigamesPlayed = self.save.stats.minigamesPlayed || {};
      self.save.stats.minigamesPlayed.arena = (self.save.stats.minigamesPlayed.arena || 0) + 1;
      self.bumpQuest('minigames', 0);
      self.toast('Blight Arena  -  survive as long as you can', 'warn', 'skull');
    }, 260);
  };

  Game.prototype.endMinigame = function (id, score) {
    score = Math.floor(score);
    var s = this.save;
    var best = s.best[id] || 0;
    var isBest = score > best;
    if (isBest) s.best[id] = score;
    s.stats.miniScore = (s.stats.miniScore || 0) + score;
    var coins = Math.round(score / 8) + (isBest ? 250 : 0);
    var gems = score > 3000 ? 2 : (score > 1200 ? 1 : 0);
    this.gainCoins(coins);
    if (gems) { s.gems += gems; s.stats.gemsEarned += gems; }
    this.minigame = null;
    this.state = 'play';
    document.body.classList.remove('minigame');
    P.clear(); FT.clear();
    RG.Audio.playMusic(this.world.def.music || 'hub');
    var lines = [
      { icon: 'star', text: 'Score ' + RG.fmt(score) + (isBest ? '  -  new best!' : '  (best ' + RG.fmt(Math.max(best, score)) + ')') },
      { icon: 'coin', text: '+' + RG.fmt(coins) + ' coins' }
    ];
    if (gems) lines.push({ icon: 'gem', text: '+' + gems + ' gems' });
    this.checkAchievements();
    UI.showReward('Cabinet cleared', lines, null);
    this.queueSave();
  };

  /* ========================================================= state flow */
  Game.prototype.startGame = function (isNew) {
    UI.closeAll();
    RG.Audio.unlock();
    this.state = 'play';
    this.runStats = { kills: 0, coins: 0 };
    this.travelTo('hub', true);
    var self = this;
    setTimeout(function () {
      if (isNew) {
        UI.info('Welcome to Aetherhold',
          'This is the last town standing. Talk to the Trader for supplies, open the Skin Vault to change how you fight, ' +
          'and take one of the four gates when you are ready.\n\nMove with WASD or the left half of a touch screen. ' +
          'Aim with the mouse or the right half. E interacts.');
      }
    }, 700);
  };

  Game.prototype.newGame = function () {
    RG.Save.wipe();
    this.save = RG.Save.fresh();
    this.worldCache = {};
    this.player = new RG.Player();
    UI.applySettings();
    UI.refreshHotbar();
    this.startGame(true);
  };

  Game.prototype.loadProfile = function (data) {
    this.save = data;
    this.worldCache = {};
    this.player.recompute(this);
    UI.applySettings();
    UI.refreshHotbar();
    RG.Save.flush(this.save);
    this.travelTo('hub', true);
  };

  Game.prototype.toTitle = function () {
    this.recordArenaScore();
    RG.Save.flush(this.save);
    this.state = 'title';
    this.minigame = null;
    document.body.classList.remove('minigame');
    this.clearEntities();
    this.arena = null;
    this.dungeonCtx = null;
    RG.Audio.playMusic('menu');
    UI.open('title');
  };

  Game.prototype.pause = function () { UI.open('pause'); };
  Game.prototype.resumeFromMenu = function () {
    if (this.state === 'title') return;
    RG.Audio.playMusic(this.minigame ? 'arcade' : (this.world.def.music || 'hub'));
  };
  Game.prototype.queueSave = function () { RG.Save.queue(this.save); };

  /* ============================================================ weather */
  Game.prototype.updateWeather = function (dt) {
    if (this.save.settings.lowFx) return;
    var b = this.world.def.biome;
    this._weatherT += dt;
    var r = V.rect();
    var n = 0;
    if (b === 'verdant') n = 26;
    else if (b === 'ember') n = 34;
    else if (b === 'frost') n = 46;
    else if (b === 'voidr') n = 30;
    else if (b === 'hub') n = 14;
    if (!n) return;
    if (Math.random() > dt * n) return;

    var x = r.x + Math.random() * r.w;
    var y = r.y + Math.random() * r.h;
    if (b === 'verdant' || b === 'hub') {
      P.spawn(x, r.y - 10, -14 - Math.random() * 18, 26 + Math.random() * 18, 5.5, 2.6,
        Math.random() < 0.5 ? '#6ab85a' : '#a8d868', 3, { drag: 1, vrot: 2, alpha: 0.7 });
    } else if (b === 'ember') {
      P.spawn(x, r.y + r.h + 8, (Math.random() - 0.5) * 26, -36 - Math.random() * 34, 3.5, 2.2,
        Math.random() < 0.5 ? '#ff9a3a' : '#ffcf6a', 0, { drag: 1, glow: 1, alpha: 0.85 });
    } else if (b === 'frost') {
      P.spawn(x, r.y - 10, -20 - Math.random() * 26, 40 + Math.random() * 24, 4.5, 2.2,
        '#eaf6ff', 0, { drag: 1, alpha: 0.75 });
    } else if (b === 'voidr') {
      P.spawn(x, y, (Math.random() - 0.5) * 12, -8 - Math.random() * 12, 4, 2.4,
        Math.random() < 0.5 ? '#c08aff' : '#ff5fa2', 0, { drag: 1, glow: 1, alpha: 0.6 });
    }
  };

  /* ============================================================= render */
  Game.prototype.render = function () {
    var ctx = V.beginFrame();
    ctx.fillStyle = this.sky || '#101426';
    ctx.fillRect(0, 0, V.w, V.h);

    if (this.state === 'minigame' && this.minigame) {
      this.minigame.draw(ctx, this);
      this.drawOverlays(ctx);
      UI.updateHUD();
      return;
    }

    var b = RG.BIOMES[this.world.def.biome] || RG.BIOMES.verdant;
    L.begin(b.ambient, b.light);

    ctx.save();
    V.applyCamera(ctx);
    this.drawTiles(ctx);
    this.drawWorldEntities(ctx);
    RG.drawEffects(ctx, this);
    RG.drawProjectiles(ctx, this);
    RG.drawPickups(ctx, this);
    P.draw(ctx);
    ctx.restore();

    if (b.light > 0.001) {
      ctx.save();
      V.applyCamera(ctx);
      L.drawGlow(ctx);
      ctx.restore();
      L.render();
      L.composite(V.ctx);
    }

    if (this.save.settings.damageNumbers) {
      ctx.save();
      V.applyCamera(ctx);
      FT.draw(ctx);
      ctx.restore();
    }

    this.drawOverlays(ctx);
    UI.updateHUD();
  };

  Game.prototype.drawTiles = function (ctx) {
    var w = this.world;
    var r = V.rect();
    var span = w.chunkSpan();
    var cx0 = Math.floor(r.x / span), cx1 = Math.floor((r.x + r.w) / span);
    var cy0 = Math.floor(r.y / span), cy1 = Math.floor((r.y + r.h) / span);
    var maxC = Math.ceil(w.px / span);
    var cx, cy;
    for (cy = cy0; cy <= cy1; cy++) {
      if (cy < 0 || cy >= maxC) continue;
      for (cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cx >= maxC) continue;
        var ch = w.chunkAt(cx, cy);
        ctx.drawImage(ch.canvas, cx * span, cy * span, span + 0.5, span + 0.5);
      }
    }

    /* liquids and glow are the only per-frame tile work left */
    var atlas = w.atlas, px = atlas.px, img = atlas.canvas, size = w.size;
    var x0 = Math.max(0, Math.floor(r.x / TS) - 1);
    var x1 = Math.min(size - 1, Math.ceil((r.x + r.w) / TS) + 1);
    var y0 = Math.max(0, Math.floor(r.y / TS) - 1);
    var y1 = Math.min(size - 1, Math.ceil((r.y + r.h) / TS) + 1);
    var t = this.save.playtime;
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var id = w.tiles[ty * size + tx];
        var props = TP[id];
        if (props.liquid) {
          var off = Math.floor((Math.sin(t * 0.9 + tx * 0.3 + ty * 0.2) * 0.5 + 0.5) * 3.99) * px;
          ctx.drawImage(img, off + 0.75, id * px + 0.75, px - 1.5, px - 1.5,
            tx * TS, ty * TS, TS + 0.75, TS + 0.75);
        }
        if (props.glow && ((tx ^ ty) & 7) === 0) {
          L.add(tx * TS + TS * 0.5, ty * TS + TS * 0.5, 96, props.glow, 0.5);
        }
      }
    }
  };

  /* Everything that overlaps is drawn back-to-front by its ground Y, which
   * is what makes a top-down scene read as having depth. */
  Game.prototype.drawWorldEntities = function (ctx) {
    var w = this.world;
    var r = V.rect();
    var list = this._renderList;
    list.length = 0;

    var props = w.queryProps(r.x - 120, r.y - 160, r.x + r.w + 120, r.y + r.h + 120, this._propScratch);
    var i;
    for (i = 0; i < props.length; i++) list.push(props[i]);
    for (i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      if (e.x < r.x - 120 || e.x > r.x + r.w + 120 || e.y < r.y - 160 || e.y > r.y + r.h + 140) continue;
      list.push(e);
    }
    for (i = 0; i < w.structures.length; i++) {
      var s = w.structures[i];
      if (s.x < r.x - 120 || s.x > r.x + r.w + 120 || s.y < r.y - 200 || s.y > r.y + r.h + 120) continue;
      if (s.kind === 'chest' || s.kind === 'shrine' || s.kind === 'dungeon' || s.kind === 'boss' ||
        s.kind === 'dungeonboss' || s.kind === 'descend') list.push(s);
    }
    if (!this.player.dead) list.push(this.player);

    list.sort(byDepth);

    var t = this.save.playtime;
    for (i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === this.player) { o.draw(ctx, this); continue; }
      if (o.def) { o.draw(ctx, this); continue; }
      if (o.kind) { this.drawStructure(ctx, o, t); continue; }
      this.drawProp(ctx, o, t);
    }
  };

  Game.prototype.drawProp = function (ctx, p, t) {
    /* resolved once and hung on the prop: looking it up by string key every
     * frame for two hundred props is pure waste */
    var spr = p._spr || (p._spr = Art.propSprite(p.name, p.seed, this.world.pal));
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.sway) {
      var s = Math.sin(t * 1.1 + p.sway) * 0.022;
      ctx.transform(1, 0, s, 1, 0, 0);
    }
    if (p.scale && p.scale !== 1) ctx.scale(p.scale, p.scale);
    Art.blit(ctx, spr, 0);
    ctx.restore();
    if (p.light) L.add(p.x, p.y - 26, 118, p.light, 0.85);
  };

  Game.prototype.drawStructure = function (ctx, s, t) {
    var pulse = 0.5 + Math.sin(t * 2.4 + s.x * 0.01) * 0.5;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.kind === 'chest') {
      var spr = s._spr || (s._spr = Art.propSprite('chest', 3, this.world.pal));
      if (s.used) ctx.globalAlpha = 0.55;
      Art.blit(ctx, spr, 0);
      if (!s.used) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.14 + pulse * 0.12;
        ctx.fillStyle = '#f5c542';
        ctx.beginPath(); ctx.ellipse(0, -10, 15, 10, 0, 0, M.TAU); ctx.fill();
      }
    } else if (s.kind === 'shrine') {
      var spr2 = s._spr || (s._spr = Art.propSprite('shrine', 7, this.world.pal));
      if (s.used) ctx.globalAlpha = 0.5;
      Art.blit(ctx, spr2, 0);
      if (!s.used) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.2 + pulse * 0.2;
        ctx.fillStyle = '#7fe0ff';
        ctx.beginPath(); ctx.arc(0, -34, 20 + pulse * 5, 0, M.TAU); ctx.fill();
      }
    } else if (s.kind === 'dungeon' || s.kind === 'descend') {
      ctx.fillStyle = 'rgba(8,10,20,0.9)';
      ctx.beginPath(); ctx.ellipse(0, 0, 26, 13, 0, 0, M.TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + pulse * 0.3;
      ctx.fillStyle = s.locked && this.save.keys <= 0 ? '#ff5fa2' : '#8ceaff';
      ctx.beginPath(); ctx.ellipse(0, -2, 20 - pulse * 3, 9, 0, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      for (var i = 0; i < 4; i++) {
        var a = t * 0.8 + i * M.TAU / 4;
        ctx.fillStyle = 'rgba(140,234,255,0.75)';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 24, -6 + Math.sin(a) * 10, 2.2, 0, M.TAU);
        ctx.fill();
      }
    } else if (s.kind === 'boss' || s.kind === 'dungeonboss') {
      if (s.used === true) { ctx.restore(); return; }
      var spr3 = s._spr || (s._spr = Art.propSprite('statue', 9, this.world.pal));
      Art.blit(ctx, spr3, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 + pulse * 0.25;
      ctx.fillStyle = '#ff5fa2';
      ctx.beginPath(); ctx.arc(0, -32, 26 + pulse * 6, 0, M.TAU); ctx.fill();
    }
    ctx.restore();

    /* a floating marker so objectives read from across a field */
    if ((s.kind === 'chest' || s.kind === 'shrine') && s.used) return;
    if (s.kind === 'boss' && s.used === true) return;
    var iconName = s.kind === 'chest' ? 'coin' : (s.kind === 'shrine' ? 'star'
      : (s.kind === 'dungeon' || s.kind === 'descend' ? 'key' : 'skull'));
    var img = Art.icon(iconName, 24);
    ctx.save();
    ctx.globalAlpha = 0.55 + pulse * 0.35;
    ctx.drawImage(img, s.x - 8, s.y - 58 - pulse * 4, 16, 16);
    ctx.restore();
  };

  Game.prototype.drawOverlays = function (ctx) {
    var b = RG.BIOMES[this.world.def.biome] || RG.BIOMES.verdant;
    V.vignette(V.ctx, this.world.def.kind === 'dungeon' ? 0.62 : 0.32, 'rgba(4,6,14,1)');
    if (this.hitFlash > 0.002) V.flash(V.ctx, 'rgba(255,60,80,1)', this.hitFlash * 0.4);
    if (this.player && this.player.hp / this.player.maxHp < 0.28 && this.state === 'play') {
      var pulse = 0.12 + Math.sin(RG.now() / 260) * 0.06;
      V.flash(V.ctx, 'rgba(220,40,60,1)', Math.max(0, pulse) * 0.8);
    }
    if (this.fade > 0.002) V.flash(V.ctx, 'rgba(4,6,14,1)', this.fade);
  };
})(RG);
