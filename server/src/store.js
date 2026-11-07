import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_FILE = resolve('data/profiles.json');
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const defaultProfile = (name) => ({
  name,
  level: 1,
  xp: 0,
  coins: 0,
  health: 100,
  inventory: [{ id: randomUUID(), name: 'Redcoat Saber', category: 'sword', rarity: 'Common' }],
  createdAt: new Date().toISOString()
});

export class ProfileStore {
  constructor(filePath = DEFAULT_FILE) {
    this.filePath = filePath;
    this.accounts = new Map();
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const content = await readFile(this.filePath, 'utf8');
      const data = JSON.parse(content);
      for (const account of Array.isArray(data.accounts) ? data.accounts : []) {
        if (account?.id && account?.tokenHash && account?.profile) this.accounts.set(account.id, account);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.flush();
    }
  }

  async createGuest(name) {
    const token = randomBytes(32).toString('base64url');
    const account = { id: randomUUID(), tokenHash: hashToken(token), profile: defaultProfile(name) };
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
    account.profile = structuredClone(profile);
    await this.flush();
  }

  async flush() {
    const snapshot = JSON.stringify({ version: 1, accounts: [...this.accounts.values()] }, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(tempPath, snapshot, { mode: 0o600 });
      await rename(tempPath, this.filePath);
    });
    return this.writeQueue;
  }
}
