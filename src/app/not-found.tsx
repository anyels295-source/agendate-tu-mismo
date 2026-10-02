import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500">Error 404</p>
      <h1 className="text-2xl font-extrabold text-gray-900">No encontramos esta página</h1>
      <p className="max-w-sm text-sm text-gray-600">
        El enlace puede estar mal escrito o la página ya no está disponible. Revisá la dirección o pedile el link de reserva a quien te lo compartió.
      </p>
      <Link href="/" className="mt-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white">
        Ir al inicio
      </Link>
    </main>
  );
}
