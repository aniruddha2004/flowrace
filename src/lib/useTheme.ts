"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "flowrace-theme";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = () => {
    const next = !dark;
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    listeners.forEach((l) => l());
  };
  return { dark, toggle };
}
