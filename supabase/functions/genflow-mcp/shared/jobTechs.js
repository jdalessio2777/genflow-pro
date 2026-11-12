// Who is on a job (Run 12, A7). Pure, no app imports (used by emails, the calendar,
// finance on the server, and the connector).
//
// jobs.assigned_techs is the list of first names; its FIRST name is the lead, kept
// in jobs.assigned_to_name by a database trigger. Rows and older app copies that
// only know assigned_to_name still read correctly here.
export const TECHS = ["Jeremy", "Alex", "Derek", "Sean"];

const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] || "";

// In stored order, lead first, no blanks or repeats.
export function jobTechs(job) {
  const list = Array.isArray(job?.assigned_techs) ? job.assigned_techs : [];
  const names = list.map(firstName).filter(Boolean);
  if (!names.length && job?.assigned_to_name) names.push(firstName(job.assigned_to_name));
  return [...new Set(names)];
}

export function isSharedJob(job) {
  return jobTechs(job).length > 1;
}

// In the app's usual order, so it reads the same whoever was picked first.
function displayOrder(names) {
  const rank = (n) => { const i = TECHS.indexOf(n); return i === -1 ? TECHS.length : i; };
  return [...names].sort((a, b) => rank(a) - rank(b));
}

// "Jeremy", "Jeremy & Alex", "Jeremy, Alex & Derek"; "" when nobody is assigned.
export function techsLabel(job) {
  const names = displayOrder(jobTechs(job));
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function jobHasTech(job, name) {
  return jobTechs(job).includes(firstName(name));
}

// "My jobs" filters: unassigned jobs show for everyone, as before.
export function jobIsFor(job, name) {
  const techs = jobTechs(job);
  return techs.length === 0 || techs.includes(firstName(name));
}

export function sharesTech(a, b) {
  const techs = jobTechs(b);
  return jobTechs(a).some((t) => techs.includes(t));
}

// What to save for a picked list.
export function techsPatch(names) {
  const list = [...new Set((names || []).map(firstName).filter(Boolean))];
  return { assigned_techs: list, assigned_to_name: list[0] || null };
}

// Per-tech reports: each tech on the job gets an equal share of its revenue and
// counts the job once, so a $1,000 shared job shows $500 for each and the techs
// still add up to the company total.
export function techShares(job, amount) {
  const techs = jobTechs(job);
  if (!techs.length) return [{ tech: "Unassigned", amount }];
  return techs.map((tech) => ({ tech, amount: amount / techs.length }));
}

// Mileage: one job is one van and one trip, however many techs ride along. A trip
// is logged against the job's lead tech only, so a route built per tech must skip
// jobs where this returns someone else.
export function tripTech(job) {
  return jobTechs(job)[0] || null;
}
