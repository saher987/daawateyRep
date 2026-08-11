import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const history = [];

/**
 * Returns the navigation direction: "forward" or "back"
 * by tracking the browser's history stack manually.
 */
export default function useNavigationDirection() {
  const location = useLocation();
  const directionRef = useRef("forward");

  useEffect(() => {
    const currentPath = location.pathname;
    const prevIndex = history.lastIndexOf(currentPath);

    if (prevIndex !== -1 && prevIndex < history.length - 1) {
      directionRef.current = "back";
      history.splice(prevIndex + 1);
    } else {
      directionRef.current = "forward";
      if (history[history.length - 1] !== currentPath) {
        history.push(currentPath);
      }
    }
  }, [location.pathname]);

  return directionRef.current;
}