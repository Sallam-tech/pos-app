"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";

export function ComponentPreview() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>View shared components</Button>
    <Dialog open={open} onOpenChange={setOpen} title="Shared component preview" description="Appearance and interaction samples only. No information is saved or submitted.">
      <div className="grid gap-6">
        <Field id={id + "-note"} label="Sample note" hint="For appearance only. Nothing is saved.">
          <Input id={id + "-note"} aria-describedby={id + "-note-hint"} placeholder="Type a preview note" />
        </Field>
        <Field id={id + "-choice"} label="Sample choice">
          <Select id={id + "-choice"} defaultValue="first"><option value="first">First option</option><option value="second">Second option</option></Select>
        </Field>
        <Field id={id + "-invalid"} label="Example invalid field" error="Example error: review this field.">
          <Input id={id + "-invalid"} aria-invalid="true" aria-describedby={id + "-invalid-error"} defaultValue="Preview only" />
        </Field>
        <div className="flex flex-wrap gap-2"><Badge>Neutral</Badge><Badge tone="success">Success style</Badge><Badge tone="warning">Warning style</Badge><Badge tone="danger">Error style</Badge></div>
        <div className="flex flex-wrap gap-3"><Button disabled>Disabled button</Button><Button loading>Loading preview</Button><Button variant="secondary">Secondary button</Button><Button variant="destructive">Danger style</Button></div>
        <Alert title="Example error" tone="danger">An example error message. No request was sent.</Alert>
        <div role="status" aria-label="Loading placeholder preview" className="grid gap-2"><Skeleton className="w-2/3" /><Skeleton /><span className="text-sm text-muted-foreground">Loading placeholder</span></div>
        <TableRegion label="Example table"><Table><caption className="p-3 text-left text-sm text-muted-foreground">Empty table preview</caption><thead><tr><TableHead>Example column</TableHead><TableHead>Example state</TableHead></tr></thead><tbody><tr><TableCell colSpan={2}><EmptyState title="No preview rows" description="A shared empty state for future screens." /></TableCell></tr></tbody></Table></TableRegion>
        <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Close preview</Button></div>
      </div>
    </Dialog>
  </>;
}
