// Parse MM/DD/YYYY -> Date (or null for "-")
function parseDate(s) {
  if (!s || s === '-') return null;
  const [m, d, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function formatFee(n) {
  return '$' + n.toLocaleString();
}

// Cohesive color application via CSS custom properties.
// Each helper returns inline style strings so colors stay derived from data.

function typeStyle(type) {
  if (type === 'Personal') return styleVars('--green-bg', '--green-fg');
  if (type === 'Business') return styleVars('--blue-bg', '--blue-fg');
  return '';
}

function retentionStyle(r) {
  if (r === 'Yes')   return styleVars('--green-bg', '--green-fg');
  if (r === 'No')    return styleVars('--rose-bg',  '--rose-fg');
  if (r === 'Maybe') return styleVars('--amber-bg', '--amber-fg');
  return '';
}

// Annual fee: 3 cohesive buckets.
//   $0          -> green (free)
//   $1–$300     -> amber (modest)
//   $300+       -> rose  (premium)
function feeStyle(fee) {
  if (fee === 0)       return styleVars('--green-bg', '--green-fg');
  if (fee <= 300)      return styleVars('--amber-bg', '--amber-fg');
  return styleVars('--rose-bg', '--rose-fg');
}

// Opened date: smooth HSL gradient from green (oldest) -> amber -> rose (newest).
// All anchors share saturation/lightness for cohesion with the rest of the palette.
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
      const u = (t - a.t) / (b.t - a.t);
      h = a.h + (b.h - a.h) * u;
      break;
    }
  }
  const bg = `hsl(${h.toFixed(1)}, 50%, 85%)`;
  const fg = `hsl(${h.toFixed(1)}, 45%, 28%)`;
  return `background:${bg};color:${fg};`;
}

function styleVars(bgVar, fgVar) {
  return `background:var(${bgVar});color:var(${fgVar});`;
}

// Sort comparator per column. Returns a function(a, b) -> number.
// "-" / empty values always sort to the end regardless of direction.
function comparator(key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  const isEmpty = v => v === '-' || v === '' || v == null;

  const numericKeys = new Set(['annualFee']);
  const dateKeys = new Set(['opened']);

  return (a, b) => {
    const av = a[key], bv = b[key];
    const ae = isEmpty(av), be = isEmpty(bv);
    if (ae && be) return 0;
    if (ae) return 1;
    if (be) return -1;

    let cmp;
    if (numericKeys.has(key)) {
      cmp = av - bv;
    } else if (dateKeys.has(key)) {
      cmp = parseDate(av).getTime() - parseDate(bv).getTime();
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return cmp * sign;
  };
}

let sortState = { key: null, dir: 'asc' };

function render() {
  const dates = CARDS.map(c => parseDate(c.opened)).filter(Boolean);
  const minT = Math.min(...dates.map(d => d.getTime()));
  const maxT = Math.max(...dates.map(d => d.getTime()));
  const span = maxT - minT || 1;

  const rows = sortState.key
    ? [...CARDS].sort(comparator(sortState.key, sortState.dir))
    : CARDS;

  const tbody = document.querySelector('#cards-table tbody');
  tbody.innerHTML = '';

  for (const c of rows) {
    const tr = document.createElement('tr');

    const opened = parseDate(c.opened);
    const t = opened ? (opened.getTime() - minT) / span : 0;

    tr.innerHTML = `
      <td class="cell-issuer">${c.issuer}</td>
      <td class="cell-card">${c.card}</td>
      <td class="chip" style="${typeStyle(c.type)}">${c.type}</td>
      <td class="chip" style="${retentionStyle(c.retention)}">${c.retention}</td>
      <td class="chip" style="${feeStyle(c.annualFee)}">${formatFee(c.annualFee)}</td>
      <td class="chip" style="${dateGradient(t)}">${c.opened}</td>
    `;
    tbody.appendChild(tr);
  }

  // Update header sort indicators
  document.querySelectorAll('#cards-table thead th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.key === sortState.key) {
      th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

function initSorting() {
  document.querySelectorAll('#cards-table thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!key) return;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState = { key, dir: 'asc' };
      }
      render();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSorting();
  render();
});
