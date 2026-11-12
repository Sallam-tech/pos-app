import {connection} from "next/server";
import {readTestInvoicesRender} from "@/server/hosting/invoices-render";
import {TestInvoices} from "@/components/admin/test-invoices";
import {WorkspacePage} from "@/components/shell/workspace-page";
export default async function InvoiceHistoryPage(){await connection();const live=readTestInvoicesRender();return <WorkspacePage route="/admin/sales" title="Sales History" badge={live?"Isolated TEST":"Demo Mode"}>{live?<TestInvoices/>:<p>Saved invoice corrections require the authorized TEST runtime.</p>}</WorkspacePage>;}
