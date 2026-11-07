"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { WorkspaceParentHref } from "@/lib/workspace-navigation";

export function SafeNavigationLink({ href, children, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: WorkspaceParentHref }) {
  const [confirming, setConfirming] = useState(false);
  return <>
    <Link href={href} {...props} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (document.querySelector('#main-content [data-unsaved-changes="true"]')) {
        event.preventDefault(); setConfirming(true);
      }
    }}>{children}</Link>
    {confirming && createPortal(<Dialog open onOpenChange={setConfirming} title="Leave this page?"
      description="Unsaved input or temporary demo entries will be lost. Leaving does not save them.">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setConfirming(false)}>Keep editing</Button>
        <Button asChild><Link href={href} onClick={() => setConfirming(false)}>Leave page</Link></Button>
      </div>
    </Dialog>, document.body)}
  </>;
}
