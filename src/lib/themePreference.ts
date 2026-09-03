const themePreferenceKey = "powerwash-color-theme";

export type ThemePreference = "dark" | "light" | "system";

function accountThemeKey(userId: string) {
  return `${themePreferenceKey}:${userId}`;
}

export function loadThemePreference(userId: string): ThemePreference {
  try {
    const saved = window.localStorage.getItem(accountThemeKey(userId));
    if (saved === "dark" || saved === "light" || saved === "system") return saved;
  } catch {
    // Use the default below when storage is unavailable.
  }
  return "dark";
}

export function saveThemePreference(userId: string, preference: ThemePreference) {
  try {
    window.localStorage.setItem(accountThemeKey(userId), preference);
  } catch {
    // The theme still works for the current session when storage is unavailable.
  }
}

export function themeIsDark(preference: ThemePreference) {
  return preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
