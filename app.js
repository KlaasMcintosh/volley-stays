// Volley Stays — group accommodation planner. Plain JS, no build step.
const TABLES = ['events', 'options', 'members', 'rankings'];
const STATUSES = ['idea', 'shortlisted', 'booked', 'paid'];
const STATUS_LABEL = { idea: 'Idea', shortlisted: 'Shortlisted', booked: 'Booked', paid: 'Paid' };
const cfg = window.APP_CONFIG || {};
const DEMO = !(cfg.supabaseUrl && cfg.supabaseKey);

// ---------- Data stores ----------
async function supabaseStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async loadAll() {
      const res = await Promise.all(TABLES.map((t) => sb.from(t).select('*')));
      return Object.fromEntries(TABLES.map((t, i) => [t, check(res[i])]));
    },
    insert: async (t, row) => check(await sb.from(t).insert(row)),
    update: async (t, id, patch) => check(await sb.from(t).update(patch).eq('id', id)),
    remove: async (t, id) => check(await sb.from(t).delete().eq('id', id)),
    upsert: async (t, row, onConflict) => check(await sb.from(t).upsert(row, { onConflict })),
    subscribe(onChange, onStatus) {
      sb.channel('everything')
        .on('postgres_changes', { event: '*', schema: 'public' }, onChange)
        .subscribe((status) => onStatus(status === 'SUBSCRIBED'));
    },
  };
}

function localStore() {
  const KEY = 'volley-stays-demo';
  const read = () => JSON.parse(localStorage.getItem(KEY) || 'null');
  const write = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  if (!read()) {
    const ev = (name, s, e, loc) => ({ id: crypto.randomUUID(), name, start_date: s, end_date: e, location: loc, created_at: new Date().toISOString() });
    write({
      events: [
        ev('Aussie Open', '2027-01-07', '2027-01-10', ''),
        ev('Canberra', '2027-01-21', '2027-01-24', ''),
        ev('Glenelg', '2027-02-11', '2027-02-14', 'Glenelg Beach, SA'),
        ev('Coolangatta', '2027-03-11', '2027-03-14', 'Coolangatta Beach, QLD'),
        ev('Cobram', '2027-04-08', '2027-04-11', 'Thompsons Beach, Cobram, VIC'),
      ],
      options: [], members: [], rankings: [],
    });
  }
  let listener = () => {};
  const mutate = (fn) => { const d = read(); fn(d); write(d); listener(); };
  return {
    loadAll: async () => read(),
    insert: async (t, row) => mutate((d) => d[t].push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row })),
    update: async (t, id, patch) => mutate((d) => { const r = d[t].find((x) => x.id === id); if (r) Object.assign(r, patch); }),
    remove: async (t, id) => mutate((d) => {
      d[t] = d[t].filter((x) => x.id !== id);
      if (t === 'events') { d.options = d.options.filter((o) => o.event_id !== id); d.rankings = d.rankings.filter((r) => r.event_id !== id); }
    }),
    upsert: async (t, row, onConflict) => mutate((d) => {
      const keys = onConflict.split(',');
      const r = d[t].find((x) => keys.every((k) => x[k] === row[k]));
      if (r) Object.assign(r, row); else d[t].push({ created_at: new Date().toISOString(), ...row });
    }),
    subscribe(onChange, onStatus) {
      window.addEventListener('storage', (e) => e.key === KEY && onChange());
      onStatus(false);
    },
  };
}

// ---------- State ----------
let db;
let state = { events: [], options: [], members: [], rankings: [] };
let me = localStorage.getItem('volley-stays-name') || '';
let live = false;
let loaded = false;
const viewMode = {}; // eventId -> 'group' | 'mine'
const app = document.getElementById('app');
const modal = document.getElementById('modal');

async function refresh() {
  try {
    state = await db.loadAll();
    loaded = true;
    render();
  } catch (err) {
    showError(err);
  }
}
let refreshTimer;
const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 150); };

