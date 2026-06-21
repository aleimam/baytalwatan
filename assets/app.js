/* ============ NUCA Lands app — list, filter, sort, map viewer ============ */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const NUMCOLS = ['zone_id','plot','area','base_per_m','corner','garden','sea','total_per_m','total_price','down_payment','has_premium'];
const fmt = n => (n==null||n===''||isNaN(n)) ? '—' : Math.round(Number(n)).toLocaleString('en-US');
const fmt1 = n => (n==null||isNaN(n)) ? '—' : Number(n).toLocaleString('en-US',{maximumFractionDigits:1});
const compact = n => { n=Number(n); const a=Math.abs(n); if(a>=1e9)return (n/1e9).toFixed(2)+'B'; if(a>=1e6)return (n/1e6).toFixed(1)+'M'; if(a>=1e3)return (n/1e3).toFixed(0)+'K'; return Math.round(n).toString(); };
function normalize(r){ NUMCOLS.forEach(c=>{ if(r[c]!=null) r[c]=Number(r[c]); }); r.premCount=(r.corner>0?1:0)+(r.garden>0?1:0)+(r.sea>0?1:0); return r; }

/* ---------- local (static) engine over data.js ---------- */
const COLS = window.LANDS_COLS || [];
const REC = (window.LANDS_ROWS || []).map((row,i)=>{ const o={id:i}; COLS.forEach((c,j)=>o[c]=row[j]); o.premCount=(o.corner>0?1:0)+(o.garden>0?1:0)+(o.sea>0?1:0); return o; });
const plotKey = r => r.zone_id+'-'+r.plot;
const plotByKey = {}; REC.forEach(r=>{ plotByKey[plotKey(r)]=r; });
window.plotKey = plotKey; window.plotByKey = plotByKey;
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
    if(p.block && r.block!==p.block) return false;
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
  const sort=(p.sort==='premium')?'premCount':(p.sort||'total_price'), dir=(p.dir==='asc')?1:-1;
  rows=rows.slice().sort((a,b)=>{ let x=a[sort],y=b[sort],c; if(typeof x==='string') c=String(x).localeCompare(String(y),'ar'); else c=(x||0)-(y||0); if(c===0&&sort==='premCount') c=(a.total_price||0)-(b.total_price||0); return dir*c; });
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
const F = {cities:new Set(), block:'', pMin:'',pMax:'',aMin:'',aMax:'',tMin:'',tMax:'',dMin:'',dMax:'',prem:'',q:'',sort:'total_price',dir:'desc',page:1,per:50};
let META=null, ALL_CITIES=[], curRows=[];
const SORTCOLS=[['total_price','s_total'],['total_per_m','s_perm'],['premium','s_premium'],['area','s_area'],['plot','s_plot'],['city','s_city'],['zone_id','s_zone'],['base_per_m','s_base'],['down_payment','s_down'],['corner','s_corner'],['garden','s_garden'],['sea','s_sea']];
const TCOLS=[['wish','t_wish'],['city','t_city'],['block','t_block'],['plot','t_plot'],['area','t_area'],['base_per_m','t_base'],['prem','t_prem'],['total_per_m','t_perm'],['total_price','t_total'],['down_payment','t_down'],['map','t_map']];
let colVis = (function(){ try{ const s=JSON.parse(localStorage.getItem('bw_cols')); if(Array.isArray(s)&&s.length){ const set=new Set(s.filter(k=>TCOLS.some(c=>c[0]===k))); if(!localStorage.getItem('bw_cols_wish')){ set.add('wish'); try{localStorage.setItem('bw_cols_wish','1'); localStorage.setItem('bw_cols',JSON.stringify([...set]));}catch(e){} } return set; } }catch(e){} return new Set(TCOLS.map(c=>c[0])); })();
const visTCOLS = () => TCOLS.filter(c=>colVis.has(c[0]));
function premTags(r){ return [r.corner>0?`<span class="tag cor">${t('tag_corner')}</span>`:'',r.garden>0?`<span class="tag gar">${t('tag_garden')}</span>`:'',r.sea>0?`<span class="tag sea">${t('tag_sea')}</span>`:''].join('')||'<span class="c-muted">—</span>'; }
function cellFor(r,k,i){ switch(k){
  case 'wish': return `<td class="wish-cell"><button class="wish-heart${(window.Wish&&Wish.has(plotKey(r)))?' on':''}" data-wk="${plotKey(r)}" title="${t('wl_save')}" aria-label="${t('wl_save')}">♥</button></td>`;
  case 'city': return `<td class="c-muted">${r.city}</td>`;
  case 'block': return `<td class="c-muted">${r.block}</td>`;
  case 'plot': return `<td><a class="plotlink" data-i="${i}" title="${t('show_map')}">🗺️ ${r.plot}</a></td>`;
  case 'area': return `<td>${fmt1(r.area)}</td>`;
  case 'base_per_m': return `<td>${fmt(r.base_per_m)}</td>`;
  case 'prem': return `<td>${premTags(r)}</td>`;
  case 'total_per_m': return `<td>${fmt(r.total_per_m)}</td>`;
  case 'total_price': return `<td><b>${fmt(r.total_price)}</b></td>`;
  case 'down_payment': return `<td>${fmt(r.down_payment)}</td>`;
  case 'map': return `<td><a class="plotlink" data-i="${i}">${t('view')} ↗</a></td>`;
  default: return '<td></td>';
}}

