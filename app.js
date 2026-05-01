const STORAGE_KEY = 'cardTracker.cards.v1';

// ----- Data layer -----

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to seed */ }
  // Seed from cards.js, dropping deprecated fields and adding stable ids
  return CARDS.map(c => ({
    id: cryptoId(),
    issuer: c.issuer,
    card: c.card,
    type: c.type,
    retention: c.retention,
    annualFee: c.annualFee,
    opened: c.opened,
  }));
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

function dateGradient(t) {
  const stops = [
    { t: 0.0, h: 135 },
    { t: 0.5, h: 42  },
    { t: 1.0, h: 6   },
  ];
  let h = stops[0].h;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      h = a.h + (b.h - a.h) * ((t - a.t) / (b.t - a.t));
      break;
    }
  }
  return `hsl(${h.toFixed(1)}, 55%, 60%)`;
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
  sortKey: 'opened-desc',
  editingId: null,
};

// ----- Render -----

function renderCards() {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';

  if (state.cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No cards yet. Click "+ Add card" to get started.';
    grid.appendChild(empty);
    return;
  }

  const dates = state.cards.map(c => parseDate(c.opened)).filter(Boolean);
  const minT = Math.min(...dates.map(d => d.getTime()));
  const maxT = Math.max(...dates.map(d => d.getTime()));
  const span = maxT - minT || 1;

  const sorted = sortCards(state.cards, state.sortKey);

  for (const c of sorted) {
    const opened = parseDate(c.opened);
    const t = opened ? (opened.getTime() - minT) / span : 0;

    const tile = document.createElement('div');
    tile.className = 'card-tile';
    tile.tabIndex = 0;
    tile.dataset.id = c.id;
    tile.innerHTML = `
      <div>
        <div class="card-issuer">${escapeHtml(c.issuer)}</div>
        <div class="card-name">${escapeHtml(c.card)}</div>
      </div>
      <div class="card-badges">
        <span class="badge" style="${typeStyle(c.type)}">${c.type}</span>
        <span class="badge" style="${retentionStyle(c.retention)}">Keep: ${c.retention}</span>
        <span class="badge" style="${feeStyle(c.annualFee)}">${formatFee(c.annualFee)}/yr</span>
      </div>
      <div class="card-footer">
        <span class="card-opened">
          <span class="opened-dot" style="background:${dateGradient(t)}"></span>
          Opened ${toDisplayDate(c.opened)}
        </span>
      </div>
    `;
    tile.addEventListener('click', () => openModal(c.id));
    tile.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(c.id); }
    });
    grid.appendChild(tile);
  }
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
