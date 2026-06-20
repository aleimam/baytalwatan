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
    const head = premium
      ? `<th>${t('t_city')}</th><th>${t('t_plot')}</th><th>${t('t_area')}</th><th>${t('types_n')}</th><th>${t('t_total')}</th>`
      : `<th>${t('t_city')}</th><th>${t('t_plot')}</th><th>${t('t_area')}</th><th>${t('t_down')}</th><th>${t('t_total')}</th>`;
    const body=rows.map(r=>`<tr><td class="c">${r.city}</td><td class="num">${r.plot}</td><td class="num">${fmt(r.area)}</td><td class="num">${premium?r.premCount:fmt(r.down_payment)}</td><td class="num">${fmt(r.total_price)}</td></tr>`).join('');
    document.getElementById(id).innerHTML=`<table class="mini"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  function kpis(){
    const d=DATA, area=d.reduce((s,r)=>s+r.area,0), val=d.reduce((s,r)=>s+r.total_price,0), down=d.reduce((s,r)=>s+r.down_payment,0);
    kpiHtml('kpis',[[t('k_plots'),fmt(d.length),t('plots_u')],[t('k_cities'),new Set(d.map(r=>r.city)).size,''],[t('k_zones'),new Set(d.map(r=>r.zone_id)).size,''],
      [t('k_area'),compact(area)+' م²',fmt(area)],[t('k_value'),compact(val),''],[t('k_avgperm'),area?fmt(val/area):'—',t('k_weighted')],
      [t('k_avgarea'),d.length?fmt(area/d.length)+' م²':'—',''],[t('k_down'),compact(down),fmt(d.filter(r=>r.has_premium).length)+' '+t('k_premiumed')]]);
  }
  function byCity(){
    const m=metric, by={}; DATA.forEach(r=>{ (by[r.city]=by[r.city]||{n:0,v:0,a:0}); by[r.city].n++; by[r.city].v+=r.total_price; by[r.city].a+=r.area; });
    let arr=Object.entries(by).map(([c,o])=>({c,count:o.n,value:o.v,area:o.a,avgM:o.a?o.v/o.a:0}));
    const key=m==='count'?'count':m==='value'?'value':m==='area'?'area':'avgM';
    arr.sort((a,b)=>a[key]-b[key]); const names=arr.map(a=>a.c);
    mk('cByCity').setOption({grid:Object.assign({},grid,{right:62}),
      tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>{const a=arr[p[0].dataIndex];return `<b>${a.c}</b><br>${t('m_count')}: <b>${fmt(a.count)}</b><br>${t('m_value')}: <b>${fmt(a.value)}</b><br>${t('m_area')}: <b>${fmt(a.area)}</b><br>${t('m_avgm')}: <b>${fmt(a.avgM)}</b>`;}}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:names,axisLabel:{color:txc(),fontSize:11},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:20,data:arr.map(a=>({value:a[key],itemStyle:{color:CITY_COLOR[a.c],borderRadius:[0,6,6,0]}})),label:{show:true,position:'right',color:txc(),fontSize:10,formatter:p=>compact(p.value)}}]},true);
  }
  function seg(){
    const S=[['< 150K',0,15e4],['150K–300K',15e4,3e5],['300K–500K',3e5,5e5],['500K–1M',5e5,1e6],['≥ 1M',1e6,Infinity]];
    const c=S.map(s=>DATA.filter(r=>r.total_price>=s[1]&&r.total_price<s[2]).length);
    mk('cSeg').setOption({tooltip:tip({trigger:'item',formatter:p=>`${p.name}<br><b>${fmt(p.value)}</b> (${p.percent}%)`}),
      legend:{bottom:0,textStyle:{color:txc(),fontSize:11},itemWidth:11,itemHeight:11},
      series:[{type:'pie',radius:['42%','70%'],center:['50%','44%'],itemStyle:{borderColor:css('--card'),borderWidth:2},label:{show:true,color:txc(),fontSize:11,formatter:p=>p.percent>=4?p.name:''},data:S.map((s,i)=>({name:s[0],value:c[i],itemStyle:{color:PALETTE[i]}}))}]},true);
  }
  function tree(){
    const bc={}; DATA.forEach(r=>{ (bc[r.city]=bc[r.city]||{}); bc[r.city][r.project]=(bc[r.city][r.project]||0)+r.total_price; });
    const data=Object.entries(bc).map(([city,pr])=>({name:city,itemStyle:{color:CITY_COLOR[city]},children:Object.entries(pr).map(([p,v])=>({name:p.replace('المرحلة الحادية عشر - ','').slice(0,40),value:v}))}));
    mk('cTree').setOption({tooltip:tip({formatter:p=>`<b>${p.name}</b><br>${fmt(p.value)}`}),
      series:[{type:'treemap',roam:false,nodeClick:'zoomToNode',breadcrumb:{show:true,bottom:0,itemStyle:{color:css('--card2'),textStyle:{color:txc()}}},label:{color:'#0b1020',fontSize:11,fontWeight:600},upperLabel:{show:true,height:18,color:'#fff',fontSize:11},levels:[{itemStyle:{borderColor:css('--bg'),borderWidth:2,gapWidth:2}},{itemStyle:{borderColor:css('--card'),borderWidth:1,gapWidth:1}}],data}]},true);
  }
  function prem(){
    const cor=DATA.filter(r=>r.corner>0).length,gar=DATA.filter(r=>r.garden>0).length,sea=DATA.filter(r=>r.sea>0).length,none=DATA.filter(r=>!r.has_premium).length;
    mk('cPrem').setOption({grid:Object.assign({},grid,{right:42}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${p[0].name}: <b>${fmt(p[0].value)}</b>`}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:['ناصية','حدائق','بحر/نيل','بدون'],axisLabel:{color:txc()},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:24,label:{show:true,position:'right',color:txc(),fontSize:11,formatter:p=>fmt(p.value)},data:[{value:cor,itemStyle:{color:'#cca248',borderRadius:[0,6,6,0]}},{value:gar,itemStyle:{color:'#307e30',borderRadius:[0,6,6,0]}},{value:sea,itemStyle:{color:'#3b6fb0',borderRadius:[0,6,6,0]}},{value:none,itemStyle:{color:'#9aa6bb',borderRadius:[0,6,6,0]}}]}]},true);
  }
  function scatter(){
    const cities=[...new Set(DATA.map(r=>r.city))];
    mk('cScatter').setOption({grid:Object.assign({},grid,{right:22,top:12}),
      tooltip:tip({trigger:'item',formatter:p=>{const r=p.data[2];return `<b>${r.city}</b> — ${r.block}<br>قطعة ${r.plot}<br>مساحة <b>${fmt(r.area)}</b> م²<br>إجمالي <b>${fmt(r.total_price)}</b>`;}}),
      xAxis:{type:'value',name:'المساحة م²',nameTextStyle:{color:axc()},axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'value',name:'السعر',nameTextStyle:{color:axc()},axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      series:cities.map(ct=>({name:ct,type:'scatter',symbolSize:7,itemStyle:{color:CITY_COLOR[ct],opacity:.72},data:DATA.filter(r=>r.city===ct).map(r=>[r.area,r.total_price,r])}))},true);
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
  function renderAll(){ colors(); kpis(); byCity(); seg(); tree(); prem(); scatter(); hist('cHistP',DATA.map(r=>r.total_per_m),'#0b2c63'); box(); hist('cHistA',DATA.map(r=>r.area),'#307e30'); }

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
    mk('prByType').setOption({grid:Object.assign({},grid,{right:42}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${p[0].name}: <b>${fmt(p[0].value)}</b>`}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:[t('p_corner'),t('p_garden'),t('p_sea'),t('p_none')],axisLabel:{color:txc()},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:24,label:{show:true,position:'right',color:txc(),formatter:p=>fmt(p.value)},data:[{value:cor,itemStyle:Object.assign({color:'#cca248'},br)},{value:gar,itemStyle:Object.assign({color:'#307e30'},br)},{value:sea,itemStyle:Object.assign({color:'#3b6fb0'},br)},{value:none,itemStyle:Object.assign({color:'#9aa6bb'},br)}]}]},true);
    const byc={}; d.forEach(r=>{ if(r.has_premium) byc[r.city]=(byc[r.city]||0)+1; });
    const arr=Object.entries(byc).map(([c,v])=>({c,v})).sort((a,b)=>a.v-b.v);
    mk('prByCity').setOption({grid:Object.assign({},grid,{right:50}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${p[0].name}: <b>${fmt(p[0].value)}</b>`}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:arr.map(a=>a.c),axisLabel:{color:txc(),fontSize:11},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:18,data:arr.map(a=>({value:a.v,itemStyle:{color:CITY_COLOR[a.c],borderRadius:[0,6,6,0]}})),label:{show:true,position:'right',color:txc(),fontSize:10,formatter:p=>fmt(p.value)}}]},true);
    const dist=[0,1,2,3].map(k=>d.filter(r=>r.premCount===k).length);
    mk('prCount').setOption({tooltip:tip({trigger:'item',formatter:p=>`${p.name}<br><b>${fmt(p.value)}</b> (${p.percent}%)`}),
      legend:{bottom:0,textStyle:{color:txc(),fontSize:11},itemWidth:11,itemHeight:11},
      series:[{type:'pie',radius:['42%','70%'],center:['50%','44%'],itemStyle:{borderColor:css('--card'),borderWidth:2},label:{show:false},
        data:[{name:t('p_none'),value:dist[0],itemStyle:{color:'#9aa6bb'}},{name:'1 '+t('types_n'),value:dist[1],itemStyle:{color:'#cca248'}},{name:'2 '+t('types_n'),value:dist[2],itemStyle:{color:'#307e30'}},{name:'3 '+t('types_n'),value:dist[3],itemStyle:{color:'#061e48'}}]}]},true);
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
    mk('dpBrackets').setOption({tooltip:tip({trigger:'item',formatter:p=>`${p.name}<br><b>${fmt(p.value)}</b> (${p.percent}%)`}),
      legend:{bottom:0,textStyle:{color:txc(),fontSize:11},itemWidth:11,itemHeight:11},
      series:[{type:'pie',radius:['42%','70%'],center:['50%','44%'],itemStyle:{borderColor:css('--card'),borderWidth:2},label:{show:false},data:B.map((b,i)=>({name:b[0],value:counts[i],itemStyle:{color:PALETTE[i]}}))}]},true);
    const byc={}; d.forEach(r=>{ (byc[r.city]=byc[r.city]||{s:0,n:0}); byc[r.city].s+=r.down_payment; byc[r.city].n++; });
    const arr=Object.entries(byc).map(([c,o])=>({c,v:o.s/o.n})).sort((a,b)=>a.v-b.v);
    mk('dpByCity').setOption({grid:Object.assign({},grid,{right:56}),tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${p[0].name}: <b>${fmt(p[0].value)}</b>`}),
      xAxis:{type:'value',axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'category',data:arr.map(a=>a.c),axisLabel:{color:txc(),fontSize:11},axisLine:{lineStyle:{color:css('--line')}}},
      series:[{type:'bar',barMaxWidth:18,data:arr.map(a=>({value:Math.round(a.v),itemStyle:{color:CITY_COLOR[a.c],borderRadius:[0,6,6,0]}})),label:{show:true,position:'right',color:txc(),fontSize:10,formatter:p=>compact(p.value)}}]},true);
    const cities=[...new Set(d.map(r=>r.city))];
    mk('dpScatter').setOption({grid:Object.assign({},grid,{right:22,top:12}),
      tooltip:tip({trigger:'item',formatter:p=>{const r=p.data[2];return `<b>${r.city}</b><br>${t('t_plot')} ${r.plot}<br>${t('t_down')}: <b>${fmt(r.down_payment)}</b><br>${t('t_total')}: <b>${fmt(r.total_price)}</b>`;}}),
      xAxis:{type:'value',name:t('t_total'),nameTextStyle:{color:axc()},axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      yAxis:{type:'value',name:t('t_down'),nameTextStyle:{color:axc()},axisLabel:{color:axc(),formatter:compact},splitLine:{lineStyle:{color:css('--line2')}}},
      series:cities.map(ct=>({name:ct,type:'scatter',symbolSize:6,itemStyle:{color:CITY_COLOR[ct],opacity:.7},data:d.filter(r=>r.city===ct).map(r=>[r.total_price,r.down_payment,r])}))},true);
    topListEl('dpTop', d.slice().sort((a,b)=>a.down_payment-b.down_payment).slice(0,10), false);
  }

  document.getElementById('cityMetric').querySelectorAll('button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('#cityMetric button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); metric=b.dataset.m; if(DATA.length) byCity(); });
  window.addEventListener('resize',()=>Object.values(charts).forEach(c=>c.resize()));
  function disposeAll(){ Object.values(charts).forEach(c=>c.dispose()); for(const k in charts) delete charts[k]; }
  return {
    render(rows,disposeFirst){ DATA=rows||[]; if(disposeFirst) disposeAll(); renderAll(); },
    renderPremium(rows,disposeFirst){ if(disposeFirst) disposeAll(); doPremium(rows); },
    renderDown(rows,disposeFirst){ if(disposeFirst) disposeAll(); doDown(rows); }
  };
})();
