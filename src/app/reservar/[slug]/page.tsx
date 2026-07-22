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
    <main className="mx-auto min-h-screen max-w-md px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-brand-700">{professional.name}</h1>
        <p className="text-gray-600">
          {professional.serviceName} · {professional.durationMinutes} min
        </p>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        <BookingWidget slug={professional.slug} />
      </div>
      <p className="mt-6 text-center text-xs text-gray-400">
        Agendate Tú Mismo · reservá cuando quieras, sin llamadas
      </p>
    </main>
  );
}
