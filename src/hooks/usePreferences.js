import { useState, useEffect } from "react";

const STORAGE_KEY = "genflow_preferences";

const DEFAULTS = {
  darkMode: false,
  keepAwake: false,
  reduceMotion: false,
  confirmDelete: true,
  use24h: false,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

// Apply dark mode and reduce-motion immediately on module load to prevent flash of wrong theme
(function applyInitialTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prefs = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    if (prefs.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    if (prefs.reduceMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }
  } catch {
    // ignore
  }
})();

// Module-level shared state so all hook instances stay in sync
let listeners = [];
let currentPrefs = load();

function notifyAll() {
  listeners.forEach((fn) => fn({ ...currentPrefs }));
}

export function usePreferences() {
  const [prefs, setPrefs] = useState({ ...currentPrefs });

  useEffect(() => {
    function onUpdate(next) {
      setPrefs(next);
    }
    listeners.push(onUpdate);
    return () => {
      listeners = listeners.filter((fn) => fn !== onUpdate);
    };
  }, []);

  function updatePref(key, value) {
    currentPrefs = { ...currentPrefs, [key]: value };
    save(currentPrefs);
    notifyAll();

    if (key === "darkMode") {
      if (value) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    if (key === "reduceMotion") {
      if (value) {
        document.documentElement.classList.add("reduce-motion");
      } else {
        document.documentElement.classList.remove("reduce-motion");
      }
    }
  }

  return {
    darkMode: prefs.darkMode,
    keepAwake: prefs.keepAwake,
    reduceMotion: prefs.reduceMotion,
    confirmDelete: prefs.confirmDelete,
    use24h: prefs.use24h,
    setDarkMode: (v) => updatePref("darkMode", v),
    setKeepAwake: (v) => updatePref("keepAwake", v),
    setReduceMotion: (v) => updatePref("reduceMotion", v),
    setConfirmDelete: (v) => updatePref("confirmDelete", v),
    setUse24h: (v) => updatePref("use24h", v),
  };
}
