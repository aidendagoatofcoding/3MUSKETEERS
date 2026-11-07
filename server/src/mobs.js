import { RARITY_ORDER } from './config.js';

const TIER = (rarity) => Math.max(0, RARITY_ORDER.indexOf(rarity));

const THEME_COLORS = {
  British: '#c0392b',
  Japanese: '#b8860b',
  Medieval: '#7f8fa6',
  Pirate: '#2e86ab',
  European: '#4b6cb7',
  Ottoman: '#8e44ad',
  Fantasy: '#9b59b6'
};

function buildLootTable(signature, armorSet, overrides = {}, boss = false) {
  const sword = overrides.sword ?? (boss ? 0 : 20);
  const musket = overrides.musket ?? (boss ? 0 : 15);
  const armor = overrides.armor ?? (boss ? 20 : 15);
  const cosmetic = boss ? overrides.cosmetic ?? 15 : 0;
  const material = overrides.material ?? (boss ? 15 : 10);
  // Signature items take the remaining share so every conditional table totals exactly 100%.
  const signatureTotal = Math.max(0, 100 - (sword + musket + armor + cosmetic + material));
  const table = {};
  if (signature.length === 1) table[signature[0]] = signatureTotal;
  else if (signature.length >= 2) {
    table[signature[0]] = Math.round(signatureTotal * 0.7 * 100) / 100;
    table[signature[1]] = Math.round((signatureTotal - table[signature[0]]) * 100) / 100;
  }
  if (sword) table['$sword'] = sword;
  if (musket) table['$musket'] = musket;
  if (armor) table[armorSet ? `$armor:${armorSet}` : '$armor'] = armor;
  if (cosmetic) table['$cosmetic'] = cosmetic;
  if (material) table['$material'] = material;
  return Object.fromEntries(Object.entries(table).filter(([, weight]) => Number(weight) > 0));
}

function defineMob({ name, rarity, theme, signature, armorSet = null, ranged = false, color, overrides, faction }) {
  const tier = TIER(rarity);
  return {
    name,
    rarity,
    theme,
    faction: faction ?? theme,
    color: color ?? THEME_COLORS[theme] ?? '#c0392b',
    radius: 17 + Math.min(6, tier),
    maxHealth: 52 + tier * 26,
    speed: 60 + tier * 3.5,
    attackRange: ranged ? 320 : 34 + tier * 2,
    attackDamage: Math.round(10 + tier * 2.6),
    attackInterval: Math.max(650, 1250 - tier * 45),
    xpReward: 16 + tier * 8,
    ranged,
    lootTable: buildLootTable(signature, armorSet, overrides)
  };
}

function defineBoss({ name, rarity, theme, signature, armorSet, color, faction }) {
  const tier = TIER(rarity);
  return {
    name,
    rarity,
    theme,
    faction: faction ?? theme,
    isBoss: true,
    color: color ?? THEME_COLORS[theme] ?? '#b8352f',
    radius: 46 + Math.min(10, tier * 2),
    maxHealth: 720 + tier * 260,
    speed: 58 + tier * 2,
    attackRange: 70 + tier * 3,
    attackDamage: Math.round(24 + tier * 6),
    attackInterval: Math.max(850, 1400 - tier * 40),
    xpReward: 240 + tier * 90,
    ranged: false,
    lootTable: buildLootTable(signature, armorSet, {}, true)
  };
}

const british = [
  { name: 'Rogue Redcoat', rarity: 'Common', theme: 'British', signature: ['Redcoat Saber', 'Brown Bess'], armorSet: 'Redcoat Uniform' },
  { name: 'Deserting Soldier', rarity: 'Common', theme: 'British', signature: ['Wooden Musket'], armorSet: 'Redcoat Uniform' },
  { name: 'British Grenadier', rarity: 'Unusual', theme: 'British', signature: ['Heavy Musket', 'Brown Bess'], armorSet: 'Redcoat Uniform' },
  { name: 'Royal Guard', rarity: 'Rare', theme: 'British', signature: ['Royal Sword', 'Royal Musket'], armorSet: 'Redcoat Uniform' },
  { name: 'Rogue Officer', rarity: 'Unusual', theme: 'British', signature: ["Officer's Pistol", 'Saber'], armorSet: 'Redcoat Uniform', ranged: true },
  { name: 'British Cavalryman', rarity: 'Rare', theme: 'British', signature: ['Cavalry Musket', 'Saber'], armorSet: 'Redcoat Uniform', ranged: true },
  { name: 'Royal Musketeer', rarity: 'Unusual', theme: 'British', signature: ['Royal Musket', 'Brown Bess'], armorSet: 'Redcoat Uniform', ranged: true },
  { name: 'Armored Redcoat', rarity: 'Epic', theme: 'British', signature: ['Royal Musket', 'Royal Sword'], armorSet: 'Redcoat Uniform', ranged: true },
  { name: 'British Commander', rarity: 'Legendary', theme: 'British', signature: ['Royal Musket', 'Royal Sword'], armorSet: 'Redcoat Uniform', ranged: true },
  { name: 'Royal General', rarity: 'Mythic', theme: 'British', signature: ['Royal Musket', 'Royal Sword'], armorSet: 'Redcoat Uniform', ranged: true }
];

