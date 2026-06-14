import { Star } from "lucide-react";

/**
 * A 1-5 star control. Interactive by default; pass `readOnly` to display only.
 * Tapping the current value again clears it (sets null).
 */
export function StarRating({
  value,
  onChange,
  size = 20,
  readOnly = false,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  size?: number;
  readOnly?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => {
        const filled = value != null && s <= value;
        const star = (
          <Star
            size={size}
            className={
              filled ? "fill-brand-500 text-brand-500" : "text-slate-300"
            }
          />
        );
        if (readOnly) return <span key={s}>{star}</span>;
        return (
          <button
            key={s}
            type="button"
            aria-label={`${s}`}
            onClick={() => onChange?.(value === s ? null : s)}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}
