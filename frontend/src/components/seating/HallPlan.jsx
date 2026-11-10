import React, { useRef } from "react";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/i18nSeating";
import { HALL_STYLE, PLAN_H, PLAN_W, hallLabel, tableGeometry } from "@/lib/seatingGeometry";

const STATE_STYLE = {
  empty: { bg: "#FFFFFF", bd: "#D8CFBF", fg: "#171C26", sub: "#5F6673" },
  partial: { bg: "#F3E8D3", bd: "#A3762A", fg: "#171C26", sub: "#5E4216" },
  full: { bg: "#8C6422", bd: "#8C6422", fg: "#FFFFFF", sub: "#F3E8D3" },
};

// The hall drawn at plan scale: tables (chairs as dots) and hall elements.
// Used three ways:
//  - host "seat guests": tap a table (onTableClick), outlines per table
//  - host "edit layout": drag tables/elements (onDragStart/Move/End)
//  - guest mini map: read-only, `highlight` = the guest's table ids, scaled
// `decorate(table)` lets the caller override outline/opacity per table.
export default function HallPlan({
  tables,
  elements,
  seatedByTable = {},
  highlight,
  selectedId,
  layoutMode = false,
  decorate,
  onTableClick,
  onElementClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  scale = 1,
  showGrid = false,
}) {
  const t = useT();
  const planRef = useRef(null);
  const readOnly = !!highlight;

  const pointerDown = (kind, item) => (e) => {
    if (!layoutMode || !onDragStart) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* older WebViews */
    }
    const rect = planRef.current.getBoundingClientRect();
    onDragStart({ kind, id: item.id, startX: e.clientX, startY: e.clientY, ox: item.x, oy: item.y, factor: PLAN_W / rect.width });
  };

  return (
    <div
      ref={planRef}
      dir="ltr"
      onPointerMove={layoutMode ? onDragMove : undefined}
      onPointerUp={layoutMode ? onDragEnd : undefined}
      onPointerCancel={layoutMode ? onDragEnd : undefined}
      className="relative mx-auto select-none rounded-xl border border-dashed border-[#D8CFBF] bg-[#FBFAF7]"
      style={{
        width: PLAN_W * scale,
        height: PLAN_H * scale,
        backgroundImage: showGrid ? "radial-gradient(circle, #CFC5B3 1px, transparent 1.2px)" : "none",
        backgroundSize: `${20 * scale}px ${20 * scale}px`,
      }}
      role={readOnly ? "img" : undefined}
      aria-label={readOnly ? t.hallMapLabel : undefined}
    >
      <div style={{ width: PLAN_W, height: PLAN_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0 }}>
        {elements.map((el) => {
          const st = HALL_STYLE[el.kind] || HALL_STYLE.other;
          const deco = decorate?.(el, "element") || {};
          const Tag = readOnly ? "div" : "button";
          return (
            <Tag
              key={el.id}
              type={readOnly ? undefined : "button"}
              disabled={readOnly ? undefined : !layoutMode}
              onPointerDown={pointerDown("element", el)}
              onClick={layoutMode && onElementClick ? () => onElementClick(el) : undefined}
              aria-label={hallLabel(el, t)}
              className="absolute flex items-center justify-center text-center font-semibold"
              style={{
                left: el.x - el.w / 2,
                top: el.y - el.h / 2,
                width: el.w,
                height: el.h,
                background: st.bg,
                color: st.fg,
                border: st.border,
                borderTop: st.borderTop,
                borderRadius: st.radius,
                fontSize: readOnly ? 18 : 13,
                boxShadow: deco.shadow || "none",
                cursor: layoutMode ? "grab" : "default",
                touchAction: layoutMode ? "none" : "auto",
                opacity: 1,
              }}
            >
              {hallLabel(el, t)}
            </Tag>
          );
        })}

        {tables.map((tb) => {
          const g = tableGeometry(tb);
          const cap = tb.capacity ?? 0;
          const seated = seatedByTable[tb.id] ?? tb.seated ?? 0;
          const mine = highlight?.has(tb.id);
          let state = seated <= 0 ? "empty" : seated >= cap ? "full" : "partial";
          if (readOnly) state = mine ? "full" : "empty";
          const base = STATE_STYLE[state];
          const deco = decorate?.(tb, "table") || {};
          const border = deco.border || (selectedId === tb.id ? "2px solid #3C6FB0" : `2px solid ${base.bd}`);
          const shadow = deco.shadow || (selectedId === tb.id ? "0 0 0 4px rgba(60,111,176,0.32)" : mine ? "0 0 0 6px rgba(163,118,42,0.3)" : "none");
          const Tag = readOnly ? "div" : "button";
          return (
            <Tag
              key={tb.id}
              type={readOnly ? undefined : "button"}
              onPointerDown={pointerDown("table", tb)}
              onClick={!layoutMode && onTableClick ? () => onTableClick(tb) : layoutMode && onTableClick ? () => onTableClick(tb, true) : undefined}
              aria-label={readOnly ? undefined : `${fmt(t.tableLabel, { n: tb.number })} · ${fmt(t.tableSeatsSummary, { seated, cap })}`}
              className="absolute p-0 border-0 bg-transparent"
              style={{
                left: tb.x - g.fw / 2,
                top: tb.y - g.fh / 2,
                width: g.fw,
                height: g.fh,
                opacity: deco.opacity ?? 1,
                cursor: layoutMode ? "grab" : readOnly ? "default" : "pointer",
                touchAction: layoutMode ? "none" : "manipulation",
              }}
            >
              {!readOnly &&
                g.dots.map((d, i) => (
                  <span
                    key={i}
                    className="absolute rounded-full"
                    style={{ left: d.x, top: d.y, width: 10, height: 10, background: i < seated ? "#8C6422" : "#D8CFBF" }}
                  />
                ))}
              <span
                className="absolute flex flex-col items-center justify-center leading-none"
                style={{
                  left: g.sx,
                  top: g.sy,
                  width: g.sw,
                  height: g.sh,
                  borderRadius: g.radius,
                  background: base.bg,
                  border,
                  boxShadow: shadow,
                  color: base.fg,
                  boxSizing: "border-box",
                }}
              >
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: readOnly ? 26 : tb.rotation === 90 && tb.shape !== "round" ? 18 : 22, fontWeight: 700 }}>
                  {tb.number}
                </span>
                {!readOnly && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: base.sub, marginTop: 2 }}>
                    {seated}/{cap}
                  </span>
                )}
              </span>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
