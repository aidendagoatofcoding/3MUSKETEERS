# 3MUSKETTERS

A real-time, server-authoritative multiplayer top-down action game with historical-fantasy soldiers. The player is a yellow circle soldier with eyes who wears whatever armor, helmet and cape they have equipped. Swords orbit the player, muskets fire visible projectiles, themed mobs drop loot, and progress persists on the server.

Built with Node.js, Express and Socket.IO. The client is a plain canvas app served from `public/`.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

Or with Docker from the Base44 environment (host port 3000). No database or external service is required; profiles persist to `data/profiles.json`.

```bash
npm run check    # parse-check the server modules and the browser client
```

## Deploy (Render)

`render.yaml` is a Render Blueprint for the public build: a free Node web service that runs `npm ci`, starts with `npm start` (the app reads `PORT`), and health-checks `/health`.

1. Push this branch to GitHub.
2. In Render, choose **New → Blueprint**, select the `3MUSKETTERS` repository and this branch, then **Apply**.
3. Render builds the app and gives you a public `https://<name>.onrender.com` URL with WebSocket support for multiplayer.

Free-tier caveats: the service sleeps after 15 minutes without traffic (the next visit takes about a minute to wake), and free instances have no persistent disk, so `data/profiles.json` resets on every restart, deploy or wake — guest progress is lost. A paid instance with a disk keeps profiles.

## Controls

- **WASD / arrow keys** — move
- **E** — enter a nearby portal
- **Esc** — close a menu

Open **MENU** for Worlds, Inventory, Upgrades, Crafting, Clans, Factions, Leaderboard, Collection and Settings. Equipment and combat are automatic: orbiting swords collide with enemies, muskets target nearby enemies and fire on their own.

## Implemented systems

- **Multiplayer and persistence** — real shared world through Socket.IO. All movement, attacks, damage, loot rolls, crafting, XP, coins and equipment changes are validated and stored server-side. Guest progress is tied to a private bearer token in the browser.
- **Eleven worlds with portals** — British Countryside, Japanese Province, European Battlefield, Medieval Kingdom, Pirate Islands, Desert Empire, Frozen Fortress, Volcanic Stronghold, Crystal Caverns, Shadow Realm and Celestial Empire. Portals are physical objects in the world; the Worlds menu is a second route. Levels gate entry. Shadow Realm and Volcanic Stronghold enable PvP outside the spawn safe zone.
- **66 themed mobs and 10 bosses** — British, Japanese, medieval, pirate and European soldiers plus living weapons and armor. No nature-themed enemies. Bosses spawn on a timer, announce themselves, have large health bars, shockwave attacks, and exclusive loot.
- **Swords, muskets, armor and cosmetics** — the full sword and musket catalogues from the design brief, with per-item damage, cooldowns, ranges, projectile counts, pierce and effects. Armor covers helmet, cuirass, greaves, boots and cape, affects health/damage reduction/move speed, and changes the soldier's drawn appearance. Three pieces of one set grant a set bonus; five double it. Cosmetics never add combat stats.
- **Loot rules** — every ordinary mob uses the same configurable `BASE_ITEM_DROP_CHANCE` (50%). Mob rarity never changes that roll. If the roll succeeds, the item comes from that mob's individual loot table (signature weapon most likely). Item rarity is rolled independently with the full eleven-rarity distribution, so a common mob can drop something Celestial. Drops are rarity-colored, owned briefly by the killer, then become free for others; each drop is awarded exactly once.
- **Levelling and upgrades** — XP per kill, level-based upgrade points, and nine upgrades (speed, health, regeneration, inventory, damage, attack speed, crit, XP gain, loot luck). Rank costs climb as ranks rise.
- **Inventory, collection and equipment limits** — filters, item detail, stat comparison, equip/unequip, capacity limits, and a 223-entry collection with undiscovered silhouettes.
- **Crafting** — combine any three swords, muskets or armor of the same rarity with coins. Success odds follow the brief (Common→Unusual 90% down to Divine→Celestial 1%). Rolls happen on the server, failed attempts consume the items, and history is recorded.
- **Clans** — create with a name, tag, color and description; open join list; member roles (Leader, Officer, Member); promotion/demotion/kick permissions; clan chat; clan score and leaderboard. Leaders leaving promotes the next member.
- **Factions** — eight selectable factions with colors and emblems that contribute to a faction leaderboard. Weapons are not faction-restricted.
- **PvP** — sword and musket combat against other players in PvP worlds, spawn protection, safe zones, protection indicators, and a partial XP-loss rule on death (10% of current XP, never a wipe).
- **UI** — canvas HUD (health, XP, level, coins, capacity, equipped gear), minimap, boss bar, damage numbers, loot labels, portal prompts, toasts, and functional menus for every system. Sound effects and ambient music are synthesized with WebAudio and configurable in Settings.

## Balance constants

Most tuning lives in `server/src/config.js`:

- `BASE_ITEM_DROP_CHANCE` — shared 50% drop roll for every mob
- `ITEM_RARITY_WEIGHTS` — item rarity distribution
- `RARITY_SCALE` / `RARITY_COLORS` — rarity stat scaling and colors
- `BOSS_FIRST_SPAWN_MS`, `BOSS_RESPAWN_MS`, `MOBS_PER_WORLD`, `SAFE_ZONE_RADIUS`
- `SWORD_SLOTS`, `MUSKET_SLOTS`, `BASE_INVENTORY`, `CLAN_CREATE_COST`

Mob definitions and per-mob loot tables are in `server/src/mobs.js`; worlds and portal links in `server/src/worlds.js`; armor sets, materials, cosmetics and rarity rolls in `server/src/items.js`; upgrades, crafting odds and computed stats in `server/src/progression.js`.

## Known limitations

This is a game prototype, not a production service: guest tokens are bearer credentials, profiles are a single JSON file (not a database), there is no account recovery or moderation, and the world runs on one process. Coliseum-style group raids, territory competition and account linking are not implemented.
