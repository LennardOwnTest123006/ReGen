/* ReGen - bootstrap. Nothing here is game logic; it exists to make sure the
 * game starts on every platform we ship to and fails visibly rather than
 * silently if it cannot. */
'use strict';
(function (RG) {
  function showFatal(msg) {
    var box = document.getElementById('fatal');
    if (!box) return;
    box.style.display = 'flex';
    var d = document.getElementById('fatal-detail');
    if (d) d.textContent = msg;
  }

  function start() {
    try {
      var canvas = document.getElementById('game');
      if (!canvas || !canvas.getContext || !canvas.getContext('2d')) {
        showFatal('This device does not provide a 2D canvas context.');
        return;
      }
      var game = new RG.Game();
      RG.game = game;
      game.init();

      /* Audio may only start from a user gesture; take the first one we see. */
      var unlock = function () {
        RG.Audio.unlock();
        if (RG.Audio.ready) {
          RG.Audio.setVolumes(game.save.settings.master, game.save.settings.music, game.save.settings.sfx);
          RG.Audio.setMuted(game.save.settings.muted);
          RG.Audio.playMusic(game.state === 'title' ? 'menu' : (game.world.def.music || 'hub'));
          window.removeEventListener('pointerdown', unlock);
          window.removeEventListener('keydown', unlock);
          window.removeEventListener('touchstart', unlock);
        }
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
      window.addEventListener('touchstart', unlock);

      var splash = document.getElementById('splash');
      if (splash) {
        splash.classList.add('gone');
        setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 700);
      }

      window.addEventListener('error', function (e) {
        if (window.console && console.error) console.error('[ReGen] uncaught', e.message);
      });
      window.addEventListener('unhandledrejection', function (e) {
        if (window.console && console.error) console.error('[ReGen] promise', e.reason);
      });
    } catch (err) {
      showFatal((err && err.stack) ? err.stack : String(err));
      if (window.console && console.error) console.error(err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(RG);
