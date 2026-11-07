const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const mini = $('minimap');
const mctx = mini.getContext('2d');
const panelBody = $('panel-body');
const overlay = $('overlay');
const toastEl = $('toast');

const WORLD_W = 2400;
const WORLD_H = 1600;
const RARITY_ORDER = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra', 'Super', 'Unique', 'Divine', 'Celestial'];
const RARITY_FALLBACK = {
  Common: '#c9c7bc', Unusual: '#7bd17e', Rare: '#57a7ff', Epic: '#bc75e8',
  Legendary: '#f0b84c', Mythic: '#f27659', Ultra: '#ff5eae', Super: '#e64b58',
  Unique: '#f6f1c0', Divine: '#7ce9e0', Celestial: '#fff3a6'
};
const MOVEMENT_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

const DEFAULT_SETTINGS = { sfx: 0.55, music: false, effects: true };
const loadSettings = () => {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem('3m-settings') || '{}')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
};

const state = {
  socket: null,
  ready: false,
  me: null,
  profile: null,
  meta: null,
  world: null,
  worldId: null,
  worldState: { players: [], mobs: [], projectiles: [], drops: [] },
  clan: null,
  clanList: null,
  leaderboard: null,
  lbTab: 'players',
  panel: null,
  invFilter: 'all',
  collectionFilter: 'all',
  selectedItem: null,
  craftSelection: [],
  inGame: false,
  fx: [],
  camera: { x: 1000, y: 620 },
  lastHudAt: 0,
  lastMiniAt: 0,
  lastBossKey: '',
  lastPortalKey: '',
  toastTimer: 0,
  settings: loadSettings(),
  keys: new Set()
};

window.__musketters = state;
window.addEventListener('error', (event) => { state.lastError = { message: event.message, stack: event.error?.stack }; });
window.addEventListener('unhandledrejection', (event) => { state.lastError = { message: String(event.reason), stack: event.reason?.stack }; });

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const colorOf = (rarity) => state.meta?.rarities?.colors?.[rarity] ?? RARITY_FALLBACK[rarity] ?? '#c9c7bc';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fmt = (value) => Number(value ?? 0).toLocaleString('en-US');

// ---------------------------------------------------------------- Audio ----
const audio = {
  ctx: null,
  music: null,
  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  },
  tone(freq, duration, type = 'sine', volume = 0.2, slide = 0) {
    const context = this.ensure();
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, context.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), context.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + duration + 0.02);
  },
  play(kind) {
    const volume = Number(state.settings.sfx) || 0;
    if (volume <= 0) return;
    if (kind === 'hit') this.tone(190, 0.09, 'square', 0.1 * volume, 120);
    else if (kind === 'shot') this.tone(220, 0.13, 'sawtooth', 0.11 * volume, 70);
    else if (kind === 'pickup') { this.tone(660, 0.08, 'triangle', 0.12 * volume, 880); setTimeout(() => this.tone(990, 0.09, 'triangle', 0.1 * volume), 60); }
    else if (kind === 'level') { this.tone(523, 0.12, 'sine', 0.16 * volume); setTimeout(() => this.tone(659, 0.12, 'sine', 0.16 * volume), 110); setTimeout(() => this.tone(784, 0.2, 'sine', 0.16 * volume), 220); }
    else if (kind === 'craft') { this.tone(300, 0.14, 'triangle', 0.12 * volume, 480); setTimeout(() => this.tone(720, 0.16, 'triangle', 0.1 * volume), 120); }
    else if (kind === 'death') this.tone(160, 0.4, 'sine', 0.16 * volume, 60);
    else if (kind === 'portal') this.tone(420, 0.3, 'sine', 0.1 * volume, 840);
    else if (kind === 'click') this.tone(520, 0.05, 'square', 0.04 * volume);
  },
  startMusic() {
    if (this.music || !state.settings.music) return;
    const context = this.ensure();
    if (!context) return;
    const master = context.createGain();
    master.gain.value = 0.025;
    const first = context.createOscillator();
    const second = context.createOscillator();
    first.type = 'sine'; first.frequency.value = 82.4;
    second.type = 'sine'; second.frequency.value = 123.5;
    const wobble = context.createOscillator();
    wobble.frequency.value = 0.08;
    const wobbleGain = context.createGain();
    wobbleGain.gain.value = 1.6;
    wobble.connect(wobbleGain).connect(first.frequency);
    first.connect(master);
    second.connect(master);
    master.connect(context.destination);
    first.start(); second.start(); wobble.start();
    this.music = { master, nodes: [first, second, wobble] };
  },
  stopMusic() {
    if (!this.music) return;
    const { master, nodes } = this.music;
    try {
      master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
      nodes.forEach((node) => node.stop(this.ctx.currentTime + 0.6));
    } catch { /* already stopped */ }
    this.music = null;
  },
  apply() {
    if (state.settings.music) this.startMusic();
    else this.stopMusic();
  }
};

// --------------------------------------------------------------- Toasts ----
function notify(message, rarity = null) {
  toastEl.textContent = message;
  toastEl.style.borderColor = rarity ? colorOf(rarity) : '';
  toastEl.style.color = rarity ? colorOf(rarity) : '';
  toastEl.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 3200);
}

// ---------------------------------------------------------------- Socket ---
function connect() {
  socketConnect();
}

function socketConnect() {
  const socket = io({
    auth: {
      token: localStorage.getItem('3m-token'),
      name: localStorage.getItem('3m-name') || ''
    }
  });
  state.socket = socket;

  socket.on('connect', () => {
    const pill = $('connection');
    pill.textContent = 'ONLINE · SHARED WORLD';
    pill.classList.add('online');
  });
  socket.on('disconnect', () => {
    const pill = $('connection');
    pill.textContent = 'RECONNECTING…';
    pill.classList.remove('online');
    state.ready = false;
    $('play-button').disabled = true;
  });
  socket.on('welcome', (data) => {
    state.profile = data.profile;
    state.meta = data.meta;
    state.world = data.world;
    state.worldId = data.profile.worldId;
    state.me = data.player;
    state.clan = data.clan;
    state.ready = true;
    if (data.token) localStorage.setItem('3m-token', data.token);
    localStorage.setItem('3m-name', data.profile.name);
    $('boot').classList.add('hidden');
    $('play-button').disabled = false;
    $('start-status').classList.remove('error');
    $('start-status').textContent = `Signed in as ${data.profile.name} · your progress saves to this device`;
    renderStartMenu();
    updateIdentity();
    renderHud();
  });
  socket.on('profile', (profile) => {
    state.profile = profile;
    state.clan = profile.clan;
    if (state.worldId !== profile.worldId) {
      state.worldId = profile.worldId;
      const summary = state.meta?.worlds.find((world) => world.id === profile.worldId);
      if (summary) state.world = summary;
    }
    renderHud();
    updateIdentity();
    refreshOpenPanel();
  });
  socket.on('state', (payload) => {
    state.worldState = payload;
    state.worldId = payload.worldId;
    state.me = payload.players.find((player) => player.id === state.profile?.id) ?? state.me;
    state.hudDirty = true;
  });
  socket.on('world-changed', (data) => {
    state.world = data.world;
    state.worldId = data.world.id;
    state.me = data.player;
    state.worldState = { players: [], mobs: [], projectiles: [], drops: [] };
    notify(`Entered ${data.world.name}${data.world.pvp ? ' · PvP enabled outside the safe zone' : ''}`, null);
    audio.play('portal');
    renderHud();
  });
  socket.on('fx', (event) => pushFx(event));
  socket.on('announce', (data) => notify(data.text, data.rarity));
  socket.on('mob-defeated', (data) => {
    notify(`${data.name} defeated · +${data.xp} XP · +${data.coins} coins`, data.rarity);
    audio.play('hit');
  });
  socket.on('loot', (data) => {
    notify(`Loot: ${data.item.rarity} ${data.item.name}`, data.item.rarity);
    audio.play('pickup');
  });
  socket.on('level-up', (data) => {
    notify(`LEVEL UP — level ${data.level} · +${data.gained ?? 1} upgrade point${(data.gained ?? 1) === 1 ? '' : 's'}`, 'Legendary');
    audio.play('level');
  });
  socket.on('combat', (data) => notify(data.text));
  socket.on('death', (data) => {
    notify(data.message, 'Mythic');
    audio.play('death');
  });
  socket.on('craft-result', (data) => {
    state.craftSelection = [];
    if (data.success) {
      notify(`Crafting succeeded — ${data.to} ${data.item?.name ?? 'item'} (${Math.round(data.chance * 100)}%)`, data.to);
      audio.play('level');
    } else {
      notify(`Crafting failed — the three items were consumed (${Math.round(data.chance * 100)}% chance)`, 'Mythic');
      audio.play('death');
    }
    renderPanel();
  });
  socket.on('upgraded', () => { audio.play('click'); renderPanel(); });
  socket.on('error', (data) => notify(data.message || 'Action failed', 'Mythic'));
  socket.on('clan-list', (data) => {
    state.clanList = data;
    if (state.panel === 'clans') renderPanel();
  });
  socket.on('leaderboard', (data) => {
    state.leaderboard = data;
    if (state.panel === 'leaderboard') renderPanel();
  });
}

