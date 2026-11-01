import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader, PreviewFooter, PreviewNotice } from "@/components/shell/shared";

export default function PosPage() {
  return <div className="mx-auto max-w-3xl">
    <PageHeader title="Record sale" breadcrumb="Salesperson" description="A focused workspace with room for fast, simple entry." />
    <PreviewNotice />
    <Card><EmptyState title="Sales entry placeholder" description="The sale-entry interface is not available in this layout preview. No sales can be recorded here." /></Card>
    <PreviewFooter />
  </div>;
}
