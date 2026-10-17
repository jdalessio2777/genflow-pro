import { describe, it, expect } from "vitest";
import { mileageLogPayload } from "@/lib/utils/mileage";

describe("D-14 mileage with no vehicles", () => {
  it('sends null, not "", for a missing vehicle', () => {
    expect(mileageLogPayload({ miles: 3, vehicle_id: "", vehicle_name: "" })).toMatchObject({ miles: 3, vehicle_id: null, vehicle_name: null });
    expect(mileageLogPayload({ vehicle_id: "v1", vehicle_name: "Van" })).toMatchObject({ vehicle_id: "v1", vehicle_name: "Van" });
  });
});
