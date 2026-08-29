/* ReGen - dungeon generation. Rooms are placed with rejection sampling,
 * connected by an L-corridor spanning tree plus a couple of deliberate
 * loops (dead-end-only dungeons are miserable to backtrack through), then
 * populated with a key, a locked door and a descent. */
'use strict';
(function (RG) {
  var M = RG.M, T = RG.TILE;
  var TS = RG.TILE_SIZE;

  var ROOM_THEME = {
    0: { floor: T.WOOD, accent: T.CARPET },
    1: { floor: T.STONE, accent: T.RUBBLE },
    2: { floor: T.MARBLE, accent: T.CARPET }
  };

  RG.World.prototype.generateDungeon = function () {
    var def = this.def;
    var n = this.size;
    var rng = new RG.Rng(this.seed);
    var floor = def.floor || 1;
    var maxFloor = def.maxFloor || 3;
    var theme = ROOM_THEME[def.tier % 3] || ROOM_THEME[0];

    /* start solid, then carve */
    this.tiles.fill(T.WALL);
    for (var i = 0; i < this.decor.length; i++) this.decor[i] = i % 4;

    var rooms = [];
    var attempts = 0;
    var wanted = 9 + floor * 2 + def.tier;
    while (rooms.length < wanted && attempts++ < 900) {
      var w = rng.int(7, 14), h = rng.int(7, 12);
      var x = rng.int(2, n - w - 3), y = rng.int(2, n - h - 3);
      var pad = 2;
      var ok = true;
      for (var r = 0; r < rooms.length; r++) {
        var o = rooms[r];
        if (x - pad < o.x + o.w && x + w + pad > o.x && y - pad < o.y + o.h && y + h + pad > o.y) { ok = false; break; }
      }
      if (!ok) continue;
      rooms.push({ x: x, y: y, w: w, h: h, cx: x + (w >> 1), cy: y + (h >> 1), kind: 'normal', id: rooms.length });
    }
    if (rooms.length < 4) { /* degenerate seed - fall back to a simple ring */
      rooms.length = 0;
      for (var k = 0; k < 6; k++) {
        var a = k / 6 * M.TAU;
        var rx = Math.round(n / 2 + Math.cos(a) * n * 0.3) - 5;
        var ry = Math.round(n / 2 + Math.sin(a) * n * 0.3) - 5;
        rooms.push({ x: rx, y: ry, w: 10, h: 10, cx: rx + 5, cy: ry + 5, kind: 'normal', id: k });
      }
    }

    /* carve rooms */
    for (var ri = 0; ri < rooms.length; ri++) {
      var rm = rooms[ri];
      for (var yy = rm.y; yy < rm.y + rm.h; yy++) {
        for (var xx = rm.x; xx < rm.x + rm.w; xx++) {
          this.setTile(xx, yy, theme.floor);
        }
      }
    }

    /* connect: nearest-neighbour spanning tree + extra loops */
    var connected = [rooms[0]], pending = rooms.slice(1);
    var edges = [];
    while (pending.length) {
      var bestA = null, bestB = null, bestD = 1e9, bi = -1;
      for (var a2 = 0; a2 < connected.length; a2++) {
        for (var b2 = 0; b2 < pending.length; b2++) {
          var d = M.dist2(connected[a2].cx, connected[a2].cy, pending[b2].cx, pending[b2].cy);
          if (d < bestD) { bestD = d; bestA = connected[a2]; bestB = pending[b2]; bi = b2; }
        }
      }
      edges.push([bestA, bestB]);
      connected.push(bestB);
      pending.splice(bi, 1);
    }
    for (var loop = 0; loop < 3 && rooms.length > 4; loop++) {
      var ra = rng.pick(rooms), rb = rng.pick(rooms);
      if (ra !== rb) edges.push([ra, rb]);
    }
    for (var e = 0; e < edges.length; e++) this.carveCorridor(edges[e][0], edges[e][1], rng, theme);

    /* assign room roles by distance from the entrance */
    rooms[0].kind = 'start';
    var far = rooms[0], farD = -1;
    for (var f = 1; f < rooms.length; f++) {
      var dd = M.dist2(rooms[f].cx, rooms[f].cy, rooms[0].cx, rooms[0].cy);
      if (dd > farD) { farD = dd; far = rooms[f]; }
    }
    far.kind = (floor >= maxFloor) ? 'boss' : 'descent';

    var mid = null, midD = -1;
    for (var g = 1; g < rooms.length; g++) {
      if (rooms[g] === far) continue;
      var d2 = M.dist2(rooms[g].cx, rooms[g].cy, far.cx, far.cy);
      if (d2 > midD) { midD = d2; mid = rooms[g]; }
    }
    if (mid) mid.kind = 'key';

    var others = [];
    for (var h2 = 1; h2 < rooms.length; h2++) if (rooms[h2].kind === 'normal') others.push(rooms[h2]);
    rng.shuffle(others);
    for (var t2 = 0; t2 < Math.min(2, others.length); t2++) others[t2].kind = 'treasure';

    /* dress the rooms */
    this.rooms = rooms;
    var pal = { key: 'd', trunk: '#4a3a2a', leaf: '#3a5a3a', leafDark: '#2a4028', rock: '#6a6570', crystal: '#8ceaff', crystalLight: '#d0f4ff', accent: '#a87aff' };

    for (var q = 0; q < rooms.length; q++) {
      var room = rooms[q];
      var wx = (room.cx + 0.5) * TS, wy = (room.cy + 0.5) * TS;

      /* accent floor in the middle of larger rooms */
      if (room.w >= 9 && room.h >= 9) {
        for (var ay = room.cy - 2; ay <= room.cy + 2; ay++) {
          for (var ax = room.cx - 2; ax <= room.cx + 2; ax++) this.setTile(ax, ay, theme.accent);
        }
      }
      /* torches at the corners of every room: they are the light sources */
      var corners = [[room.x + 1, room.y + 1], [room.x + room.w - 2, room.y + 1],
      [room.x + 1, room.y + room.h - 2], [room.x + room.w - 2, room.y + room.h - 2]];
      for (var c2 = 0; c2 < corners.length; c2++) {
        if (!rng.chance(0.8)) continue;
        this.props.push({
          name: 'torch', seed: q * 10 + c2, x: (corners[c2][0] + 0.5) * TS, y: (corners[c2][1] + 0.5) * TS,
          r: 0, solid: false, light: '#ff9a3a', scale: 1
        });
      }

      if (room.kind === 'start') {
        this.spawn.x = wx; this.spawn.y = wy + TS;
        this.structures.push({ kind: 'portal', to: 'exit', x: wx, y: wy - TS * 0.5, r: 22, name: 'Ascent', prompt: 'Leave the dungeon' });
        this.props.push({ name: 'portal', seed: 1, x: wx, y: wy - TS * 0.5, r: 0, solid: false, light: '#a87aff', scale: 1 });
      } else if (room.kind === 'boss') {
        this.bossArena = { x: wx, y: wy, r: 160 };
        this.structures.push({
          kind: 'dungeonboss', x: wx, y: wy, r: 26, boss: 'boss_guardian',
          name: 'Dungeon Guardian', prompt: 'Wake the Guardian', used: false
        });
        for (var pi = 0; pi < 4; pi++) {
          this.props.push({
            name: 'pillar', seed: 40 + pi, x: wx + (pi % 2 ? 1 : -1) * TS * 2.5,
            y: wy + (pi < 2 ? -1 : 1) * TS * 2.5, r: 8, solid: true, scale: 1
          });
        }
      } else if (room.kind === 'descent') {
        this.structures.push({
          kind: 'descend', x: wx, y: wy, r: 22, locked: true,
          name: 'Sealed Stair', prompt: 'Descend to floor ' + (floor + 1)
        });
        this.props.push({ name: 'portal', seed: 2, x: wx, y: wy, r: 0, solid: false, light: '#8ceaff', scale: 1 });
      } else if (room.kind === 'key') {
        this.structures.push({
          kind: 'chest', x: wx, y: wy, r: 16, name: 'Warded Chest',
          prompt: 'Open the warded chest', used: false, quality: 'key'
        });
        this.props.push({ name: 'chest', seed: 3, x: wx, y: wy, r: 0, solid: false, scale: 1 });
      } else if (room.kind === 'treasure') {
        this.structures.push({
          kind: 'chest', x: wx, y: wy, r: 16, name: 'Vault Cache',
          prompt: 'Open the vault cache', used: false, quality: 'good'
        });
        this.props.push({ name: 'chest', seed: 4 + q, x: wx, y: wy, r: 0, solid: false, scale: 1 });
        this.props.push({ name: 'barrel', seed: 60 + q, x: wx - TS, y: wy + TS * 0.6, r: 7, solid: true, scale: 1 });
        this.props.push({ name: 'crate', seed: 61 + q, x: wx + TS, y: wy + TS * 0.6, r: 7, solid: true, scale: 1 });
      } else {
        /* ordinary rooms get clutter and an encounter zone */
        var clutter = rng.int(1, 4);
        for (var cl = 0; cl < clutter; cl++) {
          var px = (room.x + rng.int(1, room.w - 2) + 0.5) * TS;
          var py = (room.y + rng.int(1, room.h - 2) + 0.5) * TS;
          var name = rng.pick(['barrel', 'crate', 'bones', 'rock', 'statue']);
          this.props.push({
            name: name, seed: 200 + q * 7 + cl, x: px, y: py,
            r: (name === 'bones') ? 0 : 7, solid: name !== 'bones', scale: 1
          });
        }
        this.spawnZones.push({ x: wx, y: wy, r: Math.max(room.w, room.h) * TS * 0.6 });
        if (rng.chance(0.35)) {
          this.structures.push({
            kind: 'chest', x: wx + TS * 1.5, y: wy - TS, r: 16, name: 'Cache',
            prompt: 'Open the cache', used: false, quality: 'normal'
          });
          this.props.push({ name: 'chest', seed: 500 + q, x: wx + TS * 1.5, y: wy - TS, r: 0, solid: false, scale: 1 });
        }
      }
    }
    this.pal = pal;
    this.atlas = RG.Art.atlas('dungeon');
    this.floor = floor;
    this.maxFloor = maxFloor;
  };

  RG.World.prototype.carveCorridor = function (a, b, rng, theme) {
    var x = a.cx, y = a.cy;
    var horizFirst = rng.chance(0.5);
    var wide = rng.chance(0.3) ? 2 : 1;
    var self = this;
    function carve(cx, cy) {
      for (var dy = 0; dy < wide; dy++) {
        for (var dx = 0; dx < wide; dx++) {
          self.setTile(cx + dx, cy + dy, theme.floor);
        }
      }
    }
    if (horizFirst) {
      while (x !== b.cx) { x += M.sign(b.cx - x); carve(x, y); }
      while (y !== b.cy) { y += M.sign(b.cy - y); carve(x, y); }
    } else {
      while (y !== b.cy) { y += M.sign(b.cy - y); carve(x, y); }
      while (x !== b.cx) { x += M.sign(b.cx - x); carve(x, y); }
    }
  };

  /* ------------------------------------------------------------ arena */
  /* Blight Arena: one round room, four pillars, no way out but winning.
     Shares the dungeon tile set so it needs no new art. */
  RG.World.prototype.generateArena = function () {
    var n = this.size, T2 = T;
    var mid = n * 0.5;
    var rad = n * 0.42;
    this.tiles.fill(T2.WALL);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var d = Math.sqrt((x - mid) * (x - mid) + (y - mid) * (y - mid));
        if (d < rad) this.tiles[y * n + x] = d < rad * 0.34 ? T2.MARBLE : T2.STONE;
        this.decor[y * n + x] = (x * 7 + y * 3) % 4;
      }
    }
    var TSz = TS;
    this.spawn.x = mid * TSz; this.spawn.y = mid * TSz;
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * M.TAU;
      this.props.push({
        name: 'pillar', seed: i, scale: 1,
        x: (mid + Math.cos(a) * rad * 0.62) * TSz,
        y: (mid + Math.sin(a) * rad * 0.62) * TSz,
        r: 9, solid: true
      });
      this.props.push({
        name: 'torch', seed: 40 + i, scale: 1,
        x: (mid + Math.cos(a + 0.39) * rad * 0.88) * TSz,
        y: (mid + Math.sin(a + 0.39) * rad * 0.88) * TSz,
        r: 0, solid: false, light: '#ff9a3a'
      });
    }
    this.spawnZones.push({ x: mid * TSz, y: mid * TSz, r: rad * TSz * 0.8 });
    this.arenaCenter = { x: mid * TSz, y: mid * TSz, r: rad * TSz };
    this.atlas = RG.Art.atlas('dungeon');
    this.pal = { key: 'd', trunk: '#4a3a2a', leaf: '#3a5a3a', leafDark: '#2a4028', rock: '#6a6570', crystal: '#8ceaff', crystalLight: '#d0f4ff', accent: '#a87aff' };
    this.floor = 1; this.maxFloor = 1;
  };

  RG.makeArena = function (seed) {
    return new RG.World({
      id: 'arena', kind: 'arena', name: 'Blight Arena',
      biome: 'dungeon', music: 'boss', size: 46, level: 1, density: 2
    }, seed);
  };

  /* Factory used by the game when the player steps into a rift. */
  RG.makeDungeon = function (seed, tier, floor, maxFloor) {
    var def = {
      id: 'dungeon', kind: 'dungeon', name: 'Rift Depths',
      biome: 'dungeon', music: 'dungeon',
      size: 72 + tier * 6 + floor * 4,
      tier: tier || 0, floor: floor || 1, maxFloor: maxFloor || 3,
      level: 1, density: 1.5
    };
    return new RG.World(def, seed);
  };
})(RG);
