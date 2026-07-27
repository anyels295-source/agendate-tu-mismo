-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'TEAMS';

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "ownerEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Professional" ADD COLUMN     "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Professional" ADD COLUMN     "notifyEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Professional" ADD COLUMN     "notifyTeams" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Professional" ADD COLUMN     "teamsWebhookUrl" TEXT;

-- Backfill: el/los profesional(es) ya existentes pasan a pertenecer al admin
-- configurado en ADMIN_EMAIL (que es, hasta ahora, el único dueño posible).
UPDATE "Professional" SET "ownerEmail" = "email" WHERE "ownerEmail" = '';

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "price" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_professionalId_idx" ON "Service"("professionalId");

-- CreateIndex
CREATE INDEX "Professional_ownerEmail_idx" ON "Professional"("ownerEmail");

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "serviceId" TEXT;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
