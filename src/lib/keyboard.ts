"use client";

import { useEffect } from "react";

type Opts = {
  onSelect?: (index: number) => void;
  onPrev?: () => void;
  onNext?: () => void;
  answerCount: number;
  enabled?: boolean;
};

export function useQuestionKeyboard({ onSelect, onPrev, onNext, answerCount, enabled = true }: Opts) {
  useEffect(() => {
    if (!enabled) return;
    function handler(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.key >= "1" && ev.key <= "9") {
        const idx = parseInt(ev.key, 10) - 1;
        if (onSelect && idx < answerCount) { ev.preventDefault(); onSelect(idx); }
      } else if (ev.key === "ArrowRight" || ev.key === "n" || ev.key === "N") {
        if (onNext) { ev.preventDefault(); onNext(); }
      } else if (ev.key === "ArrowLeft" || ev.key === "p" || ev.key === "P") {
        if (onPrev) { ev.preventDefault(); onPrev(); }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelect, onPrev, onNext, answerCount, enabled]);
}
