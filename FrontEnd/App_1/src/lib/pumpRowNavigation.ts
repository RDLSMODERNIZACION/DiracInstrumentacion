import { scopedUrl, getApiHeaders } from "@/lib/config";

type PumpRow = {
  pump_id: number;
  pump_name: string;
  location_name?: string | null;
};

let cacheKey = "";
let cacheRows: PumpRow[] = [];
let inFlight: Promise<PumpRow[]> | null = null;

function normalize(v: string | null | undefined) {
  return String(v ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ");
}

function currentMonthFromPage() {
  const input = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="month"]'))
    .find((el) => /^\d{4}-\d{2}$/.test(el.value));
  if (input?.value) return input.value;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function loadRows(month: string) {
  if (cacheKey === month && cacheRows.length) return cacheRows;
  if (inFlight) return inFlight;

  const url = new URL(scopedUrl("/kpi/operation-reliability/pump-ranking"), window.location.origin);
  url.searchParams.set("month", month);
  url.searchParams.set("limit", "100");

  inFlight = fetch(url.toString(), {
    headers: getApiHeaders(),
    cache: "no-store",
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const rows = Array.isArray(data?.items) ? data.items : [];
      cacheKey = month;
      cacheRows = rows;
      return rows;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function isPumpTableRow(row: HTMLTableRowElement) {
  const section = row.closest("section");
  const title = section?.querySelector("h3")?.textContent || "";
  return normalize(title).includes("tabla mensual ordenable de bombas");
}

function buildPumpUrl(pumpId: number, month: string) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/pump/${pumpId}?month=${encodeURIComponent(month)}`;
}

export function installPumpRowNavigation() {
  document.addEventListener(
    "click",
    async (event) => {
      const target = event.target as HTMLElement | null;
      const row = target?.closest("tbody tr") as HTMLTableRowElement | null;
      if (!row || !isPumpTableRow(row)) return;

      const cells = row.querySelectorAll("td");
      if (cells.length < 2) return;

      const pumpName = cells[0]?.textContent?.trim() || "";
      const locationName = cells[1]?.textContent?.trim() || "";
      if (!pumpName) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const month = currentMonthFromPage();
      try {
        const rows = await loadRows(month);
        const pump = rows.find(
          (r) =>
            normalize(r.pump_name) === normalize(pumpName) &&
            (!locationName || normalize(r.location_name) === normalize(locationName))
        ) || rows.find((r) => normalize(r.pump_name) === normalize(pumpName));

        if (!pump?.pump_id) return;
        window.open(buildPumpUrl(Number(pump.pump_id), month), "_blank", "noopener,noreferrer");
      } catch (err) {
        console.error("[pumpRowNavigation]", err);
      }
    },
    true
  );

  document.addEventListener("mouseover", (event) => {
    const target = event.target as HTMLElement | null;
    const row = target?.closest("tbody tr") as HTMLTableRowElement | null;
    if (row && isPumpTableRow(row)) row.style.cursor = "pointer";
  });
}
