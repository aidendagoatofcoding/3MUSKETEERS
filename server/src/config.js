export const PORT = Number(process.env.PORT) || 3000;
export const TICK_RATE = 20;
export const WORLD = Object.freeze({ width: 2400, height: 1600 });
export const PLAYER = Object.freeze({ speed: 220, radius: 15, maxHealth: 100 });
export const MOB = Object.freeze({ maxCount: 18, radius: 17, speed: 68, maxHealth: 60, respawnMs: 3500 });

// A single overall drop roll applies equally to every mob. Mob rarity does not affect it.
export const BASE_ITEM_DROP_CHANCE = 0.5;
export const ITEM_RARITY_WEIGHTS = Object.freeze({
  Common: 60, Unusual: 20, Rare: 10, Epic: 5, Legendary: 2.5, Mythic: 1.2,
  Ultra: 0.7, Super: 0.3, Unique: 0.15, Divine: 0.1, Celestial: 0.05
});

// Loot category weights are conditional on the global drop roll succeeding.
// $sword and $musket select uniformly from the complete weapon catalogue.
export const MOB_DEFS = Object.freeze({
  'Rogue Redcoat': {
    name: 'Rogue Redcoat', rarity: 'Common', radius: 18, maxHealth: 65, speed: 71,
    attackRange: 28, attackDamage: 12, attackInterval: 1100, xpReward: 16,
    color: '#d45b4e', faction: 'British Empire',
    lootTable: { 'Redcoat Saber': 40, '$sword': 20, '$musket': 15, '$armor': 15, '$material': 10 }
  },
  Ronin: {
    name: 'Ronin', rarity: 'Unusual', radius: 18, maxHealth: 82, speed: 75,
    attackRange: 30, attackDamage: 14, attackInterval: 980, xpReward: 18,
    color: '#d8a15b', faction: 'Independent Ronin',
    lootTable: { Katana: 40, '$sword': 20, '$musket': 15, '$armor': 15, '$material': 10 }
  },
  Knight: {
    name: 'Knight', rarity: 'Rare', radius: 20, maxHealth: 100, speed: 68,
    attackRange: 34, attackDamage: 18, attackInterval: 1050, xpReward: 24,
    color: '#97a4d8', faction: 'Medieval Kingdom',
    lootTable: { Longsword: 45, '$sword': 15, '$musket': 10, '$armor': 20, '$material': 10 }
  },
  Pirate: {
    name: 'Pirate', rarity: 'Unusual', radius: 18, maxHealth: 78, speed: 80,
    attackRange: 30, attackDamage: 15, attackInterval: 960, xpReward: 20,
    color: '#5ca9c2', faction: 'Pirate Confederation',
    lootTable: { Cutlass: 40, '$sword': 20, '$musket': 15, '$armor': 15, '$material': 10 }
  },
  'Shadow Musketeer': {
    name: 'Shadow Musketeer', rarity: 'Epic', radius: 20, maxHealth: 130, speed: 73,
    attackRange: 300, attackDamage: 22, attackInterval: 1200, xpReward: 34,
    color: '#8c8ae8', faction: 'Shadow Realm',
    lootTable: { 'Shadow Musket': 35, '$sword': 20, '$musket': 15, '$armor': 15, '$material': 15 }
  }
});
