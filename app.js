const STORAGE_KEY = "camera-kit:v1";

const CATEGORIES = [
  "Camera Body",
  "Lens",
  "Flash / Lighting",
  "Tripod / Support",
  "Bag / Case",
  "Storage / Memory",
  "Filter",
  "Audio",
  "Accessory",
  "Other",
];

function displayName(g) {
  return [g.brand, g.model].filter(Boolean).join(" ") || "Untitled";
}

const SORTS = {
  newest: { label: "Newest First", fn: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") },
  oldest: { label: "Oldest First", fn: (a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") },
  name: { label: "Alphabetical (A→Z)", fn: (a, b) => displayName(a).localeCompare(displayName(b)) },
  priceHigh: { label: "Price (High→Low)", fn: (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0) },
  priceLow: { label: "Price (Low→High)", fn: (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0) },
  category: { label: "Category", fn: (a, b) => (a.category || "").localeCompare(b.category || "") },
};

const state = {
  gear: [],
  search: "",
  category: "",
  sort: "newest",
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
    condition: migrateCondition(g.condition) || "Good",
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

const CATEGORY_MIGRATIONS = {
  "Camera body": "Camera Body",
  "Flash / lighting": "Flash / Lighting",
  "Tripod / support": "Tripod / Support",
  "Bag / case": "Bag / Case",
  "Storage / memory": "Storage / Memory",
};

function migrateCategory(c) {
  if (!c) return c;
  return CATEGORY_MIGRATIONS[c] || c;
}

function migrateCondition(c) {
  if (c === "Like new") return "Like New";
  return c;
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

function insuredValue() {
  return state.gear.reduce((sum, g) => {
    if (!g.insured) return sum;
    const each = g.replacementValue ?? g.price ?? 0;
    return sum + (Number(each) || 0) * (g.quantity || 1);
  }, 0);
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

  const sortSel = document.getElementById("sort");
  for (const [key, { label }] of Object.entries(SORTS)) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = label;
    sortSel.appendChild(o);
  }
  sortSel.value = state.sort;
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
  const sortFn = (SORTS[state.sort] || SORTS.newest).fn;
  return [...filtered].sort(sortFn);
}

function render() {
  const list = document.getElementById("gear-list");
  const empty = document.getElementById("empty-state");
  const items = filteredSortedGear();

  list.innerHTML = "";

  document.getElementById("stat-count").textContent = state.gear.length;
  document.getElementById("stat-value").textContent = formatPriceTotal(totalValue());
  document.getElementById("stat-insured").textContent = formatPriceTotal(insuredValue());

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

  for (const g of items) {
    list.appendChild(renderCard(g));
  }
}

function renderCard(g) {
  const card = document.createElement("article");
  card.className = "gear-card";
  card.dataset.id = g.id;
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const head = document.createElement("div");
  head.className = "gear-card-head";

  const nameWrap = document.createElement("div");
  nameWrap.className = "gear-name-wrap";

  const name = document.createElement("h3");
  name.className = "gear-name";
  name.textContent = displayName(g);
  nameWrap.appendChild(name);

  if (g.quantity > 1) {
    const qty = document.createElement("span");
    qty.className = "gear-qty";
    qty.textContent = `× ${g.quantity}`;
    nameWrap.appendChild(qty);
  }

  head.appendChild(nameWrap);

  const badges = document.createElement("div");
  badges.className = "gear-badges";
  if (g.category) {
    const cat = document.createElement("span");
    cat.className = "gear-category";
    cat.textContent = g.category;
    badges.appendChild(cat);
  }
  if (g.insured) {
    const ins = document.createElement("span");
    ins.className = "gear-insured";
    ins.textContent = "Insured";
    badges.appendChild(ins);
  }
  head.appendChild(badges);

  card.appendChild(head);

  if (g.serial) {
    const meta = document.createElement("div");
    meta.className = "gear-meta";
    meta.textContent = `S/N ${g.serial}`;
    card.appendChild(meta);
  }

  const footer = document.createElement("div");
  footer.className = "gear-footer";

  const price = document.createElement("span");
  price.className = "gear-price";
  if (g.price != null) {
    price.textContent = g.quantity > 1
      ? `${formatPrice(g.price)} ea`
      : formatPrice(g.price);
  } else {
    price.textContent = "—";
  }
  footer.appendChild(price);

  if (g.condition) {
    const cond = document.createElement("span");
    cond.className = "gear-condition";
    cond.textContent = g.condition;
    footer.appendChild(cond);
  }

  card.appendChild(footer);

  card.addEventListener("click", () => openModal(g.id));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal(g.id);
    }
  });

  return card;
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
    form.elements.condition.value = item.condition || "Good";
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
    form.elements.condition.value = "Good";
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
    condition: data.condition || "Good",
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

function init() {
  state.gear = loadGear();
  populateSelects();
  render();

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

  document.getElementById("sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

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
    if (file) importJSON(file);
    e.target.value = "";
  });
}

document.addEventListener("DOMContentLoaded", init);
