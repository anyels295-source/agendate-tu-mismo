import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  const isLoginPage = false; // el layout no envuelve a /admin/login (ver nota abajo)

  if (!session && !isLoginPage) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-brand-700">Agendate Tú Mismo</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin/reservas" className="text-gray-600 hover:text-brand-600">Reservas</Link>
            <Link href="/admin/calendarios" className="text-gray-600 hover:text-brand-600">Calendarios</Link>
            <Link href="/admin/configuracion" className="text-gray-600 hover:text-brand-600">Configuración</Link>
          </nav>
        </div>
        <LogoutButton />
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
