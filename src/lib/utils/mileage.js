// mileage_logs.vehicle_id is a nullable uuid. The vehicle pickers use "" for
// "none chosen", which Postgres rejects ("invalid input syntax for type
// uuid") — with no vehicles set up, no trip could be logged at all (D-14).
export function mileageLogPayload(data) {
  return {
    ...data,
    vehicle_id: data.vehicle_id || null,
    vehicle_name: data.vehicle_name || null,
  };
}
