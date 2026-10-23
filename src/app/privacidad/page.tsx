import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Política de privacidad" };

/**
 * Política de privacidad. Describe lo que la app hace de verdad (ver
 * src/lib/booking.ts, src/lib/calendar/*, src/lib/notifications/*). Si cambia qué
 * datos se guardan o con quién se comparten, hay que actualizar este texto.
 */
export default function PrivacidadPage() {
  const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

  return (
    <LegalPage title="Política de privacidad">
      <p>
        Agendate Tú Mismo es un servicio de {LEGAL.responsable} que permite a profesionales publicar su agenda y a sus
        clientes reservar turnos en línea. Esta política explica qué datos usamos, para qué y cómo los cuidamos.
      </p>

      <h2>Qué datos usamos</h2>
      <p>
        <strong>Si reservás un turno:</strong> tu nombre, tu email, tu WhatsApp si lo dejás, las notas que escribas y el
        día y la hora que elegiste.
      </p>
      <p>
        <strong>Si sos profesional:</strong> tu nombre, tu email, tu horario de atención, tu foto si la subís y la
        conexión con tu calendario de Google o de Microsoft.
      </p>
      <p>
        También registramos, sin guardar tu dirección IP en claro, cuántas solicitudes llegan desde una misma conexión,
        para frenar abusos. Esos registros se borran automáticamente después de 24 horas.
      </p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Registrar el turno, mostrarle al profesional su agenda y evitar reservas superpuestas.</li>
        <li>Mandarte la confirmación, los recordatorios y los avisos de cambios o cancelaciones del turno.</li>
        <li>Proteger el servicio contra reservas automáticas y otros abusos.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad.</p>

      <h2>Datos de Google y de Microsoft</h2>
      <p>
        Cuando un profesional conecta su Google Calendar o su calendario de Outlook, la app accede a ese calendario con
        el permiso que el profesional da en la pantalla de Google o de Microsoft, y solo para:
      </p>
      <ul>
        <li>Consultar en qué horarios está ocupado, para ofrecer solo horarios libres.</li>
        <li>Crear, mover o borrar el evento de cada turno reservado, e invitar al cliente cuando el turno se confirma.</li>
        <li>Ver si el cliente aceptó o rechazó esa invitación.</li>
        <li>Conocer el email de la cuenta conectada, para identificarla.</li>
      </ul>
      <p>
        El uso y la transferencia de la información recibida de las API de Google se ajustan a la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Política de Datos del Usuario de los Servicios de API de Google
        </a>
        , incluidos los requisitos de Uso Limitado. No usamos esos datos para publicidad, no los vendemos, no los usamos
        para entrenar modelos de inteligencia artificial y nadie los lee salvo que el profesional lo pida, haga falta por
        seguridad o lo exija la ley.
      </p>
      <p>
        Los permisos de acceso al calendario se guardan cifrados. El profesional puede desconectar su calendario cuando
        quiera desde el panel, o quitar el acceso desde{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          su cuenta de Google
        </a>
        .
      </p>

      <h2>Con quién se comparten</h2>
      <p>Solo con los servicios que necesitamos para que la app funcione:</p>
      <ul>
        <li>Vercel (alojamiento de la app) y Neon (base de datos).</li>
        <li>Resend (envío de emails) y, si el profesional lo activó, WhatsApp de Meta y Microsoft Teams (avisos).</li>
        <li>Google y Microsoft (calendario), según lo explicado más arriba.</li>
        <li>Cloudflare Turnstile (verificación de que quien reserva es una persona).</li>
      </ul>
      <p>
        El profesional con el que reservás ve tus datos de contacto y los de tu turno. Para esos datos, el profesional es
        el responsable y {LEGAL.responsable} los trata por su cuenta.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Los datos de los turnos se guardan mientras el profesional use Agendate Tú Mismo, para que tenga su historial.
        Podés pedir que se borren antes escribiendo a {mail}.
      </p>

      <h2>Cómo los cuidamos</h2>
      <p>
        Toda la comunicación viaja cifrada (HTTPS), los permisos de calendario se guardan cifrados y el acceso al panel
        del profesional está protegido con contraseña y límites de intentos.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir ver, corregir o borrar tus datos, de acuerdo con la Ley 18.331 de Protección de Datos Personales de
        Uruguay, escribiendo a {mail}. Te respondemos dentro de los plazos que fija la ley.
      </p>

      <h2>Cambios en esta política</h2>
      <p>
        Si cambiamos esta política, actualizamos la fecha de arriba. Si el cambio es importante, se lo avisamos a los
        profesionales que usan el servicio.
      </p>
    </LegalPage>
  );
}
