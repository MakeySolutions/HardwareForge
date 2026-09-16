import { isAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Electron caka na tuto odpoved, kym otvori okno (server je pripraveny). */
export async function GET() {
  if (!(await isAuthorized())) return new Response("Access denied", { status: 403 });
  return Response.json({ ok: true });
}
