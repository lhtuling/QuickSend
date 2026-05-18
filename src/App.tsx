import { useEffect, useState } from "react";
import Popup from "./components/Popup";
import SettingsPage from "./components/Settings";

function getRoute(): string {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) return hash.slice(2);
  return "popup";
}

export default function App() {
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const handler = () => setRoute(getRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  // Close popup when clicking outside
  useEffect(() => {
    if (route !== "popup") return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only close if clicking on the root transparent area, not inside the popup
      if (target === document.documentElement || target === document.body) {
        // Don't close on outside click for popup - user might click accidentally
      }
    };

    // Handle blur to close popup when focus moves away
    const blurHandler = () => {
      // Small delay to allow click events to process
      setTimeout(() => {
        if (document.activeElement === document.body || document.activeElement === document.documentElement) {
          // Window lost focus, but don't auto-close - let user control via Escape
        }
      }, 200);
    };

    document.addEventListener("click", handler);
    window.addEventListener("blur", blurHandler);
    return () => {
      document.removeEventListener("click", handler);
      window.removeEventListener("blur", blurHandler);
    };
  }, [route]);

  if (route === "settings") return <SettingsPage />;
  return <Popup />;
}
