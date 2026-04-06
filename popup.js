const DEFAULT_SETTINGS = {
  defaultMode: "standard",
  hostOverrides: {}
};

const MODE_LABELS = {
  standard: "通常",
  "date-host": "YYYY_MM_DD / HOST_NAME",
  "host-date": "HOST_NAME / YYYY_MM_DD"
};

const overrideMode = "host-date";

const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
const currentHostElement = document.getElementById("current-host");
const hostOverrideButton = document.getElementById("host-override-button");
const overrideListElement = document.getElementById("override-list");
const emptyStateElement = document.getElementById("empty-state");
const clearOverridesButton = document.getElementById("clear-overrides-button");

let currentHost = "";
let settings = { ...DEFAULT_SETTINGS };

bootstrap().catch((error) => {
  console.error("Popup initialization failed", error);
  currentHostElement.textContent = "設定の読み込みに失敗しました。";
});

for (const button of modeButtons) {
  button.addEventListener("click", async () => {
    const nextMode = button.dataset.mode;

    if (!nextMode || settings.defaultMode === nextMode) {
      return;
    }

    settings.defaultMode = nextMode;
    await saveSettings();
    render();
  });
}

hostOverrideButton.addEventListener("click", async () => {
  if (!currentHost) {
    return;
  }

  if (settings.hostOverrides[currentHost] === overrideMode) {
    delete settings.hostOverrides[currentHost];
  } else {
    settings.hostOverrides[currentHost] = overrideMode;
  }

  await saveSettings();
  render();
});

clearOverridesButton.addEventListener("click", async () => {
  settings.hostOverrides = {};
  await saveSettings();
  render();
});

async function bootstrap() {
  const [storedSettings, tabHost] = await Promise.all([loadSettings(), getCurrentTabHost()]);
  settings = storedSettings;
  currentHost = tabHost;
  render();
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    defaultMode: stored.defaultMode || DEFAULT_SETTINGS.defaultMode,
    hostOverrides: normalizeOverrides(stored.hostOverrides)
  };
}

function normalizeOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([host, mode]) => typeof host === "string" && mode === overrideMode)
      .map(([host, mode]) => [host.toLowerCase(), mode])
  );
}

async function getCurrentTabHost() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab || !tab.url) {
    return "";
  }

  try {
    return new URL(tab.url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function saveSettings() {
  await chrome.storage.sync.set(settings);
}

function render() {
  renderModeButtons();
  renderCurrentHostSection();
  renderOverrideList();
}

function renderModeButtons() {
  for (const button of modeButtons) {
    const isActive = button.dataset.mode === settings.defaultMode;
    button.classList.toggle("active", isActive);
  }
}

function renderCurrentHostSection() {
  if (!currentHost) {
    currentHostElement.textContent = "このタブのホストは取得できません。";
    hostOverrideButton.disabled = true;
    hostOverrideButton.classList.remove("active");
    return;
  }

  currentHostElement.textContent = currentHost;
  hostOverrideButton.disabled = false;

  const isActive = settings.hostOverrides[currentHost] === overrideMode;
  hostOverrideButton.classList.toggle("active", isActive);
  hostOverrideButton.textContent = isActive
    ? "このホストの固定を解除する"
    : "このホストでは HOST_NAME / YYYY_MM_DD";
}

function renderOverrideList() {
  overrideListElement.textContent = "";

  const hosts = Object.keys(settings.hostOverrides).sort((a, b) => a.localeCompare(b));
  emptyStateElement.hidden = hosts.length > 0;
  clearOverridesButton.disabled = hosts.length === 0;

  for (const host of hosts) {
    const item = document.createElement("li");
    item.className = "override-item";

    const label = document.createElement("span");
    label.className = "override-host";
    label.textContent = `${host} -> ${MODE_LABELS[overrideMode]}`;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-button";
    removeButton.textContent = "解除";
    removeButton.addEventListener("click", async () => {
      delete settings.hostOverrides[host];
      await saveSettings();
      render();
    });

    item.append(label, removeButton);
    overrideListElement.append(item);
  }
}
