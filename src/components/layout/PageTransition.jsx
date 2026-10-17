import { motion, useReducedMotion } from 'framer-motion';

export default function PageTransition({ children }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      // Opacity-only fade-in (no `y` transform, no exit animation): a transform
      // still settling on this wrapper right as a page mounts makes WebKit drop
      // the first scroll touchmove, and an exit animation would delay the next
      // screen (and its scroll restoration).
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </motion.div>
  );
}
