/* ============================================================================
   Wishlists (favorites) — available to EVERYONE.
   - Logged-in users: stored server-side (/api/wishlists), visible to admins.
   - Anonymous visitors: stored in localStorage ('bw_wish'); migrated to the
     account on register/sign-in so nothing is lost.
   Multiple lists per user. Quick ♥ in the list + full picker in the plot popup.
   ========================================================================== */
const Wish = (() => {
  let lists = [];
  const esc = x => String(x == null ? '' : x).replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const authed = () => !!(window.Auth && Auth.user);
  const rid = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---- stores ---- */
  function loadLocal(){ try { return JSON.parse(localStorage.getItem('bw_wish') || '[]'); } catch (e) { return []; } }
  function saveLocal(){ try { localStorage.setItem('bw_wish', JSON.stringify(lists)); } catch (e) {} }
  async function srv(action, data){
    const o = data ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) } : {};
    try { return await (await fetch('api/wishlists' + (action ? ('?action=' + action) : ''), o)).json(); }
    catch (e) { return { error: 'network' }; }
  }

  async function load(){
    if (authed()) { const r = await srv(''); lists = (r && r.wishlists) || []; }
    else { lists = loadLocal(); }
    return lists;
  }
  /* ---- mode-aware operations ---- */
  async function createList(name){
    name = (name || t('wl_default')).trim() || t('wl_default');
    if (authed()) { const r = await srv('create', { name }); if (r.wishlists) lists = r.wishlists; return r.created; }
    const w = { id: rid(), name, plots: [], created_at: new Date().toISOString() }; lists.push(w); saveLocal(); return w.id;
  }
  async function renameList(id, name){
    if (authed()) { const r = await srv('rename', { id, name }); if (r.wishlists) lists = r.wishlists; return; }
    const w = lists.find(x => x.id === id); if (w) { w.name = (name || w.name).trim() || w.name; saveLocal(); }
  }
  async function deleteList(id){
    if (authed()) { const r = await srv('delete', { id }); if (r.wishlists) lists = r.wishlists; return; }
    lists = lists.filter(w => w.id !== id); saveLocal();
  }
  async function addPlot(id, key){
    if (authed()) { const r = await srv('add', { id, plot: key }); if (r.wishlists) lists = r.wishlists; return; }
    const w = lists.find(x => x.id === id); if (w && (w.plots || (w.plots = [])).indexOf(key) < 0) { w.plots.push(key); saveLocal(); }
  }
  async function removePlot(id, key){
    if (authed()) { const r = await srv('remove', { id, plot: key }); if (r.wishlists) lists = r.wishlists; return; }
    const w = lists.find(x => x.id === id); if (w) { w.plots = (w.plots || []).filter(x => x !== key); saveLocal(); }
  }
  function has(key){ return lists.some(w => (w.plots || []).indexOf(key) >= 0); }
  async function toggleDefault(key){
    if (has(key)) { for (const w of lists.slice()) if ((w.plots || []).indexOf(key) >= 0) await removePlot(w.id, key); return false; }
    let id = lists[0] && lists[0].id; if (!id) id = await createList(t('wl_default'));
    await addPlot(id, key); return true;
  }
  /* push anonymous (localStorage) lists onto the account after sign-in */
  async function migrate(){
    const local = loadLocal(); if (!local.length) return;
    for (const w of local) { const r = await srv('create', { name: w.name }); const id = r && r.created; if (id) for (const p of (w.plots || [])) await srv('add', { id, plot: p }); }
    try { localStorage.removeItem('bw_wish'); } catch (e) {}
    await load();
  }

  /* ---- add-to-wishlist control inside the plot popup ---- */
  async function renderControl(el, plotRow){
    if (!el) return;
    const key = window.plotKey(plotRow);
    el.innerHTML = `<h4>${t('wl_save')}</h4><div class="wl-chips" id="wlChips"><span class="c-muted">${t('vs_loading')}</span></div>`;
    await load(); draw();
    function draw(){
      const chips = lists.map(w => {
        const on = (w.plots || []).indexOf(key) >= 0;
        return `<button class="wl-chip${on ? ' on' : ''}" data-id="${w.id}">${on ? '✓ ' : '+ '}${esc(w.name)} <span class="c-muted">(${(w.plots || []).length})</span></button>`;
      }).join('');
      el.querySelector('#wlChips').innerHTML = chips + `<button class="wl-chip new" id="wlNew">★ ${t('wl_new')}</button>`;
      el.querySelectorAll('.wl-chip[data-id]').forEach(b => b.onclick = async () => {
        const w = lists.find(x => x.id === b.dataset.id); const on = (w.plots || []).indexOf(key) >= 0;
        b.disabled = true; await (on ? removePlot : addPlot)(w.id, key); draw(); if (window.refreshWishHearts) refreshWishHearts();
      });
      const nb = el.querySelector('#wlNew');
      if (nb) nb.onclick = async () => { const name = prompt(t('wl_new_prompt')); if (name === null) return; const id = await createList(name); if (id) await addPlot(id, key); draw(); if (window.refreshWishHearts) refreshWishHearts(); };
    }
  }

  /* ---- the user's Wishlists tab ---- */
  async function render(el){
    if (!el) return;
    el.innerHTML = `<div class="ad-bar"><h2 class="section-title" style="margin:0">${t('tab_wish')}</h2><span class="spacer"></span><button class="btn solid" id="wlAdd">★ ${t('wl_new')}</button></div>
      ${authed() ? '' : `<div class="terms-note">${t('wl_anon_note')}</div>`}<div id="wlBody"><span class="c-muted">${t('vs_loading')}</span></div>`;
    el.querySelector('#wlAdd').onclick = async () => { const name = prompt(t('wl_new_prompt')); if (name === null) return; await createList(name); drawBody(); };
    await load(); drawBody();
    function drawBody(){
      const body = el.querySelector('#wlBody');
      if (!lists.length) { body.innerHTML = `<div class="terms-note">${t('wl_empty')}</div>`; return; }
      body.innerHTML = lists.map(w => {
        const plots = (w.plots || []).map(k => window.plotByKey[k]).filter(Boolean);
        const rows = plots.map(r => `<tr>
          <td><a class="plotlink wl-open" data-k="${window.plotKey(r)}">🗺️ ${r.plot}</a></td>
          <td class="c-muted">${r.city}</td><td class="c-muted">${r.block}</td>
          <td>${fmt1(r.area)}</td><td><b>${fmt(r.total_price)}</b></td>
          <td><button class="btn sm danger wl-rm" data-w="${w.id}" data-k="${window.plotKey(r)}">✕</button></td></tr>`).join('');
        return `<section class="wl-card"><div class="wl-head"><h3>${esc(w.name)} <span class="c-muted">· ${plots.length}</span></h3><span class="spacer"></span>
          <button class="btn sm wl-ren" data-id="${w.id}">${t('wl_rename')}</button>
          <button class="btn sm danger wl-del" data-id="${w.id}">${t('wl_delete')}</button></div>
          ${plots.length ? `<div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>${t('t_plot')}</th><th>${t('t_city')}</th><th>${t('t_block')}</th><th>${t('t_area')}</th><th>${t('t_total')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="c-muted" style="padding:6px 2px">${t('wl_no_plots')}</div>`}
        </section>`;
      }).join('');
      body.querySelectorAll('.wl-open').forEach(a => a.onclick = () => { const r = window.plotByKey[a.dataset.k]; if (r) openMap(r); });
      body.querySelectorAll('.wl-rm').forEach(b => b.onclick = async () => { await removePlot(b.dataset.w, b.dataset.k); drawBody(); if (window.refreshWishHearts) refreshWishHearts(); });
      body.querySelectorAll('.wl-del').forEach(b => b.onclick = async () => { if (confirm(t('wl_confirm_del'))) { await deleteList(b.dataset.id); drawBody(); if (window.refreshWishHearts) refreshWishHearts(); } });
      body.querySelectorAll('.wl-ren').forEach(b => b.onclick = async () => { const w = lists.find(x => x.id === b.dataset.id); const name = prompt(t('wl_new_prompt'), w ? w.name : ''); if (name === null) return; await renameList(b.dataset.id, name); drawBody(); });
    }
  }

  /* ---- admin analytics (server data = registered users) ---- */
  async function adminRender(el){
    if (!el) return;
    el.innerHTML = `<div class="ad-bar"><span class="c-muted">${t('vs_loading')}</span></div>`;
    let d; try { d = await (await fetch('api/admin?action=wishlists')).json(); } catch (e) { d = {}; }
    const s = d.summary || { wishlists: 0, users: 0, savedPlots: 0, uniquePlots: 0 };
    const top = (d.topPlots || []).map(x => ({ count: x.count, r: window.plotByKey[x.plot] })).filter(x => x.r);
    const lists2 = d.lists || [];
    const cards = [[t('wl_a_lists'), s.wishlists], [t('wl_a_users'), s.users], [t('wl_a_saved'), s.savedPlots], [t('wl_a_unique'), s.uniquePlots]]
      .map(c => `<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join('');
    const topRows = top.slice(0, 60).map(x => `<tr><td class="num"><b>${x.count}</b></td><td>${x.r.plot}</td><td class="c-muted">${x.r.city}</td><td class="c-muted">${x.r.block}</td><td>${fmt1(x.r.area)}</td><td><b>${fmt(x.r.total_price)}</b></td></tr>`).join('');
    const byCity = {}; top.forEach(x => { byCity[x.r.city] = (byCity[x.r.city] || 0) + x.count; });
    const cityRows = Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<tr><td>${c}</td><td class="num"><b>${n}</b></td></tr>`).join('');
    const listRows = lists2.slice(0, 250).map(w => `<tr><td class="c-muted">${esc(w.user)}</td><td>${esc(w.name)}</td><td class="num">${w.count}</td><td class="c-muted">${(w.created_at || '').slice(0, 10)}</td></tr>`).join('');
    el.innerHTML = `<div class="ad-note">${t('wl_a_note')}</div><section class="kpis vs-kpis">${cards}</section>
      <h3 style="margin:6px 0">${t('wl_a_top')}</h3>
      <div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>${t('wl_a_freq')}</th><th>${t('t_plot')}</th><th>${t('t_city')}</th><th>${t('t_block')}</th><th>${t('t_area')}</th><th>${t('t_total')}</th></tr></thead><tbody>${topRows || ''}</tbody></table></div>
      <h3 style="margin:12px 0 6px">${t('wl_a_bycity')}</h3>
      <div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>${t('t_city')}</th><th>${t('wl_a_freq')}</th></tr></thead><tbody>${cityRows}</tbody></table></div>
      <h3 style="margin:12px 0 6px">${t('wl_a_all')}</h3>
      <div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>${t('vs_user')}</th><th>${t('wl_name')}</th><th>${t('wl_count')}</th><th>${t('ad_created')}</th></tr></thead><tbody>${listRows || ''}</tbody></table></div>`;
  }

  return { load, render, adminRender, renderControl, has, toggleDefault, migrate };
})();
window.Wish = Wish;
