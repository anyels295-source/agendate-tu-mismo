/*
  Warnings:

  - You are about to drop the column `isActive` on the `CalendarConnection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "clientPhone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CalendarConnection" DROP COLUMN "isActive";
