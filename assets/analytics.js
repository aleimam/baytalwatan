/* ============ Analytics (ECharts) — fed by the app's filtered rows ============ */
const Analytics = (() => {
  const charts = {};
  let DATA = [], CITY_COLOR = {}, cityOrder = [], metric = 'count';
  const PALETTE = ['#061e48','#307e30','#cca248','#3b6fb0','#7b6cc4','#2a9d8f','#d08a3c','#9c4f6e','#5b9be0','#a0883f'];
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = n => (n==null||isNaN(n))?'—':Math.round(Number(n)).toLocaleString('en-US');
  const compact = n => { n=Number(n); const a=Math.abs(n); if(a>=1e9)return (n/1e9).toFixed(2)+'B'; if(a>=1e6)return (n/1e6).toFixed(1)+'M'; if(a>=1e3)return (n/1e3).toFixed(0)+'K'; return Math.round(n).toString(); };
  function hslToHex(h,s,l){ s/=100;l/=100; const k=n=>(n+h/30)%12; const a=s*Math.min(l,1-l); const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1)); const x=n=>Math.round(255*f(n)).toString(16).padStart(2,'0'); return '#'+x(0)+x(8)+x(4); }
  const quantile=(s,q)=>{ if(!s.length)return 0; const p=(s.length-1)*q,b=Math.floor(p),r=p-b; return s[b+1]!==undefined?s[b]+r*(s[b+1]-s[b]):s[b]; };
  const median=a=>quantile([...a].sort((x,y)=>x-y),.5);
  function tip(extra){ return Object.assign({backgroundColor:css('--card'),borderColor:css('--line'),textStyle:{color:css('--txt'),fontSize:12.5,fontFamily:'Segoe UI,Tahoma'},extraCssText:'box-shadow:0 6px 22px rgba(0,0,0,.35);border-radius:10px'},extra||{}); }
  const axc=()=>css('--muted2'), txc=()=>css('--muted'), grid={left:8,right:18,top:16,bottom:8,containLabel:true};
  function mk(id){ let c=charts[id]; if(c) return c; c=echarts.init(document.getElementById(id)); const o=c.setOption.bind(c); c.setOption=(opt,nm)=>{ if(opt&&typeof opt==='object')opt.animation=false; return o(opt,nm); }; charts[id]=c; return c; }

  function colors(){
    cityOrder=[...new Set(DATA.map(r=>r.city))].sort((a,b)=>DATA.filter(r=>r.city===b).length-DATA.filter(r=>r.city===a).length);
    const n=cityOrder.length||1; CITY_COLOR={}; cityOrder.forEach((c,i)=>CITY_COLOR[c]=hslToHex((i*360/n+18)%360,70,60));
  }
  function kpiHtml(el,cards){ document.getElementById(el).innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div><div class="sub">${c[2]||''}</div></div>`).join(''); }
  const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
  function topListEl(id,rows,premium){
    const head = `<th>${t('t_city')}</th><th>${t('t_plot')}</th><th>${t('t_area')}</th>`
      + (premium?`<th>${t('types_n')}</th>`:'')
      + `<th>${t('t_down')}</th><th>${t('t_total')}</th>`;
    const body=rows.map((r,i)=>`<tr><td class="c">${r.city}</td>`
      + `<td class="num"><a class="plotlink" data-i="${i}" title="${t('show_map')}">🗺️ ${r.plot}</a></td>`
      + `<td class="num">${fmt(r.area)}</td>`
      + (premium?`<td class="num">${r.premCount}</td>`:'')
      + `<td class="num">${fmt(r.down_payment)}</td>`
      + `<td class="num">${fmt(r.total_price)}</td></tr>`).join('');
    const el=document.getElementById(id); if(!el) return;
    el.innerHTML=`<table class="mini"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    el.querySelectorAll('.plotlink').forEach(a=>a.onclick=()=>{ const r=rows[+a.dataset.i]; if(window.openMap) window.openMap(r); });
  }
  function kpis(){
    const d=DATA, area=d.reduce((s,r)=>s+r.area,0), val=d.reduce((s,r)=>s+r.total_price,0), down=d.reduce((s,r)=>s+r.down_payment,0);
    kpiHtml('kpis',[[t('k_plots'),fmt(d.length),t('plots_u')],[t('k_cities'),new Set(d.map(r=>r.city)).size,''],[t('k_zones'),new Set(d.map(r=>r.zone_id)).size,''],
      [t('k_area'),compact(area)+' م²',fmt(area)],[t('k_value'),compact(val),''],[t('k_avgperm'),area?fmt(val/area):'—',t('k_weighted')],
      [t('k_avgarea'),d.length?fmt(area/d.length)+' م²':'—',''],[t('k_down'),compact(down),fmt(d.filter(r=>r.has_premium).length)+' '+t('k_premiumed')]]);
  }
  /* ---- flexible breakdown by any dimension (clickable to filter) ---- */
  let bdDim='city';
  const DIMS=[['city','dim_city'],['block','dim_block'],['project','dim_project'],['premium','dim_premium'],['price','dim_priceband'],['total','dim_totalband'],['area','dim_areaband'],['down','dim_downband']];
  const BANDS={ price:[['<150',0,150],['150–250',150,250],['250–400',250,400],['400–550',400,550],['≥550',550,1e9]],
    total:[['<150K',0,15e4],['150–300K',15e4,3e5],['300–500K',3e5,5e5],['500K–1M',5e5,1e6],['≥1M',1e6,1e12]],
    area:[['<300',0,300],['300–500',300,500],['500–750',500,750],['750–1000',750,1000],['≥1000',1000,1e7]],
    down:[['<25K',0,25e3],['25–50K',25e3,5e4],['50–100K',5e4,1e5],['100–200K',1e5,2e5],['≥200K',2e5,1e9]] };
  const ORDERED=['price','total','area','down','premium'];
  function bandOf(v,b){ for(const x of b) if(v>=x[1]&&v<x[2]) return x[0]; return b[b.length-1][0]; }
  function gkey(r,d){ switch(d){ case 'block':return r.block; case 'project':return r.project.replace('المرحلة الحادية عشر - ','').replace(/ - .*$/,''); case 'premium':return String(r.premCount); case 'price':return bandOf(r.total_per_m,BANDS.price); case 'total':return bandOf(r.total_price,BANDS.total); case 'area':return bandOf(r.area,BANDS.area); case 'down':return bandOf(r.down_payment,BANDS.down); default:return r.city; } }
  function groupData(rows,d){ const map={}; rows.forEach(r=>{ const k=gkey(r,d); (map[k]=map[k]||{key:k,count:0,value:0,area:0,down:0}); const o=map[k]; o.count++; o.value+=r.total_price; o.area+=r.area; o.down+=r.down_payment; }); const arr=Object.values(map); if(BANDS[d]) arr.forEach(o=>{ const b=BANDS[d].find(x=>x[0]===o.key); if(b)o.range=[b[1],b[2]]; }); return arr; }
  function mval(o,m){ return m==='count'?o.count : m==='value'?o.value : m==='area'?o.area : m==='avgDown'?(o.count?o.down/o.count:0) : (o.area?o.value/o.area:0); }
  function bandIdx(d,k){ const b=BANDS[d]; return b?b.findIndex(x=>x[0]===k):0; }
  function breakdown(){
    const m=metric; let arr=groupData(DATA,bdDim);
    const ordered=ORDERED.includes(bdDim);
    if(ordered) arr.sort((a,b)=> bdDim==='premium' ? (+a.key)-(+b.key) : bandIdx(bdDim,a.key)-bandIdx(bdDim,b.key));
    else arr.sort((a,b)=>mval(a,m)-mval(b,m));
    let show=arr; if(!ordered && arr.length>22) show=arr.slice(arr.length-22);
    const names=show.map(o=>bdDim==='premium'?(o.key+' '+t('types_n')):o.key);
    const colorOf=(o,i)=>bdDim==='city'?CITY_COLOR[o.key]:PALETTE[i%PALETTE.length];
    const horiz=!ordered;
    const opt={grid:Object.assign({},grid,horiz?{right:64,left:8}:{bottom:8}),
      tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>{const o=show[p[0].dataIndex];return `<b>${names[p[0].dataIndex]}</b><br>${t('m_count')}: <b>${fmt(o.count)}</b><br>${t('k_value')}: <b>${fmt(o.value)}</b><br>${t('m_avgm')}: <b>${fmt(o.area?o.value/o.area:0)}</b><br>${t('m_avgdown')}: <b>${fmt(o.count?o.down/o.count:0)}</b>`;}}),
      series:[{type:'bar',barMaxWidth:horiz?18:36,cursor:'pointer',data:show.map((o,i)=>({value:mval(o,m),itemStyle:{color:colorOf(o,i),borderRadius:horiz?[0,6,6,0]:[6,6,0,0]}})),label:{show:true,position:horiz?'right':'top',color:txc(),fontSize:10,formatter:p=>compact(p.value)}}]};
    if(horiz){ opt.xAxis={type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}}; opt.yAxis={type:'category',data:names,axisLabel:{color:txc(),fontSize:11},axisLine:{lineStyle:{color:css('--line')}}}; }
    else { opt.xAxis={type:'category',data:names,axisLabel:{color:axc(),fontSize:11,interval:0},axisLine:{lineStyle:{color:css('--line')}}}; opt.yAxis={type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}}; }
    const c=mk('cByCity'); c.setOption(opt,true);
    c.off('click'); c.on('click',p=>{ const o=show[p.dataIndex]; if(o && window.onDrill) window.onDrill(bdDim,o.key,o.range); });
    renderBdTable(arr);
  }
  function renderBdTable(groups){
    const m=metric, rows=groups.slice().sort((a,b)=>mval(b,m)-mval(a,m));
    const lbl=k=>bdDim==='premium'?(k+' '+t('types_n')):k;
    const head=`<th>${t('bd_group')}</th><th>${t('m_count')}</th><th>${t('k_value')}</th><th>${t('m_area')}</th><th>${t('bd_avgperm')}</th><th>${t('bd_avgdown')}</th>`;
    const body=rows.map(o=>`<tr><td class="c-muted">${lbl(o.key)}</td><td class="num">${fmt(o.count)}</td><td class="num">${fmt(o.value)}</td><td class="num">${fmt(o.area)}</td><td class="num">${fmt(o.area?o.value/o.area:0)}</td><td class="num">${fmt(o.count?o.down/o.count:0)}</td></tr>`).join('');
    const el=document.getElementById('bdTable'); if(el) el.innerHTML=`<table class="data adtbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    const sub=document.getElementById('bdTableSub'); if(sub){ const d=DIMS.find(x=>x[0]===bdDim); sub.textContent=(d?t(d[1]):'')+' · '+rows.length; }
  }
  function seg(){
    const S=[['< 150K',0,15e4],['150K–300K',15e4,3e5],['300K–500K',3e5,5e5],['500K–1M',5e5,1e6],['≥ 1M',1e6,Infinity]];
    const c=S.map(s=>DATA.filter(r=>r.total_price>=s[1]&&r.total_price<s[2]).length);
    const cS=mk('cSeg'); cS.setOption({tooltip:tip({trigger:'item',formatter:p=>`${p.name}<br><b>${fmt(p.value)}</b> (${p.percent}%)`}),
      legend:{bottom:0,textStyle:{color:txc(),fontSize:11},itemWidth:11,itemHeight:11},
      series:[{type:'pie',radius:['42%','70%'],center:['50%','44%'],cursor:'pointer',itemStyle:{borderColor:css('--card'),borderWidth:2},label:{show:true,color:txc(),fontSize:11,formatter:p=>p.percent>=4?p.name:''},data:S.map((s,i)=>({name:s[0],value:c[i],itemStyle:{color:PALETTE[i]}}))}]},true);
    cS.off('click'); cS.on('click',p=>{ const s=S[p.dataIndex]; if(s&&window.onDrill) window.onDrill('total',s[0],[s[1],s[2]]); });
  }
  function tree(){
    const bc={}; DATA.forEach(r=>{ (bc[r.city]=bc[r.city]||{}); bc[r.city][r.project]=(bc[r.city][r.project]||0)+r.total_price; });
    const data=Object.entries(bc).map(([city,pr])=>({name:city,itemStyle:{color:CITY_COLOR[city]},children:Object.entries(pr).map(([p,v])=>({name:p.replace('المرحلة الحادية عشر - ','').slice(0,40),value:v}))}));
    mk('cTree').setOption({tooltip:tip({formatter:p=>`<b>${p.name}</b><br>${fmt(p.value)}`}),
      series:[{type:'treemap',roam:false,nodeClick:'zoomToNode',breadcrumb:{show:true,bottom:0,itemStyle:{color:css('--card2'),textStyle:{color:txc()}}},label:{color:'#0b1020',fontSize:11,fontWeight:600},upperLabel:{show:true,height:18,color:'#fff',fontSize:11},levels:[{itemStyle:{borderColor:css('--bg'),borderWidth:2,gapWidth:2}},{itemStyle:{borderColor:css('--card'),borderWidth:1,gapWidth:1}}],data}]},true);
  }
  function prem(){
    const cor=DATA.filter(r=>r.corner>0).length,gar=DATA.filter(r=>r.garden>0).length,sea=DATA.filter(r=>r.sea>0).length,none=DATA.filter(r=>!r.has_premium).length;
    const cP=mk('cPrem'); cP.setOption({grid:Object.assign({},grid,{right:42}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${p[0].name}: <b>${fmt(p[0].value)}</b>`}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:['ناصية','حدائق','بحر/نيل','بدون'],axisLabel:{color:txc()},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:24,cursor:'pointer',label:{show:true,position:'right',color:txc(),fontSize:11,formatter:p=>fmt(p.value)},data:[{value:cor,itemStyle:{color:'#cca248',borderRadius:[0,6,6,0]}},{value:gar,itemStyle:{color:'#307e30',borderRadius:[0,6,6,0]}},{value:sea,itemStyle:{color:'#3b6fb0',borderRadius:[0,6,6,0]}},{value:none,itemStyle:{color:'#9aa6bb',borderRadius:[0,6,6,0]}}]}]},true);
    cP.off('click'); cP.on('click',p=>{ const k=['corner','garden','sea','none'][p.dataIndex]; if(k&&window.onDrill) window.onDrill('premtype',k); });
  }
  function scatter(){
    const cities=[...new Set(DATA.map(r=>r.city))];
    const cSc=mk('cScatter'); cSc.setOption({grid:Object.assign({},grid,{right:22,top:12}),
      tooltip:tip({trigger:'item',formatter:p=>{const r=p.data[2];return `<b>${r.city}</b> — ${r.block}<br>قطعة ${r.plot}<br>مساحة <b>${fmt(r.area)}</b> م²<br>إجمالي <b>${fmt(r.total_price)}</b><br><span style="opacity:.7">${t('click_map_hint')}</span>`;}}),
      xAxis:{type:'value',name:'المساحة م²',nameTextStyle:{color:axc()},axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'value',name:'السعر',nameTextStyle:{color:axc()},axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      series:cities.map(ct=>({name:ct,type:'scatter',symbolSize:7,cursor:'pointer',itemStyle:{color:CITY_COLOR[ct],opacity:.72},data:DATA.filter(r=>r.city===ct).map(r=>[r.area,r.total_price,r])}))},true);
    cSc.off('click'); cSc.on('click',p=>{ const r=p.data&&p.data[2]; if(r&&window.openMap) window.openMap(r); });
  }
  function hist(id,vals,color){
    if(!vals.length){ mk(id).setOption({},true); return; }
    const mn=Math.min(...vals),mx=Math.max(...vals),bins=22,w=(mx-mn)/bins||1,counts=new Array(bins).fill(0),labels=[];
    vals.forEach(v=>{let k=Math.floor((v-mn)/w);if(k>=bins)k=bins-1;if(k<0)k=0;counts[k]++;});
    for(let i=0;i<bins;i++)labels.push(compact(mn+i*w));
    mk(id).setOption({grid:Object.assign({},grid,{right:14,bottom:6}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`≈ ${p[0].name}<br><b>${fmt(p[0].value)}</b> قطعة`}),
      xAxis:{type:'category',data:labels,axisLabel:{color:axc(),fontSize:10,interval:Math.floor(bins/9)},axisLine:{lineStyle:{color:css('--line')}}},
      yAxis:{type:'value',axisLabel:{color:axc()},splitLine:{lineStyle:{color:css('--line2')}}},
      series:[{type:'bar',data:counts,itemStyle:{color,borderRadius:[4,4,0,0]},barCategoryGap:'8%'}]},true);
  }
  function box(){
    const rows=[...new Set(DATA.map(r=>r.city))].map(ct=>{const v=DATA.filter(r=>r.city===ct).map(r=>r.total_per_m).sort((a,b)=>a-b);return{ct,v};}).filter(o=>o.v.length).sort((a,b)=>median(a.v)-median(b.v));
    mk('cBox').setOption({grid:Object.assign({},grid,{right:16,bottom:52}),tooltip:tip({trigger:'item',formatter:p=>Array.isArray(p.data)?`<b>${p.name}</b><br>أدنى ${fmt(p.data[1])} · وسيط <b>${fmt(p.data[3])}</b> · أعلى ${fmt(p.data[5])}`:''}),
      xAxis:{type:'category',data:rows.map(o=>o.ct),axisLabel:{color:axc(),rotate:42,fontSize:10},axisLine:{lineStyle:{color:css('--line')}}},
      yAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      series:[{type:'boxplot',data:rows.map(o=>[Math.min(...o.v),quantile(o.v,.25),quantile(o.v,.5),quantile(o.v,.75),Math.max(...o.v)]),itemStyle:{color:'rgba(204,162,72,.14)',borderColor:'#cca248'},boxWidth:[8,26]}]},true);
  }
  function renderAll(){ colors(); kpis(); breakdown(); seg(); tree(); prem(); scatter(); hist('cHistP',DATA.map(r=>r.total_per_m),'#0b2c63'); box(); hist('cHistA',DATA.map(r=>r.area),'#307e30'); }

  /* ---- Premium Plots (القطع المتميزة) ---- */
  function doPremium(rows){
    DATA=rows||[]; colors();
    const d=DATA, prem=d.filter(r=>r.has_premium), n=d.length;
    const cor=d.filter(r=>r.corner>0).length, gar=d.filter(r=>r.garden>0).length, sea=d.filter(r=>r.sea>0).length, multi=d.filter(r=>r.premCount>=2).length;
    const pAvg=mean(prem.map(r=>r.total_per_m)), sAvg=mean(d.filter(r=>!r.has_premium).map(r=>r.total_per_m)), up=Math.round(pAvg-sAvg);
    kpiHtml('prKpis',[[t('pr_k_total'),fmt(prem.length),t('plots_u')],[t('pr_k_share'),n?Math.round(prem.length/n*100)+'%':'—',''],
      [t('pr_k_corner'),fmt(cor),''],[t('pr_k_garden'),fmt(gar),''],[t('pr_k_sea'),fmt(sea),''],[t('pr_k_multi'),fmt(multi),t('types_n')],
      [t('pr_k_uplift'),(up>0?'+':'')+fmt(up),'/ m²']]);
    const none=d.filter(r=>!r.has_premium).length, br={borderRadius:[0,6,6,0]};
    const cType=mk('prByType'); cType.setOption({grid:Object.assign({},grid,{right:42}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${p[0].name}: <b>${fmt(p[0].value)}</b>`}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:[t('p_corner'),t('p_garden'),t('p_sea'),t('p_none')],axisLabel:{color:txc()},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:24,cursor:'pointer',label:{show:true,position:'right',color:txc(),formatter:p=>fmt(p.value)},data:[{value:cor,itemStyle:Object.assign({color:'#cca248'},br)},{value:gar,itemStyle:Object.assign({color:'#307e30'},br)},{value:sea,itemStyle:Object.assign({color:'#3b6fb0'},br)},{value:none,itemStyle:Object.assign({color:'#9aa6bb'},br)}]}]},true);
    cType.off('click'); cType.on('click',p=>{ const k=['corner','garden','sea','none'][p.dataIndex]; if(k&&window.onDrill) window.onDrill('premtype',k); });
    const byc={}; d.forEach(r=>{ if(r.has_premium) byc[r.city]=(byc[r.city]||0)+1; });
    const arr=Object.entries(byc).map(([c,v])=>({c,v})).sort((a,b)=>a.v-b.v);
    const cCity=mk('prByCity'); cCity.setOption({grid:Object.assign({},grid,{right:50}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${p[0].name}: <b>${fmt(p[0].value)}</b>`}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:arr.map(a=>a.c),axisLabel:{color:txc(),fontSize:11},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:18,cursor:'pointer',data:arr.map(a=>({value:a.v,itemStyle:{color:CITY_COLOR[a.c],borderRadius:[0,6,6,0]}})),label:{show:true,position:'right',color:txc(),fontSize:10,formatter:p=>fmt(p.value)}}]},true);
    cCity.off('click'); cCity.on('click',p=>{ const o=arr[p.dataIndex]; if(o&&window.onDrill) window.onDrill('city',o.c); });
    const dist=[0,1,2,3].map(k=>d.filter(r=>r.premCount===k).length);
    const cCount=mk('prCount'); cCount.setOption({tooltip:tip({trigger:'item',formatter:p=>`${p.name}<br><b>${fmt(p.value)}</b> (${p.percent}%)`}),
      legend:{bottom:0,textStyle:{color:txc(),fontSize:11},itemWidth:11,itemHeight:11},
      series:[{type:'pie',radius:['42%','70%'],center:['50%','44%'],cursor:'pointer',itemStyle:{borderColor:css('--card'),borderWidth:2},label:{show:false},
        data:[{name:t('p_none'),value:dist[0],itemStyle:{color:'#9aa6bb'}},{name:'1 '+t('types_n'),value:dist[1],itemStyle:{color:'#cca248'}},{name:'2 '+t('types_n'),value:dist[2],itemStyle:{color:'#307e30'}},{name:'3 '+t('types_n'),value:dist[3],itemStyle:{color:'#061e48'}}]}]},true);
    cCount.off('click'); cCount.on('click',p=>{ if(window.onDrill) window.onDrill('premium', String(p.dataIndex)); });
    const cmap={}; d.forEach(r=>{ (cmap[r.city]=cmap[r.city]||{p:[],s:[]}); (r.has_premium?cmap[r.city].p:cmap[r.city].s).push(r.total_per_m); });
    const cu=Object.entries(cmap).map(([c,o])=>({c,p:mean(o.p),s:mean(o.s),n:o.p.length})).filter(o=>o.n>0).sort((a,b)=>b.n-a.n).slice(0,10);
    mk('prUplift').setOption({grid:Object.assign({},grid,{bottom:54}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'}}),
      legend:{data:[t('premium_std'),t('premium_prem')],bottom:0,textStyle:{color:txc(),fontSize:11}},
      xAxis:{type:'category',data:cu.map(o=>o.c),axisLabel:{color:axc(),rotate:38,fontSize:10},axisLine:{lineStyle:{color:css('--line')}}},
      yAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      series:[{name:t('premium_std'),type:'bar',data:cu.map(o=>Math.round(o.s)),itemStyle:{color:'#9aa6bb',borderRadius:[4,4,0,0]}},{name:t('premium_prem'),type:'bar',data:cu.map(o=>Math.round(o.p)),itemStyle:{color:'#cca248',borderRadius:[4,4,0,0]}}]},true);
    topListEl('prTop', d.slice().sort((a,b)=>(b.premCount-a.premCount)||(b.total_price-a.total_price)).slice(0,10), true);
  }

  /* ---- Down Payment (مقدم الحجز) ---- */
  function doDown(rows){
    DATA=rows||[]; colors();
    const d=DATA, downs=d.map(r=>r.down_payment), total=downs.reduce((a,b)=>a+b,0), val=d.reduce((s,r)=>s+r.total_price,0);
    kpiHtml('dpKpis',[[t('dp_k_total'),compact(total),''],[t('dp_k_avg'),compact(mean(downs)),''],[t('dp_k_median'),compact(median(downs)),''],
      [t('dp_k_min'),compact(downs.length?Math.min(...downs):0),''],[t('dp_k_max'),compact(downs.length?Math.max(...downs):0),''],[t('dp_k_ratio'),val?Math.round(total/val*100)+'%':'—','']]);
    hist('dpHist', downs, '#307e30');
    const B=[['< 50K',0,5e4],['50K–100K',5e4,1e5],['100K–200K',1e5,2e5],['200K–500K',2e5,5e5],['≥ 500K',5e5,Infinity]];
    const counts=B.map(b=>d.filter(r=>r.down_payment>=b[1]&&r.down_payment<b[2]).length);
    const cDB=mk('dpBrackets'); cDB.setOption({tooltip:tip({trigger:'item',formatter:p=>`${p.name}<br><b>${fmt(p.value)}</b> (${p.percent}%)`}),
      legend:{bottom:0,textStyle:{color:txc(),fontSize:11},itemWidth:11,itemHeight:11},
      series:[{type:'pie',radius:['42%','70%'],center:['50%','44%'],cursor:'pointer',itemStyle:{borderColor:css('--card'),borderWidth:2},label:{show:false},data:B.map((b,i)=>({name:b[0],value:counts[i],itemStyle:{color:PALETTE[i]}}))}]},true);
    cDB.off('click'); cDB.on('click',p=>{ const b=B[p.dataIndex]; if(b&&window.onDrill) window.onDrill('down',b[0],[b[1],b[2]]); });
    const byc={}; d.forEach(r=>{ (byc[r.city]=byc[r.city]||{s:0,n:0}); byc[r.city].s+=r.down_payment; byc[r.city].n++; });
    const arr=Object.entries(byc).map(([c,o])=>({c,v:o.s/o.n})).sort((a,b)=>a.v-b.v);
    const cDC=mk('dpByCity'); cDC.setOption({grid:Object.assign({},grid,{right:56}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${p[0].name}: <b>${fmt(p[0].value)}</b>`}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:arr.map(a=>a.c),axisLabel:{color:txc(),fontSize:11},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:18,cursor:'pointer',data:arr.map(a=>({value:Math.round(a.v),itemStyle:{color:CITY_COLOR[a.c],borderRadius:[0,6,6,0]}})),label:{show:true,position:'right',color:txc(),fontSize:10,formatter:p=>compact(p.value)}}]},true);
    cDC.off('click'); cDC.on('click',p=>{ const o=arr[p.dataIndex]; if(o&&window.onDrill) window.onDrill('city',o.c); });
    const cities=[...new Set(d.map(r=>r.city))];
    const cDS=mk('dpScatter'); cDS.setOption({grid:Object.assign({},grid,{right:22,top:12}),
      tooltip:tip({trigger:'item',formatter:p=>{const r=p.data[2];return `<b>${r.city}</b><br>${t('t_plot')} ${r.plot}<br>${t('t_down')}: <b>${fmt(r.down_payment)}</b><br>${t('t_total')}: <b>${fmt(r.total_price)}</b><br><span style="opacity:.7">${t('click_map_hint')}</span>`;}}),
      xAxis:{type:'value',name:t('t_total'),nameTextStyle:{color:axc()},axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'value',name:t('t_down'),nameTextStyle:{color:axc()},axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      series:cities.map(ct=>({name:ct,type:'scatter',symbolSize:6,cursor:'pointer',itemStyle:{color:CITY_COLOR[ct],opacity:.7},data:d.filter(r=>r.city===ct).map(r=>[r.total_price,r.down_payment,r])}))},true);
    cDS.off('click'); cDS.on('click',p=>{ const r=p.data&&p.data[2]; if(r&&window.openMap) window.openMap(r); });
    topListEl('dpTop', d.slice().sort((a,b)=>a.down_payment-b.down_payment).slice(0,10), false);
  }

  document.getElementById('cityMetric').querySelectorAll('button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('#cityMetric button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); metric=b.dataset.m; if(DATA.length) breakdown(); });
  (function(){ const el=document.getElementById('bdDim'); if(el){ el.innerHTML=DIMS.map(([v,k])=>`<option value="${v}" data-i18n="${k}"></option>`).join(''); el.value=bdDim; el.onchange=()=>{ bdDim=el.value; if(DATA.length) breakdown(); }; } })();
  window.addEventListener('resize',()=>Object.values(charts).forEach(c=>c.resize()));
  function disposeAll(){ Object.values(charts).forEach(c=>c.dispose()); for(const k in charts) delete charts[k]; }
  return {
    render(rows,disposeFirst){ DATA=rows||[]; if(disposeFirst) disposeAll(); renderAll(); },
    renderPremium(rows,disposeFirst){ if(disposeFirst) disposeAll(); doPremium(rows); },
    renderDown(rows,disposeFirst){ if(disposeFirst) disposeAll(); doDown(rows); },
    setBreakdown(d){ bdDim=d; const el=document.getElementById('bdDim'); if(el) el.value=d; }
  };
})();
