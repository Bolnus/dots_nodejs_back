/** Admin Bark notification event categories. */
export type NotifyCategory =
  | "crash"
  | "room_created"
  | "rate_limit"
  | "quota_exceeded"
  | "auth_burst"
  | "internal_error"
  | "llm_exhausted";

/** Bark interruption level for iOS pushes. */
export type BarkLevel = "active" | "timeSensitive" | "passive";

/** Payload for an admin push notification. */
export type AdminNotifyEvent = Readonly<{
  category: NotifyCategory;
  title: string;
  body: string;
  dedupeKey?: string;
  level?: BarkLevel;
}>;
