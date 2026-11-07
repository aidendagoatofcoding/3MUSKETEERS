export const PORT = Number(process.env.PORT) || 3000;
export const TICK_RATE = 20;
export const WORLD = Object.freeze({ width: 2400, height: 1600 });
export const PLAYER = Object.freeze({ speed: 220, radius: 15, maxHealth: 100 });
export const MOB = Object.freeze({ maxCount: 18, radius: 17, speed: 68, maxHealth: 60, respawnMs: 3500 });

// One shared roll for every mob. Mob rarity never modifies this probability.
export const BASE_ITEM_DROP_CHANCE = 0.5;
export const ITEM_RARITY_WEIGHTS = Object.freeze({
  Common: 60, Unusual: 20, Rare: 10, Epic: 5, Legendary: 2.5, Mythic: 1.2,
  Ultra: 0.7, Super: 0.3, Unique: 0.15, Divine: 0.1, Celestial: 0.05
});
export const STARTER_LOOT = Object.freeze([
  { name: 'Redcoat Saber', category: 'sword', mobRarity: 'Common' },
  { name: 'Brown Bess', category: 'musket', mobRarity: 'Common' },
  { name: 'Iron Helmet', category: 'armor', mobRarity: 'Common' }
]);
