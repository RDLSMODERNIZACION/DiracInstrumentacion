import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

const LOGO_SRC = "/img/logodirac.jpeg";

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
    title: "Cargaderos",
    description:
      "Control de usuarios, permisos, caudalímetros, válvulas, bombas, turnos y trazabilidad.",
  },
  {
    number: "05",
    title: "Eficiencia energética",
    description:
      "Medición de kW, kWh, demanda máxima, factor de potencia y oportunidades reales de ahorro.",
  },
  {
    number: "06",
    title: "Municipios e industrias",
    description:
      "Soluciones para servicios públicos, plantas de agua, predios industriales y sistemas remotos.",
  },
];

const tickerItems = [
  "Energía solar",
  "Telemetría",
  "Automatización",
  "Cargaderos",
  "Eficiencia energética",
  "Municipalidades",
  "Industrias",
];

const chartBars = [42, 58, 66, 54, 72, 86, 62, 92, 78, 70, 88, 96, 74, 84, 68, 90];

export default function Landing() {
  const sparkA = useRef<HTMLDivElement | null>(null);
  const sparkB = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let separatedUntil = 0;
    let frame = 0;

    const p1 = { x: mouseX - 180, y: mouseY - 110 };
    const p2 = { x: mouseX + 180, y: mouseY + 110 };

    const onMove = (event: MouseEvent) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      separatedUntil = performance.now() + 620;
    };

    const animate = () => {
      const now = performance.now();
      const separated = now < separatedUntil;

      const target1X = separated ? mouseX - 180 : mouseX - 12;
      const target1Y = separated ? mouseY - 110 : mouseY - 10;
      const target2X = separated ? mouseX + 180 : mouseX + 12;
      const target2Y = separated ? mouseY + 110 : mouseY + 10;

      p1.x += (target1X - p1.x) * 0.075;
      p1.y += (target1Y - p1.y) * 0.075;
      p2.x += (target2X - p2.x) * 0.065;
      p2.y += (target2Y - p2.y) * 0.065;

      if (sparkA.current) {
        sparkA.current.style.transform = `translate3d(${p1.x}px, ${p1.y}px, 0)`;
      }

      if (sparkB.current) {
        sparkB.current.style.transform = `translate3d(${p2.x}px, ${p2.y}px, 0)`;
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
          font-size: clamp(48px, 7vw, 92px);
          line-height: 0.92;
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

        .dirac-dashboard {
          margin-top: 34px;
          border: 1px solid var(--line);
          border-radius: 20px;
          background: white;
          padding: 24px;
          box-shadow: 0 20px 54px rgba(15, 23, 42, 0.08);
        }

        .dirac-dashboard-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid var(--line);
          padding-bottom: 18px;
          margin-bottom: 20px;
        }

        .dirac-dashboard-head strong {
          color: #0f172a;
        }

        .dirac-live {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #16a34a;
          font-size: 12px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .dirac-live::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.14);
        }

        .dirac-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }

        .dirac-metric {
          background: #f8fafc;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 16px;
        }

        .dirac-metric span {
          display: block;
          color: var(--muted);
          font-size: 11px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 9px;
        }

        .dirac-metric strong {
          display: block;
          color: var(--blue);
          font-size: 27px;
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .dirac-bars {
          height: 128px;
          display: flex;
          align-items: end;
          gap: 7px;
          padding-top: 12px;
          border-top: 1px solid var(--line);
        }

        .dirac-bars i {
          flex: 1;
          height: var(--h);
          min-width: 6px;
          border-radius: 6px 6px 0 0;
          background: linear-gradient(180deg, #60a5fa, var(--blue));
          animation: dirac-bar-rise 0.7s ease both;
          animation-delay: var(--delay);
        }

        @keyframes dirac-bar-rise {
          from { transform: scaleY(0); transform-origin: bottom; }
          to { transform: scaleY(1); transform-origin: bottom; }
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
          gap: 16px;
          flex-wrap: wrap;
        }

        .dirac-footer strong {
          color: #0f172a;
        }

        @media (max-width: 980px) {
          .dirac-links {
            display: none;
          }

          .dirac-hero-grid,
          .dirac-section-head,
          .dirac-feature-grid {
            grid-template-columns: 1fr;
          }

          .dirac-hero-grid {
            padding-bottom: 210px;
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

          .dirac-metrics {
            grid-template-columns: repeat(2, 1fr);
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
          .dirac-sector-grid,
          .dirac-metrics {
            grid-template-columns: 1fr;
          }

          .dirac-card {
            min-height: auto;
            padding: 28px 24px;
          }

          .dirac-section,
          .dirac-feature {
            padding: 70px 0;
          }

          .dirac-feature-panel {
            height: 300px;
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
            <a href="#sectores">Sectores</a>
          </div>

          <Link className="dirac-login-btn" to="/login">
            Iniciar sesión
          </Link>
        </div>
      </nav>

      <main id="inicio">
        <section className="dirac-hero">
          <div className="dirac-shell dirac-hero-grid">
            <div>
              <div className="dirac-kicker">Energía limpia & tecnología operativa</div>

              <h1>
                Infraestructura conectada para <span>operar mejor</span>
              </h1>

              <p className="dirac-lead">
                DIRAC integra energía solar, telemetría, automatización de cargaderos y
                eficiencia energética para municipalidades e industrias.
              </p>

              <div className="dirac-actions">
                <Link className="dirac-primary-btn" to="/login">
                  Iniciar sesión
                </Link>
                <a className="dirac-secondary-btn" href="#servicios">
                  Ver soluciones
                </a>
              </div>

              <div className="dirac-tags">
                <span className="dirac-tag green">Energía solar</span>
                <span className="dirac-tag">Telemetría</span>
                <span className="dirac-tag">Automatización</span>
                <span className="dirac-tag">Eficiencia energética</span>
              </div>
            </div>

            <div className="dirac-tech-visual" aria-label="Sistema solar y telemetría">
              <div className="dirac-orb" />

              <div className="dirac-panel-array">
                {Array.from({ length: 24 }).map((_, index) => (
                  <i
                    className="dirac-panel-cell"
                    key={index}
                    style={{ "--delay": `${(index % 6) * 0.16}s` } as CSSProperties}
                  />
                ))}
              </div>

              <div className="dirac-panel-stand" />

              <div className="dirac-node one" />
              <div className="dirac-node green two" />
              <div className="dirac-node three" />
              <div className="dirac-field-line a" />
              <div className="dirac-field-line b" />

              <div className="dirac-control-card">
                <div className="dirac-control-screen" />
                <div className="dirac-light-row">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="dirac-mini-line">
                  <span />
                </div>
                <div className="dirac-mini-line">
                  <span style={{ width: "48%" }} />
                </div>
                <div className="dirac-mini-line">
                  <span style={{ width: "82%", background: "#22c55e" }} />
                </div>
              </div>

              <div className="dirac-floating-metrics">
                <div>
                  <span>Solar</span>
                  <strong>4.8 kW</strong>
                </div>
                <div>
                  <span>Caudal</span>
                  <strong>42 m³/h</strong>
                </div>
                <div>
                  <span>Ahorro</span>
                  <strong>14%</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="dirac-hero-stats">
            <div className="dirac-hero-stat">
              <strong>24/7</strong>
              <span>Monitoreo remoto</span>
            </div>
            <div className="dirac-hero-stat">
              <strong>kWh</strong>
              <span>Eficiencia energética</span>
            </div>
            <div className="dirac-hero-stat">
              <strong>m³</strong>
              <span>Control de cargaderos</span>
            </div>
            <div className="dirac-hero-stat">
              <strong>Solar</strong>
              <span>Autonomía en campo</span>
            </div>
          </div>
        </section>

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
                <div className="dirac-kicker">Soluciones</div>
                <h2>Medir, controlar y ahorrar con una arquitectura simple.</h2>
              </div>
              <p className="dirac-section-text">
                Unimos campo, tableros, comunicaciones, datos y mantenimiento para que
                la operación sea visible y trazable.
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

            <div className="dirac-dashboard">
              <div className="dirac-dashboard-head">
                <strong>DIRAC - Telemetría operativa</strong>
                <span className="dirac-live">En vivo</span>
              </div>

              <div className="dirac-metrics">
                <div className="dirac-metric">
                  <span>Generación solar</span>
                  <strong>4.8 kW</strong>
                </div>
                <div className="dirac-metric">
                  <span>Demanda actual</span>
                  <strong>186 kW</strong>
                </div>
                <div className="dirac-metric">
                  <span>Caudal cargadero</span>
                  <strong>42 m³/h</strong>
                </div>
                <div className="dirac-metric">
                  <span>Ahorro estimado</span>
                  <strong>14%</strong>
                </div>
              </div>

              <div className="dirac-bars">
                {chartBars.map((value, index) => (
                  <i
                    key={index}
                    style={
                      {
                        "--h": `${value}%`,
                        "--delay": `${index * 0.035}s`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
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
                    <p>Luminarias solares y cámaras 4G para accesos, predios y cargaderos.</p>
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
                  Telemetría de agua, cargaderos automatizados, bombeos, tanques,
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
                Accedé al monitoreo de telemetría, energía, cargaderos y activos operativos.
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
          <strong>DIRAC</strong>
          <span>Energía solar · Telemetría · Automatización · Eficiencia energética</span>
        </div>
      </footer>
    </div>
  );
}