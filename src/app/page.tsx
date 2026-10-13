import { LegalLinks } from "@/components/LegalPage";

/**
 * Página principal. Google la revisa al publicar la app de OAuth: tiene que
 * describir qué hace la app y enlazar la política de privacidad.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold text-brand-700">Agendate Tú Mismo</h1>
      <p className="mt-3 max-w-md text-gray-600">
        Reservas de turnos en línea para profesionales. Cada profesional publica los horarios en que atiende, conectados
        con su Google Calendar u Outlook, y sus clientes reservan desde su página, sin llamadas ni mensajes cruzados.
      </p>
      <a
        href="/admin/login"
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white transition hover:bg-brand-700"
      >
        Ingresar como profesional
      </a>
      <LegalLinks className="mt-10" />
    </main>
  );
}
