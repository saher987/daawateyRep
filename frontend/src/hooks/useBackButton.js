import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Handles Android hardware back button by pushing a dummy history state
 * and listening for popstate. If a modal/drawer is open (isOpen=true),
 * it calls onClose instead of navigating back.
 */
export function useBackButton({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;

    // Push a state so pressing back triggers popstate instead of leaving the page
    window.history.pushState({ modal: true }, "");

    const handler = (e) => {
      if (isOpen) {
        onClose();
      }
    };

    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
    };
  }, [isOpen, onClose]);
}