import { randomUUID } from 'node:crypto';
import { ITEM_RARITY_WEIGHTS, RARITY_COLORS, RARITY_ORDER, RARITY_SCALE } from './config.js';
import { MUSKETS, SWORDS, WEAPONS, getWeapon } from './weapons.js';

const WEAPON_BY_NAME = new Map(WEAPONS.map((weapon) => [weapon.name.toLowerCase(), weapon]));

export const ARMOR_SLOTS = Object.freeze({
  hat: { label: 'Helmet', icon: '⛑', health: 4, dr: 0.008, speed: 0 },
  chest: { label: 'Cuirass', icon: '🛡', health: 15, dr: 0.03, speed: -5 },
  legs: { label: 'Greaves', icon: '🥾', health: 8, dr: 0.014, speed: -3 },
  boots: { label: 'Boots', icon: '👢', health: 3, dr: 0, speed: 8 },
  cape: { label: 'Cape', icon: '🧣', health: 5, dr: 0.008, speed: 3 }
});

export const ARMOR_SETS = Object.freeze({
  'Redcoat Uniform': { color: '#b8352f', accent: '#f0d9b5', hat: 'tricorne', theme: 'British Empire' },
  'Samurai Armor': { color: '#3d4a68', accent: '#d9b45a', hat: 'kabuto', theme: 'Japanese Shogunate' },
  'Knight Plate': { color: '#8e99b5', accent: '#e4ebfa', hat: 'greathelm', theme: 'Medieval Kingdom' },
  'Pirate Outfit': { color: '#356a75', accent: '#d8b46a', hat: 'bicorne', theme: 'Pirate Confederation' },
  'French Imperial Uniform': { color: '#2f4f9e', accent: '#e7d6a8', hat: 'kepi', theme: 'French Empire' },
  'Prussian Armor': { color: '#3c4a3a', accent: '#c9c2a4', hat: 'spiked', theme: 'Prussian Kingdom' },
  'Ottoman Janissary Armor': { color: '#6d3f7a', accent: '#e0c06a', hat: 'turban', theme: 'Ottoman Empire' },
  'Highland Gear': { color: '#2f6b4f', accent: '#c9a86a', hat: 'glengarry', theme: 'Highland Clans' },
  'Phantom Armor': { color: '#4a3f6e', accent: '#9ce0d8', hat: 'hood', theme: 'Shadow Realm' },
  'Dragon Armor': { color: '#7a2f2a', accent: '#e0a24a', hat: 'dragon', theme: 'Dragon Legion' },
  'Celestial Armor': { color: '#c9b877', accent: '#fff3a6', hat: 'halo', theme: 'Celestial Empire' },
  'Spanish Conquistador Armor': { color: '#a8792c', accent: '#f3e2b6', hat: 'morion', theme: 'Spanish Empire' },
  'Crystal Colossus Armor': { color: '#3f6f8a', accent: '#bff0ff', hat: 'crystal', theme: 'Crystal Caverns' }
});

export const MATERIALS = Object.freeze([
  { name: 'Steel Scrap', icon: '⚙', color: '#9aa4b0', description: 'Common smithing material.' },
  { name: 'Silk Thread', icon: '🧵', color: '#d9c0d8', description: 'Fine cloth for uniforms and capes.' },
  { name: 'Powder Keg', icon: '💥', color: '#d99a4a', description: 'Volatile propellant for crafting.' },
  { name: 'Dark Powder', icon: '🖤', color: '#8d7ab0', description: 'Shadow-tainted gunpowder.' },
  { name: 'Soul Shard', icon: '🔮', color: '#7ce9e0', description: 'A fragment of a fallen warrior.' },
  { name: 'Dragon Scale', icon: '🐉', color: '#f27659', description: 'Scaled plating from a dragon.' },
  { name: 'Celestial Essence', icon: '✨', color: '#fff3a6', description: 'Rare light bound to metal.' },
  { name: 'Clan Sigil', icon: '🜲', color: '#f0b84c', description: 'A token of clan loyalty.' }
]);

export const COSMETICS = Object.freeze([
  { name: 'Officer Tricorne', shape: 'tricorne', color: '#2e2a24', accent: '#f0d9b5', description: 'A plumed officer tricorne.' },
  { name: 'Shogun Kabuto', shape: 'kabuto', color: '#6b2f2f', accent: '#e6cf9a', description: 'A lacquered command helmet.' },
  { name: 'Pirate Bicorne', shape: 'bicorne', color: '#22313b', accent: '#d8b46a', description: 'A captain\'s bicorne.' },
  { name: 'Highland Bonnet', shape: 'glengarry', color: '#2f4f3a', accent: '#c9a86a', description: 'A feathered highland bonnet.' },
  { name: 'Knight Greathelm', shape: 'greathelm', color: '#9aa4b5', accent: '#e4ebfa', description: 'A polished parade greathelm.' },
  { name: 'Phantom Hood', shape: 'hood', color: '#3a3157', accent: '#9ce0d8', description: 'A hood that swallows torchlight.' },
  { name: 'Dragon Crest', shape: 'dragon', color: '#7a2f2a', accent: '#e0a24a', description: 'A dragon-crest helm.' },
  { name: 'Celestial Halo', shape: 'halo', color: '#c9b877', accent: '#fff3a6', description: 'A ring of patient light.' }
]);

