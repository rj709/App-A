const STORAGE_KEY = "camera-kit:v1";
const GROUP_KEY = "camera-kit:grouped";

const CATEGORIES = [
  "Camera Body",
  "Camera Lens",
  "Lens Hood",
  "Lens Filter",
  "Lens Filter Accessory",
  "Lighting",
  "Camera Battery",
  "Charging",
  "SD Card",
  "SD Card Accessory",
  "Audio",
  "Audio Accessory",
  "Tripod",
  "Tripod Accessory",
  "Camera Bag",
  "Camera Cube",
  "Camera Strap",
  "Maintenance",
  "Accessory",
  "Other",
];

const CATEGORY_MIGRATIONS = {
  "Camera body": "Camera Body",
  "Lens": "Camera Lens",
  "Flash / lighting": "Lighting",
  "Flash / Lighting": "Lighting",
  "Tripod / support": "Tripod",
  "Tripod / Support": "Tripod",
  "Bag / case": "Camera Bag",
  "Bag / Case": "Camera Bag",
  "Storage / memory": "SD Card",
  "Storage / Memory": "SD Card",
  "Filter": "Lens Filter",
};

function displayName(g) {
  return [g.brand, g.model].filter(Boolean).join(" ") || "Untitled";
}

function sortComparator(field, dir) {
  const flip = dir === "desc" ? -1 : 1;
  switch (field) {
    case "name":
      return (a, b) => flip * displayName(a).localeCompare(displayName(b));
    case "category":
      return (a, b) => flip * (a.category || "").localeCompare(b.category || "");
    case "quantity":
      return (a, b) => flip * ((a.quantity || 1) - (b.quantity || 1));
    case "price":
      return (a, b) => flip * ((Number(a.price) || 0) - (Number(b.price) || 0));
    case "createdAt":
    default:
      return (a, b) => flip * (a.createdAt || "").localeCompare(b.createdAt || "");
  }
}

const DEFAULT_DIR = {
  createdAt: "desc",
  price: "desc",
  quantity: "desc",
  name: "asc",
  category: "asc",
};

const state = {
  gear: [],
  search: "",
  category: "",
  sort: { field: "createdAt", dir: "desc" },
  grouped: localStorage.getItem(GROUP_KEY) === "1",
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalizeItem(g) {
  let brand = g.brand || "";
  let model = g.model || "";
  if (g.name && !brand && !model) brand = g.name;
  return {
    id: g.id || uid(),
    createdAt: g.createdAt || new Date().toISOString(),
    category: migrateCategory(g.category) || "Other",
    brand,
    model,
    serial: g.serial || "",
    price: g.price == null || g.price === "" ? null : Number(g.price),
    quantity: Number(g.quantity) > 0 ? Math.floor(Number(g.quantity)) : 1,
    replacementValue:
      g.replacementValue == null || g.replacementValue === ""
        ? null
        : Number(g.replacementValue),
    insured: !!g.insured,
    purchaseDate: g.purchaseDate || "",
    notes: g.notes || "",
  };
}

function migrateCategory(c) {
  if (!c) return c;
  return CATEGORY_MIGRATIONS[c] || c;
}

function loadGear() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem);
  } catch {
    return [];
  }
}

function saveGear() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.gear));
}

function formatPrice(n) {
  if (n == null || isNaN(n)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function formatPriceTotal(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n || 0);
}

function totalValue() {
  return state.gear.reduce(
    (sum, g) => sum + (Number(g.price) || 0) * (g.quantity || 1),
    0
  );
}

function populateSelects() {
  const filter = document.getElementById("filter-category");
  const form = document.getElementById("f-category");
  for (const cat of CATEGORIES) {
    const o1 = document.createElement("option");
    o1.value = cat;
    o1.textContent = cat;
    filter.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = cat;
    o2.textContent = cat;
    form.appendChild(o2);
  }
}

function filteredSortedGear() {
  const q = state.search.trim().toLowerCase();
  const filtered = state.gear.filter((g) => {
    if (state.category && g.category !== state.category) return false;
    if (!q) return true;
    return [g.brand, g.model, g.serial, g.notes]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q));
  });
  return [...filtered].sort(sortComparator(state.sort.field, state.sort.dir));
}

