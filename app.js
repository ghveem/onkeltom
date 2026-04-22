const LICENSE_PRESETS = {
  "CC-BY-4.0": "Creative Commons Attribution 4.0 International",
  "CC-BY-SA-4.0": "Creative Commons Attribution-ShareAlike 4.0 International",
  "CC-BY-NC-4.0": "Creative Commons Attribution-NonCommercial 4.0 International",
  "CC-BY-NC-SA-4.0": "Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International",
  "CC-BY-NC-ND-4.0": "Creative Commons Attribution-NonCommercial-NoDerivs 4.0 International",
  "COPYRIGHTED": "Copyrighted"
};

const MAX_CONCURRENT = 3;
const DELAY_MS = 300;

const els = {
  environmentSelect: document.getElementById("environmentSelect"),
  loginButton: document.getElementById("loginButton"),
  logoutButton: document.getElementById("logoutButton"),
  authStatus: document.getElementById("authStatus"),
  fileInput: document.getElementById("fileInput"),
  dropzone: document.getElementById("dropzone"),
  fileSummary: document.getElementById("fileSummary"),
  fileGrid: document.getElementById("fileGrid"),
  keywordChips: document.getElementById("keywordChips"),
  metadataForm: document.getElementById("metadataForm"),
  applyBatchButton: document.getElementById("applyBatchButton"),
  clearFilesButton: document.getElementById("clearFilesButton"),
  uploadButton: document.getElementById("uploadButton"),
  retryFailedButton: document.getElementById("retryFailedButton"),
  dryRunButton: document.getElementById("dryRunButton"),
  stopOnError: document.getElementById("stopOnError"),
  progressText: document.getElementById("progressText"),
  progressMeta: document.getElementById("progressMeta"),
  progressBar: document.getElementById("progressBar"),
  previewBox: document.getElementById("previewBox"),
  results: document.getElementById("results")
};