// ---------------------------------------------------------------- HUD ------
const MENU_ITEMS = [
  { panel: 'worlds', label: 'PLAY', sub: 'Worlds & portals' },
  { panel: 'inventory', label: 'INVENTORY', sub: 'Equip your gear' },
  { panel: 'upgrades', label: 'UPGRADES', sub: 'Spend level points' },
  { panel: 'crafting', label: 'CRAFTING', sub: 'Risk for higher rarity' },
  { panel: 'clans', label: 'CLANS', sub: 'Banners & chat' },
  { panel: 'factions', label: 'FACTIONS', sub: 'Choose your banner' },
  { panel: 'leaderboard', label: 'LEADERBOARD', sub: 'Soldiers, factions, clans' },
  { panel: 'collection', label: 'COLLECTION', sub: 'Fill the encyclopedia' },
  { panel: 'settings', label: 'SETTINGS', sub: 'Name, sound, controls' }
];

const PANEL_TITLES = {
  menu: 'Field Menu',
  worlds: 'Worlds & Portals',
  inventory: 'Inventory & Equipment',
  upgrades: 'Upgrades',
  crafting: 'Crafting',
  clans: 'Clans',
  factions: 'Factions',
  leaderboard: 'Leaderboard',
  collection: 'Collection',
  settings: 'Settings'
};

function renderStartMenu() {
  if (!state.meta) return;
  $('start-menu').innerHTML = MENU_ITEMS.map((item) => `
    <button data-panel="${item.panel}">${item.label}<span>${item.sub}</span></button>
  `).join('');
}

function updateIdentity() {
  const profile = state.profile;
  if (!profile) return;
  const faction = state.meta?.factions.find((entry) => entry.id === profile.faction);
  $('start-name').textContent = profile.name;
  $('start-faction').textContent = faction?.name ?? 'Unaffiliated';
  $('start-level').textContent = `Lv ${profile.level}`;
  $('start-clan').textContent = profile.clan ? `[${profile.clan.tag}] ${profile.clan.name}` : 'NONE';
  $('start-name').style.color = '#f0eadb';
  $('start-faction').style.color = faction?.color ?? '#f0eadb';
}

function renderHud() {
  const profile = state.profile;
  if (!profile) return;
  const me = state.me;
  const health = me?.health ?? profile.health;
  const maxHealth = me?.maxHealth ?? profile.maxHealth;
  $('health-value').textContent = `${Math.max(0, Math.round(health))} / ${Math.round(maxHealth)}`;
  $('health-bar').style.width = `${clamp((health / Math.max(1, maxHealth)) * 100, 0, 100)}%`;
  $('level-value').textContent = profile.level;
  $('xp-value').textContent = `${profile.xp} / ${profile.xpNeeded}`;
  $('xp-bar').style.width = `${clamp((profile.xp / Math.max(1, profile.xpNeeded)) * 100, 0, 100)}%`;
  $('coins').textContent = `◈ ${fmt(profile.coins)}`;
  $('capacity').textContent = `${profile.inventory.length} / ${profile.capacity}`;
  $('points').textContent = `${profile.points} pt${profile.points === 1 ? '' : 's'}`;
  const world = state.meta?.worlds.find((entry) => entry.id === profile.worldId) ?? state.world;
  $('world-label').textContent = world ? `${world.name.toUpperCase()} · LV ${world.level}` : '—';
  const faction = state.meta?.factions.find((entry) => entry.id === profile.faction);
  const factionTag = $('hud-faction-tag');
  factionTag.textContent = faction ? `${faction.emblem} ${faction.name}` : '';
  factionTag.style.color = faction?.color ?? '';
  factionTag.classList.toggle('hidden', !faction);
  const clanTag = $('hud-clan-tag');
  clanTag.textContent = profile.clan ? `[${profile.clan.tag}] ${profile.clan.name}` : '';
  clanTag.classList.toggle('hidden', !profile.clan);
  $('pvp-tag').classList.toggle('hidden', !world?.pvp);

  const equipment = profile.equipment;
  const items = new Map(profile.inventory.map((item) => [item.id, item]));
  const swords = equipment.swords.map((id) => items.get(id)).filter(Boolean);
  const muskets = equipment.muskets.map((id) => items.get(id)).filter(Boolean);
  const armor = Object.values(equipment.armor).map((id) => items.get(id)).filter(Boolean);
  const cosmetic = items.get(equipment.cosmetic);
  const setCounts = {};
  for (const item of armor) if (item.setId) setCounts[item.setId] = (setCounts[item.setId] ?? 0) + 1;
  const activeSet = Object.entries(setCounts).sort((a, b) => b[1] - a[1])[0];
  const parts = [];
  if (swords.length) parts.push(`<b>⚔ ${swords.map((item) => esc(item.name)).join(' + ')}</b>`);
  if (muskets.length) parts.push(`<b>➶ ${muskets.map((item) => esc(item.name)).join(' + ')}</b>`);
  if (activeSet) parts.push(`${esc(activeSet[0])} ×${activeSet[1]}`);
  else if (armor.length) parts.push(`${armor.length} armor piece${armor.length === 1 ? '' : 's'}`);
  if (cosmetic) parts.push(esc(cosmetic.name));
  $('loadout').innerHTML = parts.join(' · ') || 'No weapons equipped';
}

// --------------------------------------------------------------- Panels ----
function openPanel(name) {
  if (!state.profile) return;
  state.panel = name;
  overlay.classList.remove('hidden');
  $('panel-title').textContent = PANEL_TITLES[name] ?? 'Panel';
  if (name === 'clans') {
    state.socket?.emit('clan-list');
  }
  if (name === 'leaderboard') {
    state.socket?.emit('leaderboard');
  }
  renderPanel();
}

function closePanel() {
  state.panel = null;
  overlay.classList.add('hidden');
}