function render() {
  const table = document.querySelector(".gear-table");
  const list = document.getElementById("gear-list");
  const empty = document.getElementById("empty-state");
  const items = filteredSortedGear();

  list.innerHTML = "";

  document.getElementById("stat-count").textContent = state.gear.length;
  document.getElementById("stat-value").textContent = formatPriceTotal(totalValue());

  table.classList.toggle("is-grouped", state.grouped);
  updateSortIndicators();

  if (state.gear.length === 0) {
    empty.hidden = false;
    empty.querySelector("p").textContent = "No Gear Yet.";
    empty.querySelector("button").hidden = false;
    return;
  }

  if (items.length === 0) {
    empty.hidden = false;
    empty.querySelector("p").textContent = "No Items Match Your Filters.";
    empty.querySelector("button").hidden = true;
    return;
  }

  empty.hidden = true;

  if (state.grouped) {
    renderGrouped(list, items);
  } else {
    for (const g of items) list.appendChild(renderRow(g));
  }
}

function renderGrouped(list, items) {
  const byCat = new Map();
  for (const g of items) {
    const c = g.category || "Other";
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(g);
  }
  const ordered = CATEGORIES.filter((c) => byCat.has(c));
  for (const c of byCat.keys()) if (!ordered.includes(c)) ordered.push(c);

  for (const cat of ordered) {
    const group = byCat.get(cat);
    const subtotal = group.reduce(
      (s, g) => s + (Number(g.price) || 0) * (g.quantity || 1),
      0
    );

    const heading = document.createElement("div");
    heading.className = "gear-group-heading";

    const title = document.createElement("span");
    title.className = "gear-group-title";
    title.textContent = cat;
    heading.appendChild(title);

    const count = document.createElement("span");
    count.className = "gear-group-count";
    count.textContent = String(group.length);
    heading.appendChild(count);

    const value = document.createElement("span");
    value.className = "gear-group-value";
    value.textContent = formatPriceTotal(subtotal);
    heading.appendChild(value);

    list.appendChild(heading);
    for (const g of group) list.appendChild(renderRow(g));
  }
}

function renderRow(g) {
  const row = document.createElement("div");
  row.className = "gear-row";
  row.dataset.id = g.id;
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `Edit ${displayName(g)}`);

  const item = document.createElement("span");
  item.className = "gear-cell gear-col-item";
  item.textContent = displayName(g);
  row.appendChild(item);

  const price = document.createElement("span");
  price.className = "gear-cell gear-col-price";
  if (g.price != null) {
    price.textContent = formatPrice(g.price);
    if (g.quantity > 1) {
      const ea = document.createElement("span");
      ea.className = "ea";
      ea.textContent = " ea";
      price.appendChild(ea);
    }
  } else {
    price.textContent = "—";
  }
  row.appendChild(price);

  const metaGroup = document.createElement("div");
  metaGroup.className = "gear-meta-group";

  const cat = document.createElement("span");
  cat.className = "gear-cell gear-col-category";
  if (g.category) {
    const pill = document.createElement("span");
    pill.className = "gear-category";
    pill.textContent = g.category;
    cat.appendChild(pill);
  }
  metaGroup.appendChild(cat);

  const qty = document.createElement("span");
  qty.className = "gear-cell gear-col-qty";
  qty.textContent = g.quantity > 1 ? String(g.quantity) : "";
  metaGroup.appendChild(qty);

  const ins = document.createElement("span");
  ins.className = "gear-cell gear-col-insured";
  if (g.insured) {
    const mark = document.createElement("span");
    mark.className = "insured-mark";
    mark.title = "Insured";
    mark.textContent = "Insured";
    ins.appendChild(mark);
  }
  metaGroup.appendChild(ins);

  row.appendChild(metaGroup);

  row.addEventListener("click", () => openModal(g.id));
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal(g.id);
    }
  });

  return row;
}

function updateSortIndicators() {
  for (const th of document.querySelectorAll(".gear-th[data-sort]")) {
    const field = th.dataset.sort;
    const arrow = th.querySelector(".sort-arrow");
    if (field === state.sort.field) {
      th.classList.add("is-sorted");
      th.setAttribute("aria-sort", state.sort.dir === "asc" ? "ascending" : "descending");
      arrow.textContent = state.sort.dir === "asc" ? "↑" : "↓";
    } else {
      th.classList.remove("is-sorted");
      th.removeAttribute("aria-sort");
      arrow.textContent = "";
    }
  }
}

