"use client";
import { useEffect, useState } from "react";

/** Effective dark mode: manual choice (html[data-theme]) overrides the device setting. Updates live. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const t = document.documentElement.dataset.theme;
      setDark(t === "dark" ? true : t === "light" ? false : mq.matches);
    };
    read();
    mq.addEventListener("change", read);
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", read); mo.disconnect(); };
  }, []);
  return dark;
}
