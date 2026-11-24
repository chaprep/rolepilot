import { createOneConnectRoutes } from "@withone/connect/next";
import { type NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/google/origin";
import { loadOneSetup, ONE_RETURN } from "@/lib/one/config";
import { isSameOrigin } from "@/lib/route";
import { setupHref } from "@/lib/setup-guide";

const CONFIG_COOKIE = "rolepilot_one_setup";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/one/[action]">) {
  const { action } = await params;
  if (action !== "authorize" && action !== "callback") return new Response(null, { status: 404 });
  if (!(await getSession())) return new Response(null, { status: 401 });
  if (action === "authorize" && !isSameOrigin(request)) return new Response(null, { status: 403 });

  const origin = publicOrigin(request);
  const [revision, source] = request.cookies.get(CONFIG_COOKIE)?.value.split(".") ?? [];
  const fromWelcome = action === "authorize" ? request.nextUrl.searchParams.get("from") === "welcome" : source === "welcome";
  const returnTo = fromWelcome ? setupHref("ai") : ONE_RETURN;
  const fail = () => NextResponse.redirect(new URL(`${returnTo}&one_connect=error`, origin));
  try {
    const setup = await loadOneSetup(returnTo);
    if (!setup || new URL(setup.config.redirectUri).origin !== new URL(origin).origin) return fail();
    if (action === "callback" && revision !== setup.revision) return fail();

    const url = new URL(request.url);
    if (action === "authorize") url.search = "";
    const canonical = new Request(new URL(url.pathname + url.search, setup.config.redirectUri), { headers: request.headers });
    const routes = createOneConnectRoutes(setup.connect, { identifyUser: () => setup.userId });
    const response = await routes.GET(canonical);
    response.headers.set("cache-control", "private, no-store");
    const value = action === "authorize" ? `${setup.revision}${fromWelcome ? ".welcome" : ""}` : "";
    const maxAge = action === "authorize" ? 1800 : 0;
    const secure = new URL(setup.config.redirectUri).protocol === "https:" ? "; Secure" : "";
    response.headers.append("set-cookie", `${CONFIG_COOKIE}=${value}; Path=/api/one; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`);
    return response;
  } catch {
    return fail();
  }
}
