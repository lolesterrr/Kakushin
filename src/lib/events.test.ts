import { describe, expect, it } from "vitest";
import { calendarFile } from "./events";

describe("calendar files", () => {
  const file = calendarFile("Fintech; Hack, 2027", [
    { uid: "a-deadline", title: "Deadline: Fintech; Hack, 2027", start: Date.UTC(2027, 0, 5, 23, 29, 59), end: Date.UTC(2027, 0, 5, 23, 59, 59), description: "Line one\nLine two", url: "https://example.org/x", remindDayBefore: true },
    { uid: "a-event", title: "A very long title that goes on and on so that the line has to be folded for calendar apps to read it é", start: Date.UTC(2027, 1, 1, 9), end: null, location: "Kampala, Uganda" },
  ], Date.UTC(2026, 10, 14));
  const lines = file.split("\r\n");
  it("is a calendar with one entry per date", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
    expect(file).toContain("DTSTART:20270105T232959Z");
    expect(file).toContain("DTEND:20270105T235959Z");
    expect(file.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("escapes text and gives an entry without an end half an hour", () => {
    expect(file).toContain("SUMMARY:Deadline: Fintech\\; Hack\\, 2027");
    expect(file).toContain("DESCRIPTION:Line one\\nLine two");
    expect(file).toContain("LOCATION:Kampala\\, Uganda");
    expect(file).toContain("DTEND:20270201T093000Z");
  });
  it("reminds a day before only where asked, and folds long lines", () => {
    expect(lines.filter((l) => l === "TRIGGER:-P1D")).toHaveLength(1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
});
