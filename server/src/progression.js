import { BASE_INVENTORY, INVENTORY_PER_CAPACITY, PLAYER, RARITY_ORDER } from './config.js';
import { ARMOR_SETS } from './items.js';

export const UPGRADES = Object.freeze({
  speed: { name: 'Swift Step', icon: '🏃', max: 12, perLevel: 10, unit: 'move speed', description: 'March faster between fights.' },
  maxHealth: { name: 'Stalwart', icon: '❤️', max: 12, perLevel: 12, unit: 'max health', description: 'Stand longer in the line.' },
  regen: { name: 'Field Surgeon', icon: '✚', max: 10, perLevel: 0.6, unit: 'health / sec', description: 'Recover health between volleys.' },
  capacity: { name: 'Pack Mule', icon: '🎒', max: 10, perLevel: INVENTORY_PER_CAPACITY, unit: 'inventory slots', description: 'Carry more loot before returning.' },
  damage: { name: 'Cold Steel', icon: '⚔️', max: 12, perLevel: 0.07, unit: '% damage', description: 'Sharpen every weapon you carry.' },
  attackSpeed: { name: 'Drilled Hands', icon: '⏱️', max: 10, perLevel: 0.06, unit: '% attack speed', description: 'Strike and reload faster.' },
  crit: { name: 'Weak Point', icon: '🎯', max: 10, perLevel: 0.02, unit: '% critical chance', description: 'A chance to double a hit.' },
  xpGain: { name: 'Campaigner', icon: '📜', max: 10, perLevel: 0.06, unit: '% XP', description: 'Learn more from every skirmish.' },
  lootLuck: { name: 'Forager', icon: '🍀', max: 10, perLevel: 0.025, unit: '% rarity reroll', description: 'A chance to reroll item rarity and keep the better roll.' }
});

export const EQUIPMENT_INFO = Object.freeze({
  swordSlots: 3,
  musketSlots: 2,
  armorSlots: Object.keys(ARMOR_SETS).length ? ['hat', 'chest', 'legs', 'boots', 'cape'] : [],
  note: 'Swords orbit you and muskets fire automatically. Armor pieces provide real stats, and three or more pieces of one set grant a set bonus.'
});

export function upgradeCost(level) {
  return 1 + Math.floor(level / 3);
}

export function xpNeeded(level) {
  return 80 + (level - 1) * 45;
}

export function findItem(profile, itemId) {
  return (profile.inventory ?? []).find((item) => item.id === itemId) ?? null;
}

export function equippedItems(profile) {
  const equipment = profile.equipment ?? {};
  const items = new Map((profile.inventory ?? []).map((item) => [item.id, item]));
  const swords = (equipment.swords ?? []).map((id) => items.get(id)).filter(Boolean);
  const muskets = (equipment.muskets ?? []).map((id) => items.get(id)).filter(Boolean);
  const armor = {};
  for (const [slot, id] of Object.entries(equipment.armor ?? {})) {
    const item = items.get(id);
    if (item) armor[slot] = item;
  }
  const cosmetic = items.get(equipment.cosmetic) ?? null;
  return { swords, muskets, armor, cosmetic };
}

export function setBonuses(armor) {
  const counts = {};
  for (const item of Object.values(armor)) {
    if (!item.setId) continue;
    counts[item.setId] = (counts[item.setId] ?? 0) + 1;
  }
  const active = [];
  for (const [setId, count] of Object.entries(counts)) {
    if (count < 3) continue;
    const def = ARMOR_SETS[setId];
    const tier = count >= 5 ? 2 : 1;
    active.push({
      setId,
      name: setId,
      pieces: count,
      theme: def?.theme ?? 'Unknown',
      bonus: { health: 22 * tier, dr: 0.018 * tier, speed: 4 * tier }
    });
  }
  return active;
}

export function computeStats(profile) {
  const levels = profile.upgrades ?? {};
  const levelOf = (key) => Math.max(0, Math.min(UPGRADES[key]?.max ?? 0, Number(levels[key]) || 0));
  const stats = {
    maxHealth: PLAYER.baseHealth,
    speed: PLAYER.baseSpeed,
    regen: 0.5,
    damageMul: 1,
    attackSpeedMul: 1,
    critChance: 0.05,
    xpMul: 1,
    lootLuck: 0,
    damageReduction: 0
  };

  stats.speed += levelOf('speed') * UPGRADES.speed.perLevel;
  stats.maxHealth += levelOf('maxHealth') * UPGRADES.maxHealth.perLevel;
  stats.regen += levelOf('regen') * UPGRADES.regen.perLevel;
  stats.damageMul += levelOf('damage') * UPGRADES.damage.perLevel;
  stats.attackSpeedMul += levelOf('attackSpeed') * UPGRADES.attackSpeed.perLevel;
  stats.critChance += levelOf('crit') * UPGRADES.crit.perLevel;
  stats.xpMul += levelOf('xpGain') * UPGRADES.xpGain.perLevel;
  stats.lootLuck += levelOf('lootLuck') * UPGRADES.lootLuck.perLevel;

  const equipped = equippedItems(profile);
  for (const item of Object.values(equipped.armor)) {
    stats.maxHealth += item.stats?.health ?? 0;
    stats.damageReduction += item.stats?.dr ?? 0;
    stats.speed += item.stats?.speed ?? 0;
  }

  const sets = setBonuses(equipped.armor);
  for (const set of sets) {
    stats.maxHealth += set.bonus.health;
    stats.damageReduction += set.bonus.dr;
    stats.speed += set.bonus.speed;
  }

  stats.damageReduction = Math.min(0.65, stats.damageReduction);
  stats.speed = Math.max(120, Math.round(stats.speed));
  stats.maxHealth = Math.round(stats.maxHealth);
  stats.critChance = Math.min(0.6, stats.critChance);
  stats.attackSpeedMul = Math.min(2.6, stats.attackSpeedMul);
  stats.lootLuck = Math.min(0.5, stats.lootLuck);
  stats.regen = Math.round(stats.regen * 10) / 10;
  stats.inventoryCapacity = BASE_INVENTORY + levelOf('capacity') * UPGRADES.capacity.perLevel;
  stats.setBonuses = sets;
  return stats;
}

export const CRAFT_RATES = Object.freeze({
  Common: 0.9, Unusual: 0.8, Rare: 0.65, Epic: 0.45, Legendary: 0.3,
  Mythic: 0.2, Ultra: 0.12, Super: 0.08, Unique: 0.04, Divine: 0.01
});

export function nextRarity(rarity) {
  const index = RARITY_ORDER.indexOf(rarity);
  return index >= 0 && index < RARITY_ORDER.length - 1 ? RARITY_ORDER[index + 1] : null;
}

export function craftCoinCost(rarity) {
  const index = Math.max(0, RARITY_ORDER.indexOf(rarity));
  return 25 + index * 45;
}

export function publicUpgradeDefs() {
  return Object.entries(UPGRADES).map(([key, def]) => ({ key, ...def }));
}
