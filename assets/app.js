/* ============ NUCA Lands app — list, filter, sort, map viewer ============ */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const NUMCOLS = ['zone_id','plot','area','base_per_m','corner','garden','sea','total_per_m','total_price','down_payment','has_premium'];
const fmt = n => (n==null||n===''||isNaN(n)) ? '—' : Math.round(Number(n)).toLocaleString('en-US');
const fmt1 = n => (n==null||isNaN(n)) ? '—' : Number(n).toLocaleString('en-US',{maximumFractionDigits:1});
const compact = n => { n=Number(n); const a=Math.abs(n); if(a>=1e9)return (n/1e9).toFixed(2)+'B'; if(a>=1e6)return (n/1e6).toFixed(1)+'M'; if(a>=1e3)return (n/1e3).toFixed(0)+'K'; return Math.round(n).toString(); };
function normalize(r){ NUMCOLS.forEach(c=>{ if(r[c]!=null) r[c]=Number(r[c]); }); return r; }

/* ---------- local (static) engine over data.js ---------- */
const COLS = window.LANDS_COLS || [];
const REC = (window.LANDS_ROWS || []).map((row,i)=>{ const o={id:i}; COLS.forEach((c,j)=>o[c]=row[j]); return o; });
function localMeta(){
  const cityMap={};
  REC.forEach(r=>{ (cityMap[r.city]=cityMap[r.city]||{name:r.city,en:r.city_en,count:0,value:0,area:0}); const o=cityMap[r.city]; o.count++; o.value+=r.total_price; o.area+=r.area; });
  const cities=Object.values(cityMap).sort((a,b)=>b.count-a.count);
  const f=k=>REC.map(r=>r[k]);
  const mm=k=>[Math.min(...f(k)),Math.max(...f(k))];
  return {totals:{plots:REC.length,cities:cities.length,zones:new Set(f('zone_id')).size,projects:new Set(f('project')).size,area:REC.reduce((s,r)=>s+r.area,0),value:REC.reduce((s,r)=>s+r.total_price,0)},
    cities, ranges:{amin:mm('area')[0],amax:mm('area')[1],pmin:mm('total_per_m')[0],pmax:mm('total_per_m')[1],tmin:mm('total_price')[0],tmax:mm('total_price')[1],dmin:mm('down_payment')[0],dmax:mm('down_payment')[1]}};
}
function localFilter(p){
  const cities = p.cities? new Set(String(p.cities).split(',')) : null;
  const q = p.q? String(p.q).toLowerCase() : null;
  return REC.filter(r=>{
    if(cities && !cities.has(r.city)) return false;
    if(p.pmin!=null&&p.pmin!==''&&r.total_per_m<+p.pmin) return false;
    if(p.pmax!=null&&p.pmax!==''&&r.total_per_m>+p.pmax) return false;
    if(p.amin!=null&&p.amin!==''&&r.area<+p.amin) return false;
    if(p.amax!=null&&p.amax!==''&&r.area>+p.amax) return false;
    if(p.tmin!=null&&p.tmin!==''&&r.total_price<+p.tmin) return false;
    if(p.tmax!=null&&p.tmax!==''&&r.total_price>+p.tmax) return false;
    if(p.dmin!=null&&p.dmin!==''&&r.down_payment<+p.dmin) return false;
    if(p.dmax!=null&&p.dmax!==''&&r.down_payment>+p.dmax) return false;
    if(p.prem==='any'&&!r.has_premium) return false;
    if(p.prem==='none'&&r.has_premium) return false;
    if(p.prem==='corner'&&!(r.corner>0)) return false;
    if(p.prem==='garden'&&!(r.garden>0)) return false;
    if(p.prem==='sea'&&!(r.sea>0)) return false;
    if(q && !((r.city+' '+r.block+' '+r.project+' '+r.plot).toLowerCase().includes(q))) return false;
    return true;
  });
}
function localQuery(p){
  let rows=localFilter(p);
  const sort=p.sort||'total_price', dir=(p.dir==='asc')?1:-1;
  rows=rows.slice().sort((a,b)=>{ let x=a[sort],y=b[sort]; if(typeof x==='string') return dir*String(x).localeCompare(String(y),'ar'); return dir*((x||0)-(y||0)); });
  const total=rows.length, per=+p.per||50, page=+p.page||1, pages=Math.max(1,Math.ceil(total/per));
  return {total,page,per,pages,rows:rows.slice((page-1)*per,(page-1)*per+per)};
}

