import Image from "next/image";

import { cn } from "@/lib/cn";

/** Decorative supplied artwork; the display crop removes its generous transparent margins. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative inline-block size-8 shrink-0 overflow-hidden", className)}>
      <Image
        src="/brand/rolepilot-transparent.png"
        alt=""
        width={64}
        height={64}
        unoptimized
        className="absolute -top-[26%] -left-[23%] h-[146%] w-[146%] max-w-none"
      />
    </span>
  );
}
