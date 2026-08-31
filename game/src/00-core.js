/* ReGen - core utilities, math, RNG, noise, pooling, spatial hashing.
 * No external dependencies. Everything below is allocation-conscious:
 * hot paths reuse scratch objects instead of creating new ones. */
'use strict';
var RG = window.RG || (window.RG = {});
RG.VERSION = '1.0.0';
RG.BUILD = 'regen-1.0.0';

/* ------------------------------------------------------------------ math */
var M = RG.M = {
  TAU: Math.PI * 2,
  clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
  clamp01: function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  /* frame-rate independent exponential smoothing */
  damp: function (a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); },
  inv: function (v, a, b) { return b === a ? 0 : (v - a) / (b - a); },
  map: function (v, a, b, c, d) { return c + (d - c) * ((v - a) / (b - a || 1)); },
  sign: function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); },
  dist: function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
  dist2: function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
  angle: function (x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
  /* shortest signed delta between two angles */
  angleDelta: function (a, b) {
    var d = (b - a) % M.TAU;
    if (d > Math.PI) d -= M.TAU; else if (d < -Math.PI) d += M.TAU;
    return d;
  },
  angleTowards: function (a, b, maxStep) {
    var d = M.angleDelta(a, b);
    if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
    return a + d;
  },
  round: Math.round,
  floor: Math.floor,
  /* easings */
  easeOutCubic: function (t) { var u = 1 - t; return 1 - u * u * u; },
  easeInCubic: function (t) { return t * t * t; },
  easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  easeOutQuad: function (t) { return t * (2 - t); },
  easeOutBack: function (t) { var c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
  easeOutElastic: function (t) {
    if (t === 0 || t === 1) return t;
    var p = 0.35;
    return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * M.TAU / p) + 1;
  },
  easeOutBounce: function (t) {
    var n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d; return n * t * t + 0.984375;
  },
  smoothstep: function (t) { t = M.clamp01(t); return t * t * (3 - 2 * t); },
  /* circle / rect overlap helpers */
  circleOverlap: function (x1, y1, r1, x2, y2, r2) {
    var dx = x2 - x1, dy = y2 - y1, r = r1 + r2;
    return dx * dx + dy * dy <= r * r;
  },
  rectOverlap: function (ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  },
  /* is point p inside the cone centred on `dir` with half-width `half`? */
  inCone: function (px, py, ox, oy, dir, half, range) {
    var dx = px - ox, dy = py - oy;
    if (dx * dx + dy * dy > range * range) return false;
    return Math.abs(M.angleDelta(dir, Math.atan2(dy, dx))) <= half;
  }
};

/* ------------------------------------------------------------------- rng */
/* Deterministic, fast, seedable PRNG (mulberry32). Every generator in the
 * game draws from one of these so worlds are reproducible from a seed. */
function Rng(seed) { this.s = (seed >>> 0) || 1; }
Rng.prototype.next = function () {
  this.s = (this.s + 0x6D2B79F5) >>> 0;
  var t = this.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
Rng.prototype.int = function (a, b) { return Math.floor(a + (b - a + 1) * this.next()); };
Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
Rng.prototype.chance = function (p) { return this.next() < p; };
Rng.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };
Rng.prototype.shuffle = function (arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(this.next() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
};
/* weighted pick: items is [{w:number, ...}] */
Rng.prototype.weighted = function (items) {
  var total = 0, i;
  for (i = 0; i < items.length; i++) total += items[i].w;
  var r = this.next() * total;
  for (i = 0; i < items.length; i++) { r -= items[i].w; if (r <= 0) return items[i]; }
  return items[items.length - 1];
};
RG.Rng = Rng;
RG.rng = new Rng(Date.now() & 0x7fffffff);
RG.hashStr = function (str) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/* ----------------------------------------------------------------- noise */
/* Value noise with fbm. Fast enough to generate a 256x256 world map in a
 * couple of milliseconds, and fully deterministic per seed. */
function Noise(seed) {
  this.p = new Uint8Array(512);
  var r = new Rng(seed), i, perm = new Uint8Array(256);
  for (i = 0; i < 256; i++) perm[i] = i;
  for (i = 255; i > 0; i--) { var j = r.int(0, i); var t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (i = 0; i < 512; i++) this.p[i] = perm[i & 255];
}
Noise.prototype.grad = function (hash, x, y) {
  switch (hash & 3) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    default: return -x - y;
  }
};
Noise.prototype.at = function (x, y) {
  var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  var xf = x - Math.floor(x), yf = y - Math.floor(y);
  var u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  var v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  var p = this.p;
  var aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
  var ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
  var x1 = M.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
  var x2 = M.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
  return M.lerp(x1, x2, v) * 0.5; /* roughly -1..1 */
};
Noise.prototype.fbm = function (x, y, octaves, lacunarity, gain) {
  octaves = octaves || 4; lacunarity = lacunarity || 2; gain = gain || 0.5;
  var amp = 1, freq = 1, sum = 0, norm = 0;
  for (var i = 0; i < octaves; i++) {
    sum += this.at(x * freq, y * freq) * amp;
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
};
Noise.prototype.ridged = function (x, y, octaves) {
  octaves = octaves || 4;
  var amp = 1, freq = 1, sum = 0, norm = 0;
  for (var i = 0; i < octaves; i++) {
    sum += (1 - Math.abs(this.at(x * freq, y * freq) * 2)) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
};
RG.Noise = Noise;

/* ---------------------------------------------------------------- colour */
var C = RG.Color = {
  /* h 0..360, s/l 0..1 */
  hsl: function (h, s, l, a) {
    return 'hsla(' + (h | 0) + ',' + (s * 100).toFixed(1) + '%,' + (l * 100).toFixed(1) + '%,' + (a === undefined ? 1 : a) + ')';
  },
  rgb: function (r, g, b, a) {
    return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (a === undefined ? 1 : a) + ')';
  },
  /* parse "#rrggbb" -> [r,g,b] */
  parseHex: function (hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  },
  hexToRgba: function (hex, a) {
    var c = C.parseHex(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  },
  mixHex: function (h1, h2, t) {
    var a = C.parseHex(h1), b = C.parseHex(h2);
    return C.toHex(
      Math.round(M.lerp(a[0], b[0], t)),
      Math.round(M.lerp(a[1], b[1], t)),
      Math.round(M.lerp(a[2], b[2], t)));
  },
  shade: function (hex, amount) {
    var c = C.parseHex(hex);
    var f = amount < 0 ? 0 : 255, t = amount < 0 ? -amount : amount;
    return C.toHex(
      Math.round(M.lerp(c[0], f, t)),
      Math.round(M.lerp(c[1], f, t)),
      Math.round(M.lerp(c[2], f, t)));
  },
  toHex: function (r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
};

/* ----------------------------------------------------------------- misc */
RG.fmt = function (n) {
  n = Math.floor(n);
  if (n < 1000) return '' + n;
  if (n < 1000000) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
};
RG.pad2 = function (n) { return n < 10 ? '0' + n : '' + n; };
RG.time = function (sec) {
  sec = Math.max(0, Math.floor(sec));
  var m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) return Math.floor(m / 60) + ':' + RG.pad2(m % 60) + ':' + RG.pad2(s);
  return m + ':' + RG.pad2(s);
};
RG.now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

/* Offscreen canvas helper used by every procedural sprite in the game. */
RG.makeCanvas = function (w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};
RG.ctxOf = function (canvas, alpha) {
  return canvas.getContext('2d', { alpha: alpha !== false, desynchronized: false });
};
