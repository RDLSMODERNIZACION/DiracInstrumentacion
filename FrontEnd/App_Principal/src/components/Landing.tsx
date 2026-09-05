import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Factory,
  Gauge,
  Mail,
  MapPin,
  Phone,
  RadioTower,
  Settings2,
  ShieldCheck,
  SunMedium,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";

const LOGO_SRC = "/img/logodirac.jpeg";

const services = [
  {
    icon: Zap,
    eyebrow: "Ingeniería eléctrica",
    title: "Proyectos, tableros y calidad de energía",
    description:
      "Ingeniería, mediciones, puesta a tierra, rigidez dieléctrica, termografía y diagnóstico de instalaciones eléctricas.",
  },
  {
    icon: RadioTower,
    eyebrow: "Telemetría",
    title: "Monitoreo remoto de activos críticos",
    description:
      "Nivel, presión, caudal, energía, estados, alarmas y eventos con información operativa disponible en tiempo real.",
  },
  {
    icon: Settings2,
    eyebrow: "Automatización",
    title: "PLC, HMI, sensores e instrumentación",
    description:
      "Diseño e integración de automatismos industriales, tableros de control y señales de campo para procesos confiables.",
  },
  {
    icon: SunMedium,
    eyebrow: "Energía renovable",
    title: "Sistemas solares on-grid y off-grid",
    description:
      "Generación fotovoltaica, almacenamiento, iluminación solar y soluciones autónomas para puntos remotos.",
  },
  {
    icon: Gauge,
    eyebrow: "Eficiencia energética",
    title: "Medir, analizar y reducir costos",
    description:
      "Seguimiento de demanda, factor de potencia, consumos y oportunidades concretas de mejora energética.",
  },
  {
    icon: Wrench,
    eyebrow: "Mantenimiento",
    title: "Preventivo, predictivo y correctivo",
    description:
      "Intervenciones sobre instalaciones, equipos eléctricos, transformadores e infraestructura con enfoque en disponibilidad.",
  },
];

const differentiators = [
  { icon: ShieldCheck, title: "Profesionales matriculados", text: "Trabajo respaldado por criterio técnico y documentación." },
  { icon: Activity, title: "Instrumental profesional", text: "Mediciones y diagnóstico con equipamiento de campo certificado." },
  { icon: Truck, title: "Movilidad propia", text: "Hidrogrúa y unidades de servicio preparadas para trabajo en campo." },
  { icon: MapPin, title: "Cobertura regional", text: "Base operativa en Rincón de los Sauces para atender Neuquén y la región." },
];

const projects = [
  {
    tag: "Automatización e instrumentación",
    title: "Tableros y control industrial",
    image: "/img/tableros-electricos.jpeg",
  },
  {
    tag: "Trabajo en campo",
    title: "Hidrogrúa y asistencia técnica",
    image: "/img/hidrogrua-dirac.jpg",
  },
  {
    tag: "Mantenimiento eléctrico",
    title: "Transformadores y diagnóstico",
    image: "/img/mantenimiento-transformadores.jpeg",
  },
  {
    tag: "Monitoreo",
    title: "Telemetría y supervisión remota",
    image: "/img/scada-preview.png",
  },
];

const solarProducts = [
  {
    title: "Iluminación solar",
    text: "Soluciones autónomas para calles, patios, predios y puntos con cámara 4G.",
    image: "/img/luminaria-solar.jpeg",
  },
  {
    title: "Generación fotovoltaica",
    text: "Sistemas on-grid y off-grid dimensionados según consumo, autonomía y condiciones de operación.",
    image: "/img/paneles-solares.jpg",
  },
  {
    title: "Monitoreo y control",
    text: "Supervisión de variables, estados, eventos y alarmas para sistemas energéticos y activos remotos.",
    image: "/img/scada-preview.png",
  },
];

const sectors = [
  {
    icon: Building2,
    title: "Municipios y servicios públicos",
    text: "Bombeos, tanques, telemetría, alumbrado, sistemas solares, tableros y gestión energética.",
  },
  {
    icon: Factory,
    title: "Industria y Oil & Gas",
    text: "Automatización, instrumentación, energía, mantenimiento y monitoreo de activos operativos.",
  },
];

