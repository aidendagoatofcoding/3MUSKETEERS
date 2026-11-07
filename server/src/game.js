import { randomUUID } from 'node:crypto';
import {
  BASE_ITEM_DROP_CHANCE, BOSS_FIRST_SPAWN_MS, BOSS_RESPAWN_MS, CLAN_CREATE_COST, DROP_DESPAWN_MS,
  DROP_PICKUP_DELAY_MS, DROP_PICKUP_RADIUS, FACTIONS, FACTIONS_BY_ID, MAX_CLAN_MEMBERS, MOBS_PER_WORLD,
  MUSKET_SLOTS, OWNER_LOOT_WINDOW_MS, PLAYER, RARITY_COLORS, RARITY_ORDER, SAFE_ZONE_RADIUS,
  SPAWN_PROTECTION_MS, SWORD_SLOTS, TICK_RATE, WORLD
} from './config.js';
import { BOSS_DEFS, MOB_DEFS } from './mobs.js';
import {
  COLLECTION_CATALOG, MATERIALS, addToCollection, buildAppearance, collectionSummary, createItem,
  randomItemForCategory, resolveLootEntry, rollRarity
} from './items.js';
import {
  CRAFT_RATES, UPGRADES, computeStats, craftCoinCost, equippedItems, findItem, nextRarity,
  publicUpgradeDefs, upgradeCost, xpNeeded
} from './progression.js';
import { FIRST_WORLD_ID, WORLDS, WORLD_BY_ID, worldSummary } from './worlds.js';
import { normalizeProfile } from './store.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanName = (value) => String(value ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20);
const cleanText = (value, max) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const roomFor = (worldId) => `world:${worldId}`;
const tierOf = (rarity) => Math.max(0, RARITY_ORDER.indexOf(rarity));

