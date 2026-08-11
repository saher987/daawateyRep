import { useEffect, useRef, useState } from "react";

/**
 * Pull-to-refresh hook for scrollable containers.
 * Returns { containerRef, isRefreshing, pullDistance }
 * Pass onRefresh: async () => void
 */
export default function usePullToRefresh(onRefresh, { threshold = 72 } = {}) {
  const containerRef = useRef(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (el.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        isDragging.current = true;
      }
    };

    const onTouchMove = (e) => {
      if (!isDragging.current || startY.current === null) return;
      const dist = e.touches[0].clientY - startY.current;
      if (dist > 0) {
        e.preventDefault();
        setPullDistance(Math.min(dist * 0.5, threshold * 1.5));
      }
    };

    const onTouchEnd = async () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      if (pullDistance >= threshold) {
        setIsRefreshing(true);
        setPullDistance(0);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      } else {
        setPullDistance(0);
      }
      startY.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh, pullDistance, threshold]);

  return { containerRef, isRefreshing, pullDistance };
}