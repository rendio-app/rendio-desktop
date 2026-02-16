import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import App from "./App";
import "./index.css";

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(
    <ThemeProvider defaultTheme="system" storageKey="rendio-theme">
      <App />
    </ThemeProvider>,
  );
}