const cfg = (() => {
  const base = window.NDLA_CONFIG || {};
  const runtime = window.NDLA_RUNTIME_CONFIG || {};
  const merged = { ...base, ...runtime };
  if (base.environments || runtime.environments) {
    merged.environments = { ...(base.environments || {}), ...(runtime.environments || {}) };
  }
  return merged;
})();
let auth0Client = null;
let accessToken = null;
let currentEnvironmentKey = null;
let fileItems = [];
let dragIndex = null;
let progress = {
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: []
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeStorageGet(key, fallback = "") {
  try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}

function setAuthStatus(text, kind = "neutral") {
  els.authStatus.textContent = text;
  els.authStatus.className = `status-pill ${kind}`;
}

function appendResult(title, body, kind = "neutral") {
  const item = document.createElement("div");
  item.className = `result-item ${kind}`;
  item.innerHTML = `<strong>${escapeHtml(title)}</strong><div>${escapeHtml(body)}</div>`;
  els.results.prepend(item);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function environments() {
  return cfg.environments || {};
}

function getCurrentEnv() {
  return environments()[currentEnvironmentKey] || null;
}

function ensureEnvironmentConfig() {
  const env = getCurrentEnv();
  if (!env) {
    setAuthStatus("Mangler miljøkonfigurasjon", "error");
    return false;
  }
  const required = ["auth0Domain", "auth0ClientId", "apiBaseUrl", "imageUploadPath", "scope", "googleConnection"];
  const missing = required.filter((key) => !env[key] || String(env[key]).includes("SETT_INN"));
  if (missing.length) {
    setAuthStatus(`Mangler config.js for ${currentEnvironmentKey}: ${missing.join(", ")}`, "error");
    els.loginButton.disabled = true;
    return false;
  }
  els.loginButton.disabled = false;
  return true;
}

function populateEnvironmentSelect() {
  const envs = environments();
  els.environmentSelect.innerHTML = "";
  Object.entries(envs).forEach(([key, value]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = value.label || key;
    els.environmentSelect.appendChild(option);
  });
  currentEnvironmentKey = safeStorageGet("ndla.environment", cfg.defaultEnvironment || Object.keys(envs)[0] || "");
  if (!envs[currentEnvironmentKey]) {
    currentEnvironmentKey = Object.keys(envs)[0] || "";
  }
  els.environmentSelect.value = currentEnvironmentKey;
}

function sanitizeTitleFromFilename(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTags(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .split(/[_\- ]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2)
    .slice(0, 12);
}

function parseContributors(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [type, ...nameParts] = line.split("|");
      return { type: (type || "originator").trim(), name: nameParts.join("|").trim() };
    })
    .filter((entry) => entry.name);
}

function syncLicenseDescription() {
  const licenseField = els.metadataForm.elements["license"];
  const descriptionField = els.metadataForm.elements["licenseDescription"];
  const suggested = LICENSE_PRESETS[licenseField.value] || "";
  if (!descriptionField.value.trim() || descriptionField.dataset.autofilled === "true") {
    descriptionField.value = suggested;
    descriptionField.dataset.autofilled = "true";
  }
}

function readSharedForm() {
  const data = new FormData(els.metadataForm);
  return {
    language: String(data.get("language") || "nb"),
    seriesName: String(data.get("seriesName") || "").trim(),
    caption: String(data.get("caption") || "").trim(),
    alttext: String(data.get("alttext") || "").trim(),
    tags: String(data.get("tags") || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    modelReleased: String(data.get("modelReleased") || "not-set"),
    license: String(data.get("license") || "").trim(),
    licenseDescription: String(data.get("licenseDescription") || "").trim(),
    origin: String(data.get("origin") || "").trim(),
    creators: parseContributors(data.get("creators")),
    processors: parseContributors(data.get("processors")),
    rightsholders: parseContributors(data.get("rightsholders")),
    processed: Boolean(data.get("processed"))
  };
}

function sharedKeywordsPreview() {
  const shared = readSharedForm();
  const keywords = [...shared.tags];
  if (shared.seriesName) keywords.push(shared.seriesName);
  return [...new Set(keywords)];
}

function renderKeywordChips() {
  const keywords = sharedKeywordsPreview();
  els.keywordChips.innerHTML = "";
  if (!keywords.length) {
    const chip = document.createElement("div");
    chip.className = "keyword-chip muted";
    chip.textContent = "Ingen felles nøkkelord ennå";
    els.keywordChips.appendChild(chip);
    return;
  }
  keywords.forEach((keyword) => {
    const chip = document.createElement("div");
    chip.className = "keyword-chip";
    chip.textContent = keyword;
    els.keywordChips.appendChild(chip);
  });
}

function createFileItem(file) {
  const id = crypto.randomUUID();
  const objectUrl = URL.createObjectURL(file);
  return {
    id,
    file,
    objectUrl,
    title: sanitizeTitleFromFilename(file.name),
    alttext: "",
    caption: "",
    tags: extractTags(file.name),
    status: "pending",
    lastError: ""
  };
}

function mergeUnique(items) {
  return [...new Set(items.filter(Boolean).map((item) => item.trim()).filter(Boolean))];
}

function addFiles(fileList) {
  const incoming = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  incoming.forEach((file) => fileItems.push(createFileItem(file)));
  applyBatchValuesToAll();
  renderFiles();
  updateUploadButtonState();
}

function clearFiles() {
  fileItems.forEach((item) => URL.revokeObjectURL(item.objectUrl));
  fileItems = [];
  progress = { total: 0, completed: 0, succeeded: 0, failed: [] };
  renderFiles();
  renderPreview();
  updateProgress();
  updateUploadButtonState();
}

function removeFile(id) {
  const index = fileItems.findIndex((item) => item.id === id);
  if (index >= 0) {
    URL.revokeObjectURL(fileItems[index].objectUrl);
    fileItems.splice(index, 1);
    renderFiles();
    renderPreview();
    updateUploadButtonState();
  }
}

function moveFile(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= fileItems.length) return;
  const temp = fileItems[index];
  fileItems[index] = fileItems[target];
  fileItems[target] = temp;
  renderFiles();
}

function swapFiles(targetIndex) {
  if (dragIndex === null || targetIndex === dragIndex) return;
  const temp = fileItems[dragIndex];
  fileItems[dragIndex] = fileItems[targetIndex];
  fileItems[targetIndex] = temp;
  dragIndex = null;
  renderFiles();
}

function onPerFileInput(id, field, value) {
  const item = fileItems.find((entry) => entry.id === id);
  if (!item) return;
  item[field] = value;
  renderPreview();
}

function applyBatchValuesToAll() {
  const shared = readSharedForm();
  fileItems.forEach((item) => {
    item.caption = shared.caption;
    item.alttext = shared.alttext;
    item.tags = mergeUnique([...(shared.tags || []), ...(extractTags(item.file.name) || []), shared.seriesName]);
  });
  renderFiles();
  renderPreview();
}

function buildMetadata(item) {
  const shared = readSharedForm();
  const tags = mergeUnique([...(shared.tags || []), ...(item.tags || []), shared.seriesName]);
  const metadata = {
    title: item.title,
    caption: item.caption || shared.caption,
    language: shared.language,
    tags,
    modelReleased: shared.modelReleased,
    copyright: {
      license: {
        license: shared.license,
        description: shared.licenseDescription || LICENSE_PRESETS[shared.license] || ""
      },
      creators: shared.creators,
      processors: shared.processors,
      rightsholders: shared.rightsholders,
      processed: shared.processed
    }
  };

  if (item.alttext || shared.alttext) metadata.alttext = item.alttext || shared.alttext;
  if (shared.origin) metadata.copyright.origin = shared.origin;
  if (!metadata.copyright.license.description) delete metadata.copyright.license.description;

  return metadata;
}

function fileStatusKind(item) {
  return item.status || "pending";
}

function updateFileSummary() {
  const total = fileItems.length;
  const uploaded = fileItems.filter((item) => item.status === "success").length;
  const failed = fileItems.filter((item) => item.status === "error").length;
  const uploading = fileItems.filter((item) => item.status === "uploading").length;

  if (!total) {
    els.fileSummary.textContent = "Ingen filer valgt.";
    return;
  }

  els.fileSummary.innerHTML = `<span class="summary-strong">${total} filer</span> · ${uploaded} opplastet · ${failed} feil · ${uploading} under opplasting`;
}

function fileStatusLabel(item) {
  if (item.status === "success") return "Opplastet";
  if (item.status === "error") return `Feil${item.lastError ? `: ${item.lastError}` : ""}`;
  if (item.status === "uploading") return "Laster opp …";
  return "Klar";
}

function renderFiles() {
  els.fileGrid.innerHTML = "";
  if (!fileItems.length) {
    updateFileSummary();
    els.retryFailedButton.classList.add("hidden");
    return;
  }

  updateFileSummary();
  fileItems.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = `file-card ${fileStatusKind(item)}`;
    card.draggable = true;
    card.dataset.id = item.id;
    card.addEventListener("dragstart", () => {
      dragIndex = index;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      dragIndex = null;
      card.classList.remove("dragging");
    });
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", () => swapFiles(index));

    card.innerHTML = `
      <img class="thumb" src="${item.objectUrl}" alt="${escapeHtml(item.title)}" />
      <div class="file-card-body">
        <div class="file-top-row">
          <div>
            <div class="file-title">${escapeHtml(item.title)}</div>
            <div class="file-meta">${escapeHtml(item.file.name)} · ${(item.file.size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
          <div class="status-badge ${escapeHtml(fileStatusKind(item))}">${escapeHtml(fileStatusLabel(item))}</div>
          <div class="card-actions">
            <button type="button" class="mini-button" data-move="-1">↑</button>
            <button type="button" class="mini-button" data-move="1">↓</button>
            <button type="button" class="mini-button" data-remove="1">Fjern</button>
          </div>
        </div>
        <div class="file-fields">
          <label class="full">
            <span>Tittel fra filnavn</span>
            <input type="text" value="${escapeHtml(item.title)}" disabled />
          </label>
          <label class="full">
            <span>Bildetekst / caption</span>
            <textarea rows="2" data-field="caption">${escapeHtml(item.caption || "")}</textarea>
          </label>
          <label class="full">
            <span>Alt-tekst</span>
            <textarea rows="2" data-field="alttext">${escapeHtml(item.alttext || "")}</textarea>
          </label>
          <label class="full">
            <span>Nøkkelord / tags</span>
            <input type="text" value="${escapeHtml((item.tags || []).join(", "))}" data-field="tags" />
            <small>Filnavn brukes som startpunkt. Serienavn og felles tags legges i tillegg på ved opplasting.</small>
          </label>
        </div>
      </div>
    `;

    const removeButton = card.querySelector("[data-remove]");
    removeButton.addEventListener("click", () => removeFile(item.id));

    card.querySelectorAll("[data-move]").forEach((button) => {
      button.addEventListener("click", () => moveFile(index, Number(button.dataset.move)));
    });

    card.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        const value = input.value;
        onPerFileInput(item.id, field, field === "tags" ? value.split(",").map((tag) => tag.trim()).filter(Boolean) : value);
      });
    });

    els.fileGrid.appendChild(card);
  });

  els.retryFailedButton.classList.toggle("hidden", progress.failed.length === 0);
}

