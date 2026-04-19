const STORAGE_KEY = 'credit-tracker-v1';

const state = load() || { cards: [], credits: [], usages: {} };
if (!state.ui) state.ui = { hideUsed: false, hidePartial: false, hideIgnored: false };
if (state.ui.hidePartial === undefined) state.ui.hidePartial = false;
if (state.ui.hideIgnored === undefined) state.ui.hideIgnored = false;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  const opts = v % 1 === 0
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `$${v.toLocaleString('en-US', opts)}`;
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Compute the current period [start, end) for a credit given its frequency and anchor date.
// Anchor is any date on which a period begins; we walk forward from there.
function currentPeriod(credit, now = new Date()) {
  const anchor = new Date(credit.resetDate + 'T00:00:00');
  const freq = credit.frequency;

  if (freq === 'one-time') {
    return { start: anchor, end: null };
  }

  const monthsPer = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, quadrennial: 48 }[freq];
  if (!monthsPer) return { start: anchor, end: null };

  // Walk the period start forward until it contains `now`.
  let start = new Date(anchor);
  while (true) {
    const next = new Date(start);
    next.setMonth(next.getMonth() + monthsPer);
    if (next > now) {
      return { start, end: next };
    }
    start = next;
  }
}

function periodKey(credit, period) {
  return `${credit.id}::${period.start.toISOString().slice(0, 10)}`;
}

function isUsedThisPeriod(credit, period) {
  if (!period.end && credit.frequency === 'one-time') {
    return !!state.usages[credit.id + '::one-time'];
  }
  return !!state.usages[periodKey(credit, period)];
}

// A usage is either a timestamp string (fixed-value credit) or
// { ts, amount } for variable credits where the user captured part of a cap.
function usageTs(usage) {
  return typeof usage === 'object' && usage !== null ? usage.ts : usage;
}

function usageAmount(credit, usage) {
  if (usage == null) return 0;
  if (typeof usage === 'object' && 'amount' in usage) return Number(usage.amount) || 0;
  return Number(credit.value) || 0;
}

function promptForAmount(credit, existing) {
  const cap = Number(credit.value) || 0;
  const msg = `Amount used from "${credit.name}" (cap $${cap}):`;
  const raw = prompt(msg, existing != null ? String(existing) : '');
  if (raw === null) return null;
  const amount = parseFloat(raw);
  if (!isFinite(amount) || amount < 0) {
    alert('Enter a number ≥ 0.');
    return null;
  }
  return amount;
}

function toggleUsed(credit) {
  const period = currentPeriod(credit);
  const key = period.end ? periodKey(credit, period) : credit.id + '::one-time';
  if (state.usages[key]) {
    delete state.usages[key];
  } else if (credit.isVariable) {
    const amount = promptForAmount(credit);
    if (amount == null) return;
    state.usages[key] = { ts: new Date().toISOString(), amount };
  } else {
    state.usages[key] = new Date().toISOString();
  }
  save();
  render();
}

function decorateCredit(credit) {
  const period = currentPeriod(credit);
  const used = isUsedThisPeriod(credit, period);
  const now = new Date();
  const daysLeft = period.end ? daysBetween(now, period.end) : null;
  return { credit, period, used, daysLeft };
}

function periodsPerYear(freq) {
  return { monthly: 12, quarterly: 4, semiannual: 2, annual: 1, quadrennial: 0.25, 'one-time': 1 }[freq] || 0;
}

function annualValue(credit) {
  return periodsPerYear(credit.frequency) * (Number(credit.value) || 0);
}

// Sum value of redemptions recorded this calendar year for a credit.
// Uses the timestamp of when the user marked it used, so credits whose
// reset anchor isn't Jan 1 still attribute correctly.
function yearlyCaptured(credit, year = new Date().getFullYear()) {
  const prefix = credit.id + '::';
  let captured = 0;
  for (const [key, usage] of Object.entries(state.usages)) {
    if (!key.startsWith(prefix)) continue;
    if (new Date(usageTs(usage)).getFullYear() === year) {
      captured += usageAmount(credit, usage);
    }
  }
  return captured;
}

