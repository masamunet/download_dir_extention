const DEFAULT_SETTINGS = {
  enabled: false,
  directory: null
};

const ACTION_STATES = {
  enabled: {
    title: "Download Directory Extension: ON",
    badgeText: "ON",
    badgeColor: "#188038"
  },
  disabled: {
    title: "Download Directory Extension: OFF",
    badgeText: "OFF",
    badgeColor: "#5f6368"
  }
};

const ACTION_ICON_SIZES = [16, 32, 48, 128];

let currentSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;
let settingsReady = refreshSettings();


chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  currentSettings = normalizeSettings(stored);
  await chrome.storage.local.set(currentSettings);
  await updateActionVisuals();
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

  void updateActionVisuals();
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
  await updateActionVisuals();
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

    return normalizeHostName(url.hostname);
  } catch {
    return "";
  }
}

function extractEmbeddedHostName(pathname) {
  try {
    return normalizeHostName(new URL(pathname).hostname);
  } catch {
    return "";
  }
}

function normalizeHostName(hostName) {
  const normalizedHostName = hostName.toLowerCase();

  if (normalizedHostName.endsWith(".proxy.runpod.net")) {
    return "proxy.runpod.net";
  }

  return normalizedHostName;
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

async function updateActionVisuals() {
  const state = currentSettings.enabled ? ACTION_STATES.enabled : ACTION_STATES.disabled;
  const updates = [
    chrome.action.setTitle({ title: state.title }),
    chrome.action.setBadgeText({ text: state.badgeText }),
    chrome.action.setBadgeBackgroundColor({ color: state.badgeColor })
  ];

  if (typeof OffscreenCanvas === "function") {
    updates.push(chrome.action.setIcon({ imageData: buildActionIconSet(currentSettings.enabled) }));
  }

  try {
    await Promise.all(updates);
  } catch (error) {
    console.error("Failed to update action visuals", error);
  }
}

function buildActionIconSet(enabled) {
  return Object.fromEntries(
    ACTION_ICON_SIZES.map((size) => [size, buildActionIcon(size, enabled)])
  );
}

function buildActionIcon(size, enabled) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  const colors = enabled
    ? {
        background: "#188038",
        folder: "#ffffff",
        folderShade: "#d2f4dc",
        mark: "#137333"
      }
    : {
        background: "#5f6368",
        folder: "rgba(255, 255, 255, 0.92)",
        folderShade: "#e8eaed",
        mark: "#d93025"
      };
  const scale = (value) => value * size;

  context.clearRect(0, 0, size, size);
  context.fillStyle = colors.background;
  context.beginPath();
  context.arc(scale(0.5), scale(0.5), scale(0.47), 0, Math.PI * 2);
  context.fill();

  drawFolder(context, scale, colors.folder, colors.folderShade);

  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = colors.mark;

  if (enabled) {
    context.lineWidth = scale(0.09);
    context.beginPath();
    context.moveTo(scale(0.30), scale(0.54));
    context.lineTo(scale(0.43), scale(0.68));
    context.lineTo(scale(0.72), scale(0.36));
    context.stroke();
  } else {
    context.lineWidth = scale(0.14);
    context.beginPath();
    context.moveTo(scale(0.25), scale(0.25));
    context.lineTo(scale(0.75), scale(0.75));
    context.stroke();
  }

  return context.getImageData(0, 0, size, size);
}

function drawFolder(context, scale, folderColor, shadeColor) {
  context.fillStyle = folderColor;
  context.fillRect(scale(0.22), scale(0.32), scale(0.23), scale(0.12));
  context.fillRect(scale(0.18), scale(0.40), scale(0.64), scale(0.34));

  context.fillStyle = shadeColor;
  context.fillRect(scale(0.18), scale(0.56), scale(0.64), scale(0.18));
}
