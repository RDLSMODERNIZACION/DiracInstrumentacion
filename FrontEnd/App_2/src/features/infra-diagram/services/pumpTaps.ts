import { API_BASE } from "@/lib/api";
import { withScope } from "@/lib/scope";
import { authHeaders } from "@/lib/http";
export type PumpPipeTapMode = "inject" | "extract";
export type PumpPipeTap = { id:number; pump_id:number; pump_node_id:string; edge_id:number; mode:PumpPipeTapMode; t:number; x:number; y:number; };
export async function getPumpPipeTaps():Promise<PumpPipeTap[]>{ const r=await fetch(withScope(`${API_BASE}/infraestructura/pump_pipe_taps`),{headers:authHeaders()}); if(!r.ok) throw new Error(`No se pudieron cargar taps (${r.status})`); return r.json(); }
export async function savePumpPipeTap(input:{pump_id:number;edge_id:number;mode:PumpPipeTapMode;x:number;y:number;t?:number}){ const r=await fetch(withScope(`${API_BASE}/infraestructura/pump_pipe_taps`),{method:"POST",headers:{"Content-Type":"application/json",...authHeaders()},body:JSON.stringify(input)}); if(!r.ok) throw new Error(await r.text()); return r.json(); }

