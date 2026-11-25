/**
 * Pure RFC 5545 (.ics / iCalendar) parser for overlaying Google Calendar
 * or university timetable events onto FocusGate's Visual Time-Blocking timeline.
 */

export interface CalendarBusyEvent {
  uid: string;
  summary: string;
  startHour: number;
  startHhMm: string;
  endHhMm: string;
  durationMinutes: number;
}

function unfoldIcsLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseIcsDateTime(value: string): { dateYmd: string; hour: number; minute: number } | null {
  const trimmed = value.trim();
  // Match YYYYMMDDTHHMMSS(Z)?
  const dtMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(trimmed);
  if (!dtMatch) return null;

  const year = Number(dtMatch[1]);
  const month = Number(dtMatch[2]);
  const day = Number(dtMatch[3]);
  const hour = Number(dtMatch[4]);
  const minute = Number(dtMatch[5]);
  const isUtc = dtMatch[7] === "Z";

  if (isUtc) {
    const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    if (Number.isNaN(d.getTime())) return null;
    // Keep UTC date/hour if caller compares against UTC or local shifted externally
    return {
      dateYmd: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    };
  }

  return {
    dateYmd: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    hour,
    minute,
  };
}

export function parseIcsEventsForDate(icsText: string, targetDateYmd: string): CalendarBusyEvent[] {
  const lines = unfoldIcsLines(icsText);
  const events: CalendarBusyEvent[] = [];

  let inEvent = false;
  let uid = "";
  let summary = "";
  let dtStart = "";
  let dtEnd = "";

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      uid = "";
      summary = "";
      dtStart = "";
      dtEnd = "";
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      const start = parseIcsDateTime(dtStart);
      if (start && start.dateYmd === targetDateYmd) {
        const end = parseIcsDateTime(dtEnd);
        const startTotal = start.hour * 60 + start.minute;
        const endTotal = end ? Math.max(startTotal + 15, end.hour * 60 + end.minute) : startTotal + 60;
        const durationMinutes = Math.min(480, Math.max(15, endTotal - startTotal));
        const endH = Math.min(23, Math.floor((startTotal + durationMinutes) / 60));
        const endM = (startTotal + durationMinutes) % 60;

        events.push({
          uid: uid || `evt-${events.length + 1}`,
          summary: (summary || "Busy").replace(/\\,/g, ",").replace(/\\n/g, " "),
          startHour: start.hour,
          startHhMm: `${String(start.hour).padStart(2, "0")}:${String(start.minute).padStart(2, "0")}`,
          endHhMm: `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`,
          durationMinutes,
        });
      }
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;
    const rawKey = line.slice(0, colonIdx).toUpperCase();
    const key = rawKey.split(";")[0] ?? rawKey;
    const val = line.slice(colonIdx + 1);

    if (key === "UID") uid = val.trim();
    else if (key === "SUMMARY") summary = val.trim();
    else if (key === "DTSTART") dtStart = val.trim();
    else if (key === "DTEND") dtEnd = val.trim();
  }

  return events.sort((a, b) => a.startHhMm.localeCompare(b.startHhMm));
}

export function totalBusyMinutes(events: ReadonlyArray<CalendarBusyEvent>): number {
  return events.reduce((sum, e) => sum + Math.max(0, e.durationMinutes), 0);
}
