import type { Metadata } from "next";
import { DailyClosingPreview } from "@/components/admin/daily-closing-preview";
export const metadata: Metadata = { title: "Daily Closing | Shop POS" };
export default function DailyClosingPage() { return <DailyClosingPreview />; }
