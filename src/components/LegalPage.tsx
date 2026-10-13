import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/** Marco común de las páginas legales: título, fecha, contenido y pie con enlaces. */
export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed text-gray-700">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        ← Agendate Tú Mismo
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-brand-700">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">Última actualización: {LEGAL.updatedAt}</p>
      <div className="mt-6 space-y-4 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand-600 [&_a]:underline">
        {children}
      </div>
      <LegalLinks className="mt-12" />
    </main>
  );
}

/** Enlaces a las páginas legales, para los pies de página. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12px] text-gray-500 ${className}`}>
      <Link href="/privacidad" className="hover:underline">
        Política de privacidad
      </Link>
      {" · "}
      <Link href="/terminos" className="hover:underline">
        Condiciones del servicio
      </Link>
    </p>
  );
}
