/* ReGen - persistence. One JSON blob in localStorage, written on a debounce
 * so a busy fight never touches storage. Every read is defensive: a missing
 * or corrupt save degrades to a fresh profile instead of a broken game. */
'use strict';
(function (RG) {
  var KEY = 'regen.save.v1';
  var Save = RG.Save = {};
  var memoryOnly = false;
  var pending = null;

  function storageOk() {
    if (memoryOnly) return false;
    try {
      window.localStorage.setItem('regen.probe', '1');
      window.localStorage.removeItem('regen.probe');
      return true;
    } catch (e) { memoryOnly = true; return false; }
  }

  Save.fresh = function () {
    return {
      v: 1,
      created: Date.now(),
      playtime: 0,
      coins: 120,
      gems: 3,
      level: 1,
      xp: 0,
      skin: 'wanderer',
      owned: ['wanderer'],
      upgrades: { hp: 0, dmg: 0, spd: 0, luck: 0, crit: 0 },
      purchases: {},
      inventory: { potion_s: 2 },
      keys: 0,
      stats: {
        kills: 0, coinsEarned: 0, gemsEarned: 0, dungeons: 0, discovered: 0,
        deaths: 0, miniScore: 0, bossesKilled: 0, chests: 0, steps: 0,
        minigamesPlayed: {}, bossList: []
      },
      quests: {},
      questsDone: [],
      achievements: [],
      worlds: {
        hub: { unlocked: true },
        verdant: { unlocked: true, boss: false, seed: 0, found: [], used: [] },
        ember: { unlocked: false, boss: false, seed: 0, found: [], used: [] },
        frost: { unlocked: false, boss: false, seed: 0, found: [], used: [] },
        voidr: { unlocked: false, boss: false, seed: 0, found: [], used: [] }
      },
      best: {},
      settings: {
        master: 0.9, music: 0.55, sfx: 0.85, muted: false,
        quality: 1, shake: 1, minimap: true, fps: false,
        touch: 'auto', damageNumbers: true, lowFx: false
      },
      tutorial: { moved: false, attacked: false, dashed: false, opened: false }
    };
  };

  /* Deep-merges a loaded save over a fresh one, so a save from an older
   * build gains any new fields without losing progress. */
  function merge(base, loaded) {
    if (loaded === null || loaded === undefined) return base;
    if (typeof base !== 'object' || base === null || Array.isArray(base)) {
      return (typeof loaded === typeof base || base === null) ? loaded : base;
    }
    if (typeof loaded !== 'object' || loaded === null) return base;
    var out = {};
    for (var k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) {
        out[k] = Object.prototype.hasOwnProperty.call(loaded, k) ? merge(base[k], loaded[k]) : base[k];
      }
    }
    for (var j in loaded) {
      if (Object.prototype.hasOwnProperty.call(loaded, j) && !Object.prototype.hasOwnProperty.call(out, j)) {
        out[j] = loaded[j];
      }
    }
    return out;
  }

  Save.load = function () {
    var fresh = Save.fresh();
    if (!storageOk()) return fresh;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return fresh;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fresh;
      var merged = merge(fresh, parsed);
      /* sanity clamps: never let a hand-edited save crash the game */
      merged.level = Math.max(1, Math.min(RG.Data.MAX_LEVEL, merged.level | 0));
      merged.coins = Math.max(0, merged.coins | 0);
      merged.gems = Math.max(0, merged.gems | 0);
      if (!Array.isArray(merged.owned) || merged.owned.indexOf('wanderer') === -1) {
        merged.owned = (merged.owned || []).concat(['wanderer']);
      }
      if (!RG.Data.skinById(merged.skin) || merged.owned.indexOf(merged.skin) === -1) merged.skin = 'wanderer';
      return merged;
    } catch (e) {
      return fresh;
    }
  };

  Save.write = function (data) {
    if (!storageOk()) return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  };

  /* Debounced save - call as often as you like. */
  Save.queue = function (data) {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () {
      pending = null;
      Save.write(data);
    }, 900);
  };

  Save.flush = function (data) {
    if (pending) { clearTimeout(pending); pending = null; }
    return Save.write(data);
  };

  Save.wipe = function () {
    if (!storageOk()) return;
    try { window.localStorage.removeItem(KEY); } catch (e) { /* nothing to do */ }
  };

  Save.exportString = function (data) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); } catch (e) { return ''; }
  };
  Save.importString = function (str) {
    try {
      var obj = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
      if (!obj || typeof obj !== 'object') return null;
      return merge(Save.fresh(), obj);
    } catch (e) { return null; }
  };
  Save.isMemoryOnly = function () { return memoryOnly; };
})(RG);
