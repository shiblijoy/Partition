/** Google Calendar "add event" link for a meeting notice (1 hour long). */
export function calendarLink(title: string, start: Date, place?: string | null, details?: string): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${fmt(start)}/${fmt(end)}` });
  if (place) params.set("location", place);
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params}`;
}
