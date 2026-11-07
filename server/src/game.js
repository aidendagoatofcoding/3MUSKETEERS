import { randomUUID } from 'node:crypto';
import { BASE_ITEM_DROP_CHANCE, ITEM_RARITY_WEIGHTS, MOB_DEFS, PLAYER, TICK_RATE, WORLD } from './config.js';
import { getWeapon, randomWeapon } from './weapons.js';

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
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanName = (value) => String(value ?? 'Soldier').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20) || 'Soldier';
const pickWeighted = (table) => {
  const entries = Object.entries(table || {}).filter(([, weight]) => Number(weight) > 0);
  if (!entries.length) return null;
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  let roll = Math.random() * total;
  for (const [key, weight] of entries) {
    roll -= Number(weight);
    if (roll < 0) return key;
  }
  return entries.at(-1)?.[0] ?? null;
};

export class Game {
  constructor(io, store) {
    this.io = io;
    this.store = store;
    this.players = new Map();
    this.mobs = new Map();
    this.projectiles = new Map();
    this.lastTick = Date.now();
    this.seedMobs();
  }

  seedMobs() {
    const names = Object.keys(MOB_DEFS);
    for (let i = 0; i < 12; i += 1) this.spawnMob(names[Math.floor(Math.random() * names.length)]);
  }

  spawnMob(templateName, x, y) {
    const template = MOB_DEFS[templateName] || MOB_DEFS['Rogue Redcoat'];
    const mob = {
      id: randomUUID(), template: template.name, name: template.name,
      rarity: template.rarity, color: template.color,
      x: x ?? 180 + Math.random() * (WORLD.width - 360),
      y: y ?? 180 + Math.random() * (WORLD.height - 360),
      radius: template.radius, maxHealth: template.maxHealth, health: template.maxHealth,
      speed: template.speed, attackRange: template.attackRange,
      attackDamage: template.attackDamage, attackInterval: template.attackInterval,
      nextAttackAt: Date.now() + 500, xpReward: template.xpReward,
      lootTable: template.lootTable, faction: template.faction
    };
    this.mobs.set(mob.id, mob);
    return mob;
  }

  async connect(socket) {
    const auth = socket.handshake.auth ?? {};
    let account = this.store.findByToken(auth.token);
    let newToken;
    if (!account) {
      const created = await this.store.createGuest(cleanName(auth.name));
      account = { id: created.id, profile: created.profile };
      newToken = created.token;
    }

    const inventory = Array.isArray(account.profile.inventory) ? account.profile.inventory : [];
    const sword = inventory.find((item) => item.category === 'sword') || { name: 'Redcoat Saber', category: 'sword', rarity: 'Common' };
    const musket = inventory.find((item) => item.category === 'musket') || { name: 'Brown Bess', category: 'musket', rarity: 'Common' };
    if (!inventory.some((item) => item.category === 'sword')) inventory.push({ id: randomUUID(), ...sword });
    if (!inventory.some((item) => item.category === 'musket')) inventory.push({ id: randomUUID(), ...musket });

    const player = {
      id: account.id, socketId: socket.id,
      name: cleanName(account.profile.name || auth.name),
      x: WORLD.width / 2 + (Math.random() - 0.5) * 120,
      y: WORLD.height / 2 + (Math.random() - 0.5) * 120,
      health: PLAYER.maxHealth, maxHealth: PLAYER.maxHealth,
      level: Math.max(1, account.profile.level || 1), xp: Math.max(0, account.profile.xp || 0),
      inventory, sword, musket,
      input: { up: false, down: false, left: false, right: false },
      nextSwordAt: 0, nextMusketAt: 0, lastSaveAt: Date.now()
    };
    const previous = this.players.get(player.id);
    if (previous) this.io.sockets.sockets.get(previous.socketId)?.disconnect(true);
    this.players.set(player.id, player);
    socket.data.accountId = player.id;
    socket.emit('welcome', { player: this.publicPlayer(player), token: newToken ?? null, world: WORLD, inventory: player.inventory });
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
    for (const mob of this.mobs.values()) this.updateMob(mob, dt, now);
    this.updateProjectiles(dt);
    if (this.mobs.size < 18 && Math.random() < dt * 0.6) {
      const names = Object.keys(MOB_DEFS);
      this.spawnMob(names[Math.floor(Math.random() * names.length)]);
    }
    this.broadcast();
  }

