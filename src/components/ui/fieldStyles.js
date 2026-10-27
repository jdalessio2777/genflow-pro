// One form-field look for every single-line field (Run 9, B1): text inputs,
// date/time inputs, number inputs and select triggers all share it — same
// 44 pt height, 12 px corners, 12 px side padding, 16 px left-aligned text,
// and they never grow past their column (min-w-0), so two fields side by side
// (Date | Amount) can't run into each other. Textareas use FIELD_BOX (the same
// border/corners/padding) with their own height.
export const FIELD_BOX =
  "w-full min-w-0 rounded-xl border border-input bg-transparent px-3 text-base text-left shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export const FIELD = `${FIELD_BOX} flex h-11 min-h-11 items-center py-1 leading-6`;
