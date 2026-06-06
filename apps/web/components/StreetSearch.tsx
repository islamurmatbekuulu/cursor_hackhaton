"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  onSubmit: (street: string) => void;
  loading: boolean;
}

export function StreetSearch({ onSubmit, loading }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the input so we don't show "ready" flicker on every keystroke.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value.trim()), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value]);

  const canSubmit = debounced.length >= 2 && !loading;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) onSubmit(debounced);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="street" className="text-sm font-medium text-slate-700">
        {t("search.label")}
      </label>
      <div className="flex gap-2">
        <input
          id="street"
          type="text"
          inputMode="text"
          autoComplete="street-address"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("search.placeholder")}
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-[44px] rounded-lg bg-accent px-5 font-medium text-accent-fg transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "…" : t("search.button")}
        </button>
      </div>
      <p className="text-xs text-slate-500">{t("search.hint")}</p>
    </form>
  );
}