function updateProgress() {
  const percent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  els.progressBar.value = percent;
  els.progressText.textContent = `${progress.completed} / ${progress.total}`;
  updateFileSummary();
  if (!progress.total) {
    els.progressMeta.textContent = "Ikke startet";
    return;
  }
  els.progressMeta.textContent = `${percent}% · ${progress.succeeded} vellykket · ${progress.failed.length} feil`;
}

function renderPreview() {
  const first = fileItems[0];
  if (!first) {
    els.previewBox.textContent = "Ingen forhåndsvisning enda.";
    return;
  }
  const preview = buildMetadata(first);
  els.previewBox.textContent = JSON.stringify(preview, null, 2);
}

function updateUploadButtonState() {
  els.uploadButton.disabled = !accessToken || !fileItems.length;
}

async function createAuthClient() {
  const env = getCurrentEnv();
  if (!env || !ensureEnvironmentConfig()) return null;
  if (auth0Client) return auth0Client;
  auth0Client = await window.auth0.createAuth0Client({
    domain: env.auth0Domain,
    clientId: env.auth0ClientId,
    authorizationParams: {
      redirect_uri: `${window.location.origin}${window.location.pathname}`,
      audience: env.auth0Audience || undefined,
      scope: env.scope
    },
    cacheLocation: "localstorage",
    useRefreshTokens: true
  });
  return auth0Client;
}

