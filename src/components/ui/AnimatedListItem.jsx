import { motion, useReducedMotion } from 'framer-motion';

export default function AnimatedListItem({ children, index = 0, className }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.18,
        delay: reduced ? 0 : Math.min(index * 0.04, 0.28),
        ease: 'easeOut',
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
