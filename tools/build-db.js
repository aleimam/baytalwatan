// Build lands.db (SQLite) + data.js (static fallback) + import_mysql.sql from the CSV.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const CSV = 'C:/Claude/Beit/NUCA_Stage11_AvailableLands_2026-06-20.csv';
const APP = 'C:/Claude/Beit/landsapp';

const CITY_EN = {
  'القاهرة الجديدة':'New Cairo','بدر':'Badr','الشيخ زايد':'Sheikh Zayed','دمياط الجديدة':'New Damietta',
  'المنيا الجديدة':'New Minya','أسوان الجديدة':'New Aswan','السادس من اكتوبر':'6th of October','أسيوط الجديدة':'New Assiut',
  'العبور':'Obour','السادات':'Sadat','الشروق':'Shorouk','العبور الجديدة':'New Obour','سوهاج الجديدة':'New Sohag',
  'المنصورة الجديدة':'New Mansoura','العاشر من رمضان':'10th of Ramadan','15 مايو':'15th of May','أكتوبر الجديدة':'New October',
  'العلمين الجديدة':'New Alamein','برج العرب الجديدة':'New Borg El Arab','سفنكس الجديدة':'New Sphinx',
  'أخميم الجديدة':'New Akhmim','الفيوم الجديدة':'New Fayoum'
};

function parseCSV(str){
  if(str.charCodeAt(0)===0xFEFF) str=str.slice(1);
  const rows=[]; let row=[],f='',q=false;
  for(let i=0;i<str.length;i++){const c=str[i];
    if(q){ if(c==='"'){ if(str[i+1]==='"'){f+='"';i++;} else q=false;} else f+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(f);f='';} else if(c==='\r'){} else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';} else f+=c; }
  }
  if(f.length||row.length){row.push(f);rows.push(row);}
  return rows;
}
const num=v=>{const n=parseFloat(String(v).replace(/,/g,'').trim());return isFinite(n)?n:0;};

(async()=>{
  const raw=parseCSV(fs.readFileSync(CSV,'utf8')).filter(r=>r.length>1);
  raw.shift(); // header
  // CSV cols: city, project, zoneId, block, plot, area, basePerM, corner, garden, sea, totalPerM, totalPrice, down
  const recs=raw.map((r,i)=>({
    id:i+1, city:r[0].trim(), city_en:CITY_EN[r[0].trim()]||r[0].trim(), project:r[1].trim(),
    zone_id:num(r[2]), block:r[3].trim(), plot:num(r[4]), area:num(r[5]), base_per_m:num(r[6]),
    corner:num(r[7]), garden:num(r[8]), sea:num(r[9]), total_per_m:num(r[10]), total_price:num(r[11]), down_payment:num(r[12]),
    has_premium:(num(r[7])>0||num(r[8])>0||num(r[9])>0)?1:0, map_file:'zone_'+num(r[2])+'.jpg'
  }));

  // ---- SQLite ----
  const SQL=await initSqlJs();
  const db=new SQL.Database();
  db.run(`CREATE TABLE plots(
    id INTEGER PRIMARY KEY, city TEXT, city_en TEXT, project TEXT, zone_id INTEGER, block TEXT, plot INTEGER,
    area REAL, base_per_m REAL, corner REAL, garden REAL, sea REAL, total_per_m REAL, total_price REAL,
    down_payment REAL, has_premium INTEGER, map_file TEXT);`);
  const cols=['id','city','city_en','project','zone_id','block','plot','area','base_per_m','corner','garden','sea','total_per_m','total_price','down_payment','has_premium','map_file'];
  const stmt=db.prepare('INSERT INTO plots VALUES ('+cols.map(()=>'?').join(',')+')');
  db.run('BEGIN');
  recs.forEach(r=>stmt.run(cols.map(c=>r[c])));
  db.run('COMMIT'); stmt.free();
  ['city','zone_id','total_per_m','area','total_price','has_premium','plot'].forEach(c=>db.run(`CREATE INDEX idx_${c} ON plots(${c});`));
  fs.mkdirSync(APP+'/db',{recursive:true});
  fs.writeFileSync(APP+'/db/lands.db', Buffer.from(db.export()));

  // ---- static fallback data.js ----
  const flat=recs.map(r=>cols.slice(1).map(c=>r[c])); // drop id
  fs.mkdirSync(APP+'/assets',{recursive:true});
  fs.writeFileSync(APP+'/assets/data.js',
    'window.LANDS_COLS='+JSON.stringify(cols.slice(1))+';\n'+
    'window.LANDS_ROWS='+JSON.stringify(flat)+';\n'+
    'window.LANDS_META='+JSON.stringify({rows:recs.length,snapshot:'2026-06-20',cityEn:CITY_EN})+';\n');

  // ---- MySQL import ----
  const esc=v=>typeof v==='number'?v:("'"+String(v).replace(/'/g,"''").replace(/\\/g,'\\\\')+"'");
  let sql='SET NAMES utf8mb4;\nDROP TABLE IF EXISTS plots;\n'+
    'CREATE TABLE plots(\n id INT PRIMARY KEY, city VARCHAR(80), city_en VARCHAR(80), project VARCHAR(255), zone_id INT,\n'+
    ' block VARCHAR(120), plot INT, area DECIMAL(10,2), base_per_m DECIMAL(12,2), corner DECIMAL(12,2), garden DECIMAL(12,2),\n'+
    ' sea DECIMAL(12,2), total_per_m DECIMAL(12,2), total_price DECIMAL(14,2), down_payment DECIMAL(14,2),\n'+
    ' has_premium TINYINT, map_file VARCHAR(40),\n INDEX(city), INDEX(zone_id), INDEX(total_per_m), INDEX(area), INDEX(total_price)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n';
  const chunk=500;
  for(let i=0;i<recs.length;i+=chunk){
    const vals=recs.slice(i,i+chunk).map(r=>'('+cols.map(c=>esc(r[c])).join(',')+')').join(',\n');
    sql+='INSERT INTO plots VALUES\n'+vals+';\n';
  }
  fs.writeFileSync(APP+'/db/import_mysql.sql', sql);

  console.log(JSON.stringify({plots:recs.length, dbKB:Math.round(fs.statSync(APP+'/db/lands.db').size/1024), dataJsKB:Math.round(fs.statSync(APP+'/assets/data.js').size/1024), mysqlKB:Math.round(fs.statSync(APP+'/db/import_mysql.sql').size/1024)}));
})();
