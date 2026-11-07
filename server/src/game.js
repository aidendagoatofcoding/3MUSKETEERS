import { randomUUID } from 'node:crypto';
import { BASE_ITEM_DROP_CHANCE, ITEM_RARITY_WEIGHTS, MOB, PLAYER, TICK_RATE, WORLD } from './config.js';

const RARITIES = Object.entries(ITEM_RARITY_WEIGHTS);
const rarityRoll = () => {
  const total = RARITIES.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of RARITIES) {
    roll -= weight;
    if (roll < 0) return rarity;
  }
  return 'Common';
};
const cleanName = (value) => String(value ?? 'Soldier').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20) || 'Soldier';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Game {
  constructor(io, store) {
    this.io = io;
    this.store = store;
    this.players = new Map();
    this.mobs = new Map();
    this.lastTick = Date.now();
    this.seedMobs();
  }

  seedMobs() {
    for (let i = 0; i < 10; i += 1) this.spawnMob(320 + Math.random() * 1760, 240 + Math.random() * 1120);
  }

  spawnMob(x, y) {
    const mob = { id: randomUUID(), name: 'Rogue Redcoat', rarity: 'Common', x, y, health: MOB.maxHealth, maxHealth: MOB.maxHealth, radius: MOB.radius };
    this.mobs.set(mob.id, mob);
    return mob;
  }

  async connect(socket) {
    const auth = socket.handshake.auth ?? {};
    let account = this.store.findByToken(auth.token);
    let newToken;
    if (!account) {
      const result = await this.store.createGuest(cleanName(auth.name));
      account = { id: result.id, profile: result.profile };
      newToken = result.token;
    }

    const player = {
      id: account.id,
      socketId: socket.id,
      name: cleanName(account.profile.name || auth.name),
      x: 1200 + (Math.random() - 0.5) * 120,
      y: 800 + (Math.random() - 0.5) * 120,
      health: PLAYER.maxHealth,
      level: Math.max(1, account.profile.level || 1),
      xp: Math.max(0, account.profile.xp || 0),
      inventory: Array.isArray(account.profile.inventory) ? account.profile.inventory : [],
      input: { up: false, down: false, left: false, right: false },
      nextAttackAt: 0,
      lastSaveAt: Date.now()
    };
    const previous = this.players.get(player.id);
    if (previous) this.io.sockets.sockets.get(previous.socketId)?.disconnect(true);
    this.players.set(player.id, player);
    socket.data.accountId = player.id;
    socket.emit('welcome', { player: this.publicPlayer(player), token: newToken ?? null, world: WORLD });
    this.broadcast();
  }

  async disconnect(socket) {
    const id = socket.data.accountId;
    const player = id && this.players.get(id);
    if (!player || player.socketId !== socket.id) return;
    await this.savePlayer(player);
    this.players.delete(id);
    this.broadcast();
  }

  setInput(socket, payload) {
    const player = this.players.get(socket.data.accountId);
    if (!player || player.socketId !== socket.id || !payload || typeof payload !== 'object') return;
    for (const key of ['up', 'down', 'left', 'right']) player.input[key] = payload[key] === true;
  }

  tick() {
    const now = Date.now();
    const dt = clamp((now - this.lastTick) / 1000, 0, 0.1);
    this.lastTick = now;
    for (const player of this.players.values()) this.updatePlayer(player, dt, now);
    for (const mob of this.mobs.values()) this.updateMob(mob, dt);
    if (this.mobs.size < MOB.maxCount && Math.random() < dt * 0.25) this.spawnMob(150 + Math.random() * (WORLD.width - 300), 150 + Math.random() * (WORLD.height - 300));
    this.broadcast();
  }

  updatePlayer(player, dt, now) {
    let dx = Number(player.input.right) - Number(player.input.left);
    let dy = Number(player.input.down) - Number(player.input.up);
    const length = Math.hypot(dx, dy) || 1;
    player.x = clamp(player.x + (dx / length) * PLAYER.speed * dt, PLAYER.radius, WORLD.width - PLAYER.radius);
    player.y = clamp(player.y + (dy / length) * PLAYER.speed * dt, PLAYER.radius, WORLD.height - PLAYER.radius);

    // Prototype orbit sword: server owns its attack timing and target damage.
    if (now >= player.nextAttackAt) {
      const target = [...this.mobs.values()].find((mob) => Math.hypot(mob.x - player.x, mob.y - player.y) < 54);
      if (target) {
        player.nextAttackAt = now + 650;
        target.health -= 25;
        this.io.to(player.socketId).emit('combat', { text: `-${Math.min(25, target.health + 25)} damage`, x: target.x, y: target.y });
        if (target.health <= 0) this.defeatMob(target, player);
      }
    }
    if (now - player.lastSaveAt > 15000) {
      player.lastSaveAt = now;
      void this.savePlayer(player);
    }
  }

  updateMob(mob, dt) {
    let target;
    let best = 360;
    for (const player of this.players.values()) {
      const distance = Math.hypot(player.x - mob.x, player.y - mob.y);
      if (distance < best) { best = distance; target = player; }
    }
    if (target && best > PLAYER.radius + mob.radius + 3) {
      mob.x += ((target.x - mob.x) / best) * MOB.speed * dt;
      mob.y += ((target.y - mob.y) / best) * MOB.speed * dt;
    }
  }

  defeatMob(mob, player) {
    this.mobs.delete(mob.id);
    const xpGain = 15;
    player.xp += xpGain;
    const threshold = player.level * 100;
    if (player.xp >= threshold) {
      player.xp -= threshold;
      player.level += 1;
      this.io.to(player.socketId).emit('level-up', { level: player.level });
    }
    this.io.to(player.socketId).emit('mob-defeated', { name: mob.name, xp: xpGain });
    // Same global drop chance for every mob; item rarity is rolled independently of mob rarity.
    if (Math.random() < BASE_ITEM_DROP_CHANCE) {
      const starterItems = [
        { name: 'Redcoat Saber', category: 'sword' },
        { name: 'Brown Bess', category: 'musket' },
        { name: 'Iron Helmet', category: 'armor' }
      ];
      const item = { id: randomUUID(), ...starterItems[Math.floor(Math.random() * starterItems.length)], rarity: rarityRoll() };
      player.inventory.push(item);
      this.io.to(player.socketId).emit('loot', { item });
    }
    void this.savePlayer(player);
    setTimeout(() => this.spawnMob(200 + Math.random() * (WORLD.width - 400), 200 + Math.random() * (WORLD.height - 400)), MOB.respawnMs).unref?.();
  }

  publicPlayer(player) {
    return { id: player.id, name: player.name, x: player.x, y: player.y, health: player.health, level: player.level, xp: player.xp, inventoryCount: player.inventory.length };
  }

  broadcast() {
    this.io.emit('state', { players: [...this.players.values()].map((player) => this.publicPlayer(player)), mobs: [...this.mobs.values()] });
  }

  savePlayer(player) {
    return this.store.saveProfile(player.id, { name: player.name, level: player.level, xp: player.xp, inventory: player.inventory });
  }

  start() {
    return setInterval(() => this.tick(), 1000 / TICK_RATE);
  }
}
