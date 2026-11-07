import "./settings.css";
import type { Metadata } from "next";
import { SettingsPreview } from "@/components/settings/settings-preview";
export const metadata: Metadata = { title: "Settings | Shop POS" };
export default function SettingsPage() { return <SettingsPreview />; }
