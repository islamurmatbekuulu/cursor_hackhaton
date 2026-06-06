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
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="street-filter" className="text-sm font-medium text-slate-700">
          {t("filter.label")}
        </label>
        {useDropdown ? (
          <select
            id="street-filter"
            value={selectedStreet ?? ""}
            onChange={handleDropdownChange}
            className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            <option value="">{t("filter.allStreets")}</option>
            {DEMO_STREETS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-1.5 flex gap-2">
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
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            {selectedStreet && (
              <button
                type="button"
                onClick={handleClear}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {t("filter.clear")}
              </button>
            )}
          </div>
        )}
        <p className="mt-1.5 text-xs text-slate-500">
          {useDropdown ? t("filter.hintDropdown") : t("filter.hintPlaces")}
        </p>
      </div>

      {selectedStreet && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-center">
          <Stat label={t("filter.streetAverage")} value={streetAverage != null ? streetAverage.toFixed(1) : "—"} />
          <Stat label={t("filter.reportCount")} value={String(reportCount)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-3">
      <div className="tnum text-xl font-semibold text-slate-900">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
