import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  etIso, etParts, windowLabel, jobTimeLabel, jobDateTimeLabel, calendarEndMs, movedJobPatch, pickerFromJob, appointmentFromPicker, WINDOW_PRESETS,
} from "@/lib/arrivalWindow";
import DateField from "@/components/ui/DateField";

describe("arrival windows (A2)", () => {
  it("ET times across the clock change", () => {
    expect(etIso("2026-07-01", "10:00")).toBe("2026-07-01T14:00:00.000Z");
    expect(etIso("2026-12-01", "10:00")).toBe("2026-12-01T15:00:00.000Z");
    expect(etIso("2026-11-01", "10:00")).toBe("2026-11-01T15:00:00.000Z"); // the day clocks change
    expect(etIso("", "10:00")).toBeNull();
    expect(etParts("2026-12-01T15:00:00.000Z")).toEqual({ date: "2026-12-01", time: "10:00" });
  });
  it("labels", () => {
    const job = { scheduled_date: etIso("2026-11-05", "10:00"), arrival_window_end: etIso("2026-11-05", "12:00") };
    expect(windowLabel(job)).toBe("10 AM – 12 PM");
    expect(windowLabel({ ...job, arrival_window_end: etIso("2026-11-05", "13:30") })).toBe("10 AM – 1:30 PM");
    expect(jobTimeLabel(job)).toBe("10 AM – 12 PM");
    expect(jobDateTimeLabel(job)).toBe("Nov 5, 10 AM – 12 PM");
    expect(windowLabel(job, true)).toBe("10:00 – 12:00");
  });
  it("existing exact-time jobs display their exact time", () => {
    const job = { scheduled_date: etIso("2026-11-05", "10:30"), arrival_window_end: null };
    expect(windowLabel(job)).toBe("");
    expect(jobTimeLabel(job)).toBe("10:30 AM");
    expect(pickerFromJob(job)).toEqual({ date: "2026-11-05", mode: "exact", start: "10:30", end: "" });
    expect(appointmentFromPicker(pickerFromJob(job))).toEqual({ scheduled_date: job.scheduled_date, arrival_window_end: null });
  });
  it("calendar block = window start .. end + estimate; exact = time + estimate", () => {
    const w = { scheduled_date: etIso("2026-11-05", "10:00"), arrival_window_end: etIso("2026-11-05", "12:00") };
    expect(new Date(calendarEndMs(w, 120)).toISOString()).toBe(etIso("2026-11-05", "14:00"));
    expect(new Date(calendarEndMs({ scheduled_date: w.scheduled_date }, 120)).toISOString()).toBe(etIso("2026-11-05", "12:00"));
  });
  it("moving the event in Google moves the window with it", () => {
    const w = { scheduled_date: etIso("2026-11-05", "10:00"), arrival_window_end: etIso("2026-11-05", "12:00") };
    expect(movedJobPatch(w, etIso("2026-11-06", "14:00"))).toEqual({ scheduled_date: etIso("2026-11-06", "14:00"), arrival_window_end: etIso("2026-11-06", "16:00") });
    expect(movedJobPatch({ scheduled_date: w.scheduled_date }, etIso("2026-11-06", "14:00"))).toEqual({ scheduled_date: etIso("2026-11-06", "14:00") });
  });
  it("picker -> appointment", () => {
    expect(WINDOW_PRESETS.map((p) => p.label)).toEqual(["8–10 AM", "10 AM–12 PM", "12–2 PM", "2–4 PM", "4–6 PM"]);
    expect(appointmentFromPicker({ date: "2026-11-05", mode: "10-12" })).toEqual({ scheduled_date: etIso("2026-11-05", "10:00"), arrival_window_end: etIso("2026-11-05", "12:00") });
    expect(appointmentFromPicker({ date: "", mode: "" })).toEqual({ scheduled_date: null, arrival_window_end: null });
    expect(appointmentFromPicker({ date: "2026-11-05", mode: "" }).error).toBe("Pick an arrival window");
    expect(appointmentFromPicker({ date: "2026-11-05", mode: "custom", start: "10:00" }).error).toBe("Pick the window's start and end");
    expect(appointmentFromPicker({ date: "2026-11-05", mode: "custom", start: "12:00", end: "10:00" }).error).toBe("The window must end after it starts");
    expect(appointmentFromPicker({ date: "2026-11-05", mode: "custom", start: "09:30", end: "11:15" })).toEqual({ scheduled_date: etIso("2026-11-05", "09:30"), arrival_window_end: etIso("2026-11-05", "11:15") });
    expect(appointmentFromPicker({ date: "2026-11-05", mode: "exact", start: "" }).error).toBe("Pick the exact time");
    expect(pickerFromJob({ scheduled_date: etIso("2026-11-05", "10:00"), arrival_window_end: etIso("2026-11-05", "12:00") }).mode).toBe("10-12");
    expect(pickerFromJob({ scheduled_date: etIso("2026-11-05", "09:30"), arrival_window_end: etIso("2026-11-05", "11:15") }).mode).toBe("custom");
  });
});

describe("DateField (A1)", () => {
  const Harness = ({ onChange, ...p }) => {
    const [v, setV] = useState("2024-05-01");
    return <DateField aria-label="d" value={v} onChange={(x) => { setV(x); onChange(x); }} {...p} />;
  };
  it("the iOS Reset (an empty value) never changes a saved date", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} clearable />);
    const input = screen.getByLabelText("d");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("2024-05-01");
  });
  it("picking a new date changes it", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("d"), { target: { value: "2025-01-02" } });
    expect(onChange).toHaveBeenCalledWith("2025-01-02");
  });
  it("clearing takes two deliberate taps, and Keep backs out", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} clearable />);
    fireEvent.click(screen.getByTestId("date-clear"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("date-clear-no"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("date-clear"));
    fireEvent.click(screen.getByTestId("date-clear-yes"));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByTestId("date-clear")).toBeNull();
  });
  it("not clearable: no Clear button", () => {
    render(<Harness onChange={() => {}} />);
    expect(screen.queryByTestId("date-clear")).toBeNull();
  });
});
