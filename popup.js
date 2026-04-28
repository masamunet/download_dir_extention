const DEFAULT_SETTINGS = {
  enabled: false,
  directory: null
};

const HOST_PLACEHOLDER = "${DL元のホスト}";

const toggle = document.getElementById("enabled-toggle");
const statusElement = document.getElementById("status");
const directoryElement = document.getElementById("directory");

let settings = { ...DEFAULT_SETTINGS };

bootstrap().catch((error) => {
  console.error("Popup initialization failed", error);
  statusElement.textContent = "設定の読み込みに失敗しました。";
});

toggle.addEventListener("change", async () => {
  if (toggle.checked) {
    settings = {
      enabled: true,
      directory: buildDirectory(new Date())
    };
  } else {
    settings = {
      enabled: false,
      directory: null
    };
  }

  await chrome.storage.local.set(settings);
  render();
});

async function bootstrap() {
  settings = normalizeSettings(await chrome.storage.local.get(DEFAULT_SETTINGS));
  render();
}

function normalizeSettings(stored) {
  const directory = isValidDirectory(stored.directory) ? stored.directory : null;

  return {
    enabled: stored.enabled === true && directory !== null,
    directory
  };
}

function buildDirectory(date) {
  const { dateSegment, hours, minutes } = buildDateParts(date);
  return `${dateSegment}/${hours}-${minutes}`;
}

function buildDateParts(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return {
    dateSegment: `${year}-${month}-${day}`,
    hours,
    minutes
  };
}

function isValidDirectory(directory) {
  return (
    typeof directory === "string" &&
    /^\d{4}-\d{2}-\d{2}\/\d{2}-\d{2}$/.test(directory)
  );
}

function render() {
  toggle.checked = settings.enabled;
  statusElement.textContent = settings.enabled ? "ON" : "OFF";
  directoryElement.textContent = settings.enabled && settings.directory
    ? `${HOST_PLACEHOLDER}/${settings.directory}/`
    : "通常のダウンロード先";
}
