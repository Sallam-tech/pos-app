import Link from "next/link";
import {Button} from "@/components/ui/button";
import {connection} from "next/server";
import {readTestInvoicesRender} from "@/server/hosting/invoices-render";
import {TestInvoices} from "@/components/admin/test-invoices";
import {WorkspacePage} from "@/components/shell/workspace-page";
export default async function InvoiceHistoryPage(){await connection();const live=readTestInvoicesRender();return <WorkspacePage route="/admin/sales" title="Sales History" badge={live?"Shop":"Not connected"} action={live?<Button asChild variant="outline"><Link prefetch={false} href="/admin/returns">Returns &amp; Inspection</Link></Button>:undefined}>{live?<TestInvoices/>:<p>Sales history needs the shop database. Open Shop POS from the desktop app.</p>}</WorkspacePage>;}
