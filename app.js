const baseCfg = window.NDLA_CONFIG || {};
const ENV_STORAGE_KEY = "ndla-image-uploader-environment";
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const authStatus = document.getElementById("authStatus");
const environmentSelect = document.getElementById("environmentSelect");
const environmentHint = document.getElementById("environmentHint");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const fileSummary = document.getElementById("fileSummary");
const uploadButton = document.getElementById("uploadButton");
const dryRunButton = document.getElementById("dryRunButton");
const previewBox = document.getElementById("previewBox");
const results = document.getElementById("results");
const metadataForm = document.getElementById("metadataForm");

const LICENSE_PRESETS = {
  "CC-BY-4.0": "Creative Commons Attribution 4.0 International",
  "CC-BY-SA-4.0": "Creative Commons Attribution-ShareAlike 4.0 International",
  "CC-BY-NC-4.0": "Creative Commons Attribution-NonCommercial 4.0 International",
  "CC-BY-NC-SA-4.0": "Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International",
  "CC-BY-NC-ND-4.0": "Creative Commons Attribution-NonCommercial-NoDerivs 4.0 International",
  "COPYRIGHTED": "Copyrighted"
};

let auth0Client = null;
let accessToken = null;
let selectedFiles = [];

function getStoredEnvironment() {
  return localStorage.getItem(ENV_STORAGE_KEY) || baseCfg.defaultEnvironment || "test";
}

function getEnvironmentMap() {
  if (baseCfg.environments && typeof baseCfg.environments === "object") {
    return baseCfg.environments;
  }
  return {
    default: {
      auth0Domain: baseCfg.auth0Domain,
      auth0ClientId: baseCfg.auth0ClientId,
      auth0Audience: baseCfg.auth0Audience,
      apiBaseUrl: baseCfg.apiBaseUrl,
      imageUploadPath: baseCfg.imageUploadPath,
      scope: baseCfg.scope,
      googleConnection: baseCfg.googleConnection,
      label: "Standard"
    }
  };
}

function getCurrentEnvironmentKey() {
  const envs = getEnvironmentMap();
  const selected = environmentSelect?.value || getStoredEnvironment();
  return envs[selected] ? selected : Object.keys(envs)[0];
}

function getCurrentConfig() {
  const envs = getEnvironmentMap();
  return envs[getCurrentEnvironmentKey()] || envs[Object.keys(envs)[0]] || {};
}

function populateEnvironmentOptions() {
  if (!environmentSelect) return;
  const envs = getEnvironmentMap();
  const entries = Object.entries(envs);
  environmentSelect.innerHTML = entries
    .map(([key, value]) => `<option value="${key}">${value.label || key}</option>`)
    .join("");
  const preferred = getStoredEnvironment();
  environmentSelect.value = envs[preferred] ? preferred : entries[0]?.[0] || "default";
  updateEnvironmentHint();
}

function updateEnvironmentHint() {
  const cfg = getCurrentConfig();
  if (!environmentHint) return;
  const label = cfg.label || getCurrentEnvironmentKey();
  const apiUrl = cfg.apiBaseUrl || "ukjent API";
  environmentHint.textContent = `Valgt miljø: ${label} · ${apiUrl}`;
}

function ensureConfig() {
  const cfg = getCurrentConfig();
  const required = ["auth0Domain", "auth0ClientId", "apiBaseUrl", "imageUploadPath", "scope", "googleConnection"];
  const missing = required.filter((key) => !cfg[key] || String(cfg[key]).includes("SETT_INN"));
  if (missing.length) {
    setAuthStatus(`Mangler config for ${cfg.label || getCurrentEnvironmentKey()}: ${missing.join(", ")}`, "error");
    loginButton.disabled = true;
    return false;
  }
  loginButton.disabled = false;
  return true;
}

function setAuthStatus(text, kind = "neutral") {
  authStatus.textContent = text;
  authStatus.className = `status-pill ${kind}`;
}

function sanitizeTitleFromFilename(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseContributors(text) {
  return text
    .split("
")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [type, ...nameParts] = line.split("|");
      return { type: (type || "originator").trim(), name: nameParts.join("|").trim() };
    })
    .filter((entry) => entry.name);
}

function syncLicenseDescription() {
  const licenseField = metadataForm.elements["license"];
  const descriptionField = metadataForm.elements["licenseDescription"];
  if (!licenseField || !descriptionField) return;

  const suggested = LICENSE_PRESETS[licenseField.value] || "";
  if (!descriptionField.value.trim() || descriptionField.dataset.autofilled === "true") {
    descriptionField.value = suggested;
    descriptionField.dataset.autofilled = "true";
  }
}

function buildSharedMetadata(titleOverride) {
  const data = new FormData(metadataForm);
  const tags = (data.get("tags") || "")
    .toString()
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const metadata = {
    title: titleOverride,
    alttext: (data.get("alttext") || "").toString().trim(),
    caption: (data.get("caption") || "").toString().trim(),
    tags,
    language: (data.get("language") || "nb").toString(),
    modelReleased: (data.get("modelReleased") || "not-set").toString(),
    copyright: {
      license: {
        license: (data.get("license") || "").toString().trim(),
        description: (data.get("licenseDescription") || "").toString().trim()
      },
      origin: (data.get("origin") || "").toString().trim(),
      creators: parseContributors((data.get("creators") || "").toString()),
      processors: parseContributors((data.get("processors") || "").toString()),
      rightsholders: parseContributors((data.get("rightsholders") || "").toString()),
      processed: Boolean(data.get("processed"))
    }
  };

  if (!metadata.alttext) delete metadata.alttext;
  if (!metadata.copyright.license.description) delete metadata.copyright.license.description;
  if (!metadata.copyright.origin) delete metadata.copyright.origin;

  return metadata;
}

