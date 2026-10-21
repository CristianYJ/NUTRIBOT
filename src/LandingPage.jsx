import { useEffect, useState } from "react";
import Icon from "./Icons.jsx";
import { landingSections } from "./public-navigation.js";
import { planCatalog } from './plan-catalog.js';

const links = [
  ["como-funciona", "Cómo funciona"],
  ["beneficios-impacto", "Beneficios de impacto"],
  ["comparativa", "Comparativa"],
  ["modelo-respaldo", "Modelo y respaldo"],
  ["planes", "Planes"],
];
const steps = [
  [
    "Agrega tus ingredientes con Nutri-Vision",
    "Escribe lo que tienes o usa Nutri-Vision con una foto de tu refri. Revisa los alimentos reconocidos antes de agregarlos a tu despensa.",
  ],
  [
    "NutriBot IA propone tu receta",
    "Cuéntale qué te gustaría cocinar. Tus ingredientes, preferencias y tiempo disponible ayudan a dar forma a la propuesta.",
  ],
  [
    "Cocina con una guía paso a paso",
    "Consulta cantidades y preparación, guarda tus favoritos y vuelve a tus conversaciones cuando necesites otra idea.",
  ],
];
const benefits = [
  {
    icon: "user",
    tone: "mint",
    title: "Beneficio social",
    text: "Una cocina para cada persona. Organiza tus preferencias y filtros alimentarios en tu perfil y encuentra nuevas formas de combinar lo que tienes.",
  },
  {
    icon: "pantry",
    tone: "amber",
    title: "Beneficio económico",
    text: "Antes de pensar en comprar más, revisa tu despensa. Mantén a la vista tus ingredientes y aprovecha los alimentos que ya forman parte de tu cocina.",
  },
  {
    icon: "leaf",
    tone: "teal",
    title: "Beneficio ambiental",
    text: "Dale otra oportunidad a los ingredientes olvidados. Registra fechas de los envases o estimaciones de conservación para organizar mejor su uso.",
  },
  {
    icon: "mail",
    tone: "mint",
    title: "Beneficio tecnológico",
    text: "Reconocimiento de ingredientes mediante fotos y recetas con IA en una interfaz que te acompaña tanto en la PC como en el teléfono.",
  },
];
function Enter({ children = "Comenzar gratis", secondary = false }) {
  return (
    <a className={`landing-cta ${secondary ? "secondary" : ""}`} href="#auth">
      {children}
      <Icon name="arrow" size={18} />
    </a>
  );
}
function Checks({ items }) {
  return (
    <ul className="landing-checks">
      {items.map((item) => (
        <li key={item}>
          <Icon name="check" size={16} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LandingPage({ brand }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const scroll = () => {
      const id = location.hash.slice(1);
      if (landingSections.includes(id))
        document.getElementById(id)?.scrollIntoView({ block: "start" });
    };
    scroll();
    window.addEventListener("hashchange", scroll);
    return () => window.removeEventListener("hashchange", scroll);
  }, []);
  return (
    <div className="landing-page" id="welcome">
      <a className="landing-skip" href="#como-funciona">
        Ir al contenido
      </a>
      <header className="landing-header">
        <div className="landing-header-inner">
          <a href="#welcome" aria-label="NutriBot, inicio">
            {brand}
          </a>
          <button
            className="landing-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="landing-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            Menú
          </button>
          <nav
            id="landing-nav"
            className={`landing-nav ${menuOpen ? "is-open" : ""}`}
            aria-label="Navegación de bienvenida"
          >
            {links.map(([id, label]) => (
              <a href={`#${id}`} key={id} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
          </nav>
          <div className="landing-header-actions">
            <a className="landing-login" href="#auth">
              Iniciar sesión
            </a>
            <Enter />
          </div>
        </div>
      </header>
      <main className="landing-main">
        <section
          className="landing-hero landing-width"
          aria-labelledby="landing-title"
        >
          <div className="landing-hero-copy">
            <h1 id="landing-title">
              Cocina inteligente
            </h1>
            <p>
              Transforma los ingredientes de tu despensa en tu próxima comida.
              NutriBot te ayuda a encontrar recetas en base a tus preferencias
              y necesidades alimentarias. Gana control sobre tu alimentación con  de nuestra IA.
            </p>
            <Enter>Probar NutriBot</Enter>
          </div>
          <figure className="landing-app-preview">
            <img src="/images/landing/app-movil.jpeg" width="738" height="1600"
              alt="NutriBot en el teléfono: despensa, ingredientes y acceso a Nutri-Vision"
              fetchPriority="high" decoding="async" />
          </figure>
        </section>
        <section className="landing-section landing-width" id="como-funciona">
          <h2>De ingredientes sueltos a una buena cena en 3 pasos</h2>
          <div className="landing-three">
            {steps.map(([title, text], index) => (
              <article className="landing-card" key={title}>
                <span className="landing-step">{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section
          className="landing-section landing-benefits"
          id="beneficios-impacto"
        >
          <div className="landing-width">
            <h2>Beneficios pensados para tu día a día</h2>
            <div className="landing-two">
              {benefits.map((item) => (
                <article className="landing-card" key={item.title}>
                  <div className="landing-benefit-head">
                    <span className={`landing-feature-icon ${item.tone}`}>
                      <Icon name={item.icon} size={26} />
                    </span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="landing-section landing-width" id="comparativa">
          <h2>Tu despensa, tus preferencias y tus recetas en un solo lugar</h2>
          <div
            className="landing-table-wrap"
            role="region"
            aria-label="Comparativa de organización de la cocina"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>En tu cocina</th>
                  <th>Con NutriBot</th>
                  <th>Por separado</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Ingredientes disponibles",
                    "Una despensa que puedes actualizar",
                    "Listas y notas sueltas",
                  ],
                  [
                    "Preferencias y filtros",
                    "Guardados en tu perfil",
                    "Recordarlos en cada búsqueda",
                  ],
                  [
                    "Ideas para cocinar",
                    "Recetas con tus ingredientes",
                    "Buscar combinaciones manualmente",
                  ],
                  [
                    "Conversaciones y favoritos",
                    "Historial y recetas guardadas",
                    "Buscar de nuevo lo que te gustó",
                  ],
                  [
                    "PC y teléfono",
                    "La misma cuenta en tu red local",
                    "Consultar cada dispositivo",
                  ],
                ].map(([name, current, manual]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>
                      <Icon name="check" size={14} />
                      {current}
                    </td>
                    <td>{manual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="landing-unified">
            <div>
              <h3>Menos herramientas sueltas. Más tiempo para cocinar.</h3>
              <Checks
                items={[
                  "Añade ingredientes, ajusta tus preferencias y encuentra una receta.",
                  "Guarda tus favoritos y retoma las ideas del historial.",
                  "Abre el QR en tu teléfono y entra a tu cuenta desde la misma red.",
                ]}
              />
            </div>
            <blockquote>
              “Tú pones los ingredientes y el toque especial. NutriBot te ayuda
              con la inspiración.”
            </blockquote>
          </div>
        </section>
        <section className="landing-section landing-width" id="modelo-respaldo">
          <h2>Un proyecto que crece con tu cocina</h2>
          <div className="landing-three">
            <article className="landing-card">
              <span className="landing-feature-icon mint">
                <Icon name="pantry" />
              </span>
              <h3>Conexiones</h3>
              <p>
                Nuestros aliados son parte fundamental del crecimiento de NutriBot y estamos siempre abiertos a nuevas conexiones que nos ayuden a mejorar tu experiencia.
              </p>
            </article>
            <article className="landing-card">
              <span className="landing-feature-icon mint">
                <Icon name="chef" />
              </span>
              <h3>Inspiración para cocinar</h3>
              <p>Nutribot no sustituye la opinión de profesionales, es un acompañante para mejorar tu experiencia culinaria y llevar un mejor y mayor control de tus habitos alimenticios</p>
              </article>
            <article className="landing-card" id="privacidad">
              <span className="landing-feature-icon teal">
                <Icon name="shield" />
              </span>
              <h3>Privacidad</h3>
              <p>
                La privacidad es fundamental en NutriBot. Tu información es tratada con los más altos estándares de seguridad y confidencialidad. Los datos se procesan exclusivamente para mejorar tu experiencia culinaria, respetando siempre tu privacidad y tus preferencias. 
              </p>
            </article>
          </div>
        </section>
        <section className="landing-section landing-width" id="planes">
          <h2>Tenemos un plan para cada persona</h2>
          <div className="landing-three landing-plans">
            <article className="landing-card">
              <h3>{planCatalog.basico.name}</h3>
              <div className="landing-price">
                $0<small> / gratis</small>
              </div>
              <Checks
                items={[
                  `${planCatalog.basico.recipes} generaciones de recetas por semana`,
                  `${planCatalog.basico.vision} análisis de foto con Nutri-Vision al mes`,
                  "Tu propia despensa",
                  "Recetas paso a paso, favoritos e historial",
                  "Preferencias, alergias y restricciones",
                  "Información nutricional por receta",
                  "Registro de comidas y nutrición diaria por persona",
                  "Valoración de tus comidas",
                ]}
              />
              <Enter secondary>Comenzar</Enter>
            </article>
            <article className="landing-card featured">
              <span className="landing-plan-badge">Recomendado</span>
              <h3>{planCatalog.nutripro.name}</h3>
              <div className="landing-price">
                $2.99<small> / mesl</small>
              </div>
              <Checks
                items={[
                  "Todo lo incluido en Básico",
                  `${planCatalog.nutripro.recipes} generaciones de recetas por semana`,
                  `${planCatalog.nutripro.vision} de usos de Nutri-Vision al mes`,
                  "Más cupo para pedir alternativas de recetas",
                  "Más fotos para actualizar tu despensa",
                  "El mismo seguimiento nutricional y de comidas",
                ]}
              />
              <button className="landing-cta" disabled>
                Próximamente
              </button>
            </article>
            <article className="landing-card landing-plan-max">
              <h3>{planCatalog.nutripro_plus.name}</h3>
              <div className="landing-price">
                $9.99<small> / mes</small>
              </div>
              <Checks
                items={[
                  "Todo lo incluido en NutriPro",
                  `${planCatalog.nutripro_plus.recipes} generaciones de recetas por semana`,
                  `${planCatalog.nutripro_plus.vision} de fotos con Nutri-Vision al mes`,
                  "El maximo cupo para explorar alternativas",
                  "Análisis de fotos para una despensa activa",
                  "Seguimiento nutricional personalizado",
                ]}
              />
              <button className="landing-cta secondary" disabled>
                Próximamente
              </button>
            </article>
          </div>
        </section>
        <section className="landing-bottom-cta landing-width">
          <div className="landing-bottom-copy">
            <h2>Empieza hoy a cocinar</h2>
            <p>Crea tu cuenta y convierte tu despensa en nuevas posibilidades.</p>
            <Enter secondary>Crear Cuenta Gratuita</Enter>
          </div>
          <img className="landing-bowl-photo" src="/images/landing/bowl.png"
            alt="Bowl de arroz, vegetales y pollo crujiente" loading="lazy" decoding="async" />
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-width">
          <div>
            <a href="#welcome" aria-label="NutriBot, volver arriba">
              {brand}
            </a>
            <p>Menos dudas. Más ideas con lo que tienes.</p>
          </div>
          <nav aria-label="Más sobre NutriBot">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#privacidad">Privacidad y datos</a>
            <a href="#auth">Entrar a mi cocina</a>
          </nav>
        </div>
        <small>© 2026 NutriBot.</small>
      </footer>
    </div>
  );
}

