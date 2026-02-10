import { useState } from "react";
import { SettingsView } from "@/components/SettingsView";
import { TranslateView } from "@/components/TranslateView";

function App() {
  const [view, setView] = useState<"translate" | "settings">("translate");

  if (view === "settings") {
    return <SettingsView onBack={() => setView("translate")} />;
  }

  return <TranslateView onOpenSettings={() => setView("settings")} />;
}

export default App;
