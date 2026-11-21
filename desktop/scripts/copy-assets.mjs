// Puts the top bar, the start screen, their fonts and the icon next to the compiled code.
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const desktop = path.join(import.meta.dirname, "..");
const fonts = path.join(desktop, "..", "src", "fonts");
const out = path.join(desktop, "dist", "start");

mkdirSync(path.join(out, "fonts"), { recursive: true });
cpSync(path.join(desktop, "start"), out, { recursive: true });
cpSync(path.join(desktop, "bar"), path.join(desktop, "dist", "bar"), { recursive: true });
cpSync(path.join(desktop, "assets", "icon.png"), path.join(desktop, "dist", "icon.png"));
for (const file of ["inter/Inter-Regular.woff2", "inter/Inter-Medium.woff2", "inter/Inter-SemiBold.woff2", "manrope/Manrope-SemiBold.woff2"]) {
  cpSync(path.join(fonts, file), path.join(out, "fonts", path.basename(file)));
}
