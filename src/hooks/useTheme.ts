import { useEffect, useState } from "react";
import { THEME_KEY } from "../constants";
import type { ThemeMode } from "../types";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      return stored === "light" || stored === "dark" ? stored : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return { theme, setTheme };
}
