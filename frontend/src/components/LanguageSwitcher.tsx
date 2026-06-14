import { useState } from "react";
import { Check, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type Language } from "../i18n";

const SHORT: Record<Language, string> = { en: "EN", nl: "NL", fr: "FR", de: "DE" };

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = (i18n.language?.slice(0, 2) as Language) || "en";

  function pick(lng: Language) {
    i18n.changeLanguage(lng);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t("language.label")}
        className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <Globe size={compact ? 18 : 16} />
        {!compact && <span>{SHORT[current] ?? "EN"}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("language.label")}
            </p>
            {SUPPORTED_LANGUAGES.map((lng) => (
              <button
                key={lng}
                onClick={() => pick(lng)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  current === lng ? "font-semibold text-brand-700" : "text-slate-700"
                }`}
              >
                {t(`language.${lng}`)}
                {current === lng && <Check size={15} className="text-brand-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
