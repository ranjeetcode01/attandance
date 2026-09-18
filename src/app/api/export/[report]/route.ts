import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { STATUS_LABEL } from "@/lib/attendance";
import { apiUser, MANAGER_ROLES } from "@/lib/auth";
import { FLAG_INFO } from "@/lib/defaults";
import { dailyRegister, labourSheetsReport, musterReport, projectCostReport } from "@/lib/reports";
import { fmtDate, isDateStr, istDateTime, istTime, monthDays, todayIST } from "@/lib/time";

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function styleHeader(ws: ExcelJS.Worksheet, rowNo = 1) {
  const row = ws.getRow(rowNo);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[report]">) {
  const user = await apiUser(MANAGER_ROLES);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { report } = await ctx.params;
  const q = request.nextUrl.searchParams;
  const today = todayIST();
  const month = q.get("month") ?? today.slice(0, 7);
  const days = /^\d{4}-\d{2}$/.test(month) ? monthDays(month) : monthDays(today.slice(0, 7));
  const from = isDateStr(q.get("from")) ? q.get("from")! : days[0];
  const to = isDateStr(q.get("to")) ? q.get("to")! : days[days.length - 1];
  const filter = { projectId: num(q.get("project")), siteId: num(q.get("site")) };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Site Attendance";
  let filename = `${report}.xlsx`;

  if (report === "muster") {
    const data = await musterReport(from, to, filter);
    const ws = wb.addWorksheet("Muster");
    ws.addRow(["Code", "Name", "Designation", ...data.days.map((d) => `${d.slice(8)}`), "P", "HD", "MO", "A", "L", "H", "WO", "Late", "Work hrs", "OT hrs", "Worked days", "Paid days"]);
    styleHeader(ws);
    for (const r of data.rows) {
      ws.addRow([
        r.user.empCode,
        r.user.name,
        r.user.designation,
        ...r.cells.map((c) => (c.status === "ON" ? "P" : c.status)),
        r.totals.P,
        r.totals.HD,
        r.totals.MO,
        r.totals.A,
        r.totals.L,
        r.totals.H,
        r.totals.WO,
        r.totals.late,
        round(r.totals.workMin / 60, 1),
        round(r.totals.otMin / 60, 1),
        r.totals.worked,
        r.totals.paid,
      ]);
    }
    ws.columns.forEach((c, i) => (c.width = i < 3 ? 18 : i < 3 + data.days.length ? 4.5 : 9));
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
    ws.addRow([]);
    ws.addRow(["Legend: P Present · HD Half day · MO Missed OUT (half day) · SH Short hours · A Absent · L Leave · H Holiday · WO Week off"]);
    filename = `muster_${from}_to_${to}.xlsx`;
  } else if (report === "daily") {
    const date = isDateStr(q.get("date")) ? q.get("date")! : today;
    const data = await dailyRegister(date, filter);
    const ws = wb.addWorksheet("Daily register");
    ws.addRow(["Code", "Name", "Designation", "Status", "First IN", "Last OUT", "Work", "Late (min)", "OT (min)", "Punches", "Flags"]);
    styleHeader(ws);
    for (const r of data.rows) {
      ws.addRow([
        r.user.empCode,
        r.user.name,
        r.user.designation,
        STATUS_LABEL[r.summary.status],
        r.summary.firstIn ? istTime(r.summary.firstIn) : "",
        r.summary.lastOut ? istTime(r.summary.lastOut) : "",
        round(r.summary.workMin / 60, 2),
        r.summary.lateMin || "",
        r.summary.otMin || "",
        r.punches.map((p) => `${p.type} ${istTime(p.punchTime)} ${p.siteName}${p.workArea ? ` (${p.workArea})` : ""} [${p.reviewStatus}]`).join("\n"),
        [...new Set(r.punches.flatMap((p) => p.flags))].map((f) => FLAG_INFO[f]?.label ?? f).join(", "),
      ]);
    }
    ws.columns.forEach((c, i) => (c.width = [10, 22, 18, 12, 9, 9, 7, 9, 8, 60, 40][i]));
    filename = `daily_${date}.xlsx`;
  } else if (report === "labour") {
    const { sheets } = await labourSheetsReport(from, to, { ...filter, contractorId: num(q.get("contractor")) });
    const ws = wb.addWorksheet("Labour sheets");
    ws.addRow(["Date", "Project", "Site", "Contractor", "Marked by", "Marked at", "Present", "Absent", "Man-days", "Wage cost ₹", "PPE", "Toolbox talk", "Status", "Trades"]);
    styleHeader(ws);
    for (const s of sheets) {
      ws.addRow([
        fmtDate(s.workDate),
        s.site?.projectName ?? "",
        s.site?.name ?? "",
        s.contractorName,
        s.markedByName,
        istDateTime(s.punchTime),
        s.present,
        s.absent,
        s.manDays,
        round(s.cost, 0),
        s.ppeChecked ? "Yes" : "No",
        s.toolboxTalk ? "Yes" : "No",
        s.reviewStatus,
        Object.entries(s.trades).map(([t, n]) => `${t}: ${n}`).join(", "),
      ]);
    }
    ws.columns.forEach((c, i) => (c.width = [11, 20, 14, 26, 16, 17, 8, 8, 9, 11, 6, 8, 10, 50][i]));

    const detail = wb.addWorksheet("Labour detail");
    detail.addRow(["Date", "Site", "Contractor", "Labourer", "Trade", "Count", "Status", "OT hrs", "Rate ₹"]);
    styleHeader(detail);
    for (const s of sheets) {
      for (const e of s.entries) {
        detail.addRow([fmtDate(s.workDate), s.site?.name ?? "", s.contractorName, e.labourName ?? "(headcount)", e.trade, e.count, e.status, e.otHours, e.rate]);
      }
    }
    detail.columns.forEach((c, i) => (c.width = [11, 14, 26, 22, 14, 7, 7, 7, 8][i]));
    filename = `labour_${from}_to_${to}.xlsx`;
  } else if (report === "cost") {
    const data = await projectCostReport(from, to);
    const ws = wb.addWorksheet("Project cost");
    ws.addRow(["Project", "Site", "Staff man-days", "Staff cost ₹", "Labour man-days", "Labour cost ₹", "Total ₹"]);
    styleHeader(ws);
    for (const p of data.projects) {
      for (const s of p.sites) {
        ws.addRow([p.name, s.site.name, round(s.line.staffDays, 1), round(s.line.staffCost, 0), round(s.line.labourDays, 1), round(s.line.labourCost, 0), round(s.line.staffCost + s.line.labourCost, 0)]);
      }
      const t = ws.addRow([`${p.name} total`, "", round(p.total.staffDays, 1), round(p.total.staffCost, 0), round(p.total.labourDays, 1), round(p.total.labourCost, 0), round(p.total.staffCost + p.total.labourCost, 0)]);
      t.font = { bold: true };
    }
    ws.columns.forEach((c, i) => (c.width = [28, 16, 14, 14, 15, 14, 14][i]));

    const cs = wb.addWorksheet("Contractors");
    cs.addRow(["Contractor", "Sheets", "Man-days", "Wage cost ₹"]);
    styleHeader(cs);
    for (const c of data.contractors) cs.addRow([c.name, c.sheets, round(c.days, 1), round(c.cost, 0)]);
    cs.columns.forEach((c, i) => (c.width = [30, 8, 10, 14][i]));
    filename = `project_cost_${from}_to_${to}.xlsx`;
  } else {
    return new Response("Unknown report", { status: 404 });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
