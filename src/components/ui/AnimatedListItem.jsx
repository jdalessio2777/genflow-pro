import { motion, useReducedMotion } from 'framer-motion';

export default function AnimatedListItem({ children, index = 0, className }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      // Opacity-only fade — see PageTransition.jsx for why an active `y` transform
      // right under the user's thumb causes the same dropped-first-touchmove bug.
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 0.18,
        delay: reduced ? 0 : Math.min(index * 0.04, 0.28),
        ease: 'easeOut',
      }}
      style={{ touchAction: 'pan-y' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
