import type { Response as ExpressResponse } from "express";

import { formatMessage } from "../locales/i18n.js";
import type { DotsErrorCode } from "./wireTypes.js";

export class DotsApiError extends Error {
  readonly status: number;
  readonly code: DotsErrorCode;
  readonly vars?: Record<string, string>;

  constructor(status: number, code: DotsErrorCode, vars?: Record<string, string>) {
    super(code);
    this.status = status;
    this.code = code;
    this.vars = vars;
  }
}

/** Sends a localized JSON error response. */
export function sendDotsError(res: ExpressResponse, languageCode: string | undefined, error: DotsApiError): void {
  res.status(error.status).json({
    code: error.code,
    messageLocal: formatMessage(languageCode, error.code, error.vars)
  });
}
