/* ============ Analytics (ECharts) — fed by the app's filtered rows ============ */
const Analytics = (() => {
  const charts = {};
  let DATA = [], CITY_COLOR = {}, cityOrder = [], metric = 'count';
  const PALETTE = ['#22d3ee','#f5b53d','#34d399','#60a5fa','#f472b6','#a78bfa','#2dd4bf','#fb923c','#e879f9','#38bdf8'];
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
  function kpis(){
    const d=DATA, area=d.reduce((s,r)=>s+r.area,0), val=d.reduce((s,r)=>s+r.total_price,0), down=d.reduce((s,r)=>s+r.down_payment,0);
    const cards=[['القطع',fmt(d.length),'قطعة'],['المدن',new Set(d.map(r=>r.city)).size,''],['المناطق',new Set(d.map(r=>r.zone_id)).size,'منطقة'],
      ['إجمالي المساحة',compact(area)+' م²',fmt(area)],['إجمالي القيمة',compact(val),'قيمة'],['متوسط سعر المتر',area?fmt(val/area):'—','مرجّح'],
      ['متوسط المساحة',d.length?fmt(area/d.length)+' م²':'—',''],['إجمالي المقدمات',compact(down),fmt(d.filter(r=>r.has_premium).length)+' مميّزة']];
    document.getElementById('kpis').innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div><div class="sub">${c[2]}</div></div>`).join('');
  }
  function byCity(){
    const m=metric, by={}; DATA.forEach(r=>{ (by[r.city]=by[r.city]||{n:0,v:0,a:0}); by[r.city].n++; by[r.city].v+=r.total_price; by[r.city].a+=r.area; });
    let arr=Object.entries(by).map(([c,o])=>({c,count:o.n,value:o.v,area:o.a,avgM:o.a?o.v/o.a:0}));
    const key=m==='count'?'count':m==='value'?'value':m==='area'?'area':'avgM';
    arr.sort((a,b)=>a[key]-b[key]); const names=arr.map(a=>a.c);
    mk('cByCity').setOption({grid:Object.assign({},grid,{right:62}),
      tooltip:tip({trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>{const a=arr[p[0].dataIndex];return `<b>${a.c}</b><br>عدد: <b>${fmt(a.count)}</b><br>قيمة: <b>${fmt(a.value)}</b><br>مساحة: <b>${fmt(a.area)}</b><br>متوسط م²: <b>${fmt(a.avgM)}</b>`;}}),
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
      series:[{type:'bar',barMaxWidth:24,label:{show:true,position:'right',color:txc(),fontSize:11,formatter:p=>fmt(p.value)},data:[{value:cor,itemStyle:{color:'#f5b53d',borderRadius:[0,6,6,0]}},{value:gar,itemStyle:{color:'#34d399',borderRadius:[0,6,6,0]}},{value:sea,itemStyle:{color:'#60a5fa',borderRadius:[0,6,6,0]}},{value:none,itemStyle:{color:'#6c7ea6',borderRadius:[0,6,6,0]}}]}]},true);
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
      series:[{type:'boxplot',data:rows.map(o=>[Math.min(...o.v),quantile(o.v,.25),quantile(o.v,.5),quantile(o.v,.75),Math.max(...o.v)]),itemStyle:{color:'#22d3ee22',borderColor:'#22d3ee'},boxWidth:[8,26]}]},true);
  }
  function renderAll(){ colors(); kpis(); byCity(); seg(); tree(); prem(); scatter(); hist('cHistP',DATA.map(r=>r.total_per_m),'#f472b6'); box(); hist('cHistA',DATA.map(r=>r.area),'#fb923c'); }

  document.getElementById('cityMetric').querySelectorAll('button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('#cityMetric button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); metric=b.dataset.m; if(DATA.length) byCity(); });
  window.addEventListener('resize',()=>Object.values(charts).forEach(c=>c.resize()));
  return { render(rows,disposeFirst){ DATA=rows||[]; if(disposeFirst){ Object.values(charts).forEach(c=>c.dispose()); for(const k in charts) delete charts[k]; } renderAll(); } };
})();
