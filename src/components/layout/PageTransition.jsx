import { motion, useReducedMotion } from 'framer-motion';

export default function PageTransition({ children }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? {} : { opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </motion.div>
  );
}
