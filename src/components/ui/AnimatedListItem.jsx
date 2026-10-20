// List row wrapper. Feel Phase 3: was a framer-motion component per row with
// a staggered fade (up to 280 ms delay) — on a 200-row Jobs list that was the
// biggest part of the 1.5 s tap-to-usable at 4x CPU (F-16). Now a plain div
// with a short CSS opacity fade (compositor-only, no JS per frame, no
// stagger), skipped under reduced motion. `index` is kept for callers.
// eslint-disable-next-line no-unused-vars
export default function AnimatedListItem({ children, index = 0, className }) {
  return (
    <div className={className ? `list-fade ${className}` : "list-fade"} style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  );
}
