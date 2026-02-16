import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { COLOR_THEMES } from "@/lib/color-themes";

type ColorThemeState = {
  colorTheme: string;
  setColorTheme: (theme: string) => void;
};

const ColorThemeContext = createContext<ColorThemeState>({
  colorTheme: "neutral",
  setColorTheme: () => {},
});

const STYLE_ID = "color-theme-vars";

function buildCssText(themeName: string): string {
  if (themeName === "neutral") return "";

  const theme = COLOR_THEMES.find((t) => t.name === themeName);
  if (!theme) return "";

  const lightVars = Object.entries(theme.cssVars.light)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");

  const darkVars = Object.entries(theme.cssVars.dark)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");

  return `:root {\n${lightVars}\n}\n.dark {\n${darkVars}\n}`;
}

export function ColorThemeProvider({
  children,
  storageKey = "rendio-color-theme",
}: {
  children: ReactNode;
  storageKey?: string;
}) {
  const [colorTheme, setColorThemeState] = useState<string>(
    () => localStorage.getItem(storageKey) || "neutral",
  );

  useLayoutEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = buildCssText(colorTheme);
  }, [colorTheme]);

  const setColorTheme = (theme: string) => {
    localStorage.setItem(storageKey, theme);
    setColorThemeState(theme);
  };

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  const context = useContext(ColorThemeContext);
  if (context === undefined) {
    throw new Error("useColorTheme must be used within a ColorThemeProvider");
  }
  return context;
}
