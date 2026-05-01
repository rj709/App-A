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
  // t in [0, 1]; interpolate hue 135 (green) -> 42 (amber) -> 6 (rose)
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

function render() {
  const dates = CARDS.map(c => parseDate(c.opened)).filter(Boolean);
  const minT = Math.min(...dates.map(d => d.getTime()));
  const maxT = Math.max(...dates.map(d => d.getTime()));
  const span = maxT - minT || 1;

  const tbody = document.querySelector('#cards-table tbody');
  tbody.innerHTML = '';

  for (const c of CARDS) {
    const tr = document.createElement('tr');

    const opened = parseDate(c.opened);
    const t = opened ? (opened.getTime() - minT) / span : 0;
    const pcDate = parseDate(c.pc);
    const pcT = pcDate ? (pcDate.getTime() - minT) / span : null;

    tr.innerHTML = `
      <td class="cell-issuer">${c.issuer}</td>
      <td class="cell-card">${c.card}</td>
      <td class="chip" style="${typeStyle(c.type)}">${c.type}</td>
      <td class="chip" style="${retentionStyle(c.retention)}">${c.retention}</td>
      <td class="chip" style="${feeStyle(c.annualFee)}">${formatFee(c.annualFee)}</td>
      <td class="chip" style="${dateGradient(t)}">${c.opened}</td>
      <td class="${pcDate ? 'chip' : 'cell-neutral'}" style="${pcDate ? dateGradient(pcT) : ''}">${c.pc}</td>
      <td class="${c.from === '-' ? 'cell-neutral' : ''}">${c.from}</td>
    `;
    tbody.appendChild(tr);
  }
}

document.addEventListener('DOMContentLoaded', render);