function setSort(field) {
  if (state.sort.field === field) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort.field = field;
    state.sort.dir = DEFAULT_DIR[field] || "asc";
  }
  render();
}

function openModal(id) {
  const modal = document.getElementById("gear-modal");
  const form = document.getElementById("gear-form");
  const title = document.getElementById("modal-title");
  const deleteBtn = document.getElementById("delete-btn");

  form.reset();

  if (id) {
    const item = state.gear.find((g) => g.id === id);
    if (!item) return;
    title.textContent = "Edit Gear";
    deleteBtn.hidden = false;
    form.elements.id.value = item.id;
    form.elements.category.value = item.category || CATEGORIES[0];
    form.elements.brand.value = item.brand || "";
    form.elements.model.value = item.model || "";
    form.elements.serial.value = item.serial || "";
    form.elements.price.value = item.price ?? "";
    form.elements.quantity.value = item.quantity || 1;
    form.elements.replacementValue.value = item.replacementValue ?? "";
    form.elements.insured.checked = !!item.insured;
    form.elements.purchaseDate.value = item.purchaseDate || "";
    form.elements.notes.value = item.notes || "";
  } else {
    title.textContent = "Add Gear";
    deleteBtn.hidden = true;
    form.elements.id.value = "";
    form.elements.category.value = CATEGORIES[0];
    form.elements.quantity.value = 1;
    form.elements.insured.checked = false;
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => form.elements.brand.focus());
}

function closeModal() {
  const modal = document.getElementById("gear-modal");
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}

function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  const brand = data.brand.trim();
  const model = data.model.trim();
  if (!brand && !model) {
    form.elements.brand.focus();
    toast("Brand Or Model Is Required");
    return;
  }

  const price = data.price === "" ? null : Number(data.price);
  if (price != null && (isNaN(price) || price < 0)) {
    form.elements.price.focus();
    toast("Price Can't Be Negative");
    return;
  }

  const repl = data.replacementValue === "" ? null : Number(data.replacementValue);
  if (repl != null && (isNaN(repl) || repl < 0)) {
    form.elements.replacementValue.focus();
    toast("Replacement Value Can't Be Negative");
    return;
  }

  const quantity = Math.max(1, Math.floor(Number(data.quantity)) || 1);

  const payload = {
    category: data.category || "Other",
    brand,
    model,
    serial: data.serial.trim(),
    price,
    quantity,
    replacementValue: repl,
    insured: form.elements.insured.checked,
    purchaseDate: data.purchaseDate || "",
    notes: data.notes.trim(),
  };

  if (data.id) {
    const idx = state.gear.findIndex((g) => g.id === data.id);
    if (idx >= 0) state.gear[idx] = { ...state.gear[idx], ...payload };
    toast("Updated");
  } else {
    state.gear.unshift({ id: uid(), createdAt: new Date().toISOString(), ...payload });
    toast("Added");
  }

  saveGear();
  closeModal();
  render();
}

