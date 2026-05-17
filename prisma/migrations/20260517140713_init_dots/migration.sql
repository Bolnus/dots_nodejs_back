-- CreateEnum
CREATE TYPE "DotsRoomStatus" AS ENUM ('WAITING', 'PLAYING', 'FINISHED');

-- CreateEnum
CREATE TYPE "DotsRoomMemberRole" AS ENUM ('PLAYER0', 'PLAYER1', 'VIEWER');

-- CreateTable
CREATE TABLE "DotsUser" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DotsUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DotsRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "DotsRoomStatus" NOT NULL DEFAULT 'WAITING',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "serverState" JSONB,
    "presence" JSONB,
    "presenceByUserId" TEXT,
    "lockedPlayer0UserId" TEXT,
    "lockedPlayer1UserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DotsRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DotsRoomMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "DotsRoomMemberRole" NOT NULL,

    CONSTRAINT "DotsRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DotsUser_normalizedName_key" ON "DotsUser"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "DotsRoomMember_roomId_userId_key" ON "DotsRoomMember"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "DotsRoom" ADD CONSTRAINT "DotsRoom_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "DotsUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DotsRoomMember" ADD CONSTRAINT "DotsRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DotsRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DotsRoomMember" ADD CONSTRAINT "DotsRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DotsUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
