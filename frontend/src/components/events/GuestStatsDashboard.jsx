import React from "react";
import { format } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useT } from "@/lib/i18n";
import { downloadFile } from "@/lib/downloadFile";

const COLORS = {
  accepted: "#22c55e",
  declined: "#ef4444",
  pending:  "#f59e0b",
};

function exportToExcel(recipients, eventTitle, t) {
  const rows = recipients.map(r => ({
    [t.colName]: r.external_full_name || r.full_name || "",
    [t.colPhone]: r.phone || "",
    [t.email]: r.email || "",
    [t.colStatus]: r.rsvp_status === "accepted" ? t.statsAccepted : r.rsvp_status === "declined" ? t.statsDeclined : t.statsPending,
    [t.colGuests]: r.rsvp_guests_count || r.guests_count || 1,
    [t.exportMessage]: r.rsvp_message || "",
    [t.exportOpened]: r.last_opened_at ? t.exportYes : t.exportNo,
    [t.groupLabel]: r.group_label || "",
  }));

  // Build CSV content (UTF-8 BOM for Arabic support in Excel)
  const headers = Object.keys(rows[0] || {});
  const csvLines = [
    headers.join(","),
    ...rows.map(row => headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(","))
  ];
  const bom = "\uFEFF";
  const csv = bom + csvLines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadFile(blob, `${eventTitle || t.exportDefaultTitle} - ${t.exportGuestList}.csv`);
}

function exportPendingToExcel(recipients, eventTitle) {
  const pending = recipients.filter(r => r.rsvp_status === "pending" || !r.rsvp_status);
  const headers = ["שם", "טלפון", "אימייל", "קבוצה", "פתח הזמנה", "תאריך פתיחה"];
  const rows = pending.map(r => [
    [r.nickname, r.first_name, r.last_name].filter(Boolean).join(" ") || r.external_full_name || r.full_name || "",
    r.phone || "",
    r.email || "",
    r.group_label || "",
    r.open_count > 0 ? "כן" : "לא",
    r.last_opened_at ? format(new Date(r.last_opened_at), "yyyy/MM/dd HH:mm") : "",
  ]);
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  downloadFile(blob, `${eventTitle} - ממתינים לאישור.csv`);
}

export default function GuestStatsDashboard({ recipients, event }) {
  const t = useT();
  const stats = {
    total: recipients.length,
    accepted: recipients.filter(r => r.rsvp_status === "accepted").length,
    declined: recipients.filter(r => r.rsvp_status === "declined").length,
    pending:  recipients.filter(r => !r.rsvp_status || r.rsvp_status === "pending").length,
    totalGuests: recipients
      .filter(r => r.rsvp_status === "accepted")
      .reduce((sum, r) => sum + (r.rsvp_guests_count || r.guests_count || 1), 0),
    opened:   recipients.filter(r => r.last_opened_at).length,
    notOpened: recipients.filter(r => !r.last_opened_at).length,
  };

  const pieData = [
    { name: t.statsAccepted,  value: stats.accepted, key: "accepted" },
    { name: t.statsDeclined,  value: stats.declined, key: "declined" },
    { name: t.statsPending,   value: stats.pending,  key: "pending"  },
  ].filter(d => d.value > 0);

  const barData = [
    { name: t.statsAccepted,   count: stats.accepted,  fill: COLORS.accepted },
    { name: t.statsDeclined,   count: stats.declined,  fill: COLORS.declined },
    { name: t.statsPending,    count: stats.pending,   fill: COLORS.pending  },
    { name: t.statsOpened,     count: stats.opened,    fill: "#6366f1" },
    { name: t.statsNotOpened,  count: stats.notOpened, fill: "#94a3b8" },
  ];

  const statCards = [
    { label: t.statsTotal,       value: stats.total,       color: "bg-muted/60",       text: "" },
    { label: t.statsAccepted,    value: stats.accepted,    color: "bg-success/10",     text: "text-success" },
    { label: t.statsDeclinedAll, value: stats.declined,    color: "bg-destructive/10", text: "text-destructive" },
    { label: t.statsPending,     value: stats.pending,     color: "bg-warning/10",     text: "text-warning" },
    { label: t.statsTotalGuests, value: stats.totalGuests, color: "bg-primary/10",     text: "text-primary" },
  ];

  return (
    <Card className="p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-lg">{t.guestStatsTitle}</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl"
            onClick={() => exportPendingToExcel(recipients, event?.title)}
          >
            <Download className="w-4 h-4" />
            ייצוא ממתינים
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl"
            onClick={() => exportToExcel(recipients, event?.title, t)}
          >
            <Download className="w-4 h-4" />
            {t.exportExcelBtn}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {statCards.map(s => (
          <div key={s.label} className={`text-center p-3 rounded-xl ${s.color}`}>
            <p className={`text-2xl font-bold font-display ${s.text}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {recipients.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3 text-center">{t.statsRsvpDist}</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${value} ${t.statsGuestUnit}`, name]}
                  contentStyle={{ direction: "rtl", borderRadius: "8px", fontSize: "13px" }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map(d => (
                <div key={d.key} className="flex items-center gap-1.5 text-xs">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS[d.key] }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </div>

          {/* Bar Chart */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3 text-center">{t.statsEngagement}</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  formatter={(value, name) => [`${value}`, t.statsCount]}
                  contentStyle={{ direction: "rtl", borderRadius: "8px", fontSize: "13px" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}