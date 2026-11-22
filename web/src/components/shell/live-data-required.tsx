import { PageHeading } from "@/components/shell/page-heading";

/**
 * Shown instead of fabricated figures when a page is rendered outside the hosted
 * shop runtime (for example plain `next dev` or a bare `next start`). The app never
 * invents demo records: real data comes only from the local shop database.
 */
export function LiveDataRequired({ route, title }: { route: string; title: string }) {
  return <section className="mx-auto w-full max-w-3xl" aria-labelledby="live-data-required-title">
    <PageHeading route={route}>{title}</PageHeading>
    <div role="status" className="mt-4 rounded-md border bg-card p-4 text-sm leading-6">
      <h2 id="live-data-required-title" className="font-semibold">Shop database not connected</h2>
      <p className="mt-1 text-muted-foreground">This page shows saved shop records only. Open Shop POS from the desktop app so it can reach the local shop database. No sample data is shown.</p>
    </div>
  </section>;
}
