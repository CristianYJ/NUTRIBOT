import { useEffect } from "react";
import { privacySectionIds } from "./public-navigation.js";
import { jumpToPrivacySection } from "./privacy-navigation.js";
import "./privacy-page.css";

const sections = [
  ["responsable", "Responsable y contacto"],
  ["datos", "Datos personales tratados"],
  ["uso", "Finalidades del tratamiento"],
  ["gemini", "Google Gemini"],
  ["edamam", "Edamam"],
  ["usda", "USDA FoodData Central"],
  ["cookies", "Cookies y preferencias"],
  ["conservacion", "Conservación y seguridad"],
  ["derechos", "Derechos de las personas usuarias"],
  ["normativa", "Marco legal"],
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
          <p>Esta política describe los datos personales tratados por NutriBot, las finalidades del tratamiento y los medios disponibles para ejercer los derechos de las personas usuarias.</p>
        </div>
        <div className="privacy-content">
          <nav className="privacy-toc" aria-label="Contenido de la política">
            <strong>En esta página</strong>
            {sections.map(([id, label]) => <button key={id} type="button" onClick={() => jumpToPrivacySection(id)}>{label}</button>)}
          </nav>
          <div className="privacy-articles">
            <section id="responsable">
              <h2>1. Responsable y contacto</h2>
              <p>El responsable del tratamiento de datos personales de NutriBot se identifica provisionalmente como <strong>John Doe</strong>, en <strong>El Salvador</strong>. Las consultas sobre privacidad y las solicitudes relativas a datos personales pueden dirigirse a <a href="mailto:soporte@nutribot.online">soporte@nutribot.online</a>.</p>
              <p>Dirección provisional de contacto: Prolongación Alameda Juan Pablo II, Calle El Carmen, San Antonio Abad, San Salvador, El Salvador (<a href="https://www.uees.edu.sv/" target="_blank" rel="noopener noreferrer">dirección de la Universidad Evangélica de El Salvador</a>). La referencia a esta dirección no atribuye a la universidad la operación ni el respaldo de NutriBot.</p>
            </section>
            <section id="datos">
              <h2>2. Datos personales tratados</h2>
              <p>NutriBot trata los datos proporcionados por la persona usuaria y los generados durante el uso del servicio:</p>
              <ul>
                <li><strong>Cuenta y acceso:</strong> nombre, correo electrónico, fecha de nacimiento, plan asignado, hash de la contraseña y datos de sesión. Para restablecer la contraseña se genera un enlace temporal de un solo uso, enviado al correo registrado. El personal administrador puede solicitar el envío de ese enlace, sin acceder a la contraseña.</li>
                <li><strong>Perfil alimentario:</strong> objetivos, dieta, alergias, restricciones y alimentos excluidos. Según los campos completados, también peso, estatura, actividad, metas nutricionales y notas sobre indicaciones profesionales. Las alergias y determinadas notas pueden constituir datos relativos a la salud.</li>
                <li><strong>Despensa:</strong> alimentos agregados, fechas de almacenamiento y vencimiento, y alimentos personalizados.</li>
                <li><strong>Recetas y comidas:</strong> recetas locales, identificador y nombre de las recetas de Edamam guardadas, categoría asignada por NutriBot, valoraciones, comidas registradas y datos nutricionales de recetas locales o consultas a USDA. Los valores nutricionales de Edamam se consultan cuando se necesitan y no se almacenan bajo el plan actual.</li>
                <li><strong>Conversaciones:</strong> mensajes, respuestas y referencias de recetas. Los datos personales incluidos en mensajes de texto libre también forman parte de la conversación.</li>
                <li><strong>Fotos de Nutri-Vision:</strong> las imágenes seleccionadas se envían para identificar alimentos. NutriBot no conserva el archivo de la imagen en el historial de su base de datos. Los alimentos confirmados sí se guardan en la despensa.</li>
                <li><strong>Funcionamiento y seguridad:</strong> identificador de cuenta y sesión, función utilizada, resultado, tiempos de respuesta y errores. Cuando falla una consulta de recetas, pueden conservarse extractos limitados del mensaje y del contexto anterior. Se ocultan los correos y teléfonos detectados; otros datos personales incluidos en el texto libre podrían permanecer en esos extractos.</li>
              </ul>
            </section>
            <section id="uso">
              <h2>3. Finalidades del tratamiento</h2>
              <p>Los datos se utilizan para administrar la cuenta, proteger el acceso, mantener el perfil y la despensa, atender consultas culinarias, buscar recetas conforme a las preferencias registradas, presentar información nutricional y registrar comidas. Los registros técnicos permiten detectar errores, medir el funcionamiento del servicio y prevenir usos indebidos.</p>
              <p>El análisis de fotografías y el seguimiento nutricional se realizan cuando la persona usuaria utiliza esas funciones. Las recetas y los cálculos son información orientativa; corresponde comprobar ingredientes, alérgenos, etiquetas y cantidades antes de preparar o consumir un alimento.</p>
            </section>
            <section id="gemini" className="privacy-provider">
              <span className="privacy-provider-label">Proveedor de IA</span>
              <h2>4. Google Gemini</h2>
              <p>NutriBot utiliza Google Gemini para interpretar consultas en lenguaje natural, mantener conversaciones, identificar ingredientes en fotografías, traducir títulos e ingredientes y estimar la dificultad o categoría de una receta.</p>
              <p>Según la función utilizada, se transmite el mensaje actual, una parte reciente de la conversación, datos pertinentes de la despensa y las restricciones alimentarias, el título y los ingredientes de una receta o la fotografía seleccionada. NutriBot no incorpora automáticamente el nombre, correo, contraseña, fecha de nacimiento ni medidas corporales a estas solicitudes. Sin embargo, el texto o la imagen proporcionados por la persona usuaria podrían contener esos datos.</p>
              <p>El tratamiento que realiza Google depende de la modalidad de Gemini API contratada. Sus <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">condiciones</a> distinguen entre servicios gratuitos y servicios con facturación activa. NutriBot deberá indicar la modalidad utilizada antes de presentar esta política como definitiva.</p>
            </section>
            <section id="edamam" className="privacy-provider">
              <span className="privacy-provider-label">Búsqueda de recetas</span>
              <h2>5. Edamam</h2>
              <p>Edamam recibe los ingredientes y filtros necesarios para buscar recetas, incluidos los relativos a dieta, alergias, exclusiones, tiempo, tipo de comida o límites nutricionales. También puede consultarse una receta por su identificador al abrirla o registrarla y solicitarse una lista de compras. La búsqueda no incluye automáticamente el nombre, correo ni contraseña de la persona usuaria.</p>
              <p>Edamam proporciona recetas de terceros, imágenes, ingredientes y, cuando están disponibles, nutrientes e índice glucémico. Las instrucciones de preparación se consultan en el sitio de origen. NutriBot conserva la referencia y el nombre de las recetas guardadas, así como una categoría propia; los valores nutricionales de Edamam se muestran tras la consulta y no se almacenan actualmente. Se aplican las <a href="https://developer.edamam.com/edamam-recipe-api" target="_blank" rel="noopener noreferrer">condiciones del servicio de Edamam</a>.</p>
            </section>
            <section id="usda" className="privacy-provider">
              <span className="privacy-provider-label">Datos de alimentos</span>
              <h2>6. USDA FoodData Central</h2>
              <p>NutriBot consulta FoodData Central, del Departamento de Agricultura de Estados Unidos, para identificar alimentos y obtener valores nutricionales de ingredientes y recetas locales. Se transmite el nombre o identificador del alimento, sin añadir automáticamente nombre, correo ni contraseña. En determinados casos, Gemini traduce previamente el nombre del alimento para facilitar la búsqueda.</p>
              <p>La referencia del alimento y sus nutrientes pueden conservarse vinculados a la cuenta o a una receta local. Los valores pueden variar según marca, porción y preparación. Puede consultarse la <a href="https://fdc.nal.usda.gov/api-guide/" target="_blank" rel="noopener noreferrer">documentación de FoodData Central</a>.</p>
            </section>
            <section id="cookies">
              <h2>7. Cookies y preferencias</h2>
              <p>La cookie propia <strong>nutribot_session</strong> mantiene la sesión y protege el acceso a la cuenta. Es necesaria para las funciones que requieren autenticación. Su duración máxima es de ocho horas o de 30 días si se selecciona «recordarme». Se elimina al cerrar sesión y se configura con los atributos HttpOnly y SameSite=Strict; también con Secure cuando la conexión utiliza HTTPS.</p>
              <p>NutriBot no utiliza actualmente cookies opcionales de publicidad o análisis. Por ello, «Aceptar todas» y «Rechazar opcionales» producen el mismo resultado respecto de la cookie necesaria. La preferencia se conserva en el almacenamiento local del navegador bajo <strong>nutribot.cookies.v1</strong> hasta que se modifique o se borren los datos del navegador.</p>
              <button type="button" className="privacy-cookie-settings" onClick={() => window.dispatchEvent(new Event("nutribot:cookies-open"))}>Cambiar preferencia de cookies</button>
            </section>
            <section id="conservacion">
              <h2>8. Conservación y seguridad</h2>
              <p>Los datos de cuenta, perfil, despensa, conversaciones y comidas se conservan en PostgreSQL mientras la cuenta permanezca activa, salvo las eliminaciones o restablecimientos efectuados mediante las funciones disponibles. Restablecer los datos de uso no elimina la cuenta ni revierte el tratamiento ya realizado por proveedores externos.</p>
              <p>Los enlaces de restablecimiento de contraseña vencen a los 20 minutos y son de un solo uso. Se conserva un hash del token, la cuenta y las fechas de solicitud y uso; cuando procede, también el identificador del administrador que solicitó el envío. Los registros antiguos se depuran al generar nuevos enlaces. Los correos transaccionales se envían mediante Hostinger desde <a href="mailto:soporte@nutribot.online">soporte@nutribot.online</a>.</p>
              <p>Los diagnósticos detallados del portal administrativo comprenden los últimos 30 días. Los totales diarios sin identificadores de cuenta se conservan para estadísticas históricas. El acceso al portal requiere el rol de administrador. Las contraseñas se almacenan mediante hash y el acceso a los datos se restringe por cuenta.</p>
            </section>
            <section id="derechos">
              <h2>9. Derechos de las personas usuarias</h2>
              <p>La <a href="https://www.asamblea.gob.sv/leyes-y-decretos/view/6054" target="_blank" rel="noopener noreferrer">Ley para la Protección de Datos Personales de El Salvador</a>, con sus <a href="https://www.asamblea.gob.sv/leyes-y-decretos/view/7022" target="_blank" rel="noopener noreferrer">reformas de 2026</a>, reconoce derechos de acceso, rectificación, cancelación, oposición, portabilidad, olvido y limitación, según corresponda. Las solicitudes pueden dirigirse a <a href="mailto:soporte@nutribot.online">soporte@nutribot.online</a>; antes de atenderlas se verificará la identidad de la persona solicitante.</p>
              <p>Desde la aplicación pueden modificarse el perfil y la despensa, retirarse recetas guardadas, administrarse conversaciones y registros de comidas, y cambiarse la contraseña. «Restaurar mis datos» elimina datos de uso, pero mantiene la cuenta. Para solicitar la eliminación completa de la cuenta o una copia de los datos, debe escribirse al correo indicado.</p>
            </section>
            <section id="normativa">
              <h2>10. Marco legal</h2>
              <p>El tratamiento de datos personales se sujeta principalmente a la Ley para la Protección de Datos Personales (Decreto Legislativo n.º 144 de 2024 y reformas posteriores). El uso de información nutricional y la eventual comercialización de suscripciones se relacionan, además, con las siguientes normas salvadoreñas, según la actividad efectivamente realizada:</p>
              <ul>
                <li><a href="https://biblioteca.asamblea.gob.sv/31354_cdigo-de-salud-decreto-no-955-de-fecha-28-de-abril-de-1988" target="_blank" rel="noopener noreferrer">Código de Salud (Decreto Legislativo n.º 955)</a>: delimita el ejercicio profesional en materia de salud. NutriBot ofrece información culinaria y nutricional orientativa, sin emitir diagnósticos ni tratamientos.</li>
                <li><a href="https://www.asamblea.gob.sv/leyes-y-decretos/decretos-por-anios/2005/0" target="_blank" rel="noopener noreferrer">Ley de Protección al Consumidor (Decreto Legislativo n.º 776)</a> y <a href="https://www.asamblea.gob.sv/leyes-y-decretos/decretos-por-anios/2019/0" target="_blank" rel="noopener noreferrer">Ley de Comercio Electrónico (Decreto Legislativo n.º 463)</a>: resultan pertinentes para la contratación digital y, cuando se habiliten pagos, para las condiciones de suscripción. Esta política no sustituye los términos comerciales.</li>
                <li><a href="https://www.asamblea.gob.sv/sites/default/files/documents/decretos/D214AD9F-9A48-4A9C-893C-7E063FE7C4A9.pdf" target="_blank" rel="noopener noreferrer">Ley de Propiedad Intelectual (Decreto Legislativo n.º 66)</a>: se relaciona con el uso de software, imágenes, recetas y contenidos de terceros.</li>
                <li><a href="https://www.asamblea.gob.sv/sites/default/files/documents/decretos/C4062E8E-154F-4F82-9835-7C1D16EF4616.pdf" target="_blank" rel="noopener noreferrer">Ley de Fomento a la Innovación y Manufactura de Tecnologías (Decreto Legislativo n.º 722)</a>: cualquier incentivo previsto en ella requiere verificar los requisitos legales; esta política no afirma que NutriBot sea beneficiario.</li>
              </ul>
            </section>
            <section id="cambios">
              <h2>11. Cambios a esta política</h2>
              <p>Las modificaciones de esta política se publicarán en esta página, con indicación de la fecha correspondiente. <strong>Última actualización: 30 de octubre de 2026.</strong></p>
            </section>
          </div>
        </div>
      </main>
      <footer className="privacy-footer"><span>© 2026 NutriBot</span><a href="#welcome">Inicio</a></footer>
    </div>
  );
}
