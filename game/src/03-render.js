/* ReGen - rendering: adaptive canvas sizing, camera, dynamic lighting,
 * pooled particles and floating combat text.
 *
 * The view uses constant-area scaling: whatever the aspect ratio of the
 * device, the player always sees roughly the same amount of world. A phone
 * in landscape and an ultrawide monitor therefore play identically, which
 * is the whole point of shipping one game on both. */
'use strict';
(function (RG) {
  var M = RG.M;

  var View = RG.View = {
    canvas: null, ctx: null,
    lightCanvas: null, lightCtx: null,
    cssW: 0, cssH: 0,        /* size on screen, in CSS pixels */
    w: 0, h: 0,              /* size in world units currently visible */
    scale: 1,                /* world units -> CSS pixels */
    dpr: 1,
    quality: 1,              /* render-scale multiplier, user adjustable */
    autoScale: 1,            /* runtime backoff applied on top of quality */
    lightScale: 0.34,
    BASE_AREA: 620 * 350,
    MAX_PIXELS: 2100000,
    MIN_H: 300, MAX_H: 470,
    portrait: false
  };

  View.init = function (canvas) {
    View.canvas = canvas;
    View.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    View.lightCanvas = RG.makeCanvas(2, 2);
    View.lightCtx = RG.ctxOf(View.lightCanvas);
    View.resize();
    window.addEventListener('resize', View.resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', View.resize);
    window.addEventListener('orientationchange', function () { setTimeout(View.resize, 120); });
  };

  View.resize = function () {
    var w = Math.max(240, window.innerWidth | 0);
    var h = Math.max(200, window.innerHeight | 0);
    View.cssW = w; View.cssH = h;
    View.portrait = h > w;

    var aspect = w / h;
    var vh = Math.sqrt(View.BASE_AREA / aspect);
    vh = M.clamp(vh, View.MIN_H, View.MAX_H);
    View.h = vh;
    View.w = vh * aspect;
    View.scale = h / vh;

    var dpr = Math.min(window.devicePixelRatio || 1, 2.5) * View.quality * View.autoScale;
    /* Fill rate, not logic, is what costs frames. Cap the number of pixels
     * we rasterise per frame so a 3x-density phone does not quietly ask for
     * three million of them. */
    var pixels = w * h * dpr * dpr;
    if (pixels > View.MAX_PIXELS) dpr *= Math.sqrt(View.MAX_PIXELS / pixels);
    dpr = Math.max(0.6, dpr);
    View.dpr = dpr;
    var pw = Math.round(w * View.dpr), ph = Math.round(h * View.dpr);
    if (View.canvas.width !== pw || View.canvas.height !== ph) {
      View.canvas.width = pw; View.canvas.height = ph;
    }
    View.canvas.style.width = w + 'px';
    View.canvas.style.height = h + 'px';

    var lw = Math.max(2, Math.round(pw * View.lightScale));
    var lh = Math.max(2, Math.round(ph * View.lightScale));
    if (View.lightCanvas.width !== lw || View.lightCanvas.height !== lh) {
      View.lightCanvas.width = lw; View.lightCanvas.height = lh;
    }
    RG.Emitter.prototype.emit.call(View._ev || (View._ev = new RG.Emitter()), 'resize');
    if (View.onResize) View.onResize();
  };

  View.setQuality = function (q) { View.quality = q; View.resize(); };
  View.setAutoScale = function (a) {
    a = M.clamp(a, 0.55, 1);
    if (Math.abs(a - View.autoScale) < 0.01) return false;
    View.autoScale = a;
    View.resize();
    return true;
  };

  /* ------------------------------------------------------------- camera */
  var Cam = RG.Cam = {
    x: 0, y: 0, tx: 0, ty: 0, zoom: 1, targetZoom: 1,
    shake: 0, shakeX: 0, shakeY: 0, shakeSeed: 0,
    minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9,
    lookahead: 0.16
  };
  Cam.snap = function (x, y) { Cam.x = Cam.tx = x; Cam.y = Cam.ty = y; };
  Cam.follow = function (x, y, vx, vy, dt) {
    Cam.tx = x + (vx || 0) * Cam.lookahead;
    Cam.ty = y + (vy || 0) * Cam.lookahead;
    Cam.x = M.damp(Cam.x, Cam.tx, 9, dt);
    Cam.y = M.damp(Cam.y, Cam.ty, 9, dt);
    Cam.clampToBounds();
  };
  Cam.clampToBounds = function () {
    var hw = View.w / Cam.zoom * 0.5, hh = View.h / Cam.zoom * 0.5;
    if (Cam.maxX - Cam.minX > hw * 2) Cam.x = M.clamp(Cam.x, Cam.minX + hw, Cam.maxX - hw);
    else Cam.x = (Cam.minX + Cam.maxX) * 0.5;
    if (Cam.maxY - Cam.minY > hh * 2) Cam.y = M.clamp(Cam.y, Cam.minY + hh, Cam.maxY - hh);
    else Cam.y = (Cam.minY + Cam.maxY) * 0.5;
  };
  Cam.setBounds = function (x0, y0, x1, y1) { Cam.minX = x0; Cam.minY = y0; Cam.maxX = x1; Cam.maxY = y1; };
  Cam.addShake = function (amount) { Cam.shake = Math.min(24, Cam.shake + amount); };
  Cam.update = function (dt) {
    Cam.zoom = M.damp(Cam.zoom, Cam.targetZoom, 6, dt);
    Cam.shake = Math.max(0, Cam.shake - Cam.shake * 9 * dt - 0.6 * dt);
    if (Cam.shake > 0.01) {
      Cam.shakeSeed += dt * 60;
      var s = Cam.shake;
      Cam.shakeX = Math.sin(Cam.shakeSeed * 3.1) * Math.cos(Cam.shakeSeed * 1.7) * s;
      Cam.shakeY = Math.cos(Cam.shakeSeed * 2.3) * Math.sin(Cam.shakeSeed * 4.1) * s;
    } else { Cam.shakeX = 0; Cam.shakeY = 0; Cam.shake = 0; }
  };
  Cam.worldToScreenX = function (x) { return (x - Cam.x - Cam.shakeX) * Cam.zoom + View.w * 0.5; };
  Cam.worldToScreenY = function (y) { return (y - Cam.y - Cam.shakeY) * Cam.zoom + View.h * 0.5; };
  /* css pixel coords -> world */
  Cam.screenToWorldX = function (px) { return (px / View.scale - View.w * 0.5) / Cam.zoom + Cam.x + Cam.shakeX; };
  Cam.screenToWorldY = function (py) { return (py / View.scale - View.h * 0.5) / Cam.zoom + Cam.y + Cam.shakeY; };
  Cam.viewRect = function (out) {
    var hw = View.w / Cam.zoom * 0.5, hh = View.h / Cam.zoom * 0.5;
    out.x = Cam.x + Cam.shakeX - hw; out.y = Cam.y + Cam.shakeY - hh;
    out.w = hw * 2; out.h = hh * 2;
    return out;
  };

  /* ---------------------------------------------------------- particles */
  /* One pooled array for every particle in the game. Nothing is allocated
   * after start-up, so there are no GC spikes mid-fight. */
  var MAX_PARTICLES = 1400;
  var P = RG.Particles = {
    list: new Array(MAX_PARTICLES),
    count: 0,
    budget: MAX_PARTICLES
  };
  (function () {
    for (var i = 0; i < MAX_PARTICLES; i++) {
      P.list[i] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, size2: 0, color: '#fff', kind: 0, drag: 0.9, grav: 0, rot: 0, vrot: 0, glow: 0, alpha: 1 };
    }
  })();

  /* kind: 0 dot, 1 spark(line), 2 ring, 3 square, 4 smoke, 5 star */
  P.spawn = function (x, y, vx, vy, life, size, color, kind, opts) {
    if (P.count >= P.budget) {
      /* recycle the oldest particle rather than dropping the new one - the
       * newest effect is always the one the player is looking at */
      var oldest = 0, ol = 1e9;
      for (var k = 0; k < P.count; k += 7) { if (P.list[k].life < ol) { ol = P.list[k].life; oldest = k; } }
      P.list[oldest] = P.list[P.count - 1];
      P.count--;
    }
    var p = P.list[P.count++];
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.size2 = size;
    p.color = color; p.kind = kind || 0;
    p.drag = opts && opts.drag !== undefined ? opts.drag : 0.9;
    p.grav = opts && opts.grav !== undefined ? opts.grav : 0;
    p.rot = opts && opts.rot !== undefined ? opts.rot : 0;
    p.vrot = opts && opts.vrot !== undefined ? opts.vrot : 0;
    p.glow = opts && opts.glow !== undefined ? opts.glow : 0;
    p.alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    return p;
  };

  P.burst = function (x, y, n, color, opts) {
    opts = opts || {};
    var speed = opts.speed || 90, spread = opts.spread || M.TAU, dir = opts.dir || 0;
    var life = opts.life || 0.5, size = opts.size || 3, kind = opts.kind || 0;
    for (var i = 0; i < n; i++) {
      var a = dir + (Math.random() - 0.5) * spread;
      var s = speed * (0.35 + Math.random() * 0.85);
      P.spawn(x + (Math.random() - 0.5) * (opts.jitter || 0), y + (Math.random() - 0.5) * (opts.jitter || 0),
        Math.cos(a) * s, Math.sin(a) * s,
        life * (0.6 + Math.random() * 0.7), size * (0.6 + Math.random() * 0.8),
        color, kind, opts);
    }
  };

  P.ring = function (x, y, r, color, life, width) {
    var p = P.spawn(x, y, 0, 0, life || 0.4, r, color, 2, { drag: 1 });
    p.size2 = width || 2;
  };

  P.update = function (dt) {
    var list = P.list;
    for (var i = 0; i < P.count; i++) {
      var p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        var t = list[i]; list[i] = list[P.count - 1]; list[P.count - 1] = t;
        P.count--; i--; continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.grav * dt;
      if (p.drag !== 1) {
        var d = Math.pow(p.drag, dt * 60);
        p.vx *= d; p.vy *= d;
      }
      p.rot += p.vrot * dt;
    }
  };

  P.clear = function () { P.count = 0; };

  P.draw = function (ctx) {
    var list = P.list;
    ctx.save();
    for (var i = 0; i < P.count; i++) {
      var p = list[i];
      var t = p.life / p.max;
      var a = M.clamp01(t * 1.4) * p.alpha;
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.glow) ctx.globalCompositeOperation = 'lighter';
      switch (p.kind) {
        case 1: /* spark: a stretched line along its velocity */
          var l = Math.min(14, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.035);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * t;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02 * l, p.y - p.vy * 0.02 * l);
          ctx.stroke();
          break;
        case 2: /* expanding ring */
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size2 * t;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t) + 2, 0, M.TAU);
          ctx.stroke();
          break;
        case 3: /* tumbling shard */
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          var s3 = p.size * t;
          ctx.fillRect(-s3 * 0.5, -s3 * 0.5, s3, s3);
          ctx.restore();
          break;
        case 4: /* soft smoke puff */
          ctx.globalAlpha = a * 0.4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, M.TAU);
          ctx.fill();
          break;
        case 5: /* four-point star */
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          var s5 = p.size * t;
          ctx.beginPath();
          for (var k = 0; k < 4; k++) {
            var ang = k * Math.PI / 2;
            ctx.lineTo(Math.cos(ang) * s5 * 1.9, Math.sin(ang) * s5 * 1.9);
            ctx.lineTo(Math.cos(ang + Math.PI / 4) * s5 * 0.55, Math.sin(ang + Math.PI / 4) * s5 * 0.55);
          }
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        default:
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.4, p.size * t), 0, M.TAU);
          ctx.fill();
      }
      if (p.glow) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  };

  /* ------------------------------------------------------- floating text */
  var MAX_TEXT = 90;
  var T = RG.FloatText = { list: new Array(MAX_TEXT), count: 0 };
  (function () {
    for (var i = 0; i < MAX_TEXT; i++) T.list[i] = { x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', color: '#fff', size: 10, crit: false };
  })();
  T.add = function (x, y, text, color, size, crit) {
    if (T.count >= MAX_TEXT) { T.list[0].life = 0; T.count--; T.list[0] = T.list[T.count]; }
    var o = T.list[T.count++];
    o.x = x + (Math.random() - 0.5) * 6; o.y = y; o.vy = -32 - Math.random() * 12;
    o.life = crit ? 1.1 : 0.8; o.max = o.life;
    o.text = text; o.color = color || '#fff'; o.size = size || 11; o.crit = !!crit;
  };
  T.update = function (dt) {
    for (var i = 0; i < T.count; i++) {
      var o = T.list[i];
      o.life -= dt;
      if (o.life <= 0) { var t = T.list[i]; T.list[i] = T.list[T.count - 1]; T.list[T.count - 1] = t; T.count--; i--; continue; }
      o.y += o.vy * dt;
      o.vy += 52 * dt;
    }
  };
  T.clear = function () { T.count = 0; };
  T.draw = function (ctx) {
    if (!T.count) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (var i = 0; i < T.count; i++) {
      var o = T.list[i];
      var t = o.life / o.max;
      var pop = o.crit ? (1 + M.easeOutBack(M.clamp01((1 - t) * 4)) * 0.35) : 1;
      ctx.globalAlpha = M.clamp01(t * 2.6);
      ctx.font = '700 ' + (o.size * pop).toFixed(1) + 'px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(6,8,16,0.85)';
      ctx.strokeText(o.text, o.x, o.y);
      ctx.fillStyle = o.color;
      ctx.fillText(o.text, o.x, o.y);
    }
    ctx.restore();
  };

  /* ------------------------------------------------------------ lighting */
  /* Lighting is a darkness mask, not a multiply blend: the light canvas is
   * filled with the biome's ambient colour and lights punch feathered holes
   * in it with destination-out. Compositing that with a plain source-over
   * costs a fraction of a full-screen multiply, and the coloured bloom is
   * added separately in world space where it is cheap. */
  var L = RG.Lights = {
    list: [], count: 0, ambient: '#000000', strength: 0, budget: 64
  };
  (function () { for (var i = 0; i < 160; i++) L.list.push({ x: 0, y: 0, r: 0, color: '#fff', a: 1 }); })();

  var HOLE = null;
  function holeSprite() {
    if (HOLE) return HOLE;
    var n = 128;
    HOLE = RG.makeCanvas(n, n);
    var c = RG.ctxOf(HOLE);
    var g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.42, 'rgba(0,0,0,0.86)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.42)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
    return HOLE;
  }

  var glowCache = {};
  function glowSprite(color) {
    if (glowCache[color]) return glowCache[color];
    var n = 128;
    var cv = RG.makeCanvas(n, n);
    var c = RG.ctxOf(cv);
    var g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, RG.Color.hexToRgba(color, 0.55));
    g.addColorStop(0.35, RG.Color.hexToRgba(color, 0.22));
    g.addColorStop(1, RG.Color.hexToRgba(color, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
    glowCache[color] = cv;
    return cv;
  }

  L.begin = function (ambientHex, strength) { L.count = 0; L.ambient = ambientHex; L.strength = strength; };
  L.add = function (x, y, r, color, a) {
    if (L.strength <= 0.001 || L.count >= L.budget) return;
    /* cull off-screen lights before they cost anything */
    var sx = Cam.worldToScreenX(x), sy = Cam.worldToScreenY(y);
    var pr = r * Cam.zoom;
    if (sx + pr < 0 || sy + pr < 0 || sx - pr > View.w || sy - pr > View.h) return;
    var l = L.list[L.count++];
    l.x = x; l.y = y; l.r = r; l.color = color || '#ffd9a0'; l.a = a === undefined ? 1 : a;
  };

  /* Additive coloured bloom, drawn in world space under the darkness pass. */
  L.GLOW_CAP = 26;
  L.drawGlow = function (ctx) {
    if (L.strength <= 0.001 || !L.count) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var n = Math.min(L.count, L.GLOW_CAP);
    for (var i = 0; i < n; i++) {
      var l = L.list[i];
      var r = l.r * 0.5;
      ctx.globalAlpha = 0.42 * l.a * L.strength;
      ctx.drawImage(glowSprite(l.color), l.x - r, l.y - r, r * 2, r * 2);
    }
    ctx.restore();
  };

  L.render = function () {
    if (L.strength <= 0.001) return null;
    var lc = View.lightCanvas, lx = View.lightCtx;
    var sx = lc.width / View.w, sy = lc.height / View.h;
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.globalCompositeOperation = 'source-over';
    lx.globalAlpha = 1;
    lx.fillStyle = L.ambient;
    lx.fillRect(0, 0, lc.width, lc.height);
    lx.globalCompositeOperation = 'destination-out';
    var hole = holeSprite();
    for (var i = 0; i < L.count; i++) {
      var l = L.list[i];
      var px = Cam.worldToScreenX(l.x) * sx;
      var py = Cam.worldToScreenY(l.y) * sy;
      var pr = l.r * Cam.zoom * sx;
      lx.globalAlpha = M.clamp01(l.a);
      lx.drawImage(hole, px - pr, py - pr, pr * 2, pr * 2);
    }
    lx.globalAlpha = 1;
    lx.globalCompositeOperation = 'source-over';
    return lc;
  };

  L.composite = function (ctx) {
    if (L.strength <= 0.001) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = L.strength;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(View.lightCanvas, 0, 0, View.canvas.width, View.canvas.height);
    ctx.restore();
  };

  /* --------------------------------------------------------- draw utils */
  var D = RG.Draw = {};
  D.roundRect = function (ctx, x, y, w, h, r) {
    if (r === undefined) r = 4;
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  /* A cached soft blob beats an ellipse fill per entity per frame, and it
   * looks better: real shadows do not have a hard edge. */
  var shadowSprite = null;
  function getShadow() {
    if (shadowSprite) return shadowSprite;
    var n = 64;
    shadowSprite = RG.makeCanvas(n, n);
    var c = RG.ctxOf(shadowSprite);
    var g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.42)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
    return shadowSprite;
  }
  D.shadow = function (ctx, x, y, rx, ry, alpha) {
    var sp = getShadow();
    var a = alpha === undefined ? 0.28 : alpha;
    if (a <= 0.01) return;
    var prev = ctx.globalAlpha;
    ctx.globalAlpha = a * 1.35;
    ctx.drawImage(sp, x - rx * 1.5, y - ry * 1.6, rx * 3, ry * 3.2);
    ctx.globalAlpha = prev;
  };
  D.bar = function (ctx, x, y, w, h, pct, fg, bg, border) {
    ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
    D.roundRect(ctx, x, y, w, h, h * 0.5); ctx.fill();
    if (pct > 0) {
      ctx.fillStyle = fg;
      D.roundRect(ctx, x + 1, y + 1, Math.max(h - 2, (w - 2) * M.clamp01(pct)), h - 2, (h - 2) * 0.5);
      ctx.fill();
    }
    if (border) {
      ctx.strokeStyle = border; ctx.lineWidth = 0.7;
      D.roundRect(ctx, x, y, w, h, h * 0.5); ctx.stroke();
    }
  };
  D.poly = function (ctx, x, y, r, sides, rot) {
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var a = rot + i / sides * M.TAU;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  D.star = function (ctx, x, y, outer, inner, points, rot) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? outer : inner;
      var a = rot + i / (points * 2) * M.TAU;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  /* ------------------------------------------------------- frame setup */
  var _rect = { x: 0, y: 0, w: 0, h: 0 };
  View.beginFrame = function () {
    var ctx = View.ctx;
    ctx.setTransform(View.dpr * View.scale, 0, 0, View.dpr * View.scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    return ctx;
  };
  View.applyCamera = function (ctx) {
    ctx.translate(View.w * 0.5, View.h * 0.5);
    ctx.scale(Cam.zoom, Cam.zoom);
    ctx.translate(-(Cam.x + Cam.shakeX), -(Cam.y + Cam.shakeY));
  };
  View.rect = function () { return Cam.viewRect(_rect); };

  /* full-screen colour wash, used for hit flashes and transitions */
  View.flash = function (ctx, color, alpha) {
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.setTransform(View.dpr, 0, 0, View.dpr, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, View.cssW, View.cssH);
    ctx.restore();
  };

  var vignetteCache = null, vignetteKey = '';
  View.vignette = function (ctx, strength, color) {
    if (strength <= 0.002) return;
    var key = View.cssW + 'x' + View.cssH + (color || '#000');
    if (vignetteKey !== key) {
      vignetteKey = key;
      vignetteCache = RG.makeCanvas(View.cssW, View.cssH);
      var vc = RG.ctxOf(vignetteCache);
      var g = vc.createRadialGradient(
        View.cssW * 0.5, View.cssH * 0.5, Math.min(View.cssW, View.cssH) * 0.34,
        View.cssW * 0.5, View.cssH * 0.5, Math.max(View.cssW, View.cssH) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, color || 'rgba(0,0,0,1)');
      vc.fillStyle = g;
      vc.fillRect(0, 0, View.cssW, View.cssH);
    }
    ctx.save();
    ctx.setTransform(View.dpr, 0, 0, View.dpr, 0, 0);
    ctx.globalAlpha = strength;
    ctx.drawImage(vignetteCache, 0, 0);
    ctx.restore();
  };
})(RG);