function render() {
  const list = document.getElementById('cards-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';

  if (state.cards.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
  }

  let unusedTotal = 0;
  let expiringCount = 0;
  let ytdTotal = 0;
  let annualTotal = 0;
  const expiringItems = [];
  const breakdownRows = [];

  for (let ci = 0; ci < state.cards.length; ci++) {
    const card = state.cards[ci];
    const isFirstCard = ci === 0;
    const isLastCard = ci === state.cards.length - 1;
    const cardCredits = state.credits
      .filter((c) => c.cardId === card.id)
      .map(decorateCredit);

    const activeCredits = cardCredits.filter((dc) => !dc.credit.ignored);
    const cardYtd = activeCredits.reduce((s, dc) => s + yearlyCaptured(dc.credit), 0);
    const cardAnnual = activeCredits.reduce((s, dc) => s + annualValue(dc.credit), 0);

    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.style.borderLeftColor = card.color || '#737373';

    const fee = Number(card.annualFee) || 0;
    const subParts = [card.issuer, card.last4 ? `•••• ${card.last4}` : null].filter(Boolean);
    const sub = subParts.join(' · ');

    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = `
      <div>
        <div class="card-title"></div>
        <div class="card-sub"></div>
      </div>
      <div class="card-actions">
        <button class="row-btn" data-move-card="${card.id}" data-dir="up" title="Move earlier" ${isFirstCard ? 'disabled' : ''}>▲</button>
        <button class="row-btn" data-move-card="${card.id}" data-dir="down" title="Move later" ${isLastCard ? 'disabled' : ''}>▼</button>
        <button data-edit-card="${card.id}">Edit</button>
        <button data-delete-card="${card.id}">Delete</button>
      </div>
    `;
    head.querySelector('.card-title').textContent = card.name;
    head.querySelector('.card-sub').textContent = sub;
    cardEl.appendChild(head);

    const credList = document.createElement('div');
    credList.className = 'credits';

    const visibleCredits = cardCredits.filter((dc) => {
      if (state.ui.hideIgnored && dc.credit.ignored) return false;
      if (state.ui.hideUsed && dc.used) return false;
      if (state.ui.hidePartial && dc.used) {
        const ytd = yearlyCaptured(dc.credit);
        const annual = annualValue(dc.credit);
        if (annual > 0 && ytd >= annual) return false;
      }
      return true;
    });

    if (cardCredits.length === 0) {
      const p = document.createElement('p');
      p.className = 'card-sub';
      p.textContent = 'No credits tracked yet.';
      credList.appendChild(p);
    } else if (visibleCredits.length === 0) {
      const p = document.createElement('p');
      p.className = 'card-sub';
      p.textContent = 'All credits used this period.';
      credList.appendChild(p);
    }

    ytdTotal += cardYtd;
    annualTotal += cardAnnual;
    breakdownRows.push({ card, fee, cardYtd, cardAnnual });

    for (let i = 0; i < visibleCredits.length; i++) {
      const dc = visibleCredits[i];
      const isFirst = i === 0;
      const isLast = i === visibleCredits.length - 1;
      const { credit, period, used, daysLeft } = dc;
      const usageKey = period.end ? periodKey(credit, period) : credit.id + '::one-time';
      const currentUsage = state.usages[usageKey];
      const capturedThisPeriod = used ? usageAmount(credit, currentUsage) : 0;
      if (!used && !credit.ignored) unusedTotal += Number(credit.value) || 0;

      const ytd = yearlyCaptured(credit);
      const annual = annualValue(credit);

      const metaParts = [formatFrequency(credit.frequency)];
      if (credit.ignored) metaParts.push('Not using');
      const isPartial = used && typeof currentUsage === 'object' && currentUsage !== null && 'amount' in currentUsage;
      if (credit.isVariable) {
        metaParts.push(used ? `${fmtMoney(capturedThisPeriod)} used` : 'Variable');
      } else if (isPartial) {
        metaParts.push(`${fmtMoney(capturedThisPeriod)} used`);
      }
      if (daysLeft !== null && !used && !credit.ignored && daysLeft <= 30) {
        expiringCount += 1;
        expiringItems.push({ card, ...dc });
      }
      if (annual > 0) {
        metaParts.push(`${fmtMoney(ytd)} / ${fmtMoney(annual)} YTD`);
      }
      if (credit.notes) metaParts.push(credit.notes);

      let badgeClass = '';
      if (used) badgeClass = 'good';
      else if (daysLeft !== null && daysLeft <= 7) badgeClass = 'bad';
      else if (daysLeft !== null && daysLeft <= 30) badgeClass = 'warn';

      const row = document.createElement('div');
      row.className = 'credit' + (used ? ' used' : '') + (credit.ignored ? ' ignored' : '');
      row.innerHTML = `
        <div class="credit-check">✓</div>
        <div class="credit-body">
          <div class="credit-name"></div>
          <div class="credit-meta"></div>
        </div>
        <div class="credit-value"></div>
        <span class="badge ${badgeClass}"></span>
        <div class="credit-reorder">
          <button class="row-btn" data-move-credit="${credit.id}" data-dir="up" title="Move up" ${isFirst ? 'disabled' : ''}>▲</button>
          <button class="row-btn" data-move-credit="${credit.id}" data-dir="down" title="Move down" ${isLast ? 'disabled' : ''}>▼</button>
        </div>
        <button class="row-btn" data-amount-credit="${credit.id}" title="Enter partial amount">$</button>
        <button class="row-btn" data-history-credit="${credit.id}" title="History">⟳</button>
        <button class="row-btn" data-edit-credit="${credit.id}" title="Edit">✎</button>
      `;
      row.querySelector('.credit-name').textContent = credit.name;
      row.querySelector('.credit-meta').textContent = metaParts.join(' · ');
      row.querySelector('.credit-value').textContent = fmtMoney(credit.value);
      const badge = row.querySelector('.badge');
      badge.textContent = used ? 'Used' : daysLeft === null ? 'One-time' : daysLeft <= 0 ? 'Expired' : 'Open';

      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-edit-credit]')) return;
        if (e.target.closest('[data-move-credit]')) return;
        if (e.target.closest('[data-history-credit]')) return;
        if (e.target.closest('[data-amount-credit]')) return;
        toggleUsed(credit);
      });
      credList.appendChild(row);
    }

    cardEl.appendChild(credList);
    list.appendChild(cardEl);
  }

  const feesTotal = state.cards.reduce((s, c) => s + (Number(c.annualFee) || 0), 0);

  document.getElementById('stat-unused').textContent = fmtMoney(unusedTotal);
  document.getElementById('stat-expiring').textContent = expiringCount;
  document.getElementById('stat-ytd').textContent =
    annualTotal > 0 ? `${fmtMoney(ytdTotal)} / ${fmtMoney(annualTotal)}` : fmtMoney(ytdTotal);
  document.getElementById('stat-fees').textContent = fmtMoney(feesTotal);

  renderBreakdown(breakdownRows);
  renderExpiring(expiringItems);
}