const japanese = [
  { name: 'Rogue Samurai', rarity: 'Common', theme: 'Japanese', signature: ['Katana', 'Samurai Matchlock'], armorSet: 'Samurai Armor' },
  { name: 'Ronin', rarity: 'Unusual', theme: 'Japanese', signature: ['Katana', 'Tanegashima'], armorSet: 'Samurai Armor' },
  { name: 'Ashigaru', rarity: 'Common', theme: 'Japanese', signature: ['Ashigaru Musket', 'Wakizashi'], armorSet: 'Samurai Armor', ranged: true },
  { name: 'Samurai Archer', rarity: 'Unusual', theme: 'Japanese', signature: ['Tanto', 'Japanese Matchlock'], armorSet: 'Samurai Armor', ranged: true },
  { name: 'Matchlock Soldier', rarity: 'Common', theme: 'Japanese', signature: ['Japanese Matchlock', 'Tanto'], armorSet: 'Samurai Armor', ranged: true },
  { name: 'Samurai Commander', rarity: 'Epic', theme: 'Japanese', signature: ['Katana', 'Shogun Musket'], armorSet: 'Samurai Armor', ranged: true },
  { name: 'Armored Samurai', rarity: 'Rare', theme: 'Japanese', signature: ['Katana', 'Samurai Matchlock'], armorSet: 'Samurai Armor' },
  { name: 'Oni Warrior', rarity: 'Epic', theme: 'Japanese', signature: ['Nodachi', 'Dragon Matchlock'], armorSet: 'Samurai Armor' },
  { name: 'Demon Samurai', rarity: 'Legendary', theme: 'Japanese', signature: ['Cursed Katana', 'Cursed Matchlock'], armorSet: 'Samurai Armor' },
  { name: 'Shogun Guardian', rarity: 'Legendary', theme: 'Japanese', signature: ['Golden Katana', 'Golden Matchlock'], armorSet: 'Samurai Armor' }
];

const medieval = [
  { name: 'Swordsman', rarity: 'Common', theme: 'Medieval', signature: ['Iron Sword'], armorSet: 'Knight Plate' },
  { name: 'Knight', rarity: 'Rare', theme: 'Medieval', signature: ['Longsword', "Knight's Musket"], armorSet: 'Knight Plate', overrides: { sword: 15, musket: 10, armor: 20, material: 10 } },
  { name: 'Black Knight', rarity: 'Legendary', theme: 'Medieval', signature: ['Shadow Blade', 'Demon Sword'], armorSet: 'Knight Plate' },
  { name: 'Templar', rarity: 'Epic', theme: 'Medieval', signature: ['Holy Sword', 'Holy Musket'], armorSet: 'Knight Plate' },
  { name: 'Crusader', rarity: 'Rare', theme: 'Medieval', signature: ['Broadsword', 'Holy Musket'], armorSet: 'Knight Plate' },
  { name: 'Bandit', rarity: 'Common', theme: 'Medieval', signature: ['Shortsword', 'Hunting Musket'], armorSet: 'Highland Gear', ranged: true },
  { name: 'Mercenary', rarity: 'Unusual', theme: 'Medieval', signature: ['Claymore', 'Hunting Musket'], armorSet: 'Knight Plate', ranged: true },
  { name: 'Executioner', rarity: 'Epic', theme: 'Medieval', signature: ["Executioner's Sword", 'Heavy Musket'], armorSet: 'Knight Plate' },
  { name: 'Armored Knight', rarity: 'Rare', theme: 'Medieval', signature: ['Knight Sword', 'Heavy Musket'], armorSet: 'Knight Plate' },
  { name: 'Royal Knight', rarity: 'Epic', theme: 'Medieval', signature: ['Royal Sword', 'Royal Musket'], armorSet: 'Knight Plate' },
  { name: 'Paladin', rarity: 'Legendary', theme: 'Medieval', signature: ['Holy Sword', 'Crystal Greatsword'], armorSet: 'Knight Plate' },
  { name: 'Dark Knight', rarity: 'Mythic', theme: 'Medieval', signature: ['Demon Sword', 'Shadow Blade'], armorSet: 'Phantom Armor' }
];