  updatePlayer(player, dt, now) {
    let dx = Number(player.input.right) - Number(player.input.left);
    let dy = Number(player.input.down) - Number(player.input.up);
    const length = Math.hypot(dx, dy) || 1;
    player.x = clamp(player.x + dx / length * PLAYER.speed * dt, PLAYER.radius, WORLD.width - PLAYER.radius);
    player.y = clamp(player.y + dy / length * PLAYER.speed * dt, PLAYER.radius, WORLD.height - PLAYER.radius);

    const sword = getWeapon(player.sword?.name, player.sword?.rarity);
    if (sword && now >= player.nextSwordAt) {
      const target = this.nearestMob(player.x, player.y, 56);
      if (target) {
        player.nextSwordAt = now + 600 / sword.attackSpeed;
        target.health -= sword.damage;
        this.io.to(player.socketId).emit('combat', { text: `-${sword.damage}`, x: target.x, y: target.y, type: 'sword' });
        if (target.health <= 0) this.defeatMob(target, player);
      }
    }

    const musket = getWeapon(player.musket?.name, player.musket?.rarity);
    if (musket && now >= player.nextMusketAt) {
      const target = this.nearestMob(player.x, player.y, musket.range);
      if (target) {
        player.nextMusketAt = now + musket.cooldown;
        for (let i = 0; i < musket.projectileCount; i += 1) {
          const spread = (i - (musket.projectileCount - 1) / 2) * 0.09;
          this.projectiles.set(randomUUID(), {
            id: randomUUID(), sourceId: player.id, x: player.x, y: player.y,
            targetId: target.id, damage: musket.damage, radius: 5,
            speed: musket.projectileSpeed, color: musket.color,
            remaining: musket.range, pierce: musket.pierce, spread
          });
        }
      }
    }

    if (now - player.lastSaveAt > 15000) {
      player.lastSaveAt = now;
      void this.savePlayer(player);
    }
  }

  nearestMob(x, y, range) {
    let nearest = null;
    let bestDistance = range;
    for (const mob of this.mobs.values()) {
      const distance = Math.hypot(mob.x - x, mob.y - y);
      if (distance < bestDistance) { bestDistance = distance; nearest = mob; }
    }
    return nearest;
  }

