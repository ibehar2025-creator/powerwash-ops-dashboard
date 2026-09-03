const themePreferenceKey = "powerwash-color-theme";

export type ThemePreference = "dark" | "light" | "system";

export function loadThemePreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(themePreferenceKey);
    if (saved === "dark" || saved === "light" || saved === "system") return saved;
  } catch {
    // Use the default below when storage is unavailable.
  }
  return "dark";
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(themePreferenceKey, preference);
  } catch {
    // The theme still works for the current session when storage is unavailable.
  }
}

export function themeIsDark(preference: ThemePreference) {
  return preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function loadDarkModePreference() {
  return themeIsDark(loadThemePreference());
}

export function saveDarkModePreference(darkMode: boolean) {
  saveThemePreference(darkMode ? "dark" : "light");
}
