const STORAGE_KEY = 'cardTracker.cards.v1';
const SORT_KEY    = 'cardTracker.sort.v1';
const META_KEY    = 'cardTracker.meta.v1';

// ---------- Data ----------

function cryptoId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadCards() {
  let stored = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  if (!stored) {
    return CARDS.map(c => ({ id: cryptoId(), ...c }));
  }
  // Backfill (or refresh) seed-managed lookup fields by issuer+card match.
  return stored.map(c => {
    const seed = CARDS.find(s =>
      s.issuer.toLowerCase() === (c.issuer || '').toLowerCase() &&
      s.card.toLowerCase()   === (c.card   || '').toLowerCase()
    );
    if (!seed) return c;
    return {
      ...c,
      network: seed.network ?? c.network,
      earns:   seed.earns   ?? c.earns,
      perks:   seed.perks   ?? c.perks,
    };
  });
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { lastSaved: null };
}

function saveCards() {
  state.lastSaved = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cards));
  localStorage.setItem(META_KEY, JSON.stringify({ lastSaved: state.lastSaved }));
}

// ---------- Date helpers ----------

function parseDate(s) {
  if (!s || s === '-') return null;
  if (s.includes('-')) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const [m, d, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function toDisplayDate(s) {
  const d = parseDate(s);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function toInputDate(s) {
  const d = parseDate(s);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatShortDate(d) {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function formatShortDateNoYear(d) {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatFee(n) { return '$' + Number(n).toLocaleString(); }

function monthsSince(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m -= 1;
  return Math.max(0, m);
}

function ageText(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.floor((today - d) / 86400000));
  if (days < 365) return `${days} ${days === 1 ? 'day' : 'days'}`;
  const m = monthsSince(dateStr);
  const y = Math.floor(m / 12);
  const rem = m % 12;
  return rem === 0 ? `${y} yr` : `${y}y ${rem}m`;
}

function nextAnniversary(opened) {
  const d = parseDate(opened);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidate = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (candidate < today) candidate.setFullYear(candidate.getFullYear() + 1);
  return candidate;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------- Color logic ----------

const STYLE = {
  green:  'background:var(--green-bg);color:var(--green-fg);',
  amber:  'background:var(--amber-bg);color:var(--amber-fg);',
  rose:   'background:var(--rose-bg);color:var(--rose-fg);',
  purple: 'background:var(--purple-bg);color:var(--purple-fg);',
  slate:  'background:var(--slate-bg);color:var(--slate-fg);',
};

function typeStyle(t)      { return t === 'Business' ? STYLE.slate : STYLE.purple; }
function retentionStyle(r) { return r === 'No' ? STYLE.rose : r === 'Maybe' ? STYLE.amber : STYLE.green; }

const FEE_TIERS = [
  { max: 0,        h: 140 },
  { max: 99,       h: 100 },
  { max: 249,      h: 62  },
  { max: 499,      h: 35  },
  { max: 699,      h: 15  },
  { max: Infinity, h: 0   },
];
function feeTier(fee) {
  const v = Number(fee) || 0;
  return FEE_TIERS.find(t => v <= t.max);
}
function feeStyle(fee) {
  const { h } = feeTier(fee);
  return `background:hsl(${h}, 55%, 88%);color:hsl(${h}, 55%, 26%);`;
}

const AGE_TIERS = [
  { minMonths: 24, h: 140 },
  { minMonths: 12, h: 30  },
  { minMonths: 6,  h: 55  },
  { minMonths: 3,  h: 25  },
  { minMonths: 0,  h: 5   },
];
function ageTier(dateStr) {
  const m = monthsSince(dateStr);
  if (m === null) return AGE_TIERS[0];
  return AGE_TIERS.find(t => m >= t.minMonths);
}
function ageStyle(dateStr) {
  const { h } = ageTier(dateStr);
  return `background:hsl(${h}, 55%, 88%);color:hsl(${h}, 55%, 26%);`;
}
function ageAccent(dateStr) {
  const { h } = ageTier(dateStr);
  return `hsl(${h}, 60%, 55%)`;
}

function renewalAccent(days) {
  if (days === null || days === undefined) return 'hsl(140, 60%, 55%)';
  if (days <= 7)   return 'hsl(355, 70%, 55%)';
  if (days <= 30)  return 'hsl(25,  80%, 55%)';
  if (days <= 180) return 'hsl(210, 70%, 55%)';
  return 'hsl(140, 60%, 55%)';
}

const RETENTION_LABEL = { Yes: 'Keep', No: 'Cancel', Maybe: 'Undecided' };

// ---------- HTML escape ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

const TITLE_SMALL = new Set(['a','an','and','as','at','but','by','for','if','in','of','on','or','the','to','up','via','vs','with']);
function titleCase(str) {
  let i = 0;
  return str.replace(/[A-Za-z][A-Za-z'.]*/g, (word) => {
    const idx = i++;
    if (word.includes('.')) return word;
    if (/^[A-Z]{2,}$/.test(word)) return word;
    const lower = word.toLowerCase();
    if (idx > 0 && TITLE_SMALL.has(lower)) return lower;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

// ---------- Sorting ----------

function sortCards(cards, sortKey) {
  const [key, dir] = sortKey.split('-');
  const sign = dir === 'asc' ? 1 : -1;
  const numeric = key === 'annualFee';
  const dateField = key === 'opened';

  return [...cards].sort((a, b) => {
    let cmp;
    if (numeric) cmp = a[key] - b[key];
    else if (dateField) cmp = (parseDate(a[key])?.getTime() || 0) - (parseDate(b[key])?.getTime() || 0);
    else cmp = String(a[key]).localeCompare(String(b[key]));
    return cmp * sign;
  });
}

// ---------- Filtering ----------

function filterCards(cards) {
  let out = cards;
  if (state.typeFilter !== 'all') {
    out = out.filter(c => c.type === state.typeFilter);
  }
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    out = out.filter(c =>
      c.card.toLowerCase().includes(q) ||
      c.issuer.toLowerCase().includes(q)
    );
  }
  return out;
}

// ---------- State ----------

const meta = loadMeta();
const state = {
  cards: [],
  sortKey: localStorage.getItem(SORT_KEY) || 'opened-desc',
  editingId: null,
  selectedId: null,
  search: '',
  typeFilter: 'all',
  lastSaved: meta.lastSaved,
};

// ---------- Stats render ----------

function computeStats(cards) {
  const totalFees = cards.reduce((s, c) => s + (Number(c.annualFee) || 0), 0);
  const personal = cards.filter(c => c.type === 'Personal').length;
  const business = cards.filter(c => c.type === 'Business').length;
  const paying = cards.filter(c => c.annualFee > 0).length;
  const avg = paying ? Math.round(totalFees / paying) : 0;

  let nextRenewal = null;
  for (const c of cards) {
    if (!c.annualFee) continue;
    const date = nextAnniversary(c.opened);
    if (!date) continue;
    if (!nextRenewal || date < nextRenewal.date) nextRenewal = { card: c, date };
  }
  let renewalDays = null;
  if (nextRenewal) {
    const today = new Date(); today.setHours(0,0,0,0);
    renewalDays = daysBetween(today, nextRenewal.date);
  }
  const feesByIssuer = {};
  for (const c of cards) {
    if (!c.annualFee) continue;
    feesByIssuer[c.issuer] = (feesByIssuer[c.issuer] || 0) + Number(c.annualFee);
  }
  const issuerFees = Object.entries(feesByIssuer).sort((a, b) => b[1] - a[1]);
  return { count: cards.length, personal, business, totalFees, avg, paying, nextRenewal, renewalDays, issuerFees };
}

function renderStats() {
  const el = document.getElementById('stats');
  const s = computeStats(state.cards);

  const countdown = s.renewalDays === null ? '—'
    : s.renewalDays <= 0 ? 'today'
    : s.renewalDays === 1 ? 'tomorrow'
    : `${s.renewalDays} days`;

  const renewalCardName = s.nextRenewal ? escapeHtml(s.nextRenewal.card.card) : '';
  const renewalCardFee = s.nextRenewal && s.nextRenewal.card.annualFee
    ? formatFee(s.nextRenewal.card.annualFee) : '';
  const renewalSub = s.nextRenewal
    ? formatShortDate(s.nextRenewal.date)
    : 'No fee-bearing cards';

  const renewalStripe = s.nextRenewal
    ? renewalAccent(s.renewalDays)
    : 'var(--line-strong)';

  el.innerHTML = `
    <div class="stat" style="--accent-stripe: hsl(220, 14%, 60%)">
      <div class="stat-label">Total cards</div>
      <div class="stat-count">${s.count}</div>
      <div class="stat-value-row stat-value-row-sm">
        <span class="stat-value">${s.personal} personal</span>
        <span class="stat-value-divider"></span>
        <span class="stat-value">${s.business} business</span>
      </div>
    </div>
    <div class="stat" style="--accent-stripe: hsl(135, 45%, 50%)">
      <div class="stat-header-row">
        <div class="stat-label">Annual fees</div>
        <span class="stat-value-divider"></span>
        <div class="stat-value">${formatFee(s.totalFees)}</div>
      </div>
      <div class="fee-breakdown">${s.issuerFees.map(([i, f]) => `<div class="fee-group"><div class="fee-issuer">${escapeHtml(i)}</div><hr class="earn-divider"><div class="fee-amount">${formatFee(f)}</div></div>`).join('')}</div>
    </div>
    <div class="stat" style="--accent-stripe: ${renewalStripe}">
      <div class="stat-header">
        <div class="stat-label">Next renewal</div>
        <span class="stat-value-divider"></span>
        <div class="stat-sub stat-sub-inline">${renewalSub}</div>
      </div>
      <div class="stat-value-row">
        ${renewalCardName ? `<span class="stat-value">${renewalCardName}</span>${renewalCardFee ? `<span class="stat-value-divider"></span><span class="stat-value">${renewalCardFee}</span>` : ''}<span class="stat-value-divider"></span>` : ''}
        <span class="stat-value">${countdown}</span>
      </div>
    </div>
  `;
}

// ---------- Detail panel ----------

function sourceUrl(c) {
  const q = encodeURIComponent(`${c.issuer} ${c.card} credit card`);
  return `https://www.google.com/search?q=${q}`;
}

function renderDetail() {
  const panel = document.getElementById('detail-panel');
  if (!state.selectedId) { panel.hidden = true; panel.innerHTML = ''; return; }

  const c = state.cards.find(x => x.id === state.selectedId);
  if (!c) { state.selectedId = null; panel.hidden = true; panel.innerHTML = ''; return; }

  panel.hidden = false;
  panel.style.setProperty('--detail-accent', ageAccent(c.opened));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const renewal = nextAnniversary(c.opened);
  const renewalDays = renewal ? daysBetween(today, renewal) : null;

  const renewalValue = renewal ? formatShortDateNoYear(renewal) : '—';

  const sameIssuerNetwork = c.network && c.issuer && c.issuer.toLowerCase() === c.network.toLowerCase();
  const issuerLine = `${escapeHtml(c.issuer)}`;

  const earnsToRender = (c.earns || []).map(raw =>
    raw.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  );
  const earnsLabelHtml = 'Earns';
  const allOtherRe = /^(on\s+everything|everything\s+else|everywhere\s+else|all\s+others?|else|after\s+cap)$/i;
  const groups = [];
  const groupByRate = new Map();
  for (const e of earnsToRender) {
    const m = e.match(/^\s*([0-9]+(?:\.[0-9]+)?\s*[x%])\s+(.+)$/i);
    const rate = m ? m[1].replace(/\s+/g, '') : '';
    const labelText = m ? m[2] : e;
    const normalized = allOtherRe.test(labelText.trim()) ? 'all other' : labelText;
    const cats = normalized.split(/\s*\/\s*/).map(c => c.trim()).filter(Boolean);
    const key = rate || `__plain_${groups.length}`;
    let g = groupByRate.get(key);
    if (!g) {
      g = { rate, cats: [] };
      groupByRate.set(key, g);
      groups.push(g);
    }
    for (const c of cats) if (!g.cats.includes(c)) g.cats.push(c);
  }
  groups.sort((a, b) => {
    const av = parseFloat(a.rate); const bv = parseFloat(b.rate);
    if (isNaN(av) && isNaN(bv)) return 0;
    if (isNaN(av)) return 1;
    if (isNaN(bv)) return -1;
    return bv - av;
  });
  const earnsHtml = groups.length
    ? `<div class="earn-list">${groups.map(g => {
        const catsHtml = g.cats.map(c =>
          `<div class="earn-cat">${escapeHtml(titleCase(c))}</div>`
        ).join('');
        return `<div class="earn-group">${
          g.rate ? `<div class="earn-rate-heading">${escapeHtml(g.rate)}</div><hr class="earn-divider">` : ''
        }<div class="earn-cats">${catsHtml}</div></div>`;
      }).join('')}</div>`
    : `<span style="color:var(--ink-mute)">No earn data</span>`;

  panel.innerHTML = `
    <div class="detail-section identity">
      <div class="detail-eyebrow">${issuerLine}${c.network && !sameIssuerNetwork ? ` · ${escapeHtml(c.network)}` : ''}</div>
      <h2 class="detail-name">${escapeHtml(c.card)}</h2>
    </div>
    <div class="detail-section rewards">
      <div class="detail-section-label">${earnsLabelHtml}</div>
      <div class="detail-rewards">${earnsHtml}</div>
    </div>
    <div class="detail-section stats-section">
      <div class="detail-stat">
        <span class="detail-stat-label">Held</span>
        <span class="detail-stat-value">${ageText(c.opened)}</span>
      </div>
      <span class="stat-value-divider"></span>
      <div class="detail-stat">
        <span class="detail-stat-label">Annual fee</span>
        <span class="detail-stat-value">${formatFee(c.annualFee)}</span>
      </div>
      <span class="stat-value-divider"></span>
      <div class="detail-stat">
        <span class="detail-stat-label">Renewal</span>
        <span class="detail-stat-value">${renewalValue}</span>
      </div>
      <span class="stat-value-divider"></span>
      <div class="detail-stat">
        <span class="detail-stat-label">Plan</span>
        <span class="detail-stat-value">${RETENTION_LABEL[c.retention] || c.retention}</span>
      </div>
    </div>
  `;
}

function updateHeaderActions() {
  const hasSelection = !!state.selectedId;
  const edit = document.getElementById('header-edit');
  const del = document.getElementById('header-delete');
  if (edit) {
    edit.disabled = !hasSelection;
    edit.title = hasSelection ? 'Edit selected card' : 'Select a card first';
  }
  if (del) {
    del.disabled = !hasSelection;
    del.title = hasSelection ? 'Delete selected card' : 'Select a card first';
  }
}

function deleteSelected() {
  if (!state.selectedId) return;
  const c = state.cards.find(x => x.id === state.selectedId);
  if (!c) return;
  if (!confirm(`Delete ${c.card}?`)) return;
  state.cards = state.cards.filter(x => x.id !== state.selectedId);
  state.selectedId = null;
  saveCards();
  renderAll();
}

// ---------- Grid render ----------

function renderGrid() {
  const grid = document.getElementById('cards-grid');
  const empty = document.getElementById('grid-empty');
  grid.innerHTML = '';

  const visible = sortCards(filterCards(state.cards), state.sortKey);

  if (visible.length === 0) {
    empty.hidden = false;
    empty.textContent = state.cards.length === 0
      ? 'No cards yet. Click "+ Add card" to get started.'
      : 'No cards match your filters.';
    return;
  }
  empty.hidden = true;

  for (const c of visible) {
    const tile = document.createElement('div');
    tile.className = 'card-tile' + (c.id === state.selectedId ? ' selected' : '');
    tile.tabIndex = 0;
    tile.dataset.id = c.id;
    tile.innerHTML = `
      <div class="card-name">${escapeHtml(c.card)}</div>
      <span class="badge opened-badge" style="${ageStyle(c.opened)}" title="${monthsSince(c.opened)} months old">
        ${toDisplayDate(c.opened)}
      </span>
    `;
    tile.addEventListener('click', () => selectCard(c.id));
    tile.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(c.id); }
    });
    grid.appendChild(tile);
  }
}

function selectCard(id) {
  state.selectedId = (state.selectedId === id) ? null : id;
  renderGrid();
  renderDetail();
  updateHeaderActions();
}

// ---------- Last-saved ----------

function renderLastSaved() {
  const el = document.getElementById('last-saved');
  if (!state.lastSaved) { el.textContent = 'New session — no edits yet'; return; }
  el.textContent = `Last edited: ${relativeTime(state.lastSaved)}`;
}

// ---------- Aggregate render ----------

function renderAll() {
  renderStats();
  renderDetail();
  renderGrid();
  renderLastSaved();
  updateHeaderActions();
}

// ---------- Modal ----------

const modalBackdrop = () => document.getElementById('modal-backdrop');
const form = () => document.getElementById('card-form');

function openModal(id) {
  const isNew = !id;
  state.editingId = id || null;
  const card = id ? state.cards.find(c => c.id === id) : null;

  document.getElementById('modal-title').textContent = isNew ? 'Add card' : 'Edit card';
  document.getElementById('delete-card').hidden = isNew;

  const f = form();
  f.issuer.value    = card?.issuer    ?? '';
  f.card.value      = card?.card      ?? '';
  f.type.value      = card?.type      ?? 'Personal';
  f.retention.value = card?.retention ?? 'Yes';
  f.annualFee.value = card?.annualFee ?? 0;
  f.opened.value    = card ? toInputDate(card.opened) : new Date().toISOString().slice(0, 10);

  modalBackdrop().hidden = false;
  setTimeout(() => f.issuer.focus(), 50);
}

function closeModal() {
  modalBackdrop().hidden = true;
  state.editingId = null;
}

function handleSubmit(e) {
  e.preventDefault();
  const f = form();
  const data = {
    issuer: f.issuer.value.trim(),
    card: f.card.value.trim(),
    type: f.type.value,
    retention: f.retention.value,
    annualFee: Number(f.annualFee.value) || 0,
    opened: toDisplayDate(f.opened.value),
  };
  if (state.editingId) {
    const i = state.cards.findIndex(c => c.id === state.editingId);
    if (i >= 0) state.cards[i] = { ...state.cards[i], ...data };
  } else {
    const newCard = { id: cryptoId(), ...data };
    state.cards.push(newCard);
    state.selectedId = newCard.id;
  }
  saveCards();
  renderAll();
  closeModal();
}

function handleDeleteFromModal() {
  if (!state.editingId) return;
  if (!confirm('Delete this card?')) return;
  state.cards = state.cards.filter(c => c.id !== state.editingId);
  if (state.selectedId === state.editingId) state.selectedId = null;
  saveCards();
  renderAll();
  closeModal();
}

// ---------- Import / Export ----------

function handleExport() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: state.cards,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `card-wallet-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = Array.isArray(parsed) ? parsed : parsed.cards;
      if (!Array.isArray(incoming)) throw new Error('No cards array in file');
      if (!confirm(`Import ${incoming.length} cards? This replaces your current list.`)) return;
      state.cards = incoming.map(c => ({
        id: c.id || cryptoId(),
        issuer: c.issuer || '',
        card: c.card || '',
        type: c.type || 'Personal',
        retention: c.retention || 'Yes',
        annualFee: Number(c.annualFee) || 0,
        opened: c.opened || '',
        network: c.network,
        earns: c.earns,
        perks: c.perks,
      }));
      state.selectedId = null;
      saveCards();
      renderAll();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

// ---------- Wire-up ----------

document.addEventListener('DOMContentLoaded', () => {
  state.cards = loadCards();

  const sortSel = document.getElementById('sort-key');
  sortSel.value = state.sortKey;
  sortSel.addEventListener('change', () => {
    state.sortKey = sortSel.value;
    localStorage.setItem(SORT_KEY, state.sortKey);
    renderGrid();
  });

  const search = document.getElementById('search');
  search.addEventListener('input', () => { state.search = search.value; renderGrid(); });

  const typeFilter = document.getElementById('type-filter');
  typeFilter.addEventListener('change', () => { state.typeFilter = typeFilter.value; renderGrid(); });

  document.getElementById('add-card').addEventListener('click', () => openModal(null));
  document.getElementById('export-cards').addEventListener('click', handleExport);
  document.getElementById('import-cards').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', handleImportFile);
  document.getElementById('header-edit').addEventListener('click', () => {
    if (state.selectedId) openModal(state.selectedId);
  });
  document.getElementById('header-delete').addEventListener('click', deleteSelected);

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-card').addEventListener('click', closeModal);
  document.getElementById('delete-card').addEventListener('click', handleDeleteFromModal);
  form().addEventListener('submit', handleSubmit);

  modalBackdrop().addEventListener('click', e => {
    if (e.target === modalBackdrop()) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!modalBackdrop().hidden) closeModal();
      else if (state.selectedId) { state.selectedId = null; renderGrid(); renderDetail(); }
    }
  });

  renderAll();
  // Refresh "last edited" relative timestamp every minute
  setInterval(renderLastSaved, 60_000);
});
