import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Condiciones del servicio" };

export default function TerminosPage() {
  const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

  return (
    <LegalPage title="Condiciones del servicio">
      <p>
        Estas condiciones regulan el uso de Agendate Tú Mismo, un servicio de {LEGAL.responsable} para reservar turnos
        en línea. Al usar el servicio, aceptás estas condiciones y la <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2>Qué es el servicio</h2>
      <p>
        Agendate Tú Mismo permite a profesionales publicar los horarios en que atienden, conectados con su calendario, y
        a sus clientes reservar, confirmar o cancelar turnos sin necesidad de llamar ni escribir.
      </p>

      <h2>Si reservás un turno</h2>
      <ul>
        <li>Usá tus datos reales: el email que dejes es el que recibe la confirmación y los avisos del turno.</li>
        <li>No reserves a nombre de otra persona sin su consentimiento.</li>
        <li>
          Los turnos pendientes se confirman desde el email que te mandamos. Si no se confirman a tiempo, se pueden
          cancelar solos para liberar el horario.
        </li>
        <li>Si no podés asistir, cancelá con el link de tu email, así el horario queda libre para otra persona.</li>
      </ul>

      <h2>Si sos profesional</h2>
      <ul>
        <li>Sos responsable de los datos de tus clientes y de usarlos solo para atenderlos.</li>
        <li>Cuidá tu contraseña y desconectá tu calendario si dejás de usar el servicio.</li>
        <li>Los precios y las condiciones de tus servicios son tuyos: Agendate Tú Mismo no cobra los turnos.</li>
      </ul>

      <h2>Usos no permitidos</h2>
      <p>
        No se permite usar el servicio para mandar mensajes no deseados, hacer reservas falsas o automáticas, ni intentar
        acceder a datos o cuentas ajenas. Podemos bloquear el acceso a quien lo haga.
      </p>

      <h2>Disponibilidad y responsabilidad</h2>
      <p>
        Hacemos lo posible para que el servicio funcione siempre, pero puede tener interrupciones o errores, y depende
        de servicios de terceros como Google, Microsoft o el proveedor de emails. El servicio se ofrece tal como está. El
        turno es un acuerdo entre el profesional y su cliente: {LEGAL.responsable} no es parte de la atención.
      </p>

      <h2>Cambios</h2>
      <p>
        Podemos actualizar estas condiciones. Cuando lo hagamos, cambiamos la fecha de arriba y, si el cambio es
        importante, se lo avisamos a los profesionales.
      </p>

      <h2>Ley aplicable y contacto</h2>
      <p>Estas condiciones se rigen por las leyes de la República Oriental del Uruguay. Por cualquier consulta: {mail}.</p>
    </LegalPage>
  );
}
