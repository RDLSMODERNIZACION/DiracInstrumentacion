// src/hooks/useKpi.ts
import { useEffect, useState } from "react";
import { getPumps, getTanks, Pump, Tank } from "../api/kpi";

export function usePumps() {
  const [data, setData] = useState<Pump[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getPumps().then(d => alive && setData(d)).catch(e => alive && setError(String(e)))
              .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  return { data, error, loading };
}

export function useTanks() {
  const [data, setData] = useState<Tank[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getTanks().then(d => alive && setData(d)).catch(e => alive && setError(String(e)))
              .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  return { data, error, loading };
}
