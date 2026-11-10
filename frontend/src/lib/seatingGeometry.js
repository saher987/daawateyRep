// Hall-plan geometry shared by the host's seating page and the guest's mini
// map. Plan units: a fixed 760x560 plan (the backend uses the same units and
// the same footprint rules in app/routers/seating.py, so overlap checks
// agree on both sides).

export const PLAN_W = 760;
export const PLAN_H = 560;
export const SNAP = 10;

export function tableCapacity(t) {
  if (t.shape === "round") return t.seats_round;
  return (t.seats_top || 0) + (t.seats_bottom || 0) + (t.seats_left || 0) + (t.seats_right || 0);
}

// Footprint (chairs included), the table top inside it, and one dot per
// chair — all relative to the footprint's top-left corner.
export function tableGeometry(t) {
  if (t.shape === "round") {
    const c = t.seats_round;
    const dots = [];
    for (let i = 0; i < c; i++) {
      const a = (i / c) * 2 * Math.PI - Math.PI / 2;
      dots.push({ x: Math.round(56 + 48 * Math.cos(a) - 5), y: Math.round(56 + 48 * Math.sin(a) - 5) });
    }
    return { fw: 112, fh: 112, sx: 18, sy: 18, sw: 76, sh: 76, radius: "50%", dots };
  }
  const top = t.seats_top || 0;
  const bottom = t.seats_bottom || 0;
  const n = Math.max(top, bottom, 1);
  const L = n * 24 + 12;
  const fw = L + 40;
  const fh = 80;
  const along = (count) => {
    // Spread `count` chairs along a side of length for n chairs, centred.
    const offset = ((n - count) * 24) / 2;
    return Array.from({ length: count }, (_, i) => 38 + offset + 24 * i - 5);
  };
  const pts = [];
  along(top).forEach((x) => pts.push({ x, y: 5 }));
  along(bottom).forEach((x) => pts.push({ x, y: 65 }));
  // One end chair sits in the middle of the end; two sit side by side.
  const endChairs = (count, x) => {
    if (count === 1) pts.push({ x, y: 35 });
    if (count >= 2) pts.push({ x, y: 27 }, { x, y: 43 });
  };
  endChairs(t.seats_left || 0, 5);
  endChairs(t.seats_right || 0, fw - 15);
  const g = { fw, fh, sx: 20, sy: 20, sw: L, sh: 40, radius: "8px", dots: pts };
  if (t.rotation === 90) {
    return { fw: fh, fh: fw, sx: 20, sy: 20, sw: 40, sh: L, radius: "8px", dots: pts.map((p) => ({ x: p.y, y: p.x })) };
  }
  return g;
}

export function tableBox(t) {
  const g = tableGeometry(t);
  const inset = 4;
  return { l: t.x - g.fw / 2 + inset, t: t.y - g.fh / 2 + inset, r: t.x + g.fw / 2 - inset, b: t.y + g.fh / 2 - inset };
}

export function elementBox(e) {
  return { l: e.x - e.w / 2, t: e.y - e.h / 2, r: e.x + e.w / 2, b: e.y + e.h / 2 };
}

export function boxesHit(a, b) {
  return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
}

export function snapClamp(value, size, limit) {
  const half = Math.ceil(size / 2);
  const lo = Math.ceil(half / SNAP) * SNAP;
  const hi = Math.max(lo, Math.floor((limit - half) / SNAP) * SNAP);
  return Math.max(lo, Math.min(hi, Math.round(value / SNAP) * SNAP));
}

// Which items overlap something else — red outlines in "edit layout".
export function overlaps(tables, elements) {
  const tb = tables.map(tableBox);
  const eb = elements.map(elementBox);
  const tableIds = new Set();
  const elementIds = new Set();
  tables.forEach((t, i) => {
    if (tb.some((b, j) => j !== i && boxesHit(b, tb[i])) || eb.some((b) => boxesHit(b, tb[i]))) tableIds.add(t.id);
  });
  elements.forEach((e, i) => {
    if (tb.some((b) => boxesHit(b, eb[i])) || eb.some((b, j) => j !== i && boxesHit(b, eb[i]))) elementIds.add(e.id);
  });
  return { tableIds, elementIds };
}

export const HALL_STYLE = {
  stage: { bg: "#171C26", fg: "#FFFFFF", border: "none", borderTop: "none", radius: "10px" },
  buffet: { bg: "#EFE4D0", fg: "#5E4216", border: "none", borderTop: "none", radius: "8px" },
  photo: { bg: "#EFE4D0", fg: "#5E4216", border: "none", borderTop: "none", radius: "8px" },
  other: { bg: "#E9EEF5", fg: "#1F3F6B", border: "none", borderTop: "none", radius: "8px" },
  dance_floor: {
    bg: "repeating-conic-gradient(#EFE9DE 0% 25%, #F7F3EC 0% 50%) 0 0 / 40px 40px",
    fg: "#5F6673",
    border: "1px solid #E6E0D6",
    borderTop: "1px solid #E6E0D6",
    radius: "12px",
  },
  entrance: { bg: "transparent", fg: "#171C26", border: "none", borderTop: "4px solid #171C26", radius: "0" },
};

export function hallLabel(element, t) {
  if (element.label) return element.label;
  return (
    {
      stage: t.hallStage,
      dance_floor: t.hallDanceFloor,
      buffet: t.hallBuffet,
      entrance: t.hallEntrance,
      photo: t.hallPhoto,
    }[element.kind] || t.hallOther
  );
}
