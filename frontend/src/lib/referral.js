// Affiliate referral codes (backend app/routers/affiliates.py). A visitor
// who opens daawatey.com/r/<code> (ReferralLanding) may not sign in or
// request an event right away, so the code waits here for 60 days, the
// program's referral window. RequestEventDialog fills it in, and
// AuthContext claims it for the phone once someone signs in.
const KEY = "daawatey.referralCode";
const WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export function saveReferralCode(code) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: String(code).trim().toUpperCase(), at: Date.now() }));
  } catch {
    // Storage blocked: the code can still be typed on the request form.
  }
}

export function getReferralCode() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!saved?.code) return null;
    if (Date.now() - saved.at > WINDOW_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return saved.code;
  } catch {
    return null;
  }
}

export function clearReferralCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
