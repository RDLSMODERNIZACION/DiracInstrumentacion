import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Mail,
  Menu,
  Phone,
  ShieldCheck,
  SunMedium,
  X,
  Zap,
} from "lucide-react";

const LOGO_SRC = "/img/logodirac.jpeg";

const heroSlides = [
  {
    eyebrow: "Ingeniería eléctrica",
    title: "Proyectos BT y MT, bancos de capacitores y puesta a tierra certificada.",
    text: "Desarrollamos proyectos eléctricos de baja y media tensión, instalamos bancos de capacitores y realizamos certificación de puesta a tierra según Resolución 902/15.",
    image: "/img/tableros-electricos.jpeg",
  },
  {
    eyebrow: "Telemetría y automatización",
    title: "Datos, control y monitoreo para tomar mejores decisiones.",
    text: "Integramos PLC, sensores, comunicaciones y supervisión remota para activos distribuidos y procesos industriales.",
    image: "/img/scada-preview.png",
  },
  {
    eyebrow: "Energía renovable",
    title: "Sistemas solares para infraestructura, industria y espacios públicos.",
    text: "Diseñamos soluciones on-grid, off-grid e iluminación solar para puntos remotos y espacios públicos.",
    image: "/img/paneles-solares.jpg",
  },
  {
    eyebrow: "Mantenimiento y diagnóstico",
    title: "Disponibilidad, seguridad y continuidad operativa.",
    text: "Mediciones, mantenimiento preventivo y predictivo, calidad de energía y diagnóstico de instalaciones.",
    image: "/img/mantenimiento-transformadores.jpeg",
  },
];

const teamVehicles = [
  {
    category: "Trabajo en altura y montaje",
    title: "Camión JMC N-900 con hidrogrúa",
    text: "Unidad equipada para montajes, luminaria, tableros, tendidos y asistencia técnica. Habilitada para trabajos en campos petroleros.",
    image: "/img/hidrogrua-dirac.jpg",
  },
  {
    category: "Movilidad técnica 4x4",
    title: "Toyota Hilux de servicio",
    text: "Movilidad para personal, instrumental, herramientas y asistencia operativa. Habilitada para trabajos en campos petroleros y operación en yacimientos.",
    image: "/img/camioneta-dirac.jpg",
  },
];

const products = [
  {
    title: "Farola solar 400W",
    image: "/img/productos/luminaria-solar-400w.png",
  },
  {
    title: "Farola solar All in One",
    image: "/img/productos/luminaria-solar-all-in-one.png",
  },
  {
    title: "Panel solar de alto rendimiento",
    image: "/img/productos/panel-solar-alto-rendimiento.png",
  },
];

