"use client";

import { useRef, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ResumeSidebar({ enabled, hidden, view, onViewChange, controls, children }: {
  enabled: boolean;
  hidden?: boolean;
  view: string;
  onViewChange: (view: string) => void;
  controls: ReactNode;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const current = enabled ? view : "ai";

  return (
    <div
      hidden={hidden}
      className={hidden ? "hidden" : "flex touch-pan-y min-w-0 flex-[1_0_300px] flex-col border-t border-line bg-paper @min-[780px]:min-h-0 @min-[780px]:border-t-0 @min-[780px]:border-l"}
      onTouchStart={(event) => {
        start.current = null;
        if (!enabled || event.touches.length !== 1 || (event.target as Element).closest("input, textarea, select, button, a, [role=slider], [data-no-swipe]")) return;
        start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }}
      onTouchMove={(event) => { if (event.touches.length !== 1) start.current = null; }}
      onTouchCancel={() => { start.current = null; }}
      onTouchEnd={(event) => {
        const origin = start.current;
        start.current = null;
        if (!enabled || !origin || event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - origin.x;
        const dy = event.changedTouches[0].clientY - origin.y;
        if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy)) onViewChange(dx > 0 ? "controls" : "ai");
      }}
    >
      <Tabs value={current} onValueChange={onViewChange} className="flex h-[min(100dvh,680px)] min-h-0 flex-col @min-[780px]:h-full">
        {enabled && (
          <TabsList aria-label="Resume sidebar" variant="segmented" className="mx-6 mt-5 mb-4 shrink-0">
            <TabsTrigger value="ai">Refine with AI</TabsTrigger>
            <TabsTrigger value="controls">Resume controls</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="ai" forceMount hidden={current !== "ai"} className="min-h-0 flex-1 data-[state=inactive]:hidden">
          {children}
        </TabsContent>
        <TabsContent value="controls" forceMount hidden={current !== "controls"} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pt-7 pb-12 data-[state=inactive]:hidden">
          {controls}
        </TabsContent>
      </Tabs>
    </div>
  );
}
