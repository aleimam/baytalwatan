# tools — data & map build scripts

Scripts used to generate the app's data and maps from the NUCA portal. Kept for provenance and to refresh the snapshot.

- **`tilesrcs.json`** — mapping of each zone id → its deep-zoom tile-source path on lands.nuca.gov.eg.
- **`fetch-maps.js`** — downloads each zone's public OpenSeadragon tiles and stitches them into a single high-res JPG (`maps/zone_<id>.jpg`). Uses `jimp` (pure JS, no native deps).
- **`build-db.js`** — parses the source CSV (`data/…csv`) and emits `db/lands.db` (SQLite), `assets/data.js` (static fallback), and `db/import_mysql.sql` (MySQL/MariaDB). Uses `sql.js` (WASM).

## Usage
```bash
cd tools
npm install
# refresh maps (writes to ../maps by default — adjust the OUT path in fetch-maps.js)
node fetch-maps.js
# rebuild DB + data.js + MySQL dump from the CSV (adjust CSV/APP paths at the top)
node build-db.js
```

> The path constants near the top of each script were set for the original build machine; tweak them to your checkout location before running. The committed `db/lands.db`, `assets/data.js`, and `maps/*.jpg` are already built — you only need these to refresh from a newer CSV.

**Data snapshot:** 2026-06-20 · 4,543 plots · 22 cities · 48 zones.
