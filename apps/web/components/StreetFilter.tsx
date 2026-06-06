"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useTranslation } from "react-i18next";
import { DEMO_STREETS } from "@/lib/demo-submissions";

interface Props {
  selectedStreet: string | null;
  onStreetChange: (street: string | null) => void;
  mapsEnabled: boolean;
  streetAverage: number | null;
  reportCount: number;
}

const ISTANBUL_BOUNDS = { north: 41.35, south: 40.78, west: 28.45, east: 29.5 };

function isPacOpen(): boolean {
  const el = document.querySelector(".pac-container") as HTMLElement | null;
  return !!el && el.offsetParent !== null && el.childElementCount > 0;
}

export function StreetFilter({
  selectedStreet,
  onStreetChange,
  mapsEnabled,
  streetAverage,
  reportCount,
}: Props) {
  const { t } = useTranslation();
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(selectedStreet ?? "");
  const useDropdown = !mapsEnabled;

  useEffect(() => {
    setValue(selectedStreet ?? "");
  }, [selectedStreet]);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const bounds = new google.maps.LatLngBounds(
      { lat: ISTANBUL_BOUNDS.south, lng: ISTANBUL_BOUNDS.west },
      { lat: ISTANBUL_BOUNDS.north, lng: ISTANBUL_BOUNDS.east },
    );

    const autocomplete = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "tr" },
      fields: ["name", "formatted_address"],
      bounds,
      strictBounds: false,
      types: ["route", "geocode"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const displayed = inputRef.current?.value?.trim();
      const label = displayed || place.formatted_address || place.name || value;
      setValue(label);
      onStreetChange(label || null);
    });

    return () => {
      listener.remove();
      google.maps.event.clearInstanceListeners(autocomplete);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  function handleDropdownChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (!v) {
      setValue("");
      onStreetChange(null);
      return;
    }
    setValue(v);
    onStreetChange(v);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    if (!e.target.value.trim()) onStreetChange(null);
  }

  function handleClear() {
    setValue("");
    onStreetChange(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && places && isPacOpen()) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      onStreetChange(value.trim() || null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="street-filter" className="text-sm font-medium text-slate-700">
          {t("filter.label")}
        </label>
        {useDropdown ? (
          <select
            id="street-filter"
            value={selectedStreet ?? ""}
            onChange={handleDropdownChange}
            aria-describedby="street-filter-help"
            className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition hover:border-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            <option value="">{t("filter.allStreets")}</option>
            {DEMO_STREETS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="street-filter"
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t("filter.placeholder")}
              aria-describedby="street-filter-help"
              className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition hover:border-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            {selectedStreet && (
              <button
                type="button"
                onClick={handleClear}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
              >
                {t("filter.clear")}
              </button>
            )}
          </div>
        )}
        <p id="street-filter-help" className="mt-2 text-xs leading-5 text-slate-500">
          {useDropdown ? t("filter.hintDropdown") : t("filter.hintPlaces")}
        </p>
      </div>

      {selectedStreet && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 text-center">
          <Stat label={t("filter.streetAverage")} value={streetAverage != null ? streetAverage.toFixed(1) : "—"} />
          <Stat label={t("filter.reportCount")} value={String(reportCount)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-4">
      <div className="tnum text-2xl font-bold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
