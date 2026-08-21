import React from "react";
import WaterNetworkOverview from "./WaterNetworkOverview";

export default function WaterNetworkOverviewDemo() {
  return (
    <WaterNetworkOverview
      ubicacionLabel="Todas"
      periodoLabel="24 h"
      actualizadoLabel="actualizado 01:07"
      estadoGeneral="atencion"
      mensajeGeneral="La impulsión tiene margen disponible mientras el almacenamiento principal está descendiendo."
      impulsion={{
        operando: "7 / 9",
        utilizacion: "78%",
        disponibilidad: "89%",
        estado: "normal",
        data: [
          { label: "00", operando: 62, disponible: 96 },
          { label: "04", operando: 76, disponible: 96 },
          { label: "08", operando: 88, disponible: 95 },
          { label: "12", operando: 78, disponible: 95 },
          { label: "16", operando: 80, disponible: 94 },
          { label: "20", operando: 68, disponible: 92 },
          { label: "24", operando: 61, disponible: 78 },
        ],
        detalle: [
          { nombre: "Oeste 1", estado: "ON", horasEncendida: "18,4 h", arranques: 12 },
          { nombre: "Oeste 2", estado: "ON", horasEncendida: "16,2 h", arranques: 9 },
          { nombre: "Oeste 3", estado: "OFF", horasEncendida: "7,8 h", arranques: 4 },
          { nombre: "Este 1", estado: "ON", horasEncendida: "21,1 h", arranques: 15 },
          { nombre: "Este 2", estado: "OFF", horasEncendida: "12,3 h", arranques: 7 },
        ],
      }}
      distribucion={{
        nivelPromedio: "59%",
        actual: "54%",
        bajos: 2,
        criticos: 0,
        estado: "atencion",
        tendenciaLabel: "Tendencia ↓",
        data: [
          { label: "00", nivel: 62, referencia: 58 },
          { label: "04", nivel: 70, referencia: 58 },
          { label: "08", nivel: 74, referencia: 59 },
          { label: "12", nivel: 66, referencia: 59 },
          { label: "16", nivel: 60, referencia: 59 },
          { label: "20", nivel: 53, referencia: 59 },
          { label: "24", nivel: 50, referencia: 59 },
        ],
        detalle: [
          { nombre: "TK 1000", nivelActual: "72%", tendencia: "estable" },
          { nombre: "TK III", nivelActual: "51%", tendencia: "bajando" },
          { nombre: "Hormigón", nivelActual: "34%", tendencia: "bajando" },
          { nombre: "Pulmón", nivelActual: "65%", tendencia: "subiendo" },
          { nombre: "TK 160", nivelActual: "58%", tendencia: "estable" },
        ],
      }}
      conclusiones={[
        "Impulsión con capacidad disponible",
        "Distribución en atención por descenso de almacenamiento",
        "Revisar estrategia de operación antes de ampliar recursos",
      ]}
    />
  );
}
