import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { enUS, nl, fr, de, type Locale } from "date-fns/locale";
import i18n from "../i18n";

const LOCALES: Record<string, Locale> = { en: enUS, nl, fr, de };

function locale(): Locale {
  return LOCALES[i18n.language?.slice(0, 2)] ?? enUS;
}

export function fmtDate(iso: string): string {
  return format(new Date(iso), "EEE d MMM yyyy", { locale: locale() });
}
export function fmtTime(iso: string): string {
  return format(new Date(iso), "HH:mm", { locale: locale() });
}
export function fmtDateTime(iso: string): string {
  return format(new Date(iso), "EEE d MMM yyyy, HH:mm", { locale: locale() });
}
export function fmtRange(startIso: string, endIso: string): string {
  return `${fmtTime(startIso)} – ${fmtTime(endIso)}`;
}
export function fmtFullDay(iso: string): string {
  return format(new Date(iso), "EEEE d MMMM yyyy", { locale: locale() });
}
export function fmtRelativeDay(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return i18n.t("dates.today");
  if (isTomorrow(d)) return i18n.t("dates.tomorrow");
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEEE", { locale: locale() });
  return format(d, "EEE d MMM", { locale: locale() });
}
export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
