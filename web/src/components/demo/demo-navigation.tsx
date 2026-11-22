import Link from "next/link";
import { SafeNavigationLink } from "@/components/shell/safe-navigation-link";
import { Button } from "@/components/ui/button";

// Prototype navigation only; this does not protect any route.
// Remove these shortcuts or gate them behind an explicit demo mode when real
// authentication is introduced. Never leave them enabled in a real shop deployment.
export const demoNavigationEnabled = true;

export function DemoAccess({ enabled = demoNavigationEnabled }: { enabled?: boolean }) {
  if (!enabled) return null;
  return <nav aria-label="Explore Demo" className="mt-4 rounded-lg border bg-surface px-4 py-4 text-center">
    <h2 className="text-sm font-semibold">Explore Demo</h2>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">Demo previews only. No sign-in or saved changes.</p>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button asChild variant="outline" size="sm"><Link href="/admin/dashboard" prefetch={false}>Preview Admin</Link></Button>
      <Button asChild variant="outline" size="sm"><Link href="/pos" prefetch={false}>Preview Salesperson</Link></Button>
    </div>
  </nav>;
}

export function DemoExitLink({ enabled = demoNavigationEnabled }: { enabled?: boolean }) {
  if (!enabled) return null;
  return <Button asChild variant="ghost" size="sm" className="justify-start px-0"><SafeNavigationLink href="/login" prefetch={false}>Back to Login</SafeNavigationLink></Button>;
}
