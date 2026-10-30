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
                <li><strong>Cuenta y acceso:</strong> nombre, correo electrónico, fecha de nacimiento, plan asignado e información necesaria para autenticar y proteger la cuenta. Las solicitudes de cambio de contraseña se comunican al correo registrado.</li>
                <li><strong>Perfil alimentario:</strong> objetivos, dieta, alergias, restricciones y alimentos excluidos. Según los campos completados, también peso, estatura, actividad, metas nutricionales y notas sobre indicaciones profesionales. Las alergias y determinadas notas pueden constituir datos relativos a la salud.</li>
                <li><strong>Despensa:</strong> alimentos agregados, fechas de almacenamiento y vencimiento, y alimentos personalizados.</li>
                <li><strong>Recetas y comidas:</strong> recetas guardadas, categorías, valoraciones, comidas registradas e información nutricional utilizada por las funciones de seguimiento. Los valores nutricionales proporcionados por Edamam se muestran al consultar una receta y no se conservan bajo el plan actual.</li>
                <li><strong>Conversaciones:</strong> mensajes, respuestas y referencias de recetas. Los datos personales incluidos en mensajes de texto libre también forman parte de la conversación.</li>
                <li><strong>Fotos de Nutri-Vision:</strong> las imágenes seleccionadas se envían para identificar alimentos. NutriBot no conserva esas fotografías en el historial de la cuenta. Los alimentos confirmados sí se guardan en la despensa.</li>
                <li><strong>Funcionamiento y seguridad:</strong> datos de uso, rendimiento y errores necesarios para prestar el servicio, resolver incidencias y prevenir abusos. Los registros de incidencias pueden incluir fragmentos de las consultas enviadas por la persona usuaria.</li>
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
              <p>Según la función utilizada, se transmiten a Google las consultas o fotografías proporcionadas y la información alimentaria pertinente para responderlas. Las credenciales de acceso no se envían para estas funciones. El texto y las imágenes proporcionados por la persona usuaria podrían contener otros datos personales.</p>
              <p>Google trata la información recibida conforme a sus <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">condiciones de Gemini API</a>. Estas contemplan usos para prestar y proteger el servicio y, según la modalidad aplicable, para mejorar sus productos.</p>
            </section>
            <section id="edamam" className="privacy-provider">
              <span className="privacy-provider-label">Búsqueda de recetas</span>
              <h2>5. Edamam</h2>
              <p>Para buscar recetas, Edamam recibe los ingredientes y las preferencias alimentarias pertinentes, incluidas las restricciones que la persona usuaria haya indicado. NutriBot no transmite sus credenciales de acceso para realizar estas búsquedas.</p>
              <p>Edamam proporciona recetas de terceros, imágenes, ingredientes y, cuando están disponibles, información nutricional e índice glucémico. Las instrucciones de preparación pueden encontrarse en sitios externos. NutriBot conserva la referencia de las recetas guardadas por la persona usuaria, pero no almacena actualmente los valores nutricionales suministrados por Edamam. Se aplican las <a href="https://developer.edamam.com/edamam-recipe-api" target="_blank" rel="noopener noreferrer">condiciones del servicio de Edamam</a>.</p>
            </section>
            <section id="usda" className="privacy-provider">
              <span className="privacy-provider-label">Datos de alimentos</span>
              <h2>6. USDA FoodData Central</h2>
              <p>NutriBot consulta FoodData Central, del Departamento de Agricultura de Estados Unidos, para obtener información nutricional de alimentos y recetas. Estas consultas se basan en los alimentos utilizados y no requieren transmitir las credenciales de acceso de la persona usuaria.</p>
              <p>La información nutricional obtenida puede conservarse cuando sea necesaria para las funciones de la cuenta. Los valores pueden variar según marca, porción y preparación. Puede consultarse la <a href="https://fdc.nal.usda.gov/api-guide/" target="_blank" rel="noopener noreferrer">documentación de FoodData Central</a>.</p>
            </section>
            <section id="cookies">
              <h2>7. Cookies y preferencias</h2>
              <p>NutriBot utiliza una cookie necesaria para mantener la sesión iniciada. Si se activa la opción «recordarme», la sesión puede mantenerse durante más tiempo. La cookie de sesión no se utiliza con fines publicitarios.</p>
              <p>Actualmente no se utilizan cookies opcionales de publicidad o análisis. Por ello, aceptar o rechazar las cookies opcionales no modifica el funcionamiento de la cookie necesaria. La preferencia elegida se recuerda en el navegador y puede modificarse en cualquier momento.</p>
              <button type="button" className="privacy-cookie-settings" onClick={() => window.dispatchEvent(new Event("nutribot:cookies-open"))}>Cambiar preferencia de cookies</button>
            </section>
            <section id="conservacion">
              <h2>8. Conservación y seguridad</h2>
              <p>Los datos asociados a la cuenta se conservan mientras esta permanezca activa o durante el período necesario para prestar el servicio y atender obligaciones aplicables. Algunas funciones permiten modificar o eliminar datos de uso. Restablecer esos datos no elimina la cuenta ni revierte el tratamiento ya realizado por terceros.</p>
              <p>Los datos relacionados con solicitudes de cambio de contraseña y los registros de funcionamiento se conservan de forma limitada para fines de seguridad y atención de incidencias. Las comunicaciones de la cuenta se envían al correo registrado mediante un proveedor de correo electrónico.</p>
              <p>NutriBot aplica medidas de seguridad y restringe el acceso a la información según las funciones autorizadas. Los datos estadísticos consolidados pueden conservarse por períodos más amplios cuando ya no identifican a una persona.</p>
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
