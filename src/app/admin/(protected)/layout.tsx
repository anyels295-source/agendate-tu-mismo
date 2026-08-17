import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional, getProfessionalsForOwner } from "@/lib/professional";
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const [professionals, active] = await Promise.all([getProfessionalsForOwner(), getActiveProfessional()]);
  const bookingUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reservar/${active.slug}`;

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
