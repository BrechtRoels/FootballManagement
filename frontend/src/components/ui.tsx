import { type ReactNode, useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { initials } from "../lib/format";

/**
 * KSV Jabbeke crest. Prefers the official raster logo at /logo.png (drop the
 * file into frontend/public/), and falls back to the bundled SVG crest.
 */
export function Logo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState("/logo.png");
  return (
    <img
      src={src}
      onError={() => src !== "/logo.svg" && setSrc("/logo.svg")}
      alt="KSV Jabbeke"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={clsx("object-contain", className)}
    />
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={clsx("card", className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600",
        className,
      )}
    />
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Accent palette is limited to the KSV Jabbeke brand colours (red / grey / black)
// on white. `green`/`amber`/`red` remain available for functional status
// (availability traffic-light); legacy `blue`/`purple` map onto brand greys.
const badgeColors: Record<string, string> = {
  brand: "bg-brand-100 text-brand-700",
  steel: "bg-steel-100 text-steel-700",
  ink: "bg-ink-200 text-ink-800",
  slate: "bg-slate-100 text-slate-600",
  // functional status (amber = "maybe", red = cancelled)
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  // legacy keys → on-brand fallbacks (no green/blue/purple accents remain)
  green: "bg-brand-100 text-brand-700",
  blue: "bg-steel-100 text-steel-700",
  purple: "bg-ink-200 text-ink-800",
};

export function Badge({
  children,
  color = "slate",
  className,
}: {
  children: ReactNode;
  color?: keyof typeof badgeColors;
  className?: string;
}) {
  return (
    <span className={clsx("badge", badgeColors[color], className)}>
      {children}
    </span>
  );
}

export function Avatar({
  name,
  size = 36,
}: {
  name: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div
        className={clsx(
          "card my-8 w-full",
          size === "lg" ? "max-w-2xl" : "max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
