/* ============ Admin panel (users + appearance + features) ============ */
const Admin = {
  user:null, users:[], settings:null, tab:'users', _wired:false,
  async api(action,data){
    const o = data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {};
    try { return await (await fetch('api/admin?action='+action,o)).json(); } catch(e){ return {error:'network'}; }
  },
  async render(){
    if(!this._wired){
      this._wired=true;
      document.querySelectorAll('#adminSeg button').forEach(b=>b.onclick=()=>{ this.tab=b.dataset.atab; document.querySelectorAll('#adminSeg button').forEach(x=>x.classList.toggle('on',x===b)); this.draw(); });
    }
    document.querySelectorAll('#adminSeg button').forEach(x=>x.classList.toggle('on',x.dataset.atab===this.tab));
    const [u,s] = await Promise.all([this.api('users'), this.api('settings_get')]);
    this.users = u.users || []; this.settings = s.settings || {};
    this.draw();
  },
  draw(){ const el=document.getElementById('adminBody'); if(!el) return; if(this.tab==='users') this.drawUsers(el); else if(this.tab==='visitors') this.drawVisitors(el); else if(this.tab==='wishlists'){ if(window.Wish) Wish.adminRender(el); else el.innerHTML=''; } else if(this.tab==='uetr'){ if(window.Uetr) Uetr.adminRender(el); else el.innerHTML=''; } else if(this.tab==='appear') this.drawAppear(el); else this.drawFeatures(el); },
  async drawVisitors(el){
    el.innerHTML = `<div class="ad-bar"><span class="c-muted">${t('vs_loading')}</span></div>`;
    const v = await this.api('visits');
    const s = v.summary || {sessions:0,uniqueIps:0,registered:0,last24h:0,avgDur:0};
    const sess = v.sessions || [];
    const fmtDur = d=>{ d=+d||0; if(d<60) return d+t('vs_sec'); const m=Math.floor(d/60), x=d%60; return m+t('vs_min')+(x?(' '+x+t('vs_sec')):''); };
    const fmtTime = ts=>{ try{ return new Date(ts).toLocaleString(I18N.lang==='ar'?'ar-EG':'en-GB'); }catch(e){ return ts||''; } };
    const cards = [[t('vs_sessions'),s.sessions],[t('vs_unique_ips'),s.uniqueIps],[t('vs_registered'),s.registered],[t('vs_last24h'),s.last24h],[t('vs_avg_time'),fmtDur(s.avgDur)]]
      .map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join('');
    const esc = x=>String(x==null?'':x).replace(/</g,'&lt;');
    const rows = sess.map(x=>`<tr>
      <td class="c-muted">${fmtTime(x.last)}</td>
      <td>${esc(x.ip)}</td>
      <td>${x.user?`<span class="role-badge user">${esc(x.user)}</span>`:`<span class="c-muted">${t('vs_anon')}</span>`}</td>
      <td>${esc(x.dev)} · ${esc(x.os)} · ${esc(x.br)}</td>
      <td class="num">${fmtDur(x.dur)}</td>
      <td class="num">${x.views||1}</td>
      <td class="c-muted">${esc(x.lang)} ${x.scr?('· '+esc(x.scr)):''} ${x.tz?('· '+esc(x.tz)):''}</td>
      <td class="c-muted">${x.ref?esc(x.ref.replace(/^https?:\/\//,'').slice(0,30)):t('vs_direct')}</td>
    </tr>`).join('');
    el.innerHTML = `<div class="ad-note">${t('vs_note')}</div>
      <section class="kpis vs-kpis">${cards}</section>
      <div class="ad-bar"><span class="count-pill">${t('vs_sessions')}: <b>${sess.length}</b></span><span class="spacer"></span><button class="btn" id="vsExport">${t('vs_export')}</button></div>
      <div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>${t('vs_time')}</th><th>IP</th><th>${t('vs_user')}</th><th>${t('vs_device')}</th><th>${t('vs_duration')}</th><th>${t('vs_views')}</th><th>${t('vs_meta')}</th><th>${t('vs_ref')}</th></tr></thead><tbody>${rows||''}</tbody></table></div>`;
    const ex=el.querySelector('#vsExport'); if(ex) ex.onclick=()=>this.exportVisits(sess);
  },
  exportVisits(sess){
    const cols=['last','first','ip','user','dev','os','br','dur','views','lang','tz','scr','ref','path'];
    const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const csv='﻿'+cols.join(',')+'\r\n'+sess.map(x=>cols.map(c=>q(x[c])).join(',')).join('\r\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='baytalwatan_visitors.csv'; a.click();
  },
  drawUsers(el){
    const rows = this.users.map(u=>`<tr>
      <td>${u.id}</td><td>${u.full_name||''}</td><td class="c-muted">${u.email}</td><td class="c-muted">${u.phone||''}</td>
      <td><span class="role-badge ${u.role}">${u.role==='admin'?t('role_admin'):t('role_user')}</span></td>
      <td class="c-muted">${(u.created_at||'').slice(0,10)}</td>
      <td class="ad-act">${this.user&&this.user.email===u.email?`<span class="c-muted">${t('ad_you')}</span>`:`
        ${u.role==='admin'?`<button class="btn sm" data-act="role" data-email="${u.email}" data-role="user">${t('ad_make_user')}</button>`:`<button class="btn sm" data-act="role" data-email="${u.email}" data-role="admin">${t('ad_make_admin')}</button>`}
        <button class="btn sm danger" data-act="del" data-email="${u.email}">${t('ad_delete')}</button>`}
      </td></tr>`).join('');
    el.innerHTML = `<div class="ad-bar"><span class="count-pill">${t('ad_users_total')}: <b>${this.users.length}</b></span><span class="spacer"></span><button class="btn" id="adExport">${t('export_users')}</button></div>
      <div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>#</th><th>${t('ad_name')}</th><th>${t('g_email')}</th><th>${t('g_phone')}</th><th>${t('ad_role')}</th><th>${t('ad_created')}</th><th>${t('ad_actions')}</th></tr></thead><tbody>${rows||''}</tbody></table></div>`;
    el.querySelector('#adExport').onclick=()=>this.exportUsers();
    el.querySelectorAll('[data-act=role]').forEach(b=>b.onclick=async()=>{ b.disabled=true; await this.api('set_role',{email:b.dataset.email,role:b.dataset.role}); this.render(); });
    el.querySelectorAll('[data-act=del]').forEach(b=>b.onclick=async()=>{ if(confirm(t('ad_confirm_del'))){ await this.api('delete_user',{email:b.dataset.email}); this.render(); } });
  },
  drawAppear(el){
    const s=this.settings;
    el.innerHTML = `<div class="ad-form">
      <label>${t('ad_site_title')}<input id="adTitle" value="${(s.site_title||'').replace(/"/g,'&quot;')}"></label>
      <label>${t('ad_site_sub')} (ع)<input id="adSubAr" value="${(s.site_sub_ar||'').replace(/"/g,'&quot;')}"></label>
      <label>${t('ad_site_sub')} (EN)<input id="adSubEn" value="${(s.site_sub_en||'').replace(/"/g,'&quot;')}"></label>
      <label>${t('ad_accent')}<input type="color" id="adAccent" value="${s.accent||'#061e48'}"></label>
      <div class="ad-actions-row"><button class="btn solid" id="adSave">${t('ad_save')}</button> <span class="ad-msg" id="adMsg"></span></div>
    </div>`;
    el.querySelector('#adSave').onclick=async()=>{
      const g=id=>el.querySelector('#'+id);
      const r=await this.api('settings_set',{site_title:g('adTitle').value,site_sub_ar:g('adSubAr').value,site_sub_en:g('adSubEn').value,accent:g('adAccent').value});
      if(r.settings){ this.settings=r.settings; applySettings(r.settings); g('adMsg').textContent=t('ad_saved'); }
    };
  },
  drawFeatures(el){
    const s=this.settings, ck=v=>(v==='1'||v===1||v===true)?'checked':'';
    el.innerHTML = `<div class="ad-form">
      <label class="ad-check"><input type="checkbox" id="adAn" ${ck(s.show_analytics)}> ${t('ad_show_analytics')}</label>
      <label class="ad-check"><input type="checkbox" id="adPr" ${ck(s.show_premium)}> ${t('ad_show_premium')}</label>
      <div class="ad-actions-row"><button class="btn solid" id="adSaveF">${t('ad_save')}</button> <span class="ad-msg" id="adMsgF"></span></div>
    </div>`;
    el.querySelector('#adSaveF').onclick=async()=>{
      const g=id=>el.querySelector('#'+id);
      const r=await this.api('settings_set',{show_analytics:g('adAn').checked?'1':'0',show_premium:g('adPr').checked?'1':'0'});
      if(r.settings){ this.settings=r.settings; applySettings(r.settings); g('adMsgF').textContent=t('ad_saved'); }
    };
  },
  exportUsers(){
    const cols=['id','full_name','email','phone','role','created_at'];
    const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const csv='﻿'+cols.join(',')+'\r\n'+this.users.map(u=>cols.map(c=>q(u[c])).join(',')).join('\r\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='baytalwatan_users.csv'; a.click();
  }
};
window.Admin = Admin;
