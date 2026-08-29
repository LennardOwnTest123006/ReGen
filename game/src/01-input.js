/* ReGen - unified input: keyboard, mouse, touch (twin virtual sticks) and
 * gamepad. Every consumer reads the same normalised state, so the rest of
 * the game never needs to know which device the player is on.
 *
 * Action state comes from three independent sources that are OR-ed together
 * every frame:
 *   _kb    latched by key/mouse events
 *   _touch level-triggered by on-screen buttons
 *   _pad   rebuilt from scratch each poll
 * Keeping them separate is what stops a gamepad button from "sticking" when
 * the pad is unplugged, or a touch release from cancelling a held key. */
'use strict';
(function (RG) {
  var M = RG.M;

  var ACTIONS = ['attack', 'dash', 'ability', 'interact', 'map', 'inventory', 'pause', 'confirm', 'cancel'];

  var KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
    KeyE: 'interact',
    KeyQ: 'ability', KeyF: 'ability',
    Tab: 'map', KeyM: 'map',
    KeyI: 'inventory', KeyB: 'inventory',
    Escape: 'pause', KeyP: 'pause',
    Enter: 'confirm',
    KeyJ: 'attack'
  };

  var Input = RG.Input = {
    moveX: 0, moveY: 0, moveLen: 0,
    aimX: 1, aimY: 0, aimAngle: 0, aiming: false,
    pointerX: 0, pointerY: 0, pointerInside: false,
    device: 'kbm',
    touchAvailable: false,
    enabled: true,
    padConnected: false,

    _dirs: { up: false, down: false, left: false, right: false },
    _padDirs: { up: false, down: false, left: false, right: false },
    _kb: {}, _touch: {}, _pad: {}, _pulse: {},
    _down: {}, _pressed: {}, _released: {}, _prev: {},
    _stickMove: { id: -1, ox: 0, oy: 0, x: 0, y: 0, active: false },
    _stickAim: { id: -1, ox: 0, oy: 0, x: 0, y: 0, active: false },
    _blockUntil: 0,
    _padAxes: { x: 0, y: 0 },

    isDown: function (a) { return this._down[a] === true; },
    justPressed: function (a) { return this._pressed[a] === true; },
    justReleased: function (a) { return this._released[a] === true; },
    consume: function (a) { this._pressed[a] = false; },
    block: function (ms) { this._blockUntil = RG.now() + ms; },
    /* drop every held state - used when a scene changes */
    reset: function () {
      this._kb = {}; this._touch = {}; this._pad = {}; this._pulse = {};
      this._dirs.up = this._dirs.down = this._dirs.left = this._dirs.right = false;
      stickEnd(this._stickMove); stickEnd(this._stickAim);
      for (var i = 0; i < ACTIONS.length; i++) {
        this._down[ACTIONS[i]] = false; this._pressed[ACTIONS[i]] = false;
        this._released[ACTIONS[i]] = false; this._prev[ACTIONS[i]] = false;
      }
      this.moveX = this.moveY = 0; this.moveLen = 0;
      var els = document.querySelectorAll('.tbtn.held');
      for (var j = 0; j < els.length; j++) els[j].classList.remove('held');
    }
  };

  /* ------------------------------------------------------------ keyboard */
  function onKey(e, isDown) {
    if (e.repeat) return;
    var code = e.code, a = KEYMAP[code];
    if (code.length === 6 && code.indexOf('Digit') === 0) Input._kb['slot' + code.charAt(5)] = isDown;
    if (!a) return;
    Input.device = 'kbm';
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
      Input._dirs[a] = isDown;
    } else {
      Input._kb[a] = isDown;
      /* A press shorter than one frame must still register: latch it until
       * the next update reads it. Without this a fast tap can vanish. */
      if (isDown) Input._pulse[a] = true;
      if (a === 'pause') { Input._kb.cancel = isDown; if (isDown) Input._pulse.cancel = true; }
    }
    if (code === 'Tab' || code === 'Space' || code.indexOf('Arrow') === 0) e.preventDefault();
  }

  /* ------------------------------------------------------------- gamepad */
  function pollGamepad() {
    var pad = null;
    if (navigator.getGamepads) {
      var pads = navigator.getGamepads();
      for (var i = 0; i < pads.length; i++) { if (pads[i] && pads[i].connected) { pad = pads[i]; break; } }
    }
    Input._pad = {};
    Input._padDirs.up = Input._padDirs.down = Input._padDirs.left = Input._padDirs.right = false;
    Input._padAxes.x = 0; Input._padAxes.y = 0;
    Input.padConnected = !!pad;
    if (!pad) return;

    var dead = 0.24;
    var ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    var len = Math.sqrt(ax * ax + ay * ay);
    if (len > dead) {
      var k = (len - dead) / (1 - dead) / len;
      Input._padAxes.x = ax * k; Input._padAxes.y = ay * k;
      Input.device = 'pad';
    }
    var rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
    var rl = Math.sqrt(rx * rx + ry * ry);
    if (rl > 0.32) {
      Input.aimX = rx / rl; Input.aimY = ry / rl;
      Input.aimAngle = Math.atan2(ry, rx);
      Input.aiming = true;
      Input.device = 'pad';
      Input._pad.attack = true;
    }
    var b = pad.buttons;
    function bt(n) { return !!(b[n] && b[n].pressed); }
    if (bt(0)) { Input._pad.dash = true; Input._pad.confirm = true; }
    if (bt(1)) { Input._pad.cancel = true; }
    if (bt(2)) Input._pad.interact = true;
    if (bt(3)) Input._pad.ability = true;
    if (bt(5) || bt(7)) Input._pad.attack = true;
    if (bt(4) || bt(6)) Input._pad.dash = true;
    if (bt(9)) Input._pad.pause = true;
    if (bt(8)) Input._pad.inventory = true;
    if (bt(16)) Input._pad.map = true;
    if (bt(12)) Input._padDirs.up = true;
    if (bt(13)) Input._padDirs.down = true;
    if (bt(14)) Input._padDirs.left = true;
    if (bt(15)) Input._padDirs.right = true;
    for (var n = 0; n < b.length && n < 17; n++) if (bt(n)) Input.device = 'pad';
  }

  /* --------------------------------------------------------------- touch */
  var STICK_MAX = 46;

  function stickBegin(stick, id, x, y) {
    stick.id = id; stick.ox = x; stick.oy = y; stick.x = 0; stick.y = 0; stick.active = true;
  }
  function stickMove(stick, x, y) {
    var dx = x - stick.ox, dy = y - stick.oy;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > STICK_MAX) {
      /* drag the origin along so the stick never feels stuck at the rim */
      var over = 1 - STICK_MAX / len;
      stick.ox += dx * over; stick.oy += dy * over;
      dx *= STICK_MAX / len; dy *= STICK_MAX / len;
    }
    stick.x = dx / STICK_MAX; stick.y = dy / STICK_MAX;
  }
  function stickEnd(stick) { stick.id = -1; stick.active = false; stick.x = 0; stick.y = 0; }

  Input.attachTouchButton = function (el, action) {
    if (!el) return;
    function down(e) {
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* capture is best-effort */ }
      Input._touch[action] = true;
      Input._pulse[action] = true;
      Input.device = 'touch';
      el.classList.add('held');
    }
    function up(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      Input._touch[action] = false;
      el.classList.remove('held');
    }
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointerup', up, { passive: false });
    el.addEventListener('pointercancel', up, { passive: false });
    el.addEventListener('lostpointercapture', up, { passive: false });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  /* --------------------------------------------------------------- setup */
  Input.init = function (canvas, touchLayer) {
    Input.touchAvailable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    window.addEventListener('keydown', function (e) { onKey(e, true); }, { passive: false });
    window.addEventListener('keyup', function (e) { onKey(e, false); }, { passive: false });
    window.addEventListener('blur', function () { Input.reset(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) Input.reset(); });

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    function pt(e) {
      var rect = canvas.getBoundingClientRect();
      Input.pointerX = e.clientX - rect.left;
      Input.pointerY = e.clientY - rect.top;
      Input.pointerInside = true;
    }
    /* Mouse is handled on the window rather than the canvas: the touch layer
     * and the HUD sit above the canvas, so a canvas-bound listener would
     * never see a click. UI hits are filtered out explicitly instead. */
    Input.isUITarget = function (t) {
      if (!t || !t.closest) return false;
      return !!t.closest('#screens, #touchControls, #hud button, .minimap');
    };
    function gameArea(e) {
      if (document.body.classList.contains('modal')) return false;
      return !Input.isUITarget(e.target);
    }
    window.addEventListener('mousemove', function (e) {
      pt(e);
      if (e.movementX !== 0 || e.movementY !== 0 || !Input.touchAvailable) Input.device = 'kbm';
    });
    window.addEventListener('mousedown', function (e) {
      if (!gameArea(e)) return;
      pt(e); Input.device = 'kbm';
      if (e.button === 0) { Input._kb.attack = true; Input._pulse.attack = true; }
      if (e.button === 2) { Input._kb.ability = true; Input._pulse.ability = true; }
      e.preventDefault();
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) Input._kb.attack = false;
      if (e.button === 2) Input._kb.ability = false;
    });

    if (touchLayer) {
      touchLayer.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse') return;
        Input.device = 'touch';
        var half = touchLayer.clientWidth * 0.5;
        if (e.clientX < half) { if (!Input._stickMove.active) stickBegin(Input._stickMove, e.pointerId, e.clientX, e.clientY); }
        else if (!Input._stickAim.active) stickBegin(Input._stickAim, e.pointerId, e.clientX, e.clientY);
        e.preventDefault();
      }, { passive: false });
      touchLayer.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'mouse') return;
        if (e.pointerId === Input._stickMove.id) stickMove(Input._stickMove, e.clientX, e.clientY);
        else if (e.pointerId === Input._stickAim.id) stickMove(Input._stickAim, e.clientX, e.clientY);
        e.preventDefault();
      }, { passive: false });
      var endPointer = function (e) {
        if (e.pointerId === Input._stickMove.id) stickEnd(Input._stickMove);
        else if (e.pointerId === Input._stickAim.id) stickEnd(Input._stickAim);
      };
      touchLayer.addEventListener('pointerup', endPointer, { passive: false });
      touchLayer.addEventListener('pointercancel', endPointer, { passive: false });
      touchLayer.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    /* keep the page from scrolling / pinch-zooming under the game */
    document.addEventListener('touchmove', function (e) {
      if (e.target && e.target.closest && e.target.closest('.scrollable')) return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });
  };

  /* Called once per frame before any system reads input. */
  Input.update = function () {
    var i, a;
    for (i = 0; i < ACTIONS.length; i++) { a = ACTIONS[i]; this._prev[a] = this._down[a] === true; }

    pollGamepad();

    /* ---- movement ---- */
    var mx = 0, my = 0;
    if (this._dirs.left || this._padDirs.left) mx -= 1;
    if (this._dirs.right || this._padDirs.right) mx += 1;
    if (this._dirs.up || this._padDirs.up) my -= 1;
    if (this._dirs.down || this._padDirs.down) my += 1;
    if (mx || my) { var l = Math.sqrt(mx * mx + my * my); mx /= l; my /= l; }

    if (this._padAxes.x || this._padAxes.y) { mx = this._padAxes.x; my = this._padAxes.y; }

    if (this._stickMove.active) {
      var sx = this._stickMove.x, sy = this._stickMove.y;
      var sl = Math.sqrt(sx * sx + sy * sy);
      if (sl > 0.16) {
        var t = M.clamp01((sl - 0.16) / 0.66);
        mx = sx / sl * t; my = sy / sl * t;
      } else { mx = 0; my = 0; }
    }
    this.moveX = mx; this.moveY = my;
    this.moveLen = Math.sqrt(mx * mx + my * my);
    if (this.moveLen > 1) { this.moveX /= this.moveLen; this.moveY /= this.moveLen; this.moveLen = 1; }

    /* ---- aim from the right touch stick ---- */
    var stickAttack = false;
    if (this._stickAim.active) {
      var axx = this._stickAim.x, ayy = this._stickAim.y;
      var al = Math.sqrt(axx * axx + ayy * ayy);
      if (al > 0.22) {
        this.aimX = axx / al; this.aimY = ayy / al;
        this.aimAngle = Math.atan2(ayy, axx);
        this.aiming = true;
        stickAttack = true;
      }
    } else if (!this.padConnected || this.device !== 'pad') {
      if (this.device !== 'pad') this.aiming = false;
    }

    /* ---- combine action sources ---- */
    var blocked = (RG.now() < this._blockUntil) || !this.enabled;
    for (i = 0; i < ACTIONS.length; i++) {
      a = ACTIONS[i];
      var v = (this._kb[a] === true) || (this._touch[a] === true) ||
        (this._pad[a] === true) || (this._pulse[a] === true);
      if (a === 'attack' && stickAttack) v = true;
      this._down[a] = blocked ? false : v;
    }
    this._pulse = {};
    if (blocked) { this.moveX = this.moveY = 0; this.moveLen = 0; this.aiming = false; }

    for (i = 0; i < ACTIONS.length; i++) {
      a = ACTIONS[i];
      this._pressed[a] = (this._down[a] === true) && !this._prev[a];
      this._released[a] = !(this._down[a] === true) && this._prev[a];
    }
  };

  Input.sticks = function () { return { move: Input._stickMove, aim: Input._stickAim }; };
})(RG);
