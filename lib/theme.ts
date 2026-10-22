import type { ThemeName } from "./types";

export interface ThemeOption {
  id: ThemeName;
  label: string;
  description: string;
  swatches: [string, string, string];
}

/** All selectable palettes, including the original one as safe fallback. */
export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "classic",
    label: "Classico",
    description: "Il tema originale: avorio, blu polvere e salvia fredda.",
    swatches: ["#f7f4ec", "#dbe8f1", "#2c4a68"],
  },
  {
    id: "sage",
    label: "Sage",
    description: "Salvia caldo, crema e verde morbido.",
    swatches: ["#eef1e8", "#8fa88d", "#3f5a48"],
  },
  {
    id: "rose",
    label: "Rosa",
    description: "Rosa cipria, neutri caldi e accenti polverosi.",
    swatches: ["#f6ece9", "#c99b9c", "#684f59"],
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Avorio, bianco e grigi quasi monocromatici.",
    swatches: ["#f7f7f4", "#d8d8d2", "#3f4444"],
  },
];

export const THEME_COLORS: Record<ThemeName, string> = {
  classic: "#f7f4ec",
  sage: "#eef1e8",
  rose: "#f6ece9",
  minimal: "#f7f7f4",
};

export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", THEME_COLORS[theme]);
}