function renderBreakdown(rows) {
  const container = document.getElementById('summary-breakdown');
  container.innerHTML = '';
  if (rows.length === 0) return;

  const header = document.createElement('div');
  header.className = 'breakdown-header';
  header.innerHTML = `
    <span>Card</span>
    <span>YTD · Net</span>
    <span>Annual fee</span>
  `;
  container.appendChild(header);

  for (const { card, fee, cardYtd, cardAnnual } of rows) {
    const net = cardYtd - fee;
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.style.borderLeftColor = card.color || '#737373';
    const mathText = cardAnnual > 0
      ? `${fmtMoney(cardYtd)} / ${fmtMoney(cardAnnual)}`
      : fmtMoney(cardYtd);
    const netText = fee > 0
      ? ` · Net ${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}`
      : '';
    const netClass = fee > 0 && net < 0 ? ' breakdown-net-neg' : '';
    row.innerHTML = `
      <span class="breakdown-name"></span>
      <span class="breakdown-math${netClass}"></span>
      <span class="breakdown-fee"></span>
    `;
    row.querySelector('.breakdown-name').textContent = card.name;
    row.querySelector('.breakdown-math').textContent = mathText + netText;
    row.querySelector('.breakdown-fee').textContent = fee > 0 ? fmtMoney(fee) : '—';
    container.appendChild(row);
  }
}

