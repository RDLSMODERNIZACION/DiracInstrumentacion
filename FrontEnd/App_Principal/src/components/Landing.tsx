import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const LOGO_SRC = "/img/logodirac.jpeg";
const SCADA_PREVIEW_SRC = "/img/scada-preview.png";

const services = [
  {
    number: "01",
    title: "Energía solar",
    description:
      "Paneles, baterías, iluminación autónoma, cámaras solares 4G y estaciones remotas para campo.",
  },
  {
    number: "02",
    title: "Telemetría",
    description:
      "Monitoreo remoto de presión, nivel, caudal, energía, estados de bombas, alarmas y eventos.",
  },
  {
    number: "03",
    title: "Automatización",
    description:
      "Tableros, PLC, HMI, sensores, protecciones y lógica de control para procesos críticos.",
  },
  {
    number: "04",
    title: "Luminaria solar",
    description:
      "Luminarias solares, columnas, cámaras 4G y autonomía para accesos, predios y espacios públicos.",
  },
  {
    number: "05",
    title: "Eficiencia energética",
    description:
      "Medición de kW, kWh, demanda máxima, factor de potencia y oportunidades reales de ahorro.",
  },
  {
    number: "06",
    title: "Transformadores",
    description:
      "Mantenimiento, inspección y diagnóstico de transformadores para mejorar disponibilidad y seguridad.",
  },
  {
    number: "07",
    title: "Semáforos inteligentes",
    description:
      "Instalación, control, sincronización y mantenimiento de semáforos inteligentes para tránsito urbano.",
  },
  {
    number: "08",
    title: "Banco de capacitores",
    description:
      "Instalación de bancos de capacitores para corrección de energía reactiva y mejora del factor de potencia.",
  },
];

const tickerItems = [
  "Energía solar",
  "Telemetría",
  "Automatización",
  "Luminaria solar",
  "Eficiencia energética",
  "Municipalidades",
  "Industrias",
  "Transformadores",
  "Semáforos inteligentes",
  "Banco de capacitores",
];

const heroSolutions = [
  {
    number: "01",
    title: "Energía solar",
    description: "Paneles, baterías, luminarias solares y energía para puntos remotos.",
    images: ["/img/paneles-solares.jpg", "/img/paneles-solares.jpeg"],
  },
  {
    number: "02",
    title: "Telemetría",
    description: "Monitoreo remoto de energía, presión, nivel, caudal, alarmas y estados.",
    images: ["/img/scada-preview.png"],
  },
  {
    number: "03",
    title: "Automatización",
    description: "PLC, HMI, sensores, tableros y lógica de control para procesos críticos.",
    images: ["/img/tableros-electricos.jpg", "/img/tableros-electricos.jpeg"],
  },
  {
    number: "04",
    title: "Luminaria solar",
    description: "Iluminación autónoma para calles, caminos, plazas, predios y accesos.",
    images: [
      "/img/luminaria-solar.jpg",
      "/img/luminaria-solar.jpeg",
      "/img/luminaria-solar.png",
      "/img/scada-preview.png",
    ],
  },
  {
    number: "05",
    title: "Eficiencia energética",
    description: "Medición de consumos, demanda, factor de potencia y oportunidades de ahorro.",
    images: [
      "/img/eficiencia-energetica.jpg",
      "/img/eficiencia-energetica.jpeg",
      "/img/eficiencia-energetica.png",
      "/img/correccion-energia-reactiva.jpg",
      "/img/correccion-energia-reactiva.jpeg",
      "/img/correccion-energia-reactiva.png",
    ],
  },
  {
    number: "06",
    title: "Mantenimiento de transformadores",
    description: "Inspección, diagnóstico y mantenimiento preventivo para mayor disponibilidad.",
    images: ["/img/mantenimiento-transformadores.jpg", "/img/mantenimiento-transformadores.jpeg"],
  },
  {
    number: "07",
    title: "Semáforos inteligentes",
    description: "Instalación, control y mantenimiento de semáforos inteligentes.",
    images: [
      "/img/semaforos-inteligentes.jpg",
      "/img/semaforos-inteligentes.jpeg",
      "/img/semaforos-inteligentes.png",
      "/img/scada-preview.png",
    ],
  },
  {
    number: "08",
    title: "Banco de capacitores",
    description: "Corrección de energía reactiva y mejora del factor de potencia.",
    images: [
      "/img/banco-capacitores.jpg",
      "/img/banco-capacitores.jpeg",
      "/img/banco-capacitores.png",
      "/img/eficiencia-energetica.jpg",
      "/img/correccion-energia-reactiva.jpg",
      "/img/scada-preview.png",
    ],
  },
];

const fleetVehicles = [
  {
    title: "Hidrogrúa equipada",
    eyebrow: "Altura y montaje",
    description:
      "Unidad preparada para trabajos en luminaria, semáforos, tableros, columnas, tendidos y asistencia en campo.",
    image: "/img/hidrogrua-dirac.jpg",
    uploadHint: "Subí la foto como hidrogrua-dirac.jpg",
    specs: ["Trabajo en altura", "Herramientas", "Seguridad"],
  },
  {
    title: "Camioneta de servicio",
    eyebrow: "Soporte técnico",
    description:
      "Movilidad operativa con instrumental, protecciones, repuestos y herramientas para instalaciones y mantenimiento.",
    image: "/img/camioneta-dirac.jpg",
    uploadHint: "Subí la foto como camioneta-dirac.jpg",
    specs: ["Full equipada", "Instrumental", "Respuesta rápida"],
  },
];

