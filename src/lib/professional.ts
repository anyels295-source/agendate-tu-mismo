import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKING_HOURS } from "@/lib/types";
import { slugify } from "@/lib/slug";

/**
 * El MVP piloto arranca con un único profesional (el admin definido por
 * ADMIN_EMAIL). Si todavía no existe el registro en la base, se crea
 * automáticamente en el primer ingreso al panel, para no obligar a un paso
 * manual de "alta de profesional" antes de poder probar la herramienta.
 *
 * Cuando se pase a multi-tenant, este archivo es el punto a reemplazar por
 * un flujo real de registro/alta de profesionales.
 */
export async function getOrCreateActiveProfessional() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("Falta ADMIN_EMAIL en el entorno.");

  const existing = await prisma.professional.findUnique({ where: { email } });
  if (existing) return existing;

  const baseSlug = slugify(email.split("@")[0]);
  return prisma.professional.create({
    data: {
      slug: baseSlug,
      name: email.split("@")[0],
      email,
      workingHours: DEFAULT_WORKING_HOURS,
    },
  });
}
