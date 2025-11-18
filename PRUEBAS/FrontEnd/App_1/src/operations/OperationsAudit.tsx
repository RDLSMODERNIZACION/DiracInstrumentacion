import React from "react";
import TankLevelChart, { TankTs } from "@/components/TankLevelChart";
import OpsPumpsProfile, { PumpsTs } from "@/components/OpsPumpsProfile";
import AuditControls from "@/operations/AuditControls";
import { useAudit } from "@/operations/useAudit";

export default function OperationsAudit({
  // timeline compartida (24h fijas dentro de playback 7d)
  startMs,
  endMs,
  bucketSeconds = 300,
  // sincronización de charts
  tz,
  syncId = "ops",
  xDomain,
  xTicks,
  hoverX,
  onHoverX,
  // series base (ubicación original)
  baseTankTs,
  basePumpsTs,
  tankTitle = "Nivel del tanque",
  pumpsTitle = "Bombas ON",
}: {
  startMs: number;
  endMs: number;
  bucketSeconds?: number;
  tz: string;
  syncId?: string;
  xDomain?: [number, number];
  xTicks?: number[];
  hoverX?: number | null;
  onHoverX?: (x: number | null) => void;
  baseTankTs?: TankTs;
  basePumpsTs?: PumpsTs;
  tankTitle?: string;
  pumpsTitle?: string;
}) {
  const audit = useAudit({ startMs, endMs, bucketSeconds });

  return (
    <div className="space-y-4">
      <AuditControls
        auditEnabled={audit.auditEnabled}
        setAuditEnabled={audit.setAuditEnabled}
        auditLoc={audit.auditLoc}
        setAuditLoc={audit.setAuditLoc}
        auditPumpOptions={audit.auditPumpOptions}
        auditTankOptions={audit.auditTankOptions}
        selectedAuditPumpIds={audit.selectedAuditPumpIds}
        setSelectedAuditPumpIds={audit.setSelectedAuditPumpIds}
        selectedAuditTankIds={audit.selectedAuditTankIds}
        setSelectedAuditTankIds={audit.setSelectedAuditTankIds}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TankLevelChart
          ts={baseTankTs}
          compareTs={audit.auditTankTs ?? undefined}
          compareLabel="Auditoría"
          syncId={syncId}
          title={tankTitle}
          tz={tz}
          xDomain={xDomain}
          xTicks={xTicks}
          hoverX={hoverX}
          onHoverX={onHoverX}
        />

        <OpsPumpsProfile
          pumpsTs={basePumpsTs}
          comparePumpsTs={audit.auditPumpsTs ?? undefined}
          compareLabel="Auditoría"
          syncId={syncId}
          title={pumpsTitle}
          tz={tz}
          xDomain={xDomain}
          xTicks={xTicks}
          hoverX={hoverX}
          onHoverX={onHoverX}
        />
      </div>
    </div>
  );
}
