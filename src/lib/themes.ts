export type ThemeOption = {
  key: string;
  label: string;
  /** Swatches para la vista previa del selector: [superficie, fondo, marca]. */
  swatches: [string, string, string];
};

export const THEMES: ThemeOption[] = [
  { key: "claro", label: "Claro", swatches: ["#ffffff", "#f4f7fb", "#215a8f"] },
  { key: "arena", label: "Arena", swatches: ["#fffdf9", "#f6f1e7", "#a8622f"] },
  { key: "bosque", label: "Bosque", swatches: ["#ffffff", "#eef5f0", "#1f6b46"] },
  { key: "noche", label: "Noche", swatches: ["#1b2130", "#12161f", "#5aa0d8"] },
];

export function themeLabel(key: string): string {
  return THEMES.find((t) => t.key === key)?.label ?? key;
}
