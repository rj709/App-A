const STORAGE_KEY = 'cardTracker.cards.v1';
const SORT_KEY = 'cardTracker.sort.v1';

// ----- Data layer -----

function loadCards() {
  let stored = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  if (!stored) {
    return CARDS.map(c => ({ id: cryptoId(), ...c }));
  }
  // Backfill lookup-style fields (network/earns/perks) from seed when missing,
  // matching by issuer+card name. User-edited core fields are preserved.
  return stored.map(c => {
    const seed = CARDS.find(s =>
      s.issuer.toLowerCase() === (c.issuer || '').toLowerCase() &&
      s.card.toLowerCase()   === (c.card   || '').toLowerCase()
    );
    if (!seed) return c;
    // Seed-managed fields (not user-editable) always reflect the latest seed
    // so corrections to lookup data propagate without wiping user edits to
    // core fields (issuer, card, type, retention, fee, opened).
    return {
      ...c,
      network: seed.network ?? c.network,
      earns:   seed.earns   ?? c.earns,
      perks:   seed.perks   ?? c.perks,
    };
  });
}

function saveCards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cards));
}

function cryptoId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ----- Date helpers -----

function parseDate(s) {
  if (!s || s === '-') return null;
  if (s.includes('-')) { // YYYY-MM-DD from <input type=date>
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

function formatFee(n) {
  return '$' + Number(n).toLocaleString();
}

// ----- Color logic (derived) -----

const STYLE = {
  green:  'background:var(--green-bg);color:var(--green-fg);',
  amber:  'background:var(--amber-bg);color:var(--amber-fg);',
  rose:   'background:var(--rose-bg);color:var(--rose-fg);',
  purple: 'background:var(--purple-bg);color:var(--purple-fg);',
  slate:  'background:var(--slate-bg);color:var(--slate-fg);',
};

// Type is a category, not a value — use neutral, non-scale colors
// so it doesn't collide with the green/amber/rose meaning used for Fee/Retention.
function typeStyle(t)      { return t === 'Business' ? STYLE.slate : STYLE.purple; }
function retentionStyle(r) { return r === 'No' ? STYLE.rose : r === 'Maybe' ? STYLE.amber : STYLE.green; }

// Discrete fee tiers — 6 levels from free → ultra-premium.
// Thresholds chosen so each tier reads as a meaningful price band, not a
// smooth gradient that all looks the same.
const FEE_TIERS = [
  { max: 0,        label: 'Free',     h: 140 }, // $0
  { max: 99,       label: 'Low',      h: 100 }, // < $100
  { max: 249,      label: 'Mid-low',  h: 62  }, // $100–$249
  { max: 499,      label: 'Mid',      h: 35  }, // $250–$499
  { max: 699,      label: 'High',     h: 15  }, // $500–$699
  { max: Infinity, label: 'Premium',  h: 0   }, // $700+
];

function feeTier(fee) {
  const v = Number(fee) || 0;
  return FEE_TIERS.find(t => v <= t.max);
}

function feeStyle(fee) {
  const { h } = feeTier(fee);
  return `background:hsl(${h}, 55%, 88%);color:hsl(${h}, 55%, 26%);`;
}

// Months elapsed since the given MM/DD/YYYY date (not negative).
function monthsSince(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m -= 1;
  return Math.max(0, m);
}

// Age tiers — older is "safer" (green), newer is "fresher" (red).
const AGE_TIERS = [
  { minMonths: 24, h: 140 }, // 24+
  { minMonths: 12, h: 95  }, // 12–23
  { minMonths: 6,  h: 55  }, // 6–11
  { minMonths: 3,  h: 25  }, // 3–5
  { minMonths: 0,  h: 5   }, // 0–2
];

// Compact age string: "7 mo", "1 yr", "2y 3m"
function ageText(dateStr) {
  const m = monthsSince(dateStr);
  if (m === null) return '';
  if (m < 12) return `${m} mo`;
  const y = Math.floor(m / 12);
  const rem = m % 12;
  return rem === 0 ? `${y} yr` : `${y}y ${rem}m`;
}

// "Renews Jun 2 · in 32 days" (only for fee-bearing cards)
function renewalText(c) {
  if (!c.annualFee) return null;
  const date = nextAnniversary(c.opened);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = daysBetween(today, date);
  let when;
  if (days <= 0) when = 'today';
  else if (days === 1) when = 'tomorrow';
  else if (days <= 60) when = `in ${days}d`;
  else when = `in ~${Math.round(days / 30)} mo`;
  return `Renews ${formatShortDate(date)} · ${when}`;
}

// Display label for retention values
const RETENTION_LABEL = { Yes: 'Keep', No: 'No', Maybe: 'Maybe' };

function ageStyle(dateStr) {
  const m = monthsSince(dateStr);
  if (m === null) return 'background:hsl(0, 0%, 92%);color:hsl(0, 0%, 35%);';
  const tier = AGE_TIERS.find(t => m >= t.minMonths);
  return `background:hsl(${tier.h}, 55%, 88%);color:hsl(${tier.h}, 55%, 26%);`;
}

// ----- Stats -----

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatShortDate(d) {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Next yearly anniversary of an open date that is on/after today.
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
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

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
    if (!nextRenewal || date < nextRenewal.date) {
      nextRenewal = { card: c, date };
    }
  }

  let renewalDays = null;
  if (nextRenewal) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    renewalDays = daysBetween(today, nextRenewal.date);
  }

  return { count: cards.length, personal, business, totalFees, avg, paying, nextRenewal, renewalDays };
}

