import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_EVALUATORS } from "@/mock-data";

export interface Preferences {
  theme: "light" | "dark" | "system";
  workspace: string;
  compactTables: boolean;
  maskPii: boolean;
  defaultDatasetId: string;
  defaultEvaluators: string[];
  passThreshold: number;
}

const DEFAULTS: Preferences = {
  theme: "light",
  workspace: "Acme Support",
  compactTables: false,
  maskPii: true,
  defaultDatasetId: "ds_support_tickets",
  defaultEvaluators: DEFAULT_EVALUATORS,
  passThreshold: 90,
};

const KEY = "traceguard.prefs";
const Ctx = createContext<{ prefs: Preferences; update: (p: Partial<Preferences>) => void; reset: () => void }>({
  prefs: DEFAULTS,
  update: () => {},
  reset: () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const dark = prefs.theme === "dark" || (prefs.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, [prefs.theme]);

  const update = (p: Partial<Preferences>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  const reset = () => {
    localStorage.removeItem(KEY);
    setPrefs(DEFAULTS);
  };

  return <Ctx.Provider value={{ prefs, update, reset }}>{children}</Ctx.Provider>;
}

export const usePreferences = () => useContext(Ctx);
