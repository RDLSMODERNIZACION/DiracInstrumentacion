import { useCallback } from "react";
import LegacyReliabilityPage from "./ReliabilityPageLegacy";
import { scopedUrl, getApiHeaders } from "@/lib/config";

type Props = {
  locationId?: number | string;
  selectedPumpIds?: number[] | string[] | "all";
  selectedTankIds?: number[] | string[] | "all";
  thresholdLow?: number;
};

type PumpRankingRow = {
  pump_id: number;
  pump_name: string;
  location_name?: string | null;
};

export default function ReliabilityPage(props: Props) {
  const openPumpAnalysis = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const row = target?.closest("tbody tr") as HTMLTableRowElement | null;
    if (!row) return;

    const table = row.closest("table");
    const section = table?.closest("section");
    const heading = section?.querySelector("h3")?.textContent || "";
    if (!heading.toLowerCase().includes("tabla mensual ordenable de bombas")) return;

    const cells = row.querySelectorAll("td");
    if (cells.length < 2) return;

    const pumpName = (cells[0]?.textContent || "").trim();
    const locationName = (cells[1]?.textContent || "").trim();
    if (!pumpName) return;

    event.preventDefault();
    event.stopPropagation();

    const monthInput = event.currentTarget.querySelector('input[type="month"]') as HTMLInputElement | null;
    const month = monthInput?.value || "";
    const query = new URLSearchParams();
    if (month) query.set("month", month);
    query.set("limit", "100");

    try {
      const response = await fetch(`${scopedUrl("/kpi/operation-reliability/pump-ranking")}?${query.toString()}`, {
        headers: getApiHeaders(),
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      const rows: PumpRankingRow[] = Array.isArray(data?.items) ? data.items : [];
      const match = rows.find((r) =>
        String(r.pump_name || "").trim() === pumpName &&
        String(r.location_name || "").trim() === locationName
      ) || rows.find((r) => String(r.pump_name || "").trim() === pumpName);
      if (!match?.pump_id) return;

      const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
      const url = `${window.location.origin}${base}pump/${match.pump_id}?month=${encodeURIComponent(month)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Si falla la resolución, dejamos la fila sin abrir para no disparar el modal viejo.
    }
  }, []);

  return (
    <div onClickCapture={openPumpAnalysis} className="reliability-page-wrapper">
      <LegacyReliabilityPage {...props} />
    </div>
  );
}