function handleDelete() {
  const form = document.getElementById("gear-form");
  const id = form.elements.id.value;
  if (!id) return;
  const item = state.gear.find((g) => g.id === id);
  if (!item) return;
  if (!confirm(`Delete "${displayName(item)}"?`)) return;
  state.gear = state.gear.filter((g) => g.id !== id);
  saveGear();
  closeModal();
  render();
  toast("Deleted");
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state.gear, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `camera-kit-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Exported");
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error("Not an array");
      const incoming = parsed.map(normalizeItem);
      const merged = [...incoming, ...state.gear];
      const seen = new Set();
      state.gear = merged.filter((g) => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
      saveGear();
      render();
      toast(`Imported ${parsed.length} ${parsed.length === 1 ? "Item" : "Items"}`);
    } catch (err) {
      toast("Import Failed: Invalid JSON");
    }
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseMoney(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

const CSV_CATEGORY_MAP = {
  "Lens": "Camera Lens",
  "Lenses": "Camera Lens",
  "Flash": "Lighting",
  "Flash / Lighting": "Lighting",
  "Tripod / Support": "Tripod",
  "Support": "Tripod",
  "Bag": "Camera Bag",
  "Bag / Case": "Camera Bag",
  "Case": "Camera Bag",
  "Storage": "SD Card",
  "Memory": "SD Card",
  "Storage / Memory": "SD Card",
  "Filter": "Lens Filter",
  "Filters": "Lens Filter",
  "Battery": "Camera Battery",
  "Strap": "Camera Strap",
  "Cube": "Camera Cube",
};

function normalizeCsvCategory(c) {
  const trimmed = (c || "").trim();
  if (!trimmed) return "Other";
  if (CATEGORIES.includes(trimmed)) return trimmed;
  if (CSV_CATEGORY_MAP[trimmed]) return CSV_CATEGORY_MAP[trimmed];
  return "Other";
}

function csvRowToGear(row) {
  const get = (key) => {
    const k = Object.keys(row).find((rk) => rk.trim().toLowerCase() === key);
    return k ? (row[k] || "").trim() : "";
  };
  const qty = Math.max(1, Math.floor(Number(get("number") || get("quantity"))) || 1);
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    brand: get("brand"),
    model: get("item") || get("model") || get("name"),
    category: normalizeCsvCategory(get("category")),
    serial: get("serial") || get("serial #"),
    price: parseMoney(get("price")),
    quantity: qty,
    replacementValue: parseMoney(get("replacement value") || get("replacementvalue")),
    insured: false,
    purchaseDate: get("purchase date") || get("purchasedate"),
    notes: get("notes"),
  };
}

function importCSV(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      if (rows.length < 2) throw new Error("Empty CSV");
      const headers = rows[0];
      const incoming = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (r.every((v) => v === "")) continue;
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
          obj[headers[j]] = r[j] || "";
        }
        const item = csvRowToGear(obj);
        if (item.brand || item.model) incoming.push(item);
      }
      state.gear = [...incoming, ...state.gear];
      saveGear();
      render();
      toast(`Imported ${incoming.length} ${incoming.length === 1 ? "Item" : "Items"}`);
    } catch (err) {
      console.error(err);
      toast("Import Failed: Invalid CSV");
    }
  };
  reader.readAsText(file);
}

function importFile(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".csv")) importCSV(file);
  else importJSON(file);
}

const SEED_VERSION = 3;
const SEED_VERSION_KEY = "camera-kit:seed-version";

async function loadSeedIfNeeded() {
  const loaded = Number(localStorage.getItem(SEED_VERSION_KEY) || 0);
  if (loaded >= SEED_VERSION) return;
  try {
    const res = await fetch("gear-seed.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const seed = await res.json();
    if (!Array.isArray(seed) || seed.length === 0) throw new Error("Seed empty or invalid");
    state.gear = seed.map(normalizeItem);
    saveGear();
    localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
    render();
  } catch (err) {
    console.warn("Seed load failed; will retry next visit:", err.message);
  }
}

function syncGroupToggle(btn) {
  btn.classList.toggle("is-active", state.grouped);
  btn.setAttribute("aria-pressed", String(state.grouped));
}

function init() {
  state.gear = loadGear();
  populateSelects();
  render();
  loadSeedIfNeeded();

  document.getElementById("add-gear-btn").addEventListener("click", () => openModal());
  document.getElementById("empty-add-btn").addEventListener("click", () => openModal());

  document.getElementById("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });

  document.getElementById("filter-category").addEventListener("change", (e) => {
    state.category = e.target.value;
    render();
  });

  const groupToggle = document.getElementById("group-toggle");
  syncGroupToggle(groupToggle);
  groupToggle.addEventListener("click", () => {
    state.grouped = !state.grouped;
    localStorage.setItem(GROUP_KEY, state.grouped ? "1" : "0");
    syncGroupToggle(groupToggle);
    render();
  });

  for (const th of document.querySelectorAll(".gear-th[data-sort]")) {
    th.addEventListener("click", () => setSort(th.dataset.sort));
  }

  document.getElementById("gear-form").addEventListener("submit", handleSubmit);
  document.getElementById("delete-btn").addEventListener("click", handleDelete);

  for (const el of document.querySelectorAll("[data-close]")) {
    el.addEventListener("click", closeModal);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("gear-modal").hidden) {
      closeModal();
    }
  });

  document.getElementById("export-btn").addEventListener("click", exportJSON);
  const importInput = document.getElementById("import-file");
  document.getElementById("import-btn").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importFile(file);
    e.target.value = "";
  });
}

document.addEventListener("DOMContentLoaded", init);