function renderExpiring(items) {
  const section = document.getElementById('expiring-section');
  const list = document.getElementById('expiring-list');
  list.innerHTML = '';

  if (items.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  items.sort((a, b) => a.daysLeft - b.daysLeft);

  for (const item of items) {
    const { credit, card, daysLeft } = item;
    const badgeClass = daysLeft <= 7 ? 'bad' : 'warn';
    const row = document.createElement('div');
    row.className = 'credit';
    row.innerHTML = `
      <div class="credit-check">✓</div>
      <div class="credit-body">
        <div class="credit-name"></div>
        <div class="credit-meta"></div>
      </div>
      <div class="credit-value"></div>
      <span class="badge ${badgeClass}"></span>
    `;
    row.querySelector('.credit-name').textContent = `${credit.name} — ${card.name}`;
    row.querySelector('.credit-meta').textContent = `${daysLeft}d left · ${formatFrequency(credit.frequency)}`;
    row.querySelector('.credit-value').textContent = fmtMoney(credit.value);
    row.querySelector('.badge').textContent = daysLeft <= 0 ? 'Expired' : `${daysLeft}d`;
    row.addEventListener('click', () => toggleUsed(credit));
    list.appendChild(row);
  }
}

function formatFrequency(f) {
  return {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semiannual: 'Biannual',
    annual: 'Annual',
    quadrennial: 'Every 4 years',
    'one-time': 'One-time',
  }[f] || f;
}

// --- Dialogs ---

const cardDialog = document.getElementById('card-dialog');
const cardForm = document.getElementById('card-form');
const creditDialog = document.getElementById('credit-dialog');
const creditForm = document.getElementById('credit-form');
const creditDeleteBtn = document.getElementById('credit-delete-btn');

function openCardDialog(card = null) {
  document.getElementById('card-dialog-title').textContent = card ? 'Edit Card' : 'Add Card';
  cardForm.reset();
  cardForm.elements.id.value = card?.id || '';
  cardForm.elements.name.value = card?.name || '';
  cardForm.elements.issuer.value = card?.issuer || '';
  cardForm.elements.last4.value = card?.last4 || '';
  cardForm.elements.annualFee.value = card?.annualFee ?? '';
  cardForm.elements.color.value = card?.color || '#737373';
  cardDialog.showModal();
}

function openCreditDialog(credit = null, defaultCardId = null) {
  document.getElementById('credit-dialog-title').textContent = credit ? 'Edit Credit' : 'Add Credit';
  const select = document.getElementById('credit-card-select');
  select.innerHTML = state.cards.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  creditForm.reset();
  creditForm.elements.id.value = credit?.id || '';
  creditForm.elements.cardId.value = credit?.cardId || defaultCardId || state.cards[0]?.id || '';
  creditForm.elements.name.value = credit?.name || '';
  creditForm.elements.value.value = credit?.value ?? '';
  creditForm.elements.frequency.value = credit?.frequency || 'monthly';
  creditForm.elements.resetDate.value = credit?.resetDate || defaultResetDate();
  creditForm.elements.notes.value = credit?.notes || '';
  creditForm.elements.variable.checked = !!credit?.isVariable;
  creditForm.elements.ignored.checked = !!credit?.ignored;
  creditDeleteBtn.classList.toggle('hidden', !credit);
  creditDialog.showModal();
}

function defaultResetDate() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

cardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(cardForm));
  const fee = data.annualFee === '' ? 0 : parseFloat(data.annualFee) || 0;
  if (data.id) {
    const card = state.cards.find((c) => c.id === data.id);
    Object.assign(card, {
      name: data.name,
      issuer: data.issuer,
      last4: data.last4,
      annualFee: fee,
      color: data.color,
    });
  } else {
    state.cards.push({
      id: uid(),
      name: data.name,
      issuer: data.issuer,
      last4: data.last4,
      annualFee: fee,
      color: data.color,
    });
  }
  save();
  cardDialog.close();
  render();
});

creditForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(creditForm));
  if (!data.cardId) {
    alert('Please add a card first.');
    return;
  }
  const payload = {
    cardId: data.cardId,
    name: data.name,
    value: parseFloat(data.value) || 0,
    frequency: data.frequency,
    resetDate: data.resetDate,
    notes: data.notes,
    isVariable: !!data.variable,
    ignored: !!data.ignored,
  };
  if (data.id) {
    const credit = state.credits.find((c) => c.id === data.id);
    Object.assign(credit, payload);
  } else {
    state.credits.push({ id: uid(), ...payload });
  }
  save();
  creditDialog.close();
  render();
});

creditDeleteBtn.addEventListener('click', () => {
  const id = creditForm.elements.id.value;
  if (!id) return;
  if (!confirm('Delete this credit?')) return;
  state.credits = state.credits.filter((c) => c.id !== id);
  // Clean usages for this credit
  for (const k of Object.keys(state.usages)) {
    if (k.startsWith(id + '::')) delete state.usages[k];
  }
  save();
  creditDialog.close();
  render();
});

document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close())
);

const toggleUsedBtn = document.getElementById('toggle-used');
const togglePartialBtn = document.getElementById('toggle-partial');
const toggleIgnoredBtn = document.getElementById('toggle-ignored');
function updateFilterButtons() {
  toggleUsedBtn.textContent = state.ui.hideUsed ? 'Show used' : 'Hide used';
  toggleUsedBtn.classList.toggle('active', state.ui.hideUsed);
  togglePartialBtn.textContent = state.ui.hidePartial ? 'Show completed' : 'Hide completed';
  togglePartialBtn.classList.toggle('active', state.ui.hidePartial);
  toggleIgnoredBtn.textContent = state.ui.hideIgnored ? 'Show ignored' : 'Hide ignored';
  toggleIgnoredBtn.classList.toggle('active', state.ui.hideIgnored);
}
toggleUsedBtn.addEventListener('click', () => {
  state.ui.hideUsed = !state.ui.hideUsed;
  save();
  updateFilterButtons();
  render();
});
togglePartialBtn.addEventListener('click', () => {
  state.ui.hidePartial = !state.ui.hidePartial;
  save();
  updateFilterButtons();
  render();
});
toggleIgnoredBtn.addEventListener('click', () => {
  state.ui.hideIgnored = !state.ui.hideIgnored;
  save();
  updateFilterButtons();
  render();
});
updateFilterButtons();

document.getElementById('add-card-btn').addEventListener('click', () => openCardDialog());
document.getElementById('add-credit-btn').addEventListener('click', () => {
  if (state.cards.length === 0) {
    alert('Add a card first.');
    return;
  }
  openCreditDialog();
});

