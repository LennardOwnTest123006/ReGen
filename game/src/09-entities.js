/* ReGen - entities and combat. The player, the bestiary AI, projectiles,
 * pickups and boss patterns. Everything that moves lives here.
 *
 * Design notes: all lists are pre-allocated pools, all damage flows through
 * one function so effects (crit, armour, shields, lifesteal) can never
 * disagree, and every enemy runs a tiny state machine rather than ad-hoc
 * flags - which is what keeps forty of them on screen predictable. */
'use strict';
(function (RG) {
  var M = RG.M, Data = RG.Data, Art = RG.Art, P = RG.Particles, FT = RG.FloatText;
  var TP = RG.TILEPROPS;

  /* ------------------------------------------------------------ weapons */
  var WEAPONS = RG.WEAPONS = {
    blade: { melee: true, cd: 0.34, arc: 1.0, range: 42, dmg: 1.0, knock: 90, ability: 'spin' },
    dagger: { melee: true, cd: 0.20, arc: 0.7, range: 34, dmg: 0.66, knock: 55, ability: 'blink' },
    greatsword: { melee: true, cd: 0.62, arc: 1.35, range: 54, dmg: 2.05, knock: 165, ability: 'slam' },
    scythe: { melee: true, cd: 0.48, arc: 1.9, range: 50, dmg: 1.5, knock: 110, ability: 'reap' },
    hammer: { melee: true, cd: 0.66, arc: 1.1, range: 46, dmg: 2.0, knock: 210, ability: 'quake' },
    staff: { melee: false, cd: 0.42, dmg: 1.15, speed: 300, pr: 5, color: '#8ad6ff', ability: 'trishot' },
    orb: { melee: false, cd: 0.30, dmg: 0.85, speed: 260, pr: 6, color: '#c08aff', ability: 'orbit', homing: 1.6 },
    bow: { melee: false, cd: 0.38, dmg: 1.35, speed: 400, pr: 4, color: '#ffe08a', ability: 'volley', pierce: 1 }
  };

  var ABILITY_INFO = RG.ABILITY_INFO = {
    spin: { name: 'Whirl', cd: 6, desc: 'A full-circle slash that knocks everything back.' },
    blink: { name: 'Blink Strike', cd: 5, desc: 'Teleport through enemies, cutting each one you pass.' },
    slam: { name: 'Earthbreaker', cd: 8, desc: 'Slam the ground for a heavy shockwave.' },
    reap: { name: 'Reap', cd: 7, desc: 'Drag nearby enemies in and harvest them.' },
    quake: { name: 'Quake', cd: 8, desc: 'A stunning ring that ripples outward.' },
    trishot: { name: 'Trident Bolt', cd: 5, desc: 'Three piercing bolts in a spread.' },
    orbit: { name: 'Orbit', cd: 9, desc: 'Four orbs circle you and shred what they touch.' },
    volley: { name: 'Volley', cd: 6, desc: 'Loose eight arrows in a fan.' }
  };

  /* -------------------------------------------------------------- pools */
  function makePools(g) {
    g.enemies = [];
    g.projectiles = [];
    g.pickups = [];
    g.effects = [];
    var i;
    for (i = 0; i < 220; i++) g.projectiles.push({ alive: false });
    for (i = 0; i < 400; i++) g.pickups.push({ alive: false });
    for (i = 0; i < 64; i++) g.effects.push({ alive: false });
  }
  RG.makePools = makePools;

  /* -------------------------------------------------------------- player */
  function Player() {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.r = 8;
    this.facing = 1;
    this.aim = 0;
    this.hp = 100; this.maxHp = 100;
    this.shield = 0;
    this.dashT = 0; this.dashCd = 0; this.dashDir = 0;
    this.atkCd = 0; this.atkAnim = 0;
    this.abilityCd = 0; this.abilityT = 0;
    this.iframes = 0;
    this.flash = 0;
    this.t = 0;
    this.walk = 0;
    this.dead = false;
    this.orbs = 0; this.orbT = 0;
    this.combo = 0; this.comboT = 0;
    this.lastDamageT = 0;
    this.stepT = 0;
    this.noDamageRun = true;
  }
  RG.Player = Player;

  /* All derived stats in one place so the HUD, the shop and combat can
   * never drift apart. */
  Player.prototype.recompute = function (g) {
    var s = g.save;
    var skin = Data.skinById(s.skin);
    var perk = skin.perk || {};
    var up = s.upgrades || {};
    var lv = s.level;

    var hp = 100 + (lv - 1) * 8 + (up.hp || 0) + (perk.hp || 0);
    var dmg = (10 + (lv - 1) * 1.35) * (1 + (up.dmg || 0) + (perk.dmg || 0));
    var spd = 118 * (1 + (up.spd || 0) + (perk.spd || 0));
    var crit = 0.05 + (up.crit || 0) + (perk.crit || 0);
    var luck = (up.luck || 0) + (perk.luck || 0);
    var armor = (perk.armor || 0);
    var regen = (perk.regen || 0);
    var coinB = (perk.coin || 0);
    var xpB = (perk.xp || 0);
    var dashCdMul = 1 - (perk.dashCd || 0);

    this.stats = {
      maxHp: Math.round(hp), dmg: dmg, speed: spd, crit: M.clamp(crit, 0, 0.75),
      luck: luck, armor: armor, regen: regen, coinBonus: coinB, xpBonus: xpB,
      dashCd: 1.05 * dashCdMul
    };
    this.weapon = skin.weapon || 'blade';
    this.wdef = WEAPONS[this.weapon] || WEAPONS.blade;
    this.ability = this.wdef.ability;
    this.abilityDef = ABILITY_INFO[this.ability];
    this.skin = skin;
    this.maxHp = this.stats.maxHp;
    if (this.hp > this.maxHp || this.hp <= 0) this.hp = this.maxHp;
  };

  Player.prototype.reset = function (g, x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.recompute(g);
    this.hp = this.maxHp;
    this.dead = false;
    this.iframes = 0; this.dashT = 0; this.dashCd = 0;
    this.atkCd = 0; this.abilityCd = 0; this.orbs = 0;
    this.shield = 0;
    this.combo = 0;
  };

  Player.prototype.update = function (dt, g) {
    var In = RG.Input;
    this.t += dt;
    if (this.dead) return;

    var st = this.stats;

    /* ---- aim ---- */
    if (In.aiming) {
      this.aim = In.aimAngle;
    } else if (In.device === 'kbm' && In.pointerInside) {
      var wx = RG.Cam.screenToWorldX(In.pointerX), wy = RG.Cam.screenToWorldY(In.pointerY);
      this.aim = Math.atan2(wy - this.y, wx - this.x);
    } else if (In.moveLen > 0.1) {
      this.aim = Math.atan2(In.moveY, In.moveX);
    }
    /* on touch, snap to the nearest enemy when the player is not aiming */
    if (!In.aiming && In.device === 'touch') {
      var near = nearestEnemy(g, this.x, this.y, 210);
      if (near) this.aim = Math.atan2(near.y - this.y, near.x - this.x);
    }
    if (Math.abs(Math.cos(this.aim)) > 0.12) this.facing = Math.cos(this.aim) > 0 ? 1 : -1;

    /* ---- movement ---- */
    var tile = g.world.tileAtWorld(this.x, this.y);
    var tprops = TP[tile];
    var speedMul = tprops.speed || 1;
    var accel = tprops.slippery ? 3.4 : 15;

    var targetVx = In.moveX * st.speed * speedMul;
    var targetVy = In.moveY * st.speed * speedMul;

    if (this.dashT > 0) {
      this.dashT -= dt;
      var dashSpeed = 420 * (1 - M.easeInCubic(1 - this.dashT / 0.19) * 0.35);
      this.vx = Math.cos(this.dashDir) * dashSpeed;
      this.vy = Math.sin(this.dashDir) * dashSpeed;
      this.iframes = Math.max(this.iframes, 0.06);
      if (Math.random() < dt * 90) {
        P.spawn(this.x, this.y - 12, -this.vx * 0.08, -this.vy * 0.08, 0.32, 4,
          this.skin.colors.accent || '#8ad6ff', 0, { drag: 0.86, glow: 1 });
      }
    } else {
      this.vx = M.damp(this.vx, targetVx, accel, dt);
      this.vy = M.damp(this.vy, targetVy, accel, dt);
    }

    if (this.dashCd > 0) this.dashCd -= dt;
    if (In.justPressed('dash') && this.dashCd <= 0 && this.dashT <= 0) {
      var dd = (In.moveLen > 0.1) ? Math.atan2(In.moveY, In.moveX) : this.aim;
      this.dashDir = dd;
      this.dashT = 0.19;
      this.dashCd = st.dashCd;
      RG.Audio.play('dash');
      P.burst(this.x, this.y - 12, 12, this.skin.colors.accent || '#8ad6ff',
        { speed: 130, dir: dd + Math.PI, spread: 1.4, life: 0.36, size: 3.4, glow: 1, drag: 0.85 });
      P.ring(this.x, this.y - 10, 26, RG.Color.hexToRgba(this.skin.colors.accent || '#8ad6ff', 0.7), 0.3, 2.5);
    }

    g.world.collide(this, this.vx * dt, this.vy * dt, false);

    var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.walk = M.clamp01(sp / (st.speed * 0.85));
    if (this.walk > 0.2 && this.dashT <= 0) {
      this.stepT -= dt * this.walk;
      if (this.stepT <= 0) {
        this.stepT = 0.34;
        RG.Audio.play(tprops.liquid ? 'splash' : 'step');
        if (tprops.liquid) {
          P.burst(this.x, this.y, 4, '#a8d8f0', { speed: 40, life: 0.3, size: 2, grav: 90 });
        }
      }
    }

    /* ---- hazard tiles ---- */
    if (tprops.damage && this.iframes <= 0 && this.dashT <= 0) {
      this.hurt(g, tprops.damage * dt * 4, null, true);
    }

    /* ---- attack ---- */
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.atkAnim > 0) this.atkAnim -= dt * 4.4;
    if (In.isDown('attack') && this.atkCd <= 0 && this.dashT <= 0) this.doAttack(g);

    /* ---- ability ---- */
    if (this.abilityCd > 0) this.abilityCd -= dt;
    if (In.justPressed('ability') && this.abilityCd <= 0) this.doAbility(g);

    /* ---- orbit orbs ---- */
    if (this.orbs > 0) {
      this.orbT -= dt;
      if (this.orbT <= 0) this.orbs = 0;
      else {
        var oa = this.t * 3.4;
        for (var o = 0; o < this.orbs; o++) {
          var a = oa + o / this.orbs * M.TAU;
          var ox = this.x + Math.cos(a) * 44, oy = this.y - 12 + Math.sin(a) * 44;
          if (Math.random() < dt * 30) {
            P.spawn(ox, oy, 0, 0, 0.3, 3.4, this.skin.colors.accent || '#c08aff', 0, { glow: 1, drag: 0.9 });
          }
          hitArea(g, ox, oy, 14, this.stats.dmg * 0.5 * dt * 6, 30, a, false, 'orb');
        }
      }
    }

    /* ---- passive regen and timers ---- */
    if (st.regen > 0 && this.hp < this.maxHp) this.heal(st.regen * dt, false);
    if (this.iframes > 0) this.iframes -= dt;
    if (this.flash > 0) this.flash -= dt * 5;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    /* ---- light ---- */
    var lightR = g.world.def.biome === 'dungeon' ? 190 : 150;
    RG.Lights.add(this.x, this.y - 12, lightR, this.skin.colors.glow || '#ffe0b0', 0.95);
    if (this.skin.aura) RG.Lights.add(this.x, this.y - 12, 60, this.skin.aura, 0.6);

    /* ---- trail ---- */
    if (this.skin.trail && sp > 40 && Math.random() < dt * 26) {
      P.spawn(this.x + (Math.random() - 0.5) * 6, this.y - 4, 0, -8, 0.5, 3,
        this.skin.trail, 0, { drag: 0.92, glow: 1, alpha: 0.8 });
    }
  };

  Player.prototype.doAttack = function (g) {
    var w = this.wdef;
    this.atkCd = w.cd;
    this.atkAnim = 1;
    var dmg = this.stats.dmg * w.dmg * (1 + Math.min(this.combo, 8) * 0.02);

    if (w.melee) {
      RG.Audio.play('swing');
      var hx = this.x + Math.cos(this.aim) * w.range * 0.5;
      var hy = this.y - 12 + Math.sin(this.aim) * w.range * 0.5;
      var n = hitCone(g, this.x, this.y - 12, w.range, this.aim, w.arc, dmg, w.knock);
      /* swing arc effect */
      for (var i = 0; i < 9; i++) {
        var t = i / 8;
        var a = this.aim - w.arc + t * w.arc * 2;
        P.spawn(this.x + Math.cos(a) * w.range * 0.82, this.y - 12 + Math.sin(a) * w.range * 0.82,
          Math.cos(a) * 20, Math.sin(a) * 20, 0.16 + t * 0.05, 3.6,
          this.skin.colors.metal || '#e8f0ff', 0, { drag: 0.8, glow: 1, alpha: 0.75 });
      }
      if (n > 0) {
        RG.Cam.addShake(1.4 + Math.min(n, 4) * 0.5);
        this.combo++; this.comboT = 2.4;
      }
    } else {
      RG.Audio.play('shoot');
      fireProjectile(g, this.x, this.y - 12, this.aim, w.speed, dmg, w.pr, w.color, true, {
        pierce: w.pierce || 0, homing: w.homing || 0, trail: w.color
      });
      this.vx -= Math.cos(this.aim) * 26;
      this.vy -= Math.sin(this.aim) * 26;
    }
  };

  Player.prototype.doAbility = function (g) {
    var info = ABILITY_INFO[this.ability];
    this.abilityCd = info.cd;
    var d = this.stats.dmg;
    var acc = this.skin.colors.accent || '#8ad6ff';
    RG.Audio.play('charge');

    switch (this.ability) {
      case 'spin':
        hitCone(g, this.x, this.y - 12, 76, 0, Math.PI, d * 2.2, 190);
        P.ring(this.x, this.y - 12, 82, RG.Color.hexToRgba(acc, 0.85), 0.4, 4);
        P.burst(this.x, this.y - 12, 34, acc, { speed: 230, life: 0.5, size: 4, glow: 1, kind: 1 });
        RG.Cam.addShake(6);
        break;
      case 'blink': {
        var bd = 150;
        var nx = this.x + Math.cos(this.aim) * bd, ny = this.y + Math.sin(this.aim) * bd;
        /* damage everything on the line, then land clear of walls */
        for (var s = 0; s <= 12; s++) {
          var t = s / 12;
          var px = M.lerp(this.x, nx, t), py = M.lerp(this.y, ny, t) - 12;
          hitArea(g, px, py, 26, d * 1.5 / 3, 110, this.aim, s === 0, 'blink');
          P.spawn(px, py, 0, 0, 0.4, 5, acc, 0, { glow: 1, drag: 0.9 });
        }
        var steps = 12, fx = this.x, fy = this.y;
        for (var q = 1; q <= steps; q++) {
          var tx = this.x + Math.cos(this.aim) * bd * (q / steps);
          var ty = this.y + Math.sin(this.aim) * bd * (q / steps);
          if (g.world.solidAtWorld(tx, ty)) break;
          fx = tx; fy = ty;
        }
        this.x = fx; this.y = fy;
        this.iframes = Math.max(this.iframes, 0.3);
        RG.Cam.addShake(3);
        break;
      }
      case 'slam':
        spawnShock(g, this.x, this.y, 170, d * 2.8, 260, acc, 0.55);
        RG.Cam.addShake(11);
        RG.Audio.play('explode');
        break;
      case 'reap': {
        var list = g.enemies;
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (!e.alive || e.def.boss) continue;
          var dd = M.dist(e.x, e.y, this.x, this.y);
          if (dd < 190) {
            var a = Math.atan2(this.y - e.y, this.x - e.x);
            e.vx += Math.cos(a) * 340; e.vy += Math.sin(a) * 340;
          }
        }
        hitArea(g, this.x, this.y - 12, 110, d * 2.4, 0, 0, true, 'reap');
        P.ring(this.x, this.y - 12, 190, RG.Color.hexToRgba(acc, 0.7), 0.55, 5);
        RG.Cam.addShake(7);
        break;
      }
      case 'quake':
        spawnShock(g, this.x, this.y, 210, d * 2.0, 200, acc, 0.75, true);
        RG.Cam.addShake(13);
        RG.Audio.play('explode');
        break;
      case 'trishot':
        for (var k = -1; k <= 1; k++) {
          fireProjectile(g, this.x, this.y - 12, this.aim + k * 0.22, 360, d * 1.5, 7, acc, true,
            { pierce: 3, trail: acc, big: true });
        }
        break;
      case 'orbit':
        this.orbs = 4; this.orbT = 7;
        P.ring(this.x, this.y - 12, 50, RG.Color.hexToRgba(acc, 0.8), 0.4, 3);
        break;
      case 'volley':
        for (var v = 0; v < 8; v++) {
          fireProjectile(g, this.x, this.y - 12, this.aim + (v - 3.5) * 0.13, 420, d * 0.85, 4, acc, true,
            { pierce: 2, trail: acc });
        }
        break;
    }
  };

  Player.prototype.heal = function (amount, showText) {
    var before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (showText !== false && this.hp - before >= 1) {
      FT.add(this.x, this.y - 34, '+' + Math.round(this.hp - before), '#4ad88a', 11);
    }
  };

  Player.prototype.hurt = function (g, amount, from, silent) {
    if (this.dead || this.iframes > 0) return;
    var st = this.stats;
    var reduced = amount * (100 / (100 + st.armor * 7));
    if (this.shield > 0) {
      var absorbed = Math.min(this.shield, reduced);
      this.shield -= absorbed;
      reduced -= absorbed;
      P.ring(this.x, this.y - 12, 30, 'rgba(140,220,255,0.8)', 0.3, 3);
    }
    if (reduced <= 0) return;
    this.hp -= reduced;
    this.combo = 0;
    this.noDamageRun = false;
    this.flash = 1;
    if (!silent) {
      this.iframes = 0.55;
      RG.Audio.play('hurt');
      RG.Cam.addShake(4 + Math.min(8, reduced * 0.12));
      g.hitFlash = Math.min(0.5, 0.18 + reduced / this.maxHp);
      FT.add(this.x, this.y - 34, '-' + Math.round(reduced), '#ff6b7a', 12);
      P.burst(this.x, this.y - 12, 10, '#e8455c', { speed: 110, life: 0.4, size: 3, kind: 1, glow: 1 });
      if (from) {
        var a = Math.atan2(this.y - from.y, this.x - from.x);
        this.vx += Math.cos(a) * 130; this.vy += Math.sin(a) * 130;
      }
    }
    if (this.hp <= 0) { this.hp = 0; this.die(g); }
  };

  Player.prototype.die = function (g) {
    this.dead = true;
    RG.Audio.play('fail');
    RG.Cam.addShake(18);
    P.burst(this.x, this.y - 12, 40, '#e8455c', { speed: 200, life: 0.9, size: 4, glow: 1 });
    g.onPlayerDeath();
  };

  Player.prototype.draw = function (ctx, g) {
    var alpha = 1;
    if (this.iframes > 0 && !this.dead) alpha = 0.45 + 0.55 * Math.abs(Math.sin(this.iframes * 34));
    RG.Draw.shadow(ctx, this.x, this.y + 1, 8, 3.4, 0.3 * alpha);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    if (this.skin.aura) {
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(this.t * 2.6) * 0.05;
      ctx.fillStyle = this.skin.aura;
      ctx.beginPath(); ctx.ellipse(0, -12, 24, 26, 0, 0, M.TAU); ctx.fill();
      ctx.restore();
    }
    Art.drawCharacter(ctx, this.skin, {
      t: this.t, walk: this.walk, facing: this.facing, aim: this.aim,
      attack: Math.max(0, this.atkAnim), flash: Math.max(0, this.flash), scale: 1
    });
    ctx.restore();

    if (this.orbs > 0) {
      var oa = this.t * 3.4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var o = 0; o < this.orbs; o++) {
        var a = oa + o / this.orbs * M.TAU;
        ctx.fillStyle = this.skin.colors.accent || '#c08aff';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(a) * 44, this.y - 12 + Math.sin(a) * 44, 5.5, 0, M.TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    if (this.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28 + Math.sin(this.t * 5) * 0.08;
      ctx.strokeStyle = '#8cd8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y - 12, 20, 0, M.TAU); ctx.stroke();
      ctx.restore();
    }
  };

  /* -------------------------------------------------------------- enemy */
  function Enemy() { this.alive = false; }
  RG.Enemy = Enemy;

  RG.spawnEnemy = function (g, id, x, y, levelScale, elite) {
    var def = Data.ENEMIES[id];
    if (!def) return null;
    var e = null;
    for (var i = 0; i < g.enemies.length; i++) if (!g.enemies[i].alive) { e = g.enemies[i]; break; }
    if (!e) {
      if (g.enemies.length > 190) return null;
      e = new Enemy();
      g.enemies.push(e);
    }
    var s = levelScale || 1;
    var em = elite ? 2.4 : 1;
    e.alive = true;
    e.def = def;
    e.id = id;
    e.x = x; e.y = y; e.vx = 0; e.vy = 0;
    e.r = def.r * (def.scale || 1);
    e.maxHp = Math.round(def.hp * s * em);
    e.hp = e.maxHp;
    e.dmg = def.dmg * Math.sqrt(s) * (elite ? 1.35 : 1);
    e.speed = def.speed;
    e.state = 'idle';
    e.stateT = 0;
    e.cd = def.cd * (0.6 + Math.random() * 0.8);
    e.t = Math.random() * 10;
    e.flash = 0;
    e.facing = 1;
    e.elite = !!elite;
    e.scale = (def.scale || 1) * (elite ? 1.25 : 1);
    e.phase = 0;
    e.patternT = 0;
    e.pattern = 0;
    e.hitCd = 0;
    e.stun = 0;
    e.sprite = Art.creatureSprite(def.kind, def.pal, 8, e.scale);
    e.aggro = false;
    e.spawnT = 0.35;
    e.contact = def.ai === 'chase' || def.ai === 'charge' || def.boss;
    P.burst(x, y - 10, 10, def.pal.accent, { speed: 70, life: 0.4, size: 3, glow: 1 });
    return e;
  };

  function nearestEnemy(g, x, y, maxR) {
    var best = null, bd = maxR * maxR;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (!e.alive || e.spawnT > 0) continue;
      var d = M.dist2(e.x, e.y, x, y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  RG.nearestEnemy = nearestEnemy;

  Enemy.prototype.update = function (dt, g) {
    if (!this.alive) return;
    var p = g.player;
    this.t += dt;
    if (this.spawnT > 0) { this.spawnT -= dt; return; }
    if (this.flash > 0) this.flash -= dt * 6;
    if (this.hitCd > 0) this.hitCd -= dt;
    if (this.stun > 0) { this.stun -= dt; this.applyMotion(dt, g); return; }

    var d = M.dist(this.x, this.y, p.x, p.y);
    var toP = Math.atan2(p.y - this.y, p.x - this.x);
    if (!this.aggro && d < 320) this.aggro = true;
    /* despawn far-away trash so the sim stays cheap on long walks */
    if (d > 1400 && !this.def.boss) { this.alive = false; return; }
    if (Math.abs(Math.cos(toP)) > 0.15) this.facing = Math.cos(toP) > 0 ? 1 : -1;

    if (this.def.boss) this.updateBoss(dt, g, d, toP);
    else {
      switch (this.def.ai) {
        case 'charge': this.aiCharge(dt, g, d, toP); break;
        case 'shoot': this.aiShoot(dt, g, d, toP); break;
        case 'orbit': this.aiOrbit(dt, g, d, toP); break;
        default: this.aiChase(dt, g, d, toP);
      }
    }

    this.applyMotion(dt, g);

    /* contact damage */
    if (this.contact && d < this.r + p.r + 3 && this.hitCd <= 0 && !p.dead) {
      p.hurt(g, this.dmg, this);
      this.hitCd = 0.7;
    }
    if (this.def.pal.accent && (this.def.kind === 'wisp' || this.def.kind === 'flame' || this.def.boss)) {
      RG.Lights.add(this.x, this.y - 14, this.def.boss ? 190 : 90, this.def.pal.accent, 0.75);
    }
  };

  Enemy.prototype.applyMotion = function (dt, g) {
    this.vx *= Math.pow(0.86, dt * 60);
    this.vy *= Math.pow(0.86, dt * 60);
    g.world.collide(this, this.vx * dt, this.vy * dt, this.def.kind === 'bat' || this.def.kind === 'wisp' || this.def.kind === 'shade');
  };

  Enemy.prototype.aiChase = function (dt, g, d, toP) {
    if (!this.aggro) { this.wander(dt); return; }
    var s = this.speed;
    this.vx += Math.cos(toP) * s * 8 * dt;
    this.vy += Math.sin(toP) * s * 8 * dt;
    var max = s;
    var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (sp > max) { this.vx = this.vx / sp * max; this.vy = this.vy / sp * max; }
  };

  Enemy.prototype.wander = function (dt) {
    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.stateT = 1.2 + Math.random() * 2;
      this.wanderDir = Math.random() * M.TAU;
      this.wanderGo = Math.random() < 0.6;
    }
    if (this.wanderGo) {
      this.vx += Math.cos(this.wanderDir) * this.speed * 2.2 * dt;
      this.vy += Math.sin(this.wanderDir) * this.speed * 2.2 * dt;
    }
  };

  Enemy.prototype.aiCharge = function (dt, g, d, toP) {
    if (!this.aggro) { this.wander(dt); return; }
    this.stateT -= dt;
    if (this.state === 'idle') {
      if (d < 240 && this.cd <= 0) { this.state = 'wind'; this.stateT = this.def.tell; }
      else {
        this.cd -= dt;
        var s = this.speed * 0.55;
        this.vx += Math.cos(toP) * s * 6 * dt;
        this.vy += Math.sin(toP) * s * 6 * dt;
      }
    } else if (this.state === 'wind') {
      this.chargeDir = toP;
      this.vx *= 0.86; this.vy *= 0.86;
      if (this.stateT <= 0) {
        this.state = 'dash'; this.stateT = 0.42;
        this.vx = Math.cos(this.chargeDir) * this.speed * 3.4;
        this.vy = Math.sin(this.chargeDir) * this.speed * 3.4;
        P.burst(this.x, this.y - 10, 8, this.def.pal.accent, { speed: 90, dir: this.chargeDir + Math.PI, spread: 1, life: 0.3, size: 3 });
      }
    } else {
      if (this.stateT <= 0) { this.state = 'idle'; this.cd = this.def.cd; }
    }
  };

  Enemy.prototype.aiShoot = function (dt, g, d, toP) {
    var range = this.def.range;
    if (this.speed > 0) {
      if (d < range * 0.55) {
        this.vx -= Math.cos(toP) * this.speed * 5 * dt;
        this.vy -= Math.sin(toP) * this.speed * 5 * dt;
      } else if (d > range * 0.9) {
        this.vx += Math.cos(toP) * this.speed * 5 * dt;
        this.vy += Math.sin(toP) * this.speed * 5 * dt;
      } else {
        var strafe = toP + Math.PI / 2 * (this.t % 6 > 3 ? 1 : -1);
        this.vx += Math.cos(strafe) * this.speed * 3 * dt;
        this.vy += Math.sin(strafe) * this.speed * 3 * dt;
      }
    }
    this.cd -= dt;
    if (this.cd <= 0 && d < range && this.aggro) {
      this.cd = this.def.cd;
      var pr = this.def.proj;
      fireProjectile(g, this.x, this.y - 12, toP, pr.speed, this.dmg, pr.r, pr.color, false,
        { life: pr.life, trail: pr.trail });
      RG.Audio.play('shoot');
    }
  };

  Enemy.prototype.aiOrbit = function (dt, g, d, toP) {
    if (!this.aggro) { this.wander(dt); return; }
    var want = this.def.range;
    var radial = (d - want) * 2.4;
    var tang = (this.t % 8 > 4 ? 1 : -1);
    this.vx += (Math.cos(toP) * radial + Math.cos(toP + Math.PI / 2) * this.speed * tang) * 3 * dt;
    this.vy += (Math.sin(toP) * radial + Math.sin(toP + Math.PI / 2) * this.speed * tang) * 3 * dt;
    this.cd -= dt;
    if (this.cd <= 0 && d < want * 1.6) {
      this.cd = this.def.cd * 1.4;
      this.state = 'dive';
      this.vx = Math.cos(toP) * this.speed * 2.6;
      this.vy = Math.sin(toP) * this.speed * 2.6;
      this.contact = true;
    }
  };

  /* --------------------------------------------------------- boss logic */
  Enemy.prototype.updateBoss = function (dt, g, d, toP) {
    var hpPct = this.hp / this.maxHp;
    var newPhase = hpPct > 0.66 ? 0 : (hpPct > 0.33 ? 1 : 2);
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.patternT = 1.2;
      this.pattern = -1;
      RG.Audio.play('boss');
      RG.Cam.addShake(12);
      P.ring(this.x, this.y - 20, 200, RG.Color.hexToRgba(this.def.pal.accent, 0.9), 0.7, 6);
      g.toast('The ' + this.def.name + ' changes shape', 'warn');
    }

    this.patternT -= dt;
    if (this.patternT <= 0) {
      this.pattern = (this.pattern + 1) % 4;
      this.patternT = 2.4 - this.phase * 0.35;
      this.stateT = 0;
    }
    this.stateT += dt;

    var speed = this.def.speed * (1 + this.phase * 0.18);
    var acc = this.def.pal.accent;

    switch (this.pattern) {
      case 0: /* stalk */
        this.vx += Math.cos(toP) * speed * 4 * dt;
        this.vy += Math.sin(toP) * speed * 4 * dt;
        break;
      case 1: /* radial burst */
        this.vx *= 0.9; this.vy *= 0.9;
        if (this.stateT > 0.6 && !this.fired1) {
          this.fired1 = true;
          var n = 10 + this.phase * 4;
          for (var i = 0; i < n; i++) {
            fireProjectile(g, this.x, this.y - 18, i / n * M.TAU + this.t, 150 + this.phase * 25,
              this.dmg * 0.7, 7, acc, false, { life: 3.2, trail: acc });
          }
          RG.Audio.play('explode');
          RG.Cam.addShake(5);
        }
        if (this.stateT < 0.6) this.fired1 = false;
        break;
      case 2: /* charge */
        if (this.stateT < 0.55) {
          this.vx *= 0.85; this.vy *= 0.85;
          this.chargeDir = toP;
          if (Math.random() < dt * 40) P.spawn(this.x, this.y - 16, 0, 0, 0.3, 4, acc, 0, { glow: 1 });
        } else if (this.stateT < 1.3) {
          this.vx = Math.cos(this.chargeDir) * speed * 5.5;
          this.vy = Math.sin(this.chargeDir) * speed * 5.5;
        } else { this.vx *= 0.86; this.vy *= 0.86; }
        break;
      case 3: /* summon adds + aimed volley */
        this.vx *= 0.92; this.vy *= 0.92;
        if (this.stateT > 0.5 && !this.fired2) {
          this.fired2 = true;
          for (var k = -2; k <= 2; k++) {
            fireProjectile(g, this.x, this.y - 18, toP + k * 0.2, 210, this.dmg * 0.8, 6, acc, false,
              { life: 3, trail: acc });
          }
          var adds = g.world.def.kind === 'dungeon' ? ['bat_cave', 'skeleton_dark'] : (g.world.def.enemies || ['slime_green']);
          var count = 1 + this.phase;
          for (var s = 0; s < count; s++) {
            var a = Math.random() * M.TAU;
            RG.spawnEnemy(g, adds[(Math.random() * adds.length) | 0],
              this.x + Math.cos(a) * 90, this.y + Math.sin(a) * 90, g.levelScale);
          }
        }
        if (this.stateT < 0.5) this.fired2 = false;
        break;
    }
    var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    var max = speed * (this.pattern === 2 && this.stateT > 0.55 ? 6 : 1.2);
    if (sp > max) { this.vx = this.vx / sp * max; this.vy = this.vy / sp * max; }
  };

  Enemy.prototype.hurt = function (g, amount, knock, dir, crit) {
    if (!this.alive) return;
    this.hp -= amount;
    this.flash = 1;
    this.aggro = true;
    if (knock && !this.def.boss) {
      var k = knock * (this.def.knock === undefined ? 1 : this.def.knock);
      this.vx += Math.cos(dir) * k;
      this.vy += Math.sin(dir) * k;
    }
    FT.add(this.x, this.y - this.r * 2.2 - 8, Math.round(amount) + (crit ? '!' : ''),
      crit ? '#ffd76a' : '#ffffff', crit ? 14 : 11, crit);
    P.burst(this.x, this.y - this.r, crit ? 12 : 6, crit ? '#ffd76a' : this.def.pal.accent,
      { speed: crit ? 160 : 100, life: 0.35, size: crit ? 3.6 : 2.6, kind: 1, glow: 1, dir: dir, spread: 1.6 });
    RG.Audio.play(crit ? 'crit' : 'hit', M.clamp01(amount / 60));
    if (this.hp <= 0) this.die(g);
  };

  Enemy.prototype.die = function (g) {
    this.alive = false;
    var def = this.def;
    var pal = def.pal;
    RG.Audio.play(def.boss ? 'explode' : 'hit', 1);
    P.burst(this.x, this.y - this.r, def.boss ? 60 : 16, pal.main,
      { speed: def.boss ? 260 : 130, life: def.boss ? 1 : 0.55, size: def.boss ? 5 : 3.4, glow: 1, kind: 3, vrot: 6, grav: 60 });
    P.ring(this.x, this.y - this.r, def.boss ? 180 : 40, RG.Color.hexToRgba(pal.accent, 0.8), def.boss ? 0.8 : 0.35, def.boss ? 6 : 2.5);
    if (def.boss) { RG.Cam.addShake(20); g.hitFlash = 0.45; }
    else RG.Cam.addShake(2);

    var lucky = 1 + g.player.stats.luck * 0.012;
    var coins = Math.round(def.coins * g.dropScale * lucky * (this.elite ? 2.2 : 1) * (1 + g.player.stats.coinBonus));
    if (g.luckBoostT > 0) coins *= 2;
    spawnPickups(g, this.x, this.y - this.r, 'coin', Math.min(24, Math.max(1, Math.round(coins / 6))), coins);
    var xp = Math.round(def.xp * g.dropScale * (this.elite ? 2 : 1) * (1 + g.player.stats.xpBonus));
    spawnPickups(g, this.x, this.y - this.r, 'xp', Math.min(12, Math.max(1, Math.round(xp / 8))), xp);
    if (def.gem > 0) spawnPickups(g, this.x, this.y - this.r, 'gem', def.gem, def.gem);
    else if (Math.random() < 0.012 * lucky) spawnPickups(g, this.x, this.y - this.r, 'gem', 1, 1);
    if (Math.random() < 0.06 + g.player.stats.luck * 0.002) spawnPickups(g, this.x, this.y - this.r, 'heart', 1, 22);

    g.onEnemyKilled(this);
  };

  Enemy.prototype.draw = function (ctx, g) {
    var sp = this.sprite;
    var fi = Math.floor(this.t * 9) % sp.frames.length;
    if (fi < 0) fi += sp.frames.length;
    RG.Draw.shadow(ctx, this.x, this.y + 1, this.r * 0.95, this.r * 0.42, 0.3);

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.spawnT > 0) {
      var t = 1 - this.spawnT / 0.35;
      ctx.globalAlpha = t;
      ctx.scale(0.5 + t * 0.5, 0.5 + t * 0.5);
    }
    if (this.facing < 0) ctx.scale(-1, 1);
    if (this.state === 'wind' && this.stateT > 0) {
      var wob = Math.sin(this.t * 40) * 1.6;
      ctx.translate(wob, 0);
    }
    Art.blit(ctx, sp, fi);
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, this.flash * 1.25);
      Art.blit(ctx, sp, fi);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    /* health bar: only once damaged, so a full screen is not all bars */
    if (this.hp < this.maxHp && !this.def.boss) {
      var bw = Math.max(20, this.r * 2.6);
      RG.Draw.bar(ctx, this.x - bw / 2, this.y - this.r * 2.6 - 12, bw, 3.6,
        this.hp / this.maxHp, this.elite ? '#ffd76a' : '#e8455c', 'rgba(0,0,0,0.55)');
    }
    if (this.elite) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(this.t * 3) * 0.2;
      ctx.fillStyle = '#ffd76a';
      RG.Draw.star(ctx, this.x, this.y - this.r * 2.6 - 20, 4, 1.7, 5, -Math.PI / 2);
      ctx.fill();
      ctx.restore();
    }
  };

  /* -------------------------------------------------------- projectiles */
  function fireProjectile(g, x, y, angle, speed, dmg, radius, color, friendly, opts) {
    opts = opts || {};
    var p = null;
    for (var i = 0; i < g.projectiles.length; i++) if (!g.projectiles[i].alive) { p = g.projectiles[i]; break; }
    if (!p) return null;
    p.alive = true;
    p.x = x; p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.dmg = dmg; p.r = radius; p.color = color;
    p.friendly = !!friendly;
    p.life = opts.life || 1.8;
    p.pierce = opts.pierce || 0;
    p.homing = opts.homing || 0;
    p.trail = opts.trail || null;
    p.big = !!opts.big;
    p.hitList = p.hitList || [];
    p.hitList.length = 0;
    p.t = 0;
    return p;
  }
  RG.fireProjectile = fireProjectile;

  function updateProjectiles(dt, g) {
    var list = g.projectiles;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.alive) continue;
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }

      if (p.homing > 0 && p.friendly) {
        var tgt = nearestEnemy(g, p.x, p.y, 220);
        if (tgt) {
          var want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          var cur = Math.atan2(p.vy, p.vx);
          var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          var na = M.angleTowards(cur, want, p.homing * dt);
          p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
        }
      }

      p.x += p.vx * dt; p.y += p.vy * dt;

      if (p.trail && Math.random() < dt * 55) {
        P.spawn(p.x, p.y, 0, 0, 0.28, p.r * 0.8, p.trail, 0, { glow: 1, drag: 0.9 });
      }

      if (g.world.solidAtWorld(p.x, p.y)) {
        P.burst(p.x, p.y, 6, p.color, { speed: 70, life: 0.3, size: 2.4, glow: 1 });
        p.alive = false; continue;
      }

      if (p.friendly) {
        for (var e = 0; e < g.enemies.length; e++) {
          var en = g.enemies[e];
          if (!en.alive || en.spawnT > 0) continue;
          if (p.hitList.indexOf(en) !== -1) continue;
          if (M.dist2(p.x, p.y, en.x, en.y - en.r * 0.6) < (p.r + en.r) * (p.r + en.r)) {
            var crit = Math.random() < g.player.stats.crit;
            en.hurt(g, p.dmg * (crit ? 2 : 1), 60, Math.atan2(p.vy, p.vx), crit);
            p.hitList.push(en);
            if (p.pierce > 0) p.pierce--;
            else {
              P.burst(p.x, p.y, 7, p.color, { speed: 90, life: 0.3, size: 2.6, glow: 1 });
              p.alive = false;
            }
            break;
          }
        }
      } else {
        var pl = g.player;
        if (!pl.dead && pl.iframes <= 0 && M.dist2(p.x, p.y, pl.x, pl.y - 12) < (p.r + pl.r) * (p.r + pl.r)) {
          pl.hurt(g, p.dmg, p);
          P.burst(p.x, p.y, 8, p.color, { speed: 100, life: 0.3, size: 2.6, glow: 1 });
          p.alive = false;
        }
      }
    }
  }

  function drawProjectiles(ctx, g) {
    var list = g.projectiles;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.alive) continue;
      var pulse = p.big ? 1 + Math.sin(p.t * 22) * 0.12 : 1;
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.1 * pulse, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * pulse, 0, M.TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.42 * pulse, 0, M.TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* -------------------------------------------------------- hit helpers */
  function hitCone(g, x, y, range, dir, half, dmg, knock) {
    var count = 0;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (!e.alive || e.spawnT > 0) continue;
      var ey = e.y - e.r * 0.6;
      if (!M.inCone(e.x, ey, x, y, dir, half, range + e.r)) continue;
      var crit = Math.random() < g.player.stats.crit;
      e.hurt(g, dmg * (crit ? 2 : 1), knock, Math.atan2(ey - y, e.x - x), crit);
      count++;
    }
    return count;
  }
  function hitArea(g, x, y, radius, dmg, knock, dir, once, tag) {
    var count = 0;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (!e.alive || e.spawnT > 0) continue;
      if (tag && e._lastTag === tag && e._lastTagT === g.frame) continue;
      if (M.dist2(e.x, e.y - e.r * 0.6, x, y) > (radius + e.r) * (radius + e.r)) continue;
      var crit = Math.random() < g.player.stats.crit;
      e.hurt(g, dmg * (crit ? 2 : 1), knock, dir || Math.atan2(e.y - y, e.x - x), crit);
      if (tag) { e._lastTag = tag; e._lastTagT = g.frame; }
      count++;
    }
    return count;
  }
  RG.hitArea = hitArea;

  function spawnShock(g, x, y, radius, dmg, knock, color, life, stun) {
    var fx = null;
    for (var i = 0; i < g.effects.length; i++) if (!g.effects[i].alive) { fx = g.effects[i]; break; }
    if (fx) {
      fx.alive = true; fx.kind = 'shock'; fx.x = x; fx.y = y;
      fx.r = 0; fx.maxR = radius; fx.life = life; fx.maxLife = life;
      fx.color = color; fx.dmg = dmg; fx.knock = knock; fx.hit = fx.hit || [];
      fx.hit.length = 0; fx.stun = !!stun;
    }
    P.burst(x, y, 22, color, { speed: 170, life: 0.5, size: 4, glow: 1, kind: 1 });
  }

  function updateEffects(dt, g) {
    for (var i = 0; i < g.effects.length; i++) {
      var f = g.effects[i];
      if (!f.alive) continue;
      f.life -= dt;
      if (f.life <= 0) { f.alive = false; continue; }
      if (f.kind === 'shock') {
        var t = 1 - f.life / f.maxLife;
        f.r = f.maxR * M.easeOutCubic(t);
        for (var e = 0; e < g.enemies.length; e++) {
          var en = g.enemies[e];
          if (!en.alive || en.spawnT > 0 || f.hit.indexOf(en) !== -1) continue;
          var d = M.dist(en.x, en.y - en.r * 0.5, f.x, f.y);
          if (d < f.r + en.r && d > f.r - 40) {
            var crit = Math.random() < g.player.stats.crit;
            en.hurt(g, f.dmg * (crit ? 2 : 1), f.knock, Math.atan2(en.y - f.y, en.x - f.x), crit);
            if (f.stun) en.stun = Math.max(en.stun, 1.1);
            f.hit.push(en);
          }
        }
      }
    }
  }

  function drawEffects(ctx, g) {
    ctx.save();
    for (var i = 0; i < g.effects.length; i++) {
      var f = g.effects[i];
      if (!f.alive) continue;
      if (f.kind === 'shock') {
        var t = f.life / f.maxLife;
        ctx.globalAlpha = t * 0.8;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 + t * 7;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, M.TAU); ctx.stroke();
        ctx.globalAlpha = t * 0.24;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.72, f.r * 0.45, 0, 0, M.TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ pickups */
  function spawnPickups(g, x, y, kind, count, totalValue) {
    var per = Math.max(1, Math.round(totalValue / count));
    for (var i = 0; i < count; i++) {
      var pk = null;
      for (var j = 0; j < g.pickups.length; j++) if (!g.pickups[j].alive) { pk = g.pickups[j]; break; }
      if (!pk) return;
      var a = Math.random() * M.TAU, s = 40 + Math.random() * 90;
      pk.alive = true; pk.kind = kind;
      pk.x = x; pk.y = y;
      pk.vx = Math.cos(a) * s; pk.vy = Math.sin(a) * s - 40;
      pk.value = (i === count - 1) ? Math.max(1, totalValue - per * (count - 1)) : per;
      pk.life = 24; pk.t = Math.random() * 6; pk.magnet = false;
      pk.delay = 0.25;
    }
  }
  RG.spawnPickups = spawnPickups;

  function updatePickups(dt, g) {
    var p = g.player;
    var magR = 90 + p.stats.luck * 1.6;
    for (var i = 0; i < g.pickups.length; i++) {
      var k = g.pickups[i];
      if (!k.alive) continue;
      k.t += dt;
      k.life -= dt;
      if (k.life <= 0) { k.alive = false; continue; }
      if (k.delay > 0) k.delay -= dt;

      var d = M.dist(k.x, k.y, p.x, p.y - 10);
      if (k.delay <= 0 && (d < magR || k.magnet)) {
        k.magnet = true;
        var a = Math.atan2(p.y - 10 - k.y, p.x - k.x);
        var pull = 260 + (magR - Math.min(d, magR)) * 5;
        k.vx = M.damp(k.vx, Math.cos(a) * pull, 8, dt);
        k.vy = M.damp(k.vy, Math.sin(a) * pull, 8, dt);
      } else {
        k.vx *= Math.pow(0.9, dt * 60);
        k.vy *= Math.pow(0.9, dt * 60);
      }
      k.x += k.vx * dt; k.y += k.vy * dt;

      if (d < 14 && k.delay <= 0) {
        k.alive = false;
        g.collect(k.kind, k.value, k.x, k.y);
      }
    }
  }

  var pickIcons = null;
  function drawPickups(ctx, g) {
    if (!pickIcons) {
      pickIcons = { coin: Art.icon('coin', 16), gem: Art.icon('gem', 20), heart: Art.icon('heart', 20) };
    }
    var prevAlpha = ctx.globalAlpha;
    var i, k, bob, fade;
    /* icon-based pickups first: one state block for the whole batch */
    for (i = 0; i < g.pickups.length; i++) {
      k = g.pickups[i];
      if (!k.alive || k.kind === 'xp') continue;
      bob = Math.sin(k.t * 4) * 2;
      fade = k.life < 3 ? (Math.sin(k.life * 14) * 0.5 + 0.5) : 1;
      var img = pickIcons[k.kind];
      if (!img) continue;
      var size = k.kind === 'coin' ? 11 : (k.kind === 'gem' ? 15 : 14);
      ctx.globalAlpha = fade;
      ctx.drawImage(img, k.x - size / 2, k.y + bob - size / 2, size, size);
    }
    /* then the additive XP motes */
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#8ceaff';
    for (i = 0; i < g.pickups.length; i++) {
      k = g.pickups[i];
      if (!k.alive || k.kind !== 'xp') continue;
      bob = Math.sin(k.t * 4) * 2;
      fade = k.life < 3 ? (Math.sin(k.life * 14) * 0.5 + 0.5) : 1;
      ctx.globalAlpha = 0.4 * fade;
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 7, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 0.95 * fade;
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 3.2, 0, M.TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = prevAlpha;
  }

  RG.updateProjectiles = updateProjectiles;
  RG.drawProjectiles = drawProjectiles;
  RG.updatePickups = updatePickups;
  RG.drawPickups = drawPickups;
  RG.updateEffects = updateEffects;
  RG.drawEffects = drawEffects;
  RG.hitCone = hitCone;
  RG.spawnShock = spawnShock;
})(RG);