function renderStats() {
  const el = document.getElementById('stats');
  const s = computeStats(state.cards);

  const countdown = s.renewalDays === null ? '—'
    : s.renewalDays === 0 ? 'today'
    : s.renewalDays === 1 ? 'tomorrow'
    : `${s.renewalDays} days`;

  const renewalSub = s.nextRenewal
    ? `${escapeHtml(s.nextRenewal.card.card)} · ${formatShortDate(s.nextRenewal.date)} · ${formatFee(s.nextRenewal.card.annualFee)}/yr`
    : 'No fee-bearing cards';

  // Age tier color for the renewal accent stripe
  const renewalAccent = s.nextRenewal
    ? `hsl(${AGE_TIERS.find(t => 0 >= t.minMonths).h}, 60%, 55%)` // newest tier (urgent)
    : 'var(--line-strong)';

  el.innerHTML = `
    <div class="stat" style="--accent-stripe: hsl(220, 14%, 60%)">
      <div class="stat-label">Total cards</div>
      <div class="stat-value">${s.count}</div>
      <div class="stat-sub">${s.personal} personal · ${s.business} business</div>
    </div>
    <div class="stat" style="--accent-stripe: hsl(135, 45%, 50%)">
      <div class="stat-label">Annual fees</div>
      <div class="stat-value">${formatFee(s.totalFees)}</div>
      <div class="stat-sub">${formatFee(s.avg)} avg across ${s.paying} paying card${s.paying === 1 ? '' : 's'}</div>
    </div>
    <div class="stat" style="--accent-stripe: ${renewalAccent}">
      <div class="stat-label">Next renewal</div>
      <div class="stat-value">${countdown === '—' ? '—' : `in ${countdown}`}</div>
      <div class="stat-sub">${renewalSub}</div>
    </div>
  `;
}

// ----- Sorting -----

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

// ----- State -----

const state = {
  cards: [],
  sortKey: localStorage.getItem(SORT_KEY) || 'opened-desc',
  editingId: null,
  expanded: new Set(), // tile ids currently expanded
};

// ----- Render -----

