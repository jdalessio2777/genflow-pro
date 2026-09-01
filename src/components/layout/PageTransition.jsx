import { motion, useReducedMotion } from 'framer-motion';

export default function PageTransition({ children }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      // Opacity-only fade (no `y` transform) — a transform still settling on this
      // wrapper right as a page mounts makes WebKit drop the first scroll touchmove.
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? {} : { opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{ willChange: 'opacity', touchAction: 'pan-y' }}
    >
      {children}
    </motion.div>
  );
}
