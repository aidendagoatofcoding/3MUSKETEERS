import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Server } from 'socket.io';
import { PORT } from './config.js';
import { Game } from './game.js';
import { ProfileStore } from './store.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { maxHttpBufferSize: 12_000, cors: { origin: false } });
const store = new ProfileStore(resolve(here, '../../data/profiles.json'));

app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true, game: '3MUSKETTERS' }));
app.use(express.static(resolve(here, '../../public')));

await store.init();
const game = new Game(io, store);
game.start();

const guard = (socket, handler) => async (payload) => {
  try {
    await handler(payload);
  } catch (error) {
    console.error('Action failed:', error);
    socket.emit('error', { message: 'Something went wrong on the server.' });
  }
};

io.on('connection', (socket) => {
  void game.connect(socket).catch((error) => {
    console.error('Unable to initialize player:', error);
    socket.emit('error', { message: 'Could not load player profile.' });
    socket.disconnect(true);
  });

  socket.on('input', (payload) => game.setInput(socket, payload));
  socket.on('travel', guard(socket, (payload) => game.travel(socket, payload?.worldId)));
  socket.on('use-portal', guard(socket, () => game.usePortal(socket)));
  socket.on('equip', guard(socket, (payload) => game.equip(socket, payload?.itemId)));
  socket.on('unequip', guard(socket, (payload) => game.unequip(socket, payload?.itemId)));
  socket.on('upgrade', guard(socket, (payload) => game.upgrade(socket, payload?.key)));
  socket.on('craft', guard(socket, (payload) => game.craft(socket, payload?.itemIds)));
  socket.on('set-faction', guard(socket, (payload) => game.setFaction(socket, payload?.factionId)));
  socket.on('rename', guard(socket, (payload) => game.rename(socket, payload?.name)));
  socket.on('leaderboard', guard(socket, () => game.sendLeaderboard(socket)));
  socket.on('clan-list', guard(socket, () => game.sendClanList(socket)));
  socket.on('clan-create', guard(socket, (payload) => game.createClan(socket, payload)));
  socket.on('clan-join', guard(socket, (payload) => game.joinClan(socket, payload)));
  socket.on('clan-leave', guard(socket, () => game.leaveClan(socket)));
  socket.on('clan-role', guard(socket, (payload) => game.setClanRole(socket, payload)));
  socket.on('clan-kick', guard(socket, (payload) => game.kickFromClan(socket, payload)));
  socket.on('clan-update', guard(socket, (payload) => game.updateClan(socket, payload)));
  socket.on('clan-chat', guard(socket, (payload) => game.clanChat(socket, payload)));

  socket.on('disconnect', () => {
    void game.disconnect(socket).catch((error) => console.error('Profile save failed:', error));
  });
});

httpServer.listen(PORT, () => console.log(`3MUSKETTERS listening on http://localhost:${PORT}`));