const SLOT_KEYS = Object.keys(ARMOR_SLOTS);

function armorName(setName, slot) {
  return `${setName} ${ARMOR_SLOTS[slot].label}`;
}

export const ARMOR_ITEMS = Object.freeze(
  Object.keys(ARMOR_SETS).flatMap((setName) =>
    SLOT_KEYS.map((slot) => ({ name: armorName(setName, slot), setName, slot }))
  )
);
const ARMOR_BY_NAME = new Map(ARMOR_ITEMS.map((entry) => [entry.name.toLowerCase(), entry]));
const COSMETIC_BY_NAME = new Map(COSMETICS.map((entry) => [entry.name.toLowerCase(), entry]));
const MATERIAL_BY_NAME = new Map(MATERIALS.map((entry) => [entry.name.toLowerCase(), entry]));

const UNIQUE_WEAPONS = [...new Map(WEAPONS.map((weapon) => [weapon.name, weapon])).values()];

export const COLLECTION_CATALOG = Object.freeze([
  ...UNIQUE_WEAPONS.map((weapon) => ({ name: weapon.name, category: weapon.category })),
  ...ARMOR_ITEMS.map((entry) => ({ name: entry.name, category: 'armor' })),
  ...MATERIALS.map((entry) => ({ name: entry.name, category: 'material' })),
  ...COSMETICS.map((entry) => ({ name: entry.name, category: 'cosmetic' }))
]);
export const COLLECTION_TOTAL = COLLECTION_CATALOG.length;

const WEIGHTED_RARITIES = Object.entries(ITEM_RARITY_WEIGHTS);

export function rollRarity(luck = 0) {
  const roll = () => {
    const total = WEIGHTED_RARITIES.reduce((sum, [, weight]) => sum + weight, 0);
    let value = Math.random() * total;
    for (const [rarity, weight] of WEIGHTED_RARITIES) {
      value -= weight;
      if (value < 0) return rarity;
    }
    return 'Common';
  };
  const first = roll();
  // Loot luck rerolls the rarity and keeps the better result. It never changes the 50% drop chance.
  if (Math.random() < Math.min(0.5, Math.max(0, luck))) {
    const second = roll();
    return RARITY_ORDER.indexOf(second) > RARITY_ORDER.indexOf(first) ? second : first;
  }
  return first;
}

function weaponItem(definition, rarity) {
  const tuned = getWeapon(definition.name, rarity) ?? definition;
  return {
    name: tuned.name,
    category: tuned.category,
    rarity: tuned.rarity,
    icon: tuned.icon,
    color: tuned.color,
    description: `${tuned.rarity} ${tuned.category}`,
    stats: {
      damage: tuned.damage,
      cooldown: Math.round(600 / (tuned.attackSpeed || 1)),
      range: tuned.range || 0,
      projectileSpeed: tuned.projectileSpeed || 0,
      projectileCount: tuned.projectileCount || 1,
      pierce: tuned.pierce || 0,
      bladeCount: tuned.bladeCount || 1,
      orbitRadius: tuned.orbitRadius || 40,
      effect: tuned.effect || 'none'
    }
  };
}

function armorItem(entry, rarity) {
  const set = ARMOR_SETS[entry.setName];
  const slot = ARMOR_SLOTS[entry.slot];
  const scale = RARITY_SCALE[rarity] ?? 1;
  const tier = Math.max(0, RARITY_ORDER.indexOf(rarity));
  return {
    name: entry.name,
    category: 'armor',
    slot: entry.slot,
    setId: entry.setName,
    setName: entry.setName,
    rarity,
    icon: slot.icon,
    color: set.color,
    description: `${entry.setName} ${slot.label.toLowerCase()} · ${set.theme}`,
    stats: {
      health: Math.round(slot.health * scale),
      dr: Math.min(0.18, slot.dr + tier * 0.004),
      speed: slot.speed
    },
    appearance: { shape: set.hat, color: set.color, accent: set.accent }
  };
}

function cosmeticItem(entry, rarity = 'Celestial') {
  return {
    name: entry.name,
    category: 'cosmetic',
    rarity,
    icon: '🎖',
    color: entry.accent,
    description: entry.description,
    stats: {},
    appearance: { shape: entry.shape, color: entry.color, accent: entry.accent }
  };
}

function materialItem(entry, rarity = 'Common') {
  return {
    name: entry.name,
    category: 'material',
    rarity,
    icon: entry.icon,
    color: entry.color,
    description: entry.description,
    stats: {},
    qty: 1
  };
}

