import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { PRODUCT_NAME } from "@/lib/brand";
import { Toaster } from "@/components/toast";
import { fontVariables } from "@/fonts";
import { COLOR_SCHEME_COOKIE, parseColorScheme } from "@/lib/ui-preferences";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "Your career. Cleared for takeoff.",
  // Brand-specific URLs avoid cached Dossier icons from earlier installs on the same origin.
  icons: {
    icon: [
      { url: "/brand/rolepilot-favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/brand/rolepilot-icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/brand/rolepilot-apple-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request: its scripts carry that request's CSP nonce (E11-5).
  await connection();
  // Light or dark as chosen in the sidebar; without a choice, the system's.
  const scheme = parseColorScheme(((await cookies()).get(COLOR_SCHEME_COOKIE) ?? (await cookies()).get("dossier_theme"))?.value);
  return (
    <html lang="en" data-theme={scheme} className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
