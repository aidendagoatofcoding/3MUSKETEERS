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
let state = { players: [], mobs: [] };
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
    if (data.token) localStorage.setItem('3m-token', data.token);
    localStorage.setItem('3m-name', me.name);
    nameEl.textContent = me.name;
    levelEl.textContent = `LVL ${me.level}`;
    renderHud();
  });
  socket.on('state', (nextState) => { state = nextState; me = state.players.find((player) => player.id === me?.id) || me; renderHud(); });
  socket.on('loot', ({ item }) => notify(`${item.rarity} ${item.name} added to inventory`));
  socket.on('mob-defeated', ({ name, xp }) => notify(`${name} defeated · +${xp} XP`));
  socket.on('level-up', ({ level }) => { levelEl.textContent = `LVL ${level}`; notify(`LEVEL UP · You reached level ${level}`); });
  socket.on('combat', ({ text }) => notify(text));
  socket.on('server-error', ({ message }) => notify(message));
}
connect();

function renderHud() {
  if (!me) return;
  levelEl.textContent = `LVL ${me.level}`;
  healthValue.textContent = `${me.health} / 100`;
  healthBar.style.width = `${Math.max(0, me.health)}%`;
  xpValue.textContent = `${me.xp} XP`;
  xpBar.style.width = `${Math.min(100, me.xp / (me.level * 100) * 100)}%`;
}

function roundRect(x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function drawSoldier(player, cameraX, cameraY, now) {
  const x = player.x - cameraX;
  const y = player.y - cameraY;
  const isMe = player.id === me?.id;
  const orbit = now / 500;
  ctx.save();
  ctx.translate(x, y);
  // Orbiting starter saber is visual here; server independently validates damage/timing.
  ctx.save();
  ctx.rotate(orbit);
  ctx.fillStyle = '#e8e0cd';
  ctx.fillRect(23, -2, 19, 4);
  ctx.fillStyle = '#9b633a';
  ctx.fillRect(20, -3, 5, 6);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,.24)';
  ctx.beginPath(); ctx.ellipse(0, 11, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isMe ? '#e7bf4b' : '#ba4650';
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f2dca0'; ctx.lineWidth = 2; ctx.stroke();
  // Face and shako silhouette keep the starter character readable at small scale.
  ctx.fillStyle = '#f3e7cf';
  ctx.beginPath(); ctx.arc(0, -2, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#252c36';
  ctx.fillRect(-8, -15, 16, 6);
  ctx.fillRect(-5, -21, 10, 7);
  ctx.fillStyle = '#263140'; ctx.beginPath(); ctx.arc(-3, -3, 1.2, 0, Math.PI * 2); ctx.arc(3, -3, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff6db'; ctx.fillText(player.name, x, y - 28);
  roundRect(x - 15, y + 20, 30, 4, 2, '#20242b');
  roundRect(x - 15, y + 20, 30 * Math.max(0, player.health / 100), 4, 2, '#8bc377');
}

function render(now = 0) {
  const { width, height } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#273c33'; ctx.fillRect(0, 0, width, height);
  if (me) {
    const cameraX = Math.max(0, Math.min(2400 - width, me.x - width / 2));
    const cameraY = Math.max(0, Math.min(1600 - height, me.y - height / 2));
    // Subtle ground grid.
    ctx.strokeStyle = 'rgba(216,204,151,.055)'; ctx.lineWidth = 1;
    const grid = 80;
    for (let x = -(cameraX % grid); x < width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = -(cameraY % grid); y < height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    for (const mob of state.mobs) {
      const x = mob.x - cameraX; const y = mob.y - cameraY;
      if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
      ctx.fillStyle = '#533c3b'; ctx.beginPath(); ctx.arc(x, y, mob.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9534d'; ctx.fillRect(x - 7, y - 9, 14, 8);
      ctx.fillStyle = '#ead9bc'; ctx.fillRect(x - 8, y + 1, 16, 3);
      roundRect(x - 17, y - 25, 34, 4, 2, '#211f20');
      roundRect(x - 17, y - 25, 34 * Math.max(0, mob.health / mob.maxHealth), 4, 2, '#d86b5d');
      ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#f0d9c3'; ctx.fillText(mob.name, x, y - 31);
    }
    for (const player of state.players) drawSoldier(player, cameraX, cameraY, now);
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
