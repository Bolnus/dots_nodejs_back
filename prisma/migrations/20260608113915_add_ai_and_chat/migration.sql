-- CreateEnum
CREATE TYPE "DotsChatSenderKind" AS ENUM ('AI', 'PLAYER', 'VIEWER');

-- AlterTable
ALTER TABLE "DotsRoom" ADD COLUMN     "aiPlayerUserId" TEXT;

-- CreateTable
CREATE TABLE "DotsChat" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DotsChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DotsChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderKind" "DotsChatSenderKind" NOT NULL,
    "senderUserId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DotsChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DotsChat_roomId_key" ON "DotsChat"("roomId");

-- CreateIndex
CREATE INDEX "DotsChatMessage_chatId_createdAt_idx" ON "DotsChatMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "DotsRoom" ADD CONSTRAINT "DotsRoom_aiPlayerUserId_fkey" FOREIGN KEY ("aiPlayerUserId") REFERENCES "DotsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DotsChat" ADD CONSTRAINT "DotsChat_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DotsRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DotsChatMessage" ADD CONSTRAINT "DotsChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "DotsChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DotsChatMessage" ADD CONSTRAINT "DotsChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "DotsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
