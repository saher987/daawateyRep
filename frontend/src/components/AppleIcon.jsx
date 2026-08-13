// Apple's logo mark, monochrome (currentColor) — same convention as
// GoogleIcon.jsx alongside it, but Apple's Human Interface Guidelines
// specify the glyph as a single solid color following the button's own
// text color, not brand-colored like Google's.
import React from "react";

export default function AppleIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.926 2.71-3.443 2.71-1.517 0-1.914-.88-3.66-.88-1.9 0-2.494.86-3.9.91-1.478.05-2.6-1.44-3.55-2.78-1.943-2.75-3.43-7.78-1.44-11.18.98-1.68 2.75-2.74 4.67-2.77 1.45-.03 2.82.98 3.66.98.85 0 2.5-1.21 4.22-1.03.72.03 2.73.29 4.02 2.19-.1.07-2.4 1.4-2.38 4.18.03 3.32 2.91 4.43 2.94 4.44z" />
    </svg>
  );
}
