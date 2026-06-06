"use client";

import { useTranslation } from "react-i18next";

interface Props {
  street: string;
  hue?: number;
  className?: string;
}

/** KVKK-safe demo placeholder — procedural gradient + label, no real photos. */
export function PhotoPlaceholder({ street, hue = 168, className = "" }: Props) {
  const { t } = useTranslation();
  const h2 = (hue + 40) % 360;
  const bg = `linear-gradient(145deg, hsl(${hue} 28% 42%) 0%, hsl(${h2} 22% 28%) 100%)`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200 ${className}`}
      style={{ background: bg }}
      role="img"
      aria-label={t("detail.photoAlt")}
    >
      <svg
        className="absolute inset-0 h-full w-full opacity-30"
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <filter id="blur-demo">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>
        <rect width="400" height="240" fill="rgba(255,255,255,0.08)" />
        <ellipse cx="120" cy="90" rx="48" ry="56" fill="rgba(255,255,255,0.15)" filter="url(#blur-demo)" />
        <ellipse cx="280" cy="130" rx="64" ry="40" fill="rgba(255,255,255,0.12)" filter="url(#blur-demo)" />
        <rect x="40" y="160" width="320" height="60" rx="8" fill="rgba(0,0,0,0.2)" filter="url(#blur-demo)" />
      </svg>

      <div className="relative flex h-full min-h-[180px] flex-col items-center justify-center gap-2 p-6 text-center">
        <span className="rounded-full bg-black/25 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white/90">
          {t("detail.photoBadge")}
        </span>
        <p className="max-w-[24ch] text-sm font-medium leading-snug text-white/95">{street}</p>
        <p className="max-w-[32ch] text-xs text-white/70">{t("detail.photoCaption")}</p>
      </div>
    </div>
  );
}
