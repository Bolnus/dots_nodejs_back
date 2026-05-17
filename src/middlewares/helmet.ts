import helmet from "helmet";
import { FRONTEND_URLS } from "../config.js";

export function getHelmetMiddleware(): ReturnType<typeof helmet> {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", ...FRONTEND_URLS],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    frameguard: { action: "deny" }
  });
}
