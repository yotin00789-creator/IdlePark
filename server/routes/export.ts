import { loadYears } from "../data.js";
import { buildLedgerWorkbook } from "../export.js";
import { HttpError, route } from "../http.js";
import { audit } from "../audit.js";

// GET /api/export/ledger?year=2569  (omit year for every year)
route("GET", "/export/ledger", "user", async (c) => {
  const all = await loadYears(c.db);
  const wanted = c.url.searchParams.get("year");
  const years = wanted ? all.filter((y) => y.year === Number(wanted)) : all;
  if (!years.length) throw new HttpError(404, "ไม่พบข้อมูลปีที่ขอ");
  // keep earlier years in the file so the running balance formulas stay correct
  const include = wanted ? all.filter((y) => y.year <= Number(wanted)) : all;
  const { workbook } = await buildLedgerWorkbook(include);
  const buf = Buffer.from(await workbook.xlsx.writeBuffer());
  await audit(c, { action: "export.ledger", entity: "export", entityId: wanted ?? "all", summary: `ส่งออก Excel ${wanted ? `ปี ${wanted}` : "ทุกปี"}` });
  const name = encodeURIComponent(`สมุดรายรับ-${wanted ?? "ทุกปี"}.xlsx`);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
      "cache-control": "no-store",
    },
  });
});
