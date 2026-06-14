import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Check, Loader2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { geocodeAddress } from "../lib/api";
import { MapPreview } from "./MapPreview";
import type { GeocodeResult } from "../lib/types";

export interface AddressAutocompleteHandle {
  /** Run a lookup for a name/address and open the list. */
  searchFor: (query: string) => void;
}

type Status = "idle" | "searching" | "found" | "empty";

/**
 * Address field with live geocoding: as you type it checks the address against
 * OpenStreetMap, suggests verified matches, and flags an address it can't find.
 * Picking a suggestion writes the canonical address back. Validation is advisory
 * — you can still save a free-text location.
 */
export const AddressAutocomplete = forwardRef<
  AddressAutocompleteHandle,
  {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }
>(function AddressAutocomplete({ value, onChange, placeholder }, ref) {
  const { t } = useTranslation();
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [confirmed, setConfirmed] = useState(false);
  const [coord, setCoord] = useState<{ lat: number; lon: number } | null>(null);
  const seqRef = useRef(0);
  const skipDebounce = useRef(false);

  async function runSearch(text: string, openList: boolean) {
    const query = text.trim();
    if (query.length < 3) {
      setResults([]);
      setStatus("idle");
      setCoord(null);
      return;
    }
    const seq = ++seqRef.current;
    setStatus("searching");
    const res = await geocodeAddress(query).catch(
      () => [] as GeocodeResult[],
    );
    if (seq !== seqRef.current) return; // a newer search superseded this one
    setResults(res);
    setStatus(res.length ? "found" : "empty");
    setCoord(res.length ? { lat: res[0].lat, lon: res[0].lon } : null);
    if (openList && res.length) setOpen(true);
  }

  useImperativeHandle(ref, () => ({
    searchFor: (query: string) => {
      onChange(query);
      setConfirmed(false);
      skipDebounce.current = true; // don't let the debounce re-search
      runSearch(query, true);
    },
  }));

  // Debounced check as the user types (skipped right after a pick or a lookup).
  useEffect(() => {
    if (confirmed) return;
    if (skipDebounce.current) {
      skipDebounce.current = false;
      return;
    }
    const timer = setTimeout(() => runSearch(value, false), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, confirmed]);

  function pick(r: GeocodeResult) {
    onChange(r.display_name);
    setConfirmed(true);
    setStatus("found");
    setCoord({ lat: r.lat, lon: r.lon });
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          className="input pr-9"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setConfirmed(false);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
          {status === "searching" ? (
            <Loader2 size={15} className="animate-spin text-slate-400" />
          ) : confirmed ? (
            <Check size={15} className="text-brand-600" />
          ) : null}
        </span>
      </div>

      {status === "empty" && value.trim().length >= 3 && !confirmed && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle size={12} /> {t("geo.notFound")}
        </p>
      )}
      {confirmed && (
        <p className="mt-1 flex items-center gap-1 text-xs text-brand-600">
          <Check size={12} /> {t("geo.verified")}
        </p>
      )}

      {coord && <MapPreview lat={coord.lat} lon={coord.lon} className="mt-2" />}

      {open && results.length > 0 && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lon},${i}`}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <span className="text-slate-700">{r.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
});
