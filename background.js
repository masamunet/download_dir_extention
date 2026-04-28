const DEFAULT_SETTINGS = {
  enabled: false,
  directory: null
};

let currentSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;
let settingsReady = refreshSettings();


chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  currentSettings = normalizeSettings(stored);
  await chrome.storage.local.set(currentSettings);
});

chrome.runtime.onStartup.addListener(() => {
  settingsReady = refreshSettings();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  currentSettings = normalizeSettings({
    enabled: changes.enabled ? changes.enabled.newValue : currentSettings.enabled,
    directory: changes.directory ? changes.directory.newValue : currentSettings.directory
  });
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (!settingsLoaded) {
    void settingsReady.then(() => suggestDownloadPath(item, suggest));
    return true;
  }

  suggestDownloadPath(item, suggest);
});

function suggestDownloadPath(item, suggest) {
  try {
    const settings = currentSettings;
    const hostName = resolveDownloadHostName(item) || "unknown-host";

    if (!settings.enabled || !settings.directory) {
      suggest();
      return;
    }

    suggest({
      filename: buildSuggestedFilename(hostName, settings.directory, item.filename),
      conflictAction: "uniquify"
    });
  } catch (error) {
    console.error("Failed to determine download path", error);
    suggest();
  }
}

async function refreshSettings() {
  currentSettings = normalizeSettings(await chrome.storage.local.get(DEFAULT_SETTINGS));
  settingsLoaded = true;
}

function normalizeSettings(settings) {
  const directory = isValidDirectory(settings.directory) ? settings.directory : null;

  return {
    enabled: settings.enabled === true && directory !== null,
    directory
  };
}

function isValidDirectory(directory) {
  return (
    typeof directory === "string" &&
    /^\d{4}-\d{2}-\d{2}\/\d{2}-\d{2}$/.test(directory)
  );
}

function buildSuggestedFilename(hostName, directory, filename) {
  return `${sanitizePathSegment(hostName)}/${directory}/${getLeafFilename(filename)}`;
}

function resolveDownloadHostName(item) {
  const downloadHostName = extractHostName(item.finalUrl || item.url);
  if (downloadHostName) {
    return downloadHostName;
  }

  return extractHostName(item.referrer);
}

function extractHostName(rawUrl) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === "blob:" || url.protocol === "filesystem:") {
      return extractEmbeddedHostName(url.pathname);
    }

    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function extractEmbeddedHostName(pathname) {
  try {
    return new URL(pathname).hostname.toLowerCase();
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
