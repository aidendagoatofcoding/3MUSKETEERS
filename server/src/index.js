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
const io = new Server(httpServer, { maxHttpBufferSize: 10_000, cors: { origin: false } });
const store = new ProfileStore(resolve(here, '../../data/profiles.json'));

app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true, game: '3MUSKETTERS' }));
app.use(express.static(resolve(here, '../../public')));

await store.init();
const game = new Game(io, store);
game.start();
io.on('connection', (socket) => {
  void game.connect(socket).catch((error) => {
    console.error('Unable to initialize player:', error);
    socket.emit('server-error', { message: 'Could not load player profile.' });
    socket.disconnect(true);
  });
  socket.on('input', (payload) => game.setInput(socket, payload));
  socket.on('disconnect', () => { void game.disconnect(socket).catch((error) => console.error('Profile save failed:', error)); });
});

httpServer.listen(PORT, () => console.log(`3MUSKETTERS listening on http://localhost:${PORT}`));