/* ---------- data layer (API or fallback) ---------- */
const Lands = {
  useApi:null,
  async detect(){ try{ const j=await (await fetch('api.php?action=ping',{cache:'no-store'})).json(); this.useApi=!!(j&&j.ok); }catch(e){ this.useApi=false; } return this.useApi; },
  async meta(){ if(this.useApi){ try{ return await (await fetch('api.php?action=meta')).json(); }catch(e){ this.useApi=false; } } return localMeta(); },
  async query(p){ if(this.useApi){ try{ const j=await (await fetch('api.php?action=plots&'+new URLSearchParams(p))).json(); j.rows=j.rows.map(normalize); return j; }catch(e){ this.useApi=false; } } return localQuery(p); },
  async all(p){ if(this.useApi){ try{ const j=await (await fetch('api.php?action=plots&'+new URLSearchParams(Object.assign({},p,{per:6000,page:1})))).json(); return j.rows.map(normalize); }catch(e){ this.useApi=false; } } return localFilter(p); }
};

/* ---------- filter state ---------- */
const F = {cities:new Set(), pMin:'',pMax:'',aMin:'',aMax:'',tMin:'',tMax:'',dMin:'',dMax:'',prem:'',q:'',sort:'total_price',dir:'desc',page:1,per:50};
let META=null, ALL_CITIES=[], curRows=[];
const SORTCOLS=[['total_price','السعر الإجمالي'],['total_per_m','سعر المتر الإجمالي'],['area','المساحة'],['plot','رقم القطعة'],['city','المدينة'],['zone_id','المنطقة'],['base_per_m','سعر المتر الأساسى'],['down_payment','الدفعة المقدمة'],['corner','تميّز ناصية'],['garden','تميّز حدائق'],['sea','تميّز بحر/نيل']];
const TCOLS=[['city','المدينة'],['block','المربع'],['plot','القطعة'],['area','المساحة م²'],['base_per_m','سعر المتر الأساسى'],['prem','التميّز'],['total_per_m','سعر المتر الإجمالي'],['total_price','السعر الإجمالي'],['down_payment','الدفعة المقدمة'],['map','الخريطة']];

function params(forAll){
  const p={}; if(F.cities.size && F.cities.size!==ALL_CITIES.length) p.cities=[...F.cities].join(',');
  const mp={pMin:'pmin',pMax:'pmax',aMin:'amin',aMax:'amax',tMin:'tmin',tMax:'tmax',dMin:'dmin',dMax:'dmax'};
  for(const k in mp) if(F[k]!=='') p[mp[k]]=F[k];
  if(F.prem)p.prem=F.prem; if(F.q)p.q=F.q; p.sort=F.sort; p.dir=F.dir;
  if(!forAll){ p.page=F.page; p.per=F.per; } return p;
}

