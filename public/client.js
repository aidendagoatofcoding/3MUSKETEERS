export const PORT = Number(process.env.PORT) || 3000;
export const TICK_RATE = 20;
export const WORLD = Object.freeze({ width: 2400, height: 1600 });
export const PLAYER = Object.freeze({ speed: 220, radius: 15, maxHealth: 100 });

export const ITEM_RARITY_WEIGHTS = Object.freeze({
  Common: 60,
  Unusual: 20,
  Rare: 10,
  Epic: 5,
  Legendary: 2.5,
  Mythic: 1.2,
  Ultra: 0.7,
  Super: 0.3,
  Unique: 0.15,
  Divine: 0.1,
  Celestial: 0.05
});

export const MOB_DEFS = Object.freeze({
  'Rogue Redcoat': {
    name: 'Rogue Redcoat',
    rarity: 'Common',
    radius: 18,
    maxHealth: 65,
    speed: 71,
    attackRange: 28,
    attackDamage: 12,
    attackInterval: 1100,
    xpReward: 16,
    color: '#d45b4e',
    faction: 'British Empire',
    lootTable: {
      'Redcoat Saber': 0.4,
      'Brown Bess': 0.2,
      'Iron Helmet': 0.15,
      'Redcoat Uniform': 0.15,
      'Steel Scrap': 0.1
    }
  },
  Ronin: {
    name: 'Ronin',
    rarity: 'Unusual',
    radius: 18,
    maxHealth: 82,
    speed: 75,
    attackRange: 30,
    attackDamage: 14,
    attackInterval: 980,
    xpReward: 18,
    color: '#d8a15b',
    faction: 'Independent Ronin',
    lootTable: {
      'Katana': 0.4,
      'Japanese Matchlock': 0.2,
      'Samurai Helmet': 0.15,
      'Ronin Armor': 0.15,
      'Silk Thread': 0.1
    }
  },
  Knight: {
    name: 'Knight',
    rarity: 'Rare',
    radius: 20,
    maxHealth: 100,
    speed: 68,
    attackRange: 34,
    attackDamage: 18,
    attackInterval: 1050,
    xpReward: 24,
    color: '#97a4d8',
    faction: 'Medieval Kingdom',
    lootTable: {
      'Longsword': 0.45,
      'Knight\'s Musket': 0.1,
      'Knight Plate': 0.2,
      'Heavy Gauntlet': 0.15,
      'Steel Scrap': 0.1
    }
  },
  Pirate: {
    name: 'Pirate',
    rarity: 'Unusual',
    radius: 18,
    maxHealth: 78,
    speed: 80,
    attackRange: 30,
    attackDamage: 15,
    attackInterval: 960,
    xpReward: 20,
    color: '#5ca9c2',
    faction: 'Pirate Confederation',
    lootTable: {
      'Cutlass': 0.4,
      'Pirate Musket': 0.2,
      'Pirate Outfit': 0.15,
      'Belt Pouch': 0.15,
      'Powder Keg': 0.1
    }
  },
  'Shadow Musketeer': {
    name: 'Shadow Musketeer',
    rarity: 'Epic',
    radius: 20,
    maxHealth: 130,
    speed: 73,
    attackRange: 300,
    attackDamage: 22,
    attackInterval: 1200,
    xpReward: 34,
    color: '#8c8ae8',
    faction: 'Shadow Realm',
    lootTable: {
      'Shadow Musket': 0.35,
      'Shadow Blade': 0.2,
      'Phantom Armor': 0.15,
      'Dark Powder': 0.15,
      'Soul Shard': 0.15
    }
  }
});

export const BASE_ITEM_DROP_CHANCE = 0.5;

export const STARTER_WEAPONS = Object.freeze({
  sword: { name: 'Redcoat Saber', category: 'sword', rarity: 'Common', damage: 22 },
  musket: { name: 'Brown Bess', category: 'musket', rarity: 'Common', damage: 18, range: 440, cooldown: 820 }
});
