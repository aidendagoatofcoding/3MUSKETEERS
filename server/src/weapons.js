// The complete starter weapon catalogue. Stats are stylized game values, not real-world specifications.
const swordNames = `Wooden Sword|Stone Sword|Iron Sword|Steel Sword|Bronze Sword|Silver Sword|Golden Sword|Diamond Sword|Obsidian Sword|Crystal Sword|Ancient Sword|Knight Sword|Royal Sword|Greatsword|Claymore|Rapier|Saber|Cutlass|Scimitar|Broadsword|Shortsword|Longsword|Bastard Sword|Zweihander|Executioner's Sword|Katana|Wakizashi|Tanto|Nodachi|Odachi|Tachi|Uchigatana|Dual Katanas|Black Katana|White Katana|Red Katana|Golden Katana|Dragon Katana|Cursed Katana|Flaming Katana|Frozen Katana|Lightning Katana|Shadow Katana|Celestial Katana|Samurai Greatsword|Triple Blade Katana|Flame Sword|Frost Sword|Thunder Sword|Poison Sword|Venom Blade|Shadow Blade|Holy Sword|Demon Sword|Angelic Sword|Dragon Slayer|Soul Reaper|Void Blade|Star Sword|Moonblade|Sunblade|Galaxy Sword|Cosmic Blade|Dimension Cutter|Time Sword|Reality Blade|Infinite Blade|Bloodstone Blade|Meteor Sword|Chainsword|Sawblade Sword|Energy Sword|Plasma Blade|Laser Sword|Bone Sword|Thorn Sword|Crystal Greatsword|Ancient Relic Sword|Redcoat Saber|Iron Saber`.split('|');

const musketNames = `Wooden Musket|Matchlock Musket|Flintlock Musket|Brown Bess|Charleville Musket|Springfield Musket|Kentucky Long Rifle|Baker Rifle|Blunderbuss|Double-Barrel Musket|Heavy Musket|Hunting Musket|Royal Musket|Cavalry Musket|Pirate Musket|Naval Musket|Officer's Pistol|Flintlock Pistol|Repeating Musket|Japanese Matchlock|Tanegashima|Samurai Matchlock|Ashigaru Musket|Ornate Matchlock|Golden Matchlock|Imperial Matchlock|Dragon Matchlock|Shogun Musket|Cursed Matchlock|Golden Musket|Silver Musket|Diamond Musket|Crystal Musket|Ancient Musket|Knight's Musket|Dragon Musket|Imperial Musket|Fire Musket|Ice Musket|Lightning Musket|Poison Musket|Shadow Musket|Holy Musket|Magma Musket|Frost Musket|Thunder Musket|Void Musket|Celestial Musket|Plasma Musket|Laser Musket|Energy Musket|Star Musket|Galaxy Musket|Cosmic Musket|Dimension Musket|Soul Musket|Phantom Musket|Time Musket|Reality Musket|Infinite Musket|Flamethrower|Redcoat Musket`.split('|');

const rarityForIndex = (index, length) => {
  const progress = index / Math.max(1, length - 1);
  if (progress > 0.985) return 'Celestial';
  if (progress > 0.95) return 'Divine';
  if (progress > 0.91) return 'Unique';
  if (progress > 0.86) return 'Super';
  if (progress > 0.80) return 'Ultra';
  if (progress > 0.72) return 'Mythic';
  if (progress > 0.60) return 'Legendary';
  if (progress > 0.43) return 'Epic';
  if (progress > 0.25) return 'Rare';
  if (progress > 0.10) return 'Unusual';
  return 'Common';
};

const rarityScale = Object.freeze({ Common: 1, Unusual: 1.12, Rare: 1.28, Epic: 1.48, Legendary: 1.75, Mythic: 2.05, Ultra: 2.4, Super: 2.8, Unique: 3.25, Divine: 3.8, Celestial: 4.5 });
const rarityColors = Object.freeze({ Common: '#c9c7bc', Unusual: '#7bd17e', Rare: '#57a7ff', Epic: '#bc75e8', Legendary: '#f0b84c', Mythic: '#f27659', Ultra: '#ff5eae', Super: '#e64b58', Unique: '#f6f1c0', Divine: '#7ce9e0', Celestial: '#fff3a6' });
const specialWords = /flame|fire|frost|frozen|ice|thunder|lightning|poison|venom|shadow|holy|demon|angelic|dragon|void|star|moon|sun|galaxy|cosmic|dimension|time|reality|infinite|soul|phantom|plasma|laser|energy|celestial|cursed|meteor|bloodstone|sawblade|chainsword|flamethrower/i;

