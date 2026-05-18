import type { Request as ExpressRequest } from "express";

/** Authenticated dots user attached to API requests. */
export type AuthUser = Readonly<{
  id: string;
  displayName: string;
}>;

/** Express request extended with dots auth and locale. */
export type DotsRequest = ExpressRequest & {
  dotsUser?: AuthUser;
  languageCode?: string;
};
