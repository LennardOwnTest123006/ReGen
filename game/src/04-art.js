/* ReGen - procedural art. The game ships with zero image files: tiles,
 * props, creatures, characters and UI icons are all painted into offscreen
 * canvases at start-up from a handful of parameters. That gives every
 * biome a consistent palette, keeps the install tiny, and means there is
 * no such thing as a missing-texture bug. */
'use strict';
(function (RG) {
  var M = RG.M, C = RG.Color;
  var Art = RG.Art = {};

  /* ------------------------------------------------------------- tiles */
  var T = RG.TILE = {
    VOID: 0, GRASS: 1, GRASS_DARK: 2, DIRT: 3, PATH: 4, SAND: 5, STONE: 6,
    WATER: 7, DEEP: 8, SNOW: 9, ICE: 10, LAVA: 11, ASH: 12, VOIDROCK: 13,
    CRYSTAL: 14, WOOD: 15, WALL: 16, RUBBLE: 17, MOSS: 18, FLOWERS: 19,
    BRIDGE: 20, CARPET: 21, MARBLE: 22, EMBER: 23, COUNT: 24
  };

  /* per-tile behaviour, read by the physics and damage systems */
  var TP = RG.TILEPROPS = [];
  (function () {
    function def(id, o) { TP[id] = o; }
    def(T.VOID, { solid: true, name: 'void' });
    def(T.GRASS, { name: 'grass' });
    def(T.GRASS_DARK, { name: 'grass' });
    def(T.DIRT, { name: 'dirt' });
    def(T.PATH, { name: 'path', speed: 1.12 });
    def(T.SAND, { name: 'sand', speed: 0.92 });
    def(T.STONE, { name: 'stone' });
    def(T.WATER, { name: 'water', liquid: true, speed: 0.62 });
    def(T.DEEP, { name: 'deep water', solid: true, liquid: true });
    def(T.SNOW, { name: 'snow', speed: 0.9 });
    def(T.ICE, { name: 'ice', slippery: true, speed: 1.05 });
    def(T.LAVA, { name: 'lava', liquid: true, damage: 14, speed: 0.5, glow: '#ff7a2a' });
    def(T.ASH, { name: 'ash', speed: 0.95 });
    def(T.VOIDROCK, { name: 'void rock' });
    def(T.CRYSTAL, { name: 'crystal', glow: '#8ad6ff' });
    def(T.WOOD, { name: 'floor' });
    def(T.WALL, { solid: true, name: 'wall' });
    def(T.RUBBLE, { name: 'rubble', speed: 0.88 });
    def(T.MOSS, { name: 'moss' });
    def(T.FLOWERS, { name: 'flowers' });
    def(T.BRIDGE, { name: 'bridge' });
    def(T.CARPET, { name: 'carpet', speed: 1.05 });
    def(T.MARBLE, { name: 'marble', speed: 1.08 });
    def(T.EMBER, { name: 'embers', damage: 4, glow: '#ff9a3a' });
    for (var i = 0; i < T.COUNT; i++) if (!TP[i]) TP[i] = { name: 'ground' };
  })();

  /* Base colours per tile. Each biome tints these, which is what gives the
   * four worlds a distinct mood while sharing one generator. */
  var TILE_COLORS = {};
  TILE_COLORS[T.GRASS] = ['#4f8f4a', '#5aa055', '#437c3f'];
  TILE_COLORS[T.GRASS_DARK] = ['#3a6f38', '#457a41', '#2f5d2e'];
  TILE_COLORS[T.DIRT] = ['#7a5b3c', '#886847', '#6a4d32'];
  TILE_COLORS[T.PATH] = ['#a08a68', '#b09a78', '#8f7a58'];
  TILE_COLORS[T.SAND] = ['#d9c48a', '#e6d29a', '#c9b47a'];
  TILE_COLORS[T.STONE] = ['#7b7f88', '#8a8e96', '#6b6f78'];
  TILE_COLORS[T.WATER] = ['#2f74a8', '#3a86bd', '#276492'];
  TILE_COLORS[T.DEEP] = ['#1c4a76', '#22568a', '#153c62'];
  TILE_COLORS[T.SNOW] = ['#dfe8f2', '#eef4fb', '#cbd8e6'];
  TILE_COLORS[T.ICE] = ['#a8d4e8', '#bde2f2', '#8fc0d8'];
  TILE_COLORS[T.LAVA] = ['#d8471a', '#ff7a2a', '#a82f10'];
  TILE_COLORS[T.ASH] = ['#4a4348', '#575055', '#3d373b'];
  TILE_COLORS[T.VOIDROCK] = ['#2a2340', '#342b4e', '#1f1a30'];
  TILE_COLORS[T.CRYSTAL] = ['#3d5f8a', '#4a72a4', '#324f74'];
  TILE_COLORS[T.WOOD] = ['#8a6440', '#9a734c', '#775437'];
  TILE_COLORS[T.WALL] = ['#4a4650', '#565260', '#3a3740'];
  TILE_COLORS[T.RUBBLE] = ['#6a6560', '#78726c', '#5a5551'];
  TILE_COLORS[T.MOSS] = ['#3f7a52', '#4a8a5e', '#356847'];
  TILE_COLORS[T.FLOWERS] = ['#4f8f4a', '#5aa055', '#437c3f'];
  TILE_COLORS[T.BRIDGE] = ['#8a6a45', '#9a7a52', '#75583a'];
  TILE_COLORS[T.CARPET] = ['#6e2436', '#7d2c40', '#571b29'];
  TILE_COLORS[T.MARBLE] = ['#c8c4d4', '#d8d4e2', '#b4b0c2'];
  TILE_COLORS[T.EMBER] = ['#5a3020', '#6e3a26', '#472518'];

  /* A few tiles need a genuinely different material per biome, not just a
   * tint: basalt is not brown, and void stone is not grey. */
  var BIOME_TILE_COLORS = {
    ember: {},
    frost: {},
    voidr: {}
  };
  BIOME_TILE_COLORS.ember[T.ASH] = ['#3b3238', '#473c42', '#2c2429'];
  BIOME_TILE_COLORS.ember[T.STONE] = ['#463c44', '#52464e', '#352d34'];
  BIOME_TILE_COLORS.ember[T.DIRT] = ['#5c4038', '#6d4d43', '#472e29'];
  BIOME_TILE_COLORS.ember[T.SAND] = ['#a4855a', '#b59468', '#8c6f48'];
  BIOME_TILE_COLORS.ember[T.EMBER] = ['#5e2a18', '#7d3a1e', '#3d1a0f'];
  BIOME_TILE_COLORS.frost[T.STONE] = ['#6e7a8c', '#7d8898', '#5c6676'];
  BIOME_TILE_COLORS.frost[T.STONE] = ['#6e7a8c', '#7d8898', '#5c6676'];
  BIOME_TILE_COLORS.voidr[T.ASH] = ['#241d33', '#2e253f', '#1a1526'];
  BIOME_TILE_COLORS.voidr[T.MARBLE] = ['#584a78', '#665686', '#463a60'];
  BIOME_TILE_COLORS.voidr[T.STONE] = ['#3a3350', '#453d5e', '#2c2640'];

  var TILE_PX = 32;                 /* source resolution in the atlas */
  RG.TILE_SIZE = 24;                /* world units per tile */
  var VARIANTS = 8;
  Art.VARIANTS = VARIANTS;

  /* Tile texture. Three layers, coarse to fine: broad tonal patches give a
   * hand-painted feel at a distance, speckle gives grain up close, and the
   * per-variant tint stops a field of the same tile from banding. */
  function paintTile(ctx, x0, y0, colors, rng, style, variant) {
    var s = TILE_PX, i;
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors[0];
    ctx.fillRect(x0, y0, s, s);

    if (style === 'liquid') {
      for (i = 0; i < 7; i++) {
        ctx.globalAlpha = rng.range(0.08, 0.22);
        ctx.fillStyle = rng.chance(0.5) ? colors[1] : colors[2];
        ctx.fillRect(x0, y0 + rng.range(0, s - 3), s, rng.range(1.5, 4));
      }
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#ffffff';
      for (i = 0; i < 3; i++) {
        ctx.fillRect(x0 + rng.range(2, s - 10), y0 + rng.range(2, s - 3), rng.range(4, 9), 1.2);
      }
      ctx.globalAlpha = 1;
      return;
    }

    /* broad patches */
    var patches = style === 'smooth' ? 7 : 10;
    for (i = 0; i < patches; i++) {
      ctx.globalAlpha = rng.range(0.10, 0.26);
      ctx.fillStyle = rng.chance(0.5) ? colors[1] : colors[2];
      ctx.beginPath();
      ctx.ellipse(x0 + rng.range(-4, s + 4), y0 + rng.range(-4, s + 4),
        rng.range(4, 11), rng.range(3, 9), rng.range(0, 3), 0, M.TAU);
      ctx.fill();
    }

    /* grain */
    var n = style === 'smooth' ? 60 : (style === 'rough' ? 190 : 140);
    for (i = 0; i < n; i++) {
      ctx.globalAlpha = rng.range(0.08, 0.34);
      ctx.fillStyle = rng.chance(0.55) ? colors[1] : colors[2];
      ctx.fillRect(x0 + Math.floor(rng.range(0, s)), y0 + Math.floor(rng.range(0, s)),
        rng.chance(0.78) ? 1 : 2, rng.chance(0.78) ? 1 : 2);
    }

    if (style === 'grass') {
      for (i = 0; i < 16; i++) {
        ctx.globalAlpha = rng.range(0.14, 0.34);
        ctx.strokeStyle = rng.chance(0.5) ? colors[1] : colors[2];
        ctx.lineWidth = rng.range(0.7, 1.1);
        var gx = x0 + rng.range(2, s - 2), gy = y0 + rng.range(5, s - 1);
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.quadraticCurveTo(gx + rng.range(-1.5, 1.5), gy - 3, gx + rng.range(-2.4, 2.4), gy - rng.range(3.5, 7));
        ctx.stroke();
      }
    } else if (style === 'crack') {
      for (i = 0; i < 4; i++) {
        ctx.globalAlpha = rng.range(0.16, 0.4);
        ctx.strokeStyle = colors[2];
        ctx.lineWidth = rng.range(0.7, 1.5);
        ctx.beginPath();
        var cx = x0 + rng.range(0, s), cy = y0 + rng.range(0, s);
        ctx.moveTo(cx, cy);
        for (var k = 0; k < 3; k++) { cx += rng.range(-8, 8); cy += rng.range(-8, 8); ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
    } else if (style === 'rough') {
      /* wind ripples */
      for (i = 0; i < 5; i++) {
        ctx.globalAlpha = rng.range(0.06, 0.14);
        ctx.strokeStyle = rng.chance(0.5) ? colors[1] : colors[2];
        ctx.lineWidth = rng.range(1, 2);
        var ry = y0 + rng.range(2, s - 2);
        ctx.beginPath();
        ctx.moveTo(x0, ry);
        ctx.quadraticCurveTo(x0 + s * 0.5, ry + rng.range(-3, 3), x0 + s, ry + rng.range(-2, 2));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Biomes tint the shared tile palette. */
  var BIOMES = RG.BIOMES = {
    verdant: { tint: '#ffffff', tintAmt: 0, ambient: '#2a3550', light: 0.0, sky: '#7fb8e8' },
    ember: { tint: '#ff9060', tintAmt: 0.1, ambient: '#3a1c14', light: 0.28, sky: '#c86038' },
    frost: { tint: '#bcd8f0', tintAmt: 0.22, ambient: '#22304a', light: 0.2, sky: '#a8c8e4' },
    voidr: { tint: '#8060c0', tintAmt: 0.2, ambient: '#120c22', light: 0.55, sky: '#2a1c46' },
    hub: { tint: '#fff0d0', tintAmt: 0.06, ambient: '#2c3450', light: 0.0, sky: '#8cc4ee' },
    dungeon: { tint: '#9098b0', tintAmt: 0.18, ambient: '#0d1020', light: 0.72, sky: '#141826' }
  };

  var atlasCache = {};
  Art.atlas = function (biome) {
    if (atlasCache[biome]) return atlasCache[biome];
    var b = BIOMES[biome] || BIOMES.verdant;
    var cols = VARIANTS, rows = T.COUNT;
    var cv = RG.makeCanvas(cols * TILE_PX, rows * TILE_PX);
    var ctx = RG.ctxOf(cv);
    ctx.imageSmoothingEnabled = false;

    for (var t = 0; t < T.COUNT; t++) {
      var over = BIOME_TILE_COLORS[biome];
      var base = (over && over[t]) || TILE_COLORS[t];
      if (!base) continue;
      var colors = [
        C.mixHex(base[0], b.tint, b.tintAmt),
        C.mixHex(base[1], b.tint, b.tintAmt),
        C.mixHex(base[2], b.tint, b.tintAmt)
      ];
      var style = 'normal';
      if (t === T.GRASS || t === T.GRASS_DARK || t === T.MOSS || t === T.FLOWERS) style = 'grass';
      else if (t === T.WATER || t === T.DEEP || t === T.LAVA) style = 'liquid';
      else if (t === T.SNOW || t === T.ICE || t === T.MARBLE || t === T.CARPET) style = 'smooth';
      else if (t === T.STONE || t === T.WALL || t === T.VOIDROCK || t === T.RUBBLE) style = 'crack';
      else if (t === T.SAND || t === T.ASH || t === T.DIRT) style = 'rough';

      for (var v = 0; v < VARIANTS; v++) {
        var rng = new RG.Rng(RG.hashStr(biome + ':' + t + ':' + v));
        /* nudge each variant's tone so a large field never bands */
        var shift = (v - (VARIANTS - 1) * 0.5) * 0.009;
        var vc = [C.shade(colors[0], shift), C.shade(colors[1], shift), C.shade(colors[2], shift)];
        var ox = v * TILE_PX, oy = t * TILE_PX;
        /* Confine every stroke to its own cell. The texture deliberately
         * paints past the tile edge for an organic look, and unclipped that
         * spilled into the neighbouring cell - a different tile entirely. */
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, TILE_PX, TILE_PX);
        ctx.clip();
        paintTile(ctx, ox, oy, vc, rng, style, v);
        if (t === T.FLOWERS) {
          var fc = ['#f0d060', '#e8708a', '#c890f0', '#f0f0f0'];
          for (var f = 0; f < 4; f++) {
            ctx.fillStyle = fc[rng.int(0, 3)];
            ctx.globalAlpha = 0.95;
            var fx = ox + rng.range(4, TILE_PX - 4), fy = oy + rng.range(4, TILE_PX - 4);
            ctx.beginPath(); ctx.arc(fx, fy, rng.range(1.2, 2.1), 0, M.TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (t === T.WOOD || t === T.BRIDGE) {
          ctx.globalAlpha = 0.3; ctx.strokeStyle = colors[2]; ctx.lineWidth = 1;
          for (var p = 1; p < 4; p++) {
            ctx.beginPath(); ctx.moveTo(ox, oy + p * TILE_PX / 4); ctx.lineTo(ox + TILE_PX, oy + p * TILE_PX / 4); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        if (t === T.CRYSTAL) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#8ad6ff';
          RG.Draw.poly(ctx, ox + rng.range(8, 24), oy + rng.range(8, 24), rng.range(3, 6), 6, rng.range(0, 3));
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (t === T.EMBER) {
          ctx.globalAlpha = 0.75;
          for (var e = 0; e < 6; e++) {
            ctx.fillStyle = rng.chance(0.5) ? '#ff9a3a' : '#ffcf6a';
            ctx.fillRect(ox + rng.range(2, 29), oy + rng.range(2, 29), 1.5, 1.5);
          }
          ctx.globalAlpha = 1;
        }
        if (t === T.WALL) {
          /* brick courses read clearly even at small zoom */
          ctx.globalAlpha = 0.35; ctx.strokeStyle = '#00000060'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(ox, oy + 16); ctx.lineTo(ox + TILE_PX, oy + 16);
          ctx.moveTo(ox + (v % 2 ? 10 : 22), oy); ctx.lineTo(ox + (v % 2 ? 10 : 22), oy + 16);
          ctx.moveTo(ox + (v % 2 ? 22 : 10), oy + 16); ctx.lineTo(ox + (v % 2 ? 22 : 10), oy + TILE_PX);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
    }
    atlasCache[biome] = { canvas: cv, px: TILE_PX, variants: VARIANTS };
    return atlasCache[biome];
  };

  /* --------------------------------------------------------- characters */
  /* A skin is a bag of colours plus a handful of shape flags. Two dozen
   * flags multiply out into the whole wardrobe. */
  Art.drawCharacter = function (ctx, skin, o) {
    o = o || {};
    var t = o.t || 0;                       /* animation clock, seconds */
    var walk = o.walk || 0;                 /* 0..1 how fast we are moving */
    var facing = o.facing === undefined ? 1 : o.facing;  /* -1 left, 1 right */
    var scale = o.scale === undefined ? 1 : o.scale;
    var aim = o.aim === undefined ? 0 : o.aim;
    var attack = o.attack || 0;             /* 0..1 swing progress */
    var flash = o.flash || 0;

    var sk = skin || {};
    var col = sk.colors || {};
    var cSkin = col.skin || '#e8b98a';
    var cPrim = col.primary || '#4a7ac8';
    var cSec = col.secondary || '#2e4f88';
    var cAcc = col.accent || '#f0c860';
    var cHair = col.hair || '#3a2a20';
    var cTrim = col.trim || '#ffffff';

    ctx.save();
    ctx.scale(scale * facing, scale);

    var bob = Math.sin(t * (6 + walk * 7)) * (0.6 + walk * 1.4);
    var lean = walk * 1.2;

    /* ---- cape / wings behind the body ---- */
    if (sk.cape) {
      ctx.save();
      ctx.translate(0, -14);
      var sway = Math.sin(t * 4.2) * 2 + walk * 3;
      ctx.fillStyle = col.cape || cSec;
      ctx.beginPath();
      ctx.moveTo(-5, -6);
      ctx.quadraticCurveTo(-9 - sway * 0.4, 4, -6 - sway, 14);
      ctx.lineTo(6 - sway, 14);
      ctx.quadraticCurveTo(9 - sway * 0.4, 4, 5, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();
      ctx.restore();
    }
    if (sk.wings) {
      ctx.save();
      ctx.translate(0, -16);
      var flap = Math.sin(t * 7) * 0.28;
      for (var wSide = -1; wSide <= 1; wSide += 2) {
        ctx.save();
        ctx.scale(wSide, 1);
        ctx.rotate(-flap);
        ctx.fillStyle = col.wing || cAcc;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.moveTo(3, 0);
        ctx.quadraticCurveTo(14, -10, 17, 2);
        ctx.quadraticCurveTo(13, 3, 12, 9);
        ctx.quadraticCurveTo(8, 3, 3, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* ---- legs ---- */
    var legSwing = Math.sin(t * 11) * 3.4 * walk;
    ctx.fillStyle = col.legs || cSec;
    RG.Draw.roundRect(ctx, -4.6, -8 + bob * 0.2, 3.8, 8 + legSwing * 0.4, 1.6); ctx.fill();
    RG.Draw.roundRect(ctx, 0.8, -8 + bob * 0.2, 3.8, 8 - legSwing * 0.4, 1.6); ctx.fill();
    ctx.fillStyle = col.boots || C.shade(cSec, -0.35);
    RG.Draw.roundRect(ctx, -5, -2 + legSwing * 0.35, 4.4, 2.6, 1.2); ctx.fill();
    RG.Draw.roundRect(ctx, 0.6, -2 - legSwing * 0.35, 4.4, 2.6, 1.2); ctx.fill();

    /* ---- torso ---- */
    ctx.save();
    ctx.translate(0, bob * 0.5);
    ctx.rotate(lean * 0.02);
    ctx.fillStyle = cPrim;
    ctx.beginPath();
    ctx.moveTo(-6, -20);
    ctx.quadraticCurveTo(-7.2, -13, -5.4, -7.5);
    ctx.lineTo(5.4, -7.5);
    ctx.quadraticCurveTo(7.2, -13, 6, -20);
    ctx.closePath();
    ctx.fill();
    /* chest trim */
    ctx.fillStyle = cTrim;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-0.9, -20, 1.8, 12);
    ctx.globalAlpha = 1;
    if (sk.belt !== false) {
      ctx.fillStyle = col.belt || C.shade(cSec, -0.2);
      ctx.fillRect(-5.8, -10.2, 11.6, 2.4);
      ctx.fillStyle = cAcc;
      ctx.fillRect(-1.2, -10.4, 2.4, 2.8);
    }
    if (sk.emblem) {
      ctx.fillStyle = cAcc;
      RG.Draw.star(ctx, 0, -15.5, 2.6, 1.1, 4, t * 0.5);
      ctx.fill();
    }

    /* ---- arms ---- */
    var armAng = aim * facing;
    ctx.fillStyle = col.arms || cPrim;
    /* back arm */
    ctx.save();
    ctx.translate(-5.6, -17.5);
    ctx.rotate(-0.25 + Math.sin(t * 11 + 3.14) * 0.3 * walk);
    RG.Draw.roundRect(ctx, -1.7, 0, 3.4, 8.4, 1.6); ctx.fill();
    ctx.fillStyle = cSkin;
    ctx.beginPath(); ctx.arc(0, 8.6, 1.9, 0, M.TAU); ctx.fill();
    ctx.restore();

    /* ---- head ---- */
    ctx.save();
    ctx.translate(0, -20 + bob * 0.3);
    var headR = sk.bigHead ? 6.4 : 5.6;
    if (sk.hair !== 'none' && !sk.hood && !sk.helm) {
      ctx.fillStyle = cHair;
      ctx.beginPath();
      ctx.arc(0, -0.8, headR + 1.1, Math.PI * 1.05, Math.PI * 2.0);
      ctx.closePath();
      ctx.fill();
      if (sk.longHair) {
        ctx.beginPath();
        ctx.moveTo(-headR - 0.6, -1);
        ctx.quadraticCurveTo(-headR - 2.4, 6, -headR + 0.6, 8);
        ctx.lineTo(-headR + 2.6, 7);
        ctx.quadraticCurveTo(-headR + 1, 3, -headR + 1.4, -1);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(headR + 0.6, -1);
        ctx.quadraticCurveTo(headR + 2.4, 6, headR - 0.6, 8);
        ctx.lineTo(headR - 2.6, 7);
        ctx.quadraticCurveTo(headR - 1, 3, headR - 1.4, -1);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillStyle = col.head || cSkin;
    ctx.beginPath(); ctx.arc(0, 0, headR, 0, M.TAU); ctx.fill();

    if (sk.hood) {
      ctx.fillStyle = col.hood || cSec;
      ctx.beginPath();
      ctx.arc(0, -0.3, headR + 1.6, Math.PI * 0.92, Math.PI * 2.08);
      ctx.quadraticCurveTo(headR + 1.2, 3.4, 0, 3.9);
      ctx.quadraticCurveTo(-headR - 1.2, 3.4, -headR - 1.6, -0.3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath(); ctx.ellipse(0, 0.7, headR * 0.72, headR * 0.62, 0, 0, M.TAU); ctx.fill();
    }
    if (sk.helm) {
      ctx.fillStyle = col.helm || cSec;
      ctx.beginPath();
      ctx.arc(0, -0.5, headR + 1.1, Math.PI, M.TAU);
      ctx.lineTo(headR + 1.1, 1.4);
      ctx.lineTo(-headR - 1.1, 1.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = cAcc;
      ctx.fillRect(-0.8, -headR - 2.2, 1.6, 2.6);
      ctx.fillStyle = 'rgba(20,24,40,0.85)';
      ctx.fillRect(-headR + 0.6, 1.6, headR * 2 - 1.2, 2);
    }
    if (sk.mask) {
      ctx.fillStyle = col.mask || '#20242e';
      ctx.fillRect(-headR - 0.4, -1.4, headR * 2 + 0.8, 3.2);
      ctx.fillStyle = cAcc;
      ctx.fillRect(-3.1, -0.7, 1.5, 1.5);
      ctx.fillRect(1.6, -0.7, 1.5, 1.5);
    }
    if (!sk.mask && !(sk.hood && sk.faceless)) {
      /* eyes: a slow blink keeps idle animation alive */
      var blink = (Math.sin(t * 1.7) > 0.985) ? 0.18 : 1;
      ctx.fillStyle = col.eye || '#1a1c26';
      ctx.beginPath(); ctx.ellipse(-2.1, 0.2, 0.95, 1.25 * blink, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2.1, 0.2, 0.95, 1.25 * blink, 0, 0, M.TAU); ctx.fill();
      if (sk.glowEyes) {
        ctx.fillStyle = col.glow || cAcc;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(-2.1, 0.2, 1.5, 1.7 * blink, 0, 0, M.TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(2.1, 0.2, 1.5, 1.7 * blink, 0, 0, M.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (sk.horns) {
      ctx.fillStyle = col.horn || '#e8e0d0';
      for (var hs = -1; hs <= 1; hs += 2) {
        ctx.save(); ctx.scale(hs, 1);
        ctx.beginPath();
        ctx.moveTo(3.4, -4.2);
        ctx.quadraticCurveTo(7.4, -7.6, 6.2, -11.4);
        ctx.quadraticCurveTo(5.2, -8.2, 2.2, -5.6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    if (sk.ears) {
      ctx.fillStyle = col.ear || cHair;
      for (var es = -1; es <= 1; es += 2) {
        ctx.save(); ctx.scale(es, 1);
        ctx.beginPath();
        ctx.moveTo(2.6, -4.4); ctx.lineTo(5.4, -9.6); ctx.lineTo(6.4, -3.8);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    if (sk.crown) {
      ctx.fillStyle = col.crownColor || '#f3cd57';
      ctx.beginPath();
      ctx.moveTo(-5.2, -headR - 0.4);
      ctx.lineTo(-5.2, -headR - 4.2); ctx.lineTo(-2.6, -headR - 1.8);
      ctx.lineTo(0, -headR - 5); ctx.lineTo(2.6, -headR - 1.8);
      ctx.lineTo(5.2, -headR - 4.2); ctx.lineTo(5.2, -headR - 0.4);
      ctx.closePath(); ctx.fill();
    }
    if (sk.halo) {
      ctx.strokeStyle = col.haloColor || '#ffe9a0';
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, -headR - 4 + Math.sin(t * 2) * 0.5, 5.4, 1.7, 0, 0, M.TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();  /* head */

    /* ---- front arm + weapon ---- */
    ctx.save();
    ctx.translate(5.2, -17.2);
    var swing = attack > 0 ? Math.sin(attack * Math.PI) * 1.5 : 0;
    ctx.rotate(armAng * 0.55 - 0.2 - swing + Math.sin(t * 11) * 0.3 * walk);
    ctx.fillStyle = col.arms || cPrim;
    RG.Draw.roundRect(ctx, -1.7, 0, 3.4, 8.2, 1.6); ctx.fill();
    ctx.fillStyle = cSkin;
    ctx.beginPath(); ctx.arc(0, 8.6, 1.9, 0, M.TAU); ctx.fill();
    if (o.weapon !== false) Art.drawWeapon(ctx, sk.weapon || 'blade', col, 0, 8.6, t);
    ctx.restore();

    ctx.restore();  /* torso translate */

    if (flash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.85).toFixed(3) + ')';
      ctx.fillRect(-20, -40, 40, 44);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  };

  Art.drawWeapon = function (ctx, kind, col, x, y, t) {
    var metal = col.metal || '#d8dde8';
    var grip = col.grip || '#5a3f2a';
    var glow = col.weaponGlow || col.accent || '#7fe0ff';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    switch (kind) {
      case 'staff':
        ctx.fillStyle = grip; RG.Draw.roundRect(ctx, -0.9, -3, 1.8, 20, 0.9); ctx.fill();
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(0, 18.5, 2.6 + Math.sin(t * 4) * 0.3, 0, M.TAU); ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(0, 18.5, 4.6, 0, M.TAU); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      case 'bow':
        ctx.strokeStyle = grip; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 5, 7.5, -1.2, 1.2); ctx.stroke();
        ctx.strokeStyle = '#e8e4d8'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(2.7, -1.9); ctx.lineTo(2.7, 11.9); ctx.stroke();
        break;
      case 'scythe':
        ctx.fillStyle = grip; RG.Draw.roundRect(ctx, -0.9, -3, 1.8, 19, 0.9); ctx.fill();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.moveTo(0, 16);
        ctx.quadraticCurveTo(11, 15, 12, 5);
        ctx.quadraticCurveTo(8, 12, 0, 12.6);
        ctx.closePath(); ctx.fill();
        break;
      case 'hammer':
        ctx.fillStyle = grip; RG.Draw.roundRect(ctx, -1, -3, 2, 13, 1); ctx.fill();
        ctx.fillStyle = metal; RG.Draw.roundRect(ctx, -4.2, 9.5, 8.4, 5.4, 1.2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-4.2, 12, 8.4, 1.2);
        break;
      case 'dagger':
        ctx.fillStyle = grip; RG.Draw.roundRect(ctx, -0.9, -2.5, 1.8, 4.6, 0.9); ctx.fill();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.moveTo(-1.5, 2); ctx.lineTo(1.5, 2); ctx.lineTo(0.9, 9.5); ctx.lineTo(0, 11); ctx.lineTo(-0.9, 9.5);
        ctx.closePath(); ctx.fill();
        break;
      case 'orb':
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(0, 5 + Math.sin(t * 3) * 0.6, 3.1, 0, M.TAU); ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(0, 5, 5.4, 0, M.TAU); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      case 'greatsword':
        ctx.fillStyle = grip; RG.Draw.roundRect(ctx, -1, -3.5, 2, 5, 1); ctx.fill();
        ctx.fillStyle = col.guard || '#b9903c'; RG.Draw.roundRect(ctx, -4.4, 1.2, 8.8, 1.8, 0.8); ctx.fill();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.moveTo(-2.3, 3); ctx.lineTo(2.3, 3); ctx.lineTo(2.3, 15.5); ctx.lineTo(0, 18.5); ctx.lineTo(-2.3, 15.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-0.5, 3.5, 1, 12);
        break;
      default: /* blade */
        ctx.fillStyle = grip; RG.Draw.roundRect(ctx, -0.9, -3, 1.8, 4.4, 0.9); ctx.fill();
        ctx.fillStyle = col.guard || '#b9903c'; RG.Draw.roundRect(ctx, -3.4, 1, 6.8, 1.5, 0.7); ctx.fill();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.moveTo(-1.6, 2.4); ctx.lineTo(1.6, 2.4); ctx.lineTo(1.6, 12); ctx.lineTo(0, 14.4); ctx.lineTo(-1.6, 12);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-0.4, 3, 0.8, 8.6);
    }
    ctx.restore();
  };
})(RG);