function swordDefinition(name, index) {
  const rarity = rarityForIndex(index, swordNames.length);
  const scale = rarityScale[rarity];
  const special = specialWords.test(name);
  return Object.freeze({
    id: `sword-${index + 1}`, name, category: 'sword', rarity,
    damage: Math.round((18 + Math.min(index, 35) * 0.72) * scale),
    attackSpeed: special ? 0.9 + (index % 4) * 0.08 : 1,
    orbitRadius: name === 'Triple Blade Katana' ? 52 : name === 'Greatsword' || name === 'Zweihander' ? 47 : 40,
    bladeCount: name === 'Triple Blade Katana' ? 3 : name === 'Dual Katanas' ? 2 : 1,
    icon: name.includes('Katana') ? '⚔' : name.includes('Blade') ? '✦' : '⚔',
    color: rarityColors[rarity], effect: special ? name.split(' ')[0] : 'none', rarity
  });
}

function musketDefinition(name, index) {
  const rarity = rarityForIndex(index, musketNames.length);
  const scale = rarityScale[rarity];
  const multishot = /Double-Barrel|Blunderbuss|Flamethrower/i.test(name);
  const fast = /Repeating|Pistol|Laser|Plasma|Energy/i.test(name);
  const range = /Rifle|Long Rifle|Baker|Sniper/i.test(name) ? 560 : /Flamethrower/i.test(name) ? 180 : 420;
  return Object.freeze({
    id: `musket-${index + 1}`, name, category: 'musket', rarity,
    damage: Math.round((fast ? 11 : multishot ? 24 : 19 + Math.min(index, 30) * 0.45) * scale),
    range, projectileSpeed: fast ? 520 : 390 + Math.min(index, 15) * 4,
    cooldown: fast ? 560 : multishot ? 1150 : 900 + (index % 5) * 50,
    projectileCount: multishot ? 3 : 1,
    pierce: /Lightning|Laser|Plasma|Energy|Dimension|Infinite/i.test(name) ? 2 : 0,
    icon: /Pistol/i.test(name) ? '⌑' : '➶',
    color: specialWords.test(name) ? rarityColors[rarity] : '#d7bb72',
    effect: specialWords.test(name) ? name.split(' ')[0] : 'none'
  });
}

export const SWORDS = Object.freeze(swordNames.map(swordDefinition));
export const MUSKETS = Object.freeze(musketNames.map(musketDefinition));
export const WEAPONS = Object.freeze([...SWORDS, ...MUSKETS]);
export const WEAPON_BY_NAME = new Map(WEAPONS.map((weapon) => [weapon.name.toLowerCase(), weapon]));
export const WEAPON_RARITY_SCALE = rarityScale;
export const WEAPON_RARITY_COLORS = rarityColors;

export function getWeapon(name, rarity = null) {
  const weapon = WEAPON_BY_NAME.get(String(name || '').toLowerCase());
  if (!weapon) return null;
  if (!rarity || rarity === weapon.rarity) return weapon;
  const scale = rarityScale[rarity] || 1;
  const baseScale = rarityScale[weapon.rarity] || 1;
  return { ...weapon, rarity, damage: Math.max(1, Math.round(weapon.damage * scale / baseScale)), color: rarityColors[rarity] || weapon.color };
}

export function randomWeapon(category) {
  const list = category === 'sword' ? SWORDS : MUSKETS;
  return list[Math.floor(Math.random() * list.length)];
}

export const STARTER_WEAPONS = Object.freeze({
  sword: getWeapon('Redcoat Saber'),
  musket: getWeapon('Brown Bess')
});
