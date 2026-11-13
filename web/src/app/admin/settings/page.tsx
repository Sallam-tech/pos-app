import {isTestSettingsRender} from "@/server/hosting/settings-render";
import {TestSettings} from "@/components/settings/test-settings";
import "./settings.css";
import type { Metadata } from "next";
import { SettingsPreview } from "@/components/settings/settings-preview";
export const metadata: Metadata = { title: "Settings | Shop POS" };
export const dynamic="force-dynamic";
export default function SettingsPage() { return isTestSettingsRender()?<TestSettings/>:<SettingsPreview />; }
