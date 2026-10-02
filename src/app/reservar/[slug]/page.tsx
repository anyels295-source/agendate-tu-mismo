import { prisma } from "@/lib/prisma";
import BookingWidget from "@/components/BookingWidget";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const professional = await prisma.professional.findUnique({ where: { slug }, select: { name: true, active: true } });
  if (!professional || !professional.active) return { title: "Página no encontrada" };
  return { title: `Reservá tu turno con ${professional.name}` };
}

export default async function ReservarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const professional = await prisma.professional.findUnique({ where: { slug } });

  if (!professional || !professional.active) {
    notFound();
  }

  return (
    <main
      data-theme={professional.theme}
      className="flex min-h-screen flex-col items-center bg-[var(--page)] px-5 py-[34px] pb-[50px]"
      style={{ background: "radial-gradient(120% 90% at 50% 0%, var(--brand-soft) 0%, var(--page) 55%)" }}
    >
      <BookingWidget slug={professional.slug} professionalName={professional.name} />
      <p className="mt-5 text-[11.5px] text-[var(--muted-nav)]">Agendate Tú Mismo · reservá cuando quieras, sin llamadas</p>
    </main>
  );
}