function params(forAll){
  const p={}; if(F.cities.size && F.cities.size!==ALL_CITIES.length) p.cities=[...F.cities].join(',');
  if(F.block) p.block=F.block;
  const mp={pMin:'pmin',pMax:'pmax',aMin:'amin',aMax:'amax',tMin:'tmin',tMax:'tmax',dMin:'dmin',dMax:'dmax'};
  for(const k in mp) if(F[k]!=='') p[mp[k]]=F[k];
  if(F.prem)p.prem=F.prem; if(F.q)p.q=F.q; p.sort=F.sort; p.dir=F.dir;
  if(!forAll){ p.page=F.page; p.per=F.per; } return p;
}

/* ---------- list view ---------- */
async function renderList(){
  if(typeof closeWishPop==='function') closeWishPop();   // a re-render detaches the anchored hearts
  const res = await Lands.query(params(false));
  curRows = res.rows;
  $('#countPill').innerHTML = `${t('results')}: <b>${fmt(res.total)}</b> ${t('plots_u')}` + (res.total!==META.totals.plots?` ${t('of_')} ${fmt(META.totals.plots)}`:'');
  const cols = visTCOLS();
  // header
  $('#tbl thead').innerHTML = '<tr>'+cols.map(([k,lbl])=>{
    const sk = k==='prem'?'premium':k;
    const sortable = k!=='map' && k!=='wish';
    const ar = (sortable&&F.sort===sk)?` <span class="ar">${F.dir==='asc'?'▲':'▼'}</span>`:'';
    return `<th data-k="${k}" ${sortable?'':'style="cursor:default"'} title="${sortable?t('click_sort'):''}">${t(lbl)}${ar}</th>`;
  }).join('')+'</tr>';
  // body
  $('#tbl tbody').innerHTML = curRows.map((r,i)=>'<tr>'+cols.map(([k])=>cellFor(r,k,i)).join('')+'</tr>').join('')
    || `<tr><td colspan="${cols.length}" style="text-align:center;padding:30px;color:var(--muted)">${t('no_results')}</td></tr>`;
  $$('#tbl .plotlink').forEach(a=>a.onclick=()=>openMap(curRows[+a.dataset.i]));
  $$('#tbl .wish-heart').forEach(b=>b.onclick=e=>{ e.stopPropagation(); openWishPop(b, b.dataset.wk); });
  $$('#tbl thead th').forEach(th=>{ const k=th.dataset.k; if(k==='map'||k==='wish')return; const sk=k==='prem'?'premium':k; th.onclick=()=>{ if(F.sort===sk)F.dir=F.dir==='asc'?'desc':'asc'; else{F.sort=sk;F.dir='desc';} F.page=1; syncSortControls(); renderList(); }; });
  renderPager(res);
}
window.refreshWishHearts=function(){ if(window.Wish) $$('#tbl .wish-heart').forEach(b=>b.classList.toggle('on', Wish.has(b.dataset.wk))); };
/* ---------- wishlist picker popover (heart click → choose a list) ---------- */
let WISH_POP=null;
function closeWishPop(){ if(!WISH_POP) return; WISH_POP.remove(); WISH_POP=null; document.removeEventListener('mousedown',onWishPopOutside,true); document.removeEventListener('keydown',onWishPopKey,true); window.removeEventListener('scroll',closeWishPop,true); }
function onWishPopOutside(e){ if(WISH_POP && !WISH_POP.contains(e.target) && !(e.target.classList&&e.target.classList.contains('wish-heart'))) closeWishPop(); }
function onWishPopKey(e){ if(e.key==='Escape') closeWishPop(); }
function placeWishPop(pop, rect){
  const w=pop.offsetWidth||230, h=pop.offsetHeight||260;   // offsetWidth forces layout, so min-width is applied
  let left=window.scrollX+rect.left;
  if(left+w > window.scrollX+window.innerWidth-8) left=window.scrollX+rect.right-w;   // overflow right → align right edge to anchor (open leftward)
  left=Math.max(window.scrollX+8, left);
  let top=window.scrollY+rect.bottom+6;
  if(top+h > window.scrollY+window.innerHeight-8) top=window.scrollY+rect.top-h-6;     // overflow bottom → flip above the anchor
  top=Math.max(window.scrollY+8, top);
  pop.style.left=left+'px'; pop.style.top=top+'px';
}
function openWishPop(anchor, key){
  closeWishPop();
  const r=window.plotByKey&&window.plotByKey[key]; if(!r||!window.Wish) return;
  const pop=document.createElement('div'); pop.className='wish-pop'; pop.id='wishPop';
  pop.innerHTML='<div class="wish-pop-inner"></div>';
  document.body.appendChild(pop); WISH_POP=pop;
  const rect=anchor.getBoundingClientRect();
  Wish.renderControl(pop.querySelector('.wish-pop-inner'), r);   // sets the loading state synchronously, then fills async
  placeWishPop(pop, rect);                                       // place now (min-width is known)
  setTimeout(()=>{ if(WISH_POP===pop) placeWishPop(pop, rect); }, 140);   // re-clamp once the lists finish loading (height may grow)
  setTimeout(()=>{ if(!WISH_POP) return; document.addEventListener('mousedown',onWishPopOutside,true); document.addEventListener('keydown',onWishPopKey,true); window.addEventListener('scroll',closeWishPop,true); },0);
}
function renderPager(res){
  const p=res.page,n=res.pages;
  $('#pager').innerHTML=`<button id="pFirst" ${p<=1?'disabled':''}>«</button><button id="pPrev" ${p<=1?'disabled':''}>${t('prev')}</button>
    <span>${t('page')} <input id="pInput" type="number" min="1" max="${n}" value="${p}"> ${t('of_')} ${n}</span>
    <button id="pNext" ${p>=n?'disabled':''}>${t('next')}</button><button id="pLast" ${p>=n?'disabled':''}>»</button>`;
  const go=v=>{ F.page=Math.max(1,Math.min(n,v)); renderList(); };
  $('#pFirst').onclick=()=>go(1); $('#pPrev').onclick=()=>go(p-1); $('#pNext').onclick=()=>go(p+1); $('#pLast').onclick=()=>go(n);
  $('#pInput').onchange=e=>go(+e.target.value||1);
}
function syncSortControls(){ $('#sortSel').value=F.sort; $('#dirBtn').textContent=F.dir==='asc'?t('dir_asc'):t('dir_desc'); }

