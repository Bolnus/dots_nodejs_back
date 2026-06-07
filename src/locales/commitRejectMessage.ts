import type { CommitRejectReason } from "../dots/wireTypes.js";
import type { en } from "./en.js";
import { formatMessage } from "./i18n.js";

type CommitRejectMessageKey = Extract<
  keyof typeof en,
  | "dotsUnauthorized"
  | "dotsNotInGame"
  | "dotsCommitPrevHash"
  | "dotsCommitBadHash"
  | "dotsCommitGameNotInPlay"
  | "dotsCommitNotYourTurn"
  | "dotsCommitPlacementPointOutOfBounds"
  | "dotsCommitPlacementCellBlocked"
  | "dotsCommitPlacementCellOccupied"
  | "dotsCommitCaptureRingTooShort"
  | "dotsCommitInvalidCaptureStarter"
  | "dotsCommitCaptureRingVerticesInvalid"
  | "dotsCommitCaptureRingNotConnected"
  | "dotsCommitInvalidCapture"
>;

const COMMIT_REJECT_MESSAGE_KEY: Record<CommitRejectReason, CommitRejectMessageKey> = {
  prevHash: "dotsCommitPrevHash",
  badHash: "dotsCommitBadHash",
  notAuthorized: "dotsUnauthorized",
  notInGame: "dotsNotInGame",
  gameNotInPlay: "dotsCommitGameNotInPlay",
  notYourTurn: "dotsCommitNotYourTurn",
  placementPointOutOfBounds: "dotsCommitPlacementPointOutOfBounds",
  placementCellBlocked: "dotsCommitPlacementCellBlocked",
  placementCellOccupied: "dotsCommitPlacementCellOccupied",
  captureRingTooShort: "dotsCommitCaptureRingTooShort",
  invalidCaptureStarter: "dotsCommitInvalidCaptureStarter",
  captureRingVerticesInvalid: "dotsCommitCaptureRingVerticesInvalid",
  captureRingNotConnected: "dotsCommitCaptureRingNotConnected",
  invalidCapture: "dotsCommitInvalidCapture"
};

/** Localized user-facing text for a committed-action rejection reason. */
export function formatCommitRejectMessage(languageCode: string | undefined, reason: CommitRejectReason): string {
  return formatMessage(languageCode, COMMIT_REJECT_MESSAGE_KEY[reason]);
}
