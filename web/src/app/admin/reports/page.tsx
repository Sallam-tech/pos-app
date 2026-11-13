import {readTestReportsRender} from "@/server/hosting/reports-render";
import {connection} from "next/server";
import {readTestInvoicesRender} from "@/server/hosting/invoices-render";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import "./reports.css";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reports | Shop POS" };

export default async function ReportsPage() {
 await connection();const live=readTestInvoicesRender();
  return <div className="reports-workspace">
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/reports"}>Reports</PageHeading><Badge>{live?"Isolated TEST":"Demo Data"}</Badge></div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Choose a report to view {live?"recorded":"demo"} sales or profit.</p>
    </div>
    <section aria-label="Available reports" className="grid max-w-4xl gap-4 md:grid-cols-2">
      <Card role="group" aria-labelledby="sales-report-title" className="flex flex-col items-start">
        <CardTitle id="sales-report-title">Sales Report</CardTitle>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">View sales, items sold and product details.</p>
        <Button asChild className="mt-4 w-full"><Link href="/admin/reports/sales">View Sales Report</Link></Button>
      </Card>
      <Card role="group" aria-labelledby="profit-report-title" className="flex flex-col items-start">
        <CardTitle id="profit-report-title">Profit Report</CardTitle>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">View profit, buying costs and products.</p>
        <Button asChild className="mt-4 w-full"><Link href="/admin/reports/profit">View Profit Report</Link></Button>
      </Card>
    </section>
    {readTestReportsRender()&&<div className="mt-4 flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/admin/reports/products">Product-wise Report</Link></Button><Button asChild variant="outline"><Link href="/admin/reports/expenses">Expense Report</Link></Button><Button asChild variant="outline"><Link href="/admin/investment">Stock Value</Link></Button></div>}
  </div>;
}
