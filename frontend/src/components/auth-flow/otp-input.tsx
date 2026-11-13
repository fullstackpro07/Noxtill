"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { C } from "./auth-ui";

/**
 * One box per digit. Typing advances, Backspace steps back, arrow keys move, and pasting a whole
 * code (from the email) fills every box at once. `onComplete` fires when the last digit lands.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function focus(i: number) {
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();
  }

  function commit(next: string, focusAt: number) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    focus(focusAt);
    if (clean.length === length) onComplete?.(clean);
  }

  function setDigit(i: number, raw: string) {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // A multi-character change here is browser autofill (e.g. iOS one-time-code) — treat as paste.
    if (typed.length > 1) {
      commit(typed, typed.length);
      return;
    }
    const arr = digits.slice();
    arr[i] = typed;
    commit(arr.join(""), i + 1);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = digits.slice();
      if (arr[i]) {
        arr[i] = "";
        onChange(arr.join("").slice(0, i) + arr.slice(i + 1).join(""));
      } else if (i > 0) {
        arr[i - 1] = "";
        onChange(arr.slice(0, i - 1).join("") + arr.slice(i).join(""));
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    commit(pasted, pasted.length);
  }

  return (
    <div role="group" aria-label="Verification code" style={{ display: "flex", justifyContent: "center", gap: 10 }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          maxLength={length}
          style={{
            width: 52,
            maxWidth: "14%",
            height: 60,
            textAlign: "center",
            fontSize: 26,
            fontWeight: 800,
            color: C.ink,
            border: `1.5px solid ${invalid ? C.danger : d ? C.active : C.inputBorder}`,
            borderRadius: 12,
            background: d ? C.mintSoft : "#fff",
            outline: "none",
            transition: "border-color .15s, background .15s",
          }}
        />
      ))}
    </div>
  );
}
