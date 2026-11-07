const WORLD_DEFS = [
  {
    id: 'british-countryside',
    name: 'British Countryside',
    level: 1,
    description: 'Green hedgerows and red-coated deserters. The frontier where every soldier starts.',
    bg: '#25341f',
    bg2: '#3a4d2a',
    accent: '#d7b94e',
    pvp: false,
    boss: 'Redcoat Commander',
    mobs: ['Rogue Redcoat', 'Deserting Soldier', 'British Grenadier', 'Rogue Officer', 'Royal Musketeer', 'British Cavalryman', 'Royal Guard', 'Armored Redcoat']
  },
  {
    id: 'japanese-province',
    name: 'Japanese Province',
    level: 2,
    description: 'Rain-dark pines and matchlock smoke. Ronin patrol the mountain roads.',
    bg: '#2c2a24',
    bg2: '#463b2b',
    accent: '#e0c06a',
    pvp: false,
    boss: 'Shogun',
    mobs: ['Rogue Samurai', 'Ronin', 'Ashigaru', 'Samurai Archer', 'Matchlock Soldier', 'Armored Samurai', 'Samurai Commander']
  },
  {
    id: 'european-battlefield',
    name: 'European Battlefield',
    level: 5,
    description: 'Mud, drums and rolling volleys where five empires grind against each other.',
    bg: '#2a2c2f',
    bg2: '#3b3f45',
    accent: '#8fa8d8',
    pvp: false,
    boss: 'French Emperor',
    mobs: ['French Infantryman', 'French Grenadier', 'Prussian Musketeer', 'Spanish Swordsman', 'Ottoman Janissary', 'Royal Cavalryman', 'Highland Warrior']
  },
  {
    id: 'medieval-kingdom',
    name: 'Medieval Kingdom',
    level: 7,
    description: 'Stone keeps and knightly orders. Every banner hides a blade.',
    bg: '#262b33',
    bg2: '#39414d',
    accent: '#aab6cf',
    pvp: false,
    boss: 'Black Knight',
    mobs: ['Swordsman', 'Bandit', 'Mercenary', 'Knight', 'Crusader', 'Armored Knight', 'Templar', 'Royal Knight', 'Executioner']
  },
  {
    id: 'pirate-islands',
    name: 'Pirate Islands',
    level: 9,
    description: 'Salt, treasure and cutlass steel. The Confederation answers to no crown.',
    bg: '#152e3a',
    bg2: '#20495a',
    accent: '#67c6d8',
    pvp: false,
    boss: 'Pirate Admiral',
    mobs: ['Pirate', 'Cutlass Fighter', 'Pirate Musketeer', 'Buccaneer', 'Pirate Captain', 'Pirate Veteran', 'Pirate Admiral', 'Ghost Pirate']
  },
  {
    id: 'desert-empire',
    name: 'Desert Empire',
    level: 11,
    description: 'Sun-bleached ruins under the crescent banner. Janissaries hold the wells.',
    bg: '#3a2c1c',
    bg2: '#57402a',
    accent: '#e6b065',
    pvp: false,
    boss: 'Ottoman Warlord',
    mobs: ['Ottoman Janissary', 'Elite Musketeer', 'Imperial Guardsman', 'Spanish Swordsman', 'Royal Cavalryman', 'Mercenary', 'Bandit']
  },
  {
    id: 'frozen-fortress',
    name: 'Frozen Fortress',
    level: 13,
    description: 'A garrison that never surrendered, still walking its frozen walls.',
    bg: '#1d3440',
    bg2: '#2c5264',
    accent: '#9fe8f0',
    pvp: false,
    boss: 'Phantom Musketeer',
    mobs: ['Armored Knight', 'Royal Guard', 'Elite Musketeer', 'Phantom Swordsman', 'Iron Knight', 'Shield Guardian', 'Royal Musketeer']
  },
  {
    id: 'volcanic-stronghold',
    name: 'Volcanic Stronghold',
    level: 15,
    description: 'Dragon forges and molten ramparts. The heat alone kills the careless.',
    bg: '#33201d',
    bg2: '#4e2823',
    accent: '#ff8a5c',
    pvp: true,
    boss: 'Dragon Samurai',
    mobs: ['Demon Samurai', 'Oni Warrior', 'Dragon Knight', 'Cannon Creature', 'Blade Spirit', 'Living Sword', 'Musket Golem']
  },
  {
    id: 'crystal-caverns',
    name: 'Crystal Caverns',
    level: 17,
    description: 'Singing crystal veins and golems of bound blades. Riches reward the bold.',
    bg: '#1f283f',
    bg2: '#303d61',
    accent: '#8ee0ff',
    pvp: false,
    boss: 'Samurai General',
    mobs: ['Crystal Samurai', 'Sword Golem', 'Musket Golem', 'Animated Armor', 'Haunted Helmet', 'Shield Guardian', 'Blade Spirit', 'Flying Katana']
  },
  {
    id: 'shadow-realm',
    name: 'Shadow Realm',
    level: 19,
    description: 'A borderland of stolen banners. PvP is live outside the spawn safe zone.',
    bg: '#1a1622',
    bg2: '#2a2238',
    accent: '#b79bff',
    pvp: true,
    boss: 'Black Knight',
    mobs: ['Shadow Musketeer', 'Phantom Swordsman', 'Cursed Captain', 'Dark Knight', 'Oni Warrior', 'Haunted Helmet', 'Blade Spirit']
  },
  {
    id: 'celestial-empire',
    name: 'Celestial Empire',
    level: 22,
    description: 'The last court of legend. Celestial steel waits behind a general of light.',
    bg: '#302c1e',
    bg2: '#4a432c',
    accent: '#fff0b0',
    pvp: false,
    boss: 'Celestial General',
    mobs: ['Crystal Samurai', 'Golden Knight', 'Paladin', 'Dragon Knight', 'Sword Golem', 'Musket Golem', 'Shogun Guardian', 'Royal General']
  }
];

const SPAWN = Object.freeze({ x: 1200, y: 800 });

export const WORLDS = Object.freeze(
  WORLD_DEFS.map((world, index) => {
    const portals = [];
    if (index > 0) portals.push({ to: WORLD_DEFS[index - 1].id, x: 280, y: 800 });
    if (index < WORLD_DEFS.length - 1) portals.push({ to: WORLD_DEFS[index + 1].id, x: 2120, y: 800 });
    return Object.freeze({
      ...world,
      spawn: SPAWN,
      portals,
      maxMobs: Math.min(18, 12 + Math.floor(index / 2))
    });
  })
);

export const WORLD_BY_ID = new Map(WORLDS.map((world) => [world.id, world]));
export const FIRST_WORLD_ID = WORLDS[0].id;

export function worldSummary(world) {
  return {
    id: world.id,
    name: world.name,
    level: world.level,
    description: world.description,
    bg: world.bg,
    bg2: world.bg2,
    accent: world.accent,
    pvp: world.pvp,
    boss: world.boss,
    portals: world.portals,
    spawn: world.spawn
  };
}
