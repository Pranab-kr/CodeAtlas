import { Loader2 } from "lucide-react";
import { AtlasMark } from "@/components/brand/mark";

export default function StartLoading() {
  return (
    <main className="atlas-dot-well flex min-h-dvh items-center justify-center p-6">
      <div className="atlas-window w-full max-w-sm rounded-2xl p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-well shadow-2xs">
            <AtlasMark className="size-4" />
          </span>
          <span className="text-[13.5px] font-medium">CodeAtlas</span>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Setting up your workspace…</span>
        </div>
      </div>
    </main>
  );
}
