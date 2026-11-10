import React, { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import HallPlan from "@/components/seating/HallPlan";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/seating";
import { PLAN_W } from "@/lib/seatingGeometry";

// "Your table" for the guest: the number(s), and a small hall map with the
// guest's table(s) highlighted. Only rendered when the backend sent tables
// (seating on and published), so it always shows the current arrangement.
export default function GuestTableCard({ tables, hallPlan, showNote = true, className = "" }) {
  const t = useT();
  const mapBox = useRef(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    if (!mapBox.current) return undefined;
    const fit = () => setScale(Math.min(1, (mapBox.current?.clientWidth || 300) / PLAN_W));
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(mapBox.current);
    return () => ro?.disconnect();
  }, [hallPlan]);

  if (!tables?.length) return null;
  const split = tables.length > 1;

  return (
    <Card className={`p-5 shadow-lg border-2 border-[#A3762A] space-y-4 ${className}`}>
      {split ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t.yourTables}</p>
          <div className="flex flex-wrap gap-2">
            {tables.map((tb) => (
              <div key={tb.table_id} className="flex items-center gap-2.5 rounded-xl bg-[#F3E8D3] px-3 py-2">
                <span className="min-w-12 h-9 px-2 rounded-lg bg-[#8C6422] text-white flex items-center justify-center font-display text-xl font-bold">
                  {tb.number}
                </span>
                <span className="leading-tight">
                  <strong className="block">{fmt(t.tableNumberLong, { n: tb.number })}</strong>
                  <span className="text-xs text-[#5E4216]">{fmt(t.tableSeatsLong, { n: tb.seats })}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 shrink-0 rounded-full bg-[#8C6422] text-white flex items-center justify-center font-display text-4xl font-bold">
            {tables[0].number}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t.yourTable}</p>
            <p className="text-2xl font-bold">{fmt(t.tableNumberLong, { n: tables[0].number })}</p>
            {(tables[0].zone || tables[0].label) && (
              <p className="text-sm text-muted-foreground">{[tables[0].zone, tables[0].label].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        </div>
      )}

      {hallPlan && (
        <div ref={mapBox} className="w-full overflow-hidden">
          <HallPlan
            tables={hallPlan.tables}
            elements={hallPlan.hall_elements}
            highlight={new Set(tables.map((tb) => tb.table_id))}
            scale={scale}
          />
        </div>
      )}

      {showNote && <p className="text-xs text-muted-foreground text-center">{t.tableAlwaysCurrent}</p>}
    </Card>
  );
}
