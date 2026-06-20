// Download NUCA deep-zoom tiles (public) and stitch each zone into a single JPG.
const fs = require('fs');
const path = require('path');
const https = require('https');
const Jimp = require('jimp');

const PRE = 'https://lands.nuca.gov.eg/Images/DataImages/June26/';
const OUT = 'C:/Claude/Beit/maps';
fs.mkdirSync(OUT, { recursive: true });

const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'tilesrcs.json'), 'utf8'));

function get(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = n => {
      https.get(url, res => {
        if (res.statusCode !== 200) { res.resume(); if (n > 0) return setTimeout(() => attempt(n - 1), 300); return reject(new Error(res.statusCode + ' ' + url)); }
        const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', e => { if (n > 0) return setTimeout(() => attempt(n - 1), 300); reject(e); });
    };
    attempt(retries);
  });
}

async function buildZone(zid, p) {
  const outFile = path.join(OUT, 'zone_' + zid + '.jpg');
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 5000) {
    return { zid, skipped: true };
  }
  const baseDir = PRE + p + '/GeneratedImages/';
  const xml = (await get(baseDir + 'dzc_output.xml')).toString();
  const ts = +xml.match(/TileSize="(\d+)"/)[1];
  const ov = +xml.match(/Overlap="(\d+)"/)[1];
  const fmt = xml.match(/Format="(\w+)"/)[1];
  const W = +xml.match(/Width="(\d+)"/)[1];
  const H = +xml.match(/Height="(\d+)"/)[1];
  const maxLevel = Math.ceil(Math.log2(Math.max(W, H)));
  const cols = Math.ceil(W / ts), rows = Math.ceil(H / ts);
  const tilesBase = baseDir + 'dzc_output_files/' + maxLevel + '/';

  const canvas = new Jimp(W, H, 0xffffffff);
  const jobs = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) jobs.push([c, r]);

  let i = 0, failed = 0;
  const CONC = 24;
  async function worker() {
    while (i < jobs.length) {
      const [c, r] = jobs[i++];
      const url = tilesBase + c + '_' + r + '.' + fmt;
      try {
        const tile = await Jimp.read(await get(url));
        const lx = c > 0 ? ov : 0, ty = r > 0 ? ov : 0;
        canvas.composite(tile, c * ts - lx, r * ts - ty);
      } catch (e) { failed++; }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  await canvas.quality(82).writeAsync(outFile);
  return { zid, W, H, tiles: jobs.length, failed, kb: Math.round(fs.statSync(outFile).size / 1024) };
}

(async () => {
  const manifest = [];
  let done = 0;
  for (const { zid, p } of list) {
    try {
      const r = await buildZone(zid, p);
      manifest.push(r);
      done++;
      console.log(`[${done}/${list.length}] zone_${zid}.jpg ` + (r.skipped ? 'skip' : `${r.W}x${r.H} ${r.kb}KB${r.failed ? ' (failed tiles: ' + r.failed + ')' : ''}`));
    } catch (e) {
      manifest.push({ zid, error: String(e).slice(0, 80) });
      console.log(`[ERR] zone_${zid}: ${e.message}`);
    }
    fs.writeFileSync(path.join(OUT, 'maps-manifest.json'), JSON.stringify(manifest, null, 1));
  }
  const ok = manifest.filter(m => m.W || m.skipped).length;
  console.log(`DONE: ${ok}/${list.length} maps in ${OUT}`);
})();
