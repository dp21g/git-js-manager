export const THEMES = ["dark", "medium", "light"];

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "dark",
  wideDrawerVisible: true,
  wideDrawerWidth: 300,
  zoomLevel: 1,
  drawerRepoState: {}
});

export const THEME_OPTIONS = [
  { id: "dark", label: "Dark", description: "VS Code dark" },
  { id: "medium", label: "Medium", description: "Balanced modern tone" },
  { id: "light", label: "Light", description: "VS Code light" }
];

export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.1;

export const WIDE_DRAWER_MIN = 220;
export const WIDE_DRAWER_MAX = 460;

export function clampZoomLevel(value) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return DEFAULT_SETTINGS.zoomLevel;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(nextValue * 100) / 100));
}

export function clampWideDrawerWidth(value) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return DEFAULT_SETTINGS.wideDrawerWidth;
  return Math.round(Math.min(WIDE_DRAWER_MAX, Math.max(WIDE_DRAWER_MIN, nextValue)));
}

export function normalizeUiSettings(settings = {}) {
  const theme = THEMES.includes(settings.theme) ? settings.theme : DEFAULT_SETTINGS.theme;
  const drawerRepoState =
    settings.drawerRepoState && typeof settings.drawerRepoState === "object"
      ? settings.drawerRepoState
      : DEFAULT_SETTINGS.drawerRepoState;

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    theme,
    wideDrawerVisible:
      typeof settings.wideDrawerVisible === "boolean"
        ? settings.wideDrawerVisible
        : DEFAULT_SETTINGS.wideDrawerVisible,
    wideDrawerWidth: clampWideDrawerWidth(settings.wideDrawerWidth),
    zoomLevel: clampZoomLevel(settings.zoomLevel),
    drawerRepoState
  };
}

export function getZoomLabel(zoomLevel) {
  return `${Math.round(clampZoomLevel(zoomLevel) * 100)}%`;
}

export function applyUiSettingsToDocument(settings = {}) {
  if (typeof document === "undefined") return;

  const nextSettings = normalizeUiSettings(settings);
  document.body.dataset.theme = nextSettings.theme;
  document.documentElement.style.setProperty("--ui-zoom", String(nextSettings.zoomLevel));
  document.documentElement.style.setProperty(
    "--ui-font-scale",
    `${Math.round(nextSettings.zoomLevel * 100)}%`
  );
}
