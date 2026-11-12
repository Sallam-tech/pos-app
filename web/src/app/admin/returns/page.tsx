import {connection} from "next/server";
import {readTestReturnsRender} from "@/server/hosting/returns-render";
import {TestReturns} from "@/components/pos/test-returns";
import {PageHeading} from "@/components/shell/page-heading";
import type {Metadata} from "next";
export const metadata:Metadata={title:"Returns & Inspection | Shop POS"};
export default async function AdminReturns(){await connection();return <div className="mx-auto max-w-5xl"><PageHeading route="/admin/returns">Returns &amp; Inspection</PageHeading>{readTestReturnsRender()?<TestReturns role="ADMIN"/>:<p>Live returns are unavailable outside the validated isolated TEST host.</p>}</div>;}