const pirate = [
  { name: 'Pirate', rarity: 'Unusual', theme: 'Pirate', signature: ['Cutlass', 'Pirate Musket'], armorSet: 'Pirate Outfit' },
  { name: 'Pirate Captain', rarity: 'Rare', theme: 'Pirate', signature: ['Cutlass', 'Pirate Musket'], armorSet: 'Pirate Outfit', ranged: true },
  { name: 'Cutlass Fighter', rarity: 'Common', theme: 'Pirate', signature: ['Cutlass', 'Shortsword'], armorSet: 'Pirate Outfit' },
  { name: 'Pirate Musketeer', rarity: 'Common', theme: 'Pirate', signature: ['Pirate Musket', 'Cutlass'], armorSet: 'Pirate Outfit', ranged: true },
  { name: 'Buccaneer', rarity: 'Unusual', theme: 'Pirate', signature: ['Scimitar', 'Blunderbuss'], armorSet: 'Pirate Outfit', ranged: true },
  { name: 'Pirate Veteran', rarity: 'Rare', theme: 'Pirate', signature: ['Cutlass', 'Double-Barrel Musket'], armorSet: 'Pirate Outfit', ranged: true },
  { name: 'Pirate Admiral', rarity: 'Legendary', theme: 'Pirate', signature: ['Royal Sword', 'Naval Musket'], armorSet: 'Pirate Outfit', ranged: true },
  { name: 'Ghost Pirate', rarity: 'Epic', theme: 'Pirate', signature: ['Shadow Blade', 'Phantom Musket'], armorSet: 'Phantom Armor' },
  { name: 'Cursed Captain', rarity: 'Mythic', theme: 'Pirate', signature: ['Soul Reaper', 'Cursed Matchlock'], armorSet: 'Phantom Armor', ranged: true }
];

const european = [
  { name: 'French Infantryman', rarity: 'Common', theme: 'European', signature: ['Charleville Musket', 'Saber'], armorSet: 'French Imperial Uniform', ranged: true },
  { name: 'French Grenadier', rarity: 'Unusual', theme: 'European', signature: ['Heavy Musket', 'Charleville Musket'], armorSet: 'French Imperial Uniform', ranged: true },
  { name: 'Prussian Musketeer', rarity: 'Unusual', theme: 'European', signature: ['Flintlock Musket', 'Saber'], armorSet: 'Prussian Armor', ranged: true },
  { name: 'Spanish Swordsman', rarity: 'Common', theme: 'European', signature: ['Rapier', 'Flintlock Pistol'], armorSet: 'Spanish Conquistador Armor' },
  { name: 'Ottoman Janissary', rarity: 'Rare', theme: 'European', signature: ['Scimitar', 'Flintlock Musket'], armorSet: 'Ottoman Janissary Armor' },
  { name: 'Imperial Guardsman', rarity: 'Epic', theme: 'European', signature: ['Royal Musket', 'Rapier'], armorSet: 'French Imperial Uniform', ranged: true },
  { name: 'Highland Warrior', rarity: 'Rare', theme: 'European', signature: ['Broadsword', 'Hunting Musket'], armorSet: 'Highland Gear' },
  { name: 'Royal Cavalryman', rarity: 'Rare', theme: 'European', signature: ['Cavalry Musket', 'Saber'], armorSet: 'French Imperial Uniform', ranged: true },
  { name: 'Elite Musketeer', rarity: 'Epic', theme: 'European', signature: ['Kentucky Long Rifle', 'Baker Rifle'], armorSet: 'Prussian Armor', ranged: true }
];