export function createItem({ name, rarity = 'Common' } = {}) {
  const key = String(name ?? '').toLowerCase();
  const weapon = WEAPON_BY_NAME.get(key);
  if (weapon) return { id: randomUUID(), ...weaponItem(weapon, rarity) };
  const armor = ARMOR_BY_NAME.get(key);
  if (armor) return { id: randomUUID(), ...armorItem(armor, rarity) };
  const cosmetic = COSMETIC_BY_NAME.get(key);
  if (cosmetic) return { id: randomUUID(), ...cosmeticItem(cosmetic, rarity) };
  const material = MATERIAL_BY_NAME.get(key);
  if (material) return { id: randomUUID(), ...materialItem(material) };
  return { id: randomUUID(), name: String(name ?? 'Unknown Relic'), category: 'material', rarity: 'Common', icon: '❔', color: '#9aa4b0', description: 'An unidentified relic.', stats: {} };
}

export function randomWeaponName(category) {
  const pool = category === 'musket' ? MUSKETS : SWORDS;
  return pool[Math.floor(Math.random() * pool.length)].name;
}

export function randomArmorName(setName = null) {
  const pool = setName ? ARMOR_ITEMS.filter((entry) => entry.setName === setName) : ARMOR_ITEMS;
  return pool[Math.floor(Math.random() * pool.length)].name;
}

export function randomItemForCategory(category, rarity) {
  let name;
  if (category === 'sword') name = randomWeaponName('sword');
  else if (category === 'musket') name = randomWeaponName('musket');
  else if (category === 'armor') name = randomArmorName();
  else if (category === 'cosmetic') return createItem({ name: COSMETICS[Math.floor(Math.random() * COSMETICS.length)].name, rarity });
  else name = MATERIALS[Math.floor(Math.random() * MATERIALS.length)].name;
  return createItem({ name, rarity });
}

// Turns a loot-table entry into a concrete item name.
export function resolveLootEntry(entry) {
  if (!entry) return null;
  if (entry.startsWith('$armor:')) {
    const setName = entry.slice('$armor:'.length);
    return ARMOR_SETS[setName] ? randomArmorName(setName) : randomArmorName();
  }
  if (entry === '$armor') return randomArmorName();
  if (entry === '$sword') return randomWeaponName('sword');
  if (entry === '$musket') return randomWeaponName('musket');
  if (entry === '$material') return MATERIALS[Math.floor(Math.random() * MATERIALS.length)].name;
  if (entry === '$cosmetic') return COSMETICS[Math.floor(Math.random() * COSMETICS.length)].name;
  return entry;
}

export function categoryOf(name) {
  const key = String(name ?? '').toLowerCase();
  if (WEAPON_BY_NAME.has(key)) return 'weapon';
  if (ARMOR_BY_NAME.has(key)) return 'armor';
  if (COSMETIC_BY_NAME.has(key)) return 'cosmetic';
  if (MATERIAL_BY_NAME.has(key)) return 'material';
  return null;
}

export function buildAppearance(profile) {
  const equipment = profile.equipment ?? {};
  const items = new Map((profile.inventory ?? []).map((item) => [item.id, item]));
  const armor = equipment.armor ?? {};
  const pieces = {};
  for (const slot of SLOT_KEYS) {
    const item = items.get(armor[slot]);
    if (item) pieces[slot] = item;
  }
  const cosmetic = items.get(equipment.cosmetic);
  const chest = ARMOR_SETS[pieces.chest?.setId] ?? null;
  const hatSource = cosmetic?.appearance ?? pieces.hat?.appearance ?? null;
  const setCounts = {};
  for (const item of Object.values(pieces)) setCounts[item.setId] = (setCounts[item.setId] ?? 0) + 1;
  const activeSet = Object.entries(setCounts).sort((a, b) => b[1] - a[1])[0] ?? null;
  const setDef = activeSet ? ARMOR_SETS[activeSet[0]] : null;
  return {
    hat: hatSource ? { shape: hatSource.shape, color: hatSource.color, accent: hatSource.accent } : null,
    chestColor: chest?.color ?? null,
    chestAccent: chest?.accent ?? null,
    cape: pieces.cape ? { color: ARMOR_SETS[pieces.cape.setId]?.color ?? '#8b2f2f', accent: ARMOR_SETS[pieces.cape.setId]?.accent ?? '#e6cf9a' } : null,
    boots: pieces.boots ? { color: ARMOR_SETS[pieces.boots.setId]?.color ?? '#40352a' } : null,
    set: activeSet && activeSet[1] >= 3 ? activeSet[0] : null,
    setPieces: activeSet ? activeSet[1] : 0,
    cosmetic: cosmetic?.name ?? null,
    theme: setDef?.theme ?? null
  };
}

export function addToCollection(profile, item) {
  if (!profile.collection) profile.collection = {};
  const existing = profile.collection[item.name];
  const currentRank = existing ? RARITY_ORDER.indexOf(existing.rarity) : -1;
  if (!existing || RARITY_ORDER.indexOf(item.rarity) > currentRank) {
    profile.collection[item.name] = {
      rarity: item.rarity,
      category: item.category,
      at: existing?.at ?? new Date().toISOString()
    };
  }
}

export function collectionSummary(profile) {
  const entries = profile.collection ?? {};
  return {
    discovered: Object.keys(entries).length,
    total: COLLECTION_TOTAL,
    entries
  };
}

export { RARITY_COLORS };
