import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional, getProfessionalsForOwner } from "@/lib/professional";
import AdminShell from "@/components/admin/AdminShell";
import { getPublicBaseUrl } from "@/lib/publicUrl";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    // Se recuerda a qué página se quería entrar, para volver ahí después de iniciar sesión.
    const requested = (await headers()).get("x-pathname");
    redirect(requested ? `/admin/login?next=${encodeURIComponent(requested)}` : "/admin/login");
  }

  const [professionals, active] = await Promise.all([getProfessionalsForOwner(), getActiveProfessional()]);
  const bookingUrl = `${await getPublicBaseUrl()}/reservar/${active.slug}`;

  return (
    <AdminShell
      professionals={professionals.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        serviceName: p.serviceName,
        photoUrl: p.photoUrl,
      }))}
      activeId={active.id}
      bookingUrl={bookingUrl}
      theme={active.theme}
    >
      {children}
    </AdminShell>
  );
}
