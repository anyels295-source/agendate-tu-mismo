export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold text-brand-700">Agendate Tú Mismo</h1>
      <p className="mt-3 max-w-md text-gray-600">
        Este es el motor de reservas. Cada profesional tiene su propia página en{" "}
        <code className="rounded bg-brand-100 px-1.5 py-0.5 text-brand-700">/reservar/su-slug</code>.
      </p>
      <a
        href="/admin/login"
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white transition hover:bg-brand-700"
      >
        Ingresar como profesional
      </a>
    </main>
  );
}
