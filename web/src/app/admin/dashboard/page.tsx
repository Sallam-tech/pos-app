import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ComponentPreview } from "@/components/patterns/component-preview";
import { PageHeader, PreviewFooter, PreviewNotice } from "@/components/shell/shared";

export default function DashboardPage() {
  return <>
    <PageHeader title="Dashboard" breadcrumb="Admin" description="A shared workspace for your shop. This is a layout preview." />
    <PreviewNotice />
    <Card><EmptyState title="Dashboard placeholder" description="This space is reserved for the shop overview. No business records are loaded in this preview."><ComponentPreview /></EmptyState></Card>
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Card><CardTitle>Clear, familiar navigation</CardTitle><p className="mt-3 text-sm leading-6 text-muted-foreground">Use the sidebar on larger screens, or open navigation from the header on smaller screens. Planned sections remain unavailable.</p></Card>
      <Card><CardTitle>One workspace, three themes</CardTitle><p className="mt-3 text-sm leading-6 text-muted-foreground">Choose Light, Dark, or System in the header. Your preference is remembered when browser storage is available.</p></Card>
    </div>
    <PreviewFooter />
  </>;
}
