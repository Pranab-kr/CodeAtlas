import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StartLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm gap-0 py-0">
        <CardHeader className="px-4 pt-4">
          <CardTitle className="text-[13px]">CodeAtlas</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            Setting up your workspace…
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
