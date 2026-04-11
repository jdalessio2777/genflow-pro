import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function useSwipeBack(targetRoute) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!targetRoute) return;

    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (touchStartX < 40 && dx > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
        navigate(targetRoute);
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [targetRoute, navigate]);
}