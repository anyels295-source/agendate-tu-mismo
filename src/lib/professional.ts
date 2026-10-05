import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKING_HOURS } from "@/lib/types";
import { slugify } from "@/lib/slug";
import { AppError } from "@/lib/errors";

/**
 * Gestión de profesionales para el panel /admin.
 *
 * El login sigue siendo el de un único admin por variables de entorno
 * (ADMIN_EMAIL / ADMIN_PASSWORD_HASH, ver src/lib/auth.ts), pero esa cuenta
 * puede administrar varios "profesionales" (integrantes del equipo, cada uno
 * con su propio calendario/servicios/horarios/página de reserva). El
 * profesional "activo" en la sesión del admin se recuerda con una cookie
 * (ACTIVE_PROFESSIONAL_COOKIE) y se puede cambiar desde el selector del panel.
 *
 * Si todavía no existe ningún profesional para esta cuenta, se crea uno
 * automáticamente (con los datos del propio admin) para no obligar a un alta
 * manual antes de poder probar la herramienta.
 */

const ACTIVE_PROFESSIONAL_COOKIE = "agendate_active_professional";

function getOwnerEmail(): string {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("Falta ADMIN_EMAIL en el entorno.");
  return email;
}

async function uniqueSlugFor(base: string): Promise<string> {
  const baseSlug = slugify(base) || "profesional";
  let slug = baseSlug;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.professional.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

async function createProfessional(ownerEmail: string, opts?: { name?: string; email?: string }) {
  const email = opts?.email ?? ownerEmail;
  const name = opts?.name ?? email.split("@")[0];
  const slug = await uniqueSlugFor(name);
  return prisma.professional.create({
    data: {
      ownerEmail,
      slug,
      name,
      email,
      workingHours: DEFAULT_WORKING_HOURS,
    },
  });
}

/** Todos los profesionales que administra la cuenta admin actual, creando el primero si hace falta. */
export const getProfessionalsForOwner = cache(async () => {
  const owner = getOwnerEmail();
  const list = await prisma.professional.findMany({
    where: { ownerEmail: owner },
    orderBy: { createdAt: "asc" },
  });
  if (list.length > 0) return list;
  const created = await createProfessional(owner);
  return [created];
});

/** El profesional "activo" en el panel (según cookie), o el primero si no hay selección o no es válida. */
export const getActiveProfessional = cache(async () => {
  const professionals = await getProfessionalsForOwner();
  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_PROFESSIONAL_COOKIE)?.value;
  const found = activeId ? professionals.find((p) => p.id === activeId) : undefined;
  return found ?? professionals[0];
});

// Alias por compatibilidad con el código ya escrito antes de sumar multi-profesional.
export const getOrCreateActiveProfessional = getActiveProfessional;

export async function setActiveProfessional(professionalId: string) {
  const owner = getOwnerEmail();
  const belongs = await prisma.professional.findFirst({
    where: { id: professionalId, ownerEmail: owner },
  });
  if (!belongs) throw new AppError("Ese profesional no pertenece a esta cuenta.");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROFESSIONAL_COOKIE, professionalId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return belongs;
}

export async function createTeamProfessional(params: { name: string; email: string }) {
  const owner = getOwnerEmail();
  const existing = await prisma.professional.findUnique({ where: { email: params.email } });
  if (existing) throw new AppError("Ya existe un profesional con ese email.");
  return createProfessional(owner, params);
}