async function initAuth() {
  auth0Client = null;
  accessToken = null;
  const client = await createAuthClient();
  if (!client) return;

  const qs = new URLSearchParams(window.location.search);
  if (qs.has("code") && qs.has("state")) {
    try {
      await client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      appendResult("Innlogging feilet", error.message, "error");
    }
  }

  try {
    const isAuthenticated = await client.isAuthenticated();
    if (!isAuthenticated) {
      setAuthStatus(`Ikke logget inn (${getCurrentEnv()?.label || currentEnvironmentKey})`, "neutral");
      els.logoutButton.classList.add("hidden");
      updateUploadButtonState();
      return;
    }

    const user = await client.getUser();
    accessToken = await client.getTokenSilently();
    setAuthStatus(`Logget inn som ${user?.name || user?.email || "bruker"} · ${getCurrentEnv()?.label || currentEnvironmentKey}`, "success");
    els.logoutButton.classList.remove("hidden");
    updateUploadButtonState();
  } catch (error) {
    setAuthStatus(`Innlogging utilgjengelig: ${error.message}`, "error");
  }
}

async function login() {
  const client = await createAuthClient();
  const env = getCurrentEnv();
  if (!client || !env) return;
  await client.loginWithRedirect({
    authorizationParams: {
      connection: env.googleConnection,
      audience: env.auth0Audience || undefined,
      scope: env.scope,
      redirect_uri: `${window.location.origin}${window.location.pathname}`
    }
  });
}

async function logout() {
  const client = await createAuthClient();
  if (!client) return;
  accessToken = null;
  client.logout({ logoutParams: { returnTo: `${window.location.origin}${window.location.pathname}` } });
}

