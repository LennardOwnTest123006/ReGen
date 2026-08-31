/* ReGen - procedural creature, prop and icon art. Everything here is baked
 * once into offscreen canvases and then blitted, so a screen full of forty
 * enemies costs forty drawImage calls rather than six hundred path ops. */
'use strict';
(function (RG) {
  var M = RG.M, C = RG.Color, D = RG.Draw;
  var Art = RG.Art;

  var SPR = 96;           /* baked sprite canvas size */
  var GROUND = 84;        /* y of the creature's feet inside that canvas */
  var spriteCache = {};

  /* Finds the non-transparent bounds of a baked frame. Creature and prop
   * art occupies well under half of its sheet; blitting only the used
   * rectangle removes most of the fill cost of a crowded screen. */
  function trimBounds(cv) {
    var w = cv.width, h = cv.height;
    try {
      var data = RG.ctxOf(cv).getImageData(0, 0, w, h).data;
      var minX = w, minY = h, maxX = -1, maxY = -1;
      for (var y = 0; y < h; y++) {
        var row = y * w * 4;
        for (var x = 0; x < w; x++) {
          if (data[row + x * 4 + 3] > 3) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return { x: 0, y: 0, w: 1, h: 1 };
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } catch (e) {
      /* a tainted or unreadable canvas simply skips the optimisation */
      return { x: 0, y: 0, w: w, h: h };
    }
  }

  function bake(key, frames, drawFn, w, h) {
    if (spriteCache[key]) return spriteCache[key];
    w = w || SPR; h = h || SPR;
    var out = { frames: [], trims: [], w: w, h: h, ox: w * 0.5, oy: GROUND * (h / SPR) };
    for (var i = 0; i < frames; i++) {
      var cv = RG.makeCanvas(w, h);
      var ctx = RG.ctxOf(cv);
      ctx.translate(w * 0.5, out.oy);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      drawFn(ctx, i / frames, i);
      out.frames.push(cv);
      out.trims.push(trimBounds(cv));
    }
    spriteCache[key] = out;
    return out;
  }

  /* Blit a baked frame with its origin at the current transform origin. */
  Art.blit = function (ctx, spr, index) {
    var i = index % spr.frames.length;
    if (i < 0) i += spr.frames.length;
    var t = spr.trims[i];
    ctx.drawImage(spr.frames[i], t.x, t.y, t.w, t.h,
      t.x - spr.ox, t.y - spr.oy, t.w, t.h);
  };
  Art.clearSpriteCache = function () { spriteCache = {}; };

  /* --------------------------------------------------------- creatures */
  /* Each creature is a small routine over a palette. `p` gives the four
   * colours; `t` is normalised animation phase 0..1. */
  var CREATURE = {
    slime: function (ctx, t, p) {
      var squash = 1 + Math.sin(t * M.TAU) * 0.14;
      var w = 15 / squash, h = 13 * squash;
      ctx.fillStyle = p.main;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.quadraticCurveTo(-w, -h * 1.7, 0, -h * 1.7);
      ctx.quadraticCurveTo(w, -h * 1.7, w, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath(); ctx.ellipse(-w * 0.35, -h * 1.05, w * 0.26, h * 0.3, -0.5, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.dark;
      ctx.beginPath(); ctx.ellipse(-4.4, -h * 0.95, 1.7, 2.1, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4.4, -h * 0.95, 1.7, 2.1, 0, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(0, -h * 0.5, 2.2, 0, M.TAU); ctx.fill();
    },
    bat: function (ctx, t, p) {
      var flap = Math.sin(t * M.TAU) * 0.9;
      var hover = Math.sin(t * M.TAU) * 2;
      ctx.translate(0, -16 + hover);
      ctx.fillStyle = p.dark;
      for (var s = -1; s <= 1; s += 2) {
        ctx.save(); ctx.scale(s, 1); ctx.rotate(flap * 0.5);
        ctx.beginPath();
        ctx.moveTo(3, -2);
        ctx.quadraticCurveTo(13, -9 - flap * 4, 18, -1);
        ctx.quadraticCurveTo(13, 0, 12, 5);
        ctx.quadraticCurveTo(9, 0, 3, 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = p.main;
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 6.6, 0, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.dark;
      ctx.beginPath(); ctx.moveTo(-4.5, -4); ctx.lineTo(-2, -9.5); ctx.lineTo(-0.6, -4.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(4.5, -4); ctx.lineTo(2, -9.5); ctx.lineTo(0.6, -4.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(-2.2, -0.4, 1.5, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(2.2, -0.4, 1.5, 0, M.TAU); ctx.fill();
    },
    skeleton: function (ctx, t, p) {
      var sway = Math.sin(t * M.TAU) * 1.6;
      ctx.strokeStyle = p.main; ctx.fillStyle = p.main; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-1.6, -9); ctx.moveTo(3, 0); ctx.lineTo(1.6, -9); ctx.stroke();
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(sway * 0.3, -20); ctx.stroke();
      ctx.lineWidth = 2.2;
      for (var r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.moveTo(-3.6, -12 - r * 2.6); ctx.lineTo(3.6, -12 - r * 2.6);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-3.4, -19); ctx.lineTo(-7.5 - sway, -13); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3.4, -19); ctx.lineTo(7.5 + sway, -13); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sway * 0.3, -24.5, 5.2, 5.6, 0, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.dark;
      ctx.beginPath(); ctx.ellipse(sway * 0.3 - 2, -25, 1.6, 2, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sway * 0.3 + 2, -25, 1.6, 2, 0, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(sway * 0.3 - 2, -25, 1, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(sway * 0.3 + 2, -25, 1, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    },
    imp: function (ctx, t, p) {
      var bob = Math.sin(t * M.TAU) * 1.6;
      ctx.translate(0, bob);
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -4.4, -9, 3.4, 9, 1.4); ctx.fill();
      D.roundRect(ctx, 1, -9, 3.4, 9, 1.4); ctx.fill();
      ctx.fillStyle = p.main;
      ctx.beginPath();
      ctx.moveTo(-6, -20); ctx.quadraticCurveTo(-7, -12, -5, -8);
      ctx.lineTo(5, -8); ctx.quadraticCurveTo(7, -12, 6, -20);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -24, 6.4, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.accent;
      for (var s = -1; s <= 1; s += 2) {
        ctx.save(); ctx.scale(s, 1);
        ctx.beginPath(); ctx.moveTo(3.6, -27.5); ctx.quadraticCurveTo(7.4, -31, 6.2, -34.5);
        ctx.quadraticCurveTo(5, -31, 2.4, -29); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#12141c';
      ctx.beginPath(); ctx.ellipse(-2.4, -24.4, 1.5, 1.9, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2.4, -24.4, 1.5, 1.9, 0, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(-2.4, -24.4, 0.85, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(2.4, -24.4, 0.85, 0, M.TAU); ctx.fill();
      ctx.strokeStyle = p.main; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-5, -19); ctx.lineTo(-9 - Math.sin(t * M.TAU) * 2, -14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, -19); ctx.lineTo(9 + Math.sin(t * M.TAU) * 2, -14); ctx.stroke();
    },
    golem: function (ctx, t, p) {
      var step = Math.sin(t * M.TAU) * 2.2;
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -7.5, -11, 6, 11, 2); ctx.fill();
      D.roundRect(ctx, 1.5, -11, 6, 11, 2); ctx.fill();
      ctx.fillStyle = p.main;
      ctx.beginPath();
      ctx.moveTo(-11, -30); ctx.lineTo(11, -30); ctx.lineTo(9, -10); ctx.lineTo(-9, -10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -16, -28 + step, 5.5, 17, 2.4); ctx.fill();
      D.roundRect(ctx, 10.5, -28 - step, 5.5, 17, 2.4); ctx.fill();
      ctx.fillStyle = p.main;
      D.roundRect(ctx, -7, -40, 14, 11, 3); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.95;
      ctx.fillRect(-4.6, -36.5, 3.4, 2.4);
      ctx.fillRect(1.2, -36.5, 3.4, 2.4);
      D.poly(ctx, 0, -21, 4.2, 6, t * M.TAU * 0.2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-8, -22); ctx.lineTo(-3, -19); ctx.moveTo(8, -25); ctx.lineTo(4, -21); ctx.stroke();
    },
    spider: function (ctx, t, p) {
      var leg = Math.sin(t * M.TAU) * 2.4;
      ctx.strokeStyle = p.dark; ctx.lineWidth = 1.9;
      for (var i = 0; i < 4; i++) {
        var yy = -7 - i * 1.4, sp = (i % 2 ? leg : -leg);
        for (var s = -1; s <= 1; s += 2) {
          ctx.beginPath();
          ctx.moveTo(s * 4, yy);
          ctx.lineTo(s * (11 + i), yy - 4 + sp);
          ctx.lineTo(s * (14 + i * 1.4), yy + 5 - sp * 0.5);
          ctx.stroke();
        }
      }
      ctx.fillStyle = p.main;
      ctx.beginPath(); ctx.ellipse(0, -8, 8.6, 7.4, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -16, 5.4, 4.6, 0, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(-2.4, -17.4, 1.5, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(2.4, -17.4, 1.5, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(-4.6, -15.4, 1, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4.6, -15.4, 1, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.dark;
      D.star(ctx, 0, -8, 4.4, 1.9, 4, 0.4); ctx.fill();
    },
    shade: function (ctx, t, p) {
      var drift = Math.sin(t * M.TAU) * 2.4;
      ctx.translate(0, -14 + drift);
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = p.main;
      ctx.beginPath();
      ctx.moveTo(-9, -4);
      ctx.quadraticCurveTo(-10, -18, 0, -18);
      ctx.quadraticCurveTo(10, -18, 9, -4);
      ctx.quadraticCurveTo(6, 8 + drift, 3, 4);
      ctx.quadraticCurveTo(0, 10 - drift, -3, 4);
      ctx.quadraticCurveTo(-6, 8 + drift, -9, -4);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.ellipse(-3.2, -10, 1.9, 2.6, 0.2, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3.2, -10, 1.9, 2.6, -0.2, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.ellipse(-3.2, -10, 3.4, 4.2, 0.2, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3.2, -10, 3.4, 4.2, -0.2, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    },
    wolf: function (ctx, t, p) {
      var run = Math.sin(t * M.TAU) * 2.6;
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -8, -8 + run * 0.3, 3.2, 8, 1.4); ctx.fill();
      D.roundRect(ctx, 5, -8 - run * 0.3, 3.2, 8, 1.4); ctx.fill();
      D.roundRect(ctx, -3, -7 - run * 0.3, 3, 7, 1.4); ctx.fill();
      D.roundRect(ctx, 0.6, -7 + run * 0.3, 3, 7, 1.4); ctx.fill();
      ctx.fillStyle = p.main;
      ctx.beginPath(); ctx.ellipse(0, -12, 11, 6.4, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9, -16, 6, 5, -0.25, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(12, -16); ctx.lineTo(17.5, -14.5); ctx.lineTo(12.6, -12.2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6.6, -19.5); ctx.lineTo(8, -25); ctx.lineTo(10.4, -20); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10.6, -19.6); ctx.lineTo(12.6, -24.4); ctx.lineTo(13.6, -19.2); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-10, -13);
      ctx.quadraticCurveTo(-18 - run, -17, -16 - run * 1.4, -22);
      ctx.quadraticCurveTo(-13, -17, -8, -15);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(11, -17.4, 1.4, 0, M.TAU); ctx.fill();
      ctx.fillStyle = '#f4f4f4';
      ctx.beginPath(); ctx.moveTo(15, -13.6); ctx.lineTo(16.4, -11); ctx.lineTo(13.8, -12.4); ctx.closePath(); ctx.fill();
    },
    turret: function (ctx, t, p) {
      var pulse = 1 + Math.sin(t * M.TAU) * 0.1;
      ctx.fillStyle = p.dark;
      D.poly(ctx, 0, -6, 10, 6, 0.26); ctx.fill();
      ctx.fillStyle = p.main;
      D.poly(ctx, 0, -16, 8.4 * pulse, 6, t * M.TAU * 0.15); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.9;
      D.poly(ctx, 0, -16, 4.4 * pulse, 6, -t * M.TAU * 0.3); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(0, -16, 11 * pulse, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    },
    knight: function (ctx, t, p) {
      var step = Math.sin(t * M.TAU) * 2;
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -5.4, -10 + step * 0.3, 4.4, 10, 1.6); ctx.fill();
      D.roundRect(ctx, 1, -10 - step * 0.3, 4.4, 10, 1.6); ctx.fill();
      ctx.fillStyle = p.main;
      ctx.beginPath();
      ctx.moveTo(-8, -27); ctx.quadraticCurveTo(-9.6, -16, -6.6, -9);
      ctx.lineTo(6.6, -9); ctx.quadraticCurveTo(9.6, -16, 8, -27);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.fillRect(-1.2, -27, 2.4, 17);
      ctx.fillStyle = p.main;
      D.roundRect(ctx, -11.4, -27, 5, 12, 2); ctx.fill();
      D.roundRect(ctx, 6.4, -27, 5, 12, 2); ctx.fill();
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -6.4, -38, 12.8, 11.6, 3); ctx.fill();
      ctx.fillStyle = '#0d0f18';
      ctx.fillRect(-4.6, -33.5, 9.2, 2.6);
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(2.4, -38); ctx.lineTo(-2.4, -38); ctx.closePath(); ctx.fill();
      /* sword arm */
      ctx.save(); ctx.translate(10, -22 + step); ctx.rotate(-0.5);
      ctx.fillStyle = '#c8ccd8';
      ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.lineTo(1.6, 0); ctx.lineTo(1.6, -15); ctx.lineTo(0, -18); ctx.lineTo(-1.6, -15);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    },
    flame: function (ctx, t, p) {
      var w = Math.sin(t * M.TAU);
      ctx.translate(0, -12 + w * 1.6);
      for (var l = 0; l < 3; l++) {
        var sc = 1 - l * 0.26;
        ctx.globalAlpha = 0.55 + l * 0.2;
        ctx.fillStyle = l === 0 ? p.dark : (l === 1 ? p.main : p.accent);
        ctx.beginPath();
        ctx.moveTo(0, 10 * sc);
        ctx.quadraticCurveTo(-11 * sc, 2 * sc, -6 * sc, -8 * sc);
        ctx.quadraticCurveTo(-4 * sc, -14 * sc + w * 2, 0, -20 * sc + w * 3);
        ctx.quadraticCurveTo(4 * sc, -14 * sc - w * 2, 6 * sc, -8 * sc);
        ctx.quadraticCurveTo(11 * sc, 2 * sc, 0, 10 * sc);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2a1008';
      ctx.beginPath(); ctx.arc(-2.6, -8, 1.4, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(2.6, -8, 1.4, 0, M.TAU); ctx.fill();
    },
    wisp: function (ctx, t, p) {
      var pulse = 1 + Math.sin(t * M.TAU) * 0.18;
      ctx.translate(0, -18 + Math.sin(t * M.TAU) * 3);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(0, 0, 13 * pulse, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = p.main;
      D.star(ctx, 0, 0, 9 * pulse, 3.4, 5, t * M.TAU * 0.4); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 3.2 * pulse, 0, M.TAU); ctx.fill();
    },
    crab: function (ctx, t, p) {
      var pinch = Math.abs(Math.sin(t * M.TAU)) * 0.5;
      ctx.strokeStyle = p.dark; ctx.lineWidth = 2;
      for (var s = -1; s <= 1; s += 2) {
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(s * 6, -6 - i * 2);
          ctx.lineTo(s * (12 + i * 2), -2 - i * 3);
          ctx.stroke();
        }
      }
      ctx.fillStyle = p.main;
      ctx.beginPath(); ctx.ellipse(0, -10, 11, 7.6, 0, 0, M.TAU); ctx.fill();
      for (var cs = -1; cs <= 1; cs += 2) {
        ctx.save(); ctx.translate(cs * 12, -15); ctx.rotate(cs * (0.4 - pinch));
        ctx.fillStyle = p.main;
        ctx.beginPath(); ctx.ellipse(0, 0, 5.4, 3.6, 0, 0, M.TAU); ctx.fill();
        ctx.fillStyle = p.dark;
        ctx.beginPath(); ctx.moveTo(2, -1); ctx.lineTo(8, -3.4); ctx.lineTo(7, 0.4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#12141c';
      ctx.beginPath(); ctx.arc(-3.6, -14.4, 1.9, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3.6, -14.4, 1.9, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(-3.6, -14.4, 0.9, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3.6, -14.4, 0.9, 0, M.TAU); ctx.fill();
    },
    /* --------- bosses: bigger silhouettes with readable tells --------- */
    warden: function (ctx, t, p) {
      var sway = Math.sin(t * M.TAU) * 2.6;
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -13, -18, 10, 18, 3); ctx.fill();
      D.roundRect(ctx, 3, -18, 10, 18, 3); ctx.fill();
      ctx.fillStyle = p.main;
      ctx.beginPath();
      ctx.moveTo(-18, -52); ctx.quadraticCurveTo(-22, -30, -15, -16);
      ctx.lineTo(15, -16); ctx.quadraticCurveTo(22, -30, 18, -52);
      ctx.quadraticCurveTo(0, -58, -18, -52);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = p.dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-8, -50); ctx.quadraticCurveTo(-4, -34, -9, -20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -50); ctx.quadraticCurveTo(5, -34, 10, -20); ctx.stroke();
      ctx.fillStyle = p.main;
      D.roundRect(ctx, -30 - sway, -50, 11, 30, 5); ctx.fill();
      D.roundRect(ctx, 19 + sway, -50, 11, 30, 5); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.ellipse(-7, -44, 3.4, 4.2, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7, -44, 3.4, 4.2, 0, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(0, -36, 9 + sway, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      /* canopy */
      ctx.fillStyle = p.canopy || p.accent;
      for (var i = 0; i < 5; i++) {
        var a = -Math.PI + i * (Math.PI / 4);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 17, -56 + Math.sin(a) * 7 + sway * 0.4, 11, 0, M.TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    colossus: function (ctx, t, p) {
      var glow = 0.6 + Math.sin(t * M.TAU) * 0.4;
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -14, -20, 11, 20, 3); ctx.fill();
      D.roundRect(ctx, 3, -20, 11, 20, 3); ctx.fill();
      ctx.fillStyle = p.main;
      ctx.beginPath();
      ctx.moveTo(-20, -54); ctx.lineTo(20, -54); ctx.lineTo(15, -18); ctx.lineTo(-15, -18);
      ctx.closePath(); ctx.fill();
      D.roundRect(ctx, -32, -52, 12, 32, 4); ctx.fill();
      D.roundRect(ctx, 20, -52, 12, 32, 4); ctx.fill();
      ctx.fillStyle = p.dark;
      D.roundRect(ctx, -11, -70, 22, 18, 5); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = glow;
      ctx.fillRect(-7.4, -64, 5.4, 3.6);
      ctx.fillRect(2, -64, 5.4, 3.6);
      for (var i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-10 + i * 6.6, -40 + (i % 2) * 8, 3.2, 0, M.TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(0, -40, 24 * (0.8 + glow * 0.3), 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    },
    tyrant: function (ctx, t, p) {
      var hover = Math.sin(t * M.TAU) * 3;
      ctx.translate(0, hover - 6);
      ctx.fillStyle = p.main;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.quadraticCurveTo(-20, -10, -16, -40);
      ctx.quadraticCurveTo(0, -50, 16, -40);
      ctx.quadraticCurveTo(20, -10, 0, 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.dark;
      for (var s = -1; s <= 1; s += 2) {
        ctx.save(); ctx.scale(s, 1);
        ctx.beginPath();
        ctx.moveTo(12, -34);
        ctx.quadraticCurveTo(30, -46, 34, -22);
        ctx.quadraticCurveTo(22, -30, 12, -26);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.ellipse(-6, -36, 3.4, 4.6, 0.2, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6, -36, 3.4, 4.6, -0.2, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#eaf6ff';
      for (var i = 0; i < 5; i++) {
        var x = -14 + i * 7;
        ctx.beginPath();
        ctx.moveTo(x, -48); ctx.lineTo(x + 3, -62 - (i % 2) * 6); ctx.lineTo(x + 6, -48);
        ctx.closePath(); ctx.fill();
      }
    },
    sovereign: function (ctx, t, p) {
      var pulse = Math.sin(t * M.TAU);
      ctx.translate(0, -20 + pulse * 3);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.main;
      ctx.beginPath();
      ctx.moveTo(-16, 12);
      ctx.quadraticCurveTo(-24, -18, 0, -34);
      ctx.quadraticCurveTo(24, -18, 16, 12);
      ctx.quadraticCurveTo(8, 22 + pulse * 3, 0, 14);
      ctx.quadraticCurveTo(-8, 22 - pulse * 3, -16, 12);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.accent; ctx.lineWidth = 2;
      for (var r = 0; r < 3; r++) {
        ctx.globalAlpha = 0.5 - r * 0.12;
        ctx.beginPath();
        ctx.ellipse(0, -10, 26 + r * 8 + pulse * 4, 9 + r * 3, pulse * 0.2, 0, M.TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.accent;
      D.star(ctx, 0, -14, 7 + pulse, 2.6, 6, t * M.TAU * 0.5); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, -14, 2.6, 0, M.TAU); ctx.fill();
      ctx.fillStyle = p.dark;
      ctx.beginPath();
      ctx.moveTo(-10, -34); ctx.lineTo(-6, -46); ctx.lineTo(0, -38); ctx.lineTo(6, -46); ctx.lineTo(10, -34);
      ctx.closePath(); ctx.fill();
    },
    guardian: function (ctx, t, p) {
      var spin = t * M.TAU;
      ctx.translate(0, -26);
      ctx.fillStyle = p.dark;
      D.poly(ctx, 0, 0, 20, 6, spin * 0.2); ctx.fill();
      ctx.fillStyle = p.main;
      D.poly(ctx, 0, 0, 14, 6, -spin * 0.35); ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.9;
      D.poly(ctx, 0, 0, 7, 3, spin); ctx.fill();
      ctx.globalAlpha = 0.4;
      for (var i = 0; i < 3; i++) {
        var a = spin + i * M.TAU / 3;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 26, Math.sin(a) * 12, 5, 0, M.TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  /* Palettes chosen per enemy archetype and biome variant. */
  Art.creatureSprite = function (kind, palette, frames, scale) {
    frames = frames || 8;
    scale = scale || 1;
    var key = 'c:' + kind + ':' + palette.main + palette.dark + palette.accent + ':' + scale;
    var fn = CREATURE[kind] || CREATURE.slime;
    var size = Math.ceil(SPR * Math.max(1, scale));
    return bake(key, frames, function (ctx, t) {
      ctx.save();
      ctx.scale(scale, scale);
      fn(ctx, t, palette);
      ctx.restore();
    }, size, size);
  };

  /* -------------------------------------------------------------- props */
  var PROP = {
    tree: function (ctx, r, p) {
      ctx.fillStyle = p.trunk;
      D.roundRect(ctx, -3.4, -18, 6.8, 18, 2); ctx.fill();
      var lay = [[0, -26, 15], [-9, -33, 12], [9, -33, 12], [0, -40, 13]];
      for (var i = 0; i < lay.length; i++) {
        ctx.fillStyle = i % 2 ? p.leafDark : p.leaf;
        ctx.beginPath();
        ctx.arc(lay[i][0] + r.range(-2, 2), lay[i][1] + r.range(-2, 2), lay[i][2] + r.range(-1.5, 1.5), 0, M.TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(-6, -42, 7, 0, M.TAU); ctx.fill();
    },
    pine: function (ctx, r, p) {
      ctx.fillStyle = p.trunk;
      D.roundRect(ctx, -2.6, -14, 5.2, 14, 1.6); ctx.fill();
      for (var i = 0; i < 4; i++) {
        var y = -12 - i * 10, w = 17 - i * 3.4;
        ctx.fillStyle = i % 2 ? p.leafDark : p.leaf;
        ctx.beginPath();
        ctx.moveTo(-w, y); ctx.lineTo(0, y - 15); ctx.lineTo(w, y);
        ctx.closePath(); ctx.fill();
      }
    },
    deadtree: function (ctx, r, p) {
      ctx.strokeStyle = p.trunk; ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r.range(-3, 3), -26); ctx.stroke();
      ctx.lineWidth = 3;
      for (var i = 0; i < 4; i++) {
        var y = -12 - i * 5;
        var dir = i % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(dir * r.range(8, 14), y - r.range(5, 12));
        ctx.stroke();
      }
    },
    bush: function (ctx, r, p) {
      for (var i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? p.leafDark : p.leaf;
        ctx.beginPath();
        ctx.arc(r.range(-8, 8), r.range(-11, -3), r.range(6, 9), 0, M.TAU);
        ctx.fill();
      }
    },
    rock: function (ctx, r, p) {
      ctx.fillStyle = p.rock;
      ctx.beginPath();
      var n = 7;
      for (var i = 0; i < n; i++) {
        var a = i / n * M.TAU, rad = r.range(7, 11);
        var x = Math.cos(a) * rad, y = Math.sin(a) * rad * 0.66 - 6;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.ellipse(-2, -9, 4, 2.4, -0.3, 0, M.TAU); ctx.fill();
    },
    boulder: function (ctx, r, p) {
      ctx.fillStyle = p.rock;
      ctx.beginPath();
      var n = 9;
      for (var i = 0; i < n; i++) {
        var a = i / n * M.TAU, rad = r.range(14, 20);
        var x = Math.cos(a) * rad, y = Math.sin(a) * rad * 0.7 - 12;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-8, -16); ctx.lineTo(-1, -10); ctx.lineTo(6, -18); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.ellipse(-5, -20, 6, 3.4, -0.3, 0, M.TAU); ctx.fill();
    },
    crystal: function (ctx, r, p) {
      for (var i = 0; i < 3; i++) {
        var h = r.range(16, 30), w = r.range(4, 7), x = r.range(-8, 8);
        ctx.fillStyle = i === 1 ? p.crystalLight : p.crystal;
        ctx.beginPath();
        ctx.moveTo(x - w, 0); ctx.lineTo(x - w * 0.6, -h * 0.75); ctx.lineTo(x, -h);
        ctx.lineTo(x + w * 0.6, -h * 0.75); ctx.lineTo(x + w, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(x - w * 0.3, -2); ctx.lineTo(x, -h * 0.9); ctx.lineTo(x + w * 0.15, -2);
        ctx.closePath(); ctx.fill();
      }
    },
    mushroom: function (ctx, r, p) {
      ctx.fillStyle = '#e8e0d0';
      D.roundRect(ctx, -2.4, -11, 4.8, 11, 1.6); ctx.fill();
      ctx.fillStyle = p.accent || '#c8483c';
      ctx.beginPath(); ctx.ellipse(0, -12, 9, 6.4, 0, Math.PI, M.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (var i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(r.range(-5, 5), -13 + r.range(-2, 1), r.range(0.9, 1.7), 0, M.TAU); ctx.fill();
      }
    },
    cactus: function (ctx, r, p) {
      ctx.fillStyle = p.leaf;
      D.roundRect(ctx, -4.4, -30, 8.8, 30, 4); ctx.fill();
      D.roundRect(ctx, -13, -22, 8, 5, 2.5); ctx.fill();
      D.roundRect(ctx, -13, -26, 5, 10, 2.5); ctx.fill();
      D.roundRect(ctx, 5, -18, 8, 5, 2.5); ctx.fill();
      D.roundRect(ctx, 8, -24, 5, 12, 2.5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.8;
      for (var i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(-2, -6 - i * 5); ctx.lineTo(-2, -9 - i * 5); ctx.stroke();
      }
    },
    torch: function (ctx, r, p) {
      ctx.fillStyle = '#6a4a30';
      D.roundRect(ctx, -2, -22, 4, 22, 1.6); ctx.fill();
      ctx.fillStyle = '#3a3038';
      D.roundRect(ctx, -4, -27, 8, 6, 2); ctx.fill();
      ctx.fillStyle = '#ff9a3a';
      ctx.beginPath();
      ctx.moveTo(0, -38); ctx.quadraticCurveTo(5, -30, 0, -26); ctx.quadraticCurveTo(-5, -30, 0, -38);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.moveTo(0, -35); ctx.quadraticCurveTo(2.6, -30, 0, -27.5); ctx.quadraticCurveTo(-2.6, -30, 0, -35);
      ctx.closePath(); ctx.fill();
    },
    barrel: function (ctx, r, p) {
      ctx.fillStyle = '#8a6440';
      D.roundRect(ctx, -8, -20, 16, 20, 3); ctx.fill();
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(-8.4, -16, 16.8, 2.4);
      ctx.fillRect(-8.4, -8, 16.8, 2.4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-6, -19, 2.4, 18);
    },
    crate: function (ctx, r, p) {
      ctx.fillStyle = '#9a7450';
      ctx.fillRect(-9, -18, 18, 18);
      ctx.strokeStyle = '#6a4a30'; ctx.lineWidth = 2;
      ctx.strokeRect(-9, -18, 18, 18);
      ctx.beginPath(); ctx.moveTo(-9, -18); ctx.lineTo(9, 0); ctx.moveTo(9, -18); ctx.lineTo(-9, 0); ctx.stroke();
    },
    chest: function (ctx, r, p) {
      ctx.fillStyle = '#7a5432';
      D.roundRect(ctx, -11, -14, 22, 14, 2); ctx.fill();
      ctx.fillStyle = '#8f6740';
      ctx.beginPath(); ctx.ellipse(0, -14, 11, 7, 0, Math.PI, M.TAU); ctx.fill();
      ctx.fillStyle = '#e0b23c';
      ctx.fillRect(-11.5, -16, 23, 2.6);
      ctx.fillRect(-2.4, -18, 4.8, 10);
      ctx.fillStyle = '#5a4020';
      ctx.beginPath(); ctx.arc(0, -9.5, 1.6, 0, M.TAU); ctx.fill();
    },
    sign: function (ctx, r, p) {
      ctx.fillStyle = '#6a4a30';
      D.roundRect(ctx, -1.6, -14, 3.2, 14, 1); ctx.fill();
      ctx.fillStyle = '#9a7450';
      D.roundRect(ctx, -11, -26, 22, 13, 2); ctx.fill();
      ctx.strokeStyle = '#6a4a30'; ctx.lineWidth = 1.4;
      D.roundRect(ctx, -11, -26, 22, 13, 2); ctx.stroke();
      ctx.fillStyle = 'rgba(60,40,25,0.6)';
      ctx.fillRect(-7, -22.6, 14, 1.5);
      ctx.fillRect(-7, -19.4, 10, 1.5);
    },
    statue: function (ctx, r, p) {
      ctx.fillStyle = '#a8a4b4';
      D.roundRect(ctx, -11, -7, 22, 7, 2); ctx.fill();
      ctx.fillStyle = '#bcb8c8';
      D.roundRect(ctx, -6, -30, 12, 24, 3); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -34, 6, 0, M.TAU); ctx.fill();
      ctx.fillStyle = '#8f8b9c';
      ctx.beginPath(); ctx.arc(-2, -35, 1.4, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(2, -35, 1.4, 0, M.TAU); ctx.fill();
      D.roundRect(ctx, -12, -26, 6, 16, 2.4); ctx.fill();
      D.roundRect(ctx, 6, -26, 6, 16, 2.4); ctx.fill();
    },
    pillar: function (ctx, r, p) {
      ctx.fillStyle = '#b0acc0';
      D.roundRect(ctx, -8, -4, 16, 4, 1); ctx.fill();
      D.roundRect(ctx, -6.4, -40, 12.8, 37, 1.5); ctx.fill();
      D.roundRect(ctx, -9, -46, 18, 6, 1.5); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
      for (var i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-3.4 + i * 3.4, -39); ctx.lineTo(-3.4 + i * 3.4, -5); ctx.stroke();
      }
    },
    icespike: function (ctx, r, p) {
      for (var i = 0; i < 3; i++) {
        var h = r.range(14, 30), w = r.range(3.4, 6), x = r.range(-7, 7);
        ctx.fillStyle = i === 1 ? '#dff2ff' : '#a8d4e8';
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.moveTo(x - w, 0); ctx.lineTo(x, -h); ctx.lineTo(x + w, 0);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    bones: function (ctx, r, p) {
      ctx.strokeStyle = '#ded6c4'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        var x = r.range(-9, 9), y = r.range(-6, -1), a = r.range(0, 3);
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 3);
        ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 3);
        ctx.stroke();
      }
      ctx.fillStyle = '#ded6c4';
      ctx.beginPath(); ctx.arc(r.range(-6, 6), -7, 4.4, 0, M.TAU); ctx.fill();
    },
    banner: function (ctx, r, p) {
      ctx.fillStyle = '#4a3a2a';
      D.roundRect(ctx, -1.4, -44, 2.8, 44, 1); ctx.fill();
      ctx.fillStyle = p.accent || '#8a2f4a';
      ctx.beginPath();
      ctx.moveTo(-10, -42); ctx.lineTo(10, -42); ctx.lineTo(10, -16); ctx.lineTo(0, -21); ctx.lineTo(-10, -16);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f0c860';
      D.star(ctx, 0, -30, 5, 2.2, 5, -Math.PI / 2); ctx.fill();
    },
    lamp: function (ctx, r, p) {
      ctx.fillStyle = '#3a3a46';
      D.roundRect(ctx, -1.8, -32, 3.6, 32, 1.4); ctx.fill();
      D.roundRect(ctx, -6, -3, 12, 3, 1.4); ctx.fill();
      ctx.fillStyle = '#2a2a34';
      ctx.beginPath();
      ctx.moveTo(-7, -38); ctx.lineTo(7, -38); ctx.lineTo(5, -30); ctx.lineTo(-5, -30);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe8a8';
      ctx.beginPath(); ctx.arc(0, -34, 3.6, 0, M.TAU); ctx.fill();
    },
    portal: function (ctx, r, p) {
      ctx.fillStyle = '#3a3450';
      ctx.beginPath(); ctx.ellipse(0, -2, 20, 7, 0, 0, M.TAU); ctx.fill();
      ctx.strokeStyle = p.crystal || '#8a6ad8'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, -26, 17, 24, 0, 0, M.TAU); ctx.stroke();
      ctx.fillStyle = p.crystalLight || '#b89aff';
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.ellipse(0, -26, 14, 21, 0, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    },
    stall: function (ctx, r, p) {
      ctx.fillStyle = '#7a5432';
      ctx.fillRect(-22, -20, 44, 20);
      ctx.fillStyle = '#8f6740';
      ctx.fillRect(-24, -24, 48, 5);
      for (var i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#d84a5a' : '#f0e8d8';
        ctx.beginPath();
        ctx.moveTo(-24 + i * 8, -24); ctx.lineTo(-16 + i * 8, -24); ctx.lineTo(-20 + i * 8, -34);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#5a3f28';
      ctx.fillRect(-24, -46, 3, 24);
      ctx.fillRect(21, -46, 3, 24);
      ctx.fillStyle = '#d84a5a';
      ctx.beginPath();
      ctx.moveTo(-27, -46); ctx.lineTo(27, -46); ctx.lineTo(24, -34); ctx.lineTo(-24, -34);
      ctx.closePath(); ctx.fill();
    },
    house: function (ctx, r, p) {
      ctx.fillStyle = p.wall || '#d8c8a8';
      ctx.fillRect(-30, -46, 60, 46);
      ctx.fillStyle = p.roof || '#8a4438';
      ctx.beginPath();
      ctx.moveTo(-36, -44); ctx.lineTo(0, -72); ctx.lineTo(36, -44);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a3f28';
      D.roundRect(ctx, -8, -26, 16, 26, 2); ctx.fill();
      ctx.fillStyle = '#f0c860';
      ctx.beginPath(); ctx.arc(4, -13, 1.4, 0, M.TAU); ctx.fill();
      ctx.fillStyle = '#8ad0f0';
      D.roundRect(ctx, -24, -38, 12, 11, 1.5); ctx.fill();
      D.roundRect(ctx, 12, -38, 12, 11, 1.5); ctx.fill();
      ctx.strokeStyle = '#5a3f28'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-18, -38); ctx.lineTo(-18, -27); ctx.moveTo(-24, -32.5); ctx.lineTo(-12, -32.5);
      ctx.moveTo(18, -38); ctx.lineTo(18, -27); ctx.moveTo(12, -32.5); ctx.lineTo(24, -32.5);
      ctx.stroke();
    },
    shrine: function (ctx, r, p) {
      ctx.fillStyle = '#9a96a8';
      D.roundRect(ctx, -14, -8, 28, 8, 2); ctx.fill();
      D.roundRect(ctx, -9, -26, 18, 19, 2); ctx.fill();
      ctx.fillStyle = p.crystal || '#7fe0ff';
      ctx.globalAlpha = 0.9;
      D.poly(ctx, 0, -36, 8, 6, 0.4); ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(0, -36, 14, 0, M.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    },
    anvil: function (ctx, r, p) {
      ctx.fillStyle = '#3a3a46';
      D.roundRect(ctx, -7, -8, 14, 8, 1.4); ctx.fill();
      D.roundRect(ctx, -4, -16, 8, 9, 1.4); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-13, -24); ctx.lineTo(13, -24); ctx.lineTo(16, -19); ctx.lineTo(-10, -19);
      ctx.closePath(); ctx.fill();
    },
    flag: function (ctx, r, p) {
      ctx.fillStyle = '#8a8898';
      D.roundRect(ctx, -1.2, -40, 2.4, 40, 1); ctx.fill();
      ctx.fillStyle = p.accent || '#4ac8a0';
      ctx.beginPath();
      ctx.moveTo(1, -40); ctx.quadraticCurveTo(14, -36, 18, -30);
      ctx.quadraticCurveTo(10, -28, 1, -26);
      ctx.closePath(); ctx.fill();
    }
  };

  /* Canvas size per prop. Fill rate is the scarce resource when two hundred
   * of these are on screen, so nothing gets a bigger sheet than it needs. */
  var PROP_SIZE = {
    mushroom: 48, bones: 48, bush: 64, rock: 64, barrel: 64, crate: 64, chest: 64, anvil: 64,
    sign: 72, icespike: 72, crystal: 80, cactus: 80, torch: 80, statue: 80,
    deadtree: 96, boulder: 96, banner: 96, lamp: 96, shrine: 96, flag: 96,
    tree: 112, pine: 112, pillar: 112, portal: 112, stall: 112, house: 128
  };

  Art.propSprite = function (name, seed, palette) {
    var key = 'p:' + name + ':' + seed + ':' + (palette.key || '');
    var cached = spriteCache[key];
    if (cached) return cached;
    var fn = PROP[name] || PROP.rock;
    var size = PROP_SIZE[name] || 96;
    return bake(key, 1, function (ctx) {
      var r = new RG.Rng(RG.hashStr(name + seed));
      fn(ctx, r, palette);
    }, size, size);
  };
  Art.PROP_NAMES = Object.keys(PROP);

  /* -------------------------------------------------------------- icons */
  var ICON = {
    coin: function (ctx, s) {
      ctx.fillStyle = '#c9931f';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.44, 0, M.TAU); ctx.fill();
      ctx.fillStyle = '#f5c542';
      ctx.beginPath(); ctx.arc(0, -s * 0.03, s * 0.38, 0, M.TAU); ctx.fill();
      ctx.fillStyle = '#ffe89a';
      ctx.beginPath(); ctx.arc(-s * 0.11, -s * 0.13, s * 0.11, 0, M.TAU); ctx.fill();
      ctx.strokeStyle = '#8a6410'; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.19); ctx.lineTo(0, s * 0.19); ctx.stroke();
    },
    gem: function (ctx, s) {
      ctx.fillStyle = '#39c3e8';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.44); ctx.lineTo(s * 0.36, -s * 0.1);
      ctx.lineTo(0, s * 0.44); ctx.lineTo(-s * 0.36, -s * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8ceaff';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.44); ctx.lineTo(s * 0.36, -s * 0.1); ctx.lineTo(0, -s * 0.02);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.06, -s * 0.38); ctx.lineTo(s * 0.04, -s * 0.34); ctx.lineTo(-s * 0.1, -s * 0.06);
      ctx.closePath(); ctx.fill();
    },
    heart: function (ctx, s) {
      ctx.fillStyle = '#e8455c';
      ctx.beginPath();
      ctx.moveTo(0, s * 0.4);
      ctx.bezierCurveTo(-s * 0.6, s * 0.02, -s * 0.32, -s * 0.45, 0, -s * 0.16);
      ctx.bezierCurveTo(s * 0.32, -s * 0.45, s * 0.6, s * 0.02, 0, s * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(-s * 0.15, -s * 0.14, s * 0.09, s * 0.06, -0.6, 0, M.TAU); ctx.fill();
    },
    sword: function (ctx, s) {
      ctx.fillStyle = '#5a3f2a';
      D.roundRect(ctx, -s * 0.05, s * 0.16, s * 0.1, s * 0.24, s * 0.05); ctx.fill();
      ctx.fillStyle = '#b9903c';
      D.roundRect(ctx, -s * 0.2, s * 0.1, s * 0.4, s * 0.08, s * 0.04); ctx.fill();
      ctx.fillStyle = '#d8dde8';
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, s * 0.1); ctx.lineTo(s * 0.1, s * 0.1);
      ctx.lineTo(s * 0.1, -s * 0.28); ctx.lineTo(0, -s * 0.44); ctx.lineTo(-s * 0.1, -s * 0.28);
      ctx.closePath(); ctx.fill();
    },
    shield: function (ctx, s) {
      ctx.fillStyle = '#5b8ad8';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.42);
      ctx.lineTo(s * 0.33, -s * 0.26); ctx.lineTo(s * 0.3, s * 0.14);
      ctx.quadraticCurveTo(s * 0.16, s * 0.4, 0, s * 0.44);
      ctx.quadraticCurveTo(-s * 0.16, s * 0.4, -s * 0.3, s * 0.14);
      ctx.lineTo(-s * 0.33, -s * 0.26);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a8c8f0';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.3); ctx.lineTo(s * 0.2, -s * 0.19); ctx.lineTo(0, s * 0.24); ctx.lineTo(-s * 0.2, -s * 0.19);
      ctx.closePath(); ctx.fill();
    },
    boot: function (ctx, s) {
      ctx.fillStyle = '#6a8f4a';
      ctx.beginPath();
      ctx.moveTo(-s * 0.16, -s * 0.4); ctx.lineTo(s * 0.06, -s * 0.4);
      ctx.lineTo(s * 0.08, s * 0.08); ctx.lineTo(s * 0.36, s * 0.16);
      ctx.lineTo(s * 0.36, s * 0.38); ctx.lineTo(-s * 0.2, s * 0.38);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a4f28';
      ctx.fillRect(-s * 0.2, s * 0.3, s * 0.56, s * 0.1);
    },
    star: function (ctx, s) {
      ctx.fillStyle = '#f5c542';
      D.star(ctx, 0, 0, s * 0.44, s * 0.18, 5, -Math.PI / 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      D.star(ctx, 0, -s * 0.04, s * 0.2, s * 0.08, 5, -Math.PI / 2); ctx.fill();
    },
    key: function (ctx, s) {
      ctx.strokeStyle = '#f5c542'; ctx.lineWidth = s * 0.1;
      ctx.beginPath(); ctx.arc(-s * 0.16, -s * 0.16, s * 0.16, 0, M.TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.06, -s * 0.06); ctx.lineTo(s * 0.3, s * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.18, s * 0.18); ctx.lineTo(s * 0.08, s * 0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.3); ctx.lineTo(s * 0.2, s * 0.4); ctx.stroke();
    },
    potion: function (ctx, s) {
      ctx.fillStyle = '#8a8fa8';
      ctx.fillRect(-s * 0.08, -s * 0.42, s * 0.16, s * 0.14);
      ctx.fillStyle = '#c8d4e8';
      ctx.beginPath();
      ctx.moveTo(-s * 0.08, -s * 0.28); ctx.lineTo(s * 0.08, -s * 0.28);
      ctx.quadraticCurveTo(s * 0.34, s * 0.02, s * 0.24, s * 0.28);
      ctx.quadraticCurveTo(0, s * 0.46, -s * 0.24, s * 0.28);
      ctx.quadraticCurveTo(-s * 0.34, s * 0.02, -s * 0.08, -s * 0.28);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8455c';
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, s * 0.06); ctx.lineTo(s * 0.22, s * 0.06);
      ctx.quadraticCurveTo(s * 0.2, s * 0.36, 0, s * 0.4);
      ctx.quadraticCurveTo(-s * 0.2, s * 0.36, -s * 0.22, s * 0.06);
      ctx.closePath(); ctx.fill();
    },
    lock: function (ctx, s) {
      ctx.strokeStyle = '#98a0b4'; ctx.lineWidth = s * 0.09;
      ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.17, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#c0c8d8';
      D.roundRect(ctx, -s * 0.26, -s * 0.12, s * 0.52, s * 0.42, s * 0.06); ctx.fill();
      ctx.fillStyle = '#6a7288';
      ctx.beginPath(); ctx.arc(0, s * 0.06, s * 0.06, 0, M.TAU); ctx.fill();
    },
    check: function (ctx, s) {
      ctx.strokeStyle = '#4ad88a'; ctx.lineWidth = s * 0.13;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, s * 0.02); ctx.lineTo(-s * 0.06, s * 0.24); ctx.lineTo(s * 0.28, -s * 0.26);
      ctx.stroke();
    },
    skull: function (ctx, s) {
      ctx.fillStyle = '#ded6c4';
      ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.3, 0, M.TAU); ctx.fill();
      ctx.fillRect(-s * 0.16, s * 0.08, s * 0.32, s * 0.2);
      ctx.fillStyle = '#2a2630';
      ctx.beginPath(); ctx.ellipse(-s * 0.12, -s * 0.08, s * 0.08, s * 0.1, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.12, -s * 0.08, s * 0.08, s * 0.1, 0, 0, M.TAU); ctx.fill();
      ctx.fillRect(-s * 0.03, s * 0.04, s * 0.06, s * 0.08);
    },
    map: function (ctx, s) {
      ctx.fillStyle = '#e0d2a8';
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, -s * 0.28); ctx.lineTo(-s * 0.12, -s * 0.36);
      ctx.lineTo(s * 0.12, -s * 0.24); ctx.lineTo(s * 0.36, -s * 0.34);
      ctx.lineTo(s * 0.36, s * 0.3); ctx.lineTo(s * 0.12, s * 0.38);
      ctx.lineTo(-s * 0.12, s * 0.26); ctx.lineTo(-s * 0.36, s * 0.36);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a8452f'; ctx.lineWidth = s * 0.05;
      ctx.setLineDash([s * 0.07, s * 0.06]);
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.16); ctx.quadraticCurveTo(0, -s * 0.06, s * 0.18, -s * 0.16);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a8452f';
      ctx.beginPath(); ctx.arc(s * 0.18, -s * 0.16, s * 0.06, 0, M.TAU); ctx.fill();
    },
    bag: function (ctx, s) {
      ctx.strokeStyle = '#8a6440'; ctx.lineWidth = s * 0.07;
      ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.14, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#a87a4c';
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, -s * 0.18); ctx.lineTo(s * 0.26, -s * 0.18);
      ctx.quadraticCurveTo(s * 0.36, s * 0.36, 0, s * 0.4);
      ctx.quadraticCurveTo(-s * 0.36, s * 0.36, -s * 0.26, -s * 0.18);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a5432';
      ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.1);
    },
    gear: function (ctx, s) {
      ctx.fillStyle = '#9aa4bc';
      for (var i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate(i / 8 * M.TAU);
        ctx.fillRect(-s * 0.06, -s * 0.42, s * 0.12, s * 0.16);
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, M.TAU); ctx.fill();
      ctx.fillStyle = '#2a3044';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, M.TAU); ctx.fill();
    },
    bolt: function (ctx, s) {
      ctx.fillStyle = '#f5d742';
      ctx.beginPath();
      ctx.moveTo(s * 0.06, -s * 0.44); ctx.lineTo(-s * 0.24, s * 0.06);
      ctx.lineTo(-s * 0.02, s * 0.06); ctx.lineTo(-s * 0.08, s * 0.44);
      ctx.lineTo(s * 0.26, -s * 0.08); ctx.lineTo(s * 0.02, -s * 0.08);
      ctx.closePath(); ctx.fill();
    },
    leaf: function (ctx, s) {
      ctx.fillStyle = '#5aa055';
      ctx.beginPath();
      ctx.moveTo(0, s * 0.4);
      ctx.quadraticCurveTo(-s * 0.4, s * 0.06, 0, -s * 0.42);
      ctx.quadraticCurveTo(s * 0.4, s * 0.06, 0, s * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#3a6f38'; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.moveTo(0, s * 0.34); ctx.lineTo(0, -s * 0.34); ctx.stroke();
    },
    flame: function (ctx, s) {
      ctx.fillStyle = '#ff7a2a';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.44);
      ctx.quadraticCurveTo(s * 0.34, -s * 0.06, s * 0.2, s * 0.18);
      ctx.quadraticCurveTo(s * 0.12, s * 0.42, 0, s * 0.42);
      ctx.quadraticCurveTo(-s * 0.12, s * 0.42, -s * 0.2, s * 0.18);
      ctx.quadraticCurveTo(-s * 0.34, -s * 0.06, 0, -s * 0.44);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.14);
      ctx.quadraticCurveTo(s * 0.16, s * 0.06, s * 0.08, s * 0.24);
      ctx.quadraticCurveTo(0, s * 0.36, -s * 0.08, s * 0.24);
      ctx.quadraticCurveTo(-s * 0.16, s * 0.06, 0, -s * 0.14);
      ctx.closePath(); ctx.fill();
    },
    snow: function (ctx, s) {
      ctx.strokeStyle = '#bde2f2'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate(i / 3 * Math.PI);
        ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(0, s * 0.4); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.4); ctx.lineTo(-s * 0.12, -s * 0.26);
        ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.12, -s * 0.26);
        ctx.moveTo(0, s * 0.4); ctx.lineTo(-s * 0.12, s * 0.26);
        ctx.moveTo(0, s * 0.4); ctx.lineTo(s * 0.12, s * 0.26);
        ctx.stroke();
        ctx.restore();
      }
    },
    voidicon: function (ctx, s) {
      ctx.fillStyle = '#241a3c';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, M.TAU); ctx.fill();
      ctx.strokeStyle = '#a87aff'; ctx.lineWidth = s * 0.07;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0.4, 4.2); ctx.stroke();
      ctx.fillStyle = '#d0b0ff';
      D.star(ctx, 0, 0, s * 0.16, s * 0.05, 4, 0.4); ctx.fill();
    },
    trophy: function (ctx, s) {
      ctx.fillStyle = '#f5c542';
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, -s * 0.34); ctx.lineTo(s * 0.22, -s * 0.34);
      ctx.quadraticCurveTo(s * 0.2, s * 0.08, 0, s * 0.12);
      ctx.quadraticCurveTo(-s * 0.2, s * 0.08, -s * 0.22, -s * 0.34);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f5c542'; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.22, s * 0.1, 0.6, 4.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.22, s * 0.1, -1.2, 2.4); ctx.stroke();
      ctx.fillStyle = '#c9931f';
      ctx.fillRect(-s * 0.05, s * 0.1, s * 0.1, s * 0.14);
      D.roundRect(ctx, -s * 0.2, s * 0.24, s * 0.4, s * 0.1, s * 0.03); ctx.fill();
    }
  };

  Art.ICONS = Object.keys(ICON);
  /* Icons are centred rather than foot-anchored, so they bypass bake(). */
  Art.icon = function (name, size) {
    size = size || 32;
    var key = 'i:' + name + ':' + size;
    if (spriteCache[key]) return spriteCache[key].frames[0];
    var fn = ICON[name] || ICON.star;
    var cv = RG.makeCanvas(size, size);
    var c = RG.ctxOf(cv);
    c.translate(size * 0.5, size * 0.5);
    c.lineJoin = 'round'; c.lineCap = 'round';
    fn(c, size);
    spriteCache[key] = { frames: [cv], w: size, h: size, ox: size * 0.5, oy: size * 0.5 };
    return cv;
  };
  /* toDataURL re-encodes a PNG every call, and the UI asks for the same
   * handful of icons over and over, so the strings are cached too. */
  var iconUrlCache = {};
  Art.iconURL = function (name, size) {
    size = size || 32;
    var key = name + ':' + size;
    if (iconUrlCache[key] !== undefined) return iconUrlCache[key];
    var url = '';
    try { url = Art.icon(name, size).toDataURL(); } catch (e) { url = ''; }
    iconUrlCache[key] = url;
    return url;
  };
})(RG);