/* ---------- map modal + pan/zoom viewer ---------- */
const V={scale:1,tx:0,ty:0,natW:0,natH:0,min:0.05};
const viewer=$('#viewer'), mImg=$('#mImg');
function vApply(){ mImg.style.transform=`translate(${V.tx}px,${V.ty}px) scale(${V.scale})`; }
function vFit(){ const vw=viewer.clientWidth,vh=viewer.clientHeight; if(!V.natW||!vw||!vh)return; const s=Math.min(vw/V.natW,vh/V.natH); V.min=s*0.9; V.scale=s; V.tx=(vw-V.natW*s)/2; V.ty=(vh-V.natH*s)/2; vApply(); }
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
// keep the overlay buttons from starting a map drag / pan
$('#mapZoom').addEventListener('pointerdown',e=>e.stopPropagation());
function openMap(r){
  if(typeof closeWishPop==='function') closeWishPop();
  const src='maps/'+r.map_file;
  $('#mTitle').textContent=`${r.city} — ${r.block}`;
  $('#mSub').textContent=`${r.project}`;
  $('#mOpen').href=src;
  $('#mHint').textContent=`${t('m_find')} ${r.plot} ${t('m_on_map')}`;
  const br = window.Terms && Terms.forPlot(r.city, r.block);
  const brBlock = br ? `
    <h4>${t('br_title')}</h4>
    ${br.area?`<div class="kv"><span>${t('br_area')}</span><span>${br.area}</span></div>`:''}
    <div class="kv"><span>${t('br_ratio')}</span><span>${br.ratio}</span></div>
    <div class="kv"><span>${t('br_floors')}</span><span>${br.floors}</span></div>
    <div class="kv"><span>${t('br_setbacks')}</span><span>${br.f} / ${br.b} / ${br.s} م</span></div>
    <div class="kv"><span class="c-muted" style="font-size:11px">${t('br_fbs')}</span><span></span></div>
    <a class="br-link" id="brLink">↗ ${t('br_seeterms')}</a>` : '';
  $('#plotInfo').innerHTML=`
    <h4>${t('m_plotno')}</h4><div class="big">${r.plot}</div>
    <div id="wishControl" class="wish-control wish-top"></div>
    <h4>${t('m_location')}</h4>
    <div class="kv"><span>${t('t_city')}</span><span>${r.city}</span></div>
    <div class="kv"><span>${t('t_block')}</span><span>${r.block}</span></div>
    <h4>${t('m_areaprice')}</h4>
    <div class="kv"><span>${t('t_area')}</span><span>${fmt1(r.area)} م²</span></div>
    <div class="kv"><span>${t('t_base')}</span><span>${fmt(r.base_per_m)}</span></div>
    <div class="kv"><span>${t('t_perm')}</span><span>${fmt(r.total_per_m)}</span></div>
    <div class="kv"><span>${t('t_total')}</span><span><b>${fmt(r.total_price)}</b></span></div>
    <div class="kv"><span>${t('t_down')}</span><span>${fmt(r.down_payment)}</span></div>
    <h4>${t('f_premium')}</h4>
    <div class="kv"><span>${t('p_corner')}</span><span>${r.corner>0?fmt(r.corner):'—'}</span></div>
    <div class="kv"><span>${t('p_garden')}</span><span>${r.garden>0?fmt(r.garden):'—'}</span></div>
    <div class="kv"><span>${t('p_sea')}</span><span>${r.sea>0?fmt(r.sea):'—'}</span></div>
    ${brBlock}
    <div class="locate">📍 ${t('m_locate')}</div>`;
  const bl=$('#brLink'); if(bl) bl.onclick=()=>{ closeMap(); showView('terms'); };
  if(window.Wish) Wish.renderControl($('#wishControl'), r);
  $('#mapModal').hidden=false;
  V.natW=0; mImg.src=src;
  // cached image: complete is true synchronously, but the just-shown modal hasn't laid out yet
  // (viewer width can be 0 → scale 0 = blank map). Defer the fit to the next frame.
  if(mImg.complete && mImg.naturalWidth){ V.natW=mImg.naturalWidth; V.natH=mImg.naturalHeight; requestAnimationFrame(vFit); }
}
function closeMap(){ $('#mapModal').hidden=true; mImg.src=''; }
$$('#mapModal [data-close]').forEach(el=>el.onclick=closeMap);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!$('#mapModal').hidden) closeMap(); });

