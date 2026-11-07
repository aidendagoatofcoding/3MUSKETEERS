export const PORT = Number(process.env.PORT) || 3000;
export const TICK_RATE = 20;
export const WORLD = Object.freeze({ width: 2400, height: 1600 });
export const PLAYER = Object.freeze({ baseSpeed: 220, radius: 16, baseHealth: 100 });

export const SWORD_SLOTS = 3;
export const MUSKET_SLOTS = 2;
export const BASE_INVENTORY = 24;
export const INVENTORY_PER_CAPACITY = 6;
export const MAX_CLAN_MEMBERS = 20;
export const CLAN_CREATE_COST = 50;

// One shared overall drop roll for every ordinary mob. Mob rarity never changes it.
export const BASE_ITEM_DROP_CHANCE = 0.5;
export const DROP_PICKUP_RADIUS = 46;
export const DROP_PICKUP_DELAY_MS = 500;
export const DROP_DESPAWN_MS = 90000;
export const OWNER_LOOT_WINDOW_MS = 15000;

export const SPAWN_PROTECTION_MS = 5000;
export const SAFE_ZONE_RADIUS = 300;
export const MOBS_PER_WORLD = 14;
export const BOSS_FIRST_SPAWN_MS = 20000;
export const BOSS_RESPAWN_MS = 150000;

export const RARITY_ORDER = Object.freeze([
  'Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic',
  'Ultra', 'Super', 'Unique', 'Divine', 'Celestial'
]);

export const ITEM_RARITY_WEIGHTS = Object.freeze({
  Common: 60, Unusual: 20, Rare: 10, Epic: 5, Legendary: 2.5, Mythic: 1.2,
  Ultra: 0.7, Super: 0.3, Unique: 0.15, Divine: 0.1, Celestial: 0.05
});

export const RARITY_COLORS = Object.freeze({
  Common: '#c9c7bc', Unusual: '#7bd17e', Rare: '#57a7ff', Epic: '#bc75e8',
  Legendary: '#f0b84c', Mythic: '#f27659', Ultra: '#ff5eae', Super: '#e64b58',
  Unique: '#f6f1c0', Divine: '#7ce9e0', Celestial: '#fff3a6'
});

export const RARITY_SCALE = Object.freeze({
  Common: 1, Unusual: 1.18, Rare: 1.42, Epic: 1.72, Legendary: 2.1, Mythic: 2.55,
  Ultra: 3.05, Super: 3.6, Unique: 4.2, Divine: 4.9, Celestial: 5.8
});

export const FACTIONS = Object.freeze([
  { id: 'british-empire', name: 'British Empire', emblem: '♛', color: '#b8352f', accent: '#f0d9b5', motto: 'By discipline and powder.' },
  { id: 'japanese-shogunate', name: 'Japanese Shogunate', emblem: '⛩', color: '#8a2f3b', accent: '#e6cf9a', motto: 'The blade remembers.' },
  { id: 'french-empire', name: 'French Empire', emblem: '⚜', color: '#2f4f9e', accent: '#e7d6a8', motto: 'Glory at any cost.' },
  { id: 'prussian-kingdom', name: 'Prussian Kingdom', emblem: '✠', color: '#3c4a3a', accent: '#c9c2a4', motto: 'Iron holds the line.' },
  { id: 'ottoman-empire', name: 'Ottoman Empire', emblem: '☾', color: '#6d3f7a', accent: '#e0c06a', motto: 'The crescent advances.' },
  { id: 'spanish-empire', name: 'Spanish Empire', emblem: '✚', color: '#a8792c', accent: '#f3e2b6', motto: 'Gold and steel.' },
  { id: 'pirate-confederation', name: 'Pirate Confederation', emblem: '☠', color: '#2e86ab', accent: '#d8b46a', motto: 'No kings, no chains.' },
  { id: 'independent-ronin', name: 'Independent Ronin', emblem: '☯', color: '#5b5f6b', accent: '#d8d2c4', motto: 'One blade, one road.' }
]);
export const FACTIONS_BY_ID = new Map(FACTIONS.map((faction) => [faction.id, faction]));
