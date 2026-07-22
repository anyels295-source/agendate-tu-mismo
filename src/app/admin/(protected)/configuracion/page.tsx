import { getOrCreateActiveProfessional } from "@/lib/professional";
import ConfiguracionForm from "@/components/ConfiguracionForm";
import type { WorkingHours } from "@/lib/types";

export const dynamic = "force-dynamic";


export default async function ConfiguracionPage() {
  const professional = await getOrCreateActiveProfessional();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">Configuración</h1>
      <ConfiguracionForm
        initial={{
          name: professional.name,
          slug: professional.slug,
          serviceName: professional.serviceName,
          durationMinutes: professional.durationMinutes,
          bufferMinutes: professional.bufferMinutes,
          minNoticeHours: professional.minNoticeHours,
          workingHours: professional.workingHours as unknown as WorkingHours,
        }}
      />
    </div>
  );
}
