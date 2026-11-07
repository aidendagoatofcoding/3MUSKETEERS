# 3MUSKETTERS

A JavaScript multiplayer historical-fantasy action game prototype. This scaffold includes a canvas client, Node.js/Socket.IO multiplayer backend, server-simulated movement and combat, persistent guest profiles, themed mobs, and the complete starter sword and musket catalogue.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open <http://localhost:3000> in multiple browser tabs to test multiplayer. Use WASD or the arrow keys to move. Guest progress is saved in `data/profiles.json`; the reconnect token is stored in that browser's local storage. Clearing site data removes access to that guest profile. This is prototype guest authentication, not production account recovery.

## Weapon catalogue

`server/src/weapons.js` defines each listed sword and musket as an individual catalogue entry with rarity, icon, combat stats, projectile/orbit properties, and a special-effect label where applicable. Mob loot has the same shared 50% chance for every mob. If the roll succeeds, its own conditional loot table selects a signature item or a weapon category; item rarity is rolled independently of mob rarity. The catalogue rarity provides baseline weapon identity, while the independent loot rarity is applied to the awarded item.

The player starts with a Redcoat Saber and Brown Bess. Muskets target nearby mobs and fire visible server-simulated projectiles; swords deal server-validated orbit-range damage. The current prototype does not yet include a full inventory/equipment management screen or manual weapon swapping.

## Scope and limitations

Multiplayer is real for clients connected to the same running server. This is an early prototype, not a production deployment: it has no account recovery, database service, moderation, distributed world hosting, or production-grade anti-cheat. The guest token is a bearer credential; keep it private. Swords and muskets use stylized game mechanics and do not simulate real-world firearm operation.
