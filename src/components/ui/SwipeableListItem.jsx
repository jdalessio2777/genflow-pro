import { useRef, useState, useCallback } from "react";

/**
 * SwipeableListItem — native touch swipe with left-only reveal.
 *
 * Props:
 *   children        — the list item content
 *   leftActions     — array of action objects (currently unused, reserved)
 *   rightActions    — array of { label, icon, color, onAction }
 *   threshold       — px to swipe before revealing actions (default 72)
 */
export default function SwipeableListItem({
  children,
  leftActions = [],
  rightActions = [],
  threshold = 72,
}) {
  const containerRef = useRef(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isOpenRef = useRef(false);
  const directionLockedRef = useRef(null); // 'horizontal' | 'vertical' | null
  const [translateX, setTranslateX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const actionCount = rightActions.length;
  const actionWidth = 72; // px per action button
  const totalActionWidth = actionCount * actionWidth;

  const snapTo = useCallback((x, open) => {
    setIsAnimating(true);
    setTranslateX(x);
    isOpenRef.current = open;
    setTimeout(() => setIsAnimating(false), 300);
  }, []);

  const close = useCallback(() => {
    snapTo(0, false);
  }, [snapTo]);

  const handleTouchStart = useCallback((e) => {
    if (actionCount === 0) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    currentXRef.current = isOpenRef.current ? -totalActionWidth : 0;
    isDraggingRef.current = true;
    directionLockedRef.current = null;
    setIsAnimating(false);
  }, [actionCount, totalActionWidth]);

  const handleTouchMove = useCallback((e) => {
    if (!isDraggingRef.current || actionCount === 0) return;

    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    // Lock direction on first significant movement
    if (!directionLockedRef.current) {
      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // Vertical scroll — cancel tracking entirely
        directionLockedRef.current = "vertical";
        isDraggingRef.current = false;
        return;
      }
      directionLockedRef.current = "horizontal";
    }

    if (directionLockedRef.current === "vertical") return;

    const baseX = isOpenRef.current ? -totalActionWidth : 0;
    const rawX = baseX + deltaX;

    // Clamp: never go right of 0, never go past totalActionWidth left
    const clamped = Math.max(-totalActionWidth, Math.min(0, rawX));

    // Prevent native scroll only when clearly swiping horizontally
    if (Math.abs(deltaX) > 5) {
      e.preventDefault();
    }

    currentXRef.current = clamped;
    setTranslateX(clamped);
  }, [actionCount, totalActionWidth]);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current || actionCount === 0) return;
    isDraggingRef.current = false;

    if (directionLockedRef.current === "vertical") return;

    const x = currentXRef.current;

    if (isOpenRef.current) {
      // Already open: close if swiped back more than halfway
      if (x > -totalActionWidth / 2) {
        snapTo(0, false);
      } else {
        snapTo(-totalActionWidth, true);
      }
    } else {
      // Was closed: open if dragged past threshold
      if (x < -threshold) {
        snapTo(-totalActionWidth, true);
      } else {
        snapTo(0, false);
      }
    }
  }, [actionCount, totalActionWidth, threshold, snapTo]);

  // Tap on content when open — close the drawer
  const handleContentClick = useCallback((e) => {
    if (isOpenRef.current) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }, [close]);

  if (actionCount === 0) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl"
      style={{ touchAction: "pan-y" }}
    >
      {/* Action buttons revealed on the right side */}
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: totalActionWidth }}
      >
        {rightActions.map((action, i) => (
          <button
            key={i}
            className={`flex flex-col items-center justify-center gap-1 flex-1 ${action.color} active:brightness-90`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              close();
              action.onAction();
            }}
          >
            {action.icon}
            <span className="text-[10px] font-bold text-white uppercase tracking-wide">
              {action.label}
            </span>
          </button>
        ))}
      </div>

      {/* Draggable content layer */}
      <div
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating ? "transform 0.3s ease" : "none",
          willChange: "transform",
          position: "relative",
          zIndex: 1,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
