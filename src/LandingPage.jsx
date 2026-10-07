import { useEffect, useState } from "react";
import Icon from "./Icons.jsx";
import { landingSections } from "./public-navigation.js";

const links = [
  ["como-funciona", "Cómo funciona"],
  ["beneficios-impacto", "Beneficios de impacto"],
  ["comparativa", "Comparativa"],
  ["modelo-respaldo", "Modelo y respaldo"],
  ["planes", "Planes"],
];
const steps = [
  [
    "Ingresa o fotografía tus ingredientes",
    "Escribe lo que tienes o sube una foto de tu refri. Revisa los alimentos reconocidos antes de agregarlos a tu despensa.",
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
    label: "A tu manera",
    title: "Beneficio social",
    text: "Una cocina para cada persona. Organiza tus preferencias y filtros alimentarios en tu perfil y encuentra nuevas formas de combinar lo que tienes.",
    tags: ["Preferencias personales", "Cuentas independientes"],
  },
  {
    icon: "pantry",
    tone: "amber",
    label: "Finanzas del hogar",
    title: "Beneficio económico",
    text: "Antes de pensar en comprar más, revisa tu despensa. Mantén a la vista tus ingredientes y aprovecha los alimentos que ya forman parte de tu cocina.",
    tags: ["Tu inventario a mano", "Más ideas con lo que tienes"],
  },
  {
    icon: "leaf",
    tone: "teal",
    label: "Consumo consciente",
    title: "Beneficio ambiental",
    text: "Dale otra oportunidad a los ingredientes olvidados. Registra fechas de los envases o estimaciones de conservación para organizar mejor su uso.",
    tags: ["Fechas editables", "Aprovechamiento de alimentos"],
  },
  {
    icon: "spark",
    tone: "mint",
    label: "Innovación IA",
    title: "Beneficio tecnológico",
    text: "Reúne texto, reconocimiento de ingredientes en fotos y recetas con IA en una interfaz que te acompaña tanto en la PC como en el teléfono.",
    tags: ["Texto y fotografía", "Recetas con Gemini"],
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
            <span className="landing-eyebrow">
              <i />
              Asistente culinario
            </span>
            <h1 id="landing-title">
              Cocina inteligente, aprovecha más y reduce el desperdicio
            </h1>
            <p>
              Transforma los ingredientes de tu despensa en tu próxima comida.
              NutriBot te ayuda a encontrar recetas con inteligencia artificial,
              según lo que tienes y lo que te gusta.
            </p>
            <Enter>Probar NutriBot</Enter>
            <div className="landing-proof">
              <span>
                <Icon name="pantry" size={17} />
                Tu despensa
              </span>
              <span>
                <Icon name="camera" size={17} />
                Texto o foto
              </span>
              <span>
                <Icon name="chef" size={17} />
                Paso a paso
              </span>
            </div>
          </div>
          <aside
            className="landing-demo"
            aria-label="Ejemplo ilustrativo de una receta"
          >
            <div className="landing-demo-header">
              <span className="landing-demo-icon">
                <Icon name="camera" />
              </span>
              <div>
                <h2>Una mirada a tu refri</h2>
                <p>Ingredientes revisados por ti</p>
              </div>
              <span className="landing-example">Ejemplo</span>
            </div>
            <div className="landing-ingredients">
              <span>🥬 Espinacas</span>
              <span>🍅 Tomates cherry</span>
              <span>🍗 Pechuga de pollo</span>
            </div>
            <div className="landing-demo-recipe">
              <div className="landing-demo-kicker">
                UNA IDEA CON TU DESPENSA
                <Icon name="spark" size={16} />
              </div>
              <h3>Sartén de pollo con espinacas y tomates cherry</h3>
              <p>
                Una combinación sencilla para darle una nueva idea a los
                ingredientes de siempre.
              </p>
              <div className="landing-demo-stats">
                <div>
                  <small>Ingredientes</small>
                  <strong>3 alimentos</strong>
                </div>
                <div>
                  <small>A tu manera</small>
                  <strong>Casero</strong>
                </div>
                <div>
                  <small>Preparación</small>
                  <strong>Paso a paso</strong>
                </div>
              </div>
            </div>
            <Enter>Encontrar mi próxima receta</Enter>
          </aside>
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
            <h2>Cuatro beneficios esenciales pensados para tu día a día</h2>
            <div className="landing-two">
              {benefits.map((item) => (
                <article className="landing-card" key={item.title}>
                  <div className="landing-benefit-head">
                    <span className={`landing-feature-icon ${item.tone}`}>
                      <Icon name={item.icon} size={26} />
                    </span>
                    <div>
                      <span className={`landing-mini-label ${item.tone}`}>
                        {item.label}
                      </span>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </div>
                  </div>
                  <div className="landing-tags">
                    {item.tags.map((tag) => (
                      <span key={tag}>✓ {tag}</span>
                    ))}
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
              <span className="landing-mini-label mint">
                Una cocina conectada
              </span>
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
              <h3>Conexiones para el futuro</h3>
              <p>
                Las alianzas con comercios y las listas de compras son
                propuestas para futuras versiones. Hoy puedes organizar los
                ingredientes que ya tienes.
              </p>
              <span className="landing-state">En propuesta</span>
            </article>
            <article className="landing-card">
              <span className="landing-feature-icon mint">
                <Icon name="chef" />
              </span>
              <h3>Inspiración para cocinar</h3>
              <p>
                Las recetas son sugerencias culinarias. NutriBot no calcula
                necesidades nutricionales, interpreta tratamientos ni sustituye
                las indicaciones de tu profesional.
              </p>
              <span className="landing-state">Alcance actual</span>
            </article>
            <article className="landing-card" id="privacidad">
              <span className="landing-feature-icon teal">
                <Icon name="shield" />
              </span>
              <h3>Tus datos, en tu cocina</h3>
              <p>
                Cada cuenta tiene datos independientes guardados en la PC
                anfitriona. Para generar recetas se envían a Google el mensaje,
                los ingredientes y los filtros; al analizar una foto, se envía
                esa imagen.
              </p>
              <p>
                Las contraseñas se guardan mediante hash. La conexión local usa
                HTTP salvo que se configure HTTPS.
              </p>
            </article>
          </div>
        </section>
        <section className="landing-section landing-width" id="planes">
          <span className="landing-section-label">
            Acceso actual y próximos pasos
          </span>
          <h2>Empieza con tu cocina de hoy</h2>
          <p className="landing-section-intro">
            La versión local está disponible. Los planes de pago de esta
            propuesta aún no se pueden contratar.
          </p>
          <div className="landing-three landing-plans">
            <article className="landing-card">
              <h3>Básico local</h3>
              <p>Para comenzar con lo que tienes</p>
              <div className="landing-price">
                $0<small> / acceso local</small>
              </div>
              <Checks
                items={[
                  "Despensa por texto y foto",
                  "Recetas, favoritos e historial",
                  "Fechas de despensa editables",
                ]}
              />
              <p className="landing-plan-note">
                Las funciones de IA dependen de la clave y la cuota de Google
                configuradas en la PC.
              </p>
              <Enter secondary>Comenzar</Enter>
            </article>
            <article className="landing-card featured">
              <span className="landing-plan-badge">Propuesta a futuro</span>
              <h3>NutriBot Pro</h3>
              <p>Más posibilidades para tu cocina</p>
              <div className="landing-price">
                $2.99<small> / mes propuesto</small>
              </div>
              <Checks
                items={[
                  "Herramientas de planificación propuestas",
                  "Más opciones de organización",
                  "Funciones y límites por definir",
                ]}
              />
              <p className="landing-plan-note">
                Precio orientativo. Sin suscripción ni prueba de pago activa.
              </p>
              <button className="landing-cta" disabled>
                Próximamente
              </button>
            </article>
            <article className="landing-card">
              <h3>Plan anual</h3>
              <p>Una opción pensada a largo plazo</p>
              <div className="landing-price">
                $29.99<small> / año propuesto</small>
              </div>
              <Checks
                items={[
                  "Propuesta de pago anual",
                  "Beneficios por definir",
                  "Disponible en una versión futura",
                ]}
              />
              <p className="landing-plan-note">
                Precio orientativo. Todavía no se realizan cobros.
              </p>
              <button className="landing-cta secondary" disabled>
                Próximamente
              </button>
            </article>
          </div>
        </section>
        <section className="landing-bottom-cta landing-width">
          <span className="landing-eyebrow">Tu próxima idea empieza aquí</span>
          <h2>
            Empieza hoy a cocinar mejor
            <br />
            con lo que tienes en casa
          </h2>
          <p>Crea tu cuenta y convierte tu despensa en nuevas posibilidades.</p>
          <Enter secondary>Empezar con mi correo</Enter>
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
