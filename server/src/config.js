import { randomUUID } from 'node:crypto';
import { BASE_ITEM_DROP_CHANCE, ITEM_RARITY_WEIGHTS, MOB_DEFS, PLAYER, TICK_RATE, WORLD } from './config.js';

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
const pickWeighted = (table) => {
  const entries = Object.entries(table || {});
  if (!entries.length) return null;
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight || 0), 0);
  let roll = Math.random() * total;
  for (const [key, weight] of entries) {
    roll -= Number(weight || 0);
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
};

const DAMAGE_TYPES = { sword: 22, musket: 16 };
const cleanName = (value) => String(value ?? 'Soldier').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20) || 'Soldier';

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
    const templates = ['Rogue Redcoat', 'Ronin', 'Knight', 'Pirate', 'Shadow Musketeer'];
    for (let i = 0; i < 12; i += 1) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      const x = 180 + Math.random() * (WORLD.width - 360);
      const y = 180 + Math.random() * (WORLD.height - 360);
      this.spawnMob(template, x, y);
    }
  }

  spawnMob(templateName, x, y) {
    const template = MOB_DEFS[templateName] || MOB_DEFS['Rogue Redcoat'];
    const mob = {
      id: randomUUID(),
      template: template.name,
      name: template.name,
      rarity: template.rarity || 'Common',
      color: template.color || '#d75f5f',
      x: x ?? 180 + Math.random() * (WORLD.width - 360),
      y: y ?? 180 + Math.random() * (WORLD.height - 360),
      radius: template.radius || 18,
      maxHealth: template.maxHealth || 60,
      health: template.maxHealth || 60,
      speed: template.speed || 70,
      attackRange: template.attackRange || 32,
      attackDamage: template.attackDamage || 12,
      attackInterval: template.attackInterval || 1200,
      nextAttackAt: Date.now() + 400 + Math.random() * 900,
      xpReward: template.xpReward || 18,
      lootTable: template.lootTable || {},
      faction: template.faction || 'Frontier'
    };
    this.mobs.set(mob.id, mob);
    return mob;
  }

  async connect(socket) {
    const auth = socket.handshake.auth ?? {};
    let account = this.store.findByToken(auth.token);
    let newToken;
    if (!account) {
      const result = await this.store.createGuest(cleanName(auth.name) || 'Soldier');
      account = { id: result.id, profile: result.profile };
      newToken = result.token;
    }

    const inventory = Array.isArray(account.profile.inventory) ? account.profile.inventory : [];
    const sword = inventory.find((item) => item.category === 'sword') || { name: 'Redcoat Saber', category: 'sword', rarity: 'Common' };
    const musket = inventory.find((item) => item.category === 'musket') || { name: 'Brown Bess', category: 'musket', rarity: 'Common' };

    const player = {
      id: account.id,
      socketId: socket.id,
      name: cleanName(account.profile.name || auth.name || 'Soldier'),
      x: 1000 + (Math.random() - 0.5) * 140,
      y: 760 + (Math.random() - 0.5) * 140,
      maxHealth: PLAYER.maxHealth,
      health: PLAYER.maxHealth,
      level: Math.max(1, account.profile.level || 1),
      xp: Math.max(0, account.profile.xp || 0),
      inventory,
      sword,
      musket,
      input: { up: false, down: false, left: false, right: false },
      nextSwordAt: 0,
      nextMusketAt: 0,
      lastSaveAt: Date.now(),
      faction: 'British Empire',
      clan: null
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
    for (const mob of this.mobs.values()) this.updateMob(mob, dt, now);
    this.updateProjectiles(dt, now);

    if (this.mobs.size < 16 && Math.random() < dt * 0.8) {
      const templates = ['Rogue Redcoat', 'Ronin', 'Knight', 'Pirate', 'Shadow Musketeer'];
      const template = templates[Math.floor(Math.random() * templates.length)];
      this.spawnMob(template, 120 + Math.random() * (WORLD.width - 240), 120 + Math.random() * (WORLD.height - 240));
    }

    this.broadcast();
  }

  updatePlayer(player, dt, now) {
    const dx = Number(player.input.right) - Number(player.input.left);
    const dy = Number(player.input.down) - Number(player.input.up);
    const length = Math.hypot(dx, dy) || 1;

    player.x = clamp(player.x + (dx / length) * PLAYER.speed * dt, PLAYER.radius, WORLD.width - PLAYER.radius);
    player.y = clamp(player.y + (dy / length) * PLAYER.speed * dt, PLAYER.radius, WORLD.height - PLAYER.radius);

    if (now >= player.nextSwordAt) {
      const target = [...this.mobs.values()].find((mob) => {
        const distance = Math.hypot(mob.x - player.x, mob.y - player.y);
        return distance < 62;
      });
      if (target) {
        const damage = DAMAGE_TYPES.sword + (Number(player.sword?.rarity === 'Rare') * 8 || 0);
        player.nextSwordAt = now + 550;
        target.health -= damage;
        this.io.to(player.socketId).emit('combat', { text: `-${damage}`, x: target.x, y: target.y, type: 'sword' });
        if (target.health <= 0) this.defeatMob(target, player);
      }
    }

    if (now >= player.nextMusketAt) {
      const target = [...this.mobs.values()].find((mob) => {
        const distance = Math.hypot(mob.x - player.x, mob.y - player.y);
        return distance < 440;
      });
      if (target && player.musket?.name) {
        const weapon = { name: player.musket.name, damage: 18, projectileSpeed: 430, cooldown: 820, color: '#d7bb72', range: 440 };
        player.nextMusketAt = now + weapon.cooldown;
        this.spawnProjectile({
          id: randomUUID(),
          sourceId: player.id,
          sourceType: 'player',
          x: player.x,
          y: player.y,
          targetId: target.id,
          damage: weapon.damage,
          radius: 5,
          speed: weapon.projectileSpeed,
          color: weapon.color,
          remaining: weapon.range,
          damageType: 'musket'
        });
      }
    }

    if (now - player.lastSaveAt > 15000) {
      player.lastSaveAt = now;
      void this.savePlayer(player);
    }
  }

  updateMob(mob, dt, now) {
    let target = null;
    let bestDistance = Infinity;
    for (const player of this.players.values()) {
      const distance = Math.hypot(player.x - mob.x, player.y - mob.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = player;
      }
    }

    if (!target) return;
    const dx = target.x - mob.x;
    const dy = target.y - mob.y;
    const distance = Math.hypot(dx, dy) || 1;
    const step = mob.speed * dt;

    if (distance > mob.attackRange + targetRadius(target)) {
      mob.x += (dx / distance) * step;
      mob.y += (dy / distance) * step;
    }

    if (distance <= mob.attackRange + targetRadius(target) && now >= mob.nextAttackAt) {
      mob.nextAttackAt = now + mob.attackInterval;
      const damage = mob.attackDamage;
      target.health -= damage;
      this.io.to(target.socketId).emit('combat', { text: `-${damage}`, x: target.x, y: target.y, type: 'mob' });
      if (target.health <= 0) {
        target.health = target.maxHealth;
        target.x = 1000 + (Math.random() - 0.5) * 120;
        target.y = 760 + (Math.random() - 0.5) * 120;
        this.io.to(target.socketId).emit('respawn', { x: target.x, y: target.y });
      }
    }
  }

  updateProjectiles(dt, now) {
    for (const projectile of [...this.projectiles.values()]) {
      const target = this.mobs.get(projectile.targetId) || null;
      if (target) {
        const dx = target.x - projectile.x;
        const dy = target.y - projectile.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance > 0.01) {
          projectile.x += (dx / distance) * projectile.speed * dt;
          projectile.y += (dy / distance) * projectile.speed * dt;
        }
      }

      projectile.remaining -= projectile.speed * dt;
      if (projectile.remaining <= 0) {
        this.projectiles.delete(projectile.id);
        continue;
      }

      for (const mob of this.mobs.values()) {
        if (Math.hypot(projectile.x - mob.x, projectile.y - mob.y) <= (projectile.radius + mob.radius)) {
          mob.health -= projectile.damage;
          this.projectiles.delete(projectile.id);
          if (mob.health <= 0) this.defeatMob(mob, this.players.get(projectile.sourceId));
          break;
        }
      }
    }
  }

  defeatMob(mob, player) {
    if (!player) return;
    this.mobs.delete(mob.id);

    const xpGain = mob.xpReward || 15;
    player.xp += xpGain;
    const threshold = player.level * 100;
    if (player.xp >= threshold) {
      player.xp -= threshold;
      player.level += 1;
      this.io.to(player.socketId).emit('level-up', { level: player.level });
    }

    const drop = this.rollLoot(mob);
    if (drop) {
      player.inventory.push(drop);
      this.io.to(player.socketId).emit('loot', { item: drop });
    }

    this.io.to(player.socketId).emit('mob-defeated', { name: mob.name, xp: xpGain, rarity: mob.rarity });
    void this.savePlayer(player);

    setTimeout(() => {
      const template = Object.keys(MOB_DEFS)[Math.floor(Math.random() * Object.keys(MOB_DEFS).length)];
      this.spawnMob(template, 150 + Math.random() * (WORLD.width - 300), 150 + Math.random() * (WORLD.height - 300));
    }, 1600).unref?.();
  }

  rollLoot(mob) {
    if (Math.random() > BASE_ITEM_DROP_CHANCE) return null;
    const choices = mob.lootTable || {};
    const chosenKey = pickWeighted(choices);
    if (!chosenKey) return null;

    const item = { id: randomUUID(), name: chosenKey, category: chosenKey.includes('Sword') || chosenKey.includes('Saber') || chosenKey.includes('Katana') ? 'sword' : chosenKey.includes('Musket') || chosenKey.includes('Pistol') ? 'musket' : chosenKey.includes('Helmet') || chosenKey.includes('Armor') || chosenKey.includes('Coat') || chosenKey.includes('Uniform') ? 'armor' : 'material', rarity: rarityRoll() };
    if (item.category === 'sword' && !item.name.includes('Sword') && !item.name.includes('Saber') && !item.name.includes('Katana')) item.name = `${item.name} Sword`;
    if (item.category === 'musket' && !item.name.includes('Musket')) item.name = `${item.name} Musket`;
    return item;
  }

  spawnProjectile(projectile) {
    this.projectiles.set(projectile.id, projectile);
  }

  publicPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      health: player.health,
      maxHealth: player.maxHealth,
      level: player.level,
      xp: player.xp,
      inventoryCount: player.inventory.length
    };
  }

  broadcast() {
    this.io.emit('state', {
      players: [...this.players.values()].map((player) => this.publicPlayer(player)),
      mobs: [...this.mobs.values()],
      projectiles: [...this.projectiles.values()]
    });
  }

  savePlayer(player) {
    return this.store.saveProfile(player.id, {
      name: player.name,
      level: player.level,
      xp: player.xp,
      coins: player.coins || 0,
      inventory: player.inventory,
      health: player.health
    });
  }

  start() {
    return setInterval(() => this.tick(), 1000 / TICK_RATE);
  }
}

function targetRadius(target) {
  return target && typeof target === 'object' ? 15 : 0;
}
