const DEFAULT_SETTINGS = {
  defaultMode: "standard",
  hostOverrides: {}
};

const MODE = {
  STANDARD: "standard",
  DATE_HOST: "date-host",
  HOST_DATE: "host-date"
};

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings();
  await chrome.storage.sync.set(settings);
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  void suggestDownloadPath(item, suggest);
  return true;
});

async function suggestDownloadPath(item, suggest) {
  try {
    const settings = await loadSettings();
    const hostName = await resolveDownloadHostName(item);
    const effectiveMode = resolveMode(settings, hostName);

    if (effectiveMode === MODE.STANDARD || !hostName) {
      suggest();
      return;
    }

    const folderPath = buildFolderPath(effectiveMode, hostName, item.startTime);
    const filename = getLeafFilename(item.filename);

    suggest({
      filename: `${folderPath}/${filename}`
    });
  } catch (error) {
    console.error("Failed to determine download path", error);
    suggest();
  }
}

async function resolveDownloadHostName(item) {
  const referrerHostName = extractHostName(item.referrer);
  if (referrerHostName) {
    return referrerHostName;
  }

  return extractHostName(item.finalUrl || item.url);
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    defaultMode: isValidMode(stored.defaultMode) ? stored.defaultMode : DEFAULT_SETTINGS.defaultMode,
    hostOverrides: normalizeOverrides(stored.hostOverrides)
  };
}

function normalizeOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([host, mode]) => typeof host === "string" && mode === MODE.HOST_DATE)
      .map(([host, mode]) => [host.toLowerCase(), mode])
  );
}

function resolveMode(settings, hostName) {
  if (hostName && settings.hostOverrides[hostName] === MODE.HOST_DATE) {
    return MODE.HOST_DATE;
  }

  return settings.defaultMode;
}

function buildFolderPath(mode, hostName, startTime) {
  const safeHost = sanitizePathSegment(hostName);
  const dateSegment = formatDateSegment(startTime);

  if (mode === MODE.DATE_HOST) {
    return `${dateSegment}/${safeHost}`;
  }

  return `${safeHost}/${dateSegment}`;
}

function formatDateSegment(startTime) {
  const date = startTime ? new Date(startTime) : new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}_${month}_${day}`;
}

function extractHostName(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getLeafFilename(filename) {
  const parts = String(filename || "download").split(/[\\/]/);
  const leaf = parts[parts.length - 1];
  return sanitizeFilename(leaf || "download");
}

function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
}

function sanitizePathSegment(segment) {
  return segment.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\.+$/g, "") || "unknown-host";
}

function isValidMode(mode) {
  return Object.values(MODE).includes(mode);
}