/* ---------- reactive filtering (applies to whichever view is active) ---------- */
function currentView(){ for(const n of VIEWS){ const el=document.getElementById('view-'+n); if(el && !el.hidden) return n; } return 'list'; }
function updateCount(n){ if(!META) return; $('#countPill').innerHTML=`${t('results')}: <b>${fmt(n)}</b> ${t('plots_u')}` + (n!==META.totals.plots?` ${t('of_')} ${fmt(META.totals.plots)}`:''); }
function applyFilters(){ F.page=1; renderChips(); renderCrumb(); buildAreaSelect(); const v=currentView(); if(v==='list') renderList(); else reRenderAnalytics(); }
function renderChips(){
  if(!META) return;
  const chips=[];
  if(F.cities.size && F.cities.size!==ALL_CITIES.length) chips.push([`${t('f_city')}: ${F.cities.size===1?[...F.cities][0]:F.cities.size}`,()=>{F.cities=new Set(ALL_CITIES);F.block='';buildCityDropdown();cityBtnTxt();if(Analytics&&Analytics.setBreakdown)Analytics.setBreakdown(currentBdDim());}]);
  if(F.block) chips.push([`${t('t_block')}: ${F.block}`,()=>{F.block='';if(Analytics&&Analytics.setBreakdown)Analytics.setBreakdown(currentBdDim());}]);
  const rng=(a,b,lbl)=>{ if(F[a]!==''||F[b]!=='') chips.push([`${lbl}: ${F[a]||'…'}–${F[b]||'…'}`,()=>{F[a]='';F[b]='';$('#'+a).value='';$('#'+b).value='';}]); };
  rng('pMin','pMax',t('f_perm')); rng('aMin','aMax',t('f_area')); rng('tMin','tMax',t('f_total')); rng('dMin','dMax',t('f_down'));
  if(F.prem){ const o=$('#premSel').selectedOptions[0]; chips.push([`${t('f_premium')}: ${o?o.textContent:F.prem}`,()=>{F.prem='';$('#premSel').value='';}]); }
  if(F.q) chips.push([`${t('f_search')}: ${F.q}`,()=>{F.q='';$('#searchBox').value='';}]);
  const el=$('#filterChips'); if(!el) return;
  el.innerHTML=chips.map((c,i)=>`<span class="chip" data-i="${i}">${c[0]} <b>✕</b></span>`).join('');
  el.querySelectorAll('.chip').forEach(ch=>ch.onclick=()=>{ chips[+ch.dataset.i][1](); applyFilters(); });
}
/* ---------- drill cascade: City → Block → plots (breakdown auto-advances) ---------- */
function currentBdDim(){ return F.cities.size!==1 ? 'city' : 'block'; }   // not-one-city → city level; one city → its blocks
function cascadeDrill(dim,key){
  if(dim==='city'){ F.cities=new Set([key]); buildCityDropdown(); cityBtnTxt(); F.block=''; }
  else if(dim==='block'){ F.block=key; }
  if(Analytics && Analytics.setBreakdown) Analytics.setBreakdown(currentBdDim());
  applyFilters();
}
function cascadePop(level){            // -1 = all, 0 = city, 1 = block
  if(level<1) F.block='';
  if(level<0){ F.cities=new Set(ALL_CITIES); buildCityDropdown(); cityBtnTxt(); }
  if(Analytics && Analytics.setBreakdown) Analytics.setBreakdown(currentBdDim());
  applyFilters();
}
function renderCrumb(){
  const el=$('#drillCrumb'); if(!el) return;
  const segs=[{label:t('crumb_all'),level:-1}];
  if(F.cities.size===1) segs.push({label:[...F.cities][0],level:0});
  if(F.block) segs.push({label:F.block,level:1});
  if(segs.length===1){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='';
  el.innerHTML = segs.map((s,i)=>`<span class="crumb-seg${i===segs.length-1?' on':''}" data-level="${s.level}">${i===0?'🏠 ':''}${s.label}</span>`).join('<span class="crumb-sep">‹</span>')
    + (F.block?` <a class="crumb-plots" id="crumbPlots">${t('view_plots')} ↗</a>`:'');
  el.querySelectorAll('.crumb-seg').forEach(s=>s.onclick=()=>cascadePop(+s.dataset.level));
  const cp=el.querySelector('#crumbPlots'); if(cp) cp.onclick=()=>showView('list');
}
window.onDrill=function(dim,key,range){
  if(dim==='city'||dim==='block'){ cascadeDrill(dim,key); return; }
  if(dim==='project'){ F.q=key; $('#searchBox').value=key; }
  else if(dim==='premium'){ F.prem = key==='0'?'none':'any'; $('#premSel').value=F.prem; }
  else if(dim==='premtype'){ F.prem = key; $('#premSel').value=key; }
  else if(range){ const map={price:['pMin','pMax'],total:['tMin','tMax'],area:['aMin','aMax'],down:['dMin','dMax']}; const mm=map[dim]; if(mm){ F[mm[0]]=range[0]; F[mm[1]]=range[1]>=1e9?'':range[1]; $('#'+mm[0]).value=F[mm[0]]; $('#'+mm[1]).value=F[mm[1]]; } }
  applyFilters();
};

/* ---------- filter UI ---------- */
function buildCityDropdown(){
  $('#cityList').innerHTML = META.cities.map(c=>`<label class="row"><input type="checkbox" value="${c.name}" ${F.cities.has(c.name)?'checked':''}><span>${c.name} <span class="c-muted">· ${c.count}</span></span></label>`).join('');
  $$('#cityList input').forEach(cb=>cb.onchange=()=>{ cb.checked?F.cities.add(cb.value):F.cities.delete(cb.value); cityBtnTxt(); applyFilters(); });
}
function cityBtnTxt(){ $('#cityBtnTxt').textContent = F.cities.size===ALL_CITIES.length?t('all_cities'):(F.cities.size===0?t('no_cities'):`${F.cities.size} ${t('cities_n')}`); }
function buildSortSelect(){ $('#sortSel').innerHTML=SORTCOLS.map(([k,lbl])=>`<option value="${k}">${t(lbl)}</option>`).join(''); syncSortControls(); }
function buildColChooser(){
  const el=$('#colList'); if(!el) return;
  el.innerHTML = TCOLS.map(([k,lbl])=>`<label class="row"><input type="checkbox" value="${k}" ${colVis.has(k)?'checked':''}><span>${t(lbl)}</span></label>`).join('');
  el.querySelectorAll('input').forEach(cb=>cb.onchange=()=>{
    if(cb.checked) colVis.add(cb.value);
    else { if(colVis.size<=1){ cb.checked=true; return; } colVis.delete(cb.value); }
    try{ localStorage.setItem('bw_cols', JSON.stringify([...colVis])); }catch(e){}
    renderList();
  });
}
function buildAreaSelect(){
  const sel=$('#areaSel'); if(!sel||!META) return;
  const cities = (F.cities.size && F.cities.size!==ALL_CITIES.length) ? F.cities : null;
  const blocks = [...new Set(REC.filter(r=>!cities||cities.has(r.city)).map(r=>r.block))].sort((a,b)=>String(a).localeCompare(String(b),'ar'));
  if(F.block && blocks.indexOf(F.block)<0) F.block='';
  sel.innerHTML = `<option value="">${t('all_areas')}</option>` + blocks.map(b=>`<option value="${String(b).replace(/"/g,'&quot;')}"${b===F.block?' selected':''}>${b}</option>`).join('');
}
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function wireFilters(){
  $('#cityBtn').onclick=()=>$('#cityPanel').classList.toggle('open');
  document.addEventListener('click',e=>{ if(!e.target.closest('.city-dd'))$('#cityPanel').classList.remove('open'); });
  $('#colBtn').onclick=e=>{ e.stopPropagation(); $('#colPanel').classList.toggle('open'); };
  document.addEventListener('click',e=>{ if(!e.target.closest('.col-dd'))$('#colPanel').classList.remove('open'); });
  buildColChooser();
  $('#cityAll').onclick=()=>{ F.cities=new Set(ALL_CITIES); buildCityDropdown(); cityBtnTxt(); applyFilters(); };
  $('#cityNone').onclick=()=>{ F.cities=new Set(); buildCityDropdown(); cityBtnTxt(); applyFilters(); };
  const bind={pMin:'#pMin',pMax:'#pMax',aMin:'#aMin',aMax:'#aMax',tMin:'#tMin',tMax:'#tMax',dMin:'#dMin',dMax:'#dMax'};
  for(const k in bind) $(bind[k]).oninput=debounce(e=>{ F[k]=e.target.value; applyFilters(); },250);
  $('#premSel').onchange=e=>{ F.prem=e.target.value; applyFilters(); };
  $('#areaSel').onchange=e=>{ F.block=e.target.value; if(Analytics&&Analytics.setBreakdown)Analytics.setBreakdown(currentBdDim()); applyFilters(); };
  $('#searchBox').oninput=debounce(e=>{ F.q=e.target.value; applyFilters(); },250);
  $('#sortSel').onchange=e=>{ F.sort=e.target.value; F.page=1; syncSortControls(); renderList(); };
  $('#dirBtn').onclick=()=>{ F.dir=F.dir==='asc'?'desc':'asc'; F.page=1; syncSortControls(); renderList(); };
  $('#perSel').onchange=e=>{ F.per=+e.target.value; F.page=1; renderList(); };
  $('#resetBtn').onclick=()=>{ Object.assign(F,{cities:new Set(ALL_CITIES),block:'',pMin:'',pMax:'',aMin:'',aMax:'',tMin:'',tMax:'',dMin:'',dMax:'',prem:'',q:'',sort:'total_price',dir:'desc',page:1}); ['#pMin','#pMax','#aMin','#aMax','#tMin','#tMax','#dMin','#dMax','#searchBox'].forEach(s=>$(s).value=''); $('#premSel').value=''; if(Analytics&&Analytics.setBreakdown)Analytics.setBreakdown('city'); buildCityDropdown(); cityBtnTxt(); buildSortSelect(); applyFilters(); };
  $('#exportBtn').onclick=exportCSV;
}
async function exportCSV(){
  const rows=await Lands.all(params(true));
  const cols=['city','project','zone_id','block','plot','area','base_per_m','corner','garden','sea','total_per_m','total_price','down_payment'];
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const csv='﻿'+cols.join(',')+'\r\n'+rows.map(r=>cols.map(c=>(typeof r[c]==='number'||/^[\d.]+$/.test(r[c]))?r[c]:q(r[c])).join(',')).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='NUCA_lands_filtered.csv'; a.click();
}

/* ---------- tabs / theme / language ---------- */
const VIEWS=['list','analytics','premium','terms','wish','admin','shared'];
function sharedParams(){ const sp=new URLSearchParams(location.search); if(sp.get('wl')===null) return null; return { keys:(sp.get('wl')||'').split(',').filter(Boolean), name:sp.get('n')||'' }; }
function renderSharedFromUrl(){ const p=sharedParams(); if(p && window.Wish && Wish.renderShared) Wish.renderShared($('#sharedBody'), p.keys, p.name); }
async function reRenderAnalytics(){
  const v=currentView(); if(!['analytics','premium'].includes(v)) return;
  const rows=await Lands.all(params(true)); updateCount(rows.length);
  if(v==='analytics'){ $('#anFilterHint').innerHTML=`${t('an_filter_hint')} <b>${fmt(rows.length)}</b> ${t('within_filter')}`; Analytics.render(rows,true); }
  else if(v==='premium'){ $('#prHint').innerHTML=`<b>${fmt(rows.length)}</b>`; Analytics.renderPremium(rows,true); }
}
async function showView(v){
  $$('.tab').forEach(el=>el.classList.toggle('on',el.dataset.view===v));
  VIEWS.forEach(n=>{ const el=document.getElementById('view-'+n); if(el) el.hidden=n!==v; });
  document.body.classList.toggle('on-list', v==='list');
  document.body.classList.toggle('on-shared', v==='shared');
  if(v==='list'){ renderList(); }
  else if(v==='analytics'||v==='premium'){
    const rows=await Lands.all(params(true)); updateCount(rows.length);
    if(v==='analytics'){ $('#anFilterHint').innerHTML=`${t('an_filter_hint')} <b>${fmt(rows.length)}</b> ${t('within_filter')}`; Analytics.render(rows,true); }
    else if(v==='premium'){ $('#prHint').innerHTML=`<b>${fmt(rows.length)}</b>`; Analytics.renderPremium(rows,true); }
  }
  if(v==='terms' && window.Terms) Terms.render($('#termsBody'));
  if(v==='wish' && window.Wish) Wish.render($('#wishBody'));
  if(v==='admin' && window.Admin && Admin.render) Admin.render();
  if(v==='shared') renderSharedFromUrl();
}
$$('.tab').forEach(el=>el.onclick=()=>showView(el.dataset.view));
$('#themeBtn').onclick=()=>{ document.body.classList.toggle('dark'); $('#themeBtn').textContent=document.body.classList.contains('dark')?'☀️':'🌙'; reRenderAnalytics(); };
$('#langBtn').onclick=()=>{ I18N.set(I18N.lang==='ar'?'en':'ar'); applyLang(); };
function applyLang(){
  I18N.applyStatic();
  $('#langBtn').textContent=I18N.t('lang_btn');
  $$('#authLang button').forEach(b=>b.classList.toggle('on', b.dataset.setlang===I18N.lang));
  if(SETTINGS) applySettings(SETTINGS);
  if(typeof APP_INITED!=='undefined' && APP_INITED){ cityBtnTxt(); buildSortSelect(); buildColChooser(); renderFooter(); renderList(); reRenderAnalytics(); if(currentView()==='terms' && window.Terms) Terms.render($('#termsBody')); if(currentView()==='shared') renderSharedFromUrl(); }
}
let SETTINGS=null;
function applySettings(s){
  if(!s) return; SETTINGS=s;
  if(s.site_title) $('#siteTitle').textContent=s.site_title;
  const subEl=$('#siteSub'), sub=(I18N.lang==='en'?s.site_sub_en:s.site_sub_ar);
  if(sub){ subEl.removeAttribute('data-i18n'); subEl.textContent=sub; } else { subEl.setAttribute('data-i18n','brand_sub'); subEl.textContent=I18N.t('brand_sub'); }
  if(s.accent) document.documentElement.style.setProperty('--accent',s.accent);
  [['analytics',s.show_analytics],['premium',s.show_premium]].forEach(([v,on])=>{ const tab=document.querySelector(`.tab[data-view="${v}"]`); if(tab) tab.style.display=(on==='0'?'none':''); });
}

function renderFooter(){
  $('#foot').innerHTML=`<b>${t('foot_source')}</b> ${t('foot_src_v')} · <b>${t('foot_snapshot')}</b> ${t('foot_snap_v')} · ${t('foot_money')} · ${fmt(META.totals.cities)} ${t('k_cities')} · ${fmt(META.totals.zones)} ${t('k_zones')} · ${fmt(META.totals.plots)} ${t('plots_u')} · ${t('foot_mode')} <b>${Lands.useApi?t('mode_db'):t('mode_local')}</b>`;
}

/* ---------- account gate ---------- */
const Auth = {
  user:null,
  async check(){ try{ const j=await (await fetch('api/auth?action=me',{cache:'no-store'})).json(); if(j&&j.auth){ this.user=j.user; return true; } }catch(e){} return false; },
  async post(action,data){ try{ const j=await (await fetch('api/auth?action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json(); if(j&&j.auth){ this.user=j.user; return {ok:true}; } return {ok:false,error:(j&&j.error)||'تعذّر إتمام العملية'}; }catch(e){ return {ok:false,error:'تعذّر الاتصال بالخادم — حدّث الصفحة وحاول مجدداً'}; } },
  logout(){ fetch('api/auth?action=logout',{method:'POST'}).finally(()=>location.reload()); }
};
window.Auth = Auth;
let APP_INITED=false;
async function initApp(){
  if(APP_INITED) return; APP_INITED=true;
  await Lands.detect();
  META=await Lands.meta();
  ALL_CITIES=META.cities.map(c=>c.name);
  F.cities=new Set(ALL_CITIES);
  document.body.classList.add('on-list');
  buildCityDropdown(); cityBtnTxt(); buildSortSelect(); buildAreaSelect(); wireFilters(); renderFooter(); renderChips();
  if(window.Wish){ try{ await Wish.load(); }catch(e){} }
  await renderList();
}
/* ---------- 60-second grace period before the gate ---------- */
const GRACE_MS=180000; let GRACE_TIMER=null;
function showGate(){ if(Auth.user) return; const g=$('#authGate'); if(g) g.style.display=''; }
function startGrace(){
  let started=+(sessionStorage.getItem('bw_grace_start')||0);
  if(!started){ started=Date.now(); try{ sessionStorage.setItem('bw_grace_start',String(started)); }catch(e){} }
  const remaining=Math.max(0, GRACE_MS-(Date.now()-started));
  if(remaining<=0){ showGate(); return; }
  GRACE_TIMER=setTimeout(showGate, remaining);
}
function enterApp(){
  if(GRACE_TIMER){ clearTimeout(GRACE_TIMER); GRACE_TIMER=null; }
  const g=$('#authGate'); if(g) g.style.display='none';
  const ua=$('#userArea'); if(ua && Auth.user){ ua.hidden=false; $('#userName').textContent=Auth.user.full_name||Auth.user.email; }
  if(Auth.user && Auth.user.role==='admin'){ const at=document.querySelector('.tab.admin-only'); if(at) at.hidden=false; if(window.Admin) Admin.user=Auth.user; }
  return initApp();
}
function wireAuth(){
  $$('#authLang button').forEach(b=>b.onclick=()=>{ I18N.set(b.dataset.setlang); applyLang(); });
  $$('.auth-tab').forEach(b=>b.onclick=()=>{ $$('.auth-tab').forEach(x=>x.classList.toggle('on',x===b)); $('#loginForm').hidden=b.dataset.form!=='login'; $('#registerForm').hidden=b.dataset.form!=='register'; });
  const submit=async(form,errId,action,fields)=>{ const er=$(errId), btn=form.querySelector('button[type=submit]'); er.textContent=''; btn.disabled=true; const d={}; fields.forEach(f=>d[f]=form[f].value); const r=await Auth.post(action,d); btn.disabled=false; if(r.ok){ if(window.Wish){ try{ await Wish.migrate(); }catch(e){} } enterApp(); if(window.refreshWishHearts) refreshWishHearts(); } else er.textContent=r.error; };
  $('#loginForm').onsubmit=e=>{ e.preventDefault(); submit(e.target,'#loginErr','login',['email','password']); };
  $('#registerForm').onsubmit=e=>{ e.preventDefault(); submit(e.target,'#registerErr','register',['full_name','email','phone','password']); };
  const lb=$('#logoutBtn'); if(lb) lb.onclick=()=>Auth.logout();
}
applyLang();
fetch('api/admin?action=settings_get').then(r=>r.json()).then(j=>{ if(j&&j.settings) applySettings(j.settings); }).catch(()=>{});
(async()=>{ wireAuth(); const g=$('#authGate'); if(g) g.style.display='none'; const authed=await Auth.check(); await enterApp(); if(sharedParams()) showView('shared'); if(!authed) startGrace(); })();
window.addEventListener('resize',()=>{ if(!$('#mapModal').hidden) vFit(); });