function refreshOpenPanel() {
  if (!state.panel) return;
  const active = document.activeElement;
  if (active && panelBody.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
  // Keep a half-filled clan form intact when live combat updates arrive.
  if (state.panel === 'clans' && !state.profile.clan) {
    const drafting = ['clan-name', 'clan-tag', 'clan-description'].some((id) => ($(id)?.value ?? '').trim());
    if (drafting) return;
  }
  renderPanel();
}

function renderPanel() {
  if (!state.panel || !state.profile) return;
  if (state.panel === 'menu') renderMenuPanel();
  else if (state.panel === 'worlds') renderWorldsPanel();
  else if (state.panel === 'inventory') renderInventoryPanel();
  else if (state.panel === 'upgrades') renderUpgradesPanel();
  else if (state.panel === 'crafting') renderCraftingPanel();
  else if (state.panel === 'clans') renderClansPanel();
  else if (state.panel === 'factions') renderFactionsPanel();
  else if (state.panel === 'leaderboard') renderLeaderboardPanel();
  else if (state.panel === 'collection') renderCollectionPanel();
  else if (state.panel === 'settings') renderSettingsPanel();
  bindPanelInputs();
}

function renderMenuPanel() {
  const profile = state.profile;
  panelBody.innerHTML = `
    <div class="section">
      <div class="row between">
        <div>
          <h3 style="margin:0">${esc(profile.name)}</h3>
          <p class="muted">Level ${profile.level} · ${fmt(profile.coins)} coins · ${profile.points} upgrade point${profile.points === 1 ? '' : 's'}</p>
        </div>
        <button class="primary" data-action="resume">RETURN TO BATTLE</button>
      </div>
    </div>
    <div class="section">
      <div class="menu-grid">
        ${MENU_ITEMS.map((item) => `<button data-panel="${item.panel}">${item.label}<span>${item.sub}</span></button>`).join('')}
      </div>
    </div>
    <div class="section row between">
      <span class="muted">Progress saves automatically to this device's soldier token.</span>
      <button class="danger-button" data-action="title">RETURN TO TITLE</button>
    </div>
  `;
}

function renderWorldsPanel() {
  const profile = state.profile;
  const worlds = state.meta.worlds;
  panelBody.innerHTML = `
    <p class="muted" style="margin-bottom:12px">Walk onto a glowing portal and press <b>E</b>, or deploy directly. Higher worlds demand a higher level.</p>
    <div class="faction-grid">
      ${worlds.map((world) => {
        const locked = profile.level < world.level;
        const current = profile.worldId === world.id;
        return `
          <div class="faction-card ${current ? 'active' : ''}" style="border-color:${world.accent}44">
            <div class="row between">
              <h4 style="color:${world.accent}">${esc(world.name)}</h4>
              <span class="tag ${current ? 'green' : ''}">${current ? 'HERE' : `LV ${world.level}`}</span>
            </div>
            <p>${esc(world.description)}</p>
            <div class="row" style="justify-content:space-between">
              <span class="muted" style="font-size:10px">Boss: ${esc(world.boss)}${world.pvp ? ' · PvP' : ''}</span>
              <button data-action="travel" data-world="${world.id}" ${locked || current ? 'disabled' : ''}>${locked ? `LOCKED · LV ${world.level}` : current ? 'DEPLOYED' : 'DEPLOY'}</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function itemById(id) {
  return state.profile?.inventory.find((item) => item.id === id) ?? null;
}

function isEquipped(item) {
  const equipment = state.profile.equipment;
  if (!equipment || !item) return false;
  return equipment.swords.includes(item.id)
    || equipment.muskets.includes(item.id)
    || Object.values(equipment.armor).includes(item.id)
    || equipment.cosmetic === item.id;
}

function itemCard(item, action = 'select-item', extra = '') {
  const color = colorOf(item.rarity);
  return `
    <button class="item-card ${isEquipped(item) ? 'equipped' : ''} ${extra}" style="border-left-color:${color}" data-action="${action}" data-id="${item.id}">
      <span class="item-icon">${esc(item.icon || '•')}</span>
      <span class="item-name" style="color:${color}">${esc(item.name)}</span>
      <span class="item-sub">${esc(item.rarity)} · ${esc(item.category)}${item.slot ? ` · ${esc(item.slot)}` : ''}</span>
    </button>
  `;
}

function statRows(item) {
  const stats = item.stats ?? {};
  const rows = [];
  if (item.category === 'sword' || item.category === 'musket') {
    rows.push(['Damage', stats.damage ?? '—']);
    if (item.category === 'sword') {
      rows.push(['Attack interval', `${stats.cooldown ?? 600} ms`]);
      rows.push(['Blades', stats.bladeCount ?? 1]);
    } else {
      rows.push(['Range', `${stats.range ?? 420}`]);
      rows.push(['Cooldown', `${stats.cooldown ?? 900} ms`]);
      rows.push(['Projectiles', stats.projectileCount ?? 1]);
      if (stats.pierce) rows.push(['Pierce', stats.pierce]);
    }
    if (stats.effect && stats.effect !== 'none') rows.push(['Effect', stats.effect]);
  } else if (item.category === 'armor') {
    rows.push(['Health', `+${stats.health ?? 0}`]);
    rows.push(['Damage reduction', `${Math.round((stats.dr ?? 0) * 1000) / 10}%`]);
    rows.push(['Move speed', `${stats.speed > 0 ? '+' : ''}${stats.speed ?? 0}`]);
    if (item.setName) rows.push(['Set', item.setName]);
  } else if (item.category === 'cosmetic') {
    rows.push(['Type', 'Cosmetic · no combat bonus']);
  } else {
    rows.push(['Type', 'Crafting material']);
  }
  return rows.map(([label, value]) => `<div><span>${esc(label)}</span><span>${esc(value)}</span></div>`).join('');
}

function renderInventoryPanel() {
  const profile = state.profile;
  const filters = [
    ['all', 'ALL'], ['sword', 'SWORDS'], ['musket', 'MUSKETS'], ['armor', 'ARMOR'], ['material', 'MATERIALS'], ['cosmetic', 'COSMETICS']
  ];
  const items = profile.inventory
    .filter((item) => state.invFilter === 'all' || item.category === state.invFilter)
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name));
  let selected = itemById(state.selectedItem);
  if (!selected || (state.invFilter !== 'all' && selected.category !== state.invFilter)) selected = items[0] ?? null;
  if (selected) state.selectedItem = selected.id;
  const equipment = profile.equipment;
  const armorCount = Object.keys(equipment.armor).length;
  panelBody.innerHTML = `
    <div class="row between section">
      <div class="grow">
        <div class="row between"><span class="muted">Capacity</span><span>${profile.inventory.length} / ${profile.capacity}</span></div>
        <div class="progress"><i style="width:${clamp(profile.inventory.length / profile.capacity * 100, 0, 100)}%"></i></div>
      </div>
      <span class="tag gold">⚔ ${equipment.swords.length} / ${state.meta.swordSlots}</span>
      <span class="tag gold">➶ ${equipment.muskets.length} / ${state.meta.musketSlots}</span>
      <span class="tag">🛡 ${armorCount} armor</span>
    </div>
    <div class="filter-row">${filters.map(([key, label]) => `<button data-action="filter" data-filter="${key}" class="${state.invFilter === key ? 'active' : ''}">${label}</button>`).join('')}</div>
    <div class="inventory-layout">
      <div class="item-grid">
        ${items.length ? items.map((item) => itemCard(item)).join('') : '<div class="panel-empty">Nothing in this category yet. Defeat soldiers and collect their drops.</div>'}
      </div>
      <div>
        ${selected ? itemDetail(selected) : '<div class="panel-empty">Select an item to inspect it.</div>'}
      </div>
    </div>
    <p class="fineprint">Armor slots: helmet, cuirass, greaves, boots, cape. Three pieces of the same set grant a set bonus; five double it. Cosmetics never add combat stats.</p>
  `;
}

function itemDetail(item) {
  const equipped = isEquipped(item);
  const color = colorOf(item.rarity);
  const stats = statRows(item);
  const canEquip = ['sword', 'musket', 'armor', 'cosmetic'].includes(item.category);
  return `
    <div class="item-detail" style="border-color:${color}66">
      <div class="row"><span class="big-icon">${esc(item.icon || '•')}</span><span class="tag" style="background:${color}22;color:${color}">${esc(item.rarity)}</span></div>
      <h3 style="color:${color}">${esc(item.name)}</h3>
      <p class="muted">${esc(item.description || item.category)}</p>
      <div class="detail-stats">${stats}</div>
      ${equipped ? `<button data-action="unequip" data-id="${item.id}">UNEQUIP</button>` : canEquip ? `<button class="primary" data-action="equip" data-id="${item.id}">EQUIP</button>` : '<p class="fineprint">Materials are used in crafting.</p>'}
    </div>
  `;
}