export default function Landing() {
  return (
    <div className="landing-pro">
      <style>{`
        .landing-pro {
          --ink: #0a1628;
          --ink-soft: #16263d;
          --navy: #071426;
          --navy-2: #0b223f;
          --green: #67c23a;
          --green-dark: #3d8f21;
          --blue: #2a6fdb;
          --sky: #66b9ff;
          --paper: #f4f7f9;
          --line: #dbe4ea;
          --muted: #657184;
          --white: #ffffff;
          min-height: 100vh;
          color: var(--ink);
          background: var(--paper);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          overflow-x: hidden;
        }

        .landing-pro * { box-sizing: border-box; }
        .landing-pro a { color: inherit; text-decoration: none; }
        .lp-shell { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }

        .lp-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          border-bottom: 1px solid rgba(219, 228, 234, .85);
          background: rgba(255,255,255,.92);
          backdrop-filter: blur(18px);
        }
        .lp-nav-inner {
          min-height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .lp-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .lp-brand img {
          width: 48px;
          height: 48px;
          border-radius: 13px;
          object-fit: contain;
          background: #fff;
          border: 1px solid var(--line);
        }
        .lp-brand-copy { display: grid; gap: 2px; }
        .lp-brand-copy strong { font-size: 19px; line-height: 1; letter-spacing: -.02em; }
        .lp-brand-copy span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .09em; }
        .lp-links { display: flex; align-items: center; gap: 24px; color: #49576a; font-size: 14px; font-weight: 750; }
        .lp-links a { transition: color .18s ease; }
        .lp-links a:hover { color: var(--green-dark); }
        .lp-login {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 0 17px;
          border-radius: 10px;
          background: var(--navy);
          color: white;
          font-size: 14px;
          font-weight: 800;
          transition: transform .18s ease, background .18s ease;
        }
        .lp-login:hover { transform: translateY(-1px); background: var(--navy-2); }

        .lp-hero {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 82% 18%, rgba(102,185,255,.17), transparent 30%),
            radial-gradient(circle at 70% 80%, rgba(103,194,58,.13), transparent 28%),
            linear-gradient(135deg, #071426 0%, #0b223f 58%, #0f2e4f 100%);
          color: white;
        }
        .lp-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: linear-gradient(to right, rgba(0,0,0,.75), transparent 92%);
          pointer-events: none;
        }
        .lp-hero-grid {
          position: relative;
          z-index: 2;
          min-height: 690px;
          display: grid;
          grid-template-columns: minmax(0, .92fr) minmax(420px, 1.08fr);
          gap: 58px;
          align-items: center;
          padding: 84px 0 92px;
        }
        .lp-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 22px;
          color: #b9dbff;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .lp-eyebrow::before { content: ""; width: 34px; height: 2px; border-radius: 999px; background: var(--green); }
        .lp-hero h1 {
          margin: 0;
          max-width: 720px;
          font-size: clamp(46px, 5.6vw, 80px);
          line-height: .96;
          letter-spacing: -.055em;
          font-weight: 900;
        }
        .lp-hero h1 span { color: #9ad77b; }
        .lp-hero-lead {
          margin: 28px 0 0;
          max-width: 620px;
          color: rgba(232,240,248,.77);
          font-size: 18px;
          line-height: 1.65;
        }
        .lp-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
        .lp-btn-primary,
        .lp-btn-secondary {
          min-height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 0 20px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 850;
          transition: transform .18s ease, background .18s ease, border-color .18s ease;
        }
        .lp-btn-primary { background: var(--green); color: #10260d; box-shadow: 0 16px 38px rgba(52,130,24,.24); }
        .lp-btn-primary:hover { transform: translateY(-1px); background: #79cf52; }
        .lp-btn-secondary { border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.06); color: white; }
        .lp-btn-secondary:hover { transform: translateY(-1px); border-color: rgba(255,255,255,.42); background: rgba(255,255,255,.1); }

        .lp-proof-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          margin-top: 44px;
          max-width: 650px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 14px;
          background: rgba(255,255,255,.12);
        }
        .lp-proof-row > div { background: rgba(6,20,36,.55); padding: 18px 20px; backdrop-filter: blur(10px); }
        .lp-proof-row strong { display: block; color: white; font-size: 18px; line-height: 1.1; }
        .lp-proof-row span { display: block; margin-top: 6px; color: rgba(232,240,248,.62); font-size: 11px; line-height: 1.35; text-transform: uppercase; letter-spacing: .07em; }

        .lp-hero-media { position: relative; min-height: 540px; }
        .lp-photo-main {
          position: absolute;
          inset: 28px 0 68px 74px;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,.15);
          box-shadow: 0 34px 80px rgba(0,0,0,.34);
          background: #10253d;
        }
        .lp-photo-main img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .lp-photo-main::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(4,13,24,.8), transparent 58%);
        }
        .lp-photo-label {
          position: absolute;
          left: 25px;
          right: 25px;
          bottom: 22px;
          z-index: 2;
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 18px;
        }
        .lp-photo-label strong { display: block; font-size: 20px; letter-spacing: -.02em; }
        .lp-photo-label span { display: block; margin-top: 5px; color: rgba(255,255,255,.7); font-size: 13px; }
        .lp-photo-chip { padding: 8px 10px; border-radius: 999px; background: rgba(103,194,58,.94); color: #112711; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .07em; white-space: nowrap; }
        .lp-photo-small {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 220px;
          height: 164px;
          overflow: hidden;
          border-radius: 22px;
          border: 6px solid var(--navy-2);
          box-shadow: 0 28px 70px rgba(0,0,0,.28);
          background: #fff;
        }
        .lp-photo-small img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .lp-hero-badge {
          position: absolute;
          right: -8px;
          top: 0;
          width: 190px;
          padding: 18px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(6,20,36,.72);
          backdrop-filter: blur(14px);
          box-shadow: 0 24px 60px rgba(0,0,0,.22);
        }
        .lp-hero-badge svg { color: var(--green); margin-bottom: 12px; }
        .lp-hero-badge strong { display: block; font-size: 17px; line-height: 1.2; }
        .lp-hero-badge span { display: block; margin-top: 6px; color: rgba(232,240,248,.62); font-size: 12px; line-height: 1.45; }

        .lp-strip { border-bottom: 1px solid var(--line); background: #fff; }
        .lp-strip-grid { min-height: 94px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .lp-strip-item { display: flex; align-items: center; gap: 13px; padding: 20px 24px; border-right: 1px solid var(--line); }
        .lp-strip-item:last-child { border-right: 0; }
        .lp-strip-icon { width: 38px; height: 38px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 11px; background: #eff8eb; color: var(--green-dark); }
        .lp-strip-item strong { display: block; font-size: 14px; }
        .lp-strip-item span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.35; }

        .lp-section { padding: 92px 0; }
        .lp-section.white { background: white; }
        .lp-section.dark { background: var(--navy); color: white; }
        .lp-section-head { display: grid; grid-template-columns: minmax(0, .95fr) minmax(280px, .55fr); gap: 50px; align-items: end; margin-bottom: 38px; }
        .lp-kicker { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 16px; color: var(--green-dark); font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; }
        .lp-kicker::before { content: ""; width: 30px; height: 2px; background: var(--green); border-radius: 999px; }
        .dark .lp-kicker { color: #9ad77b; }
        .lp-section h2 { margin: 0; max-width: 800px; font-size: clamp(34px, 4.4vw, 58px); line-height: 1.02; letter-spacing: -.045em; }
        .lp-section-head p { margin: 0; color: var(--muted); font-size: 16px; line-height: 1.7; }
        .dark .lp-section-head p { color: rgba(232,240,248,.68); }

        .lp-service-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .lp-service-card {
          min-height: 270px;
          padding: 28px;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: white;
          box-shadow: 0 12px 34px rgba(8,28,50,.045);
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }
        .lp-service-card:hover { transform: translateY(-4px); border-color: #bfd8b5; box-shadow: 0 24px 55px rgba(8,28,50,.09); }
        .lp-service-icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 13px; background: #eff8eb; color: var(--green-dark); }
        .lp-service-card small { display: block; margin-top: 26px; color: var(--blue); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .09em; }
        .lp-service-card h3 { margin: 8px 0 0; font-size: 23px; line-height: 1.12; letter-spacing: -.03em; }
        .lp-service-card p { margin: 13px 0 0; color: var(--muted); font-size: 14px; line-height: 1.65; }

        .lp-project-grid { display: grid; grid-template-columns: 1.18fr .82fr; grid-template-rows: 300px 300px; gap: 16px; }
        .lp-project-card { position: relative; overflow: hidden; border-radius: 22px; background: #12253a; min-height: 0; }
        .lp-project-card:first-child { grid-row: 1 / 3; }
        .lp-project-card img { width: 100%; height: 100%; display: block; object-fit: cover; transition: transform .45s ease; }
        .lp-project-card:hover img { transform: scale(1.035); }
        .lp-project-card::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(4,14,27,.86), transparent 62%); }
        .lp-project-copy { position: absolute; z-index: 2; left: 24px; right: 24px; bottom: 22px; }
        .lp-project-copy span { color: #a4d78a; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .09em; }
        .lp-project-copy h3 { margin: 8px 0 0; color: white; font-size: 24px; line-height: 1.08; letter-spacing: -.03em; }
        .lp-project-card:first-child .lp-project-copy h3 { font-size: 36px; }

        .lp-solar-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        .lp-solar-card { overflow: hidden; border-radius: 20px; border: 1px solid var(--line); background: white; }
        .lp-solar-card img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: #f5f7f8; }
        .lp-solar-card div { padding: 22px; }
        .lp-solar-card h3 { margin: 0; font-size: 22px; letter-spacing: -.025em; }
        .lp-solar-card p { margin: 10px 0 0; color: var(--muted); font-size: 14px; line-height: 1.6; }

        .lp-sector-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
        .lp-sector-card { padding: 30px; border: 1px solid rgba(255,255,255,.12); border-radius: 20px; background: rgba(255,255,255,.045); }
        .lp-sector-card svg { color: #9ad77b; }
        .lp-sector-card h3 { margin: 20px 0 0; font-size: 29px; letter-spacing: -.035em; }
        .lp-sector-card p { margin: 12px 0 0; color: rgba(232,240,248,.68); line-height: 1.7; }
        .lp-sector-list { display: grid; gap: 10px; margin-top: 22px; }
        .lp-sector-list span { display: flex; align-items: center; gap: 9px; color: rgba(255,255,255,.83); font-size: 13px; }
        .lp-sector-list svg { width: 16px; height: 16px; flex: 0 0 auto; }

        .lp-about-band {
          padding: 54px 0;
          border-block: 1px solid var(--line);
          background: linear-gradient(90deg, #fff, #f5faf3);
        }
        .lp-about-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(320px,.75fr); gap: 56px; align-items: center; }
        .lp-about-grid h2 { margin: 0; font-size: clamp(32px, 4vw, 52px); line-height: 1.05; letter-spacing: -.04em; }
        .lp-about-grid p { margin: 18px 0 0; color: var(--muted); font-size: 16px; line-height: 1.75; }
        .lp-about-list { display: grid; gap: 12px; }
        .lp-about-list div { display: flex; gap: 12px; align-items: start; padding: 14px 0; border-bottom: 1px solid var(--line); }
        .lp-about-list div:last-child { border-bottom: 0; }
        .lp-about-list svg { width: 19px; height: 19px; color: var(--green-dark); margin-top: 1px; flex: 0 0 auto; }
        .lp-about-list strong { display: block; font-size: 14px; }
        .lp-about-list span { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.45; }

        .lp-cta { background: #fff; padding: 76px 0; }
        .lp-cta-card {
          position: relative;
          overflow: hidden;
          display: grid;
          grid-template-columns: minmax(0,1fr) auto;
          gap: 34px;
          align-items: center;
          padding: 44px;
          border-radius: 26px;
          color: white;
          background: linear-gradient(125deg, #071426 0%, #0d2a4a 75%, #164160 100%);
          box-shadow: 0 28px 70px rgba(8,28,50,.18);
        }
        .lp-cta-card::after { content: ""; position: absolute; width: 320px; height: 320px; border-radius: 50%; right: -130px; top: -160px; background: radial-gradient(circle, rgba(103,194,58,.32), transparent 68%); }
        .lp-cta-card h2 { margin: 0; font-size: clamp(32px, 4vw, 50px); line-height: 1.05; letter-spacing: -.04em; }
        .lp-cta-card p { margin: 12px 0 0; max-width: 700px; color: rgba(232,240,248,.7); line-height: 1.65; }
        .lp-cta-actions { position: relative; z-index: 2; display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

        .lp-footer { border-top: 1px solid var(--line); background: #f9fbfc; padding: 28px 0; }
        .lp-footer-grid { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
        .lp-footer-brand strong { display: block; }
        .lp-footer-brand span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
        .lp-contact { display: flex; flex-wrap: wrap; gap: 16px 22px; color: #344156; font-size: 13px; font-weight: 700; }
        .lp-contact a { display: inline-flex; align-items: center; gap: 7px; }
        .lp-contact a:hover { color: var(--green-dark); }

        @media (max-width: 1000px) {
          .lp-links { display: none; }
          .lp-hero-grid, .lp-section-head, .lp-about-grid { grid-template-columns: 1fr; }
          .lp-hero-grid { min-height: auto; padding: 66px 0 78px; }
          .lp-hero-media { min-height: 470px; }
          .lp-strip-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .lp-strip-item:nth-child(2) { border-right: 0; }
          .lp-strip-item:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
          .lp-service-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .lp-project-grid { grid-template-columns: 1fr 1fr; grid-template-rows: 420px 280px; }
          .lp-project-card:first-child { grid-column: 1 / 3; grid-row: auto; }
          .lp-solar-grid { grid-template-columns: 1fr; }
          .lp-solar-card { display: grid; grid-template-columns: 320px 1fr; align-items: center; }
          .lp-solar-card img { aspect-ratio: auto; height: 230px; }
        }

        @media (max-width: 680px) {
          .lp-shell { width: min(100% - 28px, 1180px); }
          .lp-nav-inner { min-height: 68px; }
          .lp-brand-copy span { display: none; }
          .lp-login { min-height: 40px; padding: 0 13px; font-size: 13px; }
          .lp-hero-grid { padding: 48px 0 62px; gap: 36px; }
          .lp-hero h1 { font-size: 45px; line-height: 1; }
          .lp-hero-lead { font-size: 16px; }
          .lp-actions { display: grid; }
          .lp-btn-primary, .lp-btn-secondary { width: 100%; }
          .lp-proof-row { grid-template-columns: 1fr; }
          .lp-proof-row > div { padding: 14px 16px; }
          .lp-hero-media { min-height: 380px; }
          .lp-photo-main { inset: 18px 0 66px 36px; border-radius: 20px; }
          .lp-photo-small { width: 150px; height: 116px; border-radius: 17px; border-width: 4px; }
          .lp-hero-badge { width: 155px; padding: 14px; right: -3px; }
          .lp-hero-badge strong { font-size: 14px; }
          .lp-photo-label { left: 16px; right: 16px; bottom: 15px; }
          .lp-photo-label strong { font-size: 16px; }
          .lp-photo-chip { display: none; }
          .lp-strip-grid, .lp-service-grid, .lp-project-grid, .lp-sector-grid { grid-template-columns: 1fr; }
          .lp-strip-item, .lp-strip-item:nth-child(n) { border-right: 0; border-bottom: 1px solid var(--line); }
          .lp-strip-item:last-child { border-bottom: 0; }
          .lp-section { padding: 70px 0; }
          .lp-section-head { gap: 18px; margin-bottom: 28px; }
          .lp-service-card { min-height: auto; }
          .lp-project-grid { grid-template-rows: none; }
          .lp-project-card, .lp-project-card:first-child { grid-column: auto; grid-row: auto; height: 300px; }
          .lp-project-card:first-child .lp-project-copy h3 { font-size: 27px; }
          .lp-solar-card { display: block; }
          .lp-solar-card img { height: auto; aspect-ratio: 4 / 3; }
          .lp-about-band { padding: 46px 0; }
          .lp-cta { padding: 54px 0; }
          .lp-cta-card { grid-template-columns: 1fr; padding: 30px 24px; }
          .lp-cta-actions { justify-content: flex-start; }
        }
      `}</style>

      <nav className="lp-nav">
        <div className="lp-shell lp-nav-inner">
          <a className="lp-brand" href="#inicio" aria-label="DIRAC - Inicio">
            <img src={LOGO_SRC} alt="DIRAC" />
            <span className="lp-brand-copy">
              <strong>DIRAC</strong>
              <span>Servicios Energía</span>
            </span>
          </a>

          <div className="lp-links">
            <a href="#servicios">Servicios</a>
            <a href="#trabajos">Trabajos</a>
            <a href="#solar">Solar</a>
            <a href="#sectores">Sectores</a>
            <a href="#contacto">Contacto</a>
          </div>

          <Link className="lp-login" to="/login">
            Iniciar sesión <ArrowUpRight size={16} />
          </Link>
        </div>
      </nav>

      <main id="inicio">
        <section className="lp-hero">
          <div className="lp-shell lp-hero-grid">
            <div>
              <div className="lp-eyebrow">Ingeniería energética · Rincón de los Sauces</div>
              <h1>
                Ingeniería que se ve en campo y se <span>mide en resultados.</span>
              </h1>
              <p className="lp-hero-lead">
                Diseñamos, instalamos y mantenemos soluciones de energía, automatización e instrumentación para municipios e industrias de la región.
              </p>

              <div className="lp-actions">
                <a className="lp-btn-primary" href="#servicios">
                  Ver soluciones <ChevronRight size={17} />
                </a>
                <a className="lp-btn-secondary" href="#contacto">
                  Hablar con DIRAC <ArrowUpRight size={17} />
                </a>
              </div>

              <div className="lp-proof-row">
                <div><strong>+10 años</strong><span>de experiencia técnica</span></div>
                <div><strong>Regional</strong><span>cobertura desde Neuquén</span></div>
                <div><strong>Integral</strong><span>ingeniería + campo + monitoreo</span></div>
              </div>
            </div>

            <div className="lp-hero-media" aria-label="Trabajos y equipamiento DIRAC">
              <div className="lp-photo-main">
                <img src="/img/tableros-electricos.jpeg" alt="Tablero eléctrico e instrumentación DIRAC" />
                <div className="lp-photo-label">
                  <div>
                    <strong>Ingeniería + ejecución</strong>
                    <span>Desde el relevamiento hasta la puesta en servicio.</span>
                  </div>
                  <div className="lp-photo-chip">Trabajo real</div>
                </div>
              </div>
              <div className="lp-photo-small">
                <img src="/img/hidrogrua-dirac.jpg" alt="Hidrogrúa DIRAC" />
              </div>
              <div className="lp-hero-badge">
                <ShieldCheck size={24} />
                <strong>Soluciones de nivel profesional</strong>
                <span>Profesionales matriculados e instrumental de campo.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-strip" aria-label="Diferenciales DIRAC">
          <div className="lp-shell lp-strip-grid">
            {differentiators.map((item) => {
              const Icon = item.icon;
              return (
                <div className="lp-strip-item" key={item.title}>
                  <div className="lp-strip-icon"><Icon size={20} /></div>
                  <div><strong>{item.title}</strong><span>{item.text}</span></div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lp-section white" id="servicios">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-kicker">Qué hacemos</div>
                <h2>Una sola empresa para energía, control e instrumentación.</h2>
              </div>
              <p>
                Integramos ingeniería, instalación, diagnóstico y monitoreo para que cada solución tenga respaldo técnico y utilidad operativa real.
              </p>
            </div>

            <div className="lp-service-grid">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <article className="lp-service-card" key={service.title}>
                    <div className="lp-service-icon"><Icon size={23} /></div>
                    <small>{service.eyebrow}</small>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lp-section" id="trabajos">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-kicker">Trabajo real</div>
                <h2>Menos imágenes genéricas. Más proyectos y equipos reales.</h2>
              </div>
              <p>
                La landing muestra la capacidad de DIRAC con material propio: tableros, unidades de campo, mantenimiento y monitoreo.
              </p>
            </div>

            <div className="lp-project-grid">
              {projects.map((project) => (
                <article className="lp-project-card" key={project.title}>
                  <img src={project.image} alt={project.title} />
                  <div className="lp-project-copy">
                    <span>{project.tag}</span>
                    <h3>{project.title}</h3>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-about-band">
          <div className="lp-shell lp-about-grid">
            <div>
              <div className="lp-kicker">Quiénes somos</div>
              <h2>Empresa rinconense con experiencia técnica y visión regional.</h2>
              <p>
                DIRAC nació en Rincón de los Sauces para brindar soluciones energéticas e industriales de nivel profesional. Combinamos conocimiento técnico, innovación y compromiso para desarrollar proyectos con resultados concretos.
              </p>
            </div>
            <div className="lp-about-list">
              <div><CheckCircle2 /><span><strong>Soluciones integrales</strong><span>Ingeniería, automatización, instrumentación y eficiencia energética.</span></span></div>
              <div><CheckCircle2 /><span><strong>Atención personalizada</strong><span>Relevamiento y propuesta adaptada al problema operativo real.</span></span></div>
              <div><CheckCircle2 /><span><strong>Presencia en campo</strong><span>Movilidad, instrumental y capacidad para ejecutar y mantener.</span></span></div>
            </div>
          </div>
        </section>

        <section className="lp-section white" id="solar">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-kicker">Energía solar</div>
                <h2>Soluciones solares con una presentación comercial más clara.</h2>
              </div>
              <p>
                Equipamiento y sistemas pensados para autonomía, respaldo e iluminación, con asesoramiento técnico según cada aplicación.
              </p>
            </div>

            <div className="lp-solar-grid">
              {solarProducts.map((product) => (
                <article className="lp-solar-card" key={product.title}>
                  <img src={product.image} alt={product.title} />
                  <div><h3>{product.title}</h3><p>{product.text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section dark" id="sectores">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-kicker">Sectores</div>
                <h2>Tecnología aplicada donde la operación importa.</h2>
              </div>
              <p>
                La misma capacidad de ingeniería se adapta a infraestructura pública, plantas industriales y activos distribuidos en campo.
              </p>
            </div>

            <div className="lp-sector-grid">
              {sectors.map((sector, index) => {
                const Icon = sector.icon;
                return (
                  <article className="lp-sector-card" key={sector.title}>
                    <Icon size={30} />
                    <h3>{sector.title}</h3>
                    <p>{sector.text}</p>
                    <div className="lp-sector-list">
                      {(index === 0
                        ? ["Telemetría de agua y bombeos", "Alumbrado y energía solar", "Eficiencia energética municipal"]
                        : ["Automatización e instrumentación", "Mantenimiento eléctrico", "Monitoreo y calidad de energía"]
                      ).map((item) => <span key={item}><CheckCircle2 />{item}</span>)}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lp-cta" id="contacto">
          <div className="lp-shell">
            <div className="lp-cta-card">
              <div>
                <h2>Contanos qué necesitás resolver.</h2>
                <p>
                  Podemos relevar la instalación, definir la solución técnica y acompañar la ejecución, puesta en servicio y mantenimiento.
                </p>
              </div>
              <div className="lp-cta-actions">
                <a className="lp-btn-primary" href="mailto:administracion@diracserviciosenergia.com">
                  <Mail size={17} /> Escribir a DIRAC
                </a>
                <Link className="lp-btn-secondary" to="/login">
                  Ingresar al panel <ArrowUpRight size={17} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-grid">
          <div className="lp-footer-brand">
            <strong>DIRAC Servicios Energía S.A.S.</strong>
            <span>Rincón de los Sauces · Neuquén · Argentina</span>
          </div>
          <div className="lp-contact">
            <a href="tel:+542994292985"><Phone size={15} />299 4292985</a>
            <a href="tel:+542993251398"><Phone size={15} />299 3251398</a>
            <a href="mailto:administracion@diracserviciosenergia.com"><Mail size={15} />administracion@diracserviciosenergia.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