const pickWeighted = (table) => {
  const entries = Object.entries(table ?? {}).filter(([, weight]) => Number(weight) > 0);
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
    this.worlds = new Map(
      WORLDS.map((world) => [
        world.id,
        {
          id: world.id,
          mobs: new Map(),
          projectiles: new Map(),
          drops: new Map(),
          nextBossAt: Date.now() + BOSS_FIRST_SPAWN_MS,
          lastFullWarning: 0
        }
      ])
    );
    this.lastTick = Date.now();
    this.meta = this.buildMeta();
  }

  buildMeta() {
    return {
      factions: FACTIONS,
      worlds: WORLDS.map((world) => worldSummary(world)),
      rarities: { order: [...RARITY_ORDER], colors: RARITY_COLORS },
      upgrades: publicUpgradeDefs(),
      craftRates: CRAFT_RATES,
      craftCoinCosts: Object.fromEntries(RARITY_ORDER.map((rarity) => [rarity, craftCoinCost(rarity)])),
      swordSlots: SWORD_SLOTS,
      musketSlots: MUSKET_SLOTS,
      baseDropChance: BASE_ITEM_DROP_CHANCE,
      collectionTotal: COLLECTION_CATALOG.length,
      collectionCatalog: COLLECTION_CATALOG,
      materials: MATERIALS,
      safeZoneRadius: SAFE_ZONE_RADIUS,
      tickRate: TICK_RATE
    };
  }

  async connect(socket) {
    const auth = socket.handshake.auth ?? {};
    let account = this.store.findByToken(auth.token);
    let newToken = null;
    if (!account) {
      const created = await this.store.createGuest(cleanName(auth.name) || 'Soldier');
      account = { id: created.id, profile: created.profile };
      newToken = created.token;
    }
    const profile = normalizeProfile(account.profile, cleanName(auth.name) || 'Soldier');
    const startingWorld = WORLD_BY_ID.get(profile.worldId) ?? WORLD_BY_ID.get(FIRST_WORLD_ID);
    if (profile.level < startingWorld.level) {
      profile.worldId = FIRST_WORLD_ID;
    }

    const player = {
      id: account.id,
      socketId: socket.id,
      profile,
      worldId: WORLD_BY_ID.get(profile.worldId) ? profile.worldId : FIRST_WORLD_ID,
      x: clamp(Number(profile.x) || startingWorld.spawn.x, 40, WORLD.width - 40),
      y: clamp(Number(profile.y) || startingWorld.spawn.y, 40, WORLD.height - 40),
      health: 1,
      input: { up: false, down: false, left: false, right: false },
      orbitAngle: Math.random() * Math.PI * 2,
      swordCooldowns: new Map(),
      musketCooldowns: new Map(),
      protectedUntil: Date.now() + SPAWN_PROTECTION_MS,
      lastSaveAt: Date.now(),
      dirty: false,
      lastTravelAt: 0,
      lastCraftAt: 0,
      lastChatAt: 0,
      lastFullWarningAt: 0
    };
    player.profile.clanId = profile.clanId && this.store.getClan(profile.clanId) ? profile.clanId : null;
    player.stats = computeStats(profile);
    player.health = player.stats.maxHealth;

    const previous = this.players.get(player.id);
    if (previous) this.io.sockets.sockets.get(previous.socketId)?.disconnect(true);
    this.players.set(player.id, player);
    socket.data.accountId = player.id;
    socket.join(roomFor(player.worldId));
    this.ensurePopulation(WORLD_BY_ID.get(player.worldId), true);

    const clan = this.clanFor(player);
    socket.emit('welcome', {
      token: newToken,
      player: this.publicPlayer(player),
      profile: this.buildProfile(player),
      meta: this.meta,
      world: worldSummary(WORLD_BY_ID.get(player.worldId)),
      clan
    });
    this.broadcastWorld(player.worldId);
  }

  async disconnect(socket) {
    const id = socket.data.accountId;
    const player = id && this.players.get(id);
    if (!player || player.socketId !== socket.id) return;
    await this.savePlayer(player);
    this.players.delete(id);
    const clan = this.clanFor(player);
    if (clan) this.emitClan(clan);
    this.broadcastWorld(player.worldId);
  }

  setInput(socket, payload) {
    const player = this.players.get(socket.data.accountId);
    if (!player || player.socketId !== socket.id || !payload || typeof payload !== 'object') return;
    for (const key of ['up', 'down', 'left', 'right']) player.input[key] = payload[key] === true;
  }

  markDirty(player) {
    player.dirty = true;
  }

  async savePlayer(player) {
    player.profile.x = Math.round(player.x);
    player.profile.y = Math.round(player.y);
    player.profile.worldId = player.worldId;
    player.dirty = false;
    player.lastSaveAt = Date.now();
    await this.store.saveProfile(player.id, player.profile);
  }

  updateStats(player) {
    const beforeMax = player.stats?.maxHealth ?? PLAYER.baseHealth;
    player.stats = computeStats(player.profile);
    if (player.stats.maxHealth > beforeMax) player.health += player.stats.maxHealth - beforeMax;
    player.health = clamp(player.health, 1, player.stats.maxHealth);
  }

  tick() {
    const now = Date.now();
    const dt = clamp((now - this.lastTick) / 1000, 0, 0.12);
    this.lastTick = now;
    for (const player of [...this.players.values()]) this.updatePlayer(player, now, dt);
    for (const world of this.worlds.values()) {
      if (!this.worldHasPlayers(world.id)) continue;
      this.updateWorld(world, now, dt);
      this.broadcastWorld(world.id);
    }
  }

  worldHasPlayers(worldId) {
    for (const player of this.players.values()) if (player.worldId === worldId) return true;
    return false;
  }

  playersIn(worldId) {
    return [...this.players.values()].filter((player) => player.worldId === worldId);
  }

  ensurePopulation(world, force = false) {
    const state = this.worlds.get(world.id);
    if (!state) return;
    const existing = [...state.mobs.values()].filter((mob) => !mob.isBoss);
    if (existing.length >= world.maxMobs) return;
    const spawnCount = force ? Math.min(world.maxMobs, MOBS_PER_WORLD) : 1;
    for (let i = 0; i < spawnCount && existing.length + i < world.maxMobs; i += 1) {
      const name = world.mobs[Math.floor(Math.random() * world.mobs.length)];
      let position = null;
      if (force && i % 2 === 0) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 230 + Math.random() * 170;
        position = {
          x: clamp(world.spawn.x + Math.cos(angle) * distance, 120, WORLD.width - 120),
          y: clamp(world.spawn.y + Math.sin(angle) * distance, 120, WORLD.height - 120)
        };
      }
      this.spawnMob(world.id, name, position);
    }
  }

  randomMobPosition() {
    return {
      x: 180 + Math.random() * (WORLD.width - 360),
      y: 180 + Math.random() * (WORLD.height - 360)
    };
  }

  spawnMob(worldId, name, position = null) {
    const template = MOB_DEFS[name];
    if (!template) return null;
    const state = this.worlds.get(worldId);
    const pos = position ?? this.randomMobPosition();
    const mob = {
      id: randomUUID(),
      worldId,
      template: name,
      name: template.name,
      rarity: template.rarity,
      color: template.color,
      radius: template.radius,
      maxHealth: template.maxHealth,
      health: template.maxHealth,
      speed: template.speed,
      attackRange: template.attackRange,
      attackDamage: template.attackDamage,
      attackInterval: template.attackInterval,
      ranged: template.ranged,
      xpReward: template.xpReward,
      lootTable: template.lootTable,
      isBoss: false,
      x: pos.x,
      y: pos.y,
      nextAttackAt: Date.now() + 600,
      nextSpecialAt: Date.now() + 4000,
      wanderAt: 0
    };
    state.mobs.set(mob.id, mob);
    return mob;
  }

  spawnBoss(world) {
    const template = BOSS_DEFS[world.boss];
    if (!template) return null;
    const state = this.worlds.get(world.id);
    const mob = {
      id: randomUUID(),
      worldId: world.id,
      template: template.name,
      name: template.name,
      rarity: template.rarity,
      color: template.color,
      radius: template.radius,
      maxHealth: template.maxHealth,
      health: template.maxHealth,
      speed: template.speed,
      attackRange: template.attackRange,
      attackDamage: template.attackDamage,
      attackInterval: template.attackInterval,
      ranged: false,
      xpReward: template.xpReward,
      lootTable: template.lootTable,
      isBoss: true,
      x: 1200,
      y: 380,
      nextAttackAt: Date.now() + 900,
      nextSpecialAt: Date.now() + 4500
    };
    state.mobs.set(mob.id, mob);
    state.nextBossAt = Date.now() + BOSS_RESPAWN_MS;
    this.io.to(roomFor(world.id)).emit('announce', {
      text: `⚔ BOSS — ${template.name} (${template.rarity}) has entered ${world.name}`,
      rarity: template.rarity
    });
    this.emitFx(world.id, { type: 'slam', x: mob.x, y: mob.y, radius: 180, color: template.color });
    return mob;
  }

  updateWorld(state, now, dt) {
    const world = WORLD_BY_ID.get(state.id);
    if (!world) return;
    this.ensurePopulation(world);
    const bossAlive = [...state.mobs.values()].some((mob) => mob.isBoss);
    if (!bossAlive && now >= state.nextBossAt) this.spawnBoss(world);
    for (const mob of [...state.mobs.values()]) this.updateMob(mob, world, now, dt);
    this.updateProjectiles(state, now, dt);
    this.updateDrops(state, world, now, dt);
  }

  updateMob(mob, world, now, dt) {
    const candidates = this.playersIn(world.id).filter((player) => player.protectedUntil <= now);
    let target = null;
    let bestDistance = mob.isBoss ? 700 : 460;
    for (const player of candidates) {
      const distance = Math.hypot(player.x - mob.x, player.y - mob.y);
      if (distance < bestDistance) { bestDistance = distance; target = player; }
    }
    if (!target) return;
    const dx = target.x - mob.x;
    const dy = target.y - mob.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (mob.ranged) {
      if (distance > mob.attackRange) {
        mob.x += (dx / distance) * mob.speed * dt;
        mob.y += (dy / distance) * mob.speed * dt;
      } else if (now >= mob.nextAttackAt) {
        mob.nextAttackAt = now + mob.attackInterval;
        this.emitFx(world.id, { type: 'tracer', from: { x: mob.x, y: mob.y }, to: { x: target.x, y: target.y }, color: mob.color });
        this.damagePlayer(target, mob.attackDamage, { sourceName: mob.name, world });
      }
    } else if (distance > mob.attackRange + PLAYER.radius) {
      mob.x += (dx / distance) * mob.speed * dt;
      mob.y += (dy / distance) * mob.speed * dt;
    } else if (now >= mob.nextAttackAt) {
      mob.nextAttackAt = now + mob.attackInterval;
      this.damagePlayer(target, mob.attackDamage, { sourceName: mob.name, world });
    }

    if (mob.isBoss && now >= mob.nextSpecialAt) {
      mob.nextSpecialAt = now + 5200;
      const radius = 190;
      this.emitFx(world.id, { type: 'slam', x: mob.x, y: mob.y, radius, color: mob.color });
      for (const player of this.playersIn(world.id)) {
        if (Math.hypot(player.x - mob.x, player.y - mob.y) <= radius) {
          this.damagePlayer(player, mob.attackDamage * 1.35, { sourceName: `${mob.name}'s shockwave`, world });
        }
      }
    }

    mob.x = clamp(mob.x, mob.radius, WORLD.width - mob.radius);
    mob.y = clamp(mob.y, mob.radius, WORLD.height - mob.radius);
  }

  updatePlayer(player, now, dt) {
    if (player.health <= 0) player.health = player.stats.maxHealth;
    let dx = Number(player.input.right) - Number(player.input.left);
    let dy = Number(player.input.down) - Number(player.input.up);
    const length = Math.hypot(dx, dy) || 1;
    if (dx || dy) {
      player.x = clamp(player.x + (dx / length) * player.stats.speed * dt, PLAYER.radius, WORLD.width - PLAYER.radius);
      player.y = clamp(player.y + (dy / length) * player.stats.speed * dt, PLAYER.radius, WORLD.height - PLAYER.radius);
    }
    player.orbitAngle = (player.orbitAngle + dt * 2.1) % (Math.PI * 2);
    player.profile.stats.playSeconds += dt;
    if (player.health < player.stats.maxHealth) {
      player.health = Math.min(player.stats.maxHealth, player.health + player.stats.regen * dt);
    }

    const world = WORLD_BY_ID.get(player.worldId);
    const equipped = equippedItems(player.profile);

    equipped.swords.forEach((item, index) => {
      const def = item.stats ?? {};
      const count = Math.max(1, equipped.swords.length);
      const angle = player.orbitAngle + (index / count) * Math.PI * 2;
      const bladeX = player.x + Math.cos(angle) * (def.orbitRadius || 42);
      const bladeY = player.y + Math.sin(angle) * (def.orbitRadius || 42);
      if (now < (player.swordCooldowns.get(item.id) ?? 0)) return;
      const mobHit = this.collideMob(world, bladeX, bladeY, 26);
      if (mobHit) {
        player.swordCooldowns.set(item.id, now + Math.max(140, (def.cooldown || 600) / player.stats.attackSpeedMul));
        const crit = Math.random() < player.stats.critChance;
        const damage = Math.round((def.damage || 10) * player.stats.damageMul * (crit ? 2 : 1));
        this.applyDamageToMob(mobHit, world, damage, player, crit, item.color);
        return;
      }
      if (world.pvp) {
        const target = this.collidePlayer(world, player, bladeX, bladeY, 24);
        if (target) {
          player.swordCooldowns.set(item.id, now + Math.max(140, (def.cooldown || 600) / player.stats.attackSpeedMul));
          const crit = Math.random() < player.stats.critChance;
          this.damagePlayer(target, (def.damage || 10) * player.stats.damageMul * (crit ? 2 : 1), {
            sourceName: player.name, sourcePlayer: player, world
          });
        }
      }
    });

    for (const item of equipped.muskets) {
      const def = item.stats ?? {};
      if (now < (player.musketCooldowns.get(item.id) ?? 0)) continue;
      const target = this.nearestTarget(player, def.range || 420, world.pvp);
      if (!target) continue;
      player.musketCooldowns.set(item.id, now + Math.max(220, (def.cooldown || 900) / player.stats.attackSpeedMul));
      const count = Math.max(1, def.projectileCount || 1);
      for (let i = 0; i < count; i += 1) {
        this.fireProjectile(player, item, def, target, (i - (count - 1) / 2) * 0.16);
      }
      this.emitFx(player.worldId, {
        type: 'muzzle', x: player.x, y: player.y, color: item.color || '#f8d77c'
      });
    }

    if (player.dirty && now - player.lastSaveAt > 4000) void this.savePlayer(player);
  }

  collideMob(world, x, y, radius) {
    for (const mob of world ? this.worlds.get(world.id)?.mobs.values() ?? [] : []) {
      if (Math.hypot(mob.x - x, mob.y - y) <= radius + mob.radius) return mob;
    }
    return null;
  }

  collidePlayer(world, source, x, y, radius) {
    const now = Date.now();
    for (const player of this.playersIn(world.id)) {
      if (player.id === source.id) continue;
      if (player.protectedUntil > now) continue;
      if (this.inSafeZone(world, player) || this.inSafeZone(world, source)) continue;
      if (Math.hypot(player.x - x, player.y - y) <= radius + PLAYER.radius) return player;
    }
    return null;
  }

  nearestTarget(player, range, includePlayers) {
    const world = WORLD_BY_ID.get(player.worldId);
    const state = this.worlds.get(player.worldId);
    let best = null;
    let bestDistance = range;
    for (const mob of state.mobs.values()) {
      const distance = Math.hypot(mob.x - player.x, mob.y - player.y);
      if (distance < bestDistance) { bestDistance = distance; best = { type: 'mob', mob }; }
    }
    if (includePlayers) {
      const now = Date.now();
      for (const other of this.playersIn(player.worldId)) {
        if (other.id === player.id || other.protectedUntil > now) continue;
        if (this.inSafeZone(world, other) || this.inSafeZone(world, player)) continue;
        const distance = Math.hypot(other.x - player.x, other.y - player.y);
        if (distance < bestDistance) { bestDistance = distance; best = { type: 'player', player: other }; }
      }
    }
    return best;
  }

  fireProjectile(player, item, def, target, spread) {
    const state = this.worlds.get(player.worldId);
    const projectile = {
      id: randomUUID(),
      worldId: player.worldId,
      ownerId: player.id,
      ownerName: player.name,
      targetId: target.type === 'mob' ? target.mob.id : target.player.id,
      targetType: target.type,
      x: player.x,
      y: player.y,
      damage: Math.round((def.damage || 10) * player.stats.damageMul),
      speed: def.projectileSpeed || 420,
      radius: 5,
      color: item.color || '#f8d77c',
      remaining: def.range || 420,
      pierce: def.pierce || 0,
      spread,
      hits: new Set()
    };
    state.projectiles.set(projectile.id, projectile);
  }

  updateProjectiles(state, now, dt) {
    const world = WORLD_BY_ID.get(state.id);
    for (const projectile of [...state.projectiles.values()]) {
      let target = null;
      if (projectile.targetType === 'mob') target = state.mobs.get(projectile.targetId);
      else target = this.players.get(projectile.targetId);
      if (!target || target.health <= 0) {
        const next = this.findRetarget(state, world, projectile);
        if (!next) { state.projectiles.delete(projectile.id); continue; }
        projectile.targetId = next.id;
        projectile.targetType = next.type;
        target = next.type === 'mob' ? next.mob : next.player;
      }
      const aimX = target.x + Math.cos(this.orbitSeed(projectile)) * Math.abs(projectile.spread) * 160;
      const aimY = target.y + Math.sin(this.orbitSeed(projectile)) * Math.abs(projectile.spread) * 160;
      const dx = aimX - projectile.x;
      const dy = aimY - projectile.y;
      const distance = Math.hypot(dx, dy) || 1;
      const step = projectile.speed * dt;
      projectile.x += (dx / distance) * step;
      projectile.y += (dy / distance) * step;
      projectile.remaining -= step;

      let hit = null;
      for (const mob of state.mobs.values()) {
        if (Math.hypot(mob.x - projectile.x, mob.y - projectile.y) <= projectile.radius + mob.radius) { hit = { type: 'mob', mob }; break; }
      }
      if (!hit && world.pvp) {
        const now2 = Date.now();
        for (const player of this.playersIn(state.id)) {
          if (player.id === projectile.ownerId || player.protectedUntil > now2) continue;
          if (this.inSafeZone(world, player)) continue;
          if (Math.hypot(player.x - projectile.x, player.y - projectile.y) <= projectile.radius + PLAYER.radius) {
            hit = { type: 'player', player }; break;
          }
        }
      }

      if (hit) {
        const owner = this.players.get(projectile.ownerId);
        if (hit.type === 'mob') {
          this.applyDamageToMob(hit.mob, world, projectile.damage, owner, false, projectile.color);
          if (projectile.pierce > 0) {
            projectile.pierce -= 1;
            projectile.hits.add(hit.mob.id);
            const next = this.findRetarget(state, world, projectile);
            if (next) { projectile.targetId = next.id; projectile.targetType = next.type; }
            else state.projectiles.delete(projectile.id);
          } else state.projectiles.delete(projectile.id);
        } else {
          if (owner) {
            this.damagePlayer(hit.player, projectile.damage, { sourceName: owner.name, sourcePlayer: owner, world });
          }
          state.projectiles.delete(projectile.id);
        }
        continue;
      }
      if (projectile.remaining <= 0) state.projectiles.delete(projectile.id);
    }
  }

  orbitSeed(projectile) {
    if (projectile.spreadSeed === undefined) projectile.spreadSeed = Math.random() * Math.PI * 2;
    return projectile.spreadSeed + (projectile.spread > 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  findRetarget(state, world, projectile) {
    let best = null;
    let bestDistance = 280;
    for (const mob of state.mobs.values()) {
      if (projectile.hits?.has(mob.id)) continue;
      const distance = Math.hypot(mob.x - projectile.x, mob.y - projectile.y);
      if (distance < bestDistance) { bestDistance = distance; best = { type: 'mob', id: mob.id, mob }; }
    }
    return best;
  }

  applyDamageToMob(mob, world, damage, player, crit, color) {
    if (!mob || !world) return;
    const amount = Math.max(1, Math.round(damage));
    mob.health -= amount;
    this.emitFx(world.id, {
      type: 'hit', x: mob.x, y: mob.y, amount, crit: Boolean(crit), color: color || (crit ? '#ffd166' : '#fff2c4')
    });
    if (mob.health <= 0) this.defeatMob(mob, world, player);
  }

  defeatMob(mob, world, player) {
    const state = this.worlds.get(world.id);
    if (!state || !state.mobs.has(mob.id)) return;
    state.mobs.delete(mob.id);
    if (!player) return;
    const stats = player.stats;
    const xpGain = Math.max(1, Math.round(mob.xpReward * stats.xpMul));
    const { levels } = this.gainXp(player, xpGain);
    const coins = 2 + tierOf(mob.rarity) * 3 + (mob.isBoss ? 40 : 0);
    player.profile.coins += coins;
    player.profile.stats.kills += 1;
    if (mob.isBoss) player.profile.stats.bossKills += 1;

    const drops = [];
    if (mob.isBoss) {
      for (let i = 0; i < 2; i += 1) drops.push(this.rollLoot(mob, player));
      state.nextBossAt = Date.now() + BOSS_RESPAWN_MS;
      this.io.to(roomFor(world.id)).emit('announce', {
        text: `☠ ${mob.name} has fallen — ${player.name} claims the kill`,
        rarity: mob.rarity
      });
    } else if (Math.random() < BASE_ITEM_DROP_CHANCE) {
      drops.push(this.rollLoot(mob, player));
    }

    for (const item of drops.filter(Boolean)) this.spawnDrop(state, mob, player, item);

    this.io.to(player.socketId).emit('mob-defeated', {
      name: mob.name, xp: xpGain, rarity: mob.rarity, isBoss: mob.isBoss, coins
    });
    if (levels > 0) this.io.to(player.socketId).emit('level-up', { level: player.profile.level, gained: levels });
    this.markDirty(player);
    this.emitProfile(player);
    this.broadcastWorld(world.id);
  }

  gainXp(player, amount) {
    const profile = player.profile;
    profile.xp += Math.max(0, Math.round(amount));
    let levels = 0;
    while (profile.xp >= xpNeeded(profile.level)) {
      profile.xp -= xpNeeded(profile.level);
      profile.level += 1;
      profile.points += 1;
      levels += 1;
    }
    if (levels > 0) this.updateStats(player);
    return { levels };
  }

  rollLoot(mob, player) {
    const entry = pickWeighted(mob.lootTable);
    if (!entry) return null;
    const name = resolveLootEntry(entry);
    if (!name) return null;
    const rarity = rollRarity(player.stats.lootLuck);
    return createItem({ name, rarity });
  }

  spawnDrop(state, mob, player, item) {
    const now = Date.now();
    const drop = {
      id: randomUUID(),
      x: clamp(mob.x + (Math.random() - 0.5) * 36, 40, WORLD.width - 40),
      y: clamp(mob.y + (Math.random() - 0.5) * 36, 40, WORLD.height - 40),
      item,
      ownerId: player.id,
      ownerUntil: now + OWNER_LOOT_WINDOW_MS,
      createdAt: now
    };
    state.drops.set(drop.id, drop);
    this.emitFx(state.id, { type: 'drop', x: drop.x, y: drop.y, color: RARITY_COLORS[item.rarity] || '#fff' });
  }

  updateDrops(state, world, now, dt = 0) {
    for (const drop of [...state.drops.values()]) {
      if (now - drop.createdAt > DROP_DESPAWN_MS) { state.drops.delete(drop.id); continue; }
      if (now - drop.createdAt < DROP_PICKUP_DELAY_MS) continue;
      for (const player of this.playersIn(world.id)) {
        if (drop.ownerId && now < drop.ownerUntil && player.id !== drop.ownerId) continue;
        const distance = Math.hypot(player.x - drop.x, player.y - drop.y);
        if (distance > DROP_PICKUP_RADIUS) {
          // Nearby loot drifts toward its rightful collector, then is picked up by proximity.
          if (distance < 175) {
            const pull = Math.min(distance - DROP_PICKUP_RADIUS, 260 * dt);
            drop.x += ((player.x - drop.x) / distance) * pull;
            drop.y += ((player.y - drop.y) / distance) * pull;
          }
          continue;
        }
        if (player.profile.inventory.length >= player.stats.inventoryCapacity) {
          if (now - player.lastFullWarningAt > 4000) {
            player.lastFullWarningAt = now;
            this.io.to(player.socketId).emit('error', { message: 'Inventory full — equip less or upgrade Pack Mule.' });
          }
          continue;
        }
        state.drops.delete(drop.id);
        player.profile.inventory.push(drop.item);
        addToCollection(player.profile, drop.item);
        player.profile.stats.drops += 1;
        this.io.to(player.socketId).emit('loot', { item: drop.item });
        this.emitFx(world.id, { type: 'pickup', x: drop.x, y: drop.y, color: RARITY_COLORS[drop.item.rarity] || '#fff' });
        this.emitProfile(player);
        this.markDirty(player);
        break;
      }
    }
  }

  async damagePlayer(player, rawDamage, meta) {
    const now = Date.now();
    if (!player || player.health <= 0) return;
    if (now < player.protectedUntil) return;
    const world = meta.world;
    if (meta.sourcePlayer) {
      if (!world.pvp || meta.sourcePlayer.id === player.id) return;
      if (this.inSafeZone(world, player) || this.inSafeZone(world, meta.sourcePlayer)) return;
    }
    const damage = Math.max(1, Math.round(rawDamage * (1 - player.stats.damageReduction)));
    player.health -= damage;
    this.emitFx(player.worldId, {
      type: 'hit', x: player.x, y: player.y, amount: damage, crit: false, color: '#ff8b7a', player: true
    });
    if (meta.sourcePlayer) {
      this.io.to(player.socketId).emit('combat', { text: `${meta.sourceName} hits you for ${damage}`, type: 'pvp' });
    }
    if (player.health <= 0) await this.handlePlayerDeath(player, meta.sourcePlayer, meta.sourceName);
  }

  inSafeZone(world, player) {
    return Math.hypot(player.x - world.spawn.x, player.y - world.spawn.y) < SAFE_ZONE_RADIUS;
  }

  async handlePlayerDeath(player, killer, sourceName) {
    const profile = player.profile;
    profile.stats.deaths += 1;
    let lostXp = 0;
    if (killer && killer.id !== player.id) {
      lostXp = Math.floor(profile.xp * 0.1);
      profile.xp -= lostXp;
      killer.profile.stats.pvpKills += 1;
      killer.profile.coins += 25;
      this.gainXp(killer, 30);
      this.emitProfile(killer);
      this.markDirty(killer);
    }
    const world = WORLD_BY_ID.get(player.worldId);
    player.health = player.stats.maxHealth;
    player.x = world.spawn.x;
    player.y = world.spawn.y;
    player.protectedUntil = Date.now() + SPAWN_PROTECTION_MS;
    this.io.to(player.socketId).emit('death', {
      by: killer?.name || sourceName || 'the battlefield',
      lostXp,
      message: lostXp ? `Defeated by ${sourceName}. You lost ${lostXp} XP.` : `Defeated by ${sourceName}. You respawn at camp.`
    });
    this.emitProfile(player);
    this.broadcastWorld(player.worldId);
    await this.savePlayer(player);
  }

  emitFx(worldId, payload) {
    this.io.to(roomFor(worldId)).emit('fx', { ...payload, at: Date.now() });
  }

  publicPlayer(player) {
    const equipped = equippedItems(player.profile);
    const clan = this.clanFor(player);
    return {
      id: player.id,
      name: player.name ?? player.profile.name,
      x: Math.round(player.x),
      y: Math.round(player.y),
      health: Math.round(player.health),
      maxHealth: player.stats.maxHealth,
      level: player.profile.level,
      faction: player.profile.faction,
      clanTag: clan?.tag ?? null,
      appearance: buildAppearance(player.profile),
      swords: equipped.swords.map((item) => ({
        name: item.name, color: item.color || '#e8dcc0', rarity: item.rarity,
        bladeCount: item.stats?.bladeCount || 1, orbitRadius: item.stats?.orbitRadius || 42
      })),
      muskets: equipped.muskets.map((item) => ({ name: item.name, color: item.color || '#d7bb72' })),
      orbitAngle: player.orbitAngle,
      protected: player.protectedUntil > Date.now(),
      pvp: WORLD_BY_ID.get(player.worldId)?.pvp ?? false,
      appearanceSet: buildAppearance(player.profile).set
    };
  }

  buildProfile(player) {
    this.updateStats(player);
    const profile = player.profile;
    const clan = this.clanFor(player);
    return {
      id: player.id,
      name: profile.name,
      level: profile.level,
      xp: profile.xp,
      xpNeeded: xpNeeded(profile.level),
      points: profile.points,
      coins: profile.coins,
      upgrades: profile.upgrades,
      faction: profile.faction,
      worldId: player.worldId,
      health: Math.round(player.health),
      maxHealth: player.stats.maxHealth,
      stats: player.stats,
      capacity: player.stats.inventoryCapacity,
      inventory: profile.inventory,
      equipment: profile.equipment,
      appearance: buildAppearance(profile),
      collection: collectionSummary(profile),
      craftingHistory: profile.craftingHistory.slice(-10),
      accountStats: profile.stats,
      clan: clan ? this.publicClan(clan) : null,
      clanId: profile.clanId ?? null
    };
  }

  emitProfile(player) {
    this.io.to(player.socketId).emit('profile', this.buildProfile(player));
    this.broadcastWorld(player.worldId);
  }

  publicPlayerList(worldId) {
    return this.playersIn(worldId).map((player) => this.publicPlayer(player));
  }

  broadcastWorld(worldId) {
    if (!this.worldHasPlayers(worldId)) return;
    const state = this.worlds.get(worldId);
    if (!state) return;
    this.io.to(roomFor(worldId)).emit('state', {
      worldId,
      serverTime: Date.now(),
      players: this.publicPlayerList(worldId),
      mobs: [...state.mobs.values()].map((mob) => ({
        id: mob.id, name: mob.name, x: Math.round(mob.x), y: Math.round(mob.y),
        health: Math.round(mob.health), maxHealth: mob.maxHealth, radius: mob.radius,
        rarity: mob.rarity, color: mob.color, isBoss: mob.isBoss, ranged: mob.ranged
      })),
      projectiles: [...state.projectiles.values()].map((projectile) => ({
        id: projectile.id, x: Math.round(projectile.x), y: Math.round(projectile.y),
        color: projectile.color, radius: projectile.radius
      })),
      drops: [...state.drops.values()].map((drop) => ({
        id: drop.id, x: Math.round(drop.x), y: Math.round(drop.y),
        item: { name: drop.item.name, rarity: drop.item.rarity, category: drop.item.category, icon: drop.item.icon, color: drop.item.color }
      }))
    });
  }

  async travel(socket, worldId) {
    const player = this.players.get(socket.data.accountId);
    if (!player || player.socketId !== socket.id) return this.fail(socket, 'Player not ready.');
    const now = Date.now();
    if (now - player.lastTravelAt < 1200) return;
    const world = WORLD_BY_ID.get(String(worldId));
    if (!world) return this.fail(socket, 'Unknown world.');
    if (player.profile.level < world.level) return this.fail(socket, `${world.name} requires level ${world.level}.`);
    player.lastTravelAt = now;
    const oldWorld = player.worldId;
    socket.leave(roomFor(oldWorld));
    player.worldId = world.id;
    player.x = world.spawn.x + (Math.random() - 0.5) * 80;
    player.y = world.spawn.y + (Math.random() - 0.5) * 80;
    player.health = player.stats.maxHealth;
    player.protectedUntil = now + SPAWN_PROTECTION_MS;
    player.swordCooldowns.clear();
    player.musketCooldowns.clear();
    socket.join(roomFor(world.id));
    this.ensurePopulation(world, true);
    this.broadcastWorld(oldWorld);
    this.broadcastWorld(world.id);
    socket.emit('world-changed', { world: worldSummary(world), player: this.publicPlayer(player) });
    this.emitProfile(player);
    await this.savePlayer(player);
    this.emitFx(world.id, { type: 'portal', x: player.x, y: player.y, color: world.accent });
  }

  usePortal(socket) {
    const player = this.players.get(socket.data.accountId);
    if (!player || player.socketId !== socket.id) return;
    const world = WORLD_BY_ID.get(player.worldId);
    let chosen = null;
    for (const portal of world.portals) {
      if (Math.hypot(player.x - portal.x, player.y - portal.y) <= 90) { chosen = portal; break; }
    }
    if (!chosen) return this.fail(socket, 'Move closer to a portal.');
    void this.travel(socket, chosen.to);
  }

  equip(socket, itemId) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    const item = findItem(player.profile, itemId);
    if (!item) return this.fail(socket, 'Item not found.');
    const equipment = player.profile.equipment;
    if (item.category === 'sword') {
      if (equipment.swords.includes(item.id)) return this.fail(socket, 'Already equipped.');
      if (equipment.swords.length >= SWORD_SLOTS) return this.fail(socket, `All ${SWORD_SLOTS} sword slots are used.`);
      equipment.swords.push(item.id);
    } else if (item.category === 'musket') {
      if (equipment.muskets.includes(item.id)) return this.fail(socket, 'Already equipped.');
      if (equipment.muskets.length >= MUSKET_SLOTS) return this.fail(socket, `All ${MUSKET_SLOTS} musket slots are used.`);
      equipment.muskets.push(item.id);
    } else if (item.category === 'armor') {
      equipment.armor[item.slot] = item.id;
    } else if (item.category === 'cosmetic') {
      equipment.cosmetic = item.id;
    } else {
      return this.fail(socket, 'Materials cannot be equipped.');
    }
    this.updateStats(player);
    this.emitProfile(player);
    this.markDirty(player);
    this.emitFx(player.worldId, { type: 'equip', x: player.x, y: player.y, color: RARITY_COLORS[item.rarity] });
  }

  unequip(socket, itemId) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    const equipment = player.profile.equipment;
    let removed = false;
    equipment.swords = equipment.swords.filter((id) => {
      if (id === itemId) { removed = true; return false; }
      return true;
    });
    equipment.muskets = equipment.muskets.filter((id) => {
      if (id === itemId) { removed = true; return false; }
      return true;
    });
    for (const [slot, id] of Object.entries(equipment.armor)) {
      if (id === itemId) { delete equipment.armor[slot]; removed = true; }
    }
    if (equipment.cosmetic === itemId) { equipment.cosmetic = null; removed = true; }
    if (!removed) return this.fail(socket, 'That item is not equipped.');
    this.updateStats(player);
    this.emitProfile(player);
    this.markDirty(player);
  }

  upgrade(socket, key) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    const def = UPGRADES[key];
    if (!def) return this.fail(socket, 'Unknown upgrade.');
    const current = Math.max(0, Number(player.profile.upgrades[key]) || 0);
    if (current >= def.max) return this.fail(socket, `${def.name} is at maximum rank.`);
    const cost = upgradeCost(current);
    if (player.profile.points < cost) return this.fail(socket, `Need ${cost} upgrade point${cost === 1 ? '' : 's'}.`);
    player.profile.points -= cost;
    player.profile.upgrades[key] = current + 1;
    this.updateStats(player);
    this.emitProfile(player);
    this.markDirty(player);
    this.io.to(player.socketId).emit('upgraded', { key, level: current + 1 });
  }

  craft(socket, itemIds) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    const now = Date.now();
    if (now - player.lastCraftAt < 600) return;
    const ids = Array.isArray(itemIds) ? [...new Set(itemIds.filter((id) => typeof id === 'string'))] : [];
    if (ids.length !== 3) return this.fail(socket, 'Select exactly three items.');
    const items = ids.map((id) => findItem(player.profile, id));
    if (items.some((item) => !item)) return this.fail(socket, 'One of those items no longer exists.');
    if (items.some((item) => !['sword', 'musket', 'armor'].includes(item.category))) {
      return this.fail(socket, 'Only swords, muskets and armor can be crafted.');
    }
    const rarities = new Set(items.map((item) => item.rarity));
    if (rarities.size !== 1) return this.fail(socket, 'All three items must share one rarity.');
    const counts = {};
    for (const item of items) counts[item.category] = (counts[item.category] ?? 0) + 1;
    const best = Math.max(...Object.values(counts));
    const category = Object.keys(counts).filter((key) => counts[key] === best)[Math.floor(Math.random() * Object.keys(counts).filter((key) => counts[key] === best).length)];
    const rarity = items[0].rarity;
    const target = nextRarity(rarity);
    if (!target) return this.fail(socket, 'Celestial is the highest rarity.');
    const equipped = player.profile.equipment;
    const equippedIds = new Set([...equipped.swords, ...equipped.muskets, ...Object.values(equipped.armor), equipped.cosmetic]);
    if (ids.some((id) => equippedIds.has(id))) return this.fail(socket, 'Unequip those items first.');
    const cost = craftCoinCost(rarity);
    if (player.profile.coins < cost) return this.fail(socket, `Crafting needs ${cost} coins.`);
    if (player.profile.inventory.length - 3 + 1 > player.stats.inventoryCapacity && player.profile.inventory.length - 3 + 1 > 0) {
      return this.fail(socket, 'Make room in your inventory first.');
    }
    player.lastCraftAt = now;
    player.profile.coins -= cost;
    player.profile.inventory = player.profile.inventory.filter((item) => !ids.includes(item.id));
    player.profile.stats.crafts += 1;
    const chance = CRAFT_RATES[rarity] ?? 0;
    const success = Math.random() < chance;
    let crafted = null;
    if (success) {
      crafted = randomItemForCategory(category, target);
      player.profile.inventory.push(crafted);
      addToCollection(player.profile, crafted);
      player.profile.stats.crafted += 1;
    }
    player.profile.craftingHistory.push({
      at: new Date().toISOString(), category, from: rarity, to: target, success, chance, cost
    });
    player.profile.craftingHistory = player.profile.craftingHistory.slice(-20);
    this.updateStats(player);
    this.io.to(player.socketId).emit('craft-result', {
      success, chance, from: rarity, to: target, cost, item: crafted, category
    });
    this.emitProfile(player);
    this.markDirty(player);
    void this.savePlayer(player);
  }

  setFaction(socket, factionId) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    if (!FACTIONS_BY_ID.has(factionId)) return this.fail(socket, 'Unknown faction.');
    player.profile.faction = factionId;
    this.emitProfile(player);
    this.markDirty(player);
  }

  rename(socket, name) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    const clean = cleanName(name);
    if (clean.length < 3) return this.fail(socket, 'Name needs at least 3 characters.');
    player.profile.name = clean;
    const clan = this.clanFor(player);
    if (clan) {
      const member = clan.members.find((entry) => entry.accountId === player.id);
      if (member) member.name = clean;
      void this.store.saveClan(clan);
      this.emitClan(clan);
    }
    this.emitProfile(player);
    this.broadcastWorld(player.worldId);
    this.markDirty(player);
  }

  // ---- Clans -------------------------------------------------------------

  clanFor(player) {
    return player.profile.clanId ? this.store.getClan(player.profile.clanId) : null;
  }

  clampText(value, max) {
    return cleanText(value, max);
  }

  publicClan(clan) {
    if (!clan) return null;
    const online = new Set(
      [...this.players.values()].filter((player) => player.profile.clanId === clan.id).map((player) => player.id)
    );
    const members = clan.members.map((member) => {
      const account = this.store.accounts.get(member.accountId);
      const onlinePlayer = this.players.get(member.accountId);
      return {
        accountId: member.accountId,
        name: member.name,
        role: member.role,
        joinedAt: member.joinedAt,
        online: online.has(member.accountId),
        level: onlinePlayer?.profile.level ?? account?.profile.level ?? 1
      };
    });
    return {
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      color: clan.color,
      description: clan.description,
      leaderId: clan.leaderId,
      members,
      maxMembers: MAX_CLAN_MEMBERS,
      chat: (clan.chat ?? []).slice(-40),
      score: this.clanScore(clan)
    };
  }

  clanScore(clan) {
    return clan.members.reduce((sum, member) => {
      const account = this.store.accounts.get(member.accountId);
      const profile = this.players.get(member.accountId)?.profile ?? account?.profile;
      return sum + (profile ? profile.level * 10000 + profile.xp : 0);
    }, 0);
  }

  clanListPayload() {
    const clans = this.store
      .allClans()
      .map((clan) => ({
        id: clan.id, name: clan.name, tag: clan.tag, color: clan.color,
        description: clan.description, members: clan.members.length,
        maxMembers: MAX_CLAN_MEMBERS, score: this.clanScore(clan), leader: clan.members.find((m) => m.role === 'Leader')?.name ?? 'Unknown'
      }))
      .sort((a, b) => b.score - a.score);
    return { clans, maxMembers: MAX_CLAN_MEMBERS, cost: CLAN_CREATE_COST };
  }

  emitClan(clan) {
    if (!clan) return;
    for (const player of this.players.values()) {
      if (player.profile.clanId === clan.id) this.emitProfile(player);
    }
  }

  async createClan(socket, payload) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    if (player.profile.clanId) return this.fail(socket, 'Leave your current clan first.');
    if (player.profile.coins < CLAN_CREATE_COST) return this.fail(socket, `Founding a clan costs ${CLAN_CREATE_COST} coins.`);
    const name = this.clampText(payload?.name, 20);
    const tag = this.clampText(payload?.tag, 5).toUpperCase().replace(/\s/g, '');
    if (name.length < 3) return this.fail(socket, 'Clan name needs at least 3 characters.');
    if (tag.length < 2) return this.fail(socket, 'Clan tag needs at least 2 characters.');
    if (this.store.findClanByTag(tag)) return this.fail(socket, 'That clan tag is taken.');
    const color = /^#[0-9a-fA-F]{6}$/.test(payload?.color ?? '') ? payload.color : '#d7b94e';
    const description = this.clampText(payload?.description, 120);
    const clan = {
      id: randomUUID(),
      name,
      tag,
      color,
      description,
      leaderId: player.id,
      createdAt: new Date().toISOString(),
      members: [{ accountId: player.id, name: player.profile.name, role: 'Leader', joinedAt: new Date().toISOString() }],
      chat: []
    };
    player.profile.coins -= CLAN_CREATE_COST;
    player.profile.clanId = clan.id;
    await this.store.saveClan(clan);
    this.emitProfile(player);
    this.emitClan(clan);
    this.markDirty(player);
    void this.savePlayer(player);
    this.broadcastWorld(player.worldId);
  }

  async joinClan(socket, payload) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    if (player.profile.clanId) return this.fail(socket, 'Leave your current clan first.');
    const clan = this.store.getClan(String(payload?.clanId ?? '')) ?? this.store.findClanByTag(String(payload?.tag ?? ''));
    if (!clan) return this.fail(socket, 'Clan not found.');
    if (clan.members.length >= MAX_CLAN_MEMBERS) return this.fail(socket, 'That clan is full.');
    if (clan.members.some((member) => member.accountId === player.id)) return this.fail(socket, 'Already a member.');
    clan.members.push({ accountId: player.id, name: player.profile.name, role: 'Member', joinedAt: new Date().toISOString() });
    player.profile.clanId = clan.id;
    await this.store.saveClan(clan);
    this.emitProfile(player);
    this.emitClan(clan);
    this.markDirty(player);
    void this.savePlayer(player);
    this.broadcastWorld(player.worldId);
  }

  async leaveClan(socket) {
    const player = this.players.get(socket.data.accountId);
    if (!player) return;
    const clan = this.clanFor(player);
    if (!clan) return this.fail(socket, 'You are not in a clan.');
    const wasLeader = clan.leaderId === player.id;
    clan.members = clan.members.filter((member) => member.accountId !== player.id);
    player.profile.clanId = null;
    if (wasLeader) {
      if (clan.members.length) {
        clan.members[0].role = 'Leader';
        clan.leaderId = clan.members[0].accountId;
      }
    }
    if (!clan.members.length) await this.store.deleteClan(clan.id);
    else await this.store.saveClan(clan);
    this.emitProfile(player);
    this.emitClan(clan);
    this.markDirty(player);
    void this.savePlayer(player);
    this.broadcastWorld(player.worldId);
  }

  async setClanRole(socket, payload) {
    const player = this.players.get(socket.data.accountId);
    const clan = player && this.clanFor(player);
    if (!clan) return;
    if (clan.leaderId !== player.id) return this.fail(socket, 'Only the clan leader can change roles.');
    const accountId = String(payload?.accountId ?? '');
    const role = payload?.role === 'Officer' ? 'Officer' : 'Member';
    if (accountId === player.id) return this.fail(socket, 'The leader already commands the clan.');
    const member = clan.members.find((entry) => entry.accountId === accountId);
    if (!member) return this.fail(socket, 'Member not found.');
    member.role = role;
    await this.store.saveClan(clan);
    this.emitClan(clan);
  }

  async kickFromClan(socket, payload) {
    const player = this.players.get(socket.data.accountId);
    const clan = player && this.clanFor(player);
    if (!clan) return;
    const actor = clan.members.find((member) => member.accountId === player.id);
    if (!actor || (actor.role !== 'Leader' && actor.role !== 'Officer')) return this.fail(socket, 'Only leaders and officers can remove members.');
    const accountId = String(payload?.accountId ?? '');
    if (accountId === player.id) return this.fail(socket, 'Use Leave Clan instead.');
    const member = clan.members.find((entry) => entry.accountId === accountId);
    if (!member) return this.fail(socket, 'Member not found.');
    if (actor.role === 'Officer' && member.role !== 'Member') return this.fail(socket, 'Officers can only remove members.');
    clan.members = clan.members.filter((entry) => entry.accountId !== accountId);
    const account = this.store.accounts.get(accountId);
    if (account) {
      account.profile.clanId = null;
      await this.store.saveProfile(accountId, account.profile);
      const online = this.players.get(accountId);
      if (online) {
        online.profile.clanId = null;
        this.emitProfile(online);
      }
    }
    await this.store.saveClan(clan);
    this.emitClan(clan);
  }

  async updateClan(socket, payload) {
    const player = this.players.get(socket.data.accountId);
    const clan = player && this.clanFor(player);
    if (!clan) return;
    if (clan.leaderId !== player.id) return this.fail(socket, 'Only the clan leader can edit the clan.');
    const description = this.clampText(payload?.description, 120);
    if (description) clan.description = description;
    if (/^#[0-9a-fA-F]{6}$/.test(payload?.color ?? '')) clan.color = payload.color;
    await this.store.saveClan(clan);
    this.emitClan(clan);
  }

  async clanChat(socket, payload) {
    const player = this.players.get(socket.data.accountId);
    const clan = player && this.clanFor(player);
    if (!clan) return;
    const now = Date.now();
    if (now - player.lastChatAt < 700) return;
    const text = this.clampText(payload?.text, 200);
    if (!text) return;
    player.lastChatAt = now;
    clan.chat = [...(clan.chat ?? []), { at: new Date().toISOString(), name: player.profile.name, text }].slice(-50);
    await this.store.saveClan(clan);
    this.emitClan(clan);
  }

  sendClanList(socket) {
    socket.emit('clan-list', this.clanListPayload());
  }

  leaderboard(player) {
    const accounts = this.store.allAccounts();
    const online = new Set(this.players.keys());
    const tagFor = (profile) => (profile.clanId ? this.store.getClan(profile.clanId)?.tag ?? null : null);
    const scoreOf = (profile) => profile.level * 10000 + profile.xp;
    const players = accounts
      .map((account) => ({
        id: account.id,
        name: account.profile.name,
        level: account.profile.level,
        xp: account.profile.xp,
        faction: account.profile.faction,
        clanTag: tagFor(account.profile),
        score: scoreOf(account.profile),
        online: online.has(account.id)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
    const factionTotals = new Map(FACTIONS.map((faction) => [faction.id, { id: faction.id, name: faction.name, emblem: faction.emblem, color: faction.color, score: 0, members: 0 }]));
    for (const account of accounts) {
      const entry = factionTotals.get(account.profile.faction) ?? factionTotals.get('independent-ronin');
      if (!entry) continue;
      entry.score += scoreOf(account.profile);
      entry.members += 1;
    }
    const factions = [...factionTotals.values()].sort((a, b) => b.score - a.score);
    const clans = this.store.allClans().map((clan) => ({
      id: clan.id, name: clan.name, tag: clan.tag, color: clan.color,
      members: clan.members.length, score: this.clanScore(clan)
    })).sort((a, b) => b.score - a.score).slice(0, 20);
    const myRank = players.findIndex((entry) => entry.id === player?.id);
    return { players, factions, clans, myRank: myRank >= 0 ? myRank + 1 : null };
  }

  sendLeaderboard(socket) {
    const player = this.players.get(socket.data.accountId);
    socket.emit('leaderboard', this.leaderboard(player));
  }

  fail(socket, message) {
    socket.emit('error', { message });
  }

  start() {
    return setInterval(() => {
      try {
        this.tick();
      } catch (error) {
        console.error('Tick error:', error);
      }
    }, 1000 / TICK_RATE);
  }
}
