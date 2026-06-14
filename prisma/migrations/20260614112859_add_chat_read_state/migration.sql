-- CreateTable
CREATE TABLE "DotsChatReadState" (
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAtMs" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DotsChatReadState_pkey" PRIMARY KEY ("chatId","userId")
);

-- AddForeignKey
ALTER TABLE "DotsChatReadState" ADD CONSTRAINT "DotsChatReadState_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "DotsChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