function renderUpgradesPanel() {
  const profile = state.profile;
  const definitions = state.meta.upgrades;
  panelBody.innerHTML = `
    <div class="row between section">
      <p class="muted">Every level grants one upgrade point. Ranks cost more as they climb.</p>
      <span class="tag gold">${profile.points} point${profile.points === 1 ? '' : 's'} available</span>
    </div>
    <div class="upgrade-grid">
      ${definitions.map((def) => {
        const level = profile.upgrades[def.key] ?? 0;
        const cost = 1 + Math.floor(level / 3);
        const maxed = level >= def.max;
        const pips = Array.from({ length: def.max }, (_, index) => `<i class="pip ${index < level ? 'on' : ''}"></i>`).join('');
        return `
          <div class="upgrade-card">
            <div class="row between"><h4>${def.icon} ${esc(def.name)}</h4><span class="tag">${level} / ${def.max}</span></div>
            <p>${esc(def.description)}</p>
            <div class="pips">${pips}</div>
            <footer>
              <span class="muted" style="font-size:10px">+${def.perLevel}${def.unit.includes('%') || def.unit.includes('health /') ? ' ' : ' '}${esc(def.unit)} each</span>
              <button data-action="upgrade" data-key="${def.key}" ${maxed || profile.points < cost ? 'disabled' : ''}>${maxed ? 'MAXED' : `RANK UP · ${cost} pt`}</button>
            </footer>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function craftSelectionState() {
  const profile = state.profile;
  const validIds = new Set(profile.inventory.map((item) => item.id));
  state.craftSelection = state.craftSelection.filter((id) => validIds.has(id)).slice(0, 3);
  const selected = state.craftSelection.map((id) => itemById(id)).filter(Boolean);
  const equipped = new Set([
    ...profile.equipment.swords, ...profile.equipment.muskets,
    ...Object.values(profile.equipment.armor), profile.equipment.cosmetic
  ]);
  const sameRarity = selected.every((item) => item.rarity === selected[0].rarity);
  const rarity = selected[0]?.rarity;
  const counts = {};
  for (const item of selected) counts[item.category] = (counts[item.category] ?? 0) + 1;
  const best = Math.max(0, ...Object.values(counts));
  const topCategories = Object.keys(counts).filter((key) => counts[key] === best);
  const category = topCategories[0] ?? selected[0]?.category;
  const categoryLabel = topCategories.join(' / ');
  const target = rarity ? RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1] ?? null : null;
  const rate = rarity ? state.meta.craftRates[rarity] ?? 0 : 0;
  const cost = rarity ? state.meta.craftCoinCosts[rarity] ?? 0 : 0;
  const eligible = selected.every((item) => ['sword', 'musket', 'armor'].includes(item.category));
  const equippedPicked = selected.some((item) => equipped.has(item.id));
  let message = 'Pick any three swords, muskets or armor of the same rarity.';
  if (selected.length === 3) {
    if (!eligible) message = 'Swords, muskets and armor can be crafted.';
    else if (!sameRarity) message = 'All three items must share a rarity.';
    else if (!target) message = 'Celestial is the highest rarity.';
    else if (equippedPicked) message = 'Unequip those items before crafting.';
    else if (profile.coins < cost) message = `You need ${cost} coins.`;
    else message = '';
  }
  const canCraft = selected.length === 3 && !message;
  return { selected, target, rate, cost, canCraft, message, rarity, category: categoryLabel };
}

function renderCraftingPanel() {
  const profile = state.profile;
  const craft = craftSelectionState();
  const eligible = profile.inventory
    .filter((item) => ['sword', 'musket', 'armor'].includes(item.category))
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name));
  panelBody.innerHTML = `
    <div class="section">
      <h3>Success odds to the next rarity</h3>
      <div class="craft-odds">
        ${Object.entries(state.meta.craftRates).map(([rarity, rate]) => `
          <div style="border-left:3px solid ${colorOf(rarity)}"><span style="color:${colorOf(rarity)}">${rarity} → ${RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1]}</span><b>${Math.round(rate * 100)}%</b></div>
        `).join('')}
      </div>
      <p class="fineprint">On failure the three items and the coin fee are consumed. All rolls happen on the server.</p>
    </div>
    <div class="section">
      <div class="craft-slots">
        ${[0, 1, 2].map((index) => {
          const item = craft.selected[index];
          return item
            ? `<div class="craft-slot filled" style="border-left:3px solid ${colorOf(item.rarity)}"><span class="x" data-action="craft-remove" data-id="${item.id}">✕</span>${esc(item.icon)} <b style="color:${colorOf(item.rarity)}">${esc(item.name)}</b><br><span class="muted">${esc(item.rarity)} ${esc(item.category)}</span></div>`
            : `<div class="craft-slot">Slot ${index + 1}</div>`;
        }).join('')}
      </div>
      <div class="row between">
        <span class="muted">${craft.message || `Target: ${craft.target ?? '—'} ${craft.category ? `(${craft.category})` : ''} · ${Math.round(craft.rate * 100)}% · ${craft.cost} coins`}</span>
        <button class="primary" data-action="craft" ${craft.canCraft ? '' : 'disabled'}>CRAFT${craft.target ? ` → ${craft.target}` : ''}</button>
      </div>
    </div>
    <div class="section">
      <h3>Your eligible items</h3>
      <div class="craft-list">
        ${eligible.length ? eligible.map((item) => `
          <button class="craft-item ${state.craftSelection.includes(item.id) ? 'picked' : ''}" style="border-left-color:${colorOf(item.rarity)}" data-action="craft-select" data-id="${item.id}">
            ${esc(item.icon)} <b style="color:${colorOf(item.rarity)}">${esc(item.name)}</b><br><span class="muted">${esc(item.rarity)} · ${esc(item.category)}${isEquipped(item) ? ' · equipped' : ''}</span>
          </button>
        `).join('') : '<div class="panel-empty">No swords, muskets or armor yet.</div>'}
      </div>
    </div>
    <div class="section">
      <h3>Crafting history</h3>
      <div class="history">
        ${(profile.craftingHistory ?? []).slice().reverse().map((entry) => `
          <div><span>${esc(entry.from)} → ${esc(entry.to)} · ${Math.round((entry.chance ?? 0) * 100)}%</span><span style="color:${entry.success ? '#a6d68d' : '#ff9d90'}">${entry.success ? 'SUCCESS' : 'FAILED'}</span></div>
        `).join('') || '<div class="panel-empty">No crafts attempted yet.</div>'}
      </div>
    </div>
  `;
}

function memberControls(member) {
  const profile = state.profile;
  const clan = profile.clan;
  if (!clan || member.accountId === profile.id) return '';
  const isLeader = clan.leaderId === profile.id;
  const me = clan.members.find((entry) => entry.accountId === profile.id);
  const isOfficer = me?.role === 'Officer';
  const buttons = [];
  if (isLeader && member.role === 'Member') buttons.push(`<button data-action="clan-role" data-id="${member.accountId}" data-role="Officer">PROMOTE</button>`);
  if (isLeader && member.role === 'Officer') buttons.push(`<button data-action="clan-role" data-id="${member.accountId}" data-role="Member">DEMOTE</button>`);
  if (isLeader || (isOfficer && member.role === 'Member')) buttons.push(`<button class="danger-button" data-action="clan-kick" data-id="${member.accountId}">KICK</button>`);
  return buttons.join('');
}

