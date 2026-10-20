// Fade-in only, no exit wait: the next screen mounts at once, so scroll
// restoration and the first touch see the real page. Opacity-only (a
// transform still settling on this wrapper right as a page mounts makes
// WebKit drop the first scroll touchmove). Plain CSS since Feel Phase 3 —
// no framer-motion on the path of every navigation; reduced motion is
// handled in index.css.
export default function PageTransition({ children }) {
  return (
    <div className="page-fade" style={{ touchAction: 'pan-y' }}>
      {children}
    </div>
  );
}
