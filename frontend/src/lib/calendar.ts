export interface CalEvent {
  uid: string;
  title: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  location?: string | null;
  details?: string | null;
}

/** ISO datetime -> iCalendar UTC basic format, e.g. 20260614T150000Z. */
function toIcsUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Escape a text value per RFC 5545 (commas, semicolons, backslashes, newlines). */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** A "click to add to Google Calendar" URL. */
export function googleCalendarUrl(e: CalEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${toIcsUtc(e.start)}/${toIcsUtc(e.end)}`,
  });
  if (e.details) params.set("details", e.details);
  if (e.location) params.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** A downloadable .ics file body (opens in Apple Calendar, Outlook, Android…). */
export function buildIcs(e: CalEvent): string {
  const dtStart = toIcsUtc(e.start);
  const dtEnd = toIcsUtc(e.end);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KSV Jabbeke//Clubplatform//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${dtStart}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${esc(e.title)}`,
  ];
  if (e.details) lines.push(`DESCRIPTION:${esc(e.details)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

/** Safe filename from a title, e.g. "Tuesday Training" -> "tuesday-training.ics". */
export function icsFilename(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "event";
  return `${base}.ics`;
}

/** Trigger a browser download of an .ics file. */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
