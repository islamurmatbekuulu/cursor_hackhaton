"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useTranslation } from "react-i18next";

export interface StreetSelection {
  /** Human label (selected description or free text) — sent as `street`. */
  street: string;
  lat?: number;
  lng?: number;
  place_id?: string;
}

interface Props {
  onSubmit: (selection: StreetSelection) => void;
  loading: boolean;
  mapsEnabled: boolean;
}

// Bias suggestions toward Istanbul. Country restriction (TR) is the hard filter;
// these bounds only nudge ranking, so nearby places stay reachable.
const ISTANBUL_BOUNDS = { north: 41.35, south: 40.78, west: 28.45, east: 29.5 };

function isPacOpen(): boolean {
  const el = document.querySelector(".pac-container") as HTMLElement | null;
  return !!el && el.offsetParent !== null && el.childElementCount > 0;
}

export function StreetSearch({ onSubmit, loading, mapsEnabled }: Props) {
  const { t } = useTranslation();
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  // lat/lng/place_id of the last picked suggestion; cleared when the user edits
  // the text so we never send a stale coordinate to the backend.
  const selectionRef = useRef<StreetSelection | null>(null);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const bounds = new google.maps.LatLngBounds(
      { lat: ISTANBUL_BOUNDS.south, lng: ISTANBUL_BOUNDS.west },
      { lat: ISTANBUL_BOUNDS.north, lng: ISTANBUL_BOUNDS.east },
    );

    const autocomplete = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "tr" },
      fields: ["place_id", "geometry", "name", "formatted_address"],
      bounds,
      strictBounds: false,
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const loc = place.geometry?.location;
      // Prefer the text Google placed in the box so the label matches the pick.
      const displayed = inputRef.current?.value?.trim();
      const label = displayed || place.formatted_address || place.name || value;
      const next: StreetSelection = { street: label, place_id: place.place_id };
      if (loc) {
        next.lat = loc.lat();
        next.lng = loc.lng();
      }
      selectionRef.current = next;
      setValue(label);
    });

    return () => {
      listener.remove();
      google.maps.event.clearInstanceListeners(autocomplete);
    };
    // Re-attach only when the places library becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  const canSubmit = value.trim().length >= 2 && !loading;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const text = value.trim();
    const sel = selectionRef.current;
    if (sel && typeof sel.lat === "number" && typeof sel.lng === "number") {
      // Picked a suggestion → send coordinates (backend skips geocoding).
      onSubmit({ street: sel.street || text, lat: sel.lat, lng: sel.lng, place_id: sel.place_id });
    } else {
      // Free text → backend geocodes it.
      onSubmit({ street: text });
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    selectionRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Let the Autocomplete dropdown consume Enter for selection instead of
    // submitting the form with stale text.
    if (e.key === "Enter" && places && isPacOpen()) e.preventDefault();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="street" className="text-sm font-medium text-slate-700">
        {t("search.label")}
      </label>
      <div className="flex gap-2">
        <input
          id="street"
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
      <p className="text-xs text-slate-500">
        {mapsEnabled && places ? t("search.hint") : t("search.hintNoMaps")}
      </p>
    </form>
  );
}
