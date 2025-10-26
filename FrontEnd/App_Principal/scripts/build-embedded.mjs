// Scada/App_Principal/scripts/build-embedded.mjs
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";

const root = process.cwd(); // App_Principal
const app1 = `${root}/../App_1`;
const app2 = `${root}/../App_2`;

const run = (cmd, cwd) => {
  console.log(`\n▶ ${cmd} (cwd=${cwd})`);
  execSync(cmd, { stdio: "inherit", cwd });
};

// Workaround cross-plataforma para optional deps (rollup) en embebidas
const cleanInstall = (dir) => {
  try { rmSync(`${dir}/node_modules`, { recursive: true, force: true }); } catch {}
  try { rmSync(`${dir}/package-lock.json`, { force: true }); } catch {}
  run("npm install --no-audit --no-fund", dir);
};

// ==== App_1 (KPIs) ====
cleanInstall(app1);
run("npm run build", app1);
if (!existsSync(`${root}/public/kpi`)) mkdirSync(`${root}/public/kpi`, { recursive: true });
cpSync(`${app1}/dist`, `${root}/public/kpi`, { recursive: true });

// ==== App_2 (Infraestructura) ====
cleanInstall(app2);
run("npm run build", app2);
if (!existsSync(`${root}/public/infraestructura`)) mkdirSync(`${root}/public/infraestructura`, { recursive: true });
cpSync(`${app2}/dist`, `${root}/public/infraestructura`, { recursive: true });

console.log("\n✅ Embebidas copiadas a /public (kpi/ e infraestructura/)");

// ==== Workaround rollup para la App_Principal (root) ====
// Tras el `npm ci` de Vercel, ejecutamos un `npm install` en Linux
// para que se instalen los binarios @rollup/rollup-linux-* opcionales.
try {
  run("npm install --no-audit --no-fund", root);
  console.log("\n✅ Root npm install ejecutado (fix rollup optional deps)");
} catch (e) {
  console.warn("⚠️ Root npm install falló (seguimos igual):", e?.message || e);
}