const fantasy = [
  { name: 'Living Sword', rarity: 'Rare', theme: 'Fantasy', signature: ['Ancient Sword'], armorSet: 'Knight Plate' },
  { name: 'Flying Katana', rarity: 'Rare', theme: 'Fantasy', signature: ['Katana'], armorSet: 'Samurai Armor' },
  { name: 'Walking Musket', rarity: 'Rare', theme: 'Fantasy', signature: ['Ancient Musket'], armorSet: 'Knight Plate', ranged: true },
  { name: 'Animated Armor', rarity: 'Epic', theme: 'Fantasy', signature: ['Knight Sword', 'Heavy Musket'], armorSet: 'Knight Plate' },
  { name: 'Haunted Helmet', rarity: 'Unusual', theme: 'Fantasy', signature: ['Iron Sword', 'Cursed Matchlock'], armorSet: 'Phantom Armor' },
  { name: 'Sword Golem', rarity: 'Legendary', theme: 'Fantasy', signature: ['Crystal Greatsword', 'Ancient Relic Sword'], armorSet: 'Crystal Colossus Armor' },
  { name: 'Musket Golem', rarity: 'Legendary', theme: 'Fantasy', signature: ['Crystal Musket', 'Magma Musket'], armorSet: 'Crystal Colossus Armor', ranged: true },
  { name: 'Blade Spirit', rarity: 'Epic', theme: 'Fantasy', signature: ['Void Blade', 'Soul Musket'], armorSet: 'Phantom Armor' },
  { name: 'Cannon Creature', rarity: 'Epic', theme: 'Fantasy', signature: ['Blunderbuss', 'Heavy Musket'], armorSet: 'Dragon Armor', ranged: true },
  { name: 'Shield Guardian', rarity: 'Rare', theme: 'Fantasy', signature: ['Shortsword', 'Knight Sword'], armorSet: 'Knight Plate' },
  { name: 'Iron Knight', rarity: 'Rare', theme: 'Fantasy', signature: ['Iron Sword', "Knight's Musket"], armorSet: 'Knight Plate', ranged: true },
  { name: 'Golden Knight', rarity: 'Legendary', theme: 'Fantasy', signature: ['Golden Sword', 'Golden Musket'], armorSet: 'Knight Plate' },
  { name: 'Crystal Samurai', rarity: 'Mythic', theme: 'Fantasy', signature: ['Crystal Greatsword', 'Crystal Musket'], armorSet: 'Samurai Armor' },
  { name: 'Shadow Musketeer', rarity: 'Epic', theme: 'Fantasy', signature: ['Shadow Musket', 'Shadow Blade'], armorSet: 'Phantom Armor', ranged: true },
  { name: 'Phantom Swordsman', rarity: 'Epic', theme: 'Fantasy', signature: ['Void Blade', 'Phantom Musket'], armorSet: 'Phantom Armor' },
  { name: 'Dragon Knight', rarity: 'Mythic', theme: 'Fantasy', signature: ['Dragon Slayer', 'Dragon Musket'], armorSet: 'Dragon Armor' }
];

const bossList = [
  { name: 'Redcoat Commander', rarity: 'Legendary', theme: 'British', signature: ['Royal Sword', 'Royal Musket'], armorSet: 'Redcoat Uniform' },
  { name: 'Shogun', rarity: 'Mythic', theme: 'Japanese', signature: ['Golden Katana', 'Shogun Musket'], armorSet: 'Samurai Armor' },
  { name: 'Pirate Admiral', rarity: 'Mythic', theme: 'Pirate', signature: ['Cutlass', 'Naval Musket'], armorSet: 'Pirate Outfit' },
  { name: 'Black Knight', rarity: 'Mythic', theme: 'Medieval', signature: ['Demon Sword', 'Shadow Musket'], armorSet: 'Knight Plate' },
  { name: 'Samurai General', rarity: 'Ultra', theme: 'Japanese', signature: ['Celestial Katana', 'Imperial Matchlock'], armorSet: 'Samurai Armor' },
  { name: 'French Emperor', rarity: 'Unique', theme: 'European', signature: ['Royal Sword', 'Royal Musket'], armorSet: 'French Imperial Uniform' },
  { name: 'Ottoman Warlord', rarity: 'Ultra', theme: 'Ottoman', signature: ['Scimitar', 'Imperial Musket'], armorSet: 'Ottoman Janissary Armor' },
  { name: 'Phantom Musketeer', rarity: 'Divine', theme: 'Fantasy', signature: ['Phantom Musket', 'Void Blade'], armorSet: 'Phantom Armor' },
  { name: 'Dragon Samurai', rarity: 'Divine', theme: 'Fantasy', signature: ['Dragon Katana', 'Dragon Musket'], armorSet: 'Dragon Armor' },
  { name: 'Celestial General', rarity: 'Celestial', theme: 'Fantasy', signature: ['Celestial Katana', 'Celestial Musket'], armorSet: 'Celestial Armor' }
];

export const MOB_DEFS = Object.freeze(
  Object.fromEntries([...british, ...japanese, ...medieval, ...pirate, ...european, ...fantasy].map((entry) => [entry.name, Object.freeze(defineMob(entry))]))
);

export const BOSS_DEFS = Object.freeze(
  Object.fromEntries(bossList.map((entry) => [entry.name, Object.freeze(defineBoss(entry))]))
);

export const MOB_NAMES = Object.keys(MOB_DEFS);
export const BOSS_NAMES = Object.keys(BOSS_DEFS);
