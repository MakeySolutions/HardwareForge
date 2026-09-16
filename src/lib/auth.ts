import { cookies, headers } from "next/headers";
import { checkRequest, TOKEN_COOKIE } from "./guard";

/**
 * Autorizacia v desktop appke = "request prisiel z okna HardwareForge".
 * Ziadne heslo ani prihlasovanie - data su na disku pouzivatela a chrani ich
 * jeho Windows ucet. Detaily ochrany v src/lib/guard.ts.
 */

export async function isAuthorized(): Promise<boolean> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  return checkRequest({
    host: h.get("host"),
    origin: h.get("origin"),
    token: jar.get(TOKEN_COOKIE)?.value,
  }).ok;
}

/** Zavolat na zaciatku kazdej Server Action a kazdej chranenej stranky. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthorized())) throw new Error("Access denied");
}