async function act(fn) {
  try { await fn(); await refresh(); } catch (err) { showError(err); }
}
function showError(err) {
  console.error(err);
  toast('Something went wrong: ' + (err.message || err));
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ---------- Helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const money = (n) => (n == null || isNaN(n) ? '—' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n));
const perPerson = (o) => (o.total_price != null && o.people > 0 ? Number(o.total_price) / o.people : null);
const parseDate = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s, opts = { day: 'numeric', month: 'short' }) => (s ? parseDate(s).toLocaleDateString('en-AU', opts) : '');
function fmtRange(a, b) {
  if (!a) return 'Dates TBC';
  if (!b || a === b) return fmtDate(a);
  const A = parseDate(a), B = parseDate(b);
  if (A.getMonth() === B.getMonth()) return `${A.getDate()}–${B.getDate()} ${B.toLocaleDateString('en-AU', { month: 'short' })}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}
function daysUntil(s) {
  if (!s) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((parseDate(s) - today) / 86400000);
}
function deadlineHtml(s) {
  if (!s) return '<span class="muted">—</span>';
  const d = daysUntil(s);
  const label = fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' });
  if (d < 0) return `<span class="dl-past" title="Passed">${label}</span>`;
  if (d <= 14) return `<span class="dl-soon">${label} · ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}</span>`;
  return label;
}
const hostLabel = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const sortedEvents = () => [...state.events].sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999') || a.name.localeCompare(b.name));
const eventOptions = (eid) => state.options.filter((o) => o.event_id === eid).sort((a, b) => a.created_at.localeCompare(b.created_at));
const memberNames = () => [...new Set(state.members.map((m) => m.name))].sort((a, b) => a.localeCompare(b));

// Combine rankings with a Borda count: with N options, your #1 gets N points, #2 gets N-1, …
// Ties are broken by number of first-place votes, then by who was added first.
function groupRanking(eid) {
  const opts = eventOptions(eid);
  const ids = new Set(opts.map((o) => o.id));
  const n = opts.length;
  const score = Object.fromEntries(opts.map((o) => [o.id, { points: 0, firsts: 0 }]));
  const voters = [];
  for (const r of state.rankings.filter((r) => r.event_id === eid)) {
    const list = (r.option_ids || []).filter((id) => ids.has(id));
    if (!list.length) continue;
    voters.push(r.member);
    list.forEach((id, i) => { score[id].points += n - i; if (i === 0) score[id].firsts += 1; });
  }
  const ranked = opts
    .map((o, i) => ({ o, i, ...score[o.id] }))
    .sort((a, b) => b.points - a.points || b.firsts - a.firsts || a.i - b.i);
  return { ranked, voters };
}
const topPick = (eid) => { const { ranked, voters } = groupRanking(eid); return voters.length && ranked.length ? ranked[0].o : null; };

function myOrder(eid) {
  const opts = eventOptions(eid);
  const byId = Object.fromEntries(opts.map((o) => [o.id, o]));
  const row = state.rankings.find((r) => r.event_id === eid && r.member === me);
  const saved = (row?.option_ids || []).filter((id) => byId[id]);
  const unranked = opts.filter((o) => !saved.includes(o.id)).map((o) => o.id);
  return { order: [...saved, ...unranked], saved: new Set(saved), hasRow: !!row };
}

// ---------- Rendering ----------
function route() {
  const m = location.hash.match(/^#e\/(.+)$/);
  return m ? { page: 'event', id: m[1] } : { page: 'summary' };
}

function render() {
  if (!loaded) return;
  if (!me) return renderJoin();
  const r = route();
  const ev = r.page === 'event' ? state.events.find((e) => e.id === r.id) : null;
  if (r.page === 'event' && !ev) { location.hash = ''; return; }
  app.innerHTML = `
    <header>
      <div class="topbar">
        <div class="brand">🏐 Volley Stays<small><span class="live ${live ? '' : 'off'}"></span>${DEMO ? 'demo' : live ? 'live' : 'connecting'}</small></div>
        <button class="me" data-act="switch-user">👤 ${esc(me)}</button>
      </div>
      <nav class="tabs">
        <a class="tab ${!ev ? 'active' : ''}" href="#">Summary</a>
        ${sortedEvents().map((e) => `<a class="tab ${ev?.id === e.id ? 'active' : ''}" href="#e/${e.id}">${esc(e.name)}<small>${esc(fmtRange(e.start_date, e.end_date))}</small></a>`).join('')}
        <button class="tab add" data-act="add-event">+ Event</button>
      </nav>
    </header>
    <main>
      ${DEMO ? '<div class="banner">Demo mode: not connected to the shared database yet, so changes only live on this device.</div>' : ''}
      ${ev ? renderEvent(ev) : renderSummary()}
    </main>`;
  const active = app.querySelector('.tab.active');
  if (active) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function renderJoin() {
  const names = memberNames();
  app.innerHTML = `
    <div class="join">
      <div class="ball">🏐</div>
      <h1>Volley Stays</h1>
      <p class="muted">Planning where we stay for each tour event. Who are you?</p>
      ${names.length ? `<div class="names">${names.map((n) => `<button class="btn" data-act="pick-name" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div><p class="muted small">…or join as someone new:</p>` : ''}
      <form id="join-form" class="row" style="flex-wrap:nowrap">
        <input name="name" placeholder="Your name" autocomplete="given-name" required maxlength="40" />
        <button class="btn primary">Join</button>
      </form>
    </div>`;
}