  updateMob(mob, dt, now) {
    let target = null;
    let bestDistance = 360;
    for (const player of this.players.values()) {
      const distance = Math.hypot(player.x - mob.x, player.y - mob.y);
      if (distance < bestDistance) { bestDistance = distance; target = player; }
    }
    if (!target) return;
    const dx = target.x - mob.x;
    const dy = target.y - mob.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > mob.attackRange + PLAYER.radius) {
      mob.x += dx / distance * mob.speed * dt;
      mob.y += dy / distance * mob.speed * dt;
    } else if (now >= mob.nextAttackAt) {
      mob.nextAttackAt = now + mob.attackInterval;
      target.health -= mob.attackDamage;
      this.io.to(target.socketId).emit('combat', { text: `-${mob.attackDamage}`, x: target.x, y: target.y, type: 'mob' });
      if (target.health <= 0) {
        target.health = target.maxHealth;
        target.x = WORLD.width / 2;
        target.y = WORLD.height / 2;
        this.io.to(target.socketId).emit('respawn', { x: target.x, y: target.y });
      }
    }
  }

  updateProjectiles(dt) {
    for (const projectile of [...this.projectiles.values()]) {
      const target = this.mobs.get(projectile.targetId);
      if (!target) { this.projectiles.delete(projectile.id); continue; }
      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const angle = Math.atan2(dy, dx) + (projectile.spread || 0);
      projectile.x += Math.cos(angle) * projectile.speed * dt;
      projectile.y += Math.sin(angle) * projectile.speed * dt;
      projectile.remaining -= projectile.speed * dt;
      if (projectile.remaining <= 0) { this.projectiles.delete(projectile.id); continue; }
      if (Math.hypot(projectile.x - target.x, projectile.y - target.y) <= projectile.radius + target.radius) {
        target.health -= projectile.damage;
        if (projectile.pierce > 0) {
          projectile.pierce -= 1;
          projectile.targetId = this.nearestMob(projectile.x, projectile.y, 220)?.id;
          if (!projectile.targetId) this.projectiles.delete(projectile.id);
        } else this.projectiles.delete(projectile.id);
        if (target.health <= 0) this.defeatMob(target, this.players.get(projectile.sourceId));
      }
    }
  }

  rollLoot(mob) {
    if (Math.random() >= BASE_ITEM_DROP_CHANCE) return null;
    const result = pickWeighted(mob.lootTable);
    if (!result) return null;
    let name = result;
    if (result === '$sword') name = randomWeapon('sword').name;
    else if (result === '$musket') name = randomWeapon('musket').name;
    else if (result === '$armor') name = ['Iron Helmet', 'Redcoat Uniform', 'Samurai Armor', 'Knight Plate', 'Pirate Outfit'][Math.floor(Math.random() * 5)];
    else if (result === '$material') name = ['Steel Scrap', 'Silk Thread', 'Powder Keg', 'Dark Powder', 'Soul Shard'][Math.floor(Math.random() * 5)];
    const weapon = getWeapon(name);
    return { id: randomUUID(), name, category: weapon?.category || (result === '$armor' ? 'armor' : 'material'), rarity: rarityRoll(), ...(weapon ? { icon: weapon.icon, damage: weapon.damage } : {}) };
  }

  defeatMob(mob, player) {
    if (!this.mobs.has(mob.id)) return;
    this.mobs.delete(mob.id);
    if (!player) return;
    const xpGain = mob.xpReward;
    player.xp += xpGain;
    const threshold = player.level * 100;
    if (player.xp >= threshold) {
      player.xp -= threshold;
      player.level += 1;
      this.io.to(player.socketId).emit('level-up', { level: player.level });
    }
    const item = this.rollLoot(mob);
    if (item) {
      player.inventory.push(item);
      if (item.category === 'sword' && !player.sword) player.sword = item;
      if (item.category === 'musket' && !player.musket) player.musket = item;
      this.io.to(player.socketId).emit('loot', { item });
    }
    this.io.to(player.socketId).emit('mob-defeated', { name: mob.name, xp: xpGain, rarity: mob.rarity });
    void this.savePlayer(player);
    setTimeout(() => {
      const names = Object.keys(MOB_DEFS);
      this.spawnMob(names[Math.floor(Math.random() * names.length)]);
    }, 1800).unref?.();
  }

  publicPlayer(player) {
    return { id: player.id, name: player.name, x: player.x, y: player.y, health: player.health, maxHealth: player.maxHealth, level: player.level, xp: player.xp, inventoryCount: player.inventory.length };
  }

  broadcast() {
    this.io.emit('state', { players: [...this.players.values()].map((player) => this.publicPlayer(player)), mobs: [...this.mobs.values()], projectiles: [...this.projectiles.values()] });
  }

  savePlayer(player) {
    return this.store.saveProfile(player.id, { name: player.name, level: player.level, xp: player.xp, inventory: player.inventory, health: player.health });
  }

  start() { return setInterval(() => this.tick(), 1000 / TICK_RATE); }
}
