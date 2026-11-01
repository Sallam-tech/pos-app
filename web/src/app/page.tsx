import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-12 sm:px-6">
      <section
        aria-labelledby="foundation-title"
        className="w-full max-w-xl space-y-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-10"
      >
        <p className="text-sm font-medium text-muted-foreground">Shop POS · Phase 1</p>
        <div className="space-y-3">
          <h1 id="foundation-title" className="text-3xl font-semibold tracking-tight">
            Project foundation
          </h1>
          <p className="leading-7 text-muted-foreground">
            The application is running locally. Business modules will be added
            after review.
          </p>
        </div>
        <Button asChild>
          <a href="/api/health">Check server health</a>
        </Button>
      </section>
    </main>
  );
}
