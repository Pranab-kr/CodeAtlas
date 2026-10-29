import { Separator } from "@/components/ui/separator";
import { CategoryRail } from "@/components/workspace/category-rail";
import { DependencyMap } from "@/components/workspace/dependency-map";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { foldModules } from "@/lib/graph/fold";
import { parseResult } from "@/lib/preview/parse-result";
import { categoriesFromFiles } from "@/lib/workspace/categories";

// Scaffolding for phase 4. Phase 7 deletes this route and the checked-in parse
// result it reads.
const REPOSITORY = {
  name: "mckaywrigley/chatbot-ui",
  url: "https://github.com/mckaywrigley/chatbot-ui",
  commit: "81328b6",
} as const;

export default function PreviewPage() {
  const categories = categoriesFromFiles(parseResult.files);
  const fold = foldModules(parseResult.files, parseResult.edges, {
    rootLabel: REPOSITORY.name,
  });

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <span className="text-[13px] font-medium tracking-tight">
          CodeAtlas
        </span>
        <Separator orientation="vertical" className="h-4" />
        <span
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={`${REPOSITORY.url}@${REPOSITORY.commit}`}
        >
          {REPOSITORY.name}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-3 font-mono text-[10.5px] text-muted-foreground tabular-nums">
          <span>{parseResult.files.length} files</span>
          <span>{fold.modules.length} modules</span>
          <span>{fold.edges.length} edges</span>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <WorkspaceShell
          rail={<CategoryRail categories={categories} />}
          map={
            <DependencyMap
              files={parseResult.files}
              edges={parseResult.edges}
              rootLabel={REPOSITORY.name}
            />
          }
          detail={null}
        />
      </main>
    </div>
  );
}
