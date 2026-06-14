import { useState } from "react";
import { Navigation } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MAP_PROVIDERS } from "../lib/maps";

/**
 * A single "Open in maps" button that opens a small popup letting the user pick
 * Google Maps, Waze or Apple Maps for directions to a free-text location.
 */
export function MapLinks({
  query,
  className = "",
}: {
  query: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trimmed = query?.trim();
  if (!trimmed) return null;

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
      >
        <Navigation size={12} />
        {t("maps.open")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("maps.choose")}
            </p>
            {MAP_PROVIDERS.map((p) => (
              <a
                key={p.key}
                href={p.url(trimmed)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Navigation size={14} className="text-slate-400" />
                {t(`maps.${p.key}`)}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
