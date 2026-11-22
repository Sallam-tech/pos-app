import {connection} from "next/server";
import {readTestReturnsRender} from "@/server/hosting/returns-render";
import {TestReturns} from "@/components/pos/test-returns";
import type { Metadata } from "next";
import { WorkspacePage } from "@/components/shell/workspace-page";
import { LiveDataRequired } from "@/components/shell/live-data-required";
export const metadata: Metadata = { title: "Return & Refund | Shop POS" };
export default async function ReturnsPage() {
  await connection();
  if(!readTestReturnsRender())return <LiveDataRequired route="/pos/returns" title="Return & Refund"/>;
  return <WorkspacePage route="/pos/returns" title="Return & Refund"><TestReturns role="SALESPERSON"/></WorkspacePage>;
}
