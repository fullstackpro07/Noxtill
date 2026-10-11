"use client";

import { useEffect, useRef, useState } from "react";

const LANGUAGES = [
  "English (US)",
  "English (UK)",
  "Español",
  "Français",
  "Deutsch",
];

export function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("English (US)");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={ref} className="nxf-lang-wrap">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="nxf-lang-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select language"
      >
        <span>{selected}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="nxf-lang-menu" role="listbox" aria-label="Available languages">
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              role="option"
              aria-selected={lang === selected}
              onClick={() => {
                setSelected(lang);
                setOpen(false);
              }}
              className={`nxf-lang-item ${lang === selected ? "active" : ""}`}
            >
              {lang}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
