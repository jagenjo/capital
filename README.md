# Capital

A turn-based, multiplayer, browser-based business game inspired by *Capitalism* (1995).
One turn = one month of game time. Plan everything (build, hire, set prices, orders, suppliers, ads, loans),
press **End turn**, and the month is simulated. The server also plays one turn automatically every day (configurable).

Stack: TypeScript, Node.js (Express), Vite, Canvas2D. Art: sprites/photos extracted from the original game (`tools/extract.py`).

## Run

```bash
npm install
npm run dev            # server on :3001 + Vite on :5173  → open http://localhost:5173
# or production:
npm run build && npm start   # everything on http://localhost:3001
```

Admin panel: `/admin.html` (password `admin`, override with `ADMIN_PASSWORD=...`).
Create a game there (name, **join password**, starting cash, AI companies, length, win goal, auto-turn interval, ready-advance…).
Players open `/`, enter a name + personal password (same pair logs you back in), the game password, and join.

Data is saved as JSON in `data/games/` (override with `DATA_DIR`).

## Game overview

* **World**: one procedural 400×240 tilemap (seas, beaches, farmland, forests, hills, mountains, oil fields, snow peaks). Cities are just groups of downtown/suburb tiles in the same map, ports sit on the coast and roads connect the cities. Every tile is a lot you can buy and build on. The client renders a 1-pixel-per-tile world image (minimap, and used when zoomed far out) plus a detailed zoom view.
* **Buildings**: Farm (grain/livestock), Logging camp, Iron mine, Oil well, Factory (16 products with recipes), Retail store (6 shelves), R&D lab. Factories have a 3×3 facility layout: cells (production lines, import cells, robotics, warehouse, branding, R&D bench, quality control) connected by clicking the borders (or the diagonals in the corners) between them, with workers assigned per slot. Import cells buy one product from a chosen source; a production line makes its product from the products of the cells linked to it, so lines can feed other lines (e.g. electronics made inside a car factory).
* **Micromanagement**: per-building workers & wages (labour pool per city, wage competition, quitting), maintenance %, condition,
  production lines, automation, target %, open-market list price, per-input supplier choice (nothing is bought without an explicit source: a harbour import, your own factory, or a factory that sells to everyone),
  per-shelf product/price/order/supplier, store size, research projects, advertising budgets per product, loans & overdraft, taxes.
* **Economy**: cities buy consumer goods; shelves compete on price, quality (tech + input quality), brand and location against an NPC retailer.
  Transport costs by distance, spoilage, seasonal farming, random events (drought, oil shock, recession…).
* **Win**: reach the net-worth goal first, or be richest when the game length ends. Three consecutive months of negative net worth = bankruptcy.
* **AI companies** fill the market, supply raw goods/intermediates and compete in retail.

`npm run sim` runs a headless economy simulation (AI only) for balance checks.

## Tile art

`art/tilesheet.png` is a strict atlas: every cell is exactly 64×64 px on an 8-column grid with no gaps, labels or margins (512 px wide), and `art/tilesheet.json` lists each cell's row/col, group and name. It shows every map tile as the game draws it (several variants each, all road and railway shapes, resource icons, building markers, layout modules and the minimap pixel colours). The live version is the page `/tiles.html` (source: `client/src/tilesheet.ts`, tile drawing: `drawTile()` in `client/src/worldmap.ts`).
