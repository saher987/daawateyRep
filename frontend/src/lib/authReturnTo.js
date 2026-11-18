// Where to go after sign-in. A signed-out visitor who opens a protected page
// (e.g. daawatey.com/my-business from the providers ad) is sent to /login;
// without this they landed on "/" afterwards and lost the page they came
// for. Set by ProtectedRoute's RedirectToLogin and base44.auth.redirectToLogin,
// read by Login/Register once signed in, and kept across AppLayout's
// profile-completion detour until Profile finishes it.
// sessionStorage: only this tab, and gone when it closes.
const KEY = "daawatey.returnTo";

// Pages a return could loop back into, or that mean nothing after sign-in.
const SKIP = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/profile"];

// Same-origin paths only ("/x", never "//host" or "https://…"), so a crafted
// value can't send someone off-site after they sign in.
function toSafePath(target) {
  if (!target) return null;
  let path = String(target);
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    path = url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (SKIP.includes(path.split(/[?#]/)[0])) return null;
  return path;
}

export function rememberReturnTo(target) {
  const path = toSafePath(target);
  if (!path) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Storage blocked: sign-in still works, it just lands on "/".
  }
}

export function peekReturnTo() {
  try {
    return toSafePath(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function takeReturnTo() {
  const path = peekReturnTo();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  return path;
}