document.getElementById('cards-list').addEventListener('click', (e) => {
  const moveCard = e.target.closest('[data-move-card]');
  if (moveCard) {
    moveCardOrder(moveCard.dataset.moveCard, moveCard.dataset.dir);
    return;
  }
  const editCard = e.target.closest('[data-edit-card]');
  if (editCard) {
    const card = state.cards.find((c) => c.id === editCard.dataset.editCard);
    openCardDialog(card);
    return;
  }
  const delCard = e.target.closest('[data-delete-card]');
  if (delCard) {
    const card = state.cards.find((c) => c.id === delCard.dataset.deleteCard);
    const credits = state.credits.filter((c) => c.cardId === card.id);
    const msg = credits.length
      ? `Delete "${card.name}" and its ${credits.length} credit(s)?`
      : `Delete "${card.name}"?`;
    if (!confirm(msg)) return;
    state.cards = state.cards.filter((c) => c.id !== card.id);
    state.credits = state.credits.filter((c) => c.cardId !== card.id);
    save();
    render();
    return;
  }
  const editCredit = e.target.closest('[data-edit-credit]');
  if (editCredit) {
    const credit = state.credits.find((c) => c.id === editCredit.dataset.editCredit);
    openCreditDialog(credit);
    return;
  }
  const moveCredit = e.target.closest('[data-move-credit]');
  if (moveCredit) {
    moveCreditInCard(moveCredit.dataset.moveCredit, moveCredit.dataset.dir);
    return;
  }
  const historyCredit = e.target.closest('[data-history-credit]');
  if (historyCredit) {
    const credit = state.credits.find((c) => c.id === historyCredit.dataset.historyCredit);
    openHistoryDialog(credit);
    return;
  }
  const amountCredit = e.target.closest('[data-amount-credit]');
  if (amountCredit) {
    const credit = state.credits.find((c) => c.id === amountCredit.dataset.amountCredit);
    setPartialAmount(credit);
  }
});

function setPartialAmount(credit) {
  const period = currentPeriod(credit);
  const key = period.end ? periodKey(credit, period) : credit.id + '::one-time';
  const existing = state.usages[key];
  const current = existing != null ? usageAmount(credit, existing) : Number(credit.value) || 0;
  const raw = prompt(`Amount used from "${credit.name}" (face $${credit.value}):`, String(current));
  if (raw === null) return;
  const amt = parseFloat(raw);
  if (!isFinite(amt) || amt < 0) { alert('Enter a number ≥ 0.'); return; }
  const now = new Date();
  const ts = existing != null
    ? usageTs(existing)
    : (period.end && (now < period.start || now >= period.end) ? period.start.toISOString() : now.toISOString());
  state.usages[key] = { ts, amount: amt };
  save();
  render();
}

// Build every period from the credit's anchor through the end of the
// current calendar year, so the user can see and pre-mark upcoming
// periods too.
function allPeriods(credit, through = endOfCurrentYear()) {
  if (credit.frequency === 'one-time') {
    return [{ start: new Date(credit.resetDate + 'T00:00:00'), end: null }];
  }
  const monthsPer = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, quadrennial: 48 }[credit.frequency];
  if (!monthsPer) return [];
  const anchor = new Date(credit.resetDate + 'T00:00:00');
  const periods = [];
  let start = new Date(anchor);
  while (start <= through) {
    const end = new Date(start);
    end.setMonth(end.getMonth() + monthsPer);
    periods.push({ start: new Date(start), end: new Date(end) });
    start = end;
  }
  return periods;
}

function endOfCurrentYear() {
  const y = new Date().getFullYear();
  return new Date(y, 11, 31, 23, 59, 59, 999);
}

function formatPeriod(period, freq) {
  if (!period.end) return 'One-time';
  const s = period.start;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const y = s.getFullYear();
  const m = s.getMonth();
  if (freq === 'monthly') return `${monthNames[m]} ${y}`;
  if (freq === 'quarterly') return `Q${Math.floor(m / 3) + 1} ${y}`;
  if (freq === 'semiannual') return `${m < 6 ? 'H1' : 'H2'} ${y}`;
  if (freq === 'annual' || freq === 'quadrennial') {
    const eY = new Date(period.end);
    eY.setDate(eY.getDate() - 1);
    return y === eY.getFullYear() ? `${y}` : `${y}–${eY.getFullYear()}`;
  }
  return s.toISOString().slice(0, 10);
}

function openHistoryDialog(credit) {
  const dialog = document.getElementById('history-dialog');
  document.getElementById('history-title').textContent = `${credit.name} — history`;
  document.getElementById('history-sub').textContent =
    `${fmtMoney(credit.value)} · ${formatFrequency(credit.frequency)}`;
  renderHistoryList(credit);
  dialog.showModal();
}

