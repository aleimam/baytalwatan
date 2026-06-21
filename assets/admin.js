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
  draw(){ const el=document.getElementById('adminBody'); if(!el) return; if(this.tab==='users') this.drawUsers(el); else if(this.tab==='appear') this.drawAppear(el); else this.drawFeatures(el); },
  drawUsers(el){
    const rows = this.users.map(u=>`<tr>
      <td>${u.id}</td><td>${u.full_name||''}</td><td class="c-muted">${u.email}</td><td class="c-muted">${u.phone||''}</td>
      <td><span class="role-badge ${u.role}">${u.role==='admin'?t('role_admin'):t('role_user')}</span></td>
      <td class="c-muted">${(u.created_at||'').slice(0,10)}</td>
      <td class="ad-act">
        ${u.role==='admin'?`<button class="btn sm" data-act="role" data-id="${u.id}" data-role="user">${t('ad_make_user')}</button>`:`<button class="btn sm" data-act="role" data-id="${u.id}" data-role="admin">${t('ad_make_admin')}</button>`}
        <button class="btn sm danger" data-act="del" data-id="${u.id}">${t('ad_delete')}</button>
      </td></tr>`).join('');
    el.innerHTML = `<div class="ad-bar"><span class="count-pill">${t('ad_users_total')}: <b>${this.users.length}</b></span><span class="spacer"></span><button class="btn" id="adExport">${t('export_users')}</button></div>
      <div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>#</th><th>${t('ad_name')}</th><th>${t('g_email')}</th><th>${t('g_phone')}</th><th>${t('ad_role')}</th><th>${t('ad_created')}</th><th>${t('ad_actions')}</th></tr></thead><tbody>${rows||''}</tbody></table></div>`;
    el.querySelector('#adExport').onclick=()=>this.exportUsers();
    el.querySelectorAll('[data-act=role]').forEach(b=>b.onclick=async()=>{ b.disabled=true; await this.api('set_role',{id:+b.dataset.id,role:b.dataset.role}); this.render(); });
    el.querySelectorAll('[data-act=del]').forEach(b=>b.onclick=async()=>{ if(confirm(t('ad_confirm_del'))){ await this.api('delete_user',{id:+b.dataset.id}); this.render(); } });
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
