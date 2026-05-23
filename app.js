const STORAGE_KEY = "camera-kit:v1";

const CATEGORIES = [
  "Camera body",
  "Lens",
  "Flash / lighting",
  "Tripod / support",
  "Bag / case",
  "Storage / memory",
  "Filter",
  "Audio",
  "Accessory",
  "Other",
];

const state = {
  gear: [],
  search: "",
  category: "",
};

function loadGear() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGear() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.gear));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatPrice(n) {
  if (n == null || n === "" || isNaN(n)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPriceTotal(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function populateCategorySelects() {
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

function filteredGear() {
  const q = state.search.trim().toLowerCase();
  return state.gear.filter((g) => {
    if (state.category && g.category !== state.category) return false;
    if (!q) return true;
    return [g.name, g.brand, g.model, g.notes, g.serial]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q));
  });
}

function render() {
  const list = document.getElementById("gear-list");
  const empty = document.getElementById("empty-state");
  const items = filteredGear();

  list.innerHTML = "";

  const totalValue = state.gear.reduce(
    (sum, g) => sum + (Number(g.price) || 0),
    0
  );
  document.getElementById("stat-count").textContent = state.gear.length;
  document.getElementById("stat-value").textContent = formatPriceTotal(totalValue);

  if (state.gear.length === 0) {
    empty.hidden = false;
    empty.querySelector("p").textContent = "No gear yet.";
    return;
  }

  if (items.length === 0) {
    empty.hidden = false;
    empty.querySelector("p").textContent = "No items match your filters.";
    return;
  }

  empty.hidden = true;

  for (const g of items) {
    const card = document.createElement("article");
    card.className = "gear-card";
    card.dataset.id = g.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const head = document.createElement("div");
    head.className = "gear-card-head";

    const name = document.createElement("h3");
    name.className = "gear-name";
    name.textContent = g.name;
    head.appendChild(name);

    if (g.category) {
      const cat = document.createElement("span");
      cat.className = "gear-category";
      cat.textContent = g.category;
      head.appendChild(cat);
    }

    card.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "gear-meta";
    const metaParts = [g.brand, g.model].filter(Boolean).join(" ");
    meta.textContent = metaParts || "—";
    card.appendChild(meta);

    const footer = document.createElement("div");
    footer.className = "gear-footer";

    const price = document.createElement("span");
    price.className = "gear-price";
    price.textContent = formatPrice(g.price) || "—";
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

    list.appendChild(card);
  }
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
    title.textContent = "Edit gear";
    deleteBtn.hidden = false;
    form.elements.id.value = item.id;
    form.elements.name.value = item.name || "";
    form.elements.category.value = item.category || CATEGORIES[0];
    form.elements.condition.value = item.condition || "Good";
    form.elements.brand.value = item.brand || "";
    form.elements.model.value = item.model || "";
    form.elements.serial.value = item.serial || "";
    form.elements.price.value = item.price ?? "";
    form.elements.purchaseDate.value = item.purchaseDate || "";
    form.elements.notes.value = item.notes || "";
  } else {
    title.textContent = "Add gear";
    deleteBtn.hidden = true;
    form.elements.id.value = "";
    form.elements.category.value = CATEGORIES[0];
    form.elements.condition.value = "Good";
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => form.elements.name.focus());
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

  if (!data.name.trim()) {
    form.elements.name.focus();
    return;
  }

  const payload = {
    name: data.name.trim(),
    category: data.category || "Other",
    condition: data.condition || "Good",
    brand: data.brand.trim(),
    model: data.model.trim(),
    serial: data.serial.trim(),
    price: data.price === "" ? null : Number(data.price),
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
  if (!confirm(`Delete "${item.name}"?`)) return;
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
      const merged = [...parsed.map(normalizeImported), ...state.gear];
      const seen = new Set();
      state.gear = merged.filter((g) => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
      saveGear();
      render();
      toast(`Imported ${parsed.length} item${parsed.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast("Import failed: invalid JSON");
    }
  };
  reader.readAsText(file);
}

function normalizeImported(g) {
  return {
    id: g.id || uid(),
    createdAt: g.createdAt || new Date().toISOString(),
    name: g.name || "Untitled",
    category: g.category || "Other",
    condition: g.condition || "Good",
    brand: g.brand || "",
    model: g.model || "",
    serial: g.serial || "",
    price: g.price ?? null,
    purchaseDate: g.purchaseDate || "",
    notes: g.notes || "",
  };
}

function init() {
  state.gear = loadGear();
  populateCategorySelects();
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