function renderHistoryList(credit) {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  const periods = allPeriods(credit).reverse();
  const now = new Date();

  for (const p of periods) {
    const key = p.end ? `${credit.id}::${p.start.toISOString().slice(0, 10)}` : `${credit.id}::one-time`;
    const used = !!state.usages[key];
    const isCurrent = p.end && p.start <= now && now < p.end;

    const row = document.createElement('div');
    row.className = 'history-row' + (used ? ' used' : '');
    row.innerHTML = `
      <label class="history-check">
        <input type="checkbox" ${used ? 'checked' : ''} />
      </label>
      <div class="history-label">
        <span class="history-period"></span>
        <span class="history-meta"></span>
      </div>
      <button type="button" class="row-btn history-amount-btn" title="Enter amount used">$</button>
    `;
    const isFuture = p.end && p.start > now;
    row.querySelector('.history-period').textContent = formatPeriod(p, credit.frequency);
    const metaBits = [];
    if (isCurrent) metaBits.push('Current');
    else if (isFuture) metaBits.push('Upcoming');
    if (used) metaBits.push(fmtMoney(usageAmount(credit, state.usages[key])));
    row.querySelector('.history-meta').textContent = metaBits.join(' · ');
    if (isFuture) row.classList.add('future');

    row.querySelector('.history-amount-btn').addEventListener('click', () => {
      const existing = state.usages[key];
      const current = existing != null
        ? usageAmount(credit, existing)
        : Number(credit.value) || 0;
      const raw = prompt(
        `Amount used for ${formatPeriod(p, credit.frequency)} (face $${credit.value}):`,
        String(current)
      );
      if (raw === null) return;
      const amt = parseFloat(raw);
      if (!isFinite(amt) || amt < 0) { alert('Enter a number ≥ 0.'); return; }
      const ts = existing != null
        ? usageTs(existing)
        : (p.end && (now < p.start || now >= p.end) ? p.start.toISOString() : new Date().toISOString());
      state.usages[key] = { ts, amount: amt };
      save();
      renderHistoryList(credit);
      render();
    });

    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        const ts = p.end && (now < p.start || now >= p.end) ? p.start : new Date();
        if (credit.isVariable) {
          const amount = promptForAmount(credit);
          if (amount == null) {
            e.target.checked = false;
            return;
          }
          state.usages[key] = { ts: ts.toISOString(), amount };
        } else {
          state.usages[key] = ts.toISOString();
        }
      } else {
        delete state.usages[key];
      }
      save();
      renderHistoryList(credit);
      render();
    });
    list.appendChild(row);
  }
}

function moveCardOrder(cardId, dir) {
  const idx = state.cards.findIndex((c) => c.id === cardId);
  if (idx === -1) return;
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= state.cards.length) return;
  [state.cards[idx], state.cards[swapIdx]] = [state.cards[swapIdx], state.cards[idx]];
  save();
  render();
}

function moveCreditInCard(creditId, dir) {
  const credit = state.credits.find((c) => c.id === creditId);
  if (!credit) return;
  const siblings = state.credits.filter((c) => c.cardId === credit.cardId);
  const localIdx = siblings.indexOf(credit);
  const swapWith = dir === 'up' ? siblings[localIdx - 1] : siblings[localIdx + 1];
  if (!swapWith) return;
  const a = state.credits.indexOf(credit);
  const b = state.credits.indexOf(swapWith);
  [state.credits[a], state.credits[b]] = [state.credits[b], state.credits[a]];
  save();
  render();
}

// Export / import
document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `credit-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.cards || !data.credits) throw new Error('Invalid file');
    if (!confirm('Replace current data with imported file?')) return;
    state.cards = data.cards;
    state.credits = data.credits;
    state.usages = data.usages || {};
    save();
    render();
  } catch (err) {
    alert('Import failed: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

render();
