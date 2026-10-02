import { getActiveProfessional } from "@/lib/professional";
import { prisma } from "@/lib/prisma";
import ConfiguracionForm from "@/components/ConfiguracionForm";
import ServiciosManager from "@/components/admin/ServiciosManager";
import NotificationsForm from "@/components/admin/NotificationsForm";
import type { WorkingHours } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const professional = await getActiveProfessional();
  const services = await prisma.service.findMany({
    where: { professionalId: professional.id, active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-[18px] pb-11 md:px-9 md:py-[30px]">
      <h1 className="m-0 mb-[22px] text-[26px] font-extrabold tracking-tight text-[#16233d]">Configuración</h1>

      <ConfiguracionForm
        initial={{
          name: professional.name,
          slug: professional.slug,
          serviceName: professional.serviceName,
          durationMinutes: professional.durationMinutes,
          bufferMinutes: professional.bufferMinutes,
          minNoticeHours: professional.minNoticeHours,
          workingHours: professional.workingHours as unknown as WorkingHours,
          timezone: professional.timezone,
          photoUrl: professional.photoUrl,
          theme: professional.theme,
        }}
      />

      <ServiciosManager
        initial={services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.price, active: s.active }))}
      />

      <NotificationsForm
        initial={{
          notifyWhatsapp: professional.notifyWhatsapp,
          notifyEmail: professional.notifyEmail,
          notifyTeams: professional.notifyTeams,
          teamsWebhookUrl: professional.teamsWebhookUrl,
        }}
      />
    </div>
  );
}

export const metadata = { title: "Configuración" };