function renderCards() {
  renderStats();
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';

  if (state.cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No cards yet. Click "+ Add card" to get started.';
    grid.appendChild(empty);
    return;
  }

  const sorted = sortCards(state.cards, state.sortKey);

  for (const c of sorted) {
    const tile = document.createElement('div');
    const isExpanded = state.expanded.has(c.id);
    tile.className = 'card-tile ' + (isExpanded ? 'expanded' : 'collapsed');
    tile.tabIndex = 0;
    tile.dataset.id = c.id;

    if (isExpanded) {
      const renewal = renewalText(c);
      const metaParts = [`Held ${ageText(c.opened)}`];
      if (renewal) metaParts.push(renewal);

      const issuerLine = c.network
        ? `${escapeHtml(c.issuer)} <span class="card-network">· ${escapeHtml(c.network)}</span>`
        : escapeHtml(c.issuer);

      const detailRows = [];
      if (c.earns?.length) {
        detailRows.push(`<dt>Earns</dt><dd>${c.earns.map(escapeHtml).join(' · ')}</dd>`);
      }
      if (c.perks?.length) {
        detailRows.push(`<dt>Perks</dt><dd>${c.perks.map(escapeHtml).join(' · ')}</dd>`);
      }
      const detailHtml = detailRows.length
        ? `<dl class="tile-detail">${detailRows.join('')}</dl>`
        : '';

      tile.innerHTML = `
        <div class="card-top">
          <div class="card-issuer">${issuerLine}</div>
          <span class="badge opened-badge" style="${ageStyle(c.opened)}" title="${monthsSince(c.opened)} months old">
            ${toDisplayDate(c.opened)}
          </span>
        </div>
        <div class="card-name">${escapeHtml(c.card)}</div>
        <div class="card-badges">
          <span class="badge" style="${typeStyle(c.type)}">${c.type}</span>
          <span class="badge" style="${retentionStyle(c.retention)}">${RETENTION_LABEL[c.retention] || c.retention}</span>
          <span class="badge" style="${feeStyle(c.annualFee)}">${formatFee(c.annualFee)}/yr</span>
        </div>
        ${detailHtml}
        <div class="tile-foot">
          <span class="tile-meta">${metaParts.join(' · ')}</span>
          <button class="tile-edit" type="button" aria-label="Edit card">Edit</button>
        </div>
      `;
      tile.querySelector('.tile-edit').addEventListener('click', e => {
        e.stopPropagation();
        openModal(c.id);
      });
    } else {
      tile.innerHTML = `
        <div class="card-name">${escapeHtml(c.card)}</div>
        <span class="badge opened-badge" style="${ageStyle(c.opened)}" title="${monthsSince(c.opened)} months old">
          ${toDisplayDate(c.opened)}
        </span>
      `;
    }

    tile.addEventListener('click', () => toggleExpand(c.id));
    tile.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(c.id); }
    });
    grid.appendChild(tile);
  }

  updateExpandToggleLabel();
}

function toggleExpand(id) {
  if (state.expanded.has(id)) state.expanded.delete(id);
  else state.expanded.add(id);
  renderCards();
}

function updateExpandToggleLabel() {
  const btn = document.getElementById('toggle-expand');
  if (!btn) return;
  const allExpanded = state.cards.length > 0 && state.expanded.size === state.cards.length;
  btn.textContent = allExpanded ? 'Collapse all' : 'Expand all';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// ----- Modal -----

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
  f.opened.value    = card ? toInputDate(card.opened) : toInputDate(new Date().toISOString().slice(0, 10));

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
    state.cards.push({ id: cryptoId(), ...data });
  }
  saveCards();
  renderCards();
  closeModal();
}

function handleDelete() {
  if (!state.editingId) return;
  if (!confirm('Delete this card?')) return;
  state.cards = state.cards.filter(c => c.id !== state.editingId);
  saveCards();
  renderCards();
  closeModal();
}

// ----- Wire up -----

document.addEventListener('DOMContentLoaded', () => {
  state.cards = loadCards();

  const sortSel = document.getElementById('sort-key');
  sortSel.value = state.sortKey;
  sortSel.addEventListener('change', () => {
    state.sortKey = sortSel.value;
    localStorage.setItem(SORT_KEY, state.sortKey);
    renderCards();
  });

  document.getElementById('toggle-expand').addEventListener('click', () => {
    const allExpanded = state.cards.length > 0 && state.expanded.size === state.cards.length;
    if (allExpanded) state.expanded.clear();
    else state.cards.forEach(c => state.expanded.add(c.id));
    renderCards();
  });
  document.getElementById('add-card').addEventListener('click', () => openModal(null));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-card').addEventListener('click', closeModal);
  document.getElementById('delete-card').addEventListener('click', handleDelete);
  form().addEventListener('submit', handleSubmit);

  modalBackdrop().addEventListener('click', e => {
    if (e.target === modalBackdrop()) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalBackdrop().hidden) closeModal();
  });

  renderCards();
});
