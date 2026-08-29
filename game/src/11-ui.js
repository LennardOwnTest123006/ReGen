/* ReGen - all menus, the HUD and the on-screen controls.
 *
 * The interface is DOM rather than canvas on purpose: text stays crisp at
 * every device pixel ratio, layout reflows for free on a phone, and tap
 * targets are real elements the browser can hit-test. The canvas is left to
 * do nothing but draw the world. */
'use strict';
(function (RG) {
  var M = RG.M, Data = RG.Data, Art = RG.Art;
  var UI = RG.UI = {};
  var g = null;
  var screens = {};
  var current = null;
  var stack = [];

  /* --------------------------------------------------------- dom helpers */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function on(node, ev, fn) { node.addEventListener(ev, fn); return node; }
  function btn(label, cls, fn) {
    var b = el('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    on(b, 'click', function (e) {
      e.preventDefault();
      RG.Audio.play('ui');
      fn(e);
    });
    return b;
  }
  function iconImg(name, size, cls) {
    var i = el('img', 'icn ' + (cls || ''));
    i.src = Art.iconURL(name, size || 32);
    i.width = size || 32; i.height = size || 32;
    i.alt = '';
    i.draggable = false;
    return i;
  }
  UI.el = el; UI.btn = btn; UI.iconImg = iconImg;

  /* ------------------------------------------------------------- toasts */
  var toastHost = null;
  UI.toast = function (text, kind, icon) {
    if (!toastHost) return;
    var t = el('div', 'toast ' + (kind || ''));
    if (icon) t.appendChild(iconImg(icon, 22));
    t.appendChild(el('span', '', text));
    toastHost.appendChild(t);
    /* cap the stack so a flood of pickups cannot bury the screen */
    while (toastHost.children.length > 5) toastHost.removeChild(toastHost.firstChild);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 420);
    }, 2400);
  };

  /* ------------------------------------------------------------ screens */
  function makeScreen(id, title, opts) {
    opts = opts || {};
    var s = el('div', 'screen' + (opts.wide ? ' wide' : '') + (opts.full ? ' full' : ''));
    s.id = 'screen-' + id;
    var panel = el('div', 'panel');
    var head = el('div', 'panel-head');
    head.appendChild(el('h2', '', title));
    if (!opts.noClose) {
      var x = btn('', 'close', function () { UI.back(); });
      x.setAttribute('aria-label', 'Close');
      head.appendChild(x);
    }
    panel.appendChild(head);
    var body = el('div', 'panel-body scrollable');
    panel.appendChild(body);
    s.appendChild(panel);
    s._body = body;
    s._head = head;
    screens[id] = s;
    $('screens').appendChild(s);
    return s;
  }

  UI.open = function (name, push) {
    var s = screens[name];
    if (!s) return;
    if (current && push) stack.push(current);
    else if (current) { current.classList.remove('on'); }
    current = s;
    s.classList.add('on');
    document.body.classList.add('modal');
    RG.Input.reset();
    if (UI['refresh_' + name]) UI['refresh_' + name]();
  };
  UI.back = function () {
    RG.Audio.play('uiBack');
    if (current) current.classList.remove('on');
    if (stack.length) {
      current = stack.pop();
      current.classList.add('on');
      var nm = current.id.replace('screen-', '');
      if (UI['refresh_' + nm]) UI['refresh_' + nm]();
    } else {
      current = null;
      document.body.classList.remove('modal');
      RG.Input.block(160);
      if (g) g.resumeFromMenu();
    }
  };
  UI.closeAll = function () {
    if (current) current.classList.remove('on');
    while (stack.length) stack.pop().classList.remove('on');
    current = null;
    document.body.classList.remove('modal');
  };
  UI.isOpen = function () { return current !== null; };
  UI.currentName = function () { return current ? current.id.replace('screen-', '') : null; };

  /* -------------------------------------------------------------- setup */
  UI.init = function (game) {
    g = game;
    toastHost = $('toasts');
    buildHUD();
    buildTouch();
    buildTitle();
    buildPause();
    buildStore();
    buildVault();
    buildQuests();
    buildRecords();
    buildSettings();
    buildMap();
    buildArcade();
    buildGameOver();
    buildReward();
    buildDialog();
    buildWorldGate();
    UI.applySettings();
  };

  /* ---------------------------------------------------------------- HUD */
  var hud = {};
  function buildHUD() {
    var h = $('hud');
    clear(h);

    var topL = el('div', 'hud-topleft');
    var hpWrap = el('div', 'vital');
    hud.hpBar = el('div', 'bar-fill hp');
    hud.hpText = el('span', 'bar-text', '100 / 100');
    var hpTrack = el('div', 'bar-track');
    hpTrack.appendChild(hud.hpBar);
    hpTrack.appendChild(hud.hpText);
    hpWrap.appendChild(iconImg('heart', 22));
    hpWrap.appendChild(hpTrack);
    topL.appendChild(hpWrap);

    var xpWrap = el('div', 'vital small');
    hud.xpBar = el('div', 'bar-fill xp');
    hud.xpText = el('span', 'bar-text', 'Lv 1');
    var xpTrack = el('div', 'bar-track');
    xpTrack.appendChild(hud.xpBar);
    xpTrack.appendChild(hud.xpText);
    xpWrap.appendChild(iconImg('star', 18));
    xpWrap.appendChild(xpTrack);
    topL.appendChild(xpWrap);
    h.appendChild(topL);

    var topR = el('div', 'hud-topright');
    hud.coins = el('span', 'val', '0');
    hud.gems = el('span', 'val', '0');
    var cChip = el('div', 'chip');
    cChip.appendChild(iconImg('coin', 20)); cChip.appendChild(hud.coins);
    var gChip = el('div', 'chip');
    gChip.appendChild(iconImg('gem', 20)); gChip.appendChild(hud.gems);
    topR.appendChild(cChip); topR.appendChild(gChip);

    var menuBtn = btn('', 'icon-btn', function () { g.pause(); });
    menuBtn.appendChild(iconImg('gear', 22));
    menuBtn.setAttribute('aria-label', 'Menu');
    topR.appendChild(menuBtn);
    h.appendChild(topR);

    hud.worldLabel = el('div', 'world-label');
    h.appendChild(hud.worldLabel);

    /* minimap */
    hud.miniWrap = el('div', 'minimap');
    hud.miniCanvas = el('canvas', '');
    hud.miniCanvas.width = 148; hud.miniCanvas.height = 148;
    hud.miniWrap.appendChild(hud.miniCanvas);
    hud.miniCtx = hud.miniCanvas.getContext('2d');
    on(hud.miniWrap, 'click', function () { UI.open('map'); });
    h.appendChild(hud.miniWrap);

    /* boss bar */
    hud.bossWrap = el('div', 'bossbar hidden');
    hud.bossName = el('div', 'boss-name', '');
    hud.bossBar = el('div', 'bar-fill boss');
    var bt = el('div', 'bar-track big');
    bt.appendChild(hud.bossBar);
    hud.bossWrap.appendChild(hud.bossName);
    hud.bossWrap.appendChild(bt);
    h.appendChild(hud.bossWrap);

    /* interaction prompt */
    hud.prompt = el('div', 'prompt hidden');
    h.appendChild(hud.prompt);

    /* objective ticker */
    hud.objective = el('div', 'objective', '');
    h.appendChild(hud.objective);

    hud.fps = el('div', 'fps hidden', '');
    h.appendChild(hud.fps);

    hud.combo = el('div', 'combo hidden', '');
    h.appendChild(hud.combo);
  }

  /* ---------------------------------------------------- touch controls */
  function buildTouch() {
    var t = $('touchControls');
    clear(t);
    var mk = function (action, icon, cls, label) {
      var b = el('button', 'tbtn ' + cls);
      b.type = 'button';
      b.appendChild(iconImg(icon, 30));
      if (label) b.appendChild(el('span', 'tlabel', label));
      b.setAttribute('aria-label', label || action);
      RG.Input.attachTouchButton(b, action);
      return b;
    };
    var right = el('div', 'tpad-right');
    hud.tAttack = mk('attack', 'sword', 'big', null);
    hud.tDash = mk('dash', 'boot', 'mid', null);
    hud.tAbility = mk('ability', 'bolt', 'mid', null);
    hud.tInteract = mk('interact', 'key', 'small', null);
    right.appendChild(hud.tInteract);
    right.appendChild(hud.tAbility);
    right.appendChild(hud.tDash);
    right.appendChild(hud.tAttack);
    t.appendChild(right);

    hud.stickL = el('div', 'stick hidden');
    hud.stickL.appendChild(el('div', 'stick-knob'));
    hud.stickR = el('div', 'stick hidden');
    hud.stickR.appendChild(el('div', 'stick-knob'));
    t.appendChild(hud.stickL);
    t.appendChild(hud.stickR);

    hud.abilityCd = el('div', 'cd-ring');
    hud.tAbility.appendChild(hud.abilityCd);
    hud.dashCd = el('div', 'cd-ring');
    hud.tDash.appendChild(hud.dashCd);
  }

  UI.setTouchVisible = function (v) {
    document.body.classList.toggle('touch-on', !!v);
  };

  /* ------------------------------------------------------- HUD updating */
  var lastHud = {};
  UI.updateHUD = function () {
    if (!g || !g.player) return;
    var p = g.player, s = g.save;

    var hpPct = M.clamp01(p.hp / p.maxHp);
    hud.hpBar.style.width = (hpPct * 100).toFixed(1) + '%';
    var hpStr = Math.ceil(p.hp) + ' / ' + p.maxHp + (p.shield > 0 ? ' +' + Math.ceil(p.shield) : '');
    if (lastHud.hp !== hpStr) { hud.hpText.textContent = hpStr; lastHud.hp = hpStr; }
    hud.hpBar.classList.toggle('low', hpPct < 0.3);

    var need = Data.xpForLevel(s.level);
    var xpPct = s.level >= Data.MAX_LEVEL ? 1 : M.clamp01(s.xp / need);
    hud.xpBar.style.width = (xpPct * 100).toFixed(1) + '%';
    var xpStr = 'Lv ' + s.level + (s.level >= Data.MAX_LEVEL ? ' MAX' : '  ' + RG.fmt(s.xp) + '/' + RG.fmt(need));
    if (lastHud.xp !== xpStr) { hud.xpText.textContent = xpStr; lastHud.xp = xpStr; }

    if (lastHud.coins !== s.coins) { hud.coins.textContent = RG.fmt(s.coins); lastHud.coins = s.coins; }
    if (lastHud.gems !== s.gems) { hud.gems.textContent = RG.fmt(s.gems); lastHud.gems = s.gems; }

    var wl = g.world.def.kind === 'dungeon'
      ? 'Rift Depths - Floor ' + g.world.floor + '/' + g.world.maxFloor
      : g.world.def.name;
    if (lastHud.world !== wl) { hud.worldLabel.textContent = wl; lastHud.world = wl; }

    /* boss bar */
    var boss = g.activeBoss;
    if (boss && boss.alive) {
      hud.bossWrap.classList.remove('hidden');
      if (lastHud.boss !== boss.def.name) { hud.bossName.textContent = boss.def.name; lastHud.boss = boss.def.name; }
      hud.bossBar.style.width = (M.clamp01(boss.hp / boss.maxHp) * 100).toFixed(1) + '%';
    } else if (!hud.bossWrap.classList.contains('hidden')) {
      hud.bossWrap.classList.add('hidden'); lastHud.boss = null;
    }

    /* interaction prompt */
    var near = g.nearStructure;
    if (near && !p.dead) {
      if (lastHud.prompt !== near.prompt) {
        clear(hud.prompt);
        var kbHint = RG.Input.device === 'touch' ? '' : (RG.Input.device === 'pad' ? '[X] ' : '[E] ');
        hud.prompt.appendChild(el('span', 'p-key', kbHint));
        hud.prompt.appendChild(el('span', '', near.prompt));
        lastHud.prompt = near.prompt;
      }
      hud.prompt.classList.remove('hidden');
    } else if (!hud.prompt.classList.contains('hidden')) {
      hud.prompt.classList.add('hidden'); lastHud.prompt = null;
    }

    /* combo */
    if (p.combo >= 3) {
      hud.combo.classList.remove('hidden');
      hud.combo.textContent = p.combo + 'x';
      hud.combo.style.opacity = M.clamp01(p.comboT / 1.2);
    } else hud.combo.classList.add('hidden');

    /* ability + dash cooldown rings */
    var ac = p.abilityCd > 0 ? 1 - p.abilityCd / (p.abilityDef ? p.abilityDef.cd : 6) : 1;
    hud.abilityCd.style.background = ac >= 1 ? 'none'
      : 'conic-gradient(rgba(10,14,26,0.72) ' + ((1 - ac) * 360).toFixed(0) + 'deg, transparent 0deg)';
    hud.tAbility.classList.toggle('ready', ac >= 1);
    var dc = p.dashCd > 0 ? 1 - p.dashCd / p.stats.dashCd : 1;
    hud.dashCd.style.background = dc >= 1 ? 'none'
      : 'conic-gradient(rgba(10,14,26,0.72) ' + ((1 - dc) * 360).toFixed(0) + 'deg, transparent 0deg)';
    hud.tDash.classList.toggle('ready', dc >= 1);

    /* objective line */
    var obj = g.objectiveText();
    if (lastHud.obj !== obj) { hud.objective.textContent = obj; lastHud.obj = obj; }

    if (s.settings.fps) {
      hud.fps.classList.remove('hidden');
      hud.fps.textContent = g.fps.toFixed(0) + ' fps  |  ' + g.enemyCount + ' foes  |  ' + RG.Particles.count + ' fx  |  x' + RG.View.autoScale.toFixed(2);
    } else hud.fps.classList.add('hidden');

    /* virtual sticks follow the fingers */
    var sticks = RG.Input.sticks();
    positionStick(hud.stickL, sticks.move);
    positionStick(hud.stickR, sticks.aim);

    if (s.settings.minimap) { hud.miniWrap.classList.remove('hidden'); drawMinimap(); }
    else hud.miniWrap.classList.add('hidden');
  };

  function positionStick(node, st) {
    if (!st.active) { node.classList.add('hidden'); return; }
    node.classList.remove('hidden');
    node.style.transform = 'translate(' + (st.ox - 58) + 'px,' + (st.oy - 58) + 'px)';
    var knob = node.firstChild;
    knob.style.transform = 'translate(' + (st.x * 34) + 'px,' + (st.y * 34) + 'px)';
  }

  function drawMinimap() {
    var w = g.world;
    if (!w.minimap) return;
    var c = hud.miniCtx, size = hud.miniCanvas.width;
    var span = 46; /* tiles visible across the minimap */
    var TSz = RG.TILE_SIZE;
    var ptx = g.player.x / TSz, pty = g.player.y / TSz;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 2, 0, M.TAU); c.clip();
    c.fillStyle = '#0a0d16';
    c.fillRect(0, 0, size, size);
    c.imageSmoothingEnabled = false;
    var scale = size / span;
    c.drawImage(w.minimap, (size / 2) - ptx * scale, (size / 2) - pty * scale, w.size * scale, w.size * scale);

    /* structure pips */
    for (var i = 0; i < w.structures.length; i++) {
      var st = w.structures[i];
      var sx = size / 2 + (st.x / TSz - ptx) * scale;
      var sy = size / 2 + (st.y / TSz - pty) * scale;
      if (sx < -6 || sy < -6 || sx > size + 6 || sy > size + 6) continue;
      var col = structColor(st);
      if (!col) continue;
      c.fillStyle = col;
      c.beginPath(); c.arc(sx, sy, 3.2, 0, M.TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.stroke();
    }
    /* enemies */
    c.fillStyle = '#ff6b7a';
    for (var e = 0; e < g.enemies.length; e++) {
      var en = g.enemies[e];
      if (!en.alive) continue;
      var ex = size / 2 + (en.x / TSz - ptx) * scale;
      var ey = size / 2 + (en.y / TSz - pty) * scale;
      if (ex < 0 || ey < 0 || ex > size || ey > size) continue;
      c.fillRect(ex - 1.4, ey - 1.4, 2.8, 2.8);
    }
    /* player */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(size / 2, size / 2, 3.4, 0, M.TAU); c.fill();
    c.strokeStyle = '#7fe0ff'; c.lineWidth = 1.4; c.stroke();
    c.restore();

    c.strokeStyle = 'rgba(180,205,255,0.35)';
    c.lineWidth = 2;
    c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 2, 0, M.TAU); c.stroke();
  }

  function structColor(st) {
    switch (st.kind) {
      case 'portal': case 'gate': return '#a87aff';
      case 'dungeon': return '#ff9a3a';
      case 'shrine': return st.used ? '#5a6a80' : '#7fe0ff';
      case 'chest': return st.used ? '#5a6a80' : '#f5c542';
      case 'boss': case 'dungeonboss': return st.used ? '#5a6a80' : '#ff5fa2';
      case 'shop': return '#f5c542';
      case 'vault': return '#4ad88a';
      case 'quests': return '#8ceaff';
      case 'arcade': return '#ff5fa2';
      case 'forge': return '#e08a4a';
      case 'stats': return '#c8c4d4';
      case 'save': return '#7fffd4';
      case 'descend': return '#8ceaff';
      default: return null;
    }
  }

  /* -------------------------------------------------------------- title */
  function buildTitle() {
    var s = makeScreen('title', '', { full: true, noClose: true });
    s.classList.add('title-screen');
    var b = s._body;
    clear(b);
    var logo = el('div', 'logo-wrap');
    var lc = el('canvas', 'logo');
    lc.width = 640; lc.height = 240;
    drawLogo(lc);
    logo.appendChild(lc);
    b.appendChild(logo);
    b.appendChild(el('p', 'tagline', 'Explore four broken worlds. Raid the rifts. Rebuild what is left.'));

    var menu = el('div', 'title-menu');
    menu.appendChild(btn('Continue', 'primary big', function () { g.startGame(false); }));
    menu.appendChild(btn('New Game', 'big', function () { UI.confirm('Start over?', 'This erases your current profile: level, coins, gems and every skin you own.', function () { g.newGame(); }); }));
    menu.appendChild(btn('Settings', 'big', function () { UI.open('settings', true); }));
    b.appendChild(menu);

    var foot = el('div', 'title-foot');
    foot.appendChild(el('span', '', 'ReGen v' + RG.VERSION));
    b.appendChild(foot);
    s._continue = menu.firstChild;
  }
  UI.refresh_title = function () {
    var s = screens.title;
    var has = g.save.stats.kills > 0 || g.save.level > 1 || g.save.owned.length > 1;
    s._continue.textContent = has ? 'Continue' : 'Begin';
  };

  /* Canvas 2D has no reliable letter-spacing, so tracked text is laid out
   * one glyph at a time. */
  function spacedText(c, text, cx, cy, extra) {
    var total = 0, i;
    for (i = 0; i < text.length; i++) total += c.measureText(text[i]).width + extra;
    total -= extra;
    var x = cx - total / 2;
    var prevAlign = c.textAlign;
    c.textAlign = 'left';
    for (i = 0; i < text.length; i++) {
      c.fillText(text[i], x, cy);
      x += c.measureText(text[i]).width + extra;
    }
    c.textAlign = prevAlign;
  }

  function drawLogo(canvas) {
    var c = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    var grad = c.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#7fffd4');
    grad.addColorStop(0.45, '#8ad6ff');
    grad.addColorStop(1, '#c08aff');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 118px "Segoe UI", system-ui, sans-serif';
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(10,14,30,0.9)';
    c.lineWidth = 16;
    c.strokeText('ReGen', w / 2, h / 2 - 6);
    c.fillStyle = grad;
    c.fillText('ReGen', w / 2, h / 2 - 6);
    c.font = '600 21px "Segoe UI", system-ui, sans-serif';
    c.fillStyle = 'rgba(200,220,255,0.72)';
    spacedText(c, 'A WORLD WORTH REBUILDING', w / 2, h / 2 + 74, 7);
  }

  /* -------------------------------------------------------------- pause */
  function buildPause() {
    var s = makeScreen('pause', 'Paused');
    var b = s._body;
    var menu = el('div', 'title-menu');
    menu.appendChild(btn('Resume', 'primary', function () { UI.back(); }));
    menu.appendChild(btn('Skin Vault', '', function () { UI.open('vault', true); }));
    menu.appendChild(btn('Store', '', function () { UI.open('store', true); }));
    menu.appendChild(btn('Quests', '', function () { UI.open('quests', true); }));
    menu.appendChild(btn('Records', '', function () { UI.open('records', true); }));
    menu.appendChild(btn('Settings', '', function () { UI.open('settings', true); }));
    menu.appendChild(btn('Return to Aetherhold', 'warn', function () {
      if (g.world.id === 'hub') { UI.toast('You are already in Aetherhold.'); return; }
      UI.closeAll(); g.travelTo('hub');
    }));
    menu.appendChild(btn('Quit to Title', 'danger', function () { UI.closeAll(); g.toTitle(); }));
    b.appendChild(menu);
    s._stats = el('div', 'pause-stats');
    b.appendChild(s._stats);
  }
  UI.refresh_pause = function () {
    var s = g.save;
    var host = screens.pause._stats;
    clear(host);
    var rows = [
      ['Level', s.level], ['Coins', RG.fmt(s.coins)], ['Gems', RG.fmt(s.gems)],
      ['Skins', s.owned.length + ' / ' + Data.SKINS.length],
      ['Kills', RG.fmt(s.stats.kills)], ['Dungeons cleared', s.stats.dungeons],
      ['Playtime', RG.time(s.playtime)]
    ];
    for (var i = 0; i < rows.length; i++) {
      var r = el('div', 'srow');
      r.appendChild(el('span', 'k', rows[i][0]));
      r.appendChild(el('span', 'v', '' + rows[i][1]));
      host.appendChild(r);
    }
  };

  /* -------------------------------------------------------------- store */
  var storeTab = 'consumable';
  function buildStore() {
    var s = makeScreen('store', 'Trader Ovi', { wide: true });
    var tabs = el('div', 'tabs');
    var defs = [['consumable', 'Supplies'], ['chest', 'Caches'], ['upgrade', 'Cores'], ['exchange', 'Exchange']];
    s._tabs = {};
    for (var i = 0; i < defs.length; i++) {
      (function (id, label) {
        var t = btn(label, 'tab', function () { storeTab = id; UI.refresh_store(); });
        s._tabs[id] = t;
        tabs.appendChild(t);
      })(defs[i][0], defs[i][1]);
    }
    s._head.appendChild(makeWallet());
    s._body.appendChild(tabs);
    s._list = el('div', 'shop-list');
    s._body.appendChild(s._list);
  }
  function makeWallet() {
    var w = el('div', 'wallet');
    var c = el('div', 'chip'); c.appendChild(iconImg('coin', 18));
    var cv = el('span', 'val', '0'); c.appendChild(cv);
    var gm = el('div', 'chip'); gm.appendChild(iconImg('gem', 18));
    var gv = el('span', 'val', '0'); gm.appendChild(gv);
    w.appendChild(c); w.appendChild(gm);
    w._coins = cv; w._gems = gv;
    walletNodes.push(w);
    return w;
  }
  var walletNodes = [];
  function refreshWallets() {
    for (var i = 0; i < walletNodes.length; i++) {
      walletNodes[i]._coins.textContent = RG.fmt(g.save.coins);
      walletNodes[i]._gems.textContent = RG.fmt(g.save.gems);
    }
  }
  UI.refreshWallets = refreshWallets;

  UI.refresh_store = function () {
    var s = screens.store, list = s._list;
    refreshWallets();
    for (var k in s._tabs) s._tabs[k].classList.toggle('active', k === storeTab);
    clear(list);
    var sv = g.save;
    for (var i = 0; i < Data.SHOP.length; i++) {
      var it = Data.SHOP[i];
      if (it.cat !== storeTab) continue;
      var bought = sv.purchases[it.id] || 0;
      var price = Math.round(it.price * Math.pow(it.scale || 1, bought));
      var maxed = it.repeat !== undefined && bought >= it.repeat;
      var card = el('div', 'shop-item' + (maxed ? ' maxed' : ''));
      card.appendChild(iconImg(it.icon, 44, 'big'));
      var info = el('div', 'si-info');
      info.appendChild(el('div', 'si-name', it.name));
      info.appendChild(el('div', 'si-desc', it.desc));
      if (it.cat === 'consumable') {
        var have = sv.inventory[it.id] || 0;
        info.appendChild(el('div', 'si-meta', 'Carrying ' + have + ' / ' + it.stack));
      } else if (it.repeat) {
        info.appendChild(el('div', 'si-meta', 'Owned ' + bought + (it.repeat < 900 ? ' / ' + it.repeat : '')));
      }
      card.appendChild(info);
      var buy = el('div', 'si-buy');
      var pc = el('div', 'price');
      pc.appendChild(iconImg(it.cur === 'gems' ? 'gem' : 'coin', 18));
      pc.appendChild(el('span', '', RG.fmt(price)));
      buy.appendChild(pc);
      if (maxed) buy.appendChild(el('div', 'maxed-tag', 'MAX'));
      else buy.appendChild(makeBuyBtn(it, price));
      card.appendChild(buy);
      list.appendChild(card);
    }
    if (!list.children.length) list.appendChild(el('div', 'empty', 'Nothing here right now.'));
  };

  function makeBuyBtn(it, price) {
    return btn('Buy', 'primary small', function () { g.buy(it, price); });
  }

  /* -------------------------------------------------------------- vault */
  var vaultFilter = 'all';
  function buildVault() {
    var s = makeScreen('vault', 'Skin Vault', { wide: true });
    s._head.appendChild(makeWallet());
    var tabs = el('div', 'tabs');
    var defs = [['all', 'All'], ['owned', 'Owned'], ['common', 'Common'], ['rare', 'Rare'], ['epic', 'Epic'], ['legendary', 'Legendary'], ['mythic', 'Mythic']];
    s._tabs = {};
    for (var i = 0; i < defs.length; i++) {
      (function (id, label) {
        var t = btn(label, 'tab', function () { vaultFilter = id; UI.refresh_vault(); });
        s._tabs[id] = t; tabs.appendChild(t);
      })(defs[i][0], defs[i][1]);
    }
    s._body.appendChild(tabs);
    s._count = el('div', 'vault-count', '');
    s._body.appendChild(s._count);
    s._grid = el('div', 'skin-grid');
    s._body.appendChild(s._grid);
  }

  UI.refresh_vault = function () {
    var s = screens.vault;
    refreshWallets();
    for (var k in s._tabs) s._tabs[k].classList.toggle('active', k === vaultFilter);
    clear(s._grid);
    var sv = g.save;
    s._count.textContent = 'Collected ' + sv.owned.length + ' of ' + Data.SKINS.length + ' skins';
    for (var i = 0; i < Data.SKINS.length; i++) {
      var sk = Data.SKINS[i];
      if (vaultFilter === 'owned' && sv.owned.indexOf(sk.id) === -1) continue;
      if (vaultFilter !== 'all' && vaultFilter !== 'owned' && sk.rarity !== vaultFilter) continue;
      s._grid.appendChild(makeSkinCard(sk));
    }
    if (!s._grid.children.length) s._grid.appendChild(el('div', 'empty', 'No skins in this category yet.'));
  };

  function makeSkinCard(sk) {
    var sv = g.save;
    var owned = sv.owned.indexOf(sk.id) !== -1;
    var equipped = sv.skin === sk.id;
    var rar = Data.RARITY[sk.rarity];
    var card = el('div', 'skin-card r-' + sk.rarity + (equipped ? ' equipped' : '') + (owned ? '' : ' locked'));

    var prev = el('canvas', 'skin-prev');
    prev.width = 132; prev.height = 156;
    var pc = prev.getContext('2d');
    pc.save();
    pc.translate(66, 132);
    pc.scale(2.5, 2.5);
    Art.drawCharacter(pc, sk, { t: 0.4, walk: 0, facing: 1, aim: -0.35, scale: 1 });
    pc.restore();
    if (!owned) {
      /* dim it, but never so far that the player cannot see what they are
       * being asked to pay for */
      pc.globalCompositeOperation = 'source-atop';
      pc.fillStyle = 'rgba(10,14,28,0.34)';
      pc.fillRect(0, 0, 132, 156);
      pc.globalCompositeOperation = 'source-over';
      pc.globalAlpha = 0.9;
      pc.drawImage(Art.icon('lock', 26), 100, 6);
      pc.globalAlpha = 1;
    }
    card.appendChild(prev);

    card.appendChild(el('div', 'sk-rar', rar.name));
    card.appendChild(el('div', 'sk-name', sk.name));
    card.appendChild(el('div', 'sk-perk', sk.perkText));

    var foot = el('div', 'sk-foot');
    if (equipped) foot.appendChild(el('div', 'tag on', 'Equipped'));
    else if (owned) foot.appendChild(btn('Equip', 'primary small', function () { g.equipSkin(sk.id); }));
    else if (sk.currency === 'locked') foot.appendChild(el('div', 'tag lock', sk.unlock || 'Locked'));
    else {
      var p = el('div', 'price');
      p.appendChild(iconImg(sk.currency === 'gems' ? 'gem' : 'coin', 16));
      p.appendChild(el('span', '', RG.fmt(sk.price)));
      foot.appendChild(p);
      foot.appendChild(btn('Buy', 'small', function () { g.buySkin(sk); }));
    }
    card.appendChild(foot);
    on(card, 'click', function (e) {
      if (e.target.tagName === 'BUTTON') return;
      UI.showSkinDetail(sk);
    });
    return card;
  }

  UI.showSkinDetail = function (sk) {
    var owned = g.save.owned.indexOf(sk.id) !== -1;
    var body = el('div', 'skin-detail');
    var cv = el('canvas', '');
    cv.width = 200; cv.height = 230;
    var c = cv.getContext('2d');
    var t0 = RG.now();
    (function anim() {
      if (!cv.isConnected) return;
      c.clearRect(0, 0, 200, 230);
      c.save(); c.translate(100, 200); c.scale(3.6, 3.6);
      Art.drawCharacter(c, sk, { t: (RG.now() - t0) / 1000, walk: 0.25, facing: 1, aim: -0.3, scale: 1 });
      c.restore();
      requestAnimationFrame(anim);
    })();
    body.appendChild(cv);
    var info = el('div', 'sd-info');
    info.appendChild(el('div', 'sd-rar r-' + sk.rarity, Data.RARITY[sk.rarity].name));
    info.appendChild(el('h3', '', sk.name));
    info.appendChild(el('p', 'lore', sk.lore));
    info.appendChild(el('div', 'sd-perk', sk.perkText));
    info.appendChild(el('div', 'sd-weapon', 'Weapon: ' + capital(sk.weapon) + '  -  Ability: ' +
      (RG.ABILITY_INFO[RG.WEAPONS[sk.weapon].ability].name)));
    info.appendChild(el('p', 'sd-ability', RG.ABILITY_INFO[RG.WEAPONS[sk.weapon].ability].desc));
    body.appendChild(info);

    var actions = [];
    if (owned && g.save.skin !== sk.id) actions.push(['Equip', 'primary', function () { g.equipSkin(sk.id); UI.closeDialog(); }]);
    else if (!owned && sk.currency !== 'locked') actions.push(['Buy for ' + RG.fmt(sk.price) + ' ' + (sk.currency === 'gems' ? 'gems' : 'coins'), 'primary', function () { g.buySkin(sk); UI.closeDialog(); }]);
    actions.push(['Close', '', function () { UI.closeDialog(); }]);
    UI.dialogNode(sk.name, body, actions);
  };
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ------------------------------------------------------------- quests */
  function buildQuests() {
    var s = makeScreen('quests', 'Quest Board', { wide: true });
    s._list = el('div', 'quest-list');
    s._body.appendChild(s._list);
  }
  UI.refresh_quests = function () {
    var s = screens.quests, sv = g.save;
    clear(s._list);
    var active = 0;
    for (var i = 0; i < Data.QUESTS.length; i++) {
      var q = Data.QUESTS[i];
      var done = sv.questsDone.indexOf(q.id) !== -1;
      var prog = Math.min(q.target, sv.quests[q.id] || 0);
      var card = el('div', 'quest' + (done ? ' done' : ''));
      var top = el('div', 'q-top');
      top.appendChild(el('div', 'q-title', q.title));
      if (done) top.appendChild(el('div', 'tag on', 'Complete'));
      card.appendChild(top);
      card.appendChild(el('div', 'q-desc', q.desc));
      var track = el('div', 'bar-track thin');
      var fill = el('div', 'bar-fill q');
      fill.style.width = (prog / q.target * 100).toFixed(1) + '%';
      track.appendChild(fill);
      card.appendChild(track);
      card.appendChild(el('div', 'q-prog', prog + ' / ' + q.target));
      var rew = el('div', 'q-reward');
      if (q.reward.coins) { rew.appendChild(iconImg('coin', 16)); rew.appendChild(el('span', '', RG.fmt(q.reward.coins))); }
      if (q.reward.gems) { rew.appendChild(iconImg('gem', 16)); rew.appendChild(el('span', '', RG.fmt(q.reward.gems))); }
      if (q.reward.xp) { rew.appendChild(iconImg('star', 16)); rew.appendChild(el('span', '', RG.fmt(q.reward.xp) + ' XP')); }
      card.appendChild(rew);
      s._list.appendChild(card);
      if (!done) active++;
    }
    if (!active) s._list.appendChild(el('div', 'empty', 'Every quest on the board is finished. The world owes you one.'));
  };

  /* ------------------------------------------------------------ records */
  function buildRecords() {
    var s = makeScreen('records', 'Hall of Records', { wide: true });
    s._stats = el('div', 'stat-grid');
    s._body.appendChild(s._stats);
    s._body.appendChild(el('h3', 'sec', 'Achievements'));
    s._ach = el('div', 'ach-list');
    s._body.appendChild(s._ach);
    s._body.appendChild(el('h3', 'sec', 'Mini-game bests'));
    s._best = el('div', 'stat-grid');
    s._body.appendChild(s._best);
  }
  UI.refresh_records = function () {
    var s = screens.records, sv = g.save, st = sv.stats;
    clear(s._stats); clear(s._ach); clear(s._best);
    var rows = [
      ['Level', sv.level], ['Total XP', RG.fmt(sv.xp)],
      ['Enemies defeated', RG.fmt(st.kills)], ['Bosses defeated', st.bossesKilled],
      ['Dungeons cleared', st.dungeons], ['Chests opened', RG.fmt(st.chests)],
      ['Landmarks found', st.discovered], ['Coins earned', RG.fmt(st.coinsEarned)],
      ['Gems earned', RG.fmt(st.gemsEarned)], ['Deaths', st.deaths],
      ['Skins owned', sv.owned.length + ' / ' + Data.SKINS.length],
      ['Playtime', RG.time(sv.playtime)]
    ];
    for (var i = 0; i < rows.length; i++) {
      var c = el('div', 'stat');
      c.appendChild(el('div', 'sv', '' + rows[i][1]));
      c.appendChild(el('div', 'sk', rows[i][0]));
      s._stats.appendChild(c);
    }
    for (var a = 0; a < Data.ACHIEVEMENTS.length; a++) {
      var ac = Data.ACHIEVEMENTS[a];
      var got = sv.achievements.indexOf(ac.id) !== -1;
      var val = g.achievementValue(ac);
      var card = el('div', 'ach' + (got ? ' got' : ''));
      card.appendChild(iconImg(got ? 'check' : ac.icon, 30));
      var inf = el('div', 'a-info');
      inf.appendChild(el('div', 'a-name', ac.name));
      inf.appendChild(el('div', 'a-desc', ac.desc));
      var tr = el('div', 'bar-track thin');
      var fl = el('div', 'bar-fill q');
      fl.style.width = M.clamp01(val / ac.target) * 100 + '%';
      tr.appendChild(fl); inf.appendChild(tr);
      inf.appendChild(el('div', 'a-prog', RG.fmt(Math.min(val, ac.target)) + ' / ' + RG.fmt(ac.target)));
      card.appendChild(inf);
      s._ach.appendChild(card);
    }
    for (var m = 0; m < Data.MINIGAMES.length; m++) {
      var mg = Data.MINIGAMES[m];
      var c2 = el('div', 'stat');
      c2.appendChild(el('div', 'sv', RG.fmt(sv.best[mg.id] || 0)));
      c2.appendChild(el('div', 'sk', mg.name));
      s._best.appendChild(c2);
    }
  };

  /* ----------------------------------------------------------- settings */
  function buildSettings() {
    var s = makeScreen('settings', 'Settings');
    var b = s._body;
    var sv = function () { return g.save.settings; };

    b.appendChild(slider('Master volume', 0, 1, 0.05, function () { return sv().master; },
      function (v) { sv().master = v; UI.applySettings(); }));
    b.appendChild(slider('Music', 0, 1, 0.05, function () { return sv().music; },
      function (v) { sv().music = v; UI.applySettings(); }));
    b.appendChild(slider('Sound effects', 0, 1, 0.05, function () { return sv().sfx; },
      function (v) { sv().sfx = v; UI.applySettings(); }));
    b.appendChild(slider('Screen shake', 0, 1.5, 0.1, function () { return sv().shake; },
      function (v) { sv().shake = v; }));
    b.appendChild(choice('Render quality', [['0.75', 'Performance'], ['1', 'Balanced'], ['1.5', 'High']],
      function () { return String(sv().quality); },
      function (v) { sv().quality = parseFloat(v); RG.View.setQuality(parseFloat(v)); }));
    b.appendChild(choice('On-screen controls', [['auto', 'Auto'], ['on', 'Always on'], ['off', 'Off']],
      function () { return sv().touch; },
      function (v) { sv().touch = v; g.updateTouchMode(); }));
    b.appendChild(toggle('Mute all audio', function () { return sv().muted; },
      function (v) { sv().muted = v; UI.applySettings(); }));
    b.appendChild(toggle('Minimap', function () { return sv().minimap; }, function (v) { sv().minimap = v; }));
    b.appendChild(toggle('Damage numbers', function () { return sv().damageNumbers; }, function (v) { sv().damageNumbers = v; }));
    b.appendChild(toggle('Reduced effects', function () { return sv().lowFx; },
      function (v) { sv().lowFx = v; RG.Particles.budget = v ? 380 : 1400; }));
    b.appendChild(toggle('Show performance', function () { return sv().fps; }, function (v) { sv().fps = v; }));

    var adv = el('div', 'adv');
    adv.appendChild(el('h3', 'sec', 'Profile'));
    adv.appendChild(btn('Copy save code', '', function () {
      var code = RG.Save.exportString(g.save);
      copyText(code);
      UI.toast('Save code copied to clipboard', 'good');
    }));
    adv.appendChild(btn('Restore from code', '', function () { UI.promptImport(); }));
    adv.appendChild(btn('Erase profile', 'danger', function () {
      UI.confirm('Erase everything?', 'Your level, coins, gems and every unlocked skin will be gone for good.',
        function () { g.newGame(); UI.closeAll(); });
    }));
    b.appendChild(adv);

    var help = el('div', 'help');
    help.appendChild(el('h3', 'sec', 'Controls'));
    var rows = [
      ['Move', 'WASD / arrow keys / left stick'],
      ['Aim', 'Mouse / right stick'],
      ['Attack', 'Left mouse / J / right trigger'],
      ['Dash', 'Space / Shift / A button'],
      ['Ability', 'Q / F / right mouse / Y button'],
      ['Interact', 'E / X button'],
      ['Map', 'M or Tab'], ['Pause', 'Esc']
    ];
    for (var i = 0; i < rows.length; i++) {
      var r = el('div', 'srow');
      r.appendChild(el('span', 'k', rows[i][0]));
      r.appendChild(el('span', 'v', rows[i][1]));
      help.appendChild(r);
    }
    help.appendChild(el('p', 'note', 'On a touch screen: drag the left half of the display to move, drag the right half to aim and fire, and use the buttons for dash, ability and interact.'));
    b.appendChild(help);
  }

  function slider(label, min, max, step, get, set) {
    var row = el('div', 'setting');
    row.appendChild(el('label', '', label));
    var input = el('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step;
    input.value = get();
    var val = el('span', 'sval', formatVal(get(), max));
    on(input, 'input', function () {
      var v = parseFloat(input.value);
      set(v); val.textContent = formatVal(v, max);
    });
    row.appendChild(input);
    row.appendChild(val);
    row._sync = function () { input.value = get(); val.textContent = formatVal(get(), max); };
    settingNodes.push(row);
    return row;
  }
  function formatVal(v, max) { return max <= 1.5 ? Math.round(v / max * 100) + '%' : String(v); }
  function toggle(label, get, set) {
    var row = el('div', 'setting');
    row.appendChild(el('label', '', label));
    var b = el('button', 'switch');
    b.type = 'button';
    function sync() { b.classList.toggle('on', !!get()); b.textContent = get() ? 'On' : 'Off'; }
    on(b, 'click', function () { set(!get()); sync(); RG.Audio.play('ui'); });
    sync();
    row.appendChild(b);
    row._sync = sync;
    settingNodes.push(row);
    return row;
  }
  function choice(label, options, get, set) {
    var row = el('div', 'setting');
    row.appendChild(el('label', '', label));
    var wrap = el('div', 'seg');
    var btns = [];
    function sync() {
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i]._v === get());
    }
    for (var i = 0; i < options.length; i++) {
      (function (v, lbl) {
        var b = btn(lbl, 'seg-btn', function () { set(v); sync(); });
        b._v = v;
        btns.push(b);
        wrap.appendChild(b);
      })(options[i][0], options[i][1]);
    }
    sync();
    row.appendChild(wrap);
    row._sync = sync;
    settingNodes.push(row);
    return row;
  }
  var settingNodes = [];
  UI.refresh_settings = function () {
    for (var i = 0; i < settingNodes.length; i++) if (settingNodes[i]._sync) settingNodes[i]._sync();
  };

  UI.applySettings = function () {
    var s = g.save.settings;
    RG.Audio.setVolumes(s.master, s.music, s.sfx);
    RG.Audio.setMuted(s.muted);
    RG.Particles.budget = s.lowFx ? 380 : 1400;
    if (RG.View.quality !== s.quality) RG.View.setQuality(s.quality);
    g.queueSave();
  };

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); return; }
    } catch (e) { /* fall through to the textarea path */ }
    var ta = el('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* clipboard unavailable */ }
    document.body.removeChild(ta);
  }

  UI.promptImport = function () {
    var body = el('div', 'dlg-form');
    var ta = el('textarea', 'code-input');
    ta.placeholder = 'Paste your save code here';
    ta.rows = 4;
    body.appendChild(ta);
    UI.dialogNode('Restore profile', body, [
      ['Restore', 'primary', function () {
        var data = RG.Save.importString(ta.value);
        if (!data) { UI.toast('That code could not be read.', 'bad'); return; }
        g.loadProfile(data);
        UI.closeDialog();
        UI.toast('Profile restored.', 'good');
      }],
      ['Cancel', '', function () { UI.closeDialog(); }]
    ]);
  };

  /* ---------------------------------------------------------------- map */
  function buildMap() {
    var s = makeScreen('map', 'Map', { wide: true, full: true });
    s._canvas = el('canvas', 'bigmap');
    s._body.appendChild(s._canvas);
    s._legend = el('div', 'legend');
    s._body.appendChild(s._legend);
  }
  UI.refresh_map = function () {
    var s = screens.map;
    var w = g.world;
    var cv = s._canvas;
    var size = Math.min(720, Math.max(280, Math.min(window.innerWidth - 90, window.innerHeight - 220)));
    cv.width = size; cv.height = size;
    var c = cv.getContext('2d');
    c.fillStyle = '#0a0d16';
    c.fillRect(0, 0, size, size);
    c.imageSmoothingEnabled = false;
    c.drawImage(w.minimap, 0, 0, size, size);
    var k = size / w.px;
    for (var i = 0; i < w.structures.length; i++) {
      var st = w.structures[i];
      var col = structColor(st);
      if (!col) continue;
      var x = st.x * k, y = st.y * k;
      c.fillStyle = col;
      c.beginPath(); c.arc(x, y, 5, 0, M.TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.6; c.stroke();
    }
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(g.player.x * k, g.player.y * k, 5, 0, M.TAU); c.fill();
    c.strokeStyle = '#7fe0ff'; c.lineWidth = 2; c.stroke();

    clear(s._legend);
    var items = [['#a87aff', 'Portal'], ['#ff9a3a', 'Dungeon'], ['#7fe0ff', 'Shrine'],
    ['#f5c542', 'Cache'], ['#ff5fa2', 'Boss'], ['#ffffff', 'You']];
    for (var j = 0; j < items.length; j++) {
      var li = el('div', 'lg');
      var dot = el('span', 'dot');
      dot.style.background = items[j][0];
      li.appendChild(dot);
      li.appendChild(el('span', '', items[j][1]));
      s._legend.appendChild(li);
    }
  };

  /* ------------------------------------------------------------- arcade */
  function buildArcade() {
    var s = makeScreen('arcade', 'The Arcade', { wide: true });
    s._body.appendChild(el('p', 'intro', 'Four cabinets, four ways to earn. Beat your own best score for bonus coins.'));
    s._list = el('div', 'mini-list');
    s._body.appendChild(s._list);
  }
  UI.refresh_arcade = function () {
    var s = screens.arcade;
    clear(s._list);
    for (var i = 0; i < Data.MINIGAMES.length; i++) {
      (function (mg) {
        var card = el('div', 'mini-card');
        card.appendChild(iconImg(mg.icon, 40, 'big'));
        var inf = el('div', 'mc-info');
        inf.appendChild(el('div', 'mc-name', mg.name));
        inf.appendChild(el('div', 'mc-desc', mg.desc));
        inf.appendChild(el('div', 'mc-best', 'Best: ' + RG.fmt(g.save.best[mg.id] || 0)));
        card.appendChild(inf);
        card.appendChild(btn('Play', 'primary', function () { UI.closeAll(); g.startMinigame(mg.id); }));
        s._list.appendChild(card);
      })(Data.MINIGAMES[i]);
    }
  };

  /* ---------------------------------------------------------- game over */
  function buildGameOver() {
    var s = makeScreen('gameover', 'You Fell', { noClose: true });
    s._body.appendChild(el('p', 'go-text', ''));
    s._sum = el('div', 'stat-grid');
    s._body.appendChild(s._sum);
    var menu = el('div', 'title-menu');
    menu.appendChild(btn('Revive here (10 gems)', 'primary', function () { g.revive(); }));
    menu.appendChild(btn('Return to Aetherhold', '', function () { UI.closeAll(); g.travelTo('hub'); }));
    menu.appendChild(btn('Quit to Title', 'danger', function () { UI.closeAll(); g.toTitle(); }));
    s._body.appendChild(menu);
    s._revive = menu.firstChild;
  }
  UI.refresh_gameover = function () {
    var s = screens.gameover;
    s._body.querySelector('.go-text').textContent = g.deathMessage || 'The Blight took this one. It does not get to keep it.';
    s._revive.disabled = g.save.gems < 10;
    s._revive.classList.toggle('disabled', g.save.gems < 10);
    clear(s._sum);
    var rows = [['Run kills', g.runStats.kills], ['Run coins', RG.fmt(g.runStats.coins)], ['Depth', g.world.def.kind === 'dungeon' ? 'Floor ' + g.world.floor : g.world.def.name]];
    for (var i = 0; i < rows.length; i++) {
      var c = el('div', 'stat');
      c.appendChild(el('div', 'sv', '' + rows[i][1]));
      c.appendChild(el('div', 'sk', rows[i][0]));
      s._sum.appendChild(c);
    }
  };

  /* ------------------------------------------------------------- reward */
  function buildReward() {
    var s = makeScreen('reward', 'Reward', { noClose: true });
    s._body.classList.add('reward-body');
  }
  UI.showReward = function (title, lines, skin, onClose) {
    var s = screens.reward;
    s._head.querySelector('h2').textContent = title;
    clear(s._body);
    if (skin) {
      var cv = el('canvas', 'reward-skin');
      cv.width = 200; cv.height = 220;
      var c = cv.getContext('2d');
      var t0 = RG.now();
      (function anim() {
        if (!cv.isConnected) return;
        c.clearRect(0, 0, 200, 220);
        c.save(); c.translate(100, 195); c.scale(3.4, 3.4);
        Art.drawCharacter(c, skin, { t: (RG.now() - t0) / 1000, walk: 0.2, facing: 1, aim: -0.3, scale: 1 });
        c.restore();
        requestAnimationFrame(anim);
      })();
      s._body.appendChild(cv);
      s._body.appendChild(el('div', 'sd-rar r-' + skin.rarity, Data.RARITY[skin.rarity].name));
      s._body.appendChild(el('h3', '', skin.name));
      s._body.appendChild(el('div', 'sd-perk', skin.perkText));
    }
    var list = el('div', 'reward-lines');
    for (var i = 0; i < lines.length; i++) {
      var r = el('div', 'rl');
      if (lines[i].icon) r.appendChild(iconImg(lines[i].icon, 22));
      r.appendChild(el('span', '', lines[i].text));
      list.appendChild(r);
    }
    s._body.appendChild(list);
    var menu = el('div', 'title-menu');
    menu.appendChild(btn('Nice', 'primary big', function () {
      UI.back();
      if (onClose) onClose();
    }));
    s._body.appendChild(menu);
    UI.open('reward', UI.isOpen());
  };

  /* ------------------------------------------------------------- dialog */
  var dlg = null;
  function buildDialog() {
    dlg = el('div', 'screen dialog');
    dlg.id = 'screen-dialog';
    var panel = el('div', 'panel');
    var head = el('div', 'panel-head');
    head.appendChild(el('h2', '', ''));
    panel.appendChild(head);
    var body = el('div', 'panel-body scrollable');
    panel.appendChild(body);
    var actions = el('div', 'dlg-actions');
    panel.appendChild(actions);
    dlg.appendChild(panel);
    dlg._head = head.firstChild;
    dlg._body = body;
    dlg._actions = actions;
    $('screens').appendChild(dlg);
  }
  UI.dialogNode = function (title, node, actions) {
    dlg._head.textContent = title;
    clear(dlg._body);
    dlg._body.appendChild(node);
    clear(dlg._actions);
    for (var i = 0; i < actions.length; i++) {
      (function (a) { dlg._actions.appendChild(btn(a[0], a[1], a[2])); })(actions[i]);
    }
    dlg.classList.add('on');
    document.body.classList.add('modal');
    RG.Input.reset();
  };
  UI.closeDialog = function () {
    dlg.classList.remove('on');
    if (!current) { document.body.classList.remove('modal'); RG.Input.block(160); if (g) g.resumeFromMenu(); }
    /* refresh whatever is underneath, in case the dialog changed state */
    if (current) {
      var nm = current.id.replace('screen-', '');
      if (UI['refresh_' + nm]) UI['refresh_' + nm]();
    }
  };
  UI.dialogOpen = function () { return dlg && dlg.classList.contains('on'); };
  UI.confirm = function (title, text, onYes) {
    var body = el('div', 'dlg-text', '');
    body.textContent = text;
    UI.dialogNode(title, body, [
      ['Yes', 'danger', function () { UI.closeDialog(); onYes(); }],
      ['Cancel', '', function () { UI.closeDialog(); }]
    ]);
  };
  UI.info = function (title, text) {
    var body = el('div', 'dlg-text', '');
    body.textContent = text;
    UI.dialogNode(title, body, [['Got it', 'primary', function () { UI.closeDialog(); }]]);
  };

  /* ---------------------------------------------------------- world gate */
  function buildWorldGate() {
    var s = makeScreen('gate', 'Travel', { wide: true });
    s._list = el('div', 'world-list');
    s._body.appendChild(s._list);
  }
  UI.refresh_gate = function () {
    var s = screens.gate;
    clear(s._list);
    for (var i = 0; i < Data.WORLDS.length; i++) {
      (function (w) {
        if (w.id === 'hub') return;
        var sw = g.save.worlds[w.id] || {};
        var locked = !sw.unlocked;
        var card = el('div', 'world-card' + (locked ? ' locked' : ''));
        card.appendChild(iconImg(w.icon, 40, 'big'));
        var inf = el('div', 'wc-info');
        inf.appendChild(el('div', 'wc-name', w.name));
        inf.appendChild(el('div', 'wc-desc', w.desc));
        inf.appendChild(el('div', 'wc-meta', 'Recommended level ' + w.level + (sw.boss ? '  -  Boss defeated' : '')));
        card.appendChild(inf);
        if (locked) {
          var reqName = w.req ? Data.worldById(w.req).name : '';
          card.appendChild(el('div', 'tag lock', 'Defeat the boss of ' + reqName));
        } else {
          card.appendChild(btn('Travel', 'primary', function () { UI.closeAll(); g.travelTo(w.id); }));
        }
        s._list.appendChild(card);
      })(Data.WORLDS[i]);
    }
  };

  UI.screens = screens;
})(RG);