/* ---------- list view ---------- */
async function renderList(){
  const res = await Lands.query(params(false));
  curRows = res.rows;
  $('#countPill').innerHTML = `النتائج: <b>${fmt(res.total)}</b> قطعة` + (res.total!==META.totals.plots?` من ${fmt(META.totals.plots)}`:'');
  // header
  $('#tbl thead').innerHTML = '<tr>'+TCOLS.map(([k,t])=>{
    const sortable = k!=='prem'&&k!=='map';
    const ar = (sortable&&F.sort===k)?` <span class="ar">${F.dir==='asc'?'▲':'▼'}</span>`:'';
    return `<th data-k="${k}" ${sortable?'':'style="cursor:default"'}>${t}${ar}</th>`;
  }).join('')+'</tr>';
  // body
  $('#tbl tbody').innerHTML = curRows.map((r,i)=>{
    const prem=[r.corner>0?'<span class="tag cor">ناصية</span>':'',r.garden>0?'<span class="tag gar">حدائق</span>':'',r.sea>0?'<span class="tag sea">بحر</span>':''].join('')||'<span class="c-muted">—</span>';
    return `<tr>
      <td class="c-muted">${r.city}</td>
      <td class="c-muted">${r.block}</td>
      <td><a class="plotlink" data-i="${i}" title="عرض الخريطة">🗺️ ${r.plot}</a></td>
      <td>${fmt1(r.area)}</td>
      <td>${fmt(r.base_per_m)}</td>
      <td>${prem}</td>
      <td>${fmt(r.total_per_m)}</td>
      <td><b>${fmt(r.total_price)}</b></td>
      <td>${fmt(r.down_payment)}</td>
      <td><a class="plotlink" data-i="${i}">عرض ↗</a></td></tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--muted)">لا توجد نتائج مطابقة</td></tr>';
  $$('#tbl .plotlink').forEach(a=>a.onclick=()=>openMap(curRows[+a.dataset.i]));
  $$('#tbl thead th').forEach(th=>{ const k=th.dataset.k; if(k==='prem'||k==='map')return; th.onclick=()=>{ if(F.sort===k)F.dir=F.dir==='asc'?'desc':'asc'; else{F.sort=k;F.dir='desc';} F.page=1; syncSortControls(); renderList(); }; });
  renderPager(res);
}
function renderPager(res){
  const p=res.page,n=res.pages;
  $('#pager').innerHTML=`<button id="pFirst" ${p<=1?'disabled':''}>«</button><button id="pPrev" ${p<=1?'disabled':''}>السابق</button>
    <span>صفحة <input id="pInput" type="number" min="1" max="${n}" value="${p}"> من ${n}</span>
    <button id="pNext" ${p>=n?'disabled':''}>التالي</button><button id="pLast" ${p>=n?'disabled':''}>»</button>`;
  const go=v=>{ F.page=Math.max(1,Math.min(n,v)); renderList(); };
  $('#pFirst').onclick=()=>go(1); $('#pPrev').onclick=()=>go(p-1); $('#pNext').onclick=()=>go(p+1); $('#pLast').onclick=()=>go(n);
  $('#pInput').onchange=e=>go(+e.target.value||1);
}
function syncSortControls(){ $('#sortSel').value=F.sort; $('#dirBtn').textContent=F.dir==='asc'?'▲ تصاعدي':'▼ تنازلي'; }

/* ---------- map modal + pan/zoom viewer ---------- */
const V={scale:1,tx:0,ty:0,natW:0,natH:0,min:0.05};
const viewer=$('#viewer'), mImg=$('#mImg');
function vApply(){ mImg.style.transform=`translate(${V.tx}px,${V.ty}px) scale(${V.scale})`; }
function vFit(){ const vw=viewer.clientWidth,vh=viewer.clientHeight; if(!V.natW)return; const s=Math.min(vw/V.natW,vh/V.natH); V.min=s*0.9; V.scale=s; V.tx=(vw-V.natW*s)/2; V.ty=(vh-V.natH*s)/2; vApply(); }
function vZoom(cx,cy,factor){ const ns=Math.max(V.min,Math.min(10,V.scale*factor)); V.tx=cx-(cx-V.tx)*(ns/V.scale); V.ty=cy-(cy-V.ty)*(ns/V.scale); V.scale=ns; vApply(); }
mImg.onload=()=>{ V.natW=mImg.naturalWidth; V.natH=mImg.naturalHeight; vFit(); };
viewer.addEventListener('wheel',e=>{ e.preventDefault(); const r=viewer.getBoundingClientRect(); vZoom(e.clientX-r.left,e.clientY-r.top,e.deltaY<0?1.18:1/1.18); },{passive:false});
let drag=null;
viewer.addEventListener('pointerdown',e=>{ drag={x:e.clientX,y:e.clientY,tx:V.tx,ty:V.ty}; viewer.setPointerCapture(e.pointerId); viewer.classList.add('grabbing'); });
viewer.addEventListener('pointermove',e=>{ if(!drag)return; V.tx=drag.tx+(e.clientX-drag.x); V.ty=drag.ty+(e.clientY-drag.y); vApply(); });
viewer.addEventListener('pointerup',e=>{ drag=null; viewer.classList.remove('grabbing'); });
$('#mZoomIn').onclick=()=>vZoom(viewer.clientWidth/2,viewer.clientHeight/2,1.3);
$('#mZoomOut').onclick=()=>vZoom(viewer.clientWidth/2,viewer.clientHeight/2,1/1.3);
$('#mReset').onclick=vFit;
function openMap(r){
  const src='maps/'+r.map_file;
  $('#mTitle').textContent=`${r.city} — ${r.block}`;
  $('#mSub').textContent=`${r.project}`;
  $('#mOpen').href=src;
  $('#mHint').textContent=`ابحث عن رقم القطعة ${r.plot} على الخريطة`;
  $('#plotInfo').innerHTML=`
    <h4>رقم القطعة</h4><div class="big">${r.plot}</div>
    <h4>الموقع</h4>
    <div class="kv"><span>المدينة</span><span>${r.city}</span></div>
    <div class="kv"><span>المربع / الحي</span><span>${r.block}</span></div>
    <h4>المساحة والسعر</h4>
    <div class="kv"><span>المساحة</span><span>${fmt1(r.area)} م²</span></div>
    <div class="kv"><span>سعر المتر الأساسى</span><span>${fmt(r.base_per_m)}</span></div>
    <div class="kv"><span>سعر المتر الإجمالي</span><span>${fmt(r.total_per_m)}</span></div>
    <div class="kv"><span>السعر الإجمالي</span><span><b>${fmt(r.total_price)}</b></span></div>
    <div class="kv"><span>الدفعة المقدمة</span><span>${fmt(r.down_payment)}</span></div>
    <h4>التميّز</h4>
    <div class="kv"><span>ناصية</span><span>${r.corner>0?fmt(r.corner):'—'}</span></div>
    <div class="kv"><span>حدائق</span><span>${r.garden>0?fmt(r.garden):'—'}</span></div>
    <div class="kv"><span>بحر / نيل</span><span>${r.sea>0?fmt(r.sea):'—'}</span></div>
    <div class="locate">📍 الخريطة تعرض كامل المنطقة. استخدم عجلة الفأرة للتكبير واسحب للتنقل، وابحث عن رقم <b>${r.plot}</b>. القطع المتاحة مظللة بالأصفر في الخريطة الأصلية.</div>`;
  $('#mapModal').hidden=false;
  V.natW=0; mImg.src=src;
  if(mImg.complete && mImg.naturalWidth){ V.natW=mImg.naturalWidth; V.natH=mImg.naturalHeight; vFit(); }
}
function closeMap(){ $('#mapModal').hidden=true; mImg.src=''; }
$$('#mapModal [data-close]').forEach(el=>el.onclick=closeMap);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!$('#mapModal').hidden) closeMap(); });

/* ---------- filter UI ---------- */
function buildCityDropdown(){
  $('#cityList').innerHTML = META.cities.map(c=>`<label class="row"><input type="checkbox" value="${c.name}" ${F.cities.has(c.name)?'checked':''}><span>${c.name} <span class="c-muted">· ${c.count}</span></span></label>`).join('');
  $$('#cityList input').forEach(cb=>cb.onchange=()=>{ cb.checked?F.cities.add(cb.value):F.cities.delete(cb.value); cityBtnTxt(); F.page=1; renderList(); });
}
function cityBtnTxt(){ $('#cityBtnTxt').textContent = F.cities.size===ALL_CITIES.length?'كل المدن':(F.cities.size===0?'لا مدن':`${F.cities.size} مدن`); }
function buildSortSelect(){ $('#sortSel').innerHTML=SORTCOLS.map(([k,t])=>`<option value="${k}">${t}</option>`).join(''); syncSortControls(); }
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function wireFilters(){
  $('#cityBtn').onclick=()=>$('#cityPanel').classList.toggle('open');
  document.addEventListener('click',e=>{ if(!e.target.closest('.city-dd'))$('#cityPanel').classList.remove('open'); });
  $('#cityAll').onclick=()=>{ F.cities=new Set(ALL_CITIES); buildCityDropdown(); cityBtnTxt(); F.page=1; renderList(); };
  $('#cityNone').onclick=()=>{ F.cities=new Set(); buildCityDropdown(); cityBtnTxt(); F.page=1; renderList(); };
  const bind={pMin:'#pMin',pMax:'#pMax',aMin:'#aMin',aMax:'#aMax',tMin:'#tMin',tMax:'#tMax',dMin:'#dMin',dMax:'#dMax'};
  for(const k in bind) $(bind[k]).oninput=debounce(e=>{ F[k]=e.target.value; F.page=1; renderList(); },250);
  $('#premSel').onchange=e=>{ F.prem=e.target.value; F.page=1; renderList(); };
  $('#searchBox').oninput=debounce(e=>{ F.q=e.target.value; F.page=1; renderList(); },250);
  $('#sortSel').onchange=e=>{ F.sort=e.target.value; F.page=1; syncSortControls(); renderList(); };
  $('#dirBtn').onclick=()=>{ F.dir=F.dir==='asc'?'desc':'asc'; F.page=1; syncSortControls(); renderList(); };
  $('#perSel').onchange=e=>{ F.per=+e.target.value; F.page=1; renderList(); };
  $('#resetBtn').onclick=()=>{ Object.assign(F,{cities:new Set(ALL_CITIES),pMin:'',pMax:'',aMin:'',aMax:'',tMin:'',tMax:'',dMin:'',dMax:'',prem:'',q:'',sort:'total_price',dir:'desc',page:1}); ['#pMin','#pMax','#aMin','#aMax','#tMin','#tMax','#dMin','#dMax','#searchBox'].forEach(s=>$(s).value=''); $('#premSel').value=''; buildCityDropdown(); cityBtnTxt(); buildSortSelect(); renderList(); };
  $('#exportBtn').onclick=exportCSV;
}
async function exportCSV(){
  const rows=await Lands.all(params(true));
  const cols=['city','project','zone_id','block','plot','area','base_per_m','corner','garden','sea','total_per_m','total_price','down_payment'];
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const csv='﻿'+cols.join(',')+'\r\n'+rows.map(r=>cols.map(c=>(typeof r[c]==='number'||/^[\d.]+$/.test(r[c]))?r[c]:q(r[c])).join(',')).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='NUCA_lands_filtered.csv'; a.click();
}

/* ---------- tabs + theme ---------- */
let analyticsLoaded=false;
async function showView(v){
  $$('.tab').forEach(t=>t.classList.toggle('on',t.dataset.view===v));
  $('#view-list').hidden=v!=='list'; $('#view-analytics').hidden=v!=='analytics';
  if(v==='analytics'){ const rows=await Lands.all(params(true)); $('#anFilterHint').innerHTML=`التحليلات محسوبة على <b>${fmt(rows.length)}</b> قطعة ضمن التصفية الحالية.`; Analytics.render(rows); analyticsLoaded=true; }
}
$$('.tab').forEach(t=>t.onclick=()=>showView(t.dataset.view));
$('#themeBtn').onclick=()=>{ document.body.classList.toggle('light'); $('#themeBtn').textContent=document.body.classList.contains('light')?'🌙':'☀️'; if(!$('#view-analytics').hidden && analyticsLoaded) Lands.all(params(true)).then(r=>Analytics.render(r,true)); };

function renderFooter(){
  $('#foot').innerHTML=`<b>المصدر:</b> بوابة هيئة المجتمعات العمرانية الجديدة — «المرحلة الحادية عشر» · <b>اللقطة:</b> ٢٠٢٦/٠٦/٢٠ (تتغيّر القطع مع إتمام الحجوزات) · <b>القيم المالية:</b> كما هي منشورة بالبوابة · <b>التغطية:</b> ${fmt(META.totals.cities)} مدينة · ${fmt(META.totals.zones)} منطقة · ${fmt(META.totals.plots)} قطعة · وضع البيانات: <b>${Lands.useApi?'قاعدة بيانات (PHP)':'محلي'}</b>`;
}

/* ---------- init ---------- */
(async()=>{
  await Lands.detect();
  META=await Lands.meta();
  ALL_CITIES=META.cities.map(c=>c.name);
  F.cities=new Set(ALL_CITIES);
  buildCityDropdown(); cityBtnTxt(); buildSortSelect(); wireFilters(); renderFooter();
  await renderList();
})();
window.addEventListener('resize',()=>{ if(!$('#mapModal').hidden) vFit(); });
