/* ReGen - fully procedural audio. There are no sound files in this game:
 * every effect and every bar of music is synthesised at runtime with the
 * Web Audio API. That keeps the download tiny, removes all asset-loading
 * stalls, and lets the soundtrack react to what is happening on screen. */
'use strict';
(function (RG) {
  var M = RG.M;

  var A = RG.Audio = {
    ctx: null,
    ready: false,
    master: null, musicBus: null, sfxBus: null, reverb: null, reverbSend: null,
    musicVol: 0.55, sfxVol: 0.8, masterVol: 0.9, muted: false,
    _track: null, _nextNote: 0, _step: 0, _timer: null,
    _intensity: 0, _intensityTarget: 0,
    _voices: 0, _lastSfx: {}
  };

  /* -------------------------------------------------------------- set-up */
  A.init = function () {
    if (A.ctx) return true;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    try { A.ctx = new Ctor({ latencyHint: 'interactive' }); } catch (e) { return false; }

    var ctx = A.ctx;
    A.master = ctx.createGain(); A.master.gain.value = A.muted ? 0 : A.masterVol;
    /* a gentle limiter keeps dense combat from clipping */
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    A.master.connect(comp); comp.connect(ctx.destination);

    A.musicBus = ctx.createGain(); A.musicBus.gain.value = A.musicVol; A.musicBus.connect(A.master);
    A.sfxBus = ctx.createGain(); A.sfxBus.gain.value = A.sfxVol; A.sfxBus.connect(A.master);

    A.reverb = ctx.createConvolver();
    A.reverb.buffer = makeImpulse(ctx, 2.2, 2.6);
    A.reverbSend = ctx.createGain(); A.reverbSend.gain.value = 0.32;
    A.reverb.connect(A.reverbSend); A.reverbSend.connect(A.master);

    A.ready = true;
    return true;
  };

  /* Browsers require a user gesture before audio may start. */
  A.unlock = function () {
    if (!A.init()) return;
    if (A.ctx.state === 'suspended') A.ctx.resume()['catch'](function () { });
  };

  function makeImpulse(ctx, seconds, decay) {
    var rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.2);
      }
    }
    return buf;
  }

  var noiseBuf = null;
  function noise(ctx) {
    if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
      var len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    return src;
  }

  A.setVolumes = function (master, music, sfx) {
    A.masterVol = M.clamp01(master); A.musicVol = M.clamp01(music); A.sfxVol = M.clamp01(sfx);
    if (!A.ready) return;
    A.master.gain.value = A.muted ? 0 : A.masterVol;
    A.musicBus.gain.value = A.musicVol;
    A.sfxBus.gain.value = A.sfxVol;
  };
  A.setMuted = function (m) { A.muted = m; if (A.ready) A.master.gain.value = m ? 0 : A.masterVol; };

  /* ---------------------------------------------------------------- sfx */
  /* Small helper so effects read declaratively rather than as a wall of
   * connect() calls. Every voice disconnects itself when it finishes. */
  function voice(type, freq, dur, opts) {
    if (!A.ready || A.muted || A.sfxVol <= 0) return null;
    opts = opts || {};
    var ctx = A.ctx, t = ctx.currentTime;
    if (A._voices > 26) return null;    /* hard cap: never let SFX starve the frame */
    A._voices++;

    var osc;
    if (type === 'noise') { osc = noise(ctx); }
    else { osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t); }

    var gain = ctx.createGain();
    var vol = (opts.vol === undefined ? 0.35 : opts.vol);
    var atk = opts.attack === undefined ? 0.005 : opts.attack;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    var node = osc;
    if (opts.filter) {
      var f = ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.setValueAtTime(opts.cutoff || 1200, t);
      if (opts.cutoffEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.cutoffEnd), t + dur);
      f.Q.value = opts.q || 1;
      node.connect(f); node = f;
    }
    node.connect(gain);
    gain.connect(A.sfxBus);
    if (opts.reverb) { var rs = ctx.createGain(); rs.gain.value = opts.reverb; gain.connect(rs); rs.connect(A.reverb); }

    if (osc.frequency && opts.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t + (opts.sweep || dur));
    }
    if (osc.detune && opts.detune) osc.detune.setValueAtTime(opts.detune, t);

    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = function () {
      A._voices--;
      try { gain.disconnect(); osc.disconnect(); } catch (e) { /* already torn down */ }
    };
    return gain;
  }

  /* throttle: identical effects fired in the same millisecond band collapse */
  function throttled(name, ms) {
    var now = RG.now();
    if (A._lastSfx[name] && now - A._lastSfx[name] < ms) return false;
    A._lastSfx[name] = now;
    return true;
  }

  var SFX = {
    swing: function () {
      voice('noise', 0, 0.16, { vol: 0.16, filter: 'bandpass', cutoff: 1800, cutoffEnd: 620, q: 1.4 });
    },
    hit: function (p) {
      var f = 190 + (p || 0) * 90;
      voice('square', f, 0.12, { vol: 0.22, freqEnd: f * 0.4, filter: 'lowpass', cutoff: 2600 });
      voice('noise', 0, 0.1, { vol: 0.2, filter: 'highpass', cutoff: 900 });
    },
    crit: function () {
      voice('sawtooth', 520, 0.24, { vol: 0.24, freqEnd: 190, filter: 'lowpass', cutoff: 3600, reverb: 0.2 });
      voice('noise', 0, 0.16, { vol: 0.22, filter: 'highpass', cutoff: 1600 });
    },
    hurt: function () {
      voice('sawtooth', 220, 0.3, { vol: 0.3, freqEnd: 70, filter: 'lowpass', cutoff: 1400 });
    },
    dash: function () {
      voice('noise', 0, 0.26, { vol: 0.18, filter: 'bandpass', cutoff: 380, cutoffEnd: 2600, q: 2 });
    },
    coin: function () {
      if (!throttled('coin', 32)) return;
      voice('triangle', 880, 0.09, { vol: 0.16 });
      voice('triangle', 1320, 0.14, { vol: 0.13, reverb: 0.15 });
    },
    gem: function () {
      voice('sine', 1180, 0.5, { vol: 0.2, reverb: 0.5 });
      voice('sine', 1770, 0.6, { vol: 0.14, reverb: 0.5 });
      voice('sine', 2360, 0.4, { vol: 0.08, reverb: 0.5 });
    },
    pickup: function () {
      voice('triangle', 660, 0.1, { vol: 0.16 });
      voice('triangle', 990, 0.16, { vol: 0.12, reverb: 0.2 });
    },
    levelup: function () {
      var n = [523, 659, 784, 1047];
      for (var i = 0; i < n.length; i++) {
        (function (i) {
          setTimeout(function () { voice('triangle', n[i], 0.42, { vol: 0.24, reverb: 0.4 }); }, i * 88);
        })(i);
      }
    },
    unlock: function () {
      var n = [392, 523, 659, 784, 1047];
      for (var i = 0; i < n.length; i++) {
        (function (i) {
          setTimeout(function () {
            voice('sine', n[i], 0.7, { vol: 0.2, reverb: 0.55 });
            voice('triangle', n[i] * 2, 0.3, { vol: 0.08, reverb: 0.4 });
          }, i * 70);
        })(i);
      }
    },
    ui: function () { voice('sine', 660, 0.06, { vol: 0.1 }); },
    uiBack: function () { voice('sine', 420, 0.08, { vol: 0.1 }); },
    error: function () { voice('square', 150, 0.16, { vol: 0.14, freqEnd: 96, filter: 'lowpass', cutoff: 900 }); },
    buy: function () {
      voice('triangle', 700, 0.1, { vol: 0.16 });
      setTimeout(function () { voice('triangle', 1050, 0.24, { vol: 0.15, reverb: 0.3 }); }, 70);
    },
    shoot: function () {
      if (!throttled('shoot', 26)) return;
      voice('square', 720, 0.1, { vol: 0.12, freqEnd: 260, filter: 'lowpass', cutoff: 3200 });
    },
    explode: function () {
      voice('noise', 0, 0.6, { vol: 0.32, filter: 'lowpass', cutoff: 1800, cutoffEnd: 110, reverb: 0.4 });
      voice('sine', 110, 0.4, { vol: 0.3, freqEnd: 34 });
    },
    door: function () {
      voice('noise', 0, 0.7, { vol: 0.16, filter: 'lowpass', cutoff: 700, cutoffEnd: 180, reverb: 0.4 });
      voice('sine', 82, 0.6, { vol: 0.2, freqEnd: 48 });
    },
    boss: function () {
      voice('sawtooth', 82, 1.6, { vol: 0.3, freqEnd: 41, filter: 'lowpass', cutoff: 700, reverb: 0.7 });
      voice('sawtooth', 61, 1.9, { vol: 0.22, freqEnd: 30, filter: 'lowpass', cutoff: 500, reverb: 0.7 });
    },
    heal: function () {
      voice('sine', 520, 0.5, { vol: 0.16, freqEnd: 900, sweep: 0.35, reverb: 0.4 });
    },
    portal: function () {
      voice('sawtooth', 90, 1.1, { vol: 0.18, freqEnd: 700, sweep: 0.9, filter: 'lowpass', cutoff: 2400, reverb: 0.6 });
    },
    step: function () {
      if (!throttled('step', 90)) return;
      voice('noise', 0, 0.07, { vol: 0.05, filter: 'bandpass', cutoff: 420, q: 1.2 });
    },
    splash: function () {
      if (!throttled('splash', 120)) return;
      voice('noise', 0, 0.2, { vol: 0.09, filter: 'bandpass', cutoff: 1400, cutoffEnd: 500, q: 1.1 });
    },
    charge: function () {
      voice('sine', 180, 0.7, { vol: 0.12, freqEnd: 620, sweep: 0.65, reverb: 0.3 });
    },
    fail: function () {
      voice('sawtooth', 300, 0.7, { vol: 0.2, freqEnd: 70, filter: 'lowpass', cutoff: 1200 });
    },
    win: function () {
      var n = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < n.length; i++) {
        (function (i) { setTimeout(function () { voice('triangle', n[i], 0.5, { vol: 0.2, reverb: 0.5 }); }, i * 95); })(i);
      }
    }
  };

  A.play = function (name, param) {
    if (!A.ready || A.muted) return;
    var fn = SFX[name];
    if (fn) { try { fn(param); } catch (e) { /* audio must never break gameplay */ } }
  };

  /* -------------------------------------------------------------- music */
  /* A tiny generative sequencer. Each world supplies a key, a tempo, a
   * chord progression and a texture; the sequencer improvises inside it and
   * layers in extra parts as combat intensity rises. */
  var SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    pentaMinor: [0, 3, 5, 7, 10]
  };

  var TRACKS = {
    hub: { bpm: 84, root: 57, scale: 'dorian', chords: [0, 5, 3, 4], pad: 'triangle', lead: 'triangle', drums: 0.25, bright: 1600, warmth: 0.5 },
    verdant: { bpm: 96, root: 55, scale: 'dorian', chords: [0, 4, 5, 3], pad: 'triangle', lead: 'triangle', drums: 0.5, bright: 1900, warmth: 0.45 },
    ember: { bpm: 112, root: 52, scale: 'phrygian', chords: [0, 1, 5, 4], pad: 'sawtooth', lead: 'square', drums: 0.8, bright: 1500, warmth: 0.3 },
    frost: { bpm: 88, root: 60, scale: 'aeolian', chords: [0, 5, 3, 6], pad: 'sine', lead: 'triangle', drums: 0.4, bright: 2600, warmth: 0.7 },
    void: { bpm: 128, root: 50, scale: 'phrygian', chords: [0, 6, 1, 5], pad: 'sawtooth', lead: 'sawtooth', drums: 0.95, bright: 1200, warmth: 0.2 },
    dungeon: { bpm: 104, root: 53, scale: 'minor', chords: [0, 3, 5, 1], pad: 'sawtooth', lead: 'square', drums: 0.7, bright: 1300, warmth: 0.3 },
    boss: { bpm: 140, root: 48, scale: 'phrygian', chords: [0, 1, 0, 5], pad: 'sawtooth', lead: 'square', drums: 1.0, bright: 1400, warmth: 0.2 },
    arcade: { bpm: 124, root: 62, scale: 'lydian', chords: [0, 3, 4, 5], pad: 'triangle', lead: 'square', drums: 0.8, bright: 3000, warmth: 0.8 },
    menu: { bpm: 72, root: 57, scale: 'lydian', chords: [0, 4, 5, 2], pad: 'sine', lead: 'triangle', drums: 0.0, bright: 2400, warmth: 0.8 }
  };

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  A.setIntensity = function (v) { A._intensityTarget = M.clamp01(v); };

  A.playMusic = function (name) {
    if (!A.ready) return;
    var t = TRACKS[name] || TRACKS.hub;
    if (A._trackName === name) return;
    A._trackName = name;
    A._track = t;
    A._rng = new RG.Rng(RG.hashStr(name) ^ 0x51ed);
    A._step = 0;
    A._nextNote = A.ctx.currentTime + 0.08;
    if (!A._timer) A._timer = setInterval(scheduler, 26);
  };
  A.stopMusic = function () {
    A._trackName = null; A._track = null;
    if (A._timer) { clearInterval(A._timer); A._timer = null; }
  };

  function note(type, freq, start, dur, vol, cutoff, rev, detune) {
    var ctx = A.ctx;
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (detune) osc.detune.setValueAtTime(detune, start);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + Math.min(0.05, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, start); f.Q.value = 0.7;
    osc.connect(f); f.connect(g); g.connect(A.musicBus);
    if (rev) { var rg = ctx.createGain(); rg.gain.value = rev; g.connect(rg); rg.connect(A.reverb); }
    osc.start(start); osc.stop(start + dur + 0.03);
    osc.onended = function () { try { g.disconnect(); f.disconnect(); osc.disconnect(); } catch (e) { } };
  }

  function drum(kind, start, vol) {
    var ctx = A.ctx;
    if (kind === 'kick') {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(140, start);
      o.frequency.exponentialRampToValueAtTime(38, start + 0.13);
      var g = ctx.createGain();
      g.gain.setValueAtTime(vol, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      o.connect(g); g.connect(A.musicBus);
      o.start(start); o.stop(start + 0.22);
      o.onended = function () { try { g.disconnect(); o.disconnect(); } catch (e) { } };
    } else {
      var n = noise(ctx);
      var f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1900;
      f.Q.value = kind === 'hat' ? 0.7 : 1.4;
      var g2 = ctx.createGain();
      var d = kind === 'hat' ? 0.05 : 0.16;
      g2.gain.setValueAtTime(vol, start);
      g2.gain.exponentialRampToValueAtTime(0.0001, start + d);
      n.connect(f); f.connect(g2); g2.connect(A.musicBus);
      if (kind === 'snare') { var rg = ctx.createGain(); rg.gain.value = 0.25; g2.connect(rg); rg.connect(A.reverb); }
      n.start(start); n.stop(start + d + 0.02);
      n.onended = function () { try { g2.disconnect(); f.disconnect(); n.disconnect(); } catch (e) { } };
    }
  }

  function scheduler() {
    if (!A.ready || !A._track) return;
    var ctx = A.ctx;
    if (ctx.state !== 'running') return;
    A._intensity = A._intensity + (A._intensityTarget - A._intensity) * 0.06;

    var t = A._track;
    var stepDur = 60 / t.bpm / 4;              /* sixteenth notes */
    var lookahead = ctx.currentTime + 0.22;
    var scale = SCALES[t.scale] || SCALES.minor;
    var guard = 0;

    while (A._nextNote < lookahead && guard++ < 64) {
      var s = A._step, time = A._nextNote;
      var bar = Math.floor(s / 16) % t.chords.length;
      var chordRoot = t.root + scale[t.chords[bar] % scale.length] + (t.chords[bar] >= scale.length ? 12 : 0);
      var beat = s % 16;
      var inten = A._intensity;
      var r = A._rng;

      /* --- bass: root on the downbeats, octave lift on the and-of-3 --- */
      if (beat % 4 === 0) {
        var bn = chordRoot - 12 + (beat === 12 && r.chance(0.4) ? 12 : 0);
        note(t.pad === 'sine' ? 'triangle' : 'sawtooth', midi(bn), time, stepDur * 3.4,
          0.16 + inten * 0.06, t.bright * 0.35, 0.05);
      }
      /* --- pad: a sustained triad once per bar --- */
      if (beat === 0) {
        for (var v = 0; v < 3; v++) {
          var pn = chordRoot + [0, 3, 7][v] + (v === 2 ? 0 : 0);
          note(t.pad, midi(pn), time, stepDur * 15, 0.05 + t.warmth * 0.04, t.bright, 0.5, v === 1 ? 7 : -5);
        }
      }
      /* --- arpeggio: rides in with intensity --- */
      if (inten > 0.12 && beat % 2 === 0) {
        var deg = scale[(Math.floor(s / 2) * 2 + bar) % scale.length];
        var an = chordRoot + deg + 12 + (r.chance(0.18) ? 12 : 0);
        note(t.lead, midi(an), time, stepDur * 1.6, 0.03 + inten * 0.055, t.bright * 1.5, 0.35);
      }
      /* --- melodic answer phrase every other bar --- */
      if (beat === 8 && r.chance(0.55)) {
        var mn = chordRoot + r.pick(scale) + 12;
        note(t.lead, midi(mn), time, stepDur * 3, 0.05 + inten * 0.03, t.bright * 1.8, 0.45);
      }
      /* --- drums --- */
      var dv = t.drums * (0.45 + inten * 0.55);
      if (dv > 0.02) {
        if (beat === 0 || beat === 6 || (beat === 10 && inten > 0.5)) drum('kick', time, 0.34 * dv);
        if (beat === 4 || beat === 12) drum('snare', time, 0.16 * dv);
        if (beat % 2 === 0 || (inten > 0.6 && beat % 1 === 0)) drum('hat', time, 0.05 * dv * (beat % 4 === 0 ? 1.4 : 1));
      }

      A._nextNote += stepDur;
      A._step++;
    }
  }

  A.suspend = function () { if (A.ready && A.ctx.state === 'running') A.ctx.suspend()['catch'](function () { }); };
  A.resume = function () { if (A.ready && A.ctx.state === 'suspended') A.ctx.resume()['catch'](function () { }); };
})(RG);
