const themePreferenceKey = "powerwash-color-theme";

export function loadDarkModePreference() {
  try {
    const saved = window.localStorage.getItem(themePreferenceKey);
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    return false;
  }
}

export function saveDarkModePreference(darkMode: boolean) {
  try {
    window.localStorage.setItem(themePreferenceKey, darkMode ? "dark" : "light");
  } catch {
    // The theme still works for the current session when storage is unavailable.
  }
}