export default function Landing() {
  const [slide, setSlide] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((current) => (current + 1) % heroSlides.length);
    }, 5600);
    return () => window.clearInterval(id);
  }, []);

  const goToSlide = (index: number) => {
    setSlide((index + heroSlides.length) % heroSlides.length);
  };

  return (
    <div className="dl">
      <style>{`
        .dl{--navy:#061525;--navy2:#0a243e;--green:#76c944;--green-dark:#4e9c27;--ink:#071525;--muted:#687588;--line:#dfe6ec;--paper:#f5f7f8;min-height:100vh;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden;scroll-behavior:smooth}
        .dl *{box-sizing:border-box}.dl a{color:inherit;text-decoration:none}.dl-shell{width:min(1200px,calc(100% - 40px));margin:0 auto}
        .dl-nav{position:sticky;top:0;z-index:100;background:rgba(255,255,255,.94);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}
        .dl-nav-inner{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:24px}.dl-brand{display:flex;align-items:center;gap:12px}.dl-brand img{width:48px;height:48px;object-fit:contain;border-radius:12px;border:1px solid var(--line);background:white}.dl-brand-copy{display:grid;gap:1px}.dl-brand-copy strong{font-size:19px;letter-spacing:-.03em}.dl-brand-copy span{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;font-weight:800}.dl-links{display:flex;align-items:center;gap:26px;font-size:14px;font-weight:750;color:#48566a}.dl-links a:hover{color:var(--green-dark)}.dl-login{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border-radius:10px;background:var(--navy);color:white;font-size:14px;font-weight:800}.dl-menu-btn{display:none;border:0;background:transparent;padding:8px;color:var(--ink)}
        .dl-hero{position:relative;height:min(760px,calc(100svh - 76px));min-height:630px;background:var(--navy);overflow:hidden;color:white}.dl-slide{position:absolute;inset:0;opacity:0;transform:scale(1.045);transition:opacity 1.2s ease,transform 7s ease;pointer-events:none}.dl-slide.active{opacity:1;transform:scale(1);pointer-events:auto}.dl-slide img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.9) contrast(1.03)}.dl-slide::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,13,24,.96) 0%,rgba(3,13,24,.84) 38%,rgba(3,13,24,.45) 68%,rgba(3,13,24,.22) 100%),linear-gradient(0deg,rgba(3,13,24,.5),transparent 48%)}
        .dl-hero-grid{position:relative;z-index:4;height:100%;display:flex;align-items:center;padding-bottom:78px}.dl-hero-copy{max-width:800px;padding-top:10px}.dl-eyebrow{display:flex;align-items:center;gap:12px;margin-bottom:22px;color:#cce6ba;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.14em}.dl-eyebrow::before{content:"";width:40px;height:2px;border-radius:99px;background:var(--green)}.dl-hero h1{margin:0;max-width:840px;font-size:clamp(47px,6.3vw,86px);line-height:.94;letter-spacing:-.055em;font-weight:900;text-wrap:balance;text-shadow:0 10px 40px rgba(0,0,0,.18)}.dl-hero p{margin:27px 0 0;max-width:680px;color:rgba(240,246,250,.82);font-size:18px;line-height:1.65}.dl-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}.dl-primary,.dl-secondary{min-height:50px;display:inline-flex;align-items:center;gap:9px;padding:0 21px;border-radius:10px;font-size:14px;font-weight:850;transition:.2s ease}.dl-primary{background:var(--green);color:#10240c;box-shadow:0 16px 38px rgba(76,149,38,.26)}.dl-primary:hover{transform:translateY(-1px);background:#86d459}.dl-secondary{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);backdrop-filter:blur(10px)}.dl-secondary:hover{transform:translateY(-1px);background:rgba(255,255,255,.15)}
        .dl-hero-bottom{position:absolute;left:0;right:0;bottom:0;z-index:6;border-top:1px solid rgba(255,255,255,.14);background:rgba(2,12,22,.42);backdrop-filter:blur(12px)}.dl-hero-control{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:20px}.dl-dots{display:flex;align-items:center;gap:9px}.dl-dot{width:38px;height:3px;border:0;padding:0;background:rgba(255,255,255,.25);cursor:pointer;overflow:hidden;border-radius:99px}.dl-dot.active::after{content:"";display:block;width:100%;height:100%;background:var(--green);transform-origin:left;animation:dlProgress 5.6s linear forwards}@keyframes dlProgress{from{transform:scaleX(0)}to{transform:scaleX(1)}}.dl-slide-info{display:flex;align-items:center;gap:14px;color:rgba(255,255,255,.72);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.dl-arrows{display:flex;gap:8px}.dl-arrow{width:40px;height:40px;display:grid;place-items:center;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:white;cursor:pointer}.dl-arrow:hover{background:rgba(255,255,255,.12)}
        .dl-section{padding:88px 0}.dl-section.white{background:#fff}.dl-section.paper{background:var(--paper);border-top:1px solid var(--line)}.dl-section-head{display:grid;grid-template-columns:minmax(0,.95fr) minmax(300px,.55fr);gap:50px;align-items:end;margin-bottom:38px}.dl-kicker{display:flex;align-items:center;gap:11px;margin-bottom:15px;color:var(--green-dark);font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.dl-kicker::before{content:"";width:34px;height:2px;background:var(--green)}.dl-section-head h2{margin:0;font-size:clamp(36px,4.6vw,61px);line-height:1;letter-spacing:-.045em}.dl-section-head p{margin:0;color:var(--muted);font-size:16px;line-height:1.7}
        .dl-project-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.dl-project{position:relative;min-height:390px;border-radius:24px;overflow:hidden;background:#102335;border:1px solid rgba(6,21,37,.1)}.dl-project img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .5s ease}.dl-project:hover img{transform:scale(1.035)}.dl-project::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(3,13,24,.92) 0%,rgba(3,13,24,.28) 58%,rgba(3,13,24,.04) 100%)}.dl-project-copy{position:absolute;z-index:2;left:0;right:0;bottom:0;padding:28px;color:white}.dl-project-copy small{color:#bfe8a7;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.dl-project-copy h3{margin:8px 0 10px;font-size:28px;line-height:1.04;letter-spacing:-.035em}.dl-project-copy p{margin:0;max-width:540px;color:rgba(255,255,255,.7);font-size:14px;line-height:1.55}
        .dl-product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.dl-product{display:block;min-height:0;overflow:hidden;border:1px solid var(--line);border-radius:24px;background:white;transition:transform .25s ease,box-shadow .25s ease;box-shadow:0 18px 44px rgba(12,28,44,.07)}.dl-product:hover{transform:translateY(-4px);box-shadow:0 26px 62px rgba(12,28,44,.12)}.dl-product-media{position:relative;overflow:hidden;background:white;height:620px;display:flex;align-items:center;justify-content:center;padding:10px}.dl-product-media.catalog-clean::before,.dl-product-media.catalog-clean::after{display:none!important}.dl-product-media img{width:100%;height:100%;object-fit:contain;display:block;background:white;transform:none!important}.dl-product:hover .dl-product-media img{transform:none!important}.dl-product-copy,.dl-product-icon{display:none!important}
        .dl-proof{padding:82px 0;background:var(--navy);color:white}.dl-proof-grid{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:64px;align-items:center}.dl-proof h2{margin:0;font-size:clamp(36px,4.5vw,58px);line-height:1;letter-spacing:-.045em}.dl-proof p{color:rgba(236,242,247,.7);font-size:16px;line-height:1.7}.dl-proof-list{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dl-proof-item{padding:22px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.045)}.dl-proof-item svg{color:var(--green);margin-bottom:14px}.dl-proof-item strong{display:block;font-size:16px}.dl-proof-item span{display:block;margin-top:5px;color:rgba(236,242,247,.62);font-size:12px;line-height:1.45}
        .dl-cta{padding:66px 0;background:white;border-top:1px solid var(--line)}.dl-cta-inner{display:flex;align-items:center;justify-content:space-between;gap:30px}.dl-cta h2{margin:0;font-size:clamp(30px,4vw,48px);line-height:1.05;letter-spacing:-.04em}.dl-cta p{margin:10px 0 0;color:var(--muted)}.dl-contact{display:flex;gap:10px;flex-wrap:wrap}.dl-contact a{min-height:46px;display:inline-flex;align-items:center;gap:8px;padding:0 16px;border:1px solid var(--line);border-radius:10px;background:white;font-size:13px;font-weight:800}.dl-footer{padding:24px 0;background:#f8fafb;border-top:1px solid var(--line);color:var(--muted);font-size:13px}.dl-footer-inner{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}.dl-footer strong{color:var(--ink)}
        @media(max-width:980px){.dl-links{display:none}.dl-menu-btn{display:block}.dl-login.desktop{display:none}.dl-mobile{position:absolute;top:76px;left:0;right:0;background:white;border-bottom:1px solid var(--line);padding:18px 20px 24px;display:grid;gap:8px;box-shadow:0 18px 34px rgba(0,0,0,.08)}.dl-mobile a{padding:12px 4px;font-weight:800}.dl-mobile .dl-login{margin-top:6px;color:white;padding:0 16px}.dl-section-head,.dl-proof-grid{grid-template-columns:1fr}.dl-product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dl-product-media{height:560px}.dl-project-grid{grid-template-columns:1fr}.dl-hero h1{font-size:clamp(44px,8vw,72px)}}
        @media(max-width:640px){.dl-shell{width:min(100% - 28px,1200px)}.dl-brand-copy span{display:none}.dl-hero{min-height:660px;height:calc(100svh - 70px)}.dl-nav-inner{min-height:70px}.dl-hero-grid{align-items:flex-end;padding-bottom:120px}.dl-hero h1{font-size:42px;line-height:.98}.dl-hero p{font-size:15px;line-height:1.58}.dl-actions{display:grid;grid-template-columns:1fr}.dl-primary,.dl-secondary{width:100%}.dl-slide::after{background:linear-gradient(0deg,rgba(3,13,24,.96) 0%,rgba(3,13,24,.75) 52%,rgba(3,13,24,.3) 100%)}.dl-slide-info{display:none}.dl-hero-control{min-height:68px}.dl-section{padding:68px 0}.dl-section-head{gap:18px}.dl-product-grid{grid-template-columns:1fr}.dl-product-media{height:620px;padding:6px}.dl-project{min-height:330px}.dl-proof-list{grid-template-columns:1fr}.dl-cta-inner{align-items:flex-start;flex-direction:column}.dl-contact{display:grid;width:100%}.dl-contact a{width:100%}}
      `}</style>

      <nav className="dl-nav">
        <div className="dl-shell dl-nav-inner">
          <a className="dl-brand" href="#inicio">
            <img src={LOGO_SRC} alt="DIRAC" />
            <span className="dl-brand-copy"><strong>DIRAC</strong><span>Servicios Energía</span></span>
          </a>
          <div className="dl-links">
            <a href="#equipo">Nuestro equipo</a>
            <a href="#productos">Catálogo</a>
            <a href="#empresa">Empresa</a>
            <a href="#contacto">Contacto</a>
          </div>
          <Link className="dl-login desktop" to="/login">Ingresar al panel</Link>
          <button className="dl-menu-btn" onClick={() => setMobileOpen((v) => !v)} aria-label="Abrir menú">{mobileOpen ? <X size={24}/> : <Menu size={24}/>}</button>
        </div>
        {mobileOpen && (
          <div className="dl-mobile">
            <a href="#equipo" onClick={() => setMobileOpen(false)}>Nuestro equipo</a>
            <a href="#productos" onClick={() => setMobileOpen(false)}>Catálogo</a>
            <a href="#empresa" onClick={() => setMobileOpen(false)}>Empresa</a>
            <a href="#contacto" onClick={() => setMobileOpen(false)}>Contacto</a>
            <Link className="dl-login" to="/login">Ingresar al panel</Link>
          </div>
        )}
      </nav>

      <main id="inicio">
        <section className="dl-hero">
          {heroSlides.map((item,index)=>(
            <div className={`dl-slide ${index===slide?"active":""}`} key={item.title}><img src={item.image} alt="" /></div>
          ))}
          <div className="dl-shell dl-hero-grid">
            <div className="dl-hero-copy" key={slide}>
              <div className="dl-eyebrow">{heroSlides[slide].eyebrow}</div>
              <h1>{heroSlides[slide].title}</h1>
              <p>{heroSlides[slide].text}</p>
              <div className="dl-actions">
                <a className="dl-primary" href="#equipo">Nuestro equipo <ArrowRight size={17}/></a>
                <a className="dl-secondary" href="#productos">Ver catálogo</a>
              </div>
            </div>
          </div>
          <div className="dl-hero-bottom">
            <div className="dl-shell dl-hero-control">
              <div className="dl-dots">{heroSlides.map((item,index)=><button key={item.title} className={`dl-dot ${index===slide?"active":""}`} onClick={()=>goToSlide(index)} aria-label={`Ir a diapositiva ${index+1}`}/>)}</div>
              <div className="dl-slide-info"><span>0{slide+1}</span><span>{heroSlides[slide].eyebrow}</span></div>
              <div className="dl-arrows"><button className="dl-arrow" onClick={()=>goToSlide(slide-1)} aria-label="Anterior"><ChevronLeft size={18}/></button><button className="dl-arrow" onClick={()=>goToSlide(slide+1)} aria-label="Siguiente"><ChevronRight size={18}/></button></div>
            </div>
          </div>
        </section>

        <section className="dl-section paper" id="equipo">
          <div className="dl-shell">
            <div className="dl-section-head">
              <div><div className="dl-kicker">Nuestro equipo</div><h2>Movilidad preparada para operación en campo.</h2></div>
              <p>Contamos con unidades propias para montaje, mantenimiento y asistencia técnica, habilitadas para trabajos en campos petroleros y operación en yacimientos.</p>
            </div>
            <div className="dl-project-grid">
              {teamVehicles.map((vehicle)=><article className="dl-project" key={vehicle.title}><img src={vehicle.image} alt={vehicle.title}/><div className="dl-project-copy"><small>{vehicle.category}</small><h3>{vehicle.title}</h3><p>{vehicle.text}</p></div></article>)}
            </div>
          </div>
        </section>

        <section className="dl-section white" id="productos">
          <div className="dl-shell">
            <div className="dl-section-head">
              <div><div className="dl-kicker">Catálogo comercial</div><h2>Productos para venta directa.</h2></div>
              <p>Farolas solares y paneles fotovoltaicos listos para provisión directa. Mostramos únicamente los productos comerciales disponibles.</p>
            </div>
            <div className="dl-product-grid">
              {products.map((product)=><article className="dl-product" key={product.title}><div className="dl-product-media catalog-clean"><img src={product.image} alt={product.title}/></div></article>)}
            </div>
          </div>
        </section>

        <section className="dl-proof" id="empresa">
          <div className="dl-shell dl-proof-grid">
            <div><div className="dl-eyebrow">DIRAC Servicios Energía</div><h2>Capacidad técnica, presencia en campo y soluciones integrales.</h2><p>Empresa de Rincón de los Sauces con más de 10 años de experiencia en ingeniería, automatización, instrumentación y eficiencia energética.</p></div>
            <div className="dl-proof-list">
              <div className="dl-proof-item"><ShieldCheck size={24}/><strong>Profesionales matriculados</strong><span>Ingeniería y ejecución con respaldo técnico.</span></div>
              <div className="dl-proof-item"><Zap size={24}/><strong>Soluciones integrales</strong><span>Desde el relevamiento hasta la puesta en servicio.</span></div>
              <div className="dl-proof-item"><SunMedium size={24}/><strong>Energía aplicada</strong><span>Sistemas solares y eficiencia energética.</span></div>
              <div className="dl-proof-item"><Camera size={24}/><strong>Tecnología de campo</strong><span>Monitoreo, automatización y activos remotos.</span></div>
            </div>
          </div>
        </section>

        <section className="dl-cta" id="contacto">
          <div className="dl-shell dl-cta-inner">
            <div><h2>¿Necesitás cotizar un producto o proyecto?</h2><p>Contanos qué necesitás y te ayudamos a definir la solución.</p></div>
            <div className="dl-contact"><a href="tel:+542994292985"><Phone size={16}/> 299 4292985</a><a href="tel:+542993251398"><Phone size={16}/> 299 3251398</a><a href="mailto:administracion@diracserviciosenergia.com"><Mail size={16}/> Escribir por email</a></div>
          </div>
        </section>
      </main>

      <footer className="dl-footer"><div className="dl-shell dl-footer-inner"><div><strong>DIRAC Servicios Energía S.A.S.</strong> · Rincón de los Sauces · Neuquén</div><div>Ingeniería · Automatización · Energía · Telemetría</div></div></footer>
    </div>
  );
}
