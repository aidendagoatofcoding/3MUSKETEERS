const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const status = document.querySelector('#connection');
const nameEl = document.querySelector('#player-name');
const levelEl = document.querySelector('#level');
const healthValue = document.querySelector('#health-value');
const healthBar = document.querySelector('#health-bar');
const xpValue = document.querySelector('#xp-value');
const xpBar = document.querySelector('#xp-bar');
const toast = document.querySelector('#toast');
const keys = new Set();
let socket;
let me;
let inventory = [];
let state = { players: [], mobs: [], projectiles: [] };
let toastTimer;

function resize() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function connect() {
  const token = localStorage.getItem('3m-token');
  const savedName = localStorage.getItem('3m-name') || `Soldier-${Math.floor(1000 + Math.random() * 9000)}`;
  socket = window.io({ auth: { token, name: savedName } });
  socket.on('connect', () => { status.textContent = 'ONLINE · SHARED WORLD'; status.classList.add('online'); });
  socket.on('disconnect', () => { status.textContent = 'RECONNECTING…'; status.classList.remove('online'); });
  socket.on('welcome', (data) => {
    me = data.player;
    inventory = data.inventory || [];
    if (data.token) localStorage.setItem('3m-token', data.token);
    localStorage.setItem('3m-name', me.name);
    nameEl.textContent = me.name;
    levelEl.textContent = `LVL ${me.level}`;
    renderHud();
  });
  socket.on('state', (nextState) => { state = nextState; me = state.players.find((player) => player.id === me?.id) || me; renderHud(); });
  socket.on('loot', ({ item }) => { inventory.push(item); notify(`${item.rarity} ${item.name} added to inventory`); });
  socket.on('mob-defeated', ({ name, xp }) => notify(`${name} defeated · +${xp} XP`));
  socket.on('level-up', ({ level }) => { levelEl.textContent = `LVL ${level}`; notify(`LEVEL UP · You reached level ${level}`); });
  socket.on('combat', ({ text, type }) => notify(`${type === 'mob' ? 'Enemy' : 'You'} ${text}`));
  socket.on('server-error', ({ message }) => notify(message));
}
connect();

function renderHud() {
  if (!me) return;
  levelEl.textContent = `LVL ${me.level}`;
  healthValue.textContent = `${Math.max(0, me.health)} / ${me.maxHealth || 100}`;
  healthBar.style.width = `${Math.max(0, (me.health / (me.maxHealth || 100)) * 100)}%`;
  xpValue.textContent = `${me.xp} XP`;
  xpBar.style.width = `${Math.min(100, (me.xp / (me.level * 100)) * 100)}%`;
  const weapons = document.querySelector('#weapon-summary');
  if (weapons) weapons.textContent = inventory.filter((item) => ['sword', 'musket'].includes(item.category)).slice(0, 4).map((item) => `${item.rarity} ${item.name}`).join(' · ');
}

function drawPlayer(player, cameraX, cameraY, now) {
  const x = player.x - cameraX;
  const y = player.y - cameraY;
  const isMe = player.id === me?.id;
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.rotate(now / 550);
  ctx.fillStyle = '#e1d0ac'; ctx.fillRect(24, -2, 20, 4);
  ctx.fillStyle = '#972d2d'; ctx.fillRect(20, -3, 5, 6);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(0, 11, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isMe ? '#e7bf4b' : '#be4b52'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f6e9d1'; ctx.beginPath(); ctx.arc(0, -3, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b2434'; ctx.fillRect(-8, -16, 16, 6); ctx.fillRect(-6, -22, 12, 7);
  ctx.fillStyle = '#15212c'; ctx.beginPath(); ctx.arc(-3, -4, 1.3, 0, Math.PI * 2); ctx.arc(3, -4, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff8e7'; ctx.fillText(player.name, x, y - 28);
  ctx.fillStyle = '#1a1f26'; ctx.fillRect(x - 17, y + 20, 34, 5);
  ctx.fillStyle = '#6dbd74'; ctx.fillRect(x - 17, y + 20, 34 * (player.health / (player.maxHealth || 100)), 5);
}

function drawMob(mob, cameraX, cameraY) {
  const x = mob.x - cameraX; const y = mob.y - cameraY;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + 12, mob.radius + 4, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mob.color || '#d45b4e'; ctx.beginPath(); ctx.arc(x, y, mob.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0d9bf'; ctx.fillRect(x - 16, y - 23, 32, 5);
  ctx.fillStyle = '#d85b57'; ctx.fillRect(x - 16, y - 23, 32 * (mob.health / (mob.maxHealth || 60)), 5);
  ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#f9f2d1'; ctx.fillText(mob.name, x, y - 28);
}

function render(now = 0) {
  const { width, height } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#23372d'; ctx.fillRect(0, 0, width, height);
  if (me) {
    const cameraX = Math.max(0, Math.min(2400 - width, me.x - width / 2));
    const cameraY = Math.max(0, Math.min(1600 - height, me.y - height / 2));
    ctx.strokeStyle = 'rgba(219,203,170,.05)'; ctx.lineWidth = 1;
    for (let x = -(cameraX % 80); x < width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = -(cameraY % 80); y < height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    for (const projectile of state.projectiles || []) {
      ctx.fillStyle = projectile.color || '#f8d77c'; ctx.beginPath(); ctx.arc(projectile.x - cameraX, projectile.y - cameraY, projectile.radius || 5, 0, Math.PI * 2); ctx.fill();
    }
    for (const mob of state.mobs || []) drawMob(mob, cameraX, cameraY);
    for (const player of state.players || []) drawPlayer(player, cameraX, cameraY, now);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

const sendInput = () => socket?.connected && socket.emit('input', {
  up: keys.has('w') || keys.has('arrowup'), down: keys.has('s') || keys.has('arrowdown'),
  left: keys.has('a') || keys.has('arrowleft'), right: keys.has('d') || keys.has('arrowright')
});
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  keys.add(key); sendInput();
});
window.addEventListener('keyup', (event) => { keys.delete(event.key.toLowerCase()); sendInput(); });
window.addEventListener('blur', () => { keys.clear(); sendInput(); });
