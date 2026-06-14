import { useState } from "react";
import { Calendar, CalendarPlus, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type CalEvent,
  buildIcs,
  downloadIcs,
  googleCalendarUrl,
  icsFilename,
} from "../lib/calendar";

/**
 * "Add to calendar" button with a popup: Google Calendar (web link), Apple
 * Calendar (.ics download), or a generic .ics download for Android/Outlook.
 */
export function AddToCalendar({
  event,
  className = "",
}: {
  event: CalEvent;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  function download() {
    downloadIcs(icsFilename(event.title), buildIcs(event));
    setOpen(false);
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
      >
        <CalendarPlus size={15} />
        {t("addCal.button")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <a
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Calendar size={14} className="text-slate-400" />
              {t("addCal.google")}
            </a>
            <button
              type="button"
              onClick={download}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Calendar size={14} className="text-slate-400" />
              {t("addCal.apple")}
            </button>
            <button
              type="button"
              onClick={download}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Download size={14} className="text-slate-400" />
              {t("addCal.download")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
