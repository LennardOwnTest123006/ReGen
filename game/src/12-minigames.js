/* ReGen - the arcade cabinets. Three self-contained mini-games that draw in
 * screen space on the same canvas the world uses. Each one exposes the same
 * four methods so the game loop does not need to know which is running. */
'use strict';
(function (RG) {
  var M = RG.M, V = RG.View, P = RG.Particles, D = RG.Draw, Art = RG.Art;
  var MG = RG.Minigames = {};

  /* Taps are collected here so every cabinet can poll them the same way. */
  var taps = [];
  MG.attach = function (canvas) {
    /* bound to the window because the touch layer covers the canvas */
    function record(target, clientX, clientY) {
      if (document.body.classList.contains('modal')) return;
      if (RG.Input.isUITarget && RG.Input.isUITarget(target)) return;
      var rect = canvas.getBoundingClientRect();
      taps.push({
        x: (clientX - rect.left) / V.scale,
        y: (clientY - rect.top) / V.scale,
        used: false
      });
      if (taps.length > 8) taps.shift();
    }
    if (typeof window.PointerEvent === 'function') {
      window.addEventListener('pointerdown', function (e) {
        record(e.target, e.clientX, e.clientY);
      });
    } else {
      window.addEventListener('mousedown', function (e) { record(e.target, e.clientX, e.clientY); });
      window.addEventListener('touchstart', function (e) {
        var t = e.changedTouches[0];
        if (t) record(e.target, t.clientX, t.clientY);
      }, { passive: true });
    }
  };
  function consumeTaps() { var t = taps.slice(); taps.length = 0; return t; }
  function clearTaps() { taps.length = 0; }

  function bg(ctx, top, bottom) {
    var grd = ctx.createLinearGradient(0, 0, 0, V.h);
    grd.addColorStop(0, top); grd.addColorStop(1, bottom);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, V.w, V.h);
  }
  function headline(ctx, title, score, best, sub) {
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(220,235,255,0.9)';
    ctx.fillText(title, 16, 14);
    ctx.textAlign = 'right';
    ctx.font = '800 26px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(RG.fmt(Math.floor(score)), V.w - 16, 10);
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(190,210,240,0.7)';
    ctx.fillText('best ' + RG.fmt(best), V.w - 16, 40);
    if (sub) {
      ctx.textAlign = 'left';
      ctx.fillText(sub, 16, 34);
    }
    ctx.restore();
  }

  /* ==================================================== 1. PULSE RUNNER */
  /* A vertical-scrolling dodge run. Gates narrow, speed climbs, orbs give
   * score and a brief shield. Reads identically with a stick or a mouse. */
  MG.pulse = {
    id: 'pulse',
    init: function (g) {
      this.t = 0; this.score = 0; this.speed = 190; this.px = V.w * 0.5;
      this.gates = []; this.orbs = []; this.next = 0.6;
      this.dead = false; this.deadT = 0; this.shield = 0; this.streak = 0;
      this.stars = [];
      for (var i = 0; i < 70; i++) {
        this.stars.push({ x: Math.random() * V.w, y: Math.random() * V.h, s: Math.random() * 1.6 + 0.4, v: Math.random() * 0.7 + 0.3 });
      }
      RG.Audio.playMusic('arcade');
      RG.Audio.setIntensity(0.6);
      clearTaps();
    },
    update: function (dt, g) {
      if (this.dead) {
        this.deadT += dt;
        if (this.deadT > 1.4) g.endMinigame(this.id, this.score);
        return;
      }
      this.t += dt;
      this.speed = 190 + this.t * 13;
      this.score += dt * this.speed * 0.12;
      RG.Audio.setIntensity(M.clamp01(0.35 + this.t / 90));

      var In = RG.Input;
      var move = In.moveX;
      if (In.pointerInside && In.device === 'kbm' && !move) {
        var target = In.pointerX / V.scale;
        move = M.clamp((target - this.px) / 60, -1, 1);
      }
      var tps = consumeTaps();
      if (tps.length && In.device === 'touch') {
        /* a tap on either side nudges the runner that way */
        var last = tps[tps.length - 1];
        move = last.x < V.w * 0.5 ? -1 : 1;
      }
      this.px += move * 330 * dt;
      this.px = M.clamp(this.px, 16, V.w - 16);

      this.next -= dt;
      if (this.next <= 0) {
        this.next = M.clamp(0.92 - this.t * 0.006, 0.34, 0.92);
        var gapW = M.clamp(150 - this.t * 0.85, 62, 150);
        var gapX = 30 + Math.random() * (V.w - 60 - gapW);
        this.gates.push({ y: -20, gx: gapX, gw: gapW, passed: false });
        if (Math.random() < 0.6) {
          this.orbs.push({ x: gapX + gapW * 0.5 + (Math.random() - 0.5) * gapW * 0.5, y: -60, got: false });
        }
      }

      var py = V.h - 74;
      var i;
      for (i = this.gates.length - 1; i >= 0; i--) {
        var gt = this.gates[i];
        gt.y += this.speed * dt;
        if (!gt.passed && gt.y > py + 8) {
          gt.passed = true;
          this.streak++;
          this.score += 25 + this.streak * 2;
          RG.Audio.play('coin');
          P.burst(this.px, py, 8, '#7fe0ff', { speed: 90, life: 0.4, size: 2.6, glow: 1 });
        }
        if (gt.y > py - 8 && gt.y < py + 12) {
          if (this.px < gt.gx || this.px > gt.gx + gt.gw) {
            if (this.shield > 0) {
              this.shield = 0;
              gt.gx = -1000; gt.gw = 4000;
              RG.Audio.play('hurt');
              P.ring(this.px, py, 60, 'rgba(140,220,255,0.9)', 0.4, 4);
            } else {
              this.dead = true;
              RG.Audio.play('fail');
              RG.Cam.addShake(10);
              P.burst(this.px, py, 40, '#ff5fa2', { speed: 200, life: 0.9, size: 4, glow: 1 });
            }
          }
        }
        if (gt.y > V.h + 40) this.gates.splice(i, 1);
      }
      for (i = this.orbs.length - 1; i >= 0; i--) {
        var o = this.orbs[i];
        o.y += this.speed * dt;
        if (!o.got && M.dist2(o.x, o.y, this.px, py) < 400) {
          o.got = true;
          this.score += 120;
          this.shield = 1;
          RG.Audio.play('gem');
          P.burst(o.x, o.y, 16, '#ffd76a', { speed: 140, life: 0.55, size: 3.4, glow: 1 });
        }
        if (o.y > V.h + 30 || o.got) this.orbs.splice(i, 1);
      }
      for (i = 0; i < this.stars.length; i++) {
        var st = this.stars[i];
        st.y += this.speed * st.v * dt;
        if (st.y > V.h) { st.y = -4; st.x = Math.random() * V.w; }
      }
      if (Math.random() < dt * 40) {
        P.spawn(this.px + (Math.random() - 0.5) * 10, py + 10, (Math.random() - 0.5) * 30, 120, 0.4, 3, '#7fe0ff', 0, { glow: 1, drag: 0.9 });
      }
    },
    draw: function (ctx, g) {
      bg(ctx, '#0c1030', '#1a1044');
      var i;
      ctx.save();
      for (i = 0; i < this.stars.length; i++) {
        var st = this.stars[i];
        ctx.globalAlpha = 0.2 + st.v * 0.5;
        ctx.fillStyle = '#9fd8ff';
        ctx.fillRect(st.x, st.y, st.s, st.s * 3);
      }
      ctx.restore();

      for (i = 0; i < this.gates.length; i++) {
        var gt = this.gates[i];
        ctx.fillStyle = 'rgba(255,95,162,0.85)';
        ctx.shadowColor = '#ff5fa2'; ctx.shadowBlur = 14;
        ctx.fillRect(0, gt.y - 5, Math.max(0, gt.gx), 10);
        ctx.fillRect(gt.gx + gt.gw, gt.y - 5, Math.max(0, V.w - gt.gx - gt.gw), 10);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(127,224,255,0.22)';
        ctx.fillRect(gt.gx, gt.y - 2, gt.gw, 4);
      }
      for (i = 0; i < this.orbs.length; i++) {
        var o = this.orbs[i];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffd76a';
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(o.x, o.y, 14, 0, M.TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, M.TAU); ctx.fill();
        ctx.restore();
      }

      var py = V.h - 74;
      if (!this.dead) {
        ctx.save();
        ctx.translate(this.px, py);
        if (this.shield > 0) {
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#8cd8ff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, 17, 0, M.TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = '#7fffd4';
        ctx.shadowColor = '#7fffd4'; ctx.shadowBlur = 16;
        D.poly(ctx, 0, 0, 11, 3, -Math.PI / 2);
        ctx.fill();
        ctx.restore();
      }
      P.draw(ctx);
      headline(ctx, 'PULSE RUNNER', this.score, g.save.best.pulse || 0, 'streak ' + this.streak);
      if (this.dead) centerText(ctx, 'RUN ENDED', RG.fmt(Math.floor(this.score)) + ' points');
    }
  };

  /* ===================================================== 2. ESSENCE MATCH */
  /* Tap a group of three or more touching essences to clear it. The grid
   * refills from the top; the timer is the pressure. */
  MG.match = {
    id: 'match',
    COLORS: ['#7fe0ff', '#ff5fa2', '#7fffd4', '#ffd76a', '#c08aff'],
    init: function (g) {
      this.cols = 8; this.rows = 8;
      this.cell = Math.min((V.w - 40) / this.cols, (V.h - 110) / this.rows);
      this.ox = (V.w - this.cell * this.cols) * 0.5;
      this.oy = 72;
      this.grid = [];
      this.score = 0; this.time = 75; this.combo = 0; this.comboT = 0;
      this.rng = new RG.Rng((Date.now() ^ 0x5bf03) >>> 0);
      for (var i = 0; i < this.cols * this.rows; i++) this.grid.push(this.rng.int(0, 4));
      this.pop = [];
      this.ended = false; this.endT = 0;
      this.ensureMove();
      RG.Audio.playMusic('arcade');
      RG.Audio.setIntensity(0.35);
      clearTaps();
    },
    at: function (x, y) {
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return -1;
      return this.grid[y * this.cols + x];
    },
    flood: function (x, y, out) {
      var color = this.at(x, y);
      if (color < 0) return out;
      var stack = [[x, y]], seen = {};
      while (stack.length) {
        var c = stack.pop();
        var k = c[1] * this.cols + c[0];
        if (seen[k]) continue;
        if (this.at(c[0], c[1]) !== color) continue;
        seen[k] = 1;
        out.push(k);
        stack.push([c[0] + 1, c[1]]); stack.push([c[0] - 1, c[1]]);
        stack.push([c[0], c[1] + 1]); stack.push([c[0], c[1] - 1]);
      }
      return out;
    },
    ensureMove: function () {
      for (var y = 0; y < this.rows; y++) {
        for (var x = 0; x < this.cols; x++) {
          var out = [];
          this.flood(x, y, out);
          if (out.length >= 3) return true;
        }
      }
      /* no legal move: reshuffle rather than soft-lock the player */
      for (var i = 0; i < this.grid.length; i++) this.grid[i] = this.rng.int(0, 4);
      return this.ensureMove();
    },
    update: function (dt, g) {
      if (this.ended) {
        this.endT += dt;
        if (this.endT > 1.6) g.endMinigame(this.id, this.score);
        return;
      }
      this.time -= dt;
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
      if (this.time <= 0) {
        this.time = 0; this.ended = true;
        RG.Audio.play('win');
        return;
      }
      var tps = consumeTaps();
      for (var t = 0; t < tps.length; t++) {
        var gx = Math.floor((tps[t].x - this.ox) / this.cell);
        var gy = Math.floor((tps[t].y - this.oy) / this.cell);
        if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
        this.tryClear(gx, gy);
      }
      for (var i = this.pop.length - 1; i >= 0; i--) {
        this.pop[i].t -= dt;
        if (this.pop[i].t <= 0) this.pop.splice(i, 1);
      }
    },
    tryClear: function (gx, gy) {
      var out = [];
      this.flood(gx, gy, out);
      if (out.length < 3) { RG.Audio.play('error'); return; }
      this.combo++;
      this.comboT = 3;
      var gained = out.length * out.length * 6 * (1 + this.combo * 0.12);
      this.score += gained;
      this.time = Math.min(90, this.time + Math.min(4, out.length * 0.32));
      RG.Audio.play(out.length >= 6 ? 'gem' : 'coin');
      for (var i = 0; i < out.length; i++) {
        var k = out[i];
        var cx = this.ox + (k % this.cols) * this.cell + this.cell * 0.5;
        var cy = this.oy + Math.floor(k / this.cols) * this.cell + this.cell * 0.5;
        this.pop.push({ x: cx, y: cy, t: 0.3, c: this.COLORS[this.grid[k]] });
        P.burst(cx, cy, 5, this.COLORS[this.grid[k]], { speed: 90, life: 0.45, size: 2.6, glow: 1 });
        this.grid[k] = -1;
      }
      RG.FloatText.add(this.ox + gx * this.cell + this.cell * 0.5, this.oy + gy * this.cell,
        '+' + Math.round(gained), '#ffd76a', 13, out.length >= 6);
      this.collapse();
      this.ensureMove();
    },
    collapse: function () {
      for (var x = 0; x < this.cols; x++) {
        var write = this.rows - 1;
        for (var y = this.rows - 1; y >= 0; y--) {
          var v = this.grid[y * this.cols + x];
          if (v >= 0) { this.grid[write * this.cols + x] = v; write--; }
        }
        for (; write >= 0; write--) this.grid[write * this.cols + x] = this.rng.int(0, 4);
      }
    },
    draw: function (ctx, g) {
      bg(ctx, '#10142c', '#1c1240');
      var s = this.cell;
      for (var y = 0; y < this.rows; y++) {
        for (var x = 0; x < this.cols; x++) {
          var v = this.grid[y * this.cols + x];
          if (v < 0) continue;
          var cx = this.ox + x * s, cy = this.oy + y * s;
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          D.roundRect(ctx, cx + 2, cy + 2, s - 4, s - 4, 6); ctx.fill();
          ctx.fillStyle = this.COLORS[v];
          ctx.save();
          ctx.globalAlpha = 0.92;
          D.poly(ctx, cx + s * 0.5, cy + s * 0.5, s * 0.32, 6, Math.PI / 6);
          ctx.fill();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          D.poly(ctx, cx + s * 0.5, cy + s * 0.44, s * 0.15, 6, Math.PI / 6);
          ctx.fill();
          ctx.restore();
        }
      }
      for (var i = 0; i < this.pop.length; i++) {
        var p = this.pop[i];
        ctx.save();
        ctx.globalAlpha = p.t / 0.3;
        ctx.strokeStyle = p.c; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, (1 - p.t / 0.3) * s * 0.7, 0, M.TAU); ctx.stroke();
        ctx.restore();
      }
      /* timer */
      var tw = V.w - 32;
      D.bar(ctx, 16, V.h - 26, tw, 10, this.time / 90, this.time < 15 ? '#ff5fa2' : '#7fffd4', 'rgba(0,0,0,0.45)');
      P.draw(ctx);
      RG.FloatText.draw(ctx);
      headline(ctx, 'ESSENCE MATCH', this.score, g.save.best.match || 0,
        this.combo > 1 ? 'chain x' + this.combo : 'tap groups of 3+');
      if (this.ended) centerText(ctx, 'TIME', RG.fmt(Math.floor(this.score)) + ' points');
    }
  };

  /* ======================================================= 3. SKY ANGLER */
  /* Hold to lift the bracket, release to let it fall; keep the fish inside
   * it to fill the catch bar before patience runs out. */
  MG.angler = {
    id: 'angler',
    init: function (g) {
      this.score = 0; this.caught = 0;
      this.barY = 0.5; this.barV = 0; this.barH = 0.26;
      this.fishY = 0.5; this.fishV = 0; this.fishT = 0;
      this.progress = 0.28; this.patience = 1;
      this.round = 1; this.state = 'fishing';
      this.stateT = 0; this.ended = false; this.endT = 0;
      this.lives = 3; this._tapHold = 0;
      this.fishName = 'Glimmerfin';
      this.difficulty = 1;
      RG.Audio.playMusic('arcade');
      RG.Audio.setIntensity(0.25);
      clearTaps();
    },
    newFish: function () {
      var names = ['Glimmerfin', 'Rift Eel', 'Ashscale', 'Frost Pike', 'Voidcarp', 'Sunperch', 'Dusk Ray'];
      this.fishName = names[(Math.random() * names.length) | 0];
      this.difficulty = 1 + this.round * 0.16;
      this.barH = Math.max(0.13, 0.26 - this.round * 0.012);
      this.progress = 0.28;
      this.patience = 1;
      this.fishY = 0.5; this.fishV = 0; this.fishT = 0;
      this.state = 'fishing';
    },
    update: function (dt, g) {
      if (this.ended) {
        this.endT += dt;
        if (this.endT > 1.5) g.endMinigame(this.id, this.score);
        return;
      }
      if (this.state === 'caught' || this.state === 'lost') {
        this.stateT -= dt;
        if (this.stateT <= 0) { this.round++; this.newFish(); }
        return;
      }

      var In = RG.Input;
      var lifting = In.isDown('attack') || In.isDown('confirm') || In.isDown('dash') || In.moveY < -0.3;
      var tps = consumeTaps();
      if (tps.length) this._tapHold = 0.16;
      if (this._tapHold > 0) { this._tapHold -= dt; lifting = true; }

      this.barV += (lifting ? -1.75 : 1.35) * dt;
      this.barV *= Math.pow(0.9, dt * 60);
      this.barY += this.barV * dt;
      if (this.barY < 0) { this.barY = 0; this.barV = Math.max(0, this.barV); }
      if (this.barY > 1 - this.barH) { this.barY = 1 - this.barH; this.barV = Math.min(0, this.barV); }

      this.fishT -= dt;
      if (this.fishT <= 0) {
        this.fishT = 0.35 + Math.random() * 1.1 / this.difficulty;
        this.fishV = (Math.random() - 0.5) * 1.5 * this.difficulty;
      }
      this.fishY += this.fishV * dt;
      if (this.fishY < 0.02) { this.fishY = 0.02; this.fishV = Math.abs(this.fishV); }
      if (this.fishY > 0.98) { this.fishY = 0.98; this.fishV = -Math.abs(this.fishV); }

      var inside = this.fishY >= this.barY && this.fishY <= this.barY + this.barH;
      this.progress += (inside ? 0.42 : -0.36) * dt;
      this.progress = M.clamp01(this.progress);
      if (!inside) this.patience -= dt * 0.17;

      if (this.progress >= 1) {
        var pts = Math.round(140 * this.difficulty + this.round * 25);
        this.score += pts;
        this.caught++;
        this.state = 'caught'; this.stateT = 1.1;
        RG.Audio.play('win');
        P.burst(V.w * 0.5, V.h * 0.5, 26, '#7fffd4', { speed: 170, life: 0.7, size: 4, glow: 1 });
        RG.FloatText.add(V.w * 0.5, V.h * 0.45, '+' + pts, '#7fffd4', 16, true);
      } else if (this.patience <= 0) {
        this.state = 'lost'; this.stateT = 1;
        RG.Audio.play('fail');
        this.lives--;
        if (this.lives <= 0) this.ended = true;
      }
    },
    draw: function (ctx, g) {
      bg(ctx, '#0d1a2e', '#123048');
      var cx = V.w * 0.5;
      var trackX = cx + 90, trackY = 70, trackH = V.h - 140, trackW = 34;

      /* scenery */
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#7fe0ff';
      for (var i = 0; i < 6; i++) {
        var y = 60 + i * 40 + Math.sin(RG.now() / 900 + i) * 6;
        ctx.fillRect(20, y, cx - 30, 2);
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(6,14,26,0.72)';
      D.roundRect(ctx, trackX, trackY, trackW, trackH, 16); ctx.fill();

      var by = trackY + this.barY * trackH;
      var bh = this.barH * trackH;
      ctx.fillStyle = 'rgba(127,255,212,0.28)';
      D.roundRect(ctx, trackX + 3, by, trackW - 6, bh, 10); ctx.fill();
      ctx.strokeStyle = '#7fffd4'; ctx.lineWidth = 2;
      D.roundRect(ctx, trackX + 3, by, trackW - 6, bh, 10); ctx.stroke();

      var fy = trackY + this.fishY * trackH;
      ctx.save();
      ctx.translate(trackX + trackW * 0.5, fy);
      ctx.fillStyle = '#ffd76a';
      ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, M.TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(-18, -6); ctx.lineTo(-18, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      /* progress + patience */
      D.bar(ctx, trackX + trackW + 14, trackY, 12, trackH, 0, '#000', 'rgba(0,0,0,0.5)');
      ctx.fillStyle = '#7fffd4';
      var ph = trackH * this.progress;
      D.roundRect(ctx, trackX + trackW + 15, trackY + trackH - ph, 10, ph, 5); ctx.fill();
      D.bar(ctx, cx - 190, V.h - 40, 200, 10, Math.max(0, this.patience), '#ff5fa2', 'rgba(0,0,0,0.45)');

      ctx.save();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.fishName, 30, V.h * 0.42);
      ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(200,225,255,0.7)';
      ctx.fillText('Round ' + this.round + '  -  caught ' + this.caught, 30, V.h * 0.42 + 24);
      ctx.fillText(RG.Input.device === 'touch' ? 'Tap to lift the bracket' : 'Hold click / space to lift', 30, V.h * 0.42 + 44);
      ctx.fillText('Lives: ' + Math.max(0, this.lives), 30, V.h * 0.42 + 64);
      ctx.restore();

      P.draw(ctx);
      RG.FloatText.draw(ctx);
      headline(ctx, 'SKY ANGLER', this.score, g.save.best.angler || 0, null);
      if (this.state === 'caught') centerText(ctx, 'CAUGHT', this.fishName);
      if (this.state === 'lost' && !this.ended) centerText(ctx, 'IT GOT AWAY', '');
      if (this.ended) centerText(ctx, 'DONE', RG.fmt(Math.floor(this.score)) + ' points');
    }
  };

  function centerText(ctx, big, small) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(6,9,20,0.55)';
    ctx.fillRect(0, V.h * 0.5 - 56, V.w, 112);
    ctx.font = '900 44px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(big, V.w * 0.5, V.h * 0.5 - 12);
    if (small) {
      ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(200,225,255,0.85)';
      ctx.fillText(small, V.w * 0.5, V.h * 0.5 + 26);
    }
    ctx.restore();
  }

  MG.get = function (id) { return MG[id] || null; };
})(RG);
