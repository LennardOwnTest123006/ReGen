/* ReGen - game data: the wardrobe, the bestiary, the worlds, the shop and
 * every quest and achievement. Kept declarative so balance can be tuned in
 * one place without touching a line of game logic. */
'use strict';
(function (RG) {
  var Data = RG.Data = {};

  /* -------------------------------------------------------- rarities */
  Data.RARITY = {
    common: { name: 'Common', color: '#9fb0c8', order: 0, glow: 0 },
    rare: { name: 'Rare', color: '#4fa8f0', order: 1, glow: 0.25 },
    epic: { name: 'Epic', color: '#b06ff0', order: 2, glow: 0.45 },
    legendary: { name: 'Legendary', color: '#f5a742', order: 3, glow: 0.7 },
    mythic: { name: 'Mythic', color: '#ff5fa2', order: 4, glow: 1 }
  };

  /* ------------------------------------------------------------ skins */
  /* perk keys: hp, dmg, spd, crit, luck, coin, xp, dashCd, armor, regen */
  function skin(id, name, rarity, price, cur, colors, flags, perk, perkText, lore) {
    return {
      id: id, name: name, rarity: rarity, price: price, currency: cur || 'coins',
      colors: colors, weapon: flags.weapon || 'blade',
      hood: !!flags.hood, helm: !!flags.helm, mask: !!flags.mask, horns: !!flags.horns,
      ears: !!flags.ears, crown: !!flags.crown, halo: !!flags.halo, cape: !!flags.cape,
      wings: !!flags.wings, longHair: !!flags.longHair, glowEyes: !!flags.glowEyes,
      emblem: !!flags.emblem, bigHead: !!flags.bigHead, faceless: !!flags.faceless,
      trail: flags.trail || null, aura: flags.aura || null,
      perk: perk || {}, perkText: perkText || 'No bonus', lore: lore || '',
      unlock: flags.unlock || null
    };
  }

  Data.SKINS = [
    /* ---------------- common ---------------- */
    skin('wanderer', 'Wanderer', 'common', 0, 'coins',
      { skin: '#e8b98a', hair: '#5a3a24', primary: '#4a7ac8', secondary: '#2e4f88', accent: '#f0c860', trim: '#e8e4d8' },
      { weapon: 'blade' }, {}, 'The starting kit. Balanced and honest.',
      'Every Regen begins here, with a borrowed blade and a stubborn heart.'),
    skin('scout', 'Scout', 'common', 220, 'coins',
      { skin: '#d8a878', hair: '#3a2a18', primary: '#5a8f4a', secondary: '#3a6030', accent: '#d8c060', trim: '#cfe0b8' },
      { weapon: 'dagger', hood: true }, { spd: 0.06 }, '+6% move speed',
      'Light boots, lighter conscience.'),
    skin('apprentice', 'Apprentice', 'common', 240, 'coins',
      { skin: '#f0c8a0', hair: '#8a5a2a', primary: '#6a5ac8', secondary: '#443a8a', accent: '#8ad6ff', trim: '#d8d0f0' },
      { weapon: 'staff' }, { dmg: 0.05 }, '+5% damage',
      'Still burns the eyebrows off, but less often now.'),
    skin('digger', 'Digger', 'common', 260, 'coins',
      { skin: '#c89870', hair: '#4a3018', primary: '#a07a48', secondary: '#6a4f2e', accent: '#e8c060', trim: '#e0d0b0' },
      { weapon: 'hammer' }, { coin: 0.08 }, '+8% coins found',
      'Believes every hill is hollow. Usually right.'),
    skin('striped', 'Tidewalker', 'common', 300, 'coins',
      { skin: '#e0b088', hair: '#204a5a', primary: '#2f8fa8', secondary: '#1d6070', accent: '#a8e8f0', trim: '#e8f4f8' },
      { weapon: 'blade' }, { hp: 8 }, '+8 max health',
      'Salt in the hair, tide in the step.'),
    skin('forager', 'Forager', 'common', 320, 'coins',
      { skin: '#e8c090', hair: '#6a4a20', primary: '#7a9a48', secondary: '#52702e', accent: '#f0e068', trim: '#e8e0c0' },
      { weapon: 'dagger', ears: false }, { luck: 2 }, '+2 luck',
      'Knows which berries argue back.'),
    skin('guard', 'Town Guard', 'common', 340, 'coins',
      { skin: '#d0a078', hair: '#2a2018', primary: '#6a7a8f', secondary: '#465464', accent: '#c8a840', trim: '#d8dde8' },
      { weapon: 'blade', helm: true }, { armor: 2 }, '+2 armour',
      'Sixteen years on the gate. Nothing ever happened. Until now.'),
    skin('pilgrim', 'Pilgrim', 'common', 360, 'coins',
      { skin: '#f0d0b0', hair: '#c8b090', primary: '#c8c0b0', secondary: '#8f8778', accent: '#e0c070', trim: '#f4f0e8' },
      { weapon: 'staff', hood: true }, { regen: 0.4 }, '+0.4 health per second',
      'Walks toward the light because sitting still is worse.'),
    skin('bruiser', 'Bruiser', 'common', 380, 'coins',
      { skin: '#c88860', hair: '#301c10', primary: '#a8483c', secondary: '#742e26', accent: '#e8a848', trim: '#e0c8b0' },
      { weapon: 'hammer' }, { dmg: 0.09, spd: -0.03 }, '+9% damage, -3% speed',
      'Solves problems the way a hammer solves problems.'),
    skin('lantern', 'Lantern Bearer', 'common', 400, 'coins',
      { skin: '#e8c098', hair: '#4a3a28', primary: '#c8a048', secondary: '#8a6a28', accent: '#ffe08a', trim: '#f4e8c8' },
      { weapon: 'blade', trail: '#ffd88a' }, { luck: 3 }, '+3 luck',
      'Carries the last warm light out of Aetherhold.'),
    skin('angler', 'Angler', 'common', 420, 'coins',
      { skin: '#dcae82', hair: '#2a3a4a', primary: '#3a6a8a', secondary: '#264a62', accent: '#a8d8e8', trim: '#dce8f0' },
      { weapon: 'dagger' }, { luck: 2, coin: 0.05 }, '+2 luck, +5% coins',
      'Patient in a way that unsettles other people.'),
    skin('runner', 'Duskrunner', 'common', 450, 'coins',
      { skin: '#c0906a', hair: '#1a1a24', primary: '#3a3a5a', secondary: '#26263c', accent: '#7fe0ff', trim: '#a8b0d0' },
      { weapon: 'dagger', hood: true }, { spd: 0.08, dashCd: 0.1 }, '+8% speed, -10% dash cooldown',
      'Arrives before the message about her arrival.'),

    /* ---------------- rare ---------------- */
    skin('emberknight', 'Ember Knight', 'rare', 1200, 'coins',
      { skin: '#d8a070', hair: '#2a1810', primary: '#b8442a', secondary: '#7a2818', accent: '#ff9a3a', trim: '#f0c8a0', metal: '#e8c8a8' },
      { weapon: 'greatsword', helm: true, cape: true, trail: '#ff8a3a' }, { dmg: 0.12, hp: 10 }, '+12% damage, +10 health',
      'Forged in the Ember Wastes, cooled in nothing at all.'),
    skin('frostward', 'Frostward', 'rare', 1200, 'coins',
      { skin: '#e8d0c0', hair: '#c8e0f0', primary: '#5a90c0', secondary: '#3a6088', accent: '#bde2f2', trim: '#eaf4ff' },
      { weapon: 'staff', cape: true, longHair: true, trail: '#bde2f2' }, { armor: 4, hp: 12 }, '+4 armour, +12 health',
      'Warmth is a decision. She made a different one.'),
    skin('thornmage', 'Thorn Mage', 'rare', 1300, 'coins',
      { skin: '#e0b890', hair: '#2f5d2e', primary: '#3f7a52', secondary: '#2a5638', accent: '#a8e868', trim: '#d8f0c0' },
      { weapon: 'staff', hood: true, trail: '#8ad868' }, { dmg: 0.1, regen: 0.6 }, '+10% damage, +0.6 regen',
      'Grew a garden inside a ruin. It bit back, politely.'),
    skin('sandcloak', 'Sand Cloak', 'rare', 1300, 'coins',
      { skin: '#c89058', hair: '#3a2a18', primary: '#d8b878', secondary: '#a08048', accent: '#f0d890', trim: '#f4e8c8' },
      { weapon: 'bow', hood: true, mask: true }, { crit: 0.06, spd: 0.05 }, '+6% crit, +5% speed',
      'The dunes keep her secrets because she keeps theirs.'),
    skin('houndmaster', 'Houndmaster', 'rare', 1400, 'coins',
      { skin: '#d0a070', hair: '#5a3018', primary: '#7a5a3a', secondary: '#4f3a24', accent: '#e0a848', trim: '#e8d8c0' },
      { weapon: 'hammer', cape: true }, { dmg: 0.08, armor: 3 }, '+8% damage, +3 armour',
      'The hounds are gone. The whistle is not.'),
    skin('sirenblade', 'Siren Blade', 'rare', 1400, 'coins',
      { skin: '#e0c0a8', hair: '#2a7a90', primary: '#2f8fa8', secondary: '#1d6070', accent: '#8ceaff', trim: '#e0f8ff' },
      { weapon: 'blade', longHair: true, trail: '#8ceaff' }, { crit: 0.08 }, '+8% crit chance',
      'Sings one note. Everything within reach agrees with it.'),
    skin('bellringer', 'Bell Ringer', 'rare', 1500, 'coins',
      { skin: '#f0d0b0', hair: '#8a7a5a', primary: '#8a8fa8', secondary: '#5a6070', accent: '#f5c542', trim: '#e8e4d8' },
      { weapon: 'hammer', helm: true }, { hp: 20 }, '+20 max health',
      'Rang the alarm for nine hours. Nobody came. He kept ringing.'),
    skin('gilded', 'Gilded Hand', 'rare', 1600, 'coins',
      { skin: '#e8c8a0', hair: '#c8a040', primary: '#c8a048', secondary: '#8a6a28', accent: '#f5c542', trim: '#fff0c0' },
      { weapon: 'dagger', cape: true, emblem: true }, { coin: 0.22 }, '+22% coins found',
      'Counts in a currency that has not been minted yet.'),
    skin('stormcaller', 'Stormcaller', 'rare', 1700, 'coins',
      { skin: '#d8b088', hair: '#3a4a6a', primary: '#4a5a9a', secondary: '#2e3a6a', accent: '#f5d742', trim: '#c0d0f0' },
      { weapon: 'staff', cape: true, glowEyes: true, trail: '#f5d742' }, { dmg: 0.14 }, '+14% damage',
      'Weather is a suggestion.'),
    skin('mossheart', 'Mossheart', 'rare', 1700, 'coins',
      { skin: '#c8a878', hair: '#4a8a5e', primary: '#4a8a5e', secondary: '#2f5d3e', accent: '#a8e868', trim: '#d0e8c0' },
      { weapon: 'scythe', ears: true, longHair: true }, { regen: 1.1, xp: 0.08 }, '+1.1 regen, +8% XP',
      'Older than the forest. The forest disputes this.'),
    skin('ashmarked', 'Ash-Marked', 'rare', 1800, 'coins',
      { skin: '#a88868', hair: '#1a1618', primary: '#4a4348', secondary: '#2e2a2e', accent: '#ff7a2a', trim: '#8a8088' },
      { weapon: 'greatsword', mask: true, trail: '#ff7a2a' }, { dmg: 0.11, crit: 0.05 }, '+11% damage, +5% crit',
      'Walked out of the caldera and never explained it.'),
    skin('cartographer', 'Cartographer', 'rare', 1800, 'coins',
      { skin: '#e8c8a0', hair: '#6a5a3a', primary: '#a89048', secondary: '#6a5a28', accent: '#e0d2a8', trim: '#f4ecd8' },
      { weapon: 'dagger', cape: true }, { luck: 5, xp: 0.1 }, '+5 luck, +10% XP',
      'Draws the map by walking off the edge of it.'),

    /* ---------------- epic ---------------- */
    skin('voidwalker', 'Voidwalker', 'epic', 40, 'gems',
      { skin: '#a890c8', hair: '#2a1a3a', primary: '#3a2454', secondary: '#241638', accent: '#c08aff', trim: '#8a6ad8', glow: '#c08aff' },
      { weapon: 'scythe', hood: true, glowEyes: true, cape: true, faceless: true, trail: '#c08aff', aura: '#8a4ad8' },
      { dmg: 0.16, spd: 0.06 }, '+16% damage, +6% speed',
      'Stepped between two moments and liked the room in there.'),
    skin('sunpriest', 'Sun Priest', 'epic', 40, 'gems',
      { skin: '#f0d0a8', hair: '#f0d060', primary: '#f0e0b0', secondary: '#d8b060', accent: '#ffcf4a', trim: '#fff8e0' },
      { weapon: 'staff', halo: true, cape: true, longHair: true, trail: '#ffd76a', aura: '#ffcf4a' },
      { regen: 2, hp: 24 }, '+2 regen, +24 health',
      'Carries a morning that refuses to end.'),
    skin('nightfang', 'Nightfang', 'epic', 45, 'gems',
      { skin: '#c0a0b0', hair: '#1a1420', primary: '#2a1c30', secondary: '#170f20', accent: '#e8455c', trim: '#6a4a5a' },
      { weapon: 'dagger', horns: true, glowEyes: true, cape: true, trail: '#e8455c' },
      { crit: 0.16, spd: 0.08 }, '+16% crit, +8% speed',
      'Two bites. The first is courtesy.'),
    skin('ironveil', 'Iron Veil', 'epic', 45, 'gems',
      { skin: '#d0a880', hair: '#2a2a30', primary: '#6a7080', secondary: '#42485a', accent: '#8ad6ff', trim: '#c8d0e0', metal: '#e8eef8' },
      { weapon: 'greatsword', helm: true, cape: true, emblem: true },
      { armor: 10, hp: 30, spd: -0.04 }, '+10 armour, +30 health, -4% speed',
      'The veil is not for hiding. It is for holding the line.'),
    skin('bloomseer', 'Bloomseer', 'epic', 50, 'gems',
      { skin: '#e8c0b8', hair: '#e878a8', primary: '#5aa055', secondary: '#3a6f38', accent: '#f0a0c8', trim: '#ffe0ee' },
      { weapon: 'orb', longHair: true, wings: true, trail: '#f0a0c8', aura: '#7ad86a' },
      { regen: 1.6, luck: 8, xp: 0.14 }, '+1.6 regen, +8 luck, +14% XP',
      'Every step leaves something growing behind her.'),
    skin('cinderlord', 'Cinderlord', 'epic', 50, 'gems',
      { skin: '#b06848', hair: '#3a1810', primary: '#8a2818', secondary: '#5a180e', accent: '#ff9a3a', trim: '#e88a48', metal: '#ffb060' },
      { weapon: 'greatsword', horns: true, cape: true, glowEyes: true, trail: '#ff7a2a', aura: '#ff5a1a' },
      { dmg: 0.22, hp: -10 }, '+22% damage, -10 health',
      'Burns the candle at every end he can find.'),
    skin('glacier', 'Glacier', 'epic', 55, 'gems',
      { skin: '#dce8f0', hair: '#a8d4e8', primary: '#8fc0d8', secondary: '#5a90b0', accent: '#eaf6ff', trim: '#ffffff' },
      { weapon: 'hammer', helm: true, cape: true, trail: '#bde2f2', aura: '#8fd0f0' },
      { armor: 8, dmg: 0.1, hp: 20 }, '+8 armour, +10% damage, +20 health',
      'Moves one inch a century, and always arrives on time.'),
    skin('mirage', 'Mirage', 'epic', 55, 'gems',
      { skin: '#e0b088', hair: '#d8c090', primary: '#d8a058', secondary: '#a87838', accent: '#8ceaff', trim: '#f4e0b0' },
      { weapon: 'bow', mask: true, cape: true, trail: '#f0d890' },
      { spd: 0.14, crit: 0.1, dashCd: 0.2 }, '+14% speed, +10% crit, -20% dash cooldown',
      'You saw her. You are almost sure you saw her.'),
    skin('hollowking', 'Hollow King', 'epic', 60, 'gems',
      { skin: '#c8c0b0', hair: '#3a3428', primary: '#4a4258', secondary: '#2e2838', accent: '#f5c542', trim: '#a89870' },
      { weapon: 'scythe', crown: true, cape: true, glowEyes: true, aura: '#8a7ad8' },
      { dmg: 0.14, coin: 0.3 }, '+14% damage, +30% coins',
      'Rules a kingdom of empty chairs, and rules it well.'),
    skin('tempest', 'Tempest', 'epic', 60, 'gems',
      { skin: '#d8b098', hair: '#5a6a9a', primary: '#3a5a8a', secondary: '#243c62', accent: '#7fe0ff', trim: '#c0e0f8' },
      { weapon: 'orb', wings: true, glowEyes: true, trail: '#7fe0ff', aura: '#4a90d8' },
      { spd: 0.12, dmg: 0.12, dashCd: 0.25 }, '+12% speed, +12% damage, -25% dash cooldown',
      'The eye of the storm is not calm. It is deciding.'),
    skin('grovewarden', 'Grove Warden', 'epic', 65, 'gems',
      { skin: '#a89878', hair: '#3f7a52', primary: '#4a8a5e', secondary: '#2f5d3e', accent: '#c8e868', trim: '#a8d888' },
      { weapon: 'hammer', horns: true, cape: true, emblem: true, aura: '#7ad86a' },
      { hp: 40, armor: 6, regen: 1.2 }, '+40 health, +6 armour, +1.2 regen',
      'Bark for skin, patience for blood.'),
    skin('shadowstitch', 'Shadowstitch', 'epic', 65, 'gems',
      { skin: '#b8a0b0', hair: '#20182a', primary: '#241c34', secondary: '#140f1e', accent: '#a87aff', trim: '#5a4a70' },
      { weapon: 'dagger', hood: true, mask: true, faceless: true, cape: true, trail: '#a87aff' },
      { crit: 0.2, spd: 0.1, hp: -12 }, '+20% crit, +10% speed, -12 health',
      'Sewn together from other people\u2019s dark corners.'),

    /* ---------------- legendary ---------------- */
    skin('aurora', 'Aurora', 'legendary', 120, 'gems',
      { skin: '#f0e0e8', hair: '#8ceaff', primary: '#6a8ad8', secondary: '#4a5aa8', accent: '#a8ffd8', trim: '#ffffff', glow: '#a8ffd8' },
      { weapon: 'orb', halo: true, wings: true, longHair: true, glowEyes: true, trail: '#a8ffd8', aura: '#6affd8' },
      { dmg: 0.2, spd: 0.1, regen: 2, luck: 10 }, '+20% damage, +10% speed, +2 regen, +10 luck',
      'The sky over Frostbite Reach, folded small enough to carry.'),
    skin('warlord', 'Warlord of Ash', 'legendary', 120, 'gems',
      { skin: '#a86848', hair: '#2a1008', primary: '#6a1c14', secondary: '#3f0f0a', accent: '#ff7a2a', trim: '#c85a2a', metal: '#ffa050' },
      { weapon: 'greatsword', horns: true, helm: true, cape: true, glowEyes: true, trail: '#ff5a1a', aura: '#ff3a0a' },
      { dmg: 0.3, hp: 30, spd: -0.05 }, '+30% damage, +30 health, -5% speed',
      'The Ember Wastes were a country once. He is what is left of the argument.'),
    skin('starweave', 'Starweave', 'legendary', 130, 'gems',
      { skin: '#e8d8f0', hair: '#c8a8ff', primary: '#3a2a6a', secondary: '#241a4a', accent: '#ffe89a', trim: '#a88aff', glow: '#ffe89a' },
      { weapon: 'staff', hood: true, cape: true, glowEyes: true, trail: '#ffe89a', aura: '#a88aff' },
      { dmg: 0.18, xp: 0.35, luck: 14 }, '+18% damage, +35% XP, +14 luck',
      'Knits constellations into rope and climbs down.'),
    skin('leviathan', 'Leviathan', 'legendary', 130, 'gems',
      { skin: '#8ab8c8', hair: '#1a4a5a', primary: '#1d6070', secondary: '#0f3f4c', accent: '#4affd8', trim: '#8ceaff', glow: '#4affd8' },
      { weapon: 'scythe', horns: true, cape: true, glowEyes: true, trail: '#4affd8', aura: '#2aa8c8' },
      { hp: 60, armor: 12, dmg: 0.12 }, '+60 health, +12 armour, +12% damage',
      'Something that used to live under the map.'),
    skin('phoenix', 'Phoenix', 'legendary', 140, 'gems',
      { skin: '#f0c0a0', hair: '#ff9a3a', primary: '#d8481a', secondary: '#a02810', accent: '#ffd76a', trim: '#ffb060', glow: '#ffd76a' },
      { weapon: 'blade', wings: true, halo: true, glowEyes: true, trail: '#ff9a3a', aura: '#ff6a1a' },
      { dmg: 0.24, regen: 3, hp: 20 }, '+24% damage, +3 regen, +20 health',
      'Dies exactly as often as it needs to.'),
    skin('oblivion', 'Oblivion', 'legendary', 140, 'gems',
      { skin: '#8a7aa8', hair: '#0f0a1a', primary: '#150e26', secondary: '#0a0614', accent: '#d0a0ff', trim: '#5a3a8a', glow: '#d0a0ff' },
      { weapon: 'scythe', hood: true, faceless: true, cape: true, glowEyes: true, horns: true, trail: '#d0a0ff', aura: '#6a2ad8' },
      { dmg: 0.28, crit: 0.14, hp: -20 }, '+28% damage, +14% crit, -20 health',
      'The quiet at the bottom of the Void Sanctum, wearing a coat.'),
    skin('verdance', 'Verdance', 'legendary', 150, 'gems',
      { skin: '#d8c8a0', hair: '#7ad86a', primary: '#357a4a', secondary: '#1f5030', accent: '#c8ff8a', trim: '#a8e868', glow: '#c8ff8a' },
      { weapon: 'orb', crown: true, ears: true, longHair: true, wings: true, trail: '#c8ff8a', aura: '#4ad86a' },
      { hp: 50, regen: 4, luck: 12, xp: 0.2 }, '+50 health, +4 regen, +12 luck, +20% XP',
      'The first thing that grew back. It has opinions about the second.'),
    skin('chronarch', 'Chronarch', 'legendary', 150, 'gems',
      { skin: '#e0d0c0', hair: '#c0c8e0', primary: '#5a5a8a', secondary: '#3a3a62', accent: '#8ceaff', trim: '#d0d8f0', glow: '#8ceaff' },
      { weapon: 'orb', crown: true, cape: true, halo: true, glowEyes: true, trail: '#8ceaff', aura: '#5a8ad8' },
      { spd: 0.2, dashCd: 0.45, crit: 0.12 }, '+20% speed, -45% dash cooldown, +12% crit',
      'Has already read this sentence.'),
    skin('sovereignskin', 'The Sovereign', 'legendary', 160, 'gems',
      { skin: '#c8b8d8', hair: '#3a1a5a', primary: '#2a1450', secondary: '#180a30', accent: '#ff5fa2', trim: '#a83ad8', glow: '#ff5fa2' },
      { weapon: 'scythe', crown: true, horns: true, cape: true, wings: true, glowEyes: true, faceless: true, trail: '#ff5fa2', aura: '#a83ad8' },
      { dmg: 0.32, hp: 40, crit: 0.1, armor: 6 }, '+32% damage, +40 health, +10% crit, +6 armour',
      'What the Void Sanctum was built to keep in.'),

    /* ---------------- mythic (earned, never bought) ---------------- */
    skin('regenesis', 'Regenesis', 'mythic', 0, 'locked',
      { skin: '#f4ecff', hair: '#ffffff', primary: '#1c2450', secondary: '#101838', accent: '#7fffd4', trim: '#ffd76a', glow: '#7fffd4' },
      { weapon: 'greatsword', crown: true, halo: true, wings: true, cape: true, glowEyes: true, emblem: true, trail: '#7fffd4', aura: '#ffd76a', unlock: 'Restore all four worlds' },
      { dmg: 0.35, hp: 60, spd: 0.12, regen: 3, crit: 0.12, luck: 15, xp: 0.25 },
      '+35% damage, +60 health, +12% speed, +3 regen, +12% crit, +15 luck, +25% XP',
      'The world, remade, wearing the shape of whoever remade it.'),
    skin('archivist', 'The Archivist', 'mythic', 0, 'locked',
      { skin: '#e8e0f0', hair: '#d0c0ff', primary: '#2a2450', secondary: '#181038', accent: '#ffe89a', trim: '#a89aff', glow: '#ffe89a' },
      { weapon: 'staff', hood: true, halo: true, cape: true, glowEyes: true, trail: '#ffe89a', aura: '#a89aff', unlock: 'Collect 30 skins' },
      { xp: 0.5, luck: 25, coin: 0.5, dmg: 0.15 }, '+50% XP, +25 luck, +50% coins, +15% damage',
      'Keeps a record of every version of the world. Including yours.'),
    skin('perfectrun', 'Flawless', 'mythic', 0, 'locked',
      { skin: '#f0e8e0', hair: '#f5c542', primary: '#c8a048', secondary: '#8a6a28', accent: '#ffffff', trim: '#fff0c0', glow: '#ffffff' },
      { weapon: 'blade', crown: true, cape: true, wings: true, emblem: true, trail: '#ffffff', aura: '#f5c542', unlock: 'Clear a dungeon without taking damage' },
      { crit: 0.25, dmg: 0.2, spd: 0.15, dashCd: 0.3 }, '+25% crit, +20% damage, +15% speed, -30% dash cooldown',
      'Not untouchable. Just never touched.')
  ];

  Data.skinById = function (id) {
    for (var i = 0; i < Data.SKINS.length; i++) if (Data.SKINS[i].id === id) return Data.SKINS[i];
    return Data.SKINS[0];
  };

  /* ---------------------------------------------------------- enemies */
  /* ai: chase | charge | shoot | orbit | wander | burst | summon | boss */
  function foe(id, name, kind, pal, o) {
    return {
      id: id, name: name, kind: kind, pal: pal,
      hp: o.hp, dmg: o.dmg, speed: o.speed, r: o.r || 9,
      ai: o.ai || 'chase', xp: o.xp || 6, coins: o.coins || 4,
      range: o.range || 0, cd: o.cd || 1.4, scale: o.scale || 1,
      proj: o.proj || null, boss: !!o.boss, elite: !!o.elite,
      knock: o.knock === undefined ? 1 : o.knock,
      tell: o.tell || 0.4, count: o.count || 0, gem: o.gem || 0
    };
  }
  var P = function (main, dark, accent) { return { main: main, dark: dark, accent: accent }; };

  Data.ENEMIES = {
    /* verdant */
    slime_green: foe('slime_green', 'Bloom Slime', 'slime', P('#5aa055', '#2f5d2e', '#c8ff8a'),
      { hp: 26, dmg: 7, speed: 34, r: 9, xp: 5, coins: 3 }),
    slime_blue: foe('slime_blue', 'Dew Slime', 'slime', P('#4a90c8', '#274a70', '#a8e8ff'),
      { hp: 34, dmg: 8, speed: 40, r: 9, xp: 7, coins: 4 }),
    bat_forest: foe('bat_forest', 'Thornbat', 'bat', P('#6a5a48', '#38302a', '#f0d060'),
      { hp: 20, dmg: 8, speed: 74, r: 8, ai: 'orbit', xp: 7, coins: 4, range: 90 }),
    spider_wood: foe('spider_wood', 'Weaver', 'spider', P('#7a5a3a', '#3f2e1e', '#e8455c'),
      { hp: 32, dmg: 9, speed: 52, r: 10, ai: 'charge', xp: 9, coins: 5 }),
    imp_moss: foe('imp_moss', 'Moss Imp', 'imp', P('#4a8a5e', '#2a5638', '#c8ff8a'),
      { hp: 30, dmg: 8, speed: 46, r: 9, ai: 'shoot', range: 170, cd: 1.9, xp: 10, coins: 6,
        proj: { speed: 130, dmg: 8, r: 4, color: '#a8e868', life: 2.2 } }),
    wolf_grey: foe('wolf_grey', 'Grey Stalker', 'wolf', P('#8a8478', '#4a463e', '#f0c860'),
      { hp: 44, dmg: 11, speed: 78, r: 11, ai: 'charge', xp: 13, coins: 7 }),
    wisp_green: foe('wisp_green', 'Seedwisp', 'wisp', P('#a8e868', '#4a8a3e', '#e8ffc0'),
      { hp: 24, dmg: 9, speed: 60, r: 8, ai: 'orbit', range: 120, xp: 9, coins: 5 }),

    /* ember */
    imp_fire: foe('imp_fire', 'Cinder Imp', 'imp', P('#c8482a', '#7a2818', '#ffcf6a'),
      { hp: 42, dmg: 12, speed: 56, r: 9, ai: 'shoot', range: 200, cd: 1.6, xp: 15, coins: 9,
        proj: { speed: 160, dmg: 12, r: 5, color: '#ff9a3a', life: 2.2, trail: '#ff7a2a' } }),
    flame_lesser: foe('flame_lesser', 'Ember Sprite', 'flame', P('#d8481a', '#8a2010', '#ffd76a'),
      { hp: 36, dmg: 13, speed: 64, r: 9, ai: 'chase', xp: 14, coins: 8 }),
    golem_ash: foe('golem_ash', 'Ash Golem', 'golem', P('#6a5a52', '#3a322e', '#ff7a2a'),
      { hp: 120, dmg: 18, speed: 32, r: 15, ai: 'charge', xp: 30, coins: 20, knock: 0.35, scale: 1.15 }),
    skeleton_burn: foe('skeleton_burn', 'Scorched', 'skeleton', P('#c8b8a0', '#6a5a48', '#ff7a2a'),
      { hp: 52, dmg: 14, speed: 58, r: 10, xp: 18, coins: 11 }),
    turret_ember: foe('turret_ember', 'Ember Node', 'turret', P('#8a3a20', '#4a1c10', '#ff9a3a'),
      { hp: 60, dmg: 14, speed: 0, r: 11, ai: 'shoot', range: 260, cd: 1.3, xp: 16, coins: 12,
        proj: { speed: 185, dmg: 14, r: 5, color: '#ffcf6a', life: 2.4, trail: '#ff7a2a' } }),
    crab_magma: foe('crab_magma', 'Magma Crab', 'crab', P('#b8442a', '#6a2010', '#ffcf6a'),
      { hp: 70, dmg: 15, speed: 44, r: 12, ai: 'charge', xp: 20, coins: 13, knock: 0.6 }),

    /* frost */
    wolf_frost: foe('wolf_frost', 'Frost Fang', 'wolf', P('#c8dcea', '#6a8098', '#7fe0ff'),
      { hp: 66, dmg: 16, speed: 92, r: 11, ai: 'charge', xp: 24, coins: 14 }),
    skeleton_ice: foe('skeleton_ice', 'Rimebone', 'skeleton', P('#dfe8f2', '#8fa8c0', '#8ceaff'),
      { hp: 70, dmg: 17, speed: 56, r: 10, xp: 26, coins: 15 }),
    golem_ice: foe('golem_ice', 'Glacial Sentinel', 'golem', P('#8fc0d8', '#4a7088', '#eaf6ff'),
      { hp: 180, dmg: 22, speed: 30, r: 16, ai: 'charge', xp: 46, coins: 30, knock: 0.3, scale: 1.2 }),
    wisp_frost: foe('wisp_frost', 'Chillwisp', 'wisp', P('#bde2f2', '#5a90b0', '#ffffff'),
      { hp: 48, dmg: 15, speed: 70, r: 9, ai: 'shoot', range: 210, cd: 1.5, xp: 22, coins: 13,
        proj: { speed: 150, dmg: 15, r: 5, color: '#bde2f2', life: 2.6, trail: '#8ceaff' } }),
    knight_frost: foe('knight_frost', 'Rime Knight', 'knight', P('#7aa0c0', '#3f5a74', '#eaf6ff'),
      { hp: 150, dmg: 24, speed: 50, r: 12, ai: 'charge', xp: 44, coins: 28, elite: true }),
    bat_ice: foe('bat_ice', 'Frostwing', 'bat', P('#a8c8e0', '#5a7890', '#eaf6ff'),
      { hp: 46, dmg: 15, speed: 96, r: 8, ai: 'orbit', range: 100, xp: 20, coins: 12 }),

    /* void */
    shade_void: foe('shade_void', 'Shade', 'shade', P('#3a2454', '#1a0e2e', '#c08aff'),
      { hp: 92, dmg: 24, speed: 68, r: 10, xp: 40, coins: 24 }),
    wisp_void: foe('wisp_void', 'Null Wisp', 'wisp', P('#a87aff', '#4a2a8a', '#f0d8ff'),
      { hp: 76, dmg: 22, speed: 82, r: 9, ai: 'shoot', range: 240, cd: 1.2, xp: 38, coins: 22,
        proj: { speed: 175, dmg: 22, r: 6, color: '#c08aff', life: 2.8, trail: '#a87aff' } }),
    knight_void: foe('knight_void', 'Voidsworn', 'knight', P('#4a3a6a', '#241838', '#ff5fa2'),
      { hp: 220, dmg: 30, speed: 58, r: 13, ai: 'charge', xp: 70, coins: 44, elite: true }),
    golem_void: foe('golem_void', 'Rift Colossus', 'golem', P('#3a2a5a', '#1c1230', '#d0a0ff'),
      { hp: 300, dmg: 34, speed: 30, r: 17, ai: 'charge', xp: 96, coins: 62, knock: 0.2, scale: 1.3 }),
    turret_void: foe('turret_void', 'Rift Eye', 'turret', P('#4a2a7a', '#241040', '#ff5fa2'),
      { hp: 130, dmg: 24, speed: 0, r: 12, ai: 'shoot', range: 300, cd: 0.95, xp: 46, coins: 30,
        proj: { speed: 200, dmg: 24, r: 6, color: '#ff5fa2', life: 3, trail: '#c08aff' } }),
    spider_void: foe('spider_void', 'Riftweaver', 'spider', P('#5a3a8a', '#2a1848', '#ff5fa2'),
      { hp: 120, dmg: 26, speed: 74, r: 11, ai: 'charge', xp: 52, coins: 32 }),

    /* dungeon-only */
    skeleton_dark: foe('skeleton_dark', 'Crypt Guard', 'skeleton', P('#b8b0a0', '#5a5448', '#8ceaff'),
      { hp: 60, dmg: 14, speed: 58, r: 10, xp: 20, coins: 12 }),
    bat_cave: foe('bat_cave', 'Cave Screech', 'bat', P('#4a4048', '#241e26', '#f0a848'),
      { hp: 34, dmg: 12, speed: 88, r: 8, ai: 'orbit', range: 90, xp: 14, coins: 8 }),
    slime_dark: foe('slime_dark', 'Ooze', 'slime', P('#5a4a6a', '#2e2438', '#a87aff'),
      { hp: 54, dmg: 13, speed: 38, r: 10, xp: 16, coins: 10 }),
    turret_trap: foe('turret_trap', 'Rune Trap', 'turret', P('#5a5064', '#2a2430', '#8ceaff'),
      { hp: 44, dmg: 16, speed: 0, r: 10, ai: 'shoot', range: 230, cd: 1.5, xp: 14, coins: 10,
        proj: { speed: 165, dmg: 16, r: 5, color: '#8ceaff', life: 2.4 } }),

    /* bosses */
    boss_warden: foe('boss_warden', 'The Verdant Warden', 'warden',
      { main: '#5a7a48', dark: '#33482a', accent: '#c8ff8a', canopy: '#4a8a3e' },
      { hp: 900, dmg: 22, speed: 40, r: 26, ai: 'boss', xp: 400, coins: 500, gem: 12, boss: true, scale: 1.25, knock: 0 }),
    boss_colossus: foe('boss_colossus', 'Ember Colossus', 'colossus',
      P('#8a3a20', '#4a1c10', '#ff9a3a'),
      { hp: 1600, dmg: 30, speed: 36, r: 30, ai: 'boss', xp: 800, coins: 900, gem: 18, boss: true, scale: 1.25, knock: 0 }),
    boss_tyrant: foe('boss_tyrant', 'Frost Tyrant', 'tyrant',
      P('#7aa8c8', '#3f6080', '#eaf6ff'),
      { hp: 2600, dmg: 38, speed: 58, r: 28, ai: 'boss', xp: 1400, coins: 1500, gem: 26, boss: true, scale: 1.2, knock: 0 }),
    boss_sovereign: foe('boss_sovereign', 'The Void Sovereign', 'sovereign',
      P('#4a2a7a', '#1e1038', '#ff5fa2'),
      { hp: 4200, dmg: 46, speed: 64, r: 30, ai: 'boss', xp: 2600, coins: 2600, gem: 44, boss: true, scale: 1.3, knock: 0 }),
    boss_guardian: foe('boss_guardian', 'Dungeon Guardian', 'guardian',
      P('#5a5a78', '#2e2e44', '#8ceaff'),
      { hp: 1100, dmg: 26, speed: 52, r: 24, ai: 'boss', xp: 500, coins: 600, gem: 10, boss: true, knock: 0 })
  };

  /* ----------------------------------------------------------- worlds */
  Data.WORLDS = [
    {
      id: 'hub', name: 'Aetherhold', biome: 'hub', music: 'hub',
      size: 96, level: 1, safe: true, cost: 0,
      desc: 'The last standing town. Everything you rebuild starts here.',
      icon: 'star', enemies: [], boss: null
    },
    {
      id: 'verdant', name: 'Verdant Hollow', biome: 'verdant', music: 'verdant',
      size: 168, level: 1, cost: 0,
      desc: 'Overgrown ruins under a canopy that never stopped growing.',
      icon: 'leaf',
      enemies: ['slime_green', 'slime_blue', 'bat_forest', 'spider_wood', 'imp_moss', 'wolf_grey', 'wisp_green'],
      boss: 'boss_warden', density: 1
    },
    {
      id: 'ember', name: 'Ember Wastes', biome: 'ember', music: 'ember',
      size: 184, level: 8, cost: 0, req: 'verdant',
      desc: 'A caldera that has been exhaling for four hundred years.',
      icon: 'flame',
      enemies: ['imp_fire', 'flame_lesser', 'golem_ash', 'skeleton_burn', 'turret_ember', 'crab_magma'],
      boss: 'boss_colossus', density: 1.15
    },
    {
      id: 'frost', name: 'Frostbite Reach', biome: 'frost', music: 'frost',
      size: 192, level: 16, cost: 0, req: 'ember',
      desc: 'Where the aurora froze mid-sentence.',
      icon: 'snow',
      enemies: ['wolf_frost', 'skeleton_ice', 'golem_ice', 'wisp_frost', 'knight_frost', 'bat_ice'],
      boss: 'boss_tyrant', density: 1.25
    },
    {
      id: 'voidr', name: 'Void Sanctum', biome: 'voidr', music: 'void',
      size: 200, level: 26, cost: 0, req: 'frost',
      desc: 'The wound the world was folded around. It is awake.',
      icon: 'voidicon',
      enemies: ['shade_void', 'wisp_void', 'knight_void', 'golem_void', 'turret_void', 'spider_void'],
      boss: 'boss_sovereign', density: 1.4
    }
  ];
  Data.worldById = function (id) {
    for (var i = 0; i < Data.WORLDS.length; i++) if (Data.WORLDS[i].id === id) return Data.WORLDS[i];
    return Data.WORLDS[0];
  };

  /* ------------------------------------------------------------- shop */
  /* Consumables carry `slot` so they appear on the quick bar, and `instant`
   * for the ones that are a resource rather than something you drink. */
  Data.SHOP = [
    { id: 'potion_s', name: 'Small Elixir', icon: 'potion', price: 60, cur: 'coins', cat: 'consumable',
      desc: 'Restores 45 health. Drunk the moment you buy it if you are hurt.',
      stack: 9, slot: 1, effect: { heal: 45 } },
    { id: 'potion_l', name: 'Greater Elixir', icon: 'potion', price: 170, cur: 'coins', cat: 'consumable',
      desc: 'Restores 140 health. Drunk the moment you buy it if you are hurt.',
      stack: 9, slot: 2, effect: { heal: 140 } },
    { id: 'ward', name: 'Aether Ward', icon: 'shield', price: 260, cur: 'coins', cat: 'consumable',
      desc: 'Absorbs the next 120 damage you would take.', stack: 5, slot: 3, effect: { shield: 120 } },
    { id: 'lure', name: 'Fortune Lure', icon: 'star', price: 6, cur: 'gems', cat: 'consumable',
      desc: 'Doubles every coin drop for three minutes.', stack: 5, slot: 4, effect: { luckBoost: 180 } },
    { id: 'key', name: 'Rift Key', icon: 'key', price: 320, cur: 'coins', cat: 'consumable',
      desc: 'Opens one sealed dungeon stair. Added to your keys straight away.',
      stack: 9, instant: true, effect: { key: 1 } },
    { id: 'chest_wood', name: 'Wooden Cache', icon: 'chest', price: 500, cur: 'coins', cat: 'chest',
      desc: 'One random Common or Rare skin, plus coins.', chest: { pool: ['common', 'rare'], w: [72, 28] } },
    { id: 'chest_iron', name: 'Iron Cache', icon: 'chest', price: 1800, cur: 'coins', cat: 'chest',
      desc: 'One random Rare or Epic skin, plus a gem.', chest: { pool: ['rare', 'epic'], w: [70, 30], gems: 2 } },
    { id: 'chest_astral', name: 'Astral Cache', icon: 'chest', price: 30, cur: 'gems', cat: 'chest',
      desc: 'One random Epic or Legendary skin.', chest: { pool: ['epic', 'legendary'], w: [72, 28], gems: 0 } },
    { id: 'up_hp', name: 'Vitality Core', icon: 'heart', price: 400, cur: 'coins', cat: 'upgrade',
      desc: '+12 max health, permanently.', repeat: 20, scale: 1.35, effect: { upHp: 12 } },
    { id: 'up_dmg', name: 'Power Core', icon: 'sword', price: 450, cur: 'coins', cat: 'upgrade',
      desc: '+6% damage, permanently.', repeat: 20, scale: 1.35, effect: { upDmg: 0.06 } },
    { id: 'up_spd', name: 'Swift Core', icon: 'boot', price: 420, cur: 'coins', cat: 'upgrade',
      desc: '+3% move speed, permanently.', repeat: 12, scale: 1.4, effect: { upSpd: 0.03 } },
    { id: 'up_luck', name: 'Fortune Core', icon: 'star', price: 500, cur: 'coins', cat: 'upgrade',
      desc: '+3 luck, permanently.', repeat: 15, scale: 1.32, effect: { upLuck: 3 } },
    { id: 'up_crit', name: 'Edge Core', icon: 'bolt', price: 8, cur: 'gems', cat: 'upgrade',
      desc: '+2% critical chance, permanently.', repeat: 10, scale: 1.3, effect: { upCrit: 0.02 } },
    { id: 'exchange', name: 'Gem Exchange', icon: 'gem', price: 2500, cur: 'coins', cat: 'exchange',
      desc: 'Trade 2500 coins for 5 gems.', repeat: 999, scale: 1.05, effect: { gems: 5 } }
  ];

  Data.shopItem = function (id) {
    for (var i = 0; i < Data.SHOP.length; i++) if (Data.SHOP[i].id === id) return Data.SHOP[i];
    return null;
  };
  /* the consumables that get a quick-bar slot, in slot order */
  Data.HOTBAR = (function () {
    var out = [];
    for (var i = 0; i < Data.SHOP.length; i++) if (Data.SHOP[i].slot) out.push(Data.SHOP[i]);
    out.sort(function (a, b) { return a.slot - b.slot; });
    return out;
  })();

  /* ----------------------------------------------------------- quests */
  Data.QUESTS = [
    { id: 'q_first', title: 'First Light', desc: 'Defeat 10 creatures in Verdant Hollow.',
      type: 'kill', world: 'verdant', target: 10, reward: { coins: 250, xp: 60 } },
    { id: 'q_explore1', title: 'Off The Path', desc: 'Discover 12 landmarks across any world.',
      type: 'discover', target: 12, reward: { coins: 400, gems: 1, xp: 90 } },
    { id: 'q_chest1', title: 'Finders Keepers', desc: 'Open 8 chests in the wild.',
      type: 'chest', target: 8, reward: { coins: 500, xp: 120 } },
    { id: 'q_dungeon1', title: 'Down We Go', desc: 'Clear your first dungeon.',
      type: 'dungeon', target: 1, reward: { coins: 700, gems: 3, xp: 200 } },
    { id: 'q_boss1', title: 'The Warden Falls', desc: 'Defeat the Verdant Warden.',
      type: 'boss', boss: 'boss_warden', target: 1, reward: { coins: 1200, gems: 6, xp: 400 } },
    { id: 'q_arcade', title: 'Arcade Regular', desc: 'Play every mini-game at least once.',
      type: 'minigames', target: 4, reward: { coins: 600, gems: 2, xp: 150 } },
    { id: 'q_ember', title: 'Into The Heat', desc: 'Defeat 25 creatures in the Ember Wastes.',
      type: 'kill', world: 'ember', target: 25, reward: { coins: 900, xp: 300 } },
    { id: 'q_skins', title: 'Wardrobe', desc: 'Own 8 different skins.',
      type: 'skins', target: 8, reward: { coins: 800, gems: 4, xp: 220 } },
    { id: 'q_boss2', title: 'Cooling Off', desc: 'Defeat the Ember Colossus.',
      type: 'boss', boss: 'boss_colossus', target: 1, reward: { coins: 2000, gems: 10, xp: 800 } },
    { id: 'q_dungeon3', title: 'Delver', desc: 'Clear 3 dungeons.',
      type: 'dungeon', target: 3, reward: { coins: 1600, gems: 6, xp: 600 } },
    { id: 'q_frost', title: 'Cold Reception', desc: 'Defeat 40 creatures in Frostbite Reach.',
      type: 'kill', world: 'frost', target: 40, reward: { coins: 2200, xp: 900 } },
    { id: 'q_boss3', title: 'Thaw', desc: 'Defeat the Frost Tyrant.',
      type: 'boss', boss: 'boss_tyrant', target: 1, reward: { coins: 3600, gems: 16, xp: 1600 } },
    { id: 'q_void', title: 'The Last Door', desc: 'Defeat the Void Sovereign.',
      type: 'boss', boss: 'boss_sovereign', target: 1, reward: { coins: 8000, gems: 40, xp: 4000 } }
  ];

  /* ----------------------------------------------------- achievements */
  Data.ACHIEVEMENTS = [
    { id: 'a_kill50', name: 'Pest Control', desc: 'Defeat 50 enemies', icon: 'sword', stat: 'kills', target: 50, reward: { coins: 300 } },
    { id: 'a_kill500', name: 'Cull', desc: 'Defeat 500 enemies', icon: 'sword', stat: 'kills', target: 500, reward: { coins: 2000, gems: 5 } },
    { id: 'a_kill2000', name: 'Unmaker', desc: 'Defeat 2000 enemies', icon: 'skull', stat: 'kills', target: 2000, reward: { coins: 8000, gems: 20 } },
    { id: 'a_coin10k', name: 'Purse Strings', desc: 'Earn 10,000 coins total', icon: 'coin', stat: 'coinsEarned', target: 10000, reward: { gems: 5 } },
    { id: 'a_coin100k', name: 'Treasury', desc: 'Earn 100,000 coins total', icon: 'coin', stat: 'coinsEarned', target: 100000, reward: { gems: 25 } },
    { id: 'a_skins10', name: 'Collector', desc: 'Own 10 skins', icon: 'bag', stat: 'skinCount', target: 10, reward: { gems: 8 } },
    { id: 'a_skins25', name: 'Curator', desc: 'Own 25 skins', icon: 'bag', stat: 'skinCount', target: 25, reward: { gems: 25 } },
    { id: 'a_dung5', name: 'Spelunker', desc: 'Clear 5 dungeons', icon: 'key', stat: 'dungeons', target: 5, reward: { coins: 2500, gems: 8 } },
    { id: 'a_dung20', name: 'Depth Charge', desc: 'Clear 20 dungeons', icon: 'key', stat: 'dungeons', target: 20, reward: { coins: 12000, gems: 30 } },
    { id: 'a_level10', name: 'Getting Somewhere', desc: 'Reach level 10', icon: 'star', stat: 'level', target: 10, reward: { coins: 800 } },
    { id: 'a_level25', name: 'Seasoned', desc: 'Reach level 25', icon: 'star', stat: 'level', target: 25, reward: { coins: 4000, gems: 12 } },
    { id: 'a_level50', name: 'Regen Prime', desc: 'Reach level 50', icon: 'trophy', stat: 'level', target: 50, reward: { coins: 20000, gems: 50 } },
    { id: 'a_disc25', name: 'Wanderer', desc: 'Discover 25 landmarks', icon: 'map', stat: 'discovered', target: 25, reward: { coins: 1500, gems: 5 } },
    { id: 'a_boss4', name: 'World Restored', desc: 'Defeat all four world bosses', icon: 'trophy', stat: 'worldBosses', target: 4, reward: { coins: 25000, gems: 80 } },
    { id: 'a_mini50k', name: 'High Roller', desc: 'Score 50,000 total in mini-games', icon: 'bolt', stat: 'miniScore', target: 50000, reward: { coins: 3000, gems: 10 } }
  ];

  /* --------------------------------------------------------- progression */
  Data.xpForLevel = function (lv) { return Math.floor(60 * Math.pow(lv, 1.55) + 40 * lv); };
  Data.MAX_LEVEL = 60;

  /* Mini-game catalogue. */
  Data.MINIGAMES = [
    { id: 'pulse', name: 'Pulse Runner', icon: 'bolt', desc: 'Weave through the pulse gates. Speed climbs forever.' },
    { id: 'match', name: 'Essence Match', icon: 'gem', desc: 'Chain matching essence before the grid destabilises.' },
    { id: 'angler', name: 'Sky Angler', icon: 'star', desc: 'Time the pull. Bigger fish, tighter window.' },
    { id: 'arena', name: 'Blight Arena', icon: 'skull', desc: 'Endless waves. Your build, no safety net.' }
  ];
})(RG);
