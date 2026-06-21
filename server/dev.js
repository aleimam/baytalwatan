/* Local dev launcher only — sets env then starts server.js.
   Production runs server.js directly via systemd with real env (see server/README). */
const path = require('path'), fs = require('fs');
process.env.WEBROOT  = process.env.WEBROOT  || path.join(__dirname, '..');
process.env.PORT     = process.env.PORT     || '8088';
process.env.DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', '_localdata');
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
require('./server.js');
