import { DotsRoomStatus } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { scheduleAiTurnIfNeeded } from "./ai/aiTurnService.js";

/** Loads ids of in-progress rooms that include an AI opponent. */
async function listPlayingAiRoomIds(): Promise<string[]> {
  const rooms = await prisma.dotsRoom.findMany({
    where: {
      status: DotsRoomStatus.PLAYING,
      aiPlayerUserId: { not: null }
    },
    select: { id: true }
  });
  return rooms.map((room) => room.id);
}

/** Resumes AI turns that were interrupted by a server restart. */
export async function resumeInterruptedAiTurns(): Promise<void> {
  const roomIds = await listPlayingAiRoomIds();
  if (roomIds.length === 0) {
    return;
  }
  console.log(`Resuming AI turns for ${roomIds.length} active room(s)`);
  for (const roomId of roomIds) {
    scheduleAiTurnIfNeeded(roomId);
  }
}