async function uploadOne(item) {
  const env = getCurrentEnv();
  const metadata = buildMetadata(item);
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", item.file, item.file.name);

  const response = await fetch(`${env.apiBaseUrl}${env.imageUploadPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: form
  });

  const text = await response.text();
  let payload = text;
  try { payload = JSON.parse(text); } catch (_) {}

  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  }
  return payload;
}

async function worker(queue) {
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) return;
    item.status = "uploading";
    renderFiles();

    try {
      const payload = await uploadOne(item);
      item.status = "success";
      item.lastError = "";
      progress.succeeded += 1;
      const imageId = payload?.id ? `ID ${payload.id}` : "Opplastet";
      appendResult(item.title, `${imageId} · ${item.file.name}`, "success");
    } catch (error) {
      item.status = "error";
      item.lastError = error.message;
      progress.failed.push(item.id);
      appendResult(item.title, error.message, "error");
      if (els.stopOnError.checked) {
        queue.length = 0;
      }
    }

    progress.completed += 1;
    updateProgress();
    renderFiles();
    await sleep(DELAY_MS);
  }
}

async function uploadQueue(items) {
  const queue = [...items];
  const workerCount = Math.min(MAX_CONCURRENT, queue.length);
  const workers = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker(queue));
  }
  await Promise.all(workers);
}

async function uploadAll(items = fileItems.filter((item) => item.status !== "success")) {
  els.results.innerHTML = "";
  if (!accessToken) {
    appendResult("Mangler innlogging", "Du må logge inn før opplasting.", "error");
    return;
  }
  if (!els.metadataForm.reportValidity()) return;
  if (!items.length) {
    appendResult("Ingen filer", "Det er ingen filer å laste opp.", "error");
    return;
  }

  progress = {
    total: items.length,
    completed: 0,
    succeeded: 0,
    failed: []
  };
  items.forEach((item) => {
    item.status = "pending";
    item.lastError = "";
  });
  updateProgress();
  renderFiles();
  els.uploadButton.disabled = true;
  els.retryFailedButton.classList.add("hidden");

  await uploadQueue(items);

  updateUploadButtonState();
  els.retryFailedButton.classList.toggle("hidden", progress.failed.length === 0);
}

function retryFailed() {
  const failedItems = fileItems.filter((item) => progress.failed.includes(item.id));
  uploadAll(failedItems);
}

function bindEvents() {
  els.loginButton.addEventListener("click", login);
  els.logoutButton.addEventListener("click", logout);

  els.environmentSelect.addEventListener("change", async () => {
    currentEnvironmentKey = els.environmentSelect.value;
    safeStorageSet("ndla.environment", currentEnvironmentKey);
    auth0Client = null;
    accessToken = null;
    setAuthStatus(`Byttet til ${getCurrentEnv()?.label || currentEnvironmentKey}`, "neutral");
    updateUploadButtonState();
    await initAuth();
  });

  els.fileInput.addEventListener("change", (event) => addFiles(event.target.files));
  els.clearFilesButton.addEventListener("click", clearFiles);
  els.applyBatchButton.addEventListener("click", applyBatchValuesToAll);
  els.uploadButton.addEventListener("click", () => uploadAll());
  els.retryFailedButton.addEventListener("click", retryFailed);
  els.dryRunButton.addEventListener("click", renderPreview);

  els.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropzone.classList.add("dragover");
  });
  els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("dragover"));
  els.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("dragover");
    addFiles(event.dataTransfer.files);
  });

  ["input", "change"].forEach((eventName) => {
    els.metadataForm.addEventListener(eventName, () => {
      syncLicenseDescription();
      renderKeywordChips();
      renderPreview();
    });
  });

  els.metadataForm.elements["licenseDescription"].addEventListener("input", () => {
    els.metadataForm.elements["licenseDescription"].dataset.autofilled = "false";
  });
}

async function init() {
  populateEnvironmentSelect();
  bindEvents();
  syncLicenseDescription();
  renderKeywordChips();
  renderFiles();
  updateFileSummary();
  renderPreview();
  updateProgress();
  await initAuth();
}

window.addEventListener("load", init);
