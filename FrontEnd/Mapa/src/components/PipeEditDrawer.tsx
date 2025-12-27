import { useEffect, useState } from "react";
import { fetchPipeById, patchPipe } from "../services/mapasagua";

type Props = {
  pipeId: string | null;
  onClose: () => void;
  onUpdated: (feature: any) => void;
};

export default function PipeEditDrawer({
  pipeId,
  onClose,
  onUpdated,
}: Props) {
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pipeId) return;
    fetchPipeById(pipeId).then(setData);
  }, [pipeId]);

  if (!pipeId || !data) return null;

  const p = data.properties;

  async function save() {
    setSaving(true);
    const updated = await patchPipe(pipeId, {
      diametro_mm: p.diametro_mm,
      material: p.material,
      estado: p.estado,
      props: p.props,
    });
    setSaving(false);
    onUpdated(updated);
    onClose();
  }

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl p-4 z-50">
      <h2 className="text-lg font-semibold mb-4">Cañería</h2>

      <label>Diámetro (mm)</label>
      <input
        type="number"
        value={p.diametro_mm ?? ""}
        onChange={(e) =>
          setData({
            ...data,
            properties: {
              ...p,
              diametro_mm: Number(e.target.value),
            },
          })
        }
      />

      <label>Material</label>
      <input
        value={p.material ?? ""}
        onChange={(e) =>
          setData({
            ...data,
            properties: {
              ...p,
              material: e.target.value,
            },
          })
        }
      />

      <label>Estado</label>
      <select
        value={p.estado}
        onChange={(e) =>
          setData({
            ...data,
            properties: {
              ...p,
              estado: e.target.value,
            },
          })
        }
      >
        <option>OK</option>
        <option>WARN</option>
        <option>ALARM</option>
        <option>OFF</option>
      </select>

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 w-full bg-blue-600 text-white py-2"
      >
        {saving ? "Guardando..." : "Guardar"}
      </button>

      <button
        onClick={onClose}
        className="mt-2 w-full border py-2"
      >
        Cancelar
      </button>
    </div>
  );
}
