import { prisma } from "@/lib/prisma";
import BookingWidget from "@/components/BookingWidget";
import { notFound } from "next/navigation";

export default async function ReservarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const professional = await prisma.professional.findUnique({ where: { slug } });

  if (!professional || !professional.active) {
    notFound();
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center px-5 py-[34px] pb-[50px]"
      style={{ background: "radial-gradient(120% 90% at 50% 0%, #eaf1fa 0%, #f4f7fb 55%)" }}
    >
      <BookingWidget slug={professional.slug} professionalName={professional.name} />
      <p className="mt-5 text-[11.5px] text-[#6b7280]">Agendate Tú Mismo · reservá cuando quieras, sin llamadas</p>
    </main>
  );
}
