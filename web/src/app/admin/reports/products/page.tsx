import {connection} from "next/server";
import {readTestReportsRender} from "@/server/hosting/reports-render";
import {TestReportsExplorer} from "@/components/admin/test-reports";
export default async function Page(){await connection();return readTestReportsRender()?<TestReportsExplorer kind="products"/>:<p>Saved reports are unavailable in this preview.</p>;}
