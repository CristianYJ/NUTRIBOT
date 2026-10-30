import { useEffect } from "react";
import { privacySectionIds } from "./public-navigation.js";
import { jumpToPrivacySection } from "./privacy-navigation.js";
import "./privacy-page.css";

const sections = [
  ["responsable", "Responsable y contacto"],
  ["datos", "Datos que recopilamos"],
  ["uso", "Cómo los usamos"],
  ["gemini", "Google Gemini"],
  ["edamam", "Edamam"],
  ["usda", "USDA FoodData Central"],
  ["cookies", "Cookies y preferencias"],
  ["conservacion", "Conservación y seguridad"],
  ["derechos", "Tus opciones"],
  ["cambios", "Cambios a esta política"],
];

export default function PrivacyPage() {
  useEffect(() => {
    const id = location.hash.slice(1);
    if (privacySectionIds.includes(id)) {
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    }
  }, []);

  return (
    <div className="privacy-page">
      <a className="privacy-skip" href="#privacy-main">Ir al contenido</a>
      <header className="privacy-header">
        <a className="privacy-brand" href="#welcome"><img src="/nutribot-logo.png" alt="" />NutriBot<span>.</span></a>
        <a className="privacy-back" href="#welcome">Volver al inicio</a>
      </header>
      <main id="privacy-main" className="privacy-layout">
        <div className="privacy-hero">
          <p className="privacy-eyebrow">Privacidad en NutriBot</p>
          <h1>Política de privacidad</h1>
          <p>Te explicamos qué datos usamos para tu cuenta, despensa, recetas y seguimiento nutricional, y cuándo intervienen Gemini, Edamam y USDA.</p>
          <div className="privacy-draft" role="note">
            <strong>Documento en preparación · 30 de octubre de 2026.</strong>
            <span>Antes de publicarlo faltan el nombre legal y país del responsable, un correo de privacidad, el alojamiento, los plazos de copias de seguridad y confirmar si Gemini usa cuota gratuita o facturación activa.</span>
          </div>
        </div>
        <div className="privacy-content">
          <nav className="privacy-toc" aria-label="Contenido de la política">
            <strong>En esta página</strong>
            {sections.map(([id, label]) => <button key={id} type="button" onClick={() => jumpToPrivacySection(id)}>{label}</button>)}
          </nav>
          <div className="privacy-articles">
            <section id="responsable">
              <h2>1. Responsable y contacto</h2>
              <p>NutriBot es la aplicación que presta este servicio. <strong>Pendiente antes de publicar:</strong> identificar a la persona o entidad responsable, su país, una dirección de contacto y el correo para solicitudes de privacidad.</p>
            </section>
            <section id="datos">
              <h2>2. Datos que recopilamos</h2>
              <p>Recopilamos la información que proporcionas y los datos necesarios para que funcionen las herramientas que utilizas:</p>
              <ul>
                <li><strong>Cuenta y acceso:</strong> nombre, correo electrónico, fecha de nacimiento, plan asignado y contraseña protegida mediante hash. Guardamos sesiones para mantener el acceso.</li>
                <li><strong>Perfil alimentario:</strong> objetivos, dieta, alergias, restricciones y alimentos excluidos. Si los completas, también peso, estatura, actividad, metas nutricionales y notas sobre indicaciones profesionales. Las alergias y algunas notas pueden revelar información de salud.</li>
                <li><strong>Despensa:</strong> alimentos agregados, fechas de almacenamiento y vencimiento, y alimentos personalizados.</li>
                <li><strong>Recetas y comidas:</strong> recetas locales, identificador y nombre de recetas de Edamam que guardas, su categoría asignada por NutriBot, valoraciones, comidas registradas y datos nutricionales de recetas locales o consultas a USDA. Los valores nutricionales de Edamam se consultan cuando se necesitan; no se guardan bajo el plan actual.</li>
                <li><strong>Conversaciones:</strong> mensajes que escribes, respuestas y referencias de recetas. Si incluyes datos personales en texto libre, también formarán parte de la conversación.</li>
                <li><strong>Fotos de Nutri-Vision:</strong> las imágenes que eliges se envían para identificar alimentos. NutriBot no guarda el archivo de la foto en el historial de su base de datos; los alimentos que confirmes sí se guardan en tu despensa.</li>
                <li><strong>Funcionamiento y seguridad:</strong> identificador de cuenta, sesión, función usada, resultado, tiempos de respuesta y errores. Ante una consulta de recetas fallida, guardamos extractos limitados del mensaje y del contexto anterior. Se sustituyen correos y teléfonos detectados, aunque otros datos personales escritos libremente podrían permanecer en el extracto.</li>
              </ul>
            </section>
            <section id="uso">
              <h2>3. Cómo usamos los datos</h2>
              <p>Los usamos para crear y proteger la cuenta, recordar tu perfil y despensa, conversar sobre comida, encontrar recetas compatibles con tus preferencias, mostrar nutrientes, registrar lo que comiste y mantener el servicio. Los datos técnicos y diagnósticos ayudan a detectar fallos, medir el rendimiento y prevenir abusos.</p>
              <p>La foto y el seguimiento nutricional son funciones que decides usar. Las sugerencias y los cálculos pueden tener errores: verifica ingredientes, etiquetas, alérgenos y cantidades. <strong>Pendiente:</strong> documentar las bases legales aplicables en los países donde se ofrezca NutriBot.</p>
            </section>
            <section id="gemini" className="privacy-provider">
              <span className="privacy-provider-label">Proveedor de IA</span>
              <h2>4. Google Gemini</h2>
              <p>Gemini interpreta las consultas en lenguaje natural, conversa contigo, reconoce ingredientes en fotos elegidas por ti y ayuda a traducir alimentos, títulos e ingredientes de recetas. También estima dificultad y clasifica recetas como desayuno, almuerzo o cena cuando hace falta.</p>
              <p>Según la función, enviamos el mensaje actual, una parte reciente de la conversación, alimentos de la despensa, dieta y exclusiones, o la foto elegida. Para traducir una receta enviamos su título e ingredientes. No añadimos automáticamente tu correo, contraseña, nombre, fecha de nacimiento ni medidas corporales. Lo que escribas o aparezca en una foto sí puede llegar a Google.</p>
              <p><strong>Modalidad pendiente de confirmar:</strong> las <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">condiciones de Gemini API</a> distinguen entre servicios gratuitos y servicios con facturación activa. En la modalidad gratuita, Google puede usar entradas y salidas para mejorar sus servicios y para revisión humana. En la modalidad pagada no las usa para mejorar productos, pero puede conservarlas temporalmente por seguridad. Confirmaremos cuál corresponde a NutriBot antes de publicar esta política.</p>
            </section>
            <section id="edamam" className="privacy-provider">
              <span className="privacy-provider-label">Búsqueda de recetas</span>
              <h2>5. Edamam</h2>
              <p>Edamam recibe una búsqueda preparada con tus ingredientes y filtros relevantes, como dieta, alergias, exclusiones, tiempo, tipo de comida o límites nutricionales elegidos. También consultamos una receta por su identificador cuando la abres o registras, y podemos solicitar su lista de compras. No enviamos tu nombre, correo ni contraseña en la búsqueda.</p>
              <p>Edamam devuelve recetas de terceros, imágenes, ingredientes y, si están disponibles, nutrientes e índice glucémico. Los pasos de preparación se abren en el sitio de origen, sujeto a sus propias prácticas de privacidad. Con Enterprise Basic conservamos la referencia y el nombre de las recetas que guardas; la categoría es de NutriBot. Los nutrientes de Edamam se muestran al consultarlos y no se almacenan actualmente. Consulta las <a href="https://developer.edamam.com/edamam-recipe-api" target="_blank" rel="noopener noreferrer">condiciones de Recipe Search</a>.</p>
            </section>
            <section id="usda" className="privacy-provider">
              <span className="privacy-provider-label">Datos de alimentos</span>
              <h2>6. USDA FoodData Central</h2>
              <p>Consultamos FoodData Central del Departamento de Agricultura de Estados Unidos para buscar alimentos y obtener valores nutricionales de ingredientes y recetas locales. Enviamos el nombre del alimento o su identificador de FoodData Central, sin añadir automáticamente tu nombre, correo ni contraseña. A veces Gemini traduce primero el nombre para mejorar la búsqueda.</p>
              <p>Podemos guardar la referencia del alimento de USDA y sus nutrientes vinculados a tu cuenta o a una receta local para los cálculos de la app. Los valores varían por marca, porción y preparación. <a href="https://fdc.nal.usda.gov/api-guide/" target="_blank" rel="noopener noreferrer">Conoce FoodData Central</a>.</p>
            </section>
            <section id="cookies">
              <h2>7. Cookies y preferencias</h2>
              <p>Cuando ingresas, NutriBot usa la cookie propia <strong>nutribot_session</strong> para mantener tu sesión y proteger el acceso a tu cuenta. Es necesaria para usar las funciones con inicio de sesión. Tiene una duración de hasta 8 horas o hasta 30 días si eliges «recordarme»; se elimina al cerrar sesión. Se configura como HttpOnly y SameSite=Strict, y como Secure cuando la conexión es HTTPS.</p>
              <p>Actualmente no usamos cookies opcionales de publicidad o análisis. El aviso ofrece «Aceptar todas» y «Rechazar opcionales»: ambas opciones mantienen la cookie necesaria, porque no existe ninguna opcional que activar o desactivar por ahora. Guardamos tu elección en el almacenamiento local del navegador bajo <strong>nutribot.cookies.v1</strong> para no repetir el aviso; permanece hasta que la cambies aquí o borres los datos del navegador.</p>
              <button type="button" className="privacy-cookie-settings" onClick={() => window.dispatchEvent(new Event("nutribot:cookies-open"))}>Cambiar preferencia de cookies</button>
            </section>
            <section id="conservacion">
              <h2>8. Conservación y seguridad</h2>
              <p>La cuenta, el perfil, la despensa, las conversaciones y las comidas se guardan en PostgreSQL mientras la cuenta siga activa o hasta que uses una función de restablecimiento que elimine esos datos.</p>
              <p>El portal muestra diagnósticos detallados de los últimos 30 días. Los registros anteriores se depuran al registrar nuevos eventos. Los totales diarios sin identificadores de cuenta se conservan para estadísticas históricas durante varios años. El portal de diagnósticos solo es accesible para la cuenta administradora configurada. Las contraseñas se guardan con hash y se limita el acceso a los datos por cuenta.</p>
              <p><strong>Pendiente:</strong> indicar alojamiento, transferencias internacionales, duración de copias de seguridad y procedimiento de eliminación completa de cuenta. Restablecer datos no borra la cuenta ni solicitudes ya procesadas por proveedores externos.</p>
            </section>
            <section id="derechos">
              <h2>9. Tus opciones</h2>
              <p>Puedes revisar y cambiar tu perfil y despensa, quitar recetas guardadas, administrar conversaciones, registrar o eliminar comidas y cerrar sesión. «Restaurar mis datos» reinicia datos de uso, pero mantiene la cuenta. Para solicitar acceso, corrección, exportación o eliminación completa falta establecer un correo de privacidad y un procedimiento de verificación. Los derechos y plazos concretos dependerán de la legislación aplicable.</p>
            </section>
            <section id="cambios">
              <h2>10. Cambios a esta política</h2>
              <p>Actualizaremos el texto cuando cambien las funciones o proveedores y mostraremos aquí la fecha de vigencia de la versión definitiva. <strong>Fecha de vigencia: pendiente.</strong></p>
            </section>
          </div>
        </div>
      </main>
      <footer className="privacy-footer"><span>© 2026 NutriBot</span><a href="#welcome">Inicio</a></footer>
    </div>
  );
}
