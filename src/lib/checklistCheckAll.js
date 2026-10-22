// "Check all" (Run 8, B1) shows on EVERY checklist type with checkbox items
// while it is being filled out, and never on a completed one (its screen,
// print, PDF or email). Run 4 only showed it when the checklist's name
// matched "Annual Maintenance".
export function shouldShowCheckAll(doc, checkboxCount) {
  return !!doc && doc.status !== "completed" && checkboxCount > 0;
}
