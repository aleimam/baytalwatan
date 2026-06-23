/* ============================================================================
   UETR wire-transfer tracking — public search + per-source results + queue.
   Backend: POST /api/uetr to search; GET /api/uetr?action=admin for the panel.
   Source data is best-effort from independent trackers (not SWIFT).
   ========================================================================== */
const Uetr = (() => {
  const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED', 'KWD', 'QAR', 'OMR', 'BHD', 'JOD', 'CNY', 'JPY', 'CHF', 'CAD', 'AUD', 'TRY'];
  const STATES = ['delivered', 'in_progress', 'on_hold', 'rejected', 'not_found', 'pending', 'unknown', 'unconfigured', 'unavailable', 'error'];
  const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const badge = state => `<span class="ut-badge ut-${STATES.indexOf(state) >= 0 ? state : 'unknown'}">${t('ut_s_' + (STATES.indexOf(state) >= 0 ? state : 'unknown'))}</span>`;
  // free web trackers we link out to (we can't read their status, so the buyer reports back)
  const TRACKERS = [{ name: 'UETR.ai', url: 'https://uetr.ai/' }, { name: 'Ohmyfin', url: 'https://ohmyfin.ai/uetr' }, { name: 'TrackMySwift', url: 'https://trackmyswifts.app/' }];
  let LAST = {};   // last searched {uetr, amount, currency, date, bank}

  async function render(el){
    if (!el) return;
    const cur = CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('');
    el.innerHTML = `
      <div class="ad-bar"><h2 class="section-title" style="margin:0">${t('ut_title')}</h2></div>
      <div class="terms-note">${t('ut_intro')}</div>
      <form id="utForm" class="ut-form" autocomplete="off">
        <div class="ut-grid">
          <label class="ut-fld ut-wide"><span>${t('ut_uetr')} *</span><input id="utUetr" type="text" dir="ltr" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required></label>
          <label class="ut-fld"><span>${t('ut_amount')} *</span><input id="utAmount" type="number" step="any" min="0" dir="ltr" required></label>
          <label class="ut-fld"><span>${t('ut_currency')} *</span><select id="utCurrency" required>${cur}</select></label>
          <label class="ut-fld"><span>${t('ut_date')} *</span><input id="utDate" type="date" dir="ltr" required></label>
          <label class="ut-fld ut-wide"><span>${t('ut_bank')} <em>(${t('ut_optional')})</em></span><input id="utBank" type="text" placeholder="${t('ut_bank_ph')}"></label>
        </div>
        <div class="ut-actions"><button type="submit" class="btn solid" id="utSubmit">🔎 ${t('ut_search')}</button><span class="ut-err" id="utErr"></span></div>
      </form>
      <div id="utResult"></div>
      <div class="ut-disclaimer">${t('ut_disclaimer')}</div>`;
    el.querySelector('#utForm').onsubmit = submit;
  }

  async function submit(e){
    e.preventDefault();
    const g = id => document.getElementById(id);
    const uetr = g('utUetr').value.trim(), amount = g('utAmount').value, currency = g('utCurrency').value, date = g('utDate').value, bank = g('utBank').value.trim();
    const err = g('utErr'); err.textContent = '';
    if (!UUID_RE.test(uetr)) { err.textContent = t('ut_bad_uetr'); return; }
    LAST = { uetr, amount, currency, date, bank };
    const btn = g('utSubmit'); btn.disabled = true; btn.textContent = '… ' + t('ut_searching');
    const out = g('utResult'); out.innerHTML = `<div class="terms-note">${t('ut_searching')}…</div>`;
    let j;
    try { j = await (await fetch('api/uetr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uetr, amount, currency, date, bank }) })).json(); }
    catch (e2) { out.innerHTML = `<div class="ut-err">${t('ut_neterr')}</div>`; btn.disabled = false; btn.textContent = '🔎 ' + t('ut_search'); return; }
    btn.disabled = false; btn.textContent = '🔎 ' + t('ut_search');
    if (j.error === 'invalid_uetr') { err.textContent = t('ut_bad_uetr'); out.innerHTML = ''; return; }
    out.innerHTML = renderResult(j);
    wireResult();
  }

  function renderResult(j){
    const repeat = j.repeat ? `<div class="ut-repeat">⚠️ ${t('ut_repeat')} <b dir="ltr">${esc(j.firstSearchedAtCairo || '')}</b> ${t('ut_cairo')}. ${t('ut_repeat_note')}</div>` : '';
    const okSources = (j.sources || []).filter(s => s.ok);
    const sources = okSources.length ? `<h3 class="ut-h">${t('ut_by_source')}</h3><div class="ut-sources">${okSources.map(sourceCard).join('')}</div>` : '';
    return repeat + renderLinkout() + `<div id="utConc">${renderConc(j)}</div><div id="utQueue">${renderQueue(j.queue, j.deliveryAtCairo)}</div>` + sources;
  }
  function renderConc(j){
    const raw = j.conclusion || 'unknown';
    const c = (raw === 'unconfigured' || raw === 'unavailable') ? 'pending' : raw;   // link-out: awaiting the buyer's report
    return `<div class="ut-conc ut-c-${c}">
      <div class="ut-conc-l">${t('ut_conclusion')}</div>
      <div class="ut-conc-v">${badge(c)}</div>
      ${j.deliveryAtCairo ? `<div class="ut-conc-d">${t('ut_delivered_at')}: <b dir="ltr">${esc(j.deliveryAtCairo)}</b> ${t('ut_cairo')}</div>` : ''}
      ${j.agreement === false ? `<div class="ut-disagree">${t('ut_disagree')}</div>` : ''}</div>`;
  }
  function renderLinkout(){
    const btns = TRACKERS.map(tr => `<a class="btn solid ut-trk" href="${tr.url}" target="_blank" rel="noopener">${esc(tr.name)} ↗</a>`).join('');
    return `<div class="ut-linkout">
      <div class="ut-lo-h">🔗 ${t('ut_lo_title')}</div>
      <div class="ut-lo-btns">${btns}</div>
      <div class="ut-lo-copy">${t('ut_lo_copy')} <code class="ut-mono" dir="ltr">${esc(LAST.uetr || '')}</code> <button type="button" class="btn sm" id="utCopyBtn">📋 ${t('ut_lo_copybtn')}</button></div>
      <div class="ut-report">
        <div class="ut-lo-h">${t('ut_rep_title')}</div>
        <div class="ut-rep-row">
          <span class="ut-rep-deliv"><input type="date" id="utRepDate" dir="ltr"><button type="button" class="btn solid" id="utRepDelivered">✅ ${t('ut_rep_delivered')}</button></span>
          <button type="button" class="btn" id="utRepProgress">⏳ ${t('ut_rep_progress')}</button>
          <button type="button" class="btn danger" id="utRepNotfound">❌ ${t('ut_rep_notfound')}</button>
        </div>
        <span class="ut-rep-msg" id="utRepMsg"></span>
      </div>
    </div>`;
  }
  function wireResult(){
    const cp = document.getElementById('utCopyBtn');
    if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(LAST.uetr || ''); cp.textContent = '✓ ' + t('ut_lo_copied'); } catch (e) {} };
    const d = document.getElementById('utRepDelivered'); if (d) d.onclick = () => report('delivered', (document.getElementById('utRepDate') || {}).value || '');
    const p = document.getElementById('utRepProgress'); if (p) p.onclick = () => report('in_progress', '');
    const n = document.getElementById('utRepNotfound'); if (n) n.onclick = () => report('not_found', '');
  }
  async function report(status, date){
    const msg = document.getElementById('utRepMsg'); if (msg) msg.textContent = t('ut_searching') + '…';
    if (status === 'delivered' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { if (msg) msg.textContent = t('ut_rep_needdate'); return; }
    let j;
    try { j = await (await fetch('api/uetr?action=report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uetr: LAST.uetr, status, deliveredDate: date }) })).json(); }
    catch (e) { if (msg) msg.textContent = t('ut_neterr'); return; }
    if (j.error) { if (msg) msg.textContent = t('ut_rep_err'); return; }
    if (msg) msg.textContent = '✓ ' + t('ut_rep_saved');
    const ce = document.getElementById('utConc'); if (ce) ce.innerHTML = renderConc({ conclusion: j.conclusion, deliveryAtCairo: j.deliveryAtCairo });
    const qe = document.getElementById('utQueue'); if (qe) qe.innerHTML = renderQueue(j.queue, j.deliveryAtCairo);
  }

  function sourceCard(s){
    const rows = (s.details || []).map(d => `<tr><td>${esc(d.bank || '—')}</td><td class="c-muted" dir="ltr">${esc(d.swift || '')}</td><td>${esc(d.status || '')}</td><td class="c-muted">${esc(d.reason || '')}</td></tr>`).join('');
    return `<div class="ut-src">
      <div class="ut-src-h"><b>${esc(s.name)}</b> ${badge(s.state)}${s.lastupdateCairo ? `<span class="c-muted ut-upd">${t('ut_updated')}: <span dir="ltr">${esc(s.lastupdateCairo)}</span></span>` : ''}</div>
      ${s.reason && !s.ok ? `<div class="c-muted ut-reason">${t('ut_reason')}: ${esc(t('ut_r_' + s.reason) || s.reason)}</div>` : ''}
      ${rows ? `<div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>${t('ut_bank_col')}</th><th>SWIFT</th><th>${t('ut_status')}</th><th>${t('ut_note')}</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}</div>`;
  }

  function renderQueue(q, deliveryAtCairo){
    if (!q) return '';
    if (q.position) return `<div class="ut-queue ok"><div class="ut-q-n">#${q.position}</div><div class="ut-q-t"><b>${t('ut_queue_pos').replace('{n}', q.position).replace('{m}', q.total)}</b><div class="c-muted">${t('ut_queue_win')} ${q.windowStart} → ${q.windowEnd}</div></div></div>`;
    const why = deliveryAtCairo ? t('ut_queue_out') : t('ut_queue_pending');
    return `<div class="ut-queue"><div class="c-muted">${why}${q.total ? ` · ${t('ut_queue_total').replace('{m}', q.total)}` : ''}</div></div>`;
  }

  /* ---------- admin ---------- */
  async function adminRender(el){
    if (!el) return;
    el.innerHTML = `<div class="ad-bar"><span class="c-muted">${t('vs_loading')}</span></div>`;
    let d; try { d = await (await fetch('api/uetr?action=admin')).json(); } catch (e) { d = {}; }
    const s = d.summary || {};
    const cards = [[t('ut_a_unique'), s.uniqueUetr || 0], [t('ut_a_found'), s.found || 0], [t('ut_a_pending'), s.pending || 0], [t('ut_a_failed'), s.failed || 0], [t('ut_a_trials'), s.trials || 0], [t('ut_a_repeats'), s.repeats || 0], [t('ut_a_inwin'), s.inWindow || 0]]
      .map(c => `<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join('');
    const queue = (d.queue || []).map(r => `<tr><td class="num"><b>${r.pos}</b></td><td class="ut-mono" dir="ltr">${esc(r.uetr)}</td><td>${esc(r.bank || '—')}</td><td dir="ltr">${esc(r.currency || '')} ${r.amount != null ? fmt(r.amount) : ''}</td><td class="c-muted" dir="ltr">${esc(r.deliveryAtCairo || '')}</td></tr>`).join('');
    const trials = (d.trials || []).map(x => `<tr><td class="ut-mono" dir="ltr">${esc(x.uetr)}</td><td class="c-muted" dir="ltr">${esc(x.atCairo || '')}</td><td>${x.result === 'found' ? `<span class="ut-badge ut-delivered">${t('ut_a_r_found')}</span>` : `<span class="ut-badge ut-rejected">${t('ut_a_r_failed')}</span>`}</td><td>${x.repeat ? `<span class="c-muted">${t('ut_a_repeat')}</span>` : ''}</td><td>${esc(x.bank || '')}</td><td class="c-muted">${esc(x.user || '')}</td></tr>`).join('');
    el.innerHTML = `<div class="ad-note">${t('ut_a_note')}</div><section class="kpis vs-kpis">${cards}</section>
      <h3 style="margin:10px 0 6px">${t('ut_a_queue')} <span class="c-muted">(23 Jun → 2 Jul 2026)</span></h3>
      <div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>#</th><th>UETR</th><th>${t('ut_bank_col')}</th><th>${t('ut_amount')}</th><th>${t('ut_delivered_at')} (${t('ut_cairo')})</th></tr></thead><tbody>${queue || ''}</tbody></table></div>
      <h3 style="margin:12px 0 6px">${t('ut_a_alltrials')}</h3>
      <div class="tbl-wrap"><table class="data adtbl"><thead><tr><th>UETR</th><th>${t('ut_a_time')}</th><th>${t('ut_a_result')}</th><th></th><th>${t('ut_bank_col')}</th><th>${t('vs_user')}</th></tr></thead><tbody>${trials || ''}</tbody></table></div>`;
  }

  return { render, adminRender };
})();
window.Uetr = Uetr;
