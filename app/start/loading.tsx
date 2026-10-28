export default function StartLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm border border-border bg-surface p-4">
        <p className="text-[13px] font-medium">CodeAtlas</p>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          Setting up your workspace…
        </p>
      </div>
    </main>
  );
}