function renderFiles() {
  fileList.innerHTML = "";
  if (!selectedFiles.length) {
    fileSummary.textContent = "Ingen filer valgt.";
    uploadButton.disabled = true;
    return;
  }

  fileSummary.textContent = `${selectedFiles.length} filer valgt.`;
  selectedFiles.forEach((file) => {
    const title = sanitizeTitleFromFilename(file.name);
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div>
        <div class="file-title">${title}</div>
        <div class="file-meta">${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB</div>
      </div>
      <div class="file-meta">${file.type || "ukjent type"}</div>
    `;
    fileList.appendChild(row);
  });
  uploadButton.disabled = !accessToken;
}

function renderPreview() {
  const firstFile = selectedFiles[0];
  if (!firstFile) {
    previewBox.textContent = "Ingen forhåndsvisning enda.";
    return;
  }
  const preview = buildSharedMetadata(sanitizeTitleFromFilename(firstFile.name));
  previewBox.textContent = JSON.stringify(preview, null, 2);
}

function appendResult(title, body, kind = "neutral") {
  const item = document.createElement("div");
  item.className = `result-item ${kind}`;
  item.innerHTML = `<strong>${title}</strong><div>${body}</div>`;
  results.prepend(item);
}

async function createAuthClient() {
  if (!ensureConfig()) return null;
  if (auth0Client) return auth0Client;
  const cfg = getCurrentConfig();
  auth0Client = await window.auth0.createAuth0Client({
    domain: cfg.auth0Domain,
    clientId: cfg.auth0ClientId,
    authorizationParams: {
      redirect_uri: window.location.origin + window.location.pathname,
      audience: cfg.auth0Audience || undefined,
      scope: cfg.scope
    },
    cacheLocation: "localstorage",
    useRefreshTokens: true
  });
  return auth0Client;
}

async function initAuth() {
  const client = await createAuthClient();
  if (!client) return;

  const qs = new URLSearchParams(window.location.search);
  if (qs.has("code") && qs.has("state")) {
    await client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const isAuthenticated = await client.isAuthenticated();
  if (!isAuthenticated) {
    setAuthStatus(`Ikke logget inn (${getCurrentConfig().label || getCurrentEnvironmentKey()})`, "neutral");
    logoutButton.classList.add("hidden");
    uploadButton.disabled = true;
    return;
  }

  const user = await client.getUser();
  accessToken = await client.getTokenSilently();
  setAuthStatus(`Logget inn i ${getCurrentConfig().label || getCurrentEnvironmentKey()} som ${user?.name || user?.email || "bruker"}`, "success");
  logoutButton.classList.remove("hidden");
  uploadButton.disabled = !selectedFiles.length;
}

async function login() {
  const client = await createAuthClient();
  if (!client) return;
  const cfg = getCurrentConfig();
  await client.loginWithRedirect({
    authorizationParams: {
      connection: cfg.googleConnection,
      audience: cfg.auth0Audience || undefined,
      scope: cfg.scope,
      redirect_uri: window.location.origin + window.location.pathname
    }
  });
}

async function logout() {
  const client = await createAuthClient();
  if (!client) return;
  accessToken = null;
  client.logout({ logoutParams: { returnTo: window.location.origin + window.location.pathname } });
}

async function uploadOne(file, metadata) {
  const cfg = getCurrentConfig();
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file, file.name);

  const response = await fetch(`${cfg.apiBaseUrl}${cfg.imageUploadPath}`, {
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

async function uploadAll() {
  results.innerHTML = "";
  if (!accessToken) {
    appendResult("Mangler innlogging", "Du må logge inn før opplasting.", "error");
    return;
  }
  if (!metadataForm.reportValidity()) return;
  if (!selectedFiles.length) {
    appendResult("Ingen filer", "Velg minst én bildefil først.", "error");
    return;
  }

  uploadButton.disabled = true;
  for (const file of selectedFiles) {
    const title = sanitizeTitleFromFilename(file.name);
    const metadata = buildSharedMetadata(title);
    try {
      const payload = await uploadOne(file, metadata);
      const imageId = payload?.id ? `ID ${payload.id}` : "Opplastet";
      appendResult(title, `${imageId} · ${file.name}`, "success");
    } catch (error) {
      appendResult(title, error.message, "error");
    }
  }
  uploadButton.disabled = false;
}

async function switchEnvironment(nextEnv) {
  localStorage.setItem(ENV_STORAGE_KEY, nextEnv);
  auth0Client = null;
  accessToken = null;
  logoutButton.classList.add("hidden");
  updateEnvironmentHint();
  renderFiles();
  await initAuth();
}

loginButton.addEventListener("click", login);
logoutButton.addEventListener("click", logout);
environmentSelect?.addEventListener("change", async (event) => {
  await switchEnvironment(event.target.value);
});
fileInput.addEventListener("change", (event) => {
  selectedFiles = Array.from(event.target.files || []);
  renderFiles();
  renderPreview();
});
dryRunButton.addEventListener("click", () => {
  if (!metadataForm.reportValidity()) return;
  renderPreview();
});
uploadButton.addEventListener("click", uploadAll);
metadataForm.elements["licenseDescription"]?.addEventListener("input", () => {
  metadataForm.elements["licenseDescription"].dataset.autofilled = "false";
  renderPreview();
});
metadataForm.elements["license"]?.addEventListener("change", () => {
  syncLicenseDescription();
  renderPreview();
});
metadataForm.addEventListener("input", renderPreview);

populateEnvironmentOptions();
syncLicenseDescription();
renderPreview();

initAuth().catch((error) => {
  console.error(error);
  setAuthStatus(`Auth-feil: ${error.message}`, "error");
});
