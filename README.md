# 3MUSKETTERS

A JavaScript multiplayer historical-fantasy action game prototype. This first scaffold includes a browser canvas client, a Node.js/Socket.IO backend, server-simulated movement and mob combat, guest accounts, and JSON-backed player persistence.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open <http://localhost:3000> in multiple browser tabs to test multiplayer. Use WASD or the arrow keys to move. The server creates a persistent guest account on first connection; its private reconnect token is kept in that browser's local storage. Clearing site data removes access to that guest account, so this is a prototype, not production authentication.

## Current prototype scope

- Real-time players in one shared world via Socket.IO.
- Server-authoritative movement, basic orbit-sword mob damage, XP/level progression, and loot rolls.
- One historical-fantasy enemy archetype and an intentionally small starter inventory.
- Account progress saved in `data/profiles.json` (created on first run).
- A responsive canvas HUD and connection status.

Multiplayer is real for clients connected to the same running server. This starter is not yet a production deployment: it has no account recovery, database service, moderation, distributed world hosting, or production-grade anti-cheat. The prototype guest token is a bearer credential; keep it private.

## Backend notes

The shared mob item-drop chance is configured in `server/src/config.js` (`BASE_ITEM_DROP_CHANCE`). The global item-rarity weights are in the same file and normalized by the server before rolling. Mob rarity and item rarity are separate values. The persistence layer writes through a temporary file before renaming it.

## Next milestones

1. Add inventory/equipment UI and item definitions.
2. Add multiple themed mob types and per-mob conditional loot tables.
3. Add musket projectiles, armor, upgrades, worlds, and portals.
4. Replace JSON persistence and prototype guest authentication before public production use.