function renderClansPanel() {
  const profile = state.profile;
  const clan = profile.clan;
  if (clan) {
    const isLeader = clan.leaderId === profile.id;
    panelBody.innerHTML = `
      <div class="clan-layout">
        <div>
          <div class="clan-card">
            <div class="clan-banner">
              <span class="clan-emblem" style="background:${esc(clan.color)}">${esc(clan.tag.slice(0, 2))}</span>
              <div class="grow">
                <h3 style="margin:0">[${esc(clan.tag)}] ${esc(clan.name)}</h3>
                <p class="muted">${clan.members.length} / ${clan.maxMembers} members · score ${fmt(clan.score)}</p>
              </div>
              <button class="danger-button" data-action="clan-leave">LEAVE</button>
            </div>
            <p style="margin-top:10px">${esc(clan.description || 'No clan description yet.')}</p>
            <div class="member-list">
              ${clan.members.map((member) => `
                <div class="member">
                  <span class="dot ${member.online ? 'online' : ''}"></span>
                  <span>${esc(member.name)} <span class="muted">Lv ${member.level}</span></span>
                  <span class="role">${esc(member.role)}</span>
                  ${memberControls(member)}
                </div>
              `).join('')}
            </div>
          </div>
          ${isLeader ? `
            <div class="clan-card" style="margin-top:10px">
              <h3>Clan settings</h3>
              <label class="field"><span>DESCRIPTION</span><input id="clan-edit-description" maxlength="120" value="${esc(clan.description)}"></label>
              <div class="row">
                <label class="field grow"><span>COLOR</span><input id="clan-edit-color" type="color" value="${esc(clan.color)}"></label>
                <button data-action="clan-update" style="align-self:flex-end">SAVE</button>
              </div>
            </div>
          ` : ''}
        </div>
        <div class="clan-card chat-box">
          <h3>Clan chat</h3>
          <div class="chat-log" id="clan-chat-log">
            ${(clan.chat ?? []).map((line) => `<div class="chat-line"><b>${esc(line.name)}:</b> ${esc(line.text)}</div>`).join('') || '<p class="muted">No messages yet.</p>'}
          </div>
          <div class="chat-input">
            <input id="clan-chat-input" maxlength="200" placeholder="Message your clan…">
            <button data-action="clan-chat">SEND</button>
          </div>
          <p class="fineprint">Roles: Leader can promote, demote, kick and edit. Officers can remove members. Anyone can leave.</p>
        </div>
      </div>
    `;
    const log = $('clan-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
    return;
  }

  const data = state.clanList;
  panelBody.innerHTML = `
    <div class="clan-layout">
      <div class="clan-card">
        <h3>Found a clan</h3>
        <p class="muted">Costs ${state.meta ? '' : ''}<b>${data?.cost ?? 100}</b> coins. You will be the Leader.</p>
        <label class="field"><span>CLAN NAME</span><input id="clan-name" maxlength="20" placeholder="Iron Musketeers"></label>
        <div class="form-grid">
          <label class="field"><span>TAG (2–5)</span><input id="clan-tag" maxlength="5" placeholder="IRON"></label>
          <label class="field"><span>COLOR</span><input id="clan-color" type="color" value="#d7b94e"></label>
        </div>
        <label class="field"><span>DESCRIPTION</span><input id="clan-description" maxlength="120" placeholder="What does your banner stand for?"></label>
        <button class="primary" data-action="clan-create">FOUND CLAN · ${data?.cost ?? 100} COINS</button>
      </div>
      <div class="clan-card">
        <div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Open clans</h3><button data-action="refresh-clans">REFRESH</button></div>
        <div class="member-list">
          ${data?.clans?.length ? data.clans.map((entry) => `
            <div class="member">
              <span class="clan-emblem" style="width:26px;height:26px;border-radius:6px;font-size:10px;background:${esc(entry.color)}">${esc(entry.tag.slice(0, 2))}</span>
              <span>[${esc(entry.tag)}] ${esc(entry.name)}<br><span class="muted">${entry.members}/${entry.maxMembers} · ${fmt(entry.score)} pts · ${esc(entry.leader)}</span></span>
              <button data-action="clan-join" data-id="${entry.id}" style="margin-left:auto">JOIN</button>
            </div>
          `).join('') : `<div class="panel-empty">${data ? 'No clans yet — found the first one.' : 'Loading clans…'}</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderFactionsPanel() {
  const profile = state.profile;
  panelBody.innerHTML = `
    <p class="muted" style="margin-bottom:12px">Factions are social and competitive identity, not a combat advantage. Any soldier may use any weapon. Your banner counts toward the faction leaderboard.</p>
    <div class="faction-grid">
      ${state.meta.factions.map((faction) => `
        <div class="faction-card ${profile.faction === faction.id ? 'active' : ''}">
          <div class="faction-head">
            <span class="faction-emblem" style="background:${faction.color}">${esc(faction.emblem)}</span>
            <div><h4 style="color:${faction.color}">${esc(faction.name)}</h4><span class="muted" style="font-size:10px">${esc(faction.motto)}</span></div>
          </div>
          <div class="row" style="margin-top:9px;justify-content:space-between">
            <span class="tag">${profile.faction === faction.id ? 'CURRENT BANNER' : 'AVAILABLE'}</span>
            <button data-action="faction" data-id="${faction.id}" ${profile.faction === faction.id ? 'disabled' : ''}>${profile.faction === faction.id ? 'ENLISTED' : 'ENLIST'}</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLeaderboardPanel() {
  const data = state.leaderboard;
  const tabs = [['players', 'SOLDIERS'], ['factions', 'FACTIONS'], ['clans', 'CLANS']];
  let body = '<div class="panel-empty">Loading leaderboard…</div>';
  if (data) {
    if (state.lbTab === 'players') {
      body = `<div class="leader-list">${data.players.map((entry, index) => {
        const faction = state.meta.factions.find((faction) => faction.id === entry.faction);
        return `<div class="leader-row ${entry.id === state.profile.id ? 'me' : ''}">
          <span class="rank">#${index + 1}</span>
          <span>${esc(entry.name)} ${entry.clanTag ? `<span class="tag">${esc(entry.clanTag)}</span>` : ''}<br><span class="muted">${esc(faction?.emblem ?? '')} ${esc(faction?.name ?? 'Unaffiliated')} · Lv ${entry.level}${entry.online ? ' · online' : ''}</span></span>
          <span class="score">${fmt(entry.score)}</span>
        </div>`;
      }).join('')}</div>`;
    } else if (state.lbTab === 'factions') {
      body = `<div class="leader-list">${data.factions.map((entry, index) => `
        <div class="leader-row">
          <span class="rank">#${index + 1}</span>
          <span class="faction-emblem" style="width:28px;height:28px;font-size:12px;background:${entry.color}">${esc(entry.emblem)}</span>
          <span>${esc(entry.name)}<br><span class="muted">${entry.members} soldier${entry.members === 1 ? '' : 's'}</span></span>
          <span class="score">${fmt(entry.score)}</span>
        </div>`).join('')}</div>`;
    } else {
      body = `<div class="leader-list">${data.clans.length ? data.clans.map((entry, index) => `
        <div class="leader-row">
          <span class="rank">#${index + 1}</span>
          <span class="clan-emblem" style="width:28px;height:28px;border-radius:6px;font-size:10px;background:${esc(entry.color)}">${esc(entry.tag.slice(0, 2))}</span>
          <span>[${esc(entry.tag)}] ${esc(entry.name)}<br><span class="muted">${entry.members} member${entry.members === 1 ? '' : 's'}</span></span>
          <span class="score">${fmt(entry.score)}</span>
        </div>`).join('') : '<div class="panel-empty">No clans founded yet.</div>'}</div>`;
    }
  }
  panelBody.innerHTML = `
    <div class="tabs">${tabs.map(([key, label]) => `<button data-action="lb-tab" data-tab="${key}" class="${state.lbTab === key ? 'active' : ''}">${label}</button>`).join('')}</div>
    ${body}
    ${data?.myRank ? `<p class="fineprint">Your soldier rank: #${data.myRank}</p>` : ''}
  `;
}

function renderCollectionPanel() {
  const profile = state.profile;
  const catalog = state.meta.collectionCatalog ?? [];
  const discovered = profile.collection.entries;
  const categories = [['all', 'ALL'], ['sword', 'SWORDS'], ['musket', 'MUSKETS'], ['armor', 'ARMOR'], ['material', 'MATERIALS'], ['cosmetic', 'COSMETICS']];
  const entries = catalog.filter((entry) => state.collectionFilter === 'all' || entry.category === state.collectionFilter);
  const pct = Math.round((profile.collection.discovered / Math.max(1, profile.collection.total)) * 100);
  panelBody.innerHTML = `
    <div class="row between"><h3 style="margin:0">Encyclopedia</h3><span class="tag gold">${profile.collection.discovered} / ${profile.collection.total} · ${pct}%</span></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="filter-row">${categories.map(([key, label]) => `<button data-action="collection-filter" data-filter="${key}" class="${state.collectionFilter === key ? 'active' : ''}">${label}</button>`).join('')}</div>
    <div class="collection-grid">
      ${entries.map((entry) => {
        const found = discovered[entry.name];
        const color = found ? colorOf(found.rarity) : '#3a444d';
        return `<div class="collection-card ${found ? '' : 'unknown'}" style="border-left-color:${color}">
          <span class="item-icon">${found ? '◆' : '?'}</span>
          <div class="item-name" style="color:${found ? color : '#5d666d'}">${found ? esc(entry.name) : '???'}</div>
          <div class="muted" style="font-size:9px">${found ? esc(found.rarity) : esc(entry.category)}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function renderSettingsPanel() {
  const settings = state.settings;
  const profile = state.profile;
  panelBody.innerHTML = `
    <div class="settings-grid">
      <div class="settings-card">
        <h4>Soldier name</h4>
        <p>Your name is visible to every player in the shared world.</p>
        <div class="row" style="margin-top:8px"><input id="rename-input" maxlength="20" value="${esc(profile.name)}"><button data-action="save-name">SAVE</button></div>
      </div>
      <div class="settings-card">
        <h4>Sound effects</h4>
        <p>Hits, shots, pickups, crafting and level-ups.</p>
        <input id="sfx-range" type="range" min="0" max="100" value="${Math.round(settings.sfx * 100)}">
      </div>
      <div class="settings-card">
        <h4>Music</h4>
        <p>A low ambient war drum drone while playing.</p>
        <label class="checkline"><input id="music-check" type="checkbox" ${settings.music ? 'checked' : ''}> Enable music</label>
      </div>
      <div class="settings-card">
        <h4>Visual effects</h4>
        <p>Damage numbers, tracers and shockwave rings.</p>
        <label class="checkline"><input id="effects-check" type="checkbox" ${settings.effects ? 'checked' : ''}> Enable effects</label>
      </div>
      <div class="settings-card">
        <h4>Controls</h4>
        <p>WASD or arrow keys to move. E enters a nearby portal. Esc closes menus. Swords orbit automatically and muskets fire at nearby targets.</p>
      </div>
      <div class="settings-card">
        <h4>Apply</h4>
        <p>Settings are stored on this device.</p>
        <button class="primary" data-action="save-settings" style="margin-top:8px">SAVE SETTINGS</button>
      </div>
    </div>
    <p class="fineprint">Guest progress is tied to this browser's soldier token. Clearing site data starts a new soldier.</p>
  `;
}

function bindPanelInputs() {
  const chat = $('clan-chat-input');
  if (chat) {
    chat.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendClanChat();
      }
    });
  }
}

function sendClanChat() {
  const input = $('clan-chat-input');
  const text = input?.value?.trim();
  if (!text) return;
  state.socket?.emit('clan-chat', { text });
  input.value = '';
}

// ---------------------------------------------------------- Panel actions --
function handleAction(dataset) {
  const profile = state.profile;
  if (!profile) return;
  const action = dataset.action;
  if (action === 'resume') { closePanel(); return; }
  if (action === 'title') {
    closePanel();
    state.inGame = false;
    $('game-screen').classList.add('hidden');
    $('start-screen').classList.remove('hidden');
    audio.stopMusic();
    return;
  }
  if (action === 'filter') { state.invFilter = dataset.filter; renderPanel(); return; }
  if (action === 'select-item') { state.selectedItem = dataset.id; renderPanel(); return; }
  if (action === 'equip') { state.socket?.emit('equip', { itemId: dataset.id }); renderPanel(); return; }
  if (action === 'unequip') { state.socket?.emit('unequip', { itemId: dataset.id }); renderPanel(); return; }
  if (action === 'upgrade') { state.socket?.emit('upgrade', { key: dataset.key }); return; }
  if (action === 'craft-select') {
    if (state.craftSelection.includes(dataset.id)) state.craftSelection = state.craftSelection.filter((id) => id !== dataset.id);
    else if (state.craftSelection.length < 3) state.craftSelection.push(dataset.id);
    renderPanel();
    return;
  }
  if (action === 'craft-remove') { state.craftSelection = state.craftSelection.filter((id) => id !== dataset.id); renderPanel(); return; }
  if (action === 'craft') {
    const craft = craftSelectionState();
    if (craft.canCraft) state.socket?.emit('craft', { itemIds: state.craftSelection });
    return;
  }
  if (action === 'travel') {
    state.socket?.emit('travel', { worldId: dataset.world });
    closePanel();
    enterGame();
    return;
  }
  if (action === 'faction') { state.socket?.emit('set-faction', { factionId: dataset.id }); return; }
  if (action === 'lb-tab') { state.lbTab = dataset.tab; state.socket?.emit('leaderboard'); renderPanel(); return; }
  if (action === 'collection-filter') { state.collectionFilter = dataset.filter; renderPanel(); return; }
  if (action === 'refresh-clans') { state.clanList = null; state.socket?.emit('clan-list'); renderPanel(); return; }
  if (action === 'clan-create') {
    state.socket?.emit('clan-create', {
      name: $('clan-name')?.value,
      tag: $('clan-tag')?.value,
      color: $('clan-color')?.value,
      description: $('clan-description')?.value
    });
    return;
  }
  if (action === 'clan-join') { state.socket?.emit('clan-join', { clanId: dataset.id }); return; }
  if (action === 'clan-leave') { state.socket?.emit('clan-leave'); return; }
  if (action === 'clan-role') { state.socket?.emit('clan-role', { accountId: dataset.id, role: dataset.role }); return; }
  if (action === 'clan-kick') { state.socket?.emit('clan-kick', { accountId: dataset.id }); return; }
  if (action === 'clan-update') {
    state.socket?.emit('clan-update', { description: $('clan-edit-description')?.value, color: $('clan-edit-color')?.value });
    return;
  }
  if (action === 'clan-chat') { sendClanChat(); return; }
  if (action === 'save-name') {
    state.socket?.emit('rename', { name: $('rename-input')?.value });
    localStorage.setItem('3m-name', $('rename-input')?.value ?? '');
    notify('Name updated.');
    return;
  }
  if (action === 'save-settings') {
    state.settings = {
      sfx: clamp(Number($('sfx-range')?.value ?? 55) / 100, 0, 1),
      music: Boolean($('music-check')?.checked),
      effects: Boolean($('effects-check')?.checked)
    };
    localStorage.setItem('3m-settings', JSON.stringify(state.settings));
    audio.apply();
    notify('Settings saved.');
    return;
  }
}

document.addEventListener('click', (event) => {
  const panelButton = event.target.closest('[data-panel]');
  if (panelButton) {
    audio.play('click');
    openPanel(panelButton.dataset.panel);
    return;
  }
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  handleAction(actionEl.dataset);
});

$('panel-close').addEventListener('click', closePanel);
overlay.addEventListener('click', (event) => { if (event.target === overlay) closePanel(); });
$('play-button').addEventListener('click', () => { audio.ensure(); enterGame(); });

function enterGame() {
  state.inGame = true;
  $('start-screen').classList.add('hidden');
  $('game-screen').classList.remove('hidden');
  resizeCanvas();
  if (state.settings.music) audio.startMusic();
}

// --------------------------------------------------------------- Input -----
function sendInput() {
  state.socket?.emit('input', {
    up: state.keys.has('w') || state.keys.has('arrowup'),
    down: state.keys.has('s') || state.keys.has('arrowdown'),
    left: state.keys.has('a') || state.keys.has('arrowleft'),
    right: state.keys.has('d') || state.keys.has('arrowright')
  });
}

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  const key = event.key.toLowerCase();
  if (event.key === 'Escape') { if (state.panel) closePanel(); return; }
  if (key === 'e' && state.inGame) {
    state.socket?.emit('use-portal');
    return;
  }
  if (MOVEMENT_KEYS.includes(key)) {
    event.preventDefault();
    if (!state.keys.has(key)) { state.keys.add(key); sendInput(); }
  }
});
window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (MOVEMENT_KEYS.includes(key)) { state.keys.delete(key); sendInput(); }
});
window.addEventListener('blur', () => { state.keys.clear(); sendInput(); });
setInterval(sendInput, 350);

// --------------------------------------------------------------- Canvas ----
let dpr = 1;
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);

function currentWorld() {
  return state.meta?.worlds.find((world) => world.id === state.profile?.worldId) ?? state.world ?? state.meta?.worlds[0] ?? null;
}

function pushFx(event) {
  if (!state.settings.effects) return;
  const now = performance.now();
  if (event.type === 'hit') {
    state.fx.push({ kind: 'text', x: event.x, y: event.y, text: `${event.amount}`, color: event.crit ? '#ffe27a' : '#fff2c4', crit: event.crit, born: now, life: 900 });
  } else if (event.type === 'tracer') {
    state.fx.push({ kind: 'line', from: event.from, to: event.to, color: event.color || '#ffd98a', born: now, life: 160 });
  } else if (event.type === 'slam') {
    state.fx.push({ kind: 'ring', x: event.x, y: event.y, radius: event.radius || 140, color: event.color || '#c47cff', born: now, life: 550 });
  } else if (event.type === 'muzzle') {
    state.fx.push({ kind: 'ring', x: event.x, y: event.y, radius: 22, color: event.color || '#ffd98a', born: now, life: 180 });
  } else if (event.type === 'pickup' || event.type === 'drop' || event.type === 'equip') {
    state.fx.push({ kind: 'ring', x: event.x, y: event.y, radius: 34, color: event.color || '#f0cf68', born: now, life: 420 });
  } else if (event.type === 'portal') {
    state.fx.push({ kind: 'ring', x: event.x, y: event.y, radius: 70, color: event.color || '#8ef0ff', born: now, life: 620 });
  }
  if (state.fx.length > 70) state.fx.splice(0, state.fx.length - 70);
}

function drawHat(shape, color, accent) {
  if (!shape) return;
  ctx.save();
  ctx.translate(0, -13);
  ctx.fillStyle = color;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  if (shape === 'tricorne') {
    ctx.beginPath(); ctx.moveTo(-17, 2); ctx.lineTo(-9, -8); ctx.lineTo(0, -3); ctx.lineTo(9, -8); ctx.lineTo(17, 2); ctx.lineTo(9, 6); ctx.lineTo(-9, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (shape === 'bicorne') {
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.quadraticCurveTo(0, -16, 18, 0); ctx.quadraticCurveTo(0, 5, -18, 0); ctx.fill(); ctx.stroke();
  } else if (shape === 'kabuto') {
    ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(-17, -13, -5, -10); ctx.moveTo(10, -2); ctx.quadraticCurveTo(17, -13, 5, -10); ctx.stroke();
  } else if (shape === 'greathelm') {
    ctx.beginPath(); ctx.roundRect(-10, -12, 20, 16, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#151a20'; ctx.fillRect(-7, -6, 14, 3);
  } else if (shape === 'kepi') {
    ctx.beginPath(); ctx.roundRect(-9, -9, 18, 11, 3); ctx.fill(); ctx.stroke();
    ctx.fillRect(-11, 2, 22, 3);
  } else if (shape === 'spiked') {
    ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-3, -19); ctx.lineTo(3, -17); ctx.closePath(); ctx.fill();
  } else if (shape === 'turban') {
    ctx.beginPath(); ctx.ellipse(0, -2, 12, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent; ctx.fillRect(-11, -1, 22, 2);
  } else if (shape === 'glengarry') {
    ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(-6, -7); ctx.lineTo(6, -7); ctx.lineTo(9, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(5, -7); ctx.lineTo(12, -17); ctx.stroke();
  } else if (shape === 'hood') {
    ctx.beginPath(); ctx.moveTo(-13, 4); ctx.quadraticCurveTo(-10, -16, 0, -15); ctx.quadraticCurveTo(10, -16, 13, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (shape === 'dragon') {
    ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-16, -16); ctx.lineTo(-5, -11); ctx.moveTo(8, -4); ctx.lineTo(16, -16); ctx.lineTo(5, -11); ctx.fill();
  } else if (shape === 'halo') {
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -15, 12, 4, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (shape === 'morion') {
    ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -9); ctx.quadraticCurveTo(0, -20, 2, -9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(0, 8, 14, 0); ctx.stroke();
  } else if (shape === 'crystal') {
    ctx.beginPath(); ctx.moveTo(-11, 2); ctx.lineTo(-5, -13); ctx.lineTo(0, -7); ctx.lineTo(6, -16); ctx.lineTo(11, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.roundRect(-10, -8, 20, 10, 3); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(player, now) {
  const appearance = player.appearance ?? {};
  const isMe = player.id === state.profile?.id;
  const x = player.x;
  const y = player.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 13, 16, 7, 0, 0, Math.PI * 2); ctx.fill();

  if (appearance.cape) {
    ctx.fillStyle = appearance.cape.color;
    ctx.strokeStyle = appearance.cape.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.lineTo(5, 17); ctx.lineTo(0, 12); ctx.lineTo(-5, 17); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  if (appearance.chestColor) {
    ctx.fillStyle = appearance.chestColor;
    ctx.strokeStyle = appearance.chestAccent || '#e4ebfa';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 2, 14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = appearance.chestAccent || '#e4ebfa';
    ctx.fillRect(-7, 4, 14, 2);
  }

  ctx.fillStyle = '#f2c94c';
  ctx.strokeStyle = '#8a6a17';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1b2027';
  ctx.beginPath(); ctx.arc(-4.5, -2, 2.1, 0, Math.PI * 2); ctx.arc(4.5, -2, 2.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath(); ctx.arc(-5.2, -2.8, 0.7, 0, Math.PI * 2); ctx.arc(3.8, -2.8, 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6b5313'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 3, 3.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

  if (appearance.boots) {
    ctx.fillStyle = appearance.boots.color;
    ctx.fillRect(-10, 10, 6, 5); ctx.fillRect(4, 10, 6, 5);
  }

  drawHat(appearance.hat?.shape, appearance.hat?.color ?? '#2e2a24', appearance.hat?.accent ?? '#e8c34f');

  const swords = player.swords ?? [];
  swords.forEach((sword, index) => {
    const count = Math.max(1, swords.length);
    const angle = (player.orbitAngle ?? 0) + (index / count) * Math.PI * 2;
    const radius = sword.orbitRadius || 42;
    const bx = Math.cos(angle) * radius;
    const by = Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle + Math.PI / 2);
    ctx.shadowColor = sword.color;
    ctx.shadowBlur = 9;
    const blades = Math.max(1, sword.bladeCount || 1);
    for (let blade = 0; blade < blades; blade += 1) {
      const offset = (blade - (blades - 1) / 2) * 6;
      ctx.strokeStyle = sword.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(offset, 10); ctx.lineTo(offset, -11); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(offset, 9); ctx.lineTo(offset, -10); ctx.stroke();
    }
    ctx.fillStyle = '#6b4b25'; ctx.fillRect(-2, 9, 4, 5);
    ctx.restore();
  });

  if ((player.muskets ?? []).length) {
    ctx.save();
    ctx.rotate(-0.4);
    ctx.fillStyle = '#5a3f22'; ctx.fillRect(10, -2, 16, 4);
    ctx.fillStyle = (player.muskets[0].color) || '#d7bb72'; ctx.fillRect(22, -2.5, 5, 5);
    ctx.restore();
  }

  if (player.protected) {
    ctx.strokeStyle = 'rgba(142,240,255,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 21 + Math.sin(now / 240) * 2, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.restore();

  ctx.font = '700 11px Inter, system-ui'; ctx.textAlign = 'center';
  const clan = player.clanTag ? `[${player.clanTag}] ` : '';
  ctx.fillStyle = isMe ? '#ffe9a6' : '#f0eadb';
  ctx.fillText(`${clan}${player.name}`, x, y - 30);
  ctx.fillStyle = '#10151b';
  ctx.fillRect(x - 22, y + 20, 44, 5);
  ctx.fillStyle = '#79c66f';
  ctx.fillRect(x - 22, y + 20, 44 * clamp(player.health / Math.max(1, player.maxHealth), 0, 1), 5);
  if (player.pvp) {
    ctx.font = '10px system-ui'; ctx.fillStyle = '#ff9184'; ctx.fillText('⚔', x + 26, y - 30);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMob(mob) {
  const x = mob.x;
  const y = mob.y;
  const color = colorOf(mob.rarity);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, mob.radius * 0.75, mob.radius * 0.95, mob.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  if (mob.isBoss) {
    ctx.shadowColor = color; ctx.shadowBlur = 24;
  }
  ctx.fillStyle = mob.color || '#c0392b';
  ctx.strokeStyle = color;
  ctx.lineWidth = mob.isBoss ? 3 : 1.5;
  ctx.beginPath(); ctx.arc(0, 0, mob.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#20262c';
  ctx.beginPath(); ctx.arc(-mob.radius * 0.3, -mob.radius * 0.18, mob.radius * 0.13, 0, Math.PI * 2); ctx.arc(mob.radius * 0.3, -mob.radius * 0.18, mob.radius * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f7e6ba';
  ctx.fillRect(-mob.radius * 0.45, -mob.radius * 0.85, mob.radius * 0.9, mob.radius * 0.28);
  if (mob.isBoss) {
    ctx.fillStyle = '#f4d773';
    ctx.beginPath(); ctx.moveTo(-mob.radius * 0.7, -mob.radius * 0.95); ctx.lineTo(-mob.radius * 0.4, -mob.radius * 1.25); ctx.lineTo(-mob.radius * 0.15, -mob.radius * 0.98); ctx.lineTo(0, -mob.radius * 1.32); ctx.lineTo(mob.radius * 0.15, -mob.radius * 0.98); ctx.lineTo(mob.radius * 0.4, -mob.radius * 1.25); ctx.lineTo(mob.radius * 0.7, -mob.radius * 0.95); ctx.closePath(); ctx.fill();
  }
  if (mob.ranged) {
    ctx.strokeStyle = '#e6c47a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mob.radius * 0.5, 0); ctx.lineTo(mob.radius + 14, -3); ctx.stroke();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = '700 10px Inter, system-ui';
  ctx.fillStyle = color;
  ctx.fillText(mob.name, x, y - mob.radius - 10);
  const barWidth = mob.isBoss ? 90 : 40;
  ctx.fillStyle = '#10151b';
  ctx.fillRect(x - barWidth / 2, y + mob.radius + 5, barWidth, 4);
  ctx.fillStyle = mob.isBoss ? '#c47cff' : color;
  ctx.fillRect(x - barWidth / 2, y + mob.radius + 5, barWidth * clamp(mob.health / Math.max(1, mob.maxHealth), 0, 1), 4);
}

function drawPortal(portal, world) {
  const target = state.meta?.worlds.find((entry) => entry.id === portal.to);
  if (!target) return;
  const t = performance.now() / 700;
  ctx.save();
  ctx.translate(portal.x, portal.y);
  ctx.shadowColor = target.accent;
  ctx.shadowBlur = 20;
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.strokeStyle = target.accent;
    ctx.globalAlpha = 0.35 + ring * 0.15;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 + ring * 7, t + ring * 1.2, t + ring * 1.2 + Math.PI * 1.35);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = target.accent;
  ctx.beginPath(); ctx.arc(0, 0, 9 + Math.sin(t * 2) * 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.font = '700 10px Inter, system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = '#e8f4ff';
  ctx.fillText(target.name, 0, -42);
  const locked = (state.profile?.level ?? 1) < target.level;
  ctx.font = '9px Inter, system-ui';
  ctx.fillStyle = locked ? '#ff9d90' : '#a9e4b1';
  ctx.fillText(locked ? `LOCKED · LV ${target.level}` : `LV ${target.level} · PRESS E`, 0, 42);
  ctx.restore();
  return target;
}

function drawMinimap() {
  const profile = state.profile;
  if (!profile) return;
  const width = mini.width;
  const height = mini.height;
  const sx = width / WORLD_W;
  const sy = height / WORLD_H;
  mctx.clearRect(0, 0, width, height);
  mctx.fillStyle = 'rgba(11,16,21,.85)';
  mctx.fillRect(0, 0, width, height);
  const world = currentWorld();
  if (world) {
    mctx.strokeStyle = 'rgba(255,255,255,.12)';
    mctx.lineWidth = 1;
    mctx.strokeRect(2, 2, width - 4, height - 4);
    mctx.fillStyle = `${world.accent}33`;
    mctx.beginPath(); mctx.arc(world.spawn.x * sx, world.spawn.y * sy, 300 * sx, 0, Math.PI * 2); mctx.fill();
    for (const portal of world.portals) {
      mctx.fillStyle = '#71d3e8';
      mctx.beginPath(); mctx.arc(portal.x * sx, portal.y * sy, 3, 0, Math.PI * 2); mctx.fill();
    }
  }
  for (const drop of state.worldState.drops ?? []) {
    mctx.fillStyle = colorOf(drop.item.rarity);
    mctx.fillRect(drop.x * sx - 1, drop.y * sy - 1, 2.5, 2.5);
  }
  for (const mob of state.worldState.mobs ?? []) {
    mctx.fillStyle = mob.isBoss ? '#c47cff' : '#d47563';
    mctx.beginPath(); mctx.arc(mob.x * sx, mob.y * sy, mob.isBoss ? 4 : 1.8, 0, Math.PI * 2); mctx.fill();
  }
  for (const player of state.worldState.players ?? []) {
    mctx.fillStyle = player.id === profile.id ? '#f2c94c' : '#9bd7ef';
    mctx.beginPath(); mctx.arc(player.x * sx, player.y * sy, player.id === profile.id ? 3.2 : 2.4, 0, Math.PI * 2); mctx.fill();
  }
}

function updateBossBar() {
  const boss = (state.worldState.mobs ?? []).find((mob) => mob.isBoss);
  const bar = $('boss-bar');
  if (!boss) {
    if (!bar.classList.contains('hidden')) bar.classList.add('hidden');
    state.lastBossKey = '';
    return;
  }
  const key = `${boss.id}:${boss.health}`;
  if (key === state.lastBossKey) return;
  state.lastBossKey = key;
  bar.classList.remove('hidden');
  $('boss-name').textContent = `☠ ${boss.name} · ${boss.rarity}`;
  $('boss-health-text').textContent = `${Math.round(boss.health)} / ${boss.maxHealth}`;
  $('boss-health-bar').style.width = `${clamp((boss.health / Math.max(1, boss.maxHealth)) * 100, 0, 100)}%`;
  $('boss-name').style.color = colorOf(boss.rarity);
}

function updatePortalHint() {
  const world = currentWorld();
  const me = state.me;
  const hint = $('portal-hint');
  if (!world || !me || !state.inGame) { hint.classList.add('hidden'); return; }
  let near = null;
  for (const portal of world.portals) {
    if (Math.hypot(me.x - portal.x, me.y - portal.y) <= 110) { near = portal; break; }
  }
  if (!near) { hint.classList.add('hidden'); state.lastPortalKey = ''; return; }
  const target = state.meta.worlds.find((entry) => entry.id === near.to);
  if (!target) { hint.classList.add('hidden'); return; }
  const key = `${target.id}:${state.profile.level >= target.level}`;
  if (key !== state.lastPortalKey) {
    state.lastPortalKey = key;
    $('portal-name').textContent = `${target.name} (${state.profile.level >= target.level ? 'level ' + target.level : 'requires level ' + target.level})`;
  }
  hint.classList.remove('hidden');
}

let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  if (!state.inGame) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) resizeCanvas();
  const width = rect.width;
  const height = rect.height;
  const me = state.me;
  const world = currentWorld();

  if (me) {
    const targetX = clamp(me.x - width / 2, 0, Math.max(0, WORLD_W - width));
    const targetY = clamp(me.y - height / 2, 0, Math.max(0, WORLD_H - height));
    state.camera.x += (targetX - state.camera.x) * Math.min(1, dt * 7);
    state.camera.y += (targetY - state.camera.y) * Math.min(1, dt * 7);
  }
  const camX = state.camera.x;
  const camY = state.camera.y;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = world?.bg ?? '#1b2a24';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(-camX, -camY);

  if (world) {
    const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    gradient.addColorStop(0, `${world.bg2}55`);
    gradient.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    const grid = 120;
    for (let x = Math.floor(camX / grid) * grid; x < camX + width + grid; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, camY); ctx.lineTo(x, camY + height); ctx.stroke();
    }
    for (let y = Math.floor(camY / grid) * grid; y < camY + height + grid; y += grid) {
      ctx.beginPath(); ctx.moveTo(camX, y); ctx.lineTo(camX + width, y); ctx.stroke();
    }

    ctx.strokeStyle = `${world.accent}66`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.arc(world.spawn.x, world.spawn.y, 300, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const portal of world?.portals ?? []) drawPortal(portal, world);

  for (const drop of state.worldState.drops ?? []) {
    const color = colorOf(drop.item.rarity);
    const bob = Math.sin(now / 300 + drop.x) * 3;
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.shadowBlur = 0;
    ctx.restore();
    const dist = me ? Math.hypot(me.x - drop.x, me.y - drop.y) : 999;
    if (dist < 220) {
      ctx.font = '700 10px Inter, system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(`${drop.item.name}`, drop.x, drop.y - 18);
    }
  }

  for (const mob of state.worldState.mobs ?? []) drawMob(mob);

  for (const projectile of state.worldState.projectiles ?? []) {
    ctx.save();
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = projectile.color;
    ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.radius || 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const players = [...(state.worldState.players ?? [])];
  players.sort((a, b) => (a.id === state.profile.id ? 1 : 0) - (b.id === state.profile.id ? 1 : 0));
  for (const player of players) drawPlayer(player, now);

  const fxNow = performance.now();
  state.fx = state.fx.filter((fx) => fxNow - fx.born < fx.life);
  for (const fx of state.fx) {
    const t = (fxNow - fx.born) / fx.life;
    if (fx.kind === 'text') {
      ctx.globalAlpha = 1 - t;
      ctx.font = `900 ${fx.crit ? 19 : 14}px Inter, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = fx.color;
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 3;
      const yy = fx.y - 20 - t * 34;
      ctx.strokeText(fx.text, fx.x, yy);
      ctx.fillText(fx.text, fx.x, yy);
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'line') {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(fx.from.x, fx.from.y); ctx.lineTo(fx.to.x, fx.to.y); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 8 + t * fx.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();

  if (now - state.lastHudAt > 120) {
    state.lastHudAt = now;
    if (state.hudDirty) { state.hudDirty = false; renderHud(); }
  }
  if (now - state.lastMiniAt > 120) {
    state.lastMiniAt = now;
    drawMinimap();
    updateBossBar();
    updatePortalHint();
  }
}

// ---------------------------------------------------------------- Boot -----
$('boot').textContent = 'Connecting to the shared world…';
try {
  connect();
} catch (error) {
  $('boot').textContent = 'Could not connect to the server. Refresh to retry.';
  console.error(error);
}
requestAnimationFrame(frame);