function renderSummary() {
  const evs = sortedEvents();
  if (!evs.length) return '<div class="empty">No events yet. Tap <b>+ Event</b> to add one.</div>';
  let soonCount = 0;
  const rows = evs.map((e) => {
    const opts = eventOptions(e.id);
    const booked = opts.filter((o) => o.status === 'booked' || o.status === 'paid');
    const win = booked.find((o) => o.status === 'paid') || booked[0] || topPick(e.id);
    const d = win ? daysUntil(win.cancel_by) : null;
    const soon = d != null && d >= 0 && d <= 14;
    if (soon) soonCount++;
    const url = win && safeUrl(win.url);
    return `
      <tr class="${soon ? 'soon' : ''}">
        <td class="ev"><a href="#e/${e.id}">${esc(e.name)}</a><div class="muted small">${esc(fmtRange(e.start_date, e.end_date))}${e.location ? ' · ' + esc(e.location) : ''}</div></td>
        <td data-label="Pick">${win ? `${esc(win.name)}${booked.length ? '' : ' <span class="muted small">(top ranked)</span>'}` : `<span class="muted">${opts.length ? 'Not ranked yet' : 'No options yet'}</span>`}</td>
        <td data-label="Per person">${win ? money(perPerson(win)) : '—'}</td>
        <td data-label="Status">${win ? `<span class="pill st-${win.status}">${STATUS_LABEL[win.status]}</span>${win.booked_by ? `<div class="muted small">by ${esc(win.booked_by)}</div>` : ''}` : '—'}</td>
        <td data-label="Cancel by">${win ? deadlineHtml(win.cancel_by) : '—'}</td>
        <td data-label="Link">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(hostLabel(url) || 'Open')} ↗</a>` : '—'}</td>
      </tr>`;
  }).join('');
  return `
    <h1>Season summary</h1>
    <p class="muted small" style="margin:0 0 12px">${soonCount ? `⚠️ ${soonCount} free-cancellation deadline${soonCount > 1 ? 's' : ''} in the next 14 days (highlighted).` : 'Booked option if there is one, otherwise the group’s top-ranked pick.'}</p>
    <table class="sum-table">
      <thead><tr><th>Event</th><th>Pick</th><th>Per person</th><th>Status</th><th>Cancel by</th><th>Link</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderEvent(e) {
  const opts = eventOptions(e.id);
  const mode = viewMode[e.id] || 'group';
  const { ranked, voters } = groupRanking(e.id);
  const pick = voters.length && ranked.length ? ranked[0].o : null;
  const members = memberNames();
  const notYet = members.filter((m) => !voters.includes(m));
  const mapUrl = e.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}` : '';

  let list;
  if (!opts.length) {
    list = '<div class="empty">No options yet. Paste the first Airbnb / Booking.com link.</div>';
  } else if (mode === 'mine') {
    const { order, saved, hasRow } = myOrder(e.id);
    const byId = Object.fromEntries(opts.map((o) => [o.id, o]));
    list = `
      <p class="muted small">Use the arrows to put your favourite at the top. Changes save instantly.</p>
      ${order.map((id, i) => optionCard(byId[id], i + 1, { mine: true, isNew: hasRow && !saved.has(id), first: i === 0, last: i === order.length - 1, eid: e.id })).join('')}
      ${!hasRow || order.some((id) => !saved.has(id)) ? `<button class="btn primary block" data-act="save-ranking" data-eid="${e.id}">${hasRow ? 'Save my ranking incl. new options' : 'Save this order as my ranking'}</button>` : ''}`;
  } else {
    list = ranked.map((r, i) => optionCard(r.o, voters.length ? i + 1 : '·', { points: r.points, firsts: r.firsts, voted: voters.length })).join('');
  }

  return `
    <div class="card">
      <div class="event-head">
        <div>
          <h1>${esc(e.name)}</h1>
          <div class="muted">${esc(fmtRange(e.start_date, e.end_date))}${e.start_date ? ' ' + parseDate(e.start_date).getFullYear() : ''}</div>
          <div class="small">${e.location ? `📍 <a href="${mapUrl}" target="_blank" rel="noopener">${esc(e.location)}</a>` : '<span class="muted">📍 Court location not set</span>'}</div>
        </div>
        <button class="btn small" data-act="edit-event" data-id="${e.id}">Edit</button>
      </div>
    </div>
    ${pick ? `
      <div class="pick">
        <div class="label">🏆 Group's top pick</div>
        <div class="name">${safeUrl(pick.url) ? `<a href="${esc(pick.url)}" target="_blank" rel="noopener">${esc(pick.name)} ↗</a>` : esc(pick.name)}</div>
        <div>${money(perPerson(pick))} per person · ${money(pick.total_price)} total</div>
        <div class="small" style="opacity:.85;margin-top:4px">Ranked by ${voters.map(esc).join(', ')}${notYet.length ? ` · waiting on ${notYet.map(esc).join(', ')}` : ''}</div>
      </div>` : opts.length ? `<div class="card muted small">Nobody has ranked these yet. Tap <b>My ranking</b> to vote.</div>` : ''}
    <button class="btn primary block" data-act="add-option" data-eid="${e.id}">+ Add an option</button>
    ${opts.length ? `<div class="seg">
      <button class="${mode === 'group' ? 'on' : ''}" data-act="mode" data-eid="${e.id}" data-mode="group">Group ranking</button>
      <button class="${mode === 'mine' ? 'on' : ''}" data-act="mode" data-eid="${e.id}" data-mode="mine">My ranking</button>
    </div>` : ''}
    ${list}`;
}

function optionCard(o, rankNo, x = {}) {
  const pp = perPerson(o);
  const url = safeUrl(o.url);
  const beds = [o.bedrooms != null ? `${o.bedrooms} bedroom${o.bedrooms == 1 ? '' : 's'}` : '', o.beds != null ? `${o.beds} bed${o.beds == 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const members = memberNames();
  const isBooked = o.status === 'booked' || o.status === 'paid';
  return `
    <div class="card opt">
      <div class="rank ${rankNo === 1 ? 'top' : ''}">${rankNo}</div>
      <div class="opt-body">
        <div class="opt-title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(o.name)} ↗</a>` : esc(o.name)}${x.isNew ? '<span class="tag-new">NEW</span>' : ''}</div>
        <div class="price">${money(pp)} <small>pp · ${money(o.total_price)} total for ${o.people ?? '?'}</small></div>
        <div class="facts">
          ${beds ? `<span>🛏 ${esc(beds)}</span>` : ''}
          ${o.distance ? `<span>🏐 ${esc(o.distance)} to courts</span>` : ''}
          <span>Free cancel by: ${deadlineHtml(o.cancel_by)}</span>
        </div>
        ${!x.mine && o.notes ? `<div class="notes">${esc(o.notes)}</div>` : ''}
        ${x.mine ? '' : `
        <div class="opt-foot">
          <select data-act="status" data-id="${o.id}" aria-label="Status" class="pill st-${o.status}">
            ${STATUSES.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
          </select>
          ${isBooked ? `<select data-act="booked-by" data-id="${o.id}" aria-label="Booked by">
            <option value="">Booked by…</option>
            ${[...new Set([...members, o.booked_by].filter(Boolean))].map((m) => `<option value="${esc(m)}" ${m === o.booked_by ? 'selected' : ''}>Booked by ${esc(m)}</option>`).join('')}
          </select>` : ''}
          <span class="score">${x.voted ? `${x.points} pts${x.firsts ? ` · ${x.firsts}× #1` : ''}` : ''}${o.added_by ? ` · added by ${esc(o.added_by)}` : ''}</span>
          <button class="btn small" data-act="edit-option" data-id="${o.id}" style="margin-left:auto">Edit</button>
        </div>`}
      </div>
      ${x.mine ? `<div class="movers">
        <button data-act="move" data-eid="${x.eid}" data-id="${o.id}" data-dir="-1" ${x.first ? 'disabled' : ''} aria-label="Move up">▲</button>
        <button data-act="move" data-eid="${x.eid}" data-id="${o.id}" data-dir="1" ${x.last ? 'disabled' : ''} aria-label="Move down">▼</button>
      </div>` : ''}
    </div>`;
}

// ---------- Forms ----------
function openModal(html, onSubmit, onReady) {
  modal.innerHTML = html;
  const form = modal.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (ev.submitter?.value === 'cancel') return modal.close();
    const data = Object.fromEntries(new FormData(form));
    const ok = await onSubmit(data, ev.submitter?.value);
    if (ok !== false) modal.close();
  });
  onReady?.(form);
  modal.showModal();
}
const num = (v) => (v === '' || v == null ? null : Number(v));

function eventForm(e) {
  openModal(`
    <form>
      <h2>${e ? 'Edit event' : 'New event'}</h2>
      <label>Event name</label><input name="name" required value="${esc(e?.name)}" placeholder="e.g. Glenelg" />
      <div class="grid2">
        <div><label>Start</label><input type="date" name="start_date" value="${esc(e?.start_date)}" /></div>
        <div><label>End</label><input type="date" name="end_date" value="${esc(e?.end_date)}" /></div>
      </div>
      <label>Court location</label><input name="location" value="${esc(e?.location)}" placeholder="e.g. Glenelg Beach, SA" />
      <div class="actions">
        ${e ? '<button class="btn danger left" value="delete" formnovalidate>Delete</button>' : ''}
        <button class="btn" value="cancel" formnovalidate>Cancel</button>
        <button class="btn primary" value="save">Save</button>
      </div>
    </form>`, async (d, btn) => {
    if (btn === 'delete') {
      if (!confirm(`Delete ${e.name} and all its options and rankings?`)) return false;
      await act(() => db.remove('events', e.id));
      location.hash = '';
      return;
    }
    const row = { name: d.name.trim(), start_date: d.start_date || null, end_date: d.end_date || null, location: d.location.trim() };
    if (e) await act(() => db.update('events', e.id, row));
    else await act(() => db.insert('events', row));
  });
}

function optionForm(eid, o) {
  const defaultPeople = o?.people ?? (memberNames().length || 6);
  openModal(`
    <form>
      <h2>${o ? 'Edit option' : 'Add an option'}</h2>
      <label>Link (Airbnb, Booking.com, …)</label><input name="url" type="url" inputmode="url" value="${esc(o?.url)}" placeholder="https://…" />
      <label>Name</label><input name="name" value="${esc(o?.name)}" placeholder="e.g. Beach house on Moseley St" />
      <div class="grid2">
        <div><label>Total price ($)</label><input name="total_price" type="number" inputmode="decimal" min="0" step="any" value="${o?.total_price ?? ''}" /></div>
        <div><label>Number of people</label><input name="people" type="number" inputmode="numeric" min="1" step="1" value="${defaultPeople}" /></div>
      </div>
      <div class="calc" id="pp-calc"></div>
      <div class="grid2">
        <div><label>Bedrooms</label><input name="bedrooms" type="number" inputmode="numeric" min="0" value="${o?.bedrooms ?? ''}" /></div>
        <div><label>Beds</label><input name="beds" type="number" inputmode="numeric" min="0" value="${o?.beds ?? ''}" /></div>
      </div>
      <div class="grid2">
        <div><label>Distance to courts</label><input name="distance" value="${esc(o?.distance)}" placeholder="e.g. 800 m" /></div>
        <div><label>Free cancellation until</label><input name="cancel_by" type="date" value="${esc(o?.cancel_by)}" /></div>
      </div>
      <label>Notes</label><textarea name="notes" placeholder="Parking, pool, check-in time…">${esc(o?.notes)}</textarea>
      <div class="actions">
        ${o ? '<button class="btn danger left" value="delete" formnovalidate>Delete</button>' : ''}
        <button class="btn" value="cancel" formnovalidate>Cancel</button>
        <button class="btn primary" value="save">${o ? 'Save' : 'Add option'}</button>
      </div>
    </form>`, async (d, btn) => {
    if (btn === 'delete') {
      if (!confirm(`Delete "${o.name}"?`)) return false;
      await act(() => db.remove('options', o.id));
      return;
    }
    const url = d.url.trim();
    const name = d.name.trim() || (url ? `Listing on ${hostLabel(url)}` : '');
    if (!name) { toast('Add a link or a name'); return false; }
    const row = {
      url, name,
      total_price: num(d.total_price), people: num(d.people),
      bedrooms: num(d.bedrooms), beds: num(d.beds),
      distance: d.distance.trim(), cancel_by: d.cancel_by || null, notes: d.notes.trim(),
    };
    if (o) await act(() => db.update('options', o.id, row));
    else await act(() => db.insert('options', { ...row, event_id: eid, status: 'idea', added_by: me }));
  }, (form) => {
    const calc = () => {
      const t = num(form.total_price.value), p = num(form.people.value);
      form.querySelector('#pp-calc').textContent = t != null && p > 0 ? `= ${money(t / p)} per person` : 'Enter price and people to see the per-person cost';
    };
    form.addEventListener('input', calc);
    calc();
  });
}

// ---------- Actions ----------
async function join(name) {
  name = name.trim().replace(/\s+/g, ' ');
  if (!name) return;
  const existing = state.members.find((m) => m.name.toLowerCase() === name.toLowerCase());
  me = existing ? existing.name : name;
  localStorage.setItem('volley-stays-name', me);
  if (!existing) await act(() => db.upsert('members', { name: me }, 'name'));
  else render();
}

async function saveRanking(eid, order) {
  await act(() => db.upsert('rankings', { event_id: eid, member: me, option_ids: order, updated_at: new Date().toISOString() }, 'event_id,member'));
}

app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT') return;
  const { act: a, id, eid } = el.dataset;
  if (a === 'switch-user') { if (confirm('Switch to a different name on this device?')) { me = ''; localStorage.removeItem('volley-stays-name'); render(); } }
  else if (a === 'pick-name') join(el.dataset.name);
  else if (a === 'add-event') eventForm(null);
  else if (a === 'edit-event') eventForm(state.events.find((e) => e.id === id));
  else if (a === 'add-option') optionForm(eid, null);
  else if (a === 'edit-option') { const o = state.options.find((x) => x.id === id); optionForm(o.event_id, o); }
  else if (a === 'mode') { viewMode[eid] = el.dataset.mode; render(); }
  else if (a === 'save-ranking') saveRanking(eid, myOrder(eid).order);
  else if (a === 'move') {
    const order = myOrder(eid).order;
    const i = order.indexOf(id), j = i + Number(el.dataset.dir);
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveRanking(eid, order);
  }
});

app.addEventListener('change', (ev) => {
  const el = ev.target;
  const o = state.options.find((x) => x.id === el.dataset.id);
  if (!o) return;
  if (el.dataset.act === 'status') {
    const patch = { status: el.value };
    if ((el.value === 'booked' || el.value === 'paid') && !o.booked_by) patch.booked_by = me;
    act(() => db.update('options', o.id, patch));
  } else if (el.dataset.act === 'booked-by') {
    act(() => db.update('options', o.id, { booked_by: el.value || null }));
  }
});

app.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'join-form') return;
  ev.preventDefault();
  join(new FormData(ev.target).get('name'));
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.close(); });

// ---------- Start ----------
(async () => {
  try {
    db = DEMO ? localStore() : await supabaseStore();
    db.subscribe(scheduleRefresh, (ok) => { live = ok; if (ok) scheduleRefresh(); else render(); });
    await refresh();
  } catch (err) {
    app.innerHTML = `<div class="join"><h1>Can't connect</h1><p class="muted">${esc(err.message || err)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`;
  }
})();
