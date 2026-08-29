/* ReGen - world generation. Each world is a bounded, seeded region built
 * from layered noise: elevation carves the coastline and cliffs, moisture
 * decides what grows, and a set of hand-authored rules drops in the
 * landmarks that make a map worth walking across. Same seed, same world -
 * always, on every device. */
'use strict';
(function (RG) {
  var M = RG.M, T = RG.TILE, TP = RG.TILEPROPS;
  var TS = RG.TILE_SIZE;

  /* Palettes handed to the prop painter so scenery matches its biome. */
  var PROP_PAL = {
    verdant: { key: 'v', trunk: '#6a4a2e', leaf: '#4f9a48', leafDark: '#3a7038', rock: '#7b7f88', crystal: '#7fe0ff', crystalLight: '#c0f0ff', accent: '#c8483c', wall: '#d8c8a8', roof: '#8a4438' },
    ember: { key: 'e', trunk: '#4a3428', leaf: '#7a6a30', leafDark: '#5a4a20', rock: '#6a5248', crystal: '#ff9a3a', crystalLight: '#ffd76a', accent: '#d8481a', wall: '#b09078', roof: '#6a2e20' },
    frost: { key: 'f', trunk: '#5a4a3a', leaf: '#3a6a5a', leafDark: '#2a5044', rock: '#8f9aa8', crystal: '#bde2f2', crystalLight: '#eaf6ff', accent: '#7fe0ff', wall: '#c8d4e0', roof: '#4a6a8a' },
    voidr: { key: 'x', trunk: '#3a2a4a', leaf: '#4a3a6a', leafDark: '#2e2044', rock: '#4a4058', crystal: '#c08aff', crystalLight: '#e8d0ff', accent: '#ff5fa2', wall: '#3a3050', roof: '#2a1c40' },
    hub: { key: 'h', trunk: '#6a4a2e', leaf: '#4f9a48', leafDark: '#3a7038', rock: '#7b7f88', crystal: '#7fe0ff', crystalLight: '#c0f0ff', accent: '#4ac8a0', wall: '#e0d0b0', roof: '#8a4438' },
    dungeon: { key: 'd', trunk: '#4a3a2a', leaf: '#3a5a3a', leafDark: '#2a4028', rock: '#6a6570', crystal: '#8ceaff', crystalLight: '#d0f4ff', accent: '#a87aff', wall: '#5a5464', roof: '#3a3444' }
  };

  function World(def, seed) {
    this.def = def;
    this.id = def.id;
    this.biome = def.biome;
    this.seed = seed >>> 0;
    this.size = def.size;
    this.px = this.size * TS;
    this.tiles = new Uint8Array(this.size * this.size);
    this.decor = new Uint8Array(this.size * this.size);   /* variant index */
    this.props = [];
    this.propGrid = null;
    this.structures = [];      /* interactables: portals, shrines, chests, npcs */
    this.spawn = { x: 0, y: 0 };
    this.pal = PROP_PAL[def.biome] || PROP_PAL.verdant;
    this.atlas = RG.Art.atlas(def.biome);
    this.minimap = null;
    this.spawnZones = [];
    this.bossArena = null;
    this.generate();
  }

  World.prototype.idx = function (tx, ty) { return ty * this.size + tx; };
  World.prototype.inBounds = function (tx, ty) { return tx >= 0 && ty >= 0 && tx < this.size && ty < this.size; };
  World.prototype.tile = function (tx, ty) {
    if (!this.inBounds(tx, ty)) return T.VOID;
    return this.tiles[ty * this.size + tx];
  };
  World.prototype.setTile = function (tx, ty, v) {
    if (!this.inBounds(tx, ty)) return;
    this.tiles[ty * this.size + tx] = v;
  };
  World.prototype.tileAtWorld = function (x, y) {
    return this.tile(Math.floor(x / TS), Math.floor(y / TS));
  };
  World.prototype.propsAt = function (x, y) { return this.tileAtWorld(x, y); };
  World.prototype.solidAtWorld = function (x, y) {
    var t = this.tileAtWorld(x, y);
    return !!TP[t].solid;
  };

  /* ------------------------------------------------------- generation */
  World.prototype.generate = function () {
    var d = this.def;
    if (d.kind === 'dungeon') this.generateDungeon();
    else if (d.kind === 'arena') this.generateArena();
    else if (d.id === 'hub') this.generateHub();
    else this.generateWild();
    this.buildPropGrid();
    this.buildMinimap();
  };

  World.prototype.generateWild = function () {
    var n = this.size, i, x, y;
    var elev = new RG.Noise(this.seed);
    var moist = new RG.Noise(this.seed ^ 0x9e3779b9);
    var detail = new RG.Noise(this.seed ^ 0x51ed270b);
    var rng = new RG.Rng(this.seed ^ 0x2545f491);
    var b = this.biome;
    var scale = 0.022;

    /* fbm output clusters around the middle of its range; stretching it to
     * a full 0..1 is what stops one terrain band from swallowing the map */
    function spread(v) { return M.clamp01((v * 0.5 + 0.5 - 0.24) / 0.52); }

    for (y = 0; y < n; y++) {
      for (x = 0; x < n; x++) {
        var nx = (x / n - 0.5) * 2, ny = (y / n - 0.5) * 2;
        var edge = Math.sqrt(nx * nx + ny * ny);
        /* the rim - and only the rim - is pulled down into ocean, so every
         * world is an island the player cannot walk off */
        var rim = M.clamp01((edge - 0.62) / 0.36);

        var e = spread(elev.fbm(x * scale, y * scale, 5, 2.1, 0.52));
        /* the interior never dips to the void band: only the rim does, so a
         * low valley becomes a lake rather than a hole in the world */
        e = Math.max(e, 0.075) * (1 - rim) + 0.004 * rim;
        var m = spread(moist.fbm(x * scale * 1.6 + 100, y * scale * 1.6 + 100, 4, 2, 0.5));
        var dtl = detail.at(x * 0.31, y * 0.31) * 0.5 + 0.5;

        this.tiles[y * n + x] = this.pickTile(b, e, m, dtl);
        this.decor[y * n + x] = (dtl * (RG.Art.VARIANTS - 0.01)) | 0;
      }
    }

    /* rivers: follow a ridged noise band downhill through the map */
    if (b !== 'voidr') {
      var riverN = new RG.Noise(this.seed ^ 0x77c1a3);
      for (y = 0; y < n; y++) {
        for (x = 0; x < n; x++) {
          var r = riverN.ridged(x * 0.014, y * 0.014, 3);
          var t = this.tiles[y * n + x];
          if (r > 0.86 && t !== T.VOID && !TP[t].solid && t !== T.DEEP) {
            this.tiles[y * n + x] = (b === 'ember') ? T.LAVA : (b === 'frost' ? T.ICE : T.WATER);
          }
        }
      }
    }

    this.smoothPass();
    this.placeStructures(rng);
    this.scatterProps(rng);
    this.carvePaths(rng);
  };

  World.prototype.pickTile = function (b, e, m, d) {
    if (e < 0.03) return T.VOID;                  /* rim only */
    if (b === 'verdant') {
      if (e < 0.12) return T.DEEP;
      if (e < 0.185) return T.WATER;
      if (e < 0.245) return T.SAND;
      if (e > 0.90) return T.STONE;
      if (e > 0.83) return d > 0.45 ? T.STONE : T.DIRT;
      if (m > 0.72) return d > 0.80 ? T.FLOWERS : (d > 0.36 ? T.MOSS : T.GRASS_DARK);
      if (m > 0.30) return d > 0.90 ? T.FLOWERS : (d > 0.55 ? T.GRASS : T.GRASS_DARK);
      return d > 0.24 ? T.GRASS : T.DIRT;
    }
    if (b === 'ember') {
      if (e < 0.10) return T.LAVA;
      if (e < 0.16) return T.EMBER;
      if (e > 0.88) return T.STONE;
      if (e > 0.78) return d > 0.42 ? T.STONE : T.ASH;
      if (m > 0.76) return d > 0.55 ? T.EMBER : T.ASH;   /* smouldering ground */
      if (m > 0.44) return T.ASH;
      if (m > 0.20) return d > 0.5 ? T.SAND : T.DIRT;
      return T.SAND;
    }
    if (b === 'frost') {
      if (e < 0.12) return T.DEEP;
      if (e < 0.20) return T.ICE;
      if (e > 0.90) return T.STONE;
      if (e > 0.82) return d > 0.55 ? T.STONE : T.SNOW;
      if (m > 0.70) return d > 0.62 ? T.ICE : T.SNOW;
      if (m > 0.20) return T.SNOW;
      return d > 0.35 ? T.SNOW : T.STONE;
    }
    /* void */
    if (e < 0.11) return T.ASH;
    if (e > 0.88) return T.CRYSTAL;
    if (m > 0.72) return d > 0.55 ? T.CRYSTAL : T.VOIDROCK;
    if (m > 0.26) return T.VOIDROCK;
    return d > 0.45 ? T.VOIDROCK : T.ASH;
  };

  /* Removes single-tile speckles that make terrain look noisy rather than
   * designed. Two passes is plenty. */
  World.prototype.smoothPass = function () {
    var n = this.size, src = new Uint8Array(this.tiles);
    for (var pass = 0; pass < 2; pass++) {
      for (var y = 1; y < n - 1; y++) {
        for (var x = 1; x < n - 1; x++) {
          var i = y * n + x, c = src[i];
          var counts = {}, best = c, bestN = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              var v = src[i + dy * n + dx];
              counts[v] = (counts[v] || 0) + 1;
              if (counts[v] > bestN) { bestN = counts[v]; best = v; }
            }
          }
          if (bestN >= 6 && best !== c) this.tiles[i] = best;
        }
      }
      src.set(this.tiles);
    }
  };

  /* ------------------------------------------------------- structures */
  var LANDMARK_NAMES = {
    verdant: ['Sunken Arbour', 'Fallen Aqueduct', 'Whisper Ring', 'Old Beehive', 'Mossy Cairn', 'Split Oak', 'Fern Hollow', 'Drowned Statue', 'Green Chapel', 'Wolf Den'],
    ember: ['Slag Furnace', 'Cracked Obelisk', 'Cinder Camp', 'Bone Kiln', 'Smelter Ruin', 'Ash Shrine', 'The Blowhole', 'Iron Gibbet', 'Emberwatch', 'Molten Stair'],
    frost: ['Frozen Bell', 'Rime Cathedral', 'Sleeping Herd', 'Glass Lake', 'Wind Teeth', 'Snowbound Cart', 'Aurora Post', 'The Long Silence', 'Ice Gallery', 'Hollow Peak'],
    voidr: ['Torn Choir', 'Zero Garden', 'The Unwritten', 'Folded Stair', 'Echo Vault', 'Null Spire', 'Last Lantern', 'Seam of Hours', 'Empty Throne', 'The Quiet Wound']
  };

  World.prototype.findOpenSpot = function (rng, minDist, tries) {
    var n = this.size;
    for (var a = 0; a < (tries || 200); a++) {
      var tx = rng.int(6, n - 7), ty = rng.int(6, n - 7);
      var t = this.tile(tx, ty);
      if (TP[t].solid || TP[t].liquid || TP[t].damage) continue;
      /* need a small clear pad around it */
      var ok = true;
      for (var dy = -2; dy <= 2 && ok; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var tt = this.tile(tx + dx, ty + dy);
          if (TP[tt].solid || TP[tt].liquid || TP[tt].damage) { ok = false; break; }
        }
      }
      if (!ok) continue;
      var wx = tx * TS + TS * 0.5, wy = ty * TS + TS * 0.5;
      if (minDist) {
        var far = true;
        for (var s = 0; s < this.structures.length; s++) {
          if (M.dist2(wx, wy, this.structures[s].x, this.structures[s].y) < minDist * minDist) { far = false; break; }
        }
        if (!far) continue;
      }
      return { tx: tx, ty: ty, x: wx, y: wy };
    }
    return null;
  };

  World.prototype.placeStructures = function (rng) {
    var names = (LANDMARK_NAMES[this.biome] || LANDMARK_NAMES.verdant).slice();
    rng.shuffle(names);

    /* Return portal: genuinely near the middle, so the map has an anchor the
     * player can always navigate back toward. */
    var mid = this.size * 0.5;
    var home = null, homeD = 1e9;
    for (var hs = 0; hs < 260; hs++) {
      var cand = this.findOpenSpot(rng, 0, 1);
      if (!cand) continue;
      var dd = (cand.tx - mid) * (cand.tx - mid) + (cand.ty - mid) * (cand.ty - mid);
      if (dd < homeD) { homeD = dd; home = cand; }
      if (homeD < 36) break;
    }
    if (!home) home = { x: this.px * 0.5, y: this.px * 0.5, tx: mid | 0, ty: mid | 0 };
    for (var cy = -3; cy <= 3; cy++) {
      for (var cx = -3; cx <= 3; cx++) {
        if (cx * cx + cy * cy <= 9) this.setTile(home.tx + cx, home.ty + cy, this.pathTile());
      }
    }
    this.spawn.x = home.x; this.spawn.y = home.y + TS * 1.6;
    this.structures.push({ kind: 'portal', to: 'hub', x: home.x, y: home.y, r: 22, name: 'Aetherhold Gate', prompt: 'Return to Aetherhold' });

    /* dungeon entrances */
    var dcount = 3;
    for (var d = 0; d < dcount; d++) {
      var sp = this.findOpenSpot(rng, 420);
      if (!sp) continue;
      for (var yy = -2; yy <= 2; yy++) for (var xx = -2; xx <= 2; xx++) this.setTile(sp.tx + xx, sp.ty + yy, T.STONE);
      this.structures.push({
        kind: 'dungeon', x: sp.x, y: sp.y, r: 22, seed: rng.int(1, 1e9),
        name: 'Rift Descent ' + String.fromCharCode(65 + d), prompt: 'Descend into the dungeon', tier: d
      });
    }

    /* shrines: permanent buffs, and the main "discovery" beat */
    var scount = 7;
    for (var s = 0; s < scount; s++) {
      var sp2 = this.findOpenSpot(rng, 300);
      if (!sp2) continue;
      this.structures.push({
        kind: 'shrine', x: sp2.x, y: sp2.y, r: 20,
        name: names[s % names.length], prompt: 'Attune to the shrine', used: false
      });
    }

    /* chests */
    var ccount = 16;
    for (var c = 0; c < ccount; c++) {
      var sp3 = this.findOpenSpot(rng, 150);
      if (!sp3) continue;
      this.structures.push({
        kind: 'chest', x: sp3.x, y: sp3.y, r: 16,
        name: 'Cache', prompt: 'Open the cache', used: false,
        quality: rng.chance(0.18) ? 'good' : 'normal'
      });
    }

    /* boss arena, far from home */
    var best = null, bestD = -1;
    for (var a = 0; a < 300; a++) {
      var sp4 = this.findOpenSpot(rng, 0, 1);
      if (!sp4) continue;
      var dd = M.dist2(sp4.x, sp4.y, home.x, home.y);
      if (dd > bestD) { bestD = dd; best = sp4; }
    }
    if (best && this.def.boss) {
      for (var by = -6; by <= 6; by++) {
        for (var bx = -6; bx <= 6; bx++) {
          if (bx * bx + by * by <= 36) this.setTile(best.tx + bx, best.ty + by, this.biome === 'voidr' ? T.MARBLE : T.STONE);
        }
      }
      this.bossArena = { x: best.x, y: best.y, r: 150 };
      this.structures.push({
        kind: 'boss', x: best.x, y: best.y, r: 26, boss: this.def.boss,
        name: RG.Data.ENEMIES[this.def.boss].name, prompt: 'Challenge the guardian of this world', used: false
      });
    }

    /* enemy camps drive the spawn director */
    for (var z = 0; z < 14; z++) {
      var sp5 = this.findOpenSpot(rng, 180);
      if (sp5) this.spawnZones.push({ x: sp5.x, y: sp5.y, r: 220 });
    }
  };

  /* A* free path carving: straight-ish corridors of PATH tiles that link
   * the structures, so the map reads as a place rather than noise. */
  World.prototype.carvePaths = function (rng) {
    var anchors = [];
    for (var i = 0; i < this.structures.length; i++) {
      var s = this.structures[i];
      if (s.kind === 'portal' || s.kind === 'dungeon' || s.kind === 'shrine' || s.kind === 'boss') anchors.push(s);
    }
    if (anchors.length < 2) return;
    var hub = anchors[0];
    for (var a = 1; a < anchors.length; a++) this.carveLine(hub, anchors[a], rng);
    for (var b = 1; b < anchors.length - 1; b++) {
      if (rng.chance(0.4)) this.carveLine(anchors[b], anchors[b + 1], rng);
    }
  };

  /* Roads should look like they belong to their world: sand-coloured paving
   * in a forest, packed ash in a caldera, worn marble in the void. */
  World.prototype.pathTile = function () {
    switch (this.biome) {
      case 'ember': return T.ASH;
      case 'frost': return T.STONE;
      case 'voidr': return T.MARBLE;
      default: return T.PATH;
    }
  };

  World.prototype.carveLine = function (a, b, rng) {
    var pathTile = this.pathTile();
    var x = a.x, y = a.y;
    var steps = Math.ceil(M.dist(a.x, a.y, b.x, b.y) / (TS * 0.6));
    var wob = new RG.Noise(rng.int(1, 1e9));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var px = M.lerp(a.x, b.x, t);
      var py = M.lerp(a.y, b.y, t);
      var w = wob.at(t * 6, 0) * TS * 5;
      var ang = M.angle(a.x, a.y, b.x, b.y) + Math.PI / 2;
      px += Math.cos(ang) * w * Math.sin(t * Math.PI);
      py += Math.sin(ang) * w * Math.sin(t * Math.PI);
      var tx = Math.floor(px / TS), ty = Math.floor(py / TS);
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var cur = this.tile(tx + dx, ty + dy);
          if (cur === T.VOID || cur === T.DEEP) continue;
          if (cur === T.WATER || cur === T.LAVA) { this.setTile(tx + dx, ty + dy, T.BRIDGE); continue; }
          if (Math.abs(dx) + Math.abs(dy) <= 1) this.setTile(tx + dx, ty + dy, pathTile);
        }
      }
      x = px; y = py;
    }
  };

  /* ------------------------------------------------------------ props */
  var BIOME_PROPS = {
    verdant: [
      { n: 'tree', w: 26, on: [T.GRASS, T.GRASS_DARK, T.MOSS], r: 7, solid: true },
      { n: 'pine', w: 10, on: [T.GRASS_DARK, T.DIRT], r: 6, solid: true },
      { n: 'bush', w: 22, on: [T.GRASS, T.MOSS, T.FLOWERS], r: 0 },
      { n: 'rock', w: 14, on: [T.DIRT, T.STONE, T.SAND], r: 6, solid: true },
      { n: 'boulder', w: 5, on: [T.STONE, T.DIRT], r: 12, solid: true },
      { n: 'mushroom', w: 9, on: [T.MOSS, T.GRASS_DARK], r: 0 },
      { n: 'stump', w: 0, on: [], r: 0 },
      { n: 'bones', w: 3, on: [T.DIRT, T.SAND], r: 0 },
      { n: 'crystal', w: 3, on: [T.STONE], r: 6, solid: true }
    ],
    ember: [
      { n: 'deadtree', w: 20, on: [T.ASH, T.DIRT], r: 5, solid: true },
      { n: 'rock', w: 24, on: [T.ASH, T.STONE, T.SAND], r: 6, solid: true },
      { n: 'boulder', w: 10, on: [T.STONE], r: 12, solid: true },
      { n: 'bones', w: 12, on: [T.ASH, T.SAND], r: 0 },
      { n: 'cactus', w: 8, on: [T.SAND], r: 5, solid: true },
      { n: 'crystal', w: 8, on: [T.STONE, T.EMBER], r: 6, solid: true },
      { n: 'torch', w: 5, on: [T.ASH, T.STONE], r: 0, light: '#ff9a3a' }
    ],
    frost: [
      { n: 'pine', w: 28, on: [T.SNOW], r: 6, solid: true },
      { n: 'icespike', w: 18, on: [T.ICE, T.SNOW], r: 5, solid: true },
      { n: 'rock', w: 16, on: [T.STONE, T.SNOW], r: 6, solid: true },
      { n: 'boulder', w: 7, on: [T.STONE], r: 12, solid: true },
      { n: 'deadtree', w: 8, on: [T.SNOW, T.STONE], r: 5, solid: true },
      { n: 'bones', w: 5, on: [T.SNOW], r: 0 },
      { n: 'crystal', w: 6, on: [T.ICE], r: 6, solid: true }
    ],
    voidr: [
      { n: 'crystal', w: 30, on: [T.CRYSTAL, T.VOIDROCK], r: 6, solid: true, light: '#c08aff' },
      { n: 'deadtree', w: 14, on: [T.VOIDROCK, T.ASH], r: 5, solid: true },
      { n: 'pillar', w: 14, on: [T.VOIDROCK, T.MARBLE], r: 7, solid: true },
      { n: 'boulder', w: 8, on: [T.VOIDROCK], r: 12, solid: true },
      { n: 'bones', w: 10, on: [T.ASH, T.VOIDROCK], r: 0 },
      { n: 'statue', w: 6, on: [T.MARBLE, T.VOIDROCK], r: 7, solid: true }
    ]
  };

  World.prototype.scatterProps = function (rng) {
    var list = BIOME_PROPS[this.biome] || BIOME_PROPS.verdant;
    var pool = [];
    for (var i = 0; i < list.length; i++) if (list[i].w > 0) pool.push({ w: list[i].w, d: list[i] });
    var n = this.size;
    var target = Math.floor(n * n * 0.055);
    var placed = 0, guard = 0;

    while (placed < target && guard++ < target * 12) {
      var tx = rng.int(1, n - 2), ty = rng.int(1, n - 2);
      var t = this.tile(tx, ty);
      if (t === T.PATH || t === T.BRIDGE) continue;
      var choice = rng.weighted(pool).d;
      if (choice.on.indexOf(t) === -1) continue;
      var wx = tx * TS + rng.range(3, TS - 3);
      var wy = ty * TS + rng.range(3, TS - 3);
      /* never block a structure */
      var blocked = false;
      for (var s = 0; s < this.structures.length; s++) {
        if (M.dist2(wx, wy, this.structures[s].x, this.structures[s].y) < 60 * 60) { blocked = true; break; }
      }
      if (blocked) continue;
      this.props.push({
        name: choice.n, seed: rng.int(0, 999), x: wx, y: wy,
        r: choice.r || 0, solid: !!choice.solid, light: choice.light || null,
        sway: (choice.n === 'tree' || choice.n === 'bush' || choice.n === 'pine') ? rng.range(0, 6.28) : 0,
        scale: rng.range(0.85, 1.15)
      });
      placed++;
    }
  };

  /* --------------------------------------------------------------- hub */
  World.prototype.generateHub = function () {
    var n = this.size, x, y;
    var rng = new RG.Rng(0xA37B1E >>> 0);
    var noise = new RG.Noise(4242);
    var cx = n * 0.5, cy = n * 0.5;

    for (y = 0; y < n; y++) {
      for (x = 0; x < n; x++) {
        var dx = x - cx, dy = y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var edge = dist / (n * 0.46);
        var t;
        if (edge > 1.02) t = T.VOID;
        else if (edge > 0.94) t = T.DEEP;
        else if (edge > 0.88) t = T.WATER;
        else if (edge > 0.84) t = T.SAND;
        else {
          var v = noise.fbm(x * 0.06, y * 0.06, 3, 2, 0.5) * 0.5 + 0.5;
          t = v > 0.62 ? T.GRASS_DARK : (v > 0.3 ? T.GRASS : T.FLOWERS);
        }
        this.tiles[y * n + x] = t;
        this.decor[y * n + x] = ((noise.at(x * 0.4, y * 0.4) * 0.5 + 0.5) * (RG.Art.VARIANTS - 0.01)) | 0;
      }
    }

    /* Town square: a marble core, a paved ring, and six roads out to the
     * fields. Distances are in world units so the layout reads the same
     * whatever the tile size. */
    var CORE = 9, RING = 17;
    var x2, y2;
    for (y2 = -RING - 1; y2 <= RING + 1; y2++) {
      for (x2 = -RING - 1; x2 <= RING + 1; x2++) {
        var dr = Math.sqrt(x2 * x2 + y2 * y2);
        if (dr > RING) continue;
        if (dr <= CORE) this.setTile(cx + x2, cy + y2, T.MARBLE);
        else if (dr <= CORE + 1.4) this.setTile(cx + x2, cy + y2, T.STONE);
        else this.setTile(cx + x2, cy + y2, T.PATH);
      }
    }
    /* an inlaid ring of stone in the marble reads as deliberate paving */
    for (var ang2 = 0; ang2 < 360; ang2 += 2) {
      var ra = ang2 * Math.PI / 180;
      this.setTile(Math.round(cx + Math.cos(ra) * (CORE - 3)), Math.round(cy + Math.sin(ra) * (CORE - 3)), T.STONE);
    }
    for (var road = 0; road < 6; road++) {
      var ang = road / 6 * M.TAU + 0.26;
      for (var st2 = RING - 2; st2 < n * 0.44; st2++) {
        var rx = Math.round(cx + Math.cos(ang) * st2), ry = Math.round(cy + Math.sin(ang) * st2);
        for (var w = -1; w <= 0; w++) {
          for (var w2 = -1; w2 <= 0; w2++) {
            var tt = this.tile(rx + w, ry + w2);
            if (tt === T.VOID || tt === T.DEEP) continue;
            this.setTile(rx + w, ry + w2, tt === T.WATER ? T.BRIDGE : T.PATH);
          }
        }
      }
    }

    var C = cx * TS, CY = cy * TS;
    this.spawn.x = C; this.spawn.y = CY + TS * 3.5;

    /* the five service buildings around the plaza */
    var services = [
      { kind: 'shop', name: 'Trader Ovi', prompt: 'Browse the store', ang: -Math.PI / 2, dist: 320, prop: 'stall', icon: 'coin' },
      { kind: 'vault', name: 'Skin Vault', prompt: 'Open the skin vault', ang: -Math.PI / 6, dist: 340, prop: 'house', icon: 'bag' },
      { kind: 'quests', name: 'Quest Board', prompt: 'Read the quest board', ang: Math.PI / 6, dist: 330, prop: 'sign', icon: 'map' },
      { kind: 'arcade', name: 'The Arcade', prompt: 'Enter the arcade', ang: Math.PI / 2, dist: 320, prop: 'house', icon: 'bolt' },
      { kind: 'forge', name: 'Upgrade Forge', prompt: 'Spend cores at the forge', ang: Math.PI * 5 / 6, dist: 340, prop: 'anvil', icon: 'gear' },
      { kind: 'stats', name: 'Hall of Records', prompt: 'View records and achievements', ang: -Math.PI * 5 / 6, dist: 340, prop: 'statue', icon: 'trophy' }
    ];
    for (var i = 0; i < services.length; i++) {
      var sv = services[i];
      var sx = C + Math.cos(sv.ang) * sv.dist;
      var sy = CY + Math.sin(sv.ang) * sv.dist;
      this.props.push({ name: sv.prop, seed: 10 + i, x: sx, y: sy + 6, r: 0, solid: false, scale: 1 });
      this.structures.push({ kind: sv.kind, x: sx, y: sy + 22, r: 26, name: sv.name, prompt: sv.prompt, icon: sv.icon });
    }

    /* world gates ring the outer plaza */
    var gates = [
      { to: 'verdant', ang: Math.PI * 0.78 },
      { to: 'ember', ang: Math.PI * 1.11 },
      { to: 'frost', ang: Math.PI * 1.44 },
      { to: 'voidr', ang: Math.PI * 1.77 }
    ];
    for (var g = 0; g < gates.length; g++) {
      var gd = RG.Data.worldById(gates[g].to);
      var gx = C + Math.cos(gates[g].ang) * 560;
      var gy = CY + Math.sin(gates[g].ang) * 560;
      var gtx = Math.floor(gx / TS), gty = Math.floor(gy / TS);
      for (var py = -3; py <= 3; py++) for (var px2 = -3; px2 <= 3; px2++) {
        if (px2 * px2 + py * py <= 9) this.setTile(gtx + px2, gty + py, T.MARBLE);
      }
      this.props.push({ name: 'portal', seed: 30 + g, x: gx, y: gy, r: 0, solid: false, scale: 1, light: '#a87aff' });
      this.structures.push({
        kind: 'gate', to: gates[g].to, x: gx, y: gy + 8, r: 26,
        name: gd.name, prompt: 'Travel to ' + gd.name, level: gd.level, req: gd.req
      });
    }

    /* decorative town dressing */
    var hrng = new RG.Rng(918273);
    for (var h = 0; h < 10; h++) {
      var ha = hrng.range(0, M.TAU), hd = hrng.range(560, 780);
      this.props.push({ name: 'house', seed: 100 + h, x: C + Math.cos(ha) * hd, y: CY + Math.sin(ha) * hd, r: 26, solid: true, scale: hrng.range(0.85, 1.1) });
    }
    for (var l = 0; l < 12; l++) {
      var la = l / 12 * M.TAU + 0.26;
      this.props.push({
        name: 'lamp', seed: 200 + l, scale: 1, r: 0, solid: false, light: '#ffe8a8',
        x: C + Math.cos(la) * 268, y: CY + Math.sin(la) * 268
      });
    }
    /* planters ring the paving so the plaza is not a bare disc */
    for (var pb = 0; pb < 16; pb++) {
      var pa = pb / 16 * M.TAU + 0.13;
      this.props.push({
        name: 'bush', seed: 400 + pb, scale: hrng.range(0.9, 1.2), r: 0, solid: false,
        x: C + Math.cos(pa) * 240, y: CY + Math.sin(pa) * 240
      });
    }
    for (var bn = 0; bn < 4; bn++) {
      var ba2 = bn / 4 * M.TAU + 0.79;
      this.props.push({
        name: 'banner', seed: 500 + bn, scale: 1, r: 0, solid: false,
        x: C + Math.cos(ba2) * 196, y: CY + Math.sin(ba2) * 196
      });
    }
    for (var b2 = 0; b2 < 60; b2++) {
      var ba = hrng.range(0, M.TAU), bd2 = hrng.range(430, n * TS * 0.42);
      var bx = C + Math.cos(ba) * bd2, by = CY + Math.sin(ba) * bd2;
      var bt = this.tileAtWorld(bx, by);
      if (bt !== T.GRASS && bt !== T.GRASS_DARK && bt !== T.FLOWERS) continue;
      this.props.push({
        name: hrng.chance(0.5) ? 'tree' : 'bush', seed: 300 + b2, x: bx, y: by,
        r: 7, solid: hrng.chance(0.7), sway: hrng.range(0, 6.28), scale: hrng.range(0.85, 1.15)
      });
    }
    this.props.push({ name: 'shrine', seed: 7, x: C, y: CY - 10, r: 12, solid: true, light: '#7fe0ff', scale: 1.2 });
    this.structures.push({ kind: 'save', x: C, y: CY + 18, r: 24, name: 'Aether Shrine', prompt: 'Rest and save', icon: 'star' });
  };

  /* ----------------------------------------------------- prop indexing */
  World.prototype.buildPropGrid = function () {
    var cell = 240;
    this.propCell = cell;
    this.propCols = Math.ceil(this.px / cell) + 1;
    var grid = this.propGrid = [];
    for (var i = 0; i < this.propCols * this.propCols; i++) grid.push(null);
    for (var p = 0; p < this.props.length; p++) {
      var pr = this.props[p];
      var gx = Math.floor(pr.x / cell), gy = Math.floor(pr.y / cell);
      if (gx < 0 || gy < 0 || gx >= this.propCols || gy >= this.propCols) continue;
      var k = gy * this.propCols + gx;
      if (!grid[k]) grid[k] = [];
      grid[k].push(pr);
    }
  };

  World.prototype.queryProps = function (x0, y0, x1, y1, out) {
    out.length = 0;
    var cell = this.propCell, cols = this.propCols;
    var gx0 = M.clamp(Math.floor(x0 / cell), 0, cols - 1);
    var gx1 = M.clamp(Math.floor(x1 / cell), 0, cols - 1);
    var gy0 = M.clamp(Math.floor(y0 / cell), 0, cols - 1);
    var gy1 = M.clamp(Math.floor(y1 / cell), 0, cols - 1);
    for (var gy = gy0; gy <= gy1; gy++) {
      for (var gx = gx0; gx <= gx1; gx++) {
        var b = this.propGrid[gy * cols + gx];
        if (!b) continue;
        for (var i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  };

  /* ------------------------------------------------------ chunk cache */
  /* Terrain is static, so the visible tiles are baked into 16x16-tile
   * bitmaps and blitted a handful at a time instead of six hundred. Liquid
   * tiles are re-drawn on top each frame so they keep their shimmer. */
  /* patterned tiles must keep their orientation or the courses stop lining up */
  var NO_FLIP = {};
  NO_FLIP[T.WALL] = 1; NO_FLIP[T.WOOD] = 1; NO_FLIP[T.BRIDGE] = 1;
  NO_FLIP[T.MARBLE] = 1; NO_FLIP[T.CARPET] = 1;

  var CHUNK = 16;
  var CHUNK_PX = CHUNK * TS;
  var MAX_CHUNKS = 28;

  World.prototype.chunkAt = function (cx, cy) {
    if (!this._chunks) { this._chunks = new Map(); this._chunkOrder = []; }
    var key = cx * 4096 + cy;
    var hit = this._chunks.get(key);
    if (hit) return hit;

    var cv = RG.makeCanvas(CHUNK_PX, CHUNK_PX);
    var ctx = RG.ctxOf(cv, false);
    ctx.imageSmoothingEnabled = true;
    var atlas = this.atlas, px = atlas.px, img = atlas.canvas;
    var size = this.size;
    var over = 0.75;
    ctx.fillStyle = '#000000';
    ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    for (var ty = 0; ty < CHUNK; ty++) {
      for (var tx = 0; tx < CHUNK; tx++) {
        var wx = cx * CHUNK + tx, wy = cy * CHUNK + ty;
        if (wx < 0 || wy < 0 || wx >= size || wy >= size) continue;
        var id = this.tiles[wy * size + wx];
        if (id === T.VOID) continue;
        var v = this.decor[wy * size + wx] % atlas.variants;
        if (NO_FLIP[id]) {
          ctx.drawImage(img, v * px, id * px, px, px, tx * TS, ty * TS, TS + over, TS + over);
        } else {
          /* mirroring multiplies the apparent variety of the tile sheet by
           * four for the cost of a transform at bake time */
          var flip = (wx * 7 + wy * 13 + v) & 3;
          var fx = (flip & 1) ? -1 : 1, fy = (flip & 2) ? -1 : 1;
          ctx.save();
          ctx.translate(tx * TS + (fx < 0 ? TS + over : 0), ty * TS + (fy < 0 ? TS + over : 0));
          ctx.scale(fx, fy);
          ctx.drawImage(img, v * px, id * px, px, px, 0, 0, TS + over, TS + over);
          ctx.restore();
        }
      }
    }
    var entry = { canvas: cv, key: key, cx: cx, cy: cy };
    this._chunks.set(key, entry);
    this._chunkOrder.push(key);
    while (this._chunkOrder.length > MAX_CHUNKS) {
      var drop = this._chunkOrder.shift();
      this._chunks.delete(drop);
    }
    return entry;
  };

  World.prototype.chunkSpan = function () { return CHUNK_PX; };
  World.prototype.invalidateChunks = function () {
    if (this._chunks) { this._chunks.clear(); this._chunkOrder.length = 0; }
  };

  /* ---------------------------------------------------------- collision */
  /* Axis-separated resolution: move on X, push out, then move on Y. Simple,
   * stable, and it never lets an entity tunnel through a wall at any speed
   * the game can produce. */
  World.prototype.collide = function (ent, dx, dy, canSwim) {
    var r = ent.r;
    ent.x += dx;
    this.resolveAxis(ent, r, true, dx, canSwim);
    ent.y += dy;
    this.resolveAxis(ent, r, false, dy, canSwim);
    /* solid props */
    var near = this.queryProps(ent.x - 90, ent.y - 90, ent.x + 90, ent.y + 90, this._pscratch || (this._pscratch = []));
    for (var i = 0; i < near.length; i++) {
      var p = near[i];
      if (!p.solid || p.r <= 0) continue;
      var ddx = ent.x - p.x, ddy = ent.y - p.y;
      var rr = r + p.r;
      var d2 = ddx * ddx + ddy * ddy;
      if (d2 < rr * rr && d2 > 0.0001) {
        var d = Math.sqrt(d2), push = (rr - d);
        ent.x += ddx / d * push;
        ent.y += ddy / d * push;
      }
    }
    ent.x = M.clamp(ent.x, 8, this.px - 8);
    ent.y = M.clamp(ent.y, 8, this.px - 8);
  };

  World.prototype.resolveAxis = function (ent, r, isX, delta, canSwim) {
    if (delta === 0) return;
    var tx0 = Math.floor((ent.x - r) / TS), tx1 = Math.floor((ent.x + r) / TS);
    var ty0 = Math.floor((ent.y - r) / TS), ty1 = Math.floor((ent.y + r) / TS);
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        var t = this.tile(tx, ty);
        var pr = TP[t];
        if (!pr.solid) continue;
        if (canSwim && pr.liquid) continue;
        var bx = tx * TS, by = ty * TS;
        if (ent.x + r <= bx || ent.x - r >= bx + TS || ent.y + r <= by || ent.y - r >= by + TS) continue;
        if (isX) {
          if (delta > 0) ent.x = bx - r - 0.01; else ent.x = bx + TS + r + 0.01;
        } else {
          if (delta > 0) ent.y = by - r - 0.01; else ent.y = by + TS + r + 0.01;
        }
        return;
      }
    }
  };

  World.prototype.isWalkable = function (x, y) {
    var t = this.tileAtWorld(x, y);
    return !TP[t].solid;
  };

  /* ---------------------------------------------------------- minimap */
  var MINI_COLORS = null;
  function miniColorFor(t, biome) {
    if (!MINI_COLORS) {
      MINI_COLORS = {};
      MINI_COLORS[T.VOID] = '#0a0c14';
      MINI_COLORS[T.GRASS] = '#4f8f4a';
      MINI_COLORS[T.GRASS_DARK] = '#3a6f38';
      MINI_COLORS[T.FLOWERS] = '#67a85c';
      MINI_COLORS[T.MOSS] = '#3f7a52';
      MINI_COLORS[T.DIRT] = '#7a5b3c';
      MINI_COLORS[T.PATH] = '#b09a78';
      MINI_COLORS[T.BRIDGE] = '#9a7a52';
      MINI_COLORS[T.SAND] = '#d9c48a';
      MINI_COLORS[T.STONE] = '#7b7f88';
      MINI_COLORS[T.WATER] = '#3a86bd';
      MINI_COLORS[T.DEEP] = '#1c4a76';
      MINI_COLORS[T.SNOW] = '#e6eef8';
      MINI_COLORS[T.ICE] = '#a8d4e8';
      MINI_COLORS[T.LAVA] = '#ff7a2a';
      MINI_COLORS[T.EMBER] = '#6e3a26';
      MINI_COLORS[T.ASH] = '#4a4348';
      MINI_COLORS[T.VOIDROCK] = '#2a2340';
      MINI_COLORS[T.CRYSTAL] = '#4a72a4';
      MINI_COLORS[T.WOOD] = '#8a6440';
      MINI_COLORS[T.WALL] = '#3a3740';
      MINI_COLORS[T.RUBBLE] = '#6a6560';
      MINI_COLORS[T.CARPET] = '#8a2f4a';
      MINI_COLORS[T.MARBLE] = '#c8c4d4';
    }
    return MINI_COLORS[t] || '#555';
  }

  World.prototype.buildMinimap = function () {
    var n = this.size;
    var cv = RG.makeCanvas(n, n);
    var ctx = RG.ctxOf(cv);
    var img = ctx.createImageData(n, n);
    var data = img.data;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var t = this.tiles[y * n + x];
        var hex = miniColorFor(t, this.biome);
        var c = RG.Color.parseHex(hex);
        var o = (y * n + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
        data[o + 3] = t === T.VOID ? 0 : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.minimap = cv;
  };

  RG.World = World;
})(RG);
