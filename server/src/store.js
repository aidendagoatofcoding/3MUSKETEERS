import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { addToCollection, createItem } from './items.js';
import { FACTIONS_BY_ID } from './config.js';
import { FIRST_WORLD_ID } from './worlds.js';

const DEFAULT_FILE = resolve('data/profiles.json');
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function starterProfile(name) {
  const sword = createItem({ name: 'Redcoat Saber', rarity: 'Common' });
  const musket = createItem({ name: 'Brown Bess', rarity: 'Common' });
  const profile = {
    name,
    level: 1,
    xp: 0,
    points: 1,
    coins: 60,
    faction: 'independent-ronin',
    worldId: FIRST_WORLD_ID,
    x: 1200,
    y: 800,
    inventory: [sword, musket],
    equipment: { swords: [sword.id], muskets: [musket.id], armor: {}, cosmetic: null },
    upgrades: {},
    collection: {},
    craftingHistory: [],
    stats: { kills: 0, bossKills: 0, pvpKills: 0, deaths: 0, drops: 0, crafts: 0, crafted: 0, playSeconds: 0 },
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };
  for (const item of profile.inventory) addToCollection(profile, item);
  return profile;
}

const emptyStats = () => ({ kills: 0, bossKills: 0, pvpKills: 0, deaths: 0, drops: 0, crafts: 0, crafted: 0, playSeconds: 0 });

export function normalizeProfile(profile, fallbackName = 'Soldier') {
  if (!profile || typeof profile !== 'object') profile = starterProfile(fallbackName);
  profile.name = String(profile.name || fallbackName).slice(0, 24);
  profile.level = Math.max(1, Number(profile.level) || 1);
  profile.xp = Math.max(0, Number(profile.xp) || 0);
  profile.points = Math.max(0, Number(profile.points) || 0);
  profile.coins = Math.max(0, Number(profile.coins) || 0);
  profile.faction = FACTIONS_BY_ID.has(profile.faction) ? profile.faction : 'independent-ronin';
  profile.worldId = profile.worldId || FIRST_WORLD_ID;
  profile.x = Number.isFinite(profile.x) ? profile.x : 1200;
  profile.y = Number.isFinite(profile.y) ? profile.y : 800;
  profile.inventory = Array.isArray(profile.inventory) ? profile.inventory.filter((item) => item?.id && item?.name) : [];
  profile.inventory = profile.inventory.map((item) => {
    if (item.stats && Object.keys(item.stats).length) return item;
    const fresh = createItem({ name: item.name, rarity: item.rarity });
    return { ...fresh, id: item.id };
  });
  profile.equipment = profile.equipment && typeof profile.equipment === 'object' ? profile.equipment : {};
  profile.equipment.swords = Array.isArray(profile.equipment.swords) ? profile.equipment.swords : [];
  profile.equipment.muskets = Array.isArray(profile.equipment.muskets) ? profile.equipment.muskets : [];
  profile.equipment.armor = profile.equipment.armor && typeof profile.equipment.armor === 'object' ? profile.equipment.armor : {};
  profile.equipment.cosmetic = profile.equipment.cosmetic ?? null;
  profile.upgrades = profile.upgrades && typeof profile.upgrades === 'object' ? profile.upgrades : {};
  profile.collection = profile.collection && typeof profile.collection === 'object' ? profile.collection : {};
  profile.craftingHistory = Array.isArray(profile.craftingHistory) ? profile.craftingHistory.slice(-20) : [];
  profile.stats = { ...emptyStats(), ...(profile.stats ?? {}) };
  profile.createdAt = profile.createdAt || new Date().toISOString();

  if (!profile.inventory.some((item) => item.category === 'sword')) {
    profile.inventory.push(createItem({ name: 'Redcoat Saber', rarity: 'Common' }));
  }
  if (!profile.inventory.some((item) => item.category === 'musket')) {
    profile.inventory.push(createItem({ name: 'Brown Bess', rarity: 'Common' }));
  }
  const ids = new Set(profile.inventory.map((item) => item.id));
  const firstSword = profile.inventory.find((item) => item.category === 'sword');
  const firstMusket = profile.inventory.find((item) => item.category === 'musket');
  profile.equipment.swords = profile.equipment.swords.filter((id) => ids.has(id));
  profile.equipment.muskets = profile.equipment.muskets.filter((id) => ids.has(id));
  if (!profile.equipment.swords.length && firstSword) profile.equipment.swords = [firstSword.id];
  if (!profile.equipment.muskets.length && firstMusket) profile.equipment.muskets = [firstMusket.id];
  for (const item of profile.inventory) addToCollection(profile, item);
  return profile;
}

export class ProfileStore {
  constructor(filePath = DEFAULT_FILE) {
    this.filePath = filePath;
    this.accounts = new Map();
    this.clans = new Map();
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const content = await readFile(this.filePath, 'utf8');
      const data = JSON.parse(content);
      for (const account of Array.isArray(data.accounts) ? data.accounts : []) {
        if (account?.id && account?.tokenHash && account?.profile) {
          account.profile = normalizeProfile(account.profile);
          this.accounts.set(account.id, account);
        }
      }
      for (const clan of Array.isArray(data.clans) ? data.clans : []) {
        if (clan?.id && clan?.name) this.clans.set(clan.id, clan);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.flush();
    }
  }

  async createGuest(name) {
    const token = randomBytes(32).toString('base64url');
    const account = { id: randomUUID(), tokenHash: hashToken(token), profile: starterProfile(name) };
    this.accounts.set(account.id, account);
    await this.flush();
    return { id: account.id, token, profile: structuredClone(account.profile) };
  }

  findByToken(token) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
    const candidate = Buffer.from(hashToken(token), 'hex');
    for (const account of this.accounts.values()) {
      const stored = Buffer.from(account.tokenHash, 'hex');
      if (candidate.length === stored.length && timingSafeEqual(candidate, stored)) {
        return { id: account.id, profile: structuredClone(account.profile) };
      }
    }
    return null;
  }

  async saveProfile(id, profile) {
    const account = this.accounts.get(id);
    if (!account) return;
    account.profile = structuredClone({ ...profile, lastSeenAt: new Date().toISOString() });
    await this.flush();
  }

  allAccounts() {
    return [...this.accounts.values()].map((account) => ({ id: account.id, profile: account.profile }));
  }

  getClan(id) {
    return this.clans.get(id) ?? null;
  }

  findClanByTag(tag) {
    const wanted = String(tag ?? '').trim().toLowerCase();
    for (const clan of this.clans.values()) if (clan.tag.toLowerCase() === wanted) return clan;
    return null;
  }

  allClans() {
    return [...this.clans.values()];
  }

  async saveClan(clan) {
    this.clans.set(clan.id, clan);
    await this.flush();
  }

  async deleteClan(id) {
    this.clans.delete(id);
    await this.flush();
  }

  flush() {
    const snapshot = JSON.stringify(
      { version: 2, accounts: [...this.accounts.values()], clans: [...this.clans.values()] },
      null,
      2
    );
    this.writeQueue = this.writeQueue
      .then(async () => {
        const tempPath = `${this.filePath}.${process.pid}.tmp`;
        await writeFile(tempPath, snapshot, { mode: 0o600 });
        await rename(tempPath, this.filePath);
      })
      .catch((error) => console.error('Profile flush failed:', error));
    return this.writeQueue;
  }
}