function HeroSolutionShowcase() {
  const [activeSolution, setActiveSolution] = useState(0);
  const [imageSourceIndex, setImageSourceIndex] = useState(0);
  const solution = heroSolutions[activeSolution];
  const imageSource = solution.images[imageSourceIndex] ?? SCADA_PREVIEW_SRC;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSolution((current) => (current + 1) % heroSolutions.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setImageSourceIndex(0);
  }, [activeSolution]);

  return (
    <div className="dirac-hero-showcase">
      <div className="dirac-hero-showcase-head">
        <div className="dirac-kicker">Qué hacemos</div>
        <h1>
          Soluciones eléctricas, solares y de control para <span>operar mejor</span>
        </h1>
        <p>
          La secuencia recorre las áreas principales de trabajo para municipalidades e industrias.
        </p>
      </div>

      <div className="dirac-solution-stage">
        <div className="dirac-solution-selector left" aria-label="Secuencia de soluciones principales">
          {heroSolutions.slice(0, 4).map((item, index) => (
            <article
              key={item.title}
              className={`dirac-solution-item ${index === activeSolution ? "active" : ""}`}
            >
              <span>{item.number}</span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </article>
          ))}
        </div>

        <div className="dirac-solution-preview">
          <div className="dirac-solution-preview-head">
            <div>
              <strong>{solution.title}</strong>
              <span>{solution.description}</span>
            </div>
            <em>Solución</em>
          </div>

          <img
            key={`${activeSolution}-${imageSourceIndex}`}
            src={imageSource}
            alt={solution.title}
            onError={(event) => {
              if (imageSourceIndex < solution.images.length - 1) {
                setImageSourceIndex((current) => current + 1);
                return;
              }

              if (event.currentTarget.src !== window.location.origin + SCADA_PREVIEW_SRC) {
                event.currentTarget.src = SCADA_PREVIEW_SRC;
              }
            }}
          />
        </div>

        <div className="dirac-solution-selector right" aria-label="Secuencia de soluciones complementarias">
          {heroSolutions.slice(4).map((item, offsetIndex) => {
            const index = offsetIndex + 4;

            return (
              <article
                key={item.title}
                className={`dirac-solution-item ${index === activeSolution ? "active" : ""}`}
              >
                <span>{item.number}</span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FleetSection() {
  return (
    <section className="dirac-fleet-section" id="vehiculos">
      <div className="dirac-shell">
        <div className="dirac-fleet-head">
          <div>
            <div className="dirac-kicker">Nuestra movilidad</div>
            <h2>Vehículos full equipados para trabajar en campo.</h2>
          </div>
          <p>
            Contamos con unidades preparadas para instalaciones, mantenimiento, montaje eléctrico,
            luminaria, automatización y asistencia técnica en municipalidades e industrias.
          </p>
        </div>

        <div className="dirac-fleet-grid">
          {fleetVehicles.map((vehicle) => (
            <article className="dirac-fleet-card" key={vehicle.title}>
              <div className="dirac-fleet-media">
                <img
                  src={vehicle.image}
                  alt={vehicle.title}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                    event.currentTarget.parentElement?.classList.add("is-missing");
                  }}
                />
                <span>{vehicle.uploadHint}</span>
              </div>

              <div className="dirac-fleet-content">
                <small>{vehicle.eyebrow}</small>
                <h3>{vehicle.title}</h3>
                <p>{vehicle.description}</p>
                <div className="dirac-fleet-specs">
                  {vehicle.specs.map((spec) => (
                    <b key={spec}>{spec}</b>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const sparkA = useRef<HTMLDivElement | null>(null);
  const sparkB = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let centerX = mouseX;
    let centerY = mouseY;
    let movement = 0;
    let frame = 0;

    const p1 = { x: mouseX - 80, y: mouseY - 40 };
    const p2 = { x: mouseX + 80, y: mouseY + 40 };

    const onMove = (event: MouseEvent) => {
      const delta = Math.hypot(event.clientX - mouseX, event.clientY - mouseY);
      mouseX = event.clientX;
      mouseY = event.clientY;
      movement = Math.min(1, movement + delta / 220);
    };

    const animate = () => {
      const t = performance.now() / 1000;

      centerX += (mouseX - centerX) * 0.09;
      centerY += (mouseY - centerY) * 0.09;
      movement *= 0.965;

      const meet = (Math.sin(t * 1.7) + 1) / 2;
      const pulse = (Math.sin(t * 3.1) + Math.cos(t * 2.35)) * 0.5;
      const distance = 22 + movement * 130 + (1 - meet) * 82 + pulse * 16;
      const wobbleA = 24 + Math.sin(t * 2.8) * 18 + Math.cos(t * 4.1) * 9;
      const wobbleB = 24 + Math.cos(t * 2.4) * 18 + Math.sin(t * 3.7) * 9;

      const angle = t * 1.35 + Math.sin(t * 0.9) * 1.1;
      const angleB = angle + Math.PI + Math.cos(t * 1.15) * 0.85;

      const target1X = centerX + Math.cos(angle) * distance + Math.sin(t * 5.2) * wobbleA;
      const target1Y = centerY + Math.sin(angle) * (distance * 0.72) + Math.cos(t * 4.4) * wobbleA;
      const target2X = centerX + Math.cos(angleB) * (distance * 0.92) + Math.cos(t * 4.7) * wobbleB;
      const target2Y = centerY + Math.sin(angleB) * (distance * 0.78) + Math.sin(t * 5.6) * wobbleB;

      p1.x += (target1X - p1.x) * 0.085;
      p1.y += (target1Y - p1.y) * 0.085;
      p2.x += (target2X - p2.x) * 0.078;
      p2.y += (target2Y - p2.y) * 0.078;

      if (sparkA.current) {
        sparkA.current.style.transform = `translate3d(${p1.x}px, ${p1.y}px, 0)`;
        sparkA.current.style.opacity = `${0.72 + meet * 0.22}`;
      }

      if (sparkB.current) {
        sparkB.current.style.transform = `translate3d(${p2.x}px, ${p2.y}px, 0)`;
        sparkB.current.style.opacity = `${0.68 + (1 - meet) * 0.24}`;
      }

      frame = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", onMove);
    frame = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="dirac-landing">
      <style>{`
        .dirac-landing {
          --ink: #071426;
          --navy: #081b33;
          --navy-2: #0e2747;
          --blue: #2563eb;
          --sky: #38bdf8;
          --green: #22c55e;
          --mint: #86efac;
          --gold: #f4c95d;
          --paper: #f8fafc;
          --white: #ffffff;
          --muted: #64748b;
          --line: #dbe4ee;
          min-height: 100vh;
          background: var(--paper);
          color: var(--ink);
          overflow-x: hidden;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          position: relative;
        }

        .dirac-landing * {
          box-sizing: border-box;
        }

        .dirac-landing a {
          color: inherit;
          text-decoration: none;
        }

        .dirac-spark {
          position: fixed;
          left: 0;
          top: 0;
          z-index: 90;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.88;
        }

        .dirac-spark::before {
          content: "";
          position: absolute;
          inset: -24px;
          border-radius: inherit;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.48), rgba(37, 99, 235, 0.18) 42%, transparent 72%);
          filter: blur(2px);
        }

        .dirac-spark::after {
          content: "";
          position: absolute;
          inset: 4px;
          border-radius: inherit;
          background: #38bdf8;
          box-shadow: 0 0 28px rgba(56, 189, 248, 0.72);
        }

        .dirac-spark.second::before {
          background: radial-gradient(circle, rgba(34, 197, 94, 0.42), rgba(34, 197, 94, 0.16) 42%, transparent 72%);
        }

        .dirac-spark.second::after {
          background: #22c55e;
          box-shadow: 0 0 28px rgba(34, 197, 94, 0.7);
        }

        .dirac-shell {
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
        }

        .dirac-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(248, 250, 252, 0.88);
          backdrop-filter: blur(18px);
          border-bottom: 1px solid var(--line);
        }

        .dirac-nav-inner {
          height: 74px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .dirac-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .dirac-logo-img {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          object-fit: contain;
          background: white;
          border: 1px solid var(--line);
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
        }

        .dirac-brand-text {
          display: grid;
          gap: 2px;
        }

        .dirac-brand-text strong {
          font-size: 18px;
          line-height: 1;
          color: #020617;
          letter-spacing: 0;
        }

        .dirac-brand-text span {
          font-size: 12px;
          color: var(--muted);
        }

        .dirac-links {
          display: flex;
          align-items: center;
          gap: 22px;
          color: #475569;
          font-size: 14px;
          font-weight: 650;
        }

        .dirac-links a:hover {
          color: var(--blue);
        }

        .dirac-login-btn,
        .dirac-primary-btn {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: var(--blue);
          color: white;
          padding: 0 18px;
          font-size: 14px;
          font-weight: 750;
          box-shadow: 0 12px 30px rgba(37, 99, 235, 0.2);
          transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        }

        .dirac-login-btn:hover,
        .dirac-primary-btn:hover {
          background: #1d4ed8;
          transform: translateY(-1px);
          box-shadow: 0 16px 34px rgba(37, 99, 235, 0.26);
        }

        .dirac-secondary-btn {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: white;
          color: #0f172a;
          padding: 0 18px;
          font-size: 14px;
          font-weight: 750;
          transition: border-color 0.18s ease, color 0.18s ease, transform 0.18s ease, background 0.18s ease;
        }

        .dirac-secondary-btn:hover {
          border-color: var(--blue);
          color: var(--blue);
          transform: translateY(-1px);
        }

        .dirac-hero .dirac-secondary-btn {
          background: rgba(255, 255, 255, 0.08);
          color: #e0f2fe;
          border-color: rgba(226, 232, 240, 0.24);
          backdrop-filter: blur(10px);
        }

        .dirac-hero .dirac-secondary-btn:hover {
          background: rgba(255, 255, 255, 0.14);
          color: white;
          border-color: rgba(125, 211, 252, 0.55);
        }

        .dirac-hero {
          position: relative;
          min-height: calc(100svh - 74px);
          color: white;
          background:
            radial-gradient(circle at 78% 32%, rgba(56, 189, 248, 0.22), transparent 32%),
            radial-gradient(circle at 74% 72%, rgba(34, 197, 94, 0.18), transparent 34%),
            linear-gradient(135deg, #071426 0%, #0e2747 52%, #0b1f3a 100%);
          overflow: hidden;
        }

        .dirac-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(148, 163, 184, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.07) 1px, transparent 1px);
          background-size: 58px 58px;
          animation: dirac-grid-drift 20s linear infinite;
          pointer-events: none;
        }

        .dirac-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(7, 20, 38, 0.92) 0%, rgba(7, 20, 38, 0.68) 43%, rgba(7, 20, 38, 0.1) 100%);
          pointer-events: none;
        }

        @keyframes dirac-grid-drift {
          from { transform: translateY(0); }
          to { transform: translateY(58px); }
        }

        .dirac-hero-grid {
          position: relative;
          z-index: 2;
          min-height: calc(100svh - 74px);
          display: grid;
          grid-template-columns: minmax(0, 0.96fr) minmax(420px, 1fr);
          gap: 44px;
          align-items: center;
          padding: 72px 0 112px;
        }

        .dirac-hero > .dirac-shell {
          position: relative;
          z-index: 2;
          width: min(1320px, calc(100% - 32px));
        }

        .dirac-hero-showcase {
          min-height: calc(100svh - 74px);
          display: grid;
          align-content: center;
          gap: 34px;
          padding: 70px 0 76px;
        }

        .dirac-hero-showcase-head {
          max-width: 980px;
        }

        .dirac-hero .dirac-hero-showcase-head h1 {
          margin: 0;
          max-width: 980px;
          color: white;
          font-size: clamp(42px, 5.4vw, 76px);
          line-height: 0.98;
          letter-spacing: -0.045em;
          font-weight: 900;
        }

        .dirac-hero .dirac-hero-showcase-head h1 span {
          color: #93c5fd;
        }

        .dirac-hero-showcase-head p {
          margin: 18px 0 0;
          max-width: 680px;
          color: rgba(226, 232, 240, 0.72);
          font-size: 17px;
          line-height: 1.65;
        }

        .dirac-solution-stage {
          position: relative;
          min-height: 620px;
          display: grid;
          grid-template-columns: minmax(210px, 0.46fr) minmax(0, 1.45fr) minmax(210px, 0.46fr);
          gap: clamp(14px, 1.7vw, 24px);
          align-items: center;
          isolation: isolate;
        }

        .dirac-solution-stage::before {
          content: "";
          position: absolute;
          left: -18px;
          right: -18px;
          top: 32px;
          bottom: 32px;
          border-radius: 38px;
          background:
            radial-gradient(circle at 18% 32%, rgba(34, 197, 94, 0.18), transparent 34%),
            radial-gradient(circle at 82% 20%, rgba(56, 189, 248, 0.18), transparent 34%),
            rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(226, 232, 240, 0.1);
          pointer-events: none;
          z-index: -1;
        }

        .dirac-solution-selector {
          position: relative;
          left: auto;
          top: auto;
          z-index: 4;
          width: 100%;
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          align-content: center;
          transform: none;
        }

        .dirac-solution-selector.right {
          grid-template-columns: 1fr;
          align-content: center;
        }

        .dirac-solution-item {
          --lift: 0px;
          min-height: 112px;
          display: grid;
          grid-template-columns: 34px 1fr;
          align-content: start;
          align-items: center;
          gap: 5px 13px;
          padding: 15px;
          border: 1px solid rgba(226, 232, 240, 0.16);
          border-radius: 18px;
          position: relative;
          overflow: hidden;
          cursor: default;
          background: rgba(16, 37, 63, 0.76);
          color: white;
          text-align: left;
          box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
          backdrop-filter: blur(18px);
          transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }

        .dirac-solution-item:nth-child(2) {
          --lift: 0px;
          transform: translateY(var(--lift));
        }

        .dirac-solution-item:nth-child(3) {
          --lift: 0px;
          transform: translateY(var(--lift));
        }

        .dirac-solution-item:nth-child(4) {
          --lift: 0px;
          transform: translateY(var(--lift));
        }

        .dirac-solution-item:nth-child(5) {
          --lift: 0px;
          transform: translateY(var(--lift));
        }

        .dirac-solution-item:nth-child(6) {
          --lift: 0px;
          transform: translateY(var(--lift));
        }

        .dirac-solution-item span {
          grid-row: 1 / 3;
          width: 31px;
          height: 31px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: rgba(96, 165, 250, 0.1);
          border: 1px solid rgba(147, 197, 253, 0.18);
          color: #60a5fa;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.12em;
        }

        .dirac-solution-item strong {
          color: white;
          font-size: 17px;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }

        .dirac-solution-item small {
          max-width: 330px;
          color: rgba(226, 232, 240, 0.68);
          font-size: 11.5px;
          line-height: 1.42;
        }

        .dirac-solution-item.active {
          background: rgba(21, 53, 86, 0.92);
          border-color: rgba(125, 211, 252, 0.36);
        }

        .dirac-solution-item.active {
          box-shadow: inset 4px 0 0 var(--green), 0 24px 58px rgba(0, 0, 0, 0.26);
          transform: translateX(6px) translateY(var(--lift));
        }

        .dirac-solution-selector.right .dirac-solution-item.active {
          box-shadow: inset -4px 0 0 var(--green), 0 24px 58px rgba(0, 0, 0, 0.26);
          transform: translateX(-6px) translateY(var(--lift));
        }

        .dirac-solution-item.active span {
          color: var(--green);
        }

        .dirac-solution-item.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--green), var(--sky));
          transform-origin: left center;
          animation: dirac-solution-progress 4.5s linear both;
        }

        @keyframes dirac-solution-progress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }

        .dirac-solution-preview {
          min-width: 0;
          width: 100%;
          min-height: 600px;
          margin-left: 0;
          display: grid;
          grid-template-rows: auto 1fr;
          overflow: hidden;
          border-radius: 34px;
          border: 1px solid rgba(226, 232, 240, 0.18);
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 34px 100px rgba(0, 0, 0, 0.34);
        }

        .dirac-solution-preview-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 22px;
          border-bottom: 1px solid #e2e8f0;
        }

        .dirac-solution-preview-head strong {
          display: block;
          color: #020617;
          font-size: 18px;
          line-height: 1.1;
        }

        .dirac-solution-preview-head span {
          display: block;
          margin-top: 4px;
          color: #64748b;
          font-size: 13px;
          line-height: 1.4;
        }

        .dirac-solution-preview-head em {
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: #f0fdf4;
          color: #15803d;
          border: 1px solid #bbf7d0;
          padding: 0 12px;
          font-size: 12px;
          font-style: normal;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }

        .dirac-solution-preview img {
          display: block;
          width: 100%;
          height: 100%;
          min-height: 430px;
          object-fit: contain;
          background: white;
          animation: dirac-preview-slide 0.72s ease both;
        }

        @keyframes dirac-preview-slide {
          from {
            opacity: 0;
            transform: translateX(18px) scale(1.015);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        .dirac-fleet-section {
          position: relative;
          padding: 84px 0;
          background:
            radial-gradient(circle at 15% 10%, rgba(34, 197, 94, 0.1), transparent 34%),
            radial-gradient(circle at 85% 20%, rgba(37, 99, 235, 0.09), transparent 34%),
            #f8fafc;
          border-bottom: 1px solid var(--line);
          overflow: hidden;
        }

        .dirac-fleet-section::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(34, 197, 94, 0.45), rgba(37, 99, 235, 0.35), transparent);
        }

        .dirac-fleet-head {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(280px, 0.7fr);
          gap: 34px;
          align-items: end;
          margin-bottom: 32px;
        }

        .dirac-fleet-head h2 {
          margin: 0;
          max-width: 760px;
          color: #071426;
          font-size: clamp(34px, 4.4vw, 58px);
          line-height: 1;
          letter-spacing: -0.045em;
        }

        .dirac-fleet-head p {
          margin: 0;
          color: #475569;
          font-size: 16px;
          line-height: 1.7;
        }

        .dirac-fleet-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
        }

        .dirac-fleet-card {
          display: grid;
          grid-template-rows: minmax(290px, 1fr) auto;
          overflow: hidden;
          border-radius: 28px;
          background: white;
          border: 1px solid #e2e8f0;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.1);
        }

        .dirac-fleet-media {
          position: relative;
          min-height: 290px;
          display: grid;
          place-items: center;
          overflow: hidden;
          background:
            linear-gradient(135deg, rgba(15, 23, 42, 0.06), rgba(34, 197, 94, 0.08)),
            repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.14) 0 1px, transparent 1px 18px),
            #eef6f1;
        }

        .dirac-fleet-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.45s ease;
        }

        .dirac-fleet-card:hover .dirac-fleet-media img {
          transform: scale(1.035);
        }

        .dirac-fleet-media span {
          position: absolute;
          left: 22px;
          right: 22px;
          bottom: 20px;
          min-height: 44px;
          display: none;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          border: 1px dashed rgba(37, 99, 235, 0.35);
          background: rgba(255, 255, 255, 0.78);
          color: #1e3a8a;
          font-size: 13px;
          font-weight: 850;
          text-align: center;
          backdrop-filter: blur(14px);
        }

        .dirac-fleet-media.is-missing span {
          display: inline-flex;
        }

        .dirac-fleet-media.is-missing::before {
          content: "";
          width: 92px;
          height: 92px;
          border-radius: 28px;
          border: 1px solid rgba(34, 197, 94, 0.24);
          background:
            linear-gradient(135deg, rgba(34, 197, 94, 0.14), rgba(37, 99, 235, 0.08)),
            #ffffff;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
        }

        .dirac-fleet-content {
          padding: 24px;
        }

        .dirac-fleet-content small {
          display: block;
          color: var(--blue);
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          margin-bottom: 10px;
        }

        .dirac-fleet-content h3 {
          margin: 0;
          color: #071426;
          font-size: 28px;
          line-height: 1.05;
          letter-spacing: -0.035em;
        }

        .dirac-fleet-content p {
          margin: 14px 0 0;
          color: #475569;
          font-size: 15px;
          line-height: 1.65;
        }

        .dirac-fleet-specs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 20px;
        }

        .dirac-fleet-specs b {
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #bbf7d0;
          padding: 0 11px;
          font-size: 12px;
          font-weight: 850;
        }

        .dirac-kicker {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: #93c5fd;
          font-size: 12px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 22px;
        }

        .dirac-kicker::before {
          content: "";
          width: 38px;
          height: 2px;
          border-radius: 999px;
          background: var(--green);
        }

        .dirac-hero h1 {
          margin: 0;
          max-width: 760px;
          color: white;
          font-size: clamp(42px, 5.8vw, 78px);
          line-height: 0.96;
          letter-spacing: -0.04em;
          font-weight: 900;
        }

        .dirac-hero h1 span {
          color: #93c5fd;
        }

        .dirac-lead {
          margin: 26px 0 0;
          max-width: 610px;
          color: rgba(226, 232, 240, 0.76);
          font-size: 17px;
          line-height: 1.72;
        }

        .dirac-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 34px;
        }

        .dirac-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 28px;
        }

        .dirac-tag {
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid rgba(226, 232, 240, 0.18);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.82);
          padding: 0 12px;
          font-size: 13px;
          font-weight: 700;
          backdrop-filter: blur(10px);
        }

        .dirac-tag.green {
          color: #dcfce7;
          background: rgba(34, 197, 94, 0.13);
          border-color: rgba(34, 197, 94, 0.26);
        }

        .dirac-hero-stats {
          position: absolute;
          z-index: 3;
          left: max(16px, calc((100vw - 1180px) / 2));
          right: max(16px, calc((100vw - 1180px) / 2));
          bottom: 38px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 22px;
          padding-top: 26px;
          border-top: 1px solid rgba(226, 232, 240, 0.14);
        }

        .dirac-hero-stat strong {
          display: block;
          color: #7dd3fc;
          font-size: 32px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .dirac-hero-stat span {
          display: block;
          margin-top: 8px;
          color: rgba(226, 232, 240, 0.6);
          font-size: 11px;
          line-height: 1.45;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .dirac-tech-visual {
          position: relative;
          min-height: 520px;
        }

        .dirac-orb {
          position: absolute;
          right: 34px;
          top: 36px;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(244, 201, 93, 0.2), rgba(56, 189, 248, 0.12) 42%, transparent 70%);
          animation: dirac-orb-pulse 6s ease-in-out infinite;
        }

        .dirac-orb::before,
        .dirac-orb::after {
          content: "";
          position: absolute;
          border-radius: 50%;
        }

        .dirac-orb::before {
          inset: 22px;
          border: 1px solid rgba(147, 197, 253, 0.24);
          animation: dirac-spin 22s linear infinite;
        }

        .dirac-orb::after {
          inset: 62px;
          border: 1px dashed rgba(34, 197, 94, 0.28);
          animation: dirac-spin 34s linear infinite reverse;
        }

        @keyframes dirac-orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.86; }
          50% { transform: scale(1.05); opacity: 1; }
        }

        @keyframes dirac-spin {
          to { transform: rotate(360deg); }
        }

        .dirac-panel-array {
          position: absolute;
          left: 10px;
          top: 86px;
          width: min(430px, 78%);
          height: 280px;
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          grid-template-rows: repeat(4, 1fr);
          gap: 5px;
          transform: perspective(900px) rotateY(-16deg) rotateX(8deg) rotateZ(-5deg);
          filter: drop-shadow(0 28px 40px rgba(0, 0, 0, 0.28));
        }

        .dirac-panel-cell {
          position: relative;
          overflow: hidden;
          border-radius: 4px;
          border: 1px solid rgba(147, 197, 253, 0.28);
          background:
            linear-gradient(135deg, rgba(96, 165, 250, 0.9), rgba(30, 58, 138, 0.95)),
            #1e3a8a;
          animation: dirac-panel-glow 3.4s ease-in-out infinite;
          animation-delay: var(--delay);
        }

        .dirac-panel-cell::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 31%;
          height: 1px;
          background: rgba(255, 255, 255, 0.24);
        }

        .dirac-panel-cell::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(45deg, transparent 38%, rgba(255, 255, 255, 0.26), transparent 63%);
          transform: translateX(-140%);
          animation: dirac-shimmer 4.3s ease-in-out infinite;
          animation-delay: var(--delay);
        }

        @keyframes dirac-panel-glow {
          50% {
            box-shadow: inset 0 0 30px rgba(147, 197, 253, 0.18), 0 0 18px rgba(56, 189, 248, 0.12);
          }
        }

        @keyframes dirac-shimmer {
          0% { transform: translateX(-140%); }
          55%, 100% { transform: translateX(140%); }
        }

        .dirac-panel-stand {
          position: absolute;
          left: 190px;
          top: 348px;
          width: 10px;
          height: 120px;
          border-radius: 999px;
          background: linear-gradient(#cbd5e1, #64748b);
          transform: rotate(7deg);
        }

        .dirac-field-line {
          position: absolute;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.55), rgba(34, 197, 94, 0.34));
          transform-origin: left center;
        }

        .dirac-field-line.a {
          left: 74px;
          bottom: 78px;
          width: 270px;
          transform: rotate(-9deg);
        }

        .dirac-field-line.b {
          right: 144px;
          top: 178px;
          width: 185px;
          transform: rotate(27deg);
        }

        .dirac-node {
          position: absolute;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: var(--sky);
          box-shadow: 0 0 0 8px rgba(56, 189, 248, 0.12), 0 0 28px rgba(56, 189, 248, 0.45);
        }

        .dirac-node.green {
          background: var(--green);
          box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.12), 0 0 28px rgba(34, 197, 94, 0.45);
        }

        .dirac-node.one { left: 70px; bottom: 72px; }
        .dirac-node.two { left: 338px; bottom: 112px; }
        .dirac-node.three { right: 268px; top: 154px; }

        .dirac-control-card {
          position: absolute;
          right: 12px;
          bottom: 50px;
          width: 215px;
          padding: 18px;
          border: 1px solid rgba(226, 232, 240, 0.16);
          border-radius: 18px;
          background: rgba(8, 27, 51, 0.74);
          backdrop-filter: blur(18px);
          box-shadow: 0 22px 58px rgba(0, 0, 0, 0.28);
        }

        .dirac-control-screen {
          height: 52px;
          border-radius: 12px;
          background: #020617;
          margin-bottom: 16px;
          position: relative;
          overflow: hidden;
        }

        .dirac-control-screen::before {
          content: "";
          position: absolute;
          left: 14px;
          top: 14px;
          width: 68px;
          height: 6px;
          border-radius: 999px;
          background: var(--green);
          box-shadow: 0 0 14px rgba(34, 197, 94, 0.5);
        }

        .dirac-control-screen::after {
          content: "";
          position: absolute;
          left: 14px;
          right: 16px;
          bottom: 14px;
          height: 5px;
          border-radius: 999px;
          background: var(--sky);
        }

        .dirac-light-row {
          display: grid;
          grid-template-columns: repeat(3, 14px);
          gap: 10px;
          margin-bottom: 16px;
        }

        .dirac-light-row i {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 15px rgba(34, 197, 94, 0.55);
        }

        .dirac-light-row i:nth-child(2) {
          background: var(--sky);
          box-shadow: 0 0 15px rgba(56, 189, 248, 0.52);
        }

        .dirac-light-row i:nth-child(3) {
          background: var(--gold);
          box-shadow: 0 0 15px rgba(244, 201, 93, 0.52);
        }

        .dirac-mini-line {
          height: 8px;
          border-radius: 999px;
          background: rgba(226, 232, 240, 0.16);
          margin-top: 9px;
          overflow: hidden;
        }

        .dirac-mini-line span {
          display: block;
          height: 100%;
          width: 68%;
          background: var(--sky);
          border-radius: inherit;
        }

        .dirac-floating-metrics {
          position: absolute;
          left: 18px;
          bottom: 20px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 9px;
          width: min(390px, calc(100% - 250px));
        }

        .dirac-floating-metrics div {
          border: 1px solid rgba(226, 232, 240, 0.16);
          border-radius: 14px;
          background: rgba(8, 27, 51, 0.64);
          backdrop-filter: blur(14px);
          padding: 13px;
        }

        .dirac-floating-metrics span {
          display: block;
          color: rgba(226, 232, 240, 0.64);
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 7px;
        }

        .dirac-floating-metrics strong {
          display: block;
          color: #7dd3fc;
          font-size: 21px;
          line-height: 1;
        }

        .dirac-ticker {
          overflow: hidden;
          white-space: nowrap;
          background: #102a4b;
          border-block: 1px solid rgba(226, 232, 240, 0.08);
          padding: 14px 0;
        }

        .dirac-ticker-track {
          display: inline-flex;
          animation: dirac-ticker 28s linear infinite;
        }

        .dirac-ticker span {
          display: flex;
          align-items: center;
          gap: 42px;
          padding: 0 42px;
          color: rgba(226, 232, 240, 0.74);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .dirac-ticker span::after {
          content: "";
          width: 5px;
          height: 5px;
          transform: rotate(45deg);
          background: var(--green);
        }

        @keyframes dirac-ticker {
          to { transform: translateX(-50%); }
        }

        .dirac-section {
          padding: 86px 0;
          background: var(--paper);
        }

        .dirac-section.white {
          background: white;
          border-block: 1px solid var(--line);
        }

        .dirac-section-head {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(280px, 0.55fr);
          gap: 42px;
          align-items: end;
          margin-bottom: 34px;
        }

        .dirac-section h2 {
          margin: 0;
          color: #020617;
          font-size: clamp(32px, 4vw, 52px);
          line-height: 1.05;
          letter-spacing: -0.03em;
        }

        .dirac-section-text {
          margin: 0;
          color: var(--muted);
          font-size: 17px;
          line-height: 1.65;
        }

        .dirac-service-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 2px;
          border: 1px solid var(--line);
          border-radius: 18px;
          overflow: hidden;
          background: var(--line);
        }

        .dirac-card {
          position: relative;
          min-height: 265px;
          background: white;
          padding: 34px;
          transition: transform 0.22s ease, background 0.22s ease;
          overflow: hidden;
        }

        .dirac-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 3px;
          height: 0;
          background: linear-gradient(var(--sky), var(--green));
          transition: height 0.28s ease;
        }

        .dirac-card:hover {
          background: #f8fbff;
          transform: translateY(-2px);
        }

        .dirac-card:hover::before {
          height: 100%;
        }

        .dirac-card-mark {
          color: var(--blue);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
          margin-bottom: 28px;
        }

        .dirac-card h3 {
          margin: 0 0 12px;
          color: #0f172a;
          font-size: 23px;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        .dirac-card p {
          margin: 0;
          color: var(--muted);
          font-size: 15px;
          line-height: 1.62;
        }

        .dirac-scada-photo {
          margin-top: 34px;
          border: 1px solid var(--line);
          border-radius: 24px;
          background: white;
          padding: 18px;
          box-shadow: 0 26px 70px rgba(15, 23, 42, 0.1);
          overflow: hidden;
        }

        .dirac-scada-photo-head {
          min-height: 54px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 4px 16px;
          border-bottom: 1px solid var(--line);
          margin-bottom: 18px;
        }

        .dirac-scada-photo-head strong {
          display: block;
          color: #020617;
          font-size: 18px;
        }

        .dirac-scada-photo-head span {
          display: block;
          margin-top: 3px;
          color: var(--muted);
          font-size: 13px;
        }

        .dirac-scada-photo-live {
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 999px;
          background: #f0fdf4;
          color: #15803d;
          border: 1px solid #bbf7d0;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }

        .dirac-scada-photo-live::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.14);
        }

        .dirac-scada-photo-frame {
          position: relative;
          aspect-ratio: 16 / 9;
          border-radius: 18px;
          overflow: hidden;
          background: white;
          border: 1px solid #e2e8f0;
        }

        .dirac-scada-photo-frame img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          position: relative;
          z-index: 2;
        }

        .dirac-scada-photo-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 270px;
          gap: 16px;
          align-items: stretch;
        }

        .dirac-showcase-controls {
          display: grid;
          align-content: start;
          gap: 10px;
        }

        .dirac-showcase-controls button {
          width: 100%;
          min-height: 58px;
          display: grid;
          grid-template-columns: 34px 1fr;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid #dbe4ee;
          border-radius: 14px;
          cursor: pointer;
          background: #f8fafc;
          color: #334155;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.25;
          text-align: left;
          transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease, transform 0.2s ease;
        }

        .dirac-showcase-controls button span {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: white;
          color: var(--blue);
          border: 1px solid #dbe4ee;
          font-size: 11px;
          font-weight: 950;
          line-height: 1;
        }

        .dirac-showcase-controls button.active {
          color: #0f172a;
          background: #eef6ff;
          border-color: #93c5fd;
          transform: translateX(-2px);
        }

        .dirac-showcase-controls button.active span {
          color: white;
          background: linear-gradient(135deg, var(--blue), var(--green));
          border-color: transparent;
        }

        .dirac-scada-glow {
          position: absolute;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          filter: blur(34px);
          opacity: 0.42;
          pointer-events: none;
          z-index: 3;
          mix-blend-mode: screen;
        }

        .dirac-scada-glow.one {
          left: 12%;
          bottom: 12%;
          background: rgba(56, 189, 248, 0.55);
        }

        .dirac-scada-glow.two {
          right: 14%;
          top: 18%;
          background: rgba(34, 197, 94, 0.42);
        }

        .dirac-feature {
          background: #0b1f3a;
          color: white;
          padding: 92px 0;
        }

        .dirac-feature-grid {
          display: grid;
          grid-template-columns: minmax(340px, 0.88fr) minmax(0, 1fr);
          gap: 70px;
          align-items: center;
        }

        .dirac-feature h2 {
          color: white;
        }

        .dirac-feature .dirac-section-text {
          color: rgba(226, 232, 240, 0.7);
        }

        .dirac-feature-panel {
          height: 430px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(3, 1fr);
          gap: 7px;
          transform: perspective(900px) rotateY(-16deg) rotateX(6deg);
        }

        .dirac-feature-panel i {
          border-radius: 5px;
          border: 1px solid rgba(147, 197, 253, 0.22);
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.42), rgba(14, 39, 71, 0.94));
          position: relative;
          overflow: hidden;
          animation: dirac-panel-glow 3.4s ease-in-out infinite;
          animation-delay: var(--delay);
        }

        .dirac-feature-panel i::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(45deg, transparent 38%, rgba(255, 255, 255, 0.16), transparent 63%);
          transform: translateX(-140%);
          animation: dirac-shimmer 4.3s ease-in-out infinite;
          animation-delay: var(--delay);
        }

        .dirac-feature-list {
          display: grid;
          gap: 18px;
          margin-top: 30px;
        }

        .dirac-feature-item {
          display: grid;
          grid-template-columns: 10px 1fr;
          gap: 18px;
          padding: 18px 0;
          border-bottom: 1px solid rgba(226, 232, 240, 0.12);
        }

        .dirac-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--green);
          margin-top: 8px;
          box-shadow: 0 0 16px rgba(34, 197, 94, 0.72);
        }

        .dirac-feature-item h3 {
          margin: 0 0 6px;
          font-size: 18px;
          letter-spacing: -0.01em;
        }

        .dirac-feature-item p {
          margin: 0;
          color: rgba(226, 232, 240, 0.68);
          font-size: 14px;
          line-height: 1.65;
        }

        .dirac-sector-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .dirac-sector {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: white;
          padding: 30px;
        }

        .dirac-sector h3 {
          margin: 0 0 12px;
          color: #0f172a;
          font-size: 26px;
          letter-spacing: -0.02em;
        }

        .dirac-sector p {
          margin: 0;
          color: var(--muted);
          line-height: 1.65;
        }

        .dirac-cta {
          background: #071426;
          color: white;
          padding: 64px 0;
        }

        .dirac-cta-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .dirac-cta h2 {
          margin: 0;
          font-size: clamp(30px, 4vw, 48px);
          line-height: 1.06;
          letter-spacing: -0.03em;
        }

        .dirac-cta p {
          margin: 12px 0 0;
          max-width: 620px;
          color: rgba(226, 232, 240, 0.72);
          line-height: 1.65;
        }

        .dirac-footer {
          border-top: 1px solid var(--line);
          background: white;
          color: var(--muted);
          padding: 25px 0;
          font-size: 14px;
        }

        .dirac-footer-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .dirac-footer strong {
          color: #0f172a;
        }

        .dirac-footer-contact {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .dirac-footer-contact a {
          color: #0f172a;
          font-weight: 700;
        }

        .dirac-footer-contact a:hover {
          color: var(--blue);
        }

        @media (max-width: 980px) {
          .dirac-links {
            display: none;
          }

          .dirac-hero-grid,
          .dirac-section-head,
          .dirac-fleet-head,
          .dirac-feature-grid {
            grid-template-columns: 1fr;
          }

          .dirac-hero-grid {
            padding-bottom: 210px;
          }

          .dirac-hero-showcase {
            min-height: auto;
            padding: 56px 0 64px;
          }

          .dirac-solution-stage {
            min-height: auto;
            display: grid;
            grid-template-columns: 1fr;
            gap: 18px;
          }

          .dirac-solution-stage::before {
            left: 0;
            right: 0;
            top: 6%;
            bottom: 6%;
          }

          .dirac-solution-selector {
            position: relative;
            left: auto;
            top: auto;
            width: 100%;
            transform: none;
            order: 2;
          }

          .dirac-solution-selector.right {
            order: 3;
            grid-template-columns: 1fr;
          }

          .dirac-solution-item,
          .dirac-solution-item:nth-child(n),
          .dirac-solution-item.active,
          .dirac-solution-selector.right .dirac-solution-item.active {
            transform: none;
          }

          .dirac-solution-preview {
            width: 100%;
            min-height: auto;
            order: 1;
          }

          .dirac-tech-visual {
            min-height: 460px;
          }

          .dirac-hero-stats {
            grid-template-columns: repeat(2, 1fr);
          }

          .dirac-service-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dirac-fleet-grid {
            grid-template-columns: 1fr;
          }

          .dirac-scada-photo-body {
            grid-template-columns: 1fr;
          }

          .dirac-showcase-controls {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .dirac-spark {
            display: none;
          }

          .dirac-brand-text span {
            display: none;
          }

          .dirac-nav-inner {
            height: 66px;
          }

          .dirac-login-btn {
            padding: 0 13px;
            font-size: 13px;
          }

          .dirac-hero-grid {
            grid-template-columns: 1fr;
            padding: 48px 0 230px;
            gap: 34px;
          }

          .dirac-hero-showcase {
            padding: 42px 0 54px;
            gap: 22px;
          }

          .dirac-hero .dirac-hero-showcase-head h1 {
            font-size: 34px;
            line-height: 1.03;
            letter-spacing: -0.035em;
          }

          .dirac-hero-showcase-head p {
            font-size: 15px;
            line-height: 1.55;
          }

          .dirac-solution-stage {
            display: block;
          }

          .dirac-solution-stage::before {
            left: -18px;
            right: -18px;
            top: -12px;
            bottom: -12px;
            border-radius: 26px;
            background:
              radial-gradient(circle at 12% 10%, rgba(34, 197, 94, 0.16), transparent 42%),
              radial-gradient(circle at 88% 20%, rgba(56, 189, 248, 0.14), transparent 40%),
              rgba(255, 255, 255, 0.035);
          }

          .dirac-solution-selector {
            grid-template-columns: 1fr;
            gap: 10px;
            order: 1;
            border: 0;
            border-radius: 0;
            background: transparent;
            backdrop-filter: none;
          }

          .dirac-solution-selector.right {
            grid-template-columns: 1fr;
          }

          .dirac-solution-selector.right .dirac-solution-item {
            min-height: 92px;
            grid-template-columns: 42px 1fr;
          }

          .dirac-solution-item {
            min-height: 92px;
            display: grid;
            grid-template-columns: 42px 1fr;
            gap: 7px 13px;
            align-content: center;
            padding: 16px;
            border-radius: 18px;
            background: rgba(16, 37, 63, 0.82);
            border-color: rgba(226, 232, 240, 0.14);
            box-shadow: 0 16px 38px rgba(0, 0, 0, 0.18);
          }

          .dirac-solution-item span {
            grid-row: 1 / 3;
            width: 38px;
            height: 38px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 14px;
            background: rgba(96, 165, 250, 0.12);
            color: #93c5fd;
            border: 1px solid rgba(147, 197, 253, 0.22);
          }

          .dirac-solution-selector.right .dirac-solution-item span {
            grid-row: 1 / 3;
          }

          .dirac-solution-item strong {
            font-size: 19px;
            line-height: 1.05;
          }

          .dirac-solution-item small {
            font-size: 13px;
            line-height: 1.45;
          }

          .dirac-solution-item.active {
            background: linear-gradient(135deg, rgba(20, 83, 45, 0.92), rgba(21, 53, 86, 0.94));
            border-color: rgba(134, 239, 172, 0.34);
            box-shadow: inset 4px 0 0 var(--green), 0 18px 44px rgba(0, 0, 0, 0.24);
          }

          .dirac-solution-item.active span {
            color: #052e16;
            background: var(--mint);
            border-color: transparent;
          }

          .dirac-solution-preview {
            display: none;
          }

          .dirac-hero h1 {
            font-size: 42px;
            line-height: 1;
          }

          .dirac-lead {
            font-size: 16px;
          }

          .dirac-actions {
            display: grid;
          }

          .dirac-primary-btn,
          .dirac-secondary-btn {
            width: 100%;
          }

          .dirac-tech-visual {
            min-height: 360px;
            margin-top: 8px;
            overflow: visible;
          }

          .dirac-orb {
            width: 210px;
            height: 210px;
            right: 4px;
            top: 8px;
            opacity: 0.75;
          }

          .dirac-panel-array {
            width: 270px;
            height: 178px;
            left: 50%;
            top: 34px;
            transform: translateX(-50%) perspective(760px) rotateX(10deg) rotateZ(-4deg);
          }

          .dirac-panel-stand {
            left: 50%;
            top: 198px;
            height: 92px;
          }

          .dirac-control-card {
            width: min(230px, calc(100% - 32px));
            right: 16px;
            bottom: 6px;
          }

          .dirac-floating-metrics {
            display: none;
          }

          .dirac-node,
          .dirac-field-line {
            display: none;
          }

          .dirac-hero-stats {
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            bottom: 26px;
          }

          .dirac-hero-stat strong {
            font-size: 25px;
          }

          .dirac-service-grid,
          .dirac-sector-grid {
            grid-template-columns: 1fr;
          }

          .dirac-card {
            min-height: auto;
            padding: 28px 24px;
          }

          .dirac-section,
          .dirac-fleet-section,
          .dirac-feature {
            padding: 70px 0;
          }

          .dirac-fleet-head {
            gap: 16px;
            margin-bottom: 22px;
          }

          .dirac-fleet-head h2 {
            font-size: 34px;
            line-height: 1.04;
          }

          .dirac-fleet-head p {
            font-size: 15px;
            line-height: 1.6;
          }

          .dirac-fleet-card {
            grid-template-rows: minmax(220px, auto) auto;
            border-radius: 22px;
          }

          .dirac-fleet-media {
            min-height: 220px;
          }

          .dirac-fleet-content {
            padding: 20px;
          }

          .dirac-fleet-content h3 {
            font-size: 24px;
          }

          .dirac-feature-panel {
            height: 300px;
          }

          .dirac-scada-photo {
            padding: 14px;
            border-radius: 18px;
          }

          .dirac-scada-photo-head {
            align-items: flex-start;
            flex-direction: column;
          }

          .dirac-scada-photo-frame {
            aspect-ratio: 4 / 3;
            border-radius: 14px;
          }

          .dirac-scada-photo-frame img {
            height: 100%;
            object-fit: contain;
          }

          .dirac-showcase-controls {
            grid-template-columns: 1fr;
          }

          .dirac-showcase-controls button.active {
            transform: none;
          }

          .dirac-scada-glow {
            display: none;
          }

          .dirac-cta-inner {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <div ref={sparkA} className="dirac-spark" />
      <div ref={sparkB} className="dirac-spark second" />

      <nav className="dirac-nav">
        <div className="dirac-shell dirac-nav-inner">
          <a className="dirac-brand" href="#inicio">
            <img className="dirac-logo-img" src={LOGO_SRC} alt="DIRAC" />
            <span className="dirac-brand-text">
              <strong>DIRAC</strong>
              <span>Panel de monitoreo</span>
            </span>
          </a>

          <div className="dirac-links">
            <a href="#servicios">Servicios</a>
            <a href="#solar">Solar</a>
            <a href="#vehiculos">Vehículos</a>
            <a href="#sectores">Sectores</a>
          </div>

          <Link className="dirac-login-btn" to="/login">
            Iniciar sesión
          </Link>
        </div>
      </nav>

      <main id="inicio">
        <section className="dirac-hero">
          <div className="dirac-shell">
            <HeroSolutionShowcase />
          </div>
        </section>

        <FleetSection />

        <div className="dirac-ticker" aria-hidden="true">
          <div className="dirac-ticker-track">
            {[...tickerItems, ...tickerItems].map((item, index) => (
              <span key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        </div>

        <section className="dirac-section white" id="servicios">
          <div className="dirac-shell">
            <div className="dirac-section-head">
              <div>
                <div className="dirac-kicker">Qué hacemos</div>
                <h2>Energía solar, tableros, telemetría y eficiencia energética.</h2>
              </div>
              <p className="dirac-section-text">
                Instalamos, automatizamos y monitoreamos sistemas eléctricos para municipios e industrias.
              </p>
            </div>

            <div className="dirac-service-grid">
              {services.map((service) => (
                <article className="dirac-card" key={service.number}>
                  <div className="dirac-card-mark">{service.number}</div>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="dirac-feature" id="solar">
          <div className="dirac-shell dirac-feature-grid">
            <div className="dirac-feature-panel" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, index) => (
                <i key={index} style={{ "--delay": `${(index % 5) * 0.22}s` } as CSSProperties} />
              ))}
            </div>

            <div>
              <div className="dirac-kicker">Energía solar aplicada</div>
              <h2>Autonomía para sistemas remotos y puntos críticos.</h2>
              <p className="dirac-section-text">
                La energía solar no queda como accesorio: alimenta sensores, cámaras,
                telemetría, iluminación y activos que necesitan continuidad.
              </p>

              <div className="dirac-feature-list">
                <div className="dirac-feature-item">
                  <div className="dirac-dot" />
                  <div>
                    <h3>Sensores y estaciones remotas</h3>
                    <p>Presión, nivel, caudal, cámaras, enlaces y equipos de campo.</p>
                  </div>
                </div>

                <div className="dirac-feature-item">
                  <div className="dirac-dot" />
                  <div>
                    <h3>Iluminación y seguridad</h3>
                    <p>Luminarias solares y cámaras 4G para accesos, predios, caminos y espacios públicos.</p>
                  </div>
                </div>

                <div className="dirac-feature-item">
                  <div className="dirac-dot" />
                  <div>
                    <h3>Monitoreo del sistema</h3>
                    <p>Estado de batería, consumo, disponibilidad, eventos y alarmas.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="dirac-section white" id="sectores">
          <div className="dirac-shell">
            <div className="dirac-section-head">
              <div>
                <div className="dirac-kicker">Aplicación</div>
                <h2>Para municipalidades e industrias.</h2>
              </div>
              <p className="dirac-section-text">
                La misma base tecnológica se adapta a servicios públicos, plantas,
                predios industriales e infraestructura remota.
              </p>
            </div>

            <div className="dirac-sector-grid">
              <article className="dirac-sector">
                <h3>Municipalidades</h3>
                <p>
                  Telemetría de agua, bombeos, tanques, luminaria solar,
                  cámaras solares, alumbrado, tableros, reportes y eficiencia energética.
                </p>
              </article>

              <article className="dirac-sector">
                <h3>Industrias</h3>
                <p>
                  Medición energética, automatización de procesos, sensores, control
                  de consumos, mantenimiento preventivo, alarmas y datos operativos.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="dirac-cta">
          <div className="dirac-shell dirac-cta-inner">
            <div>
              <h2>Ingresar al panel DIRAC</h2>
              <p>
                Accedé al monitoreo de telemetría, energía y activos operativos.
              </p>
            </div>

            <Link className="dirac-primary-btn" to="/login">
              Iniciar sesión
            </Link>
          </div>
        </section>
      </main>

      <footer className="dirac-footer">
        <div className="dirac-shell dirac-footer-inner">
          <div>
            <strong>DIRAC</strong>
            <span> · Energía solar · Telemetría · Automatización · Eficiencia energética</span>
          </div>
          <div className="dirac-footer-contact">
            <span>Contacto:</span>
            <a href="tel:+542993251398">(299) 3251398</a>
            <a href="tel:+542994292985">(299) 4292985</a>
            <a href="mailto:administracion@diracserviciosenergia.com">
              administracion@diracserviciosenergia.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
