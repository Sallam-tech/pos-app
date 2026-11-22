import {isTestSettingsRender} from "@/server/hosting/settings-render";
import {TestSettings} from "@/components/settings/test-settings";
import "./settings.css";
import type { Metadata } from "next";
import { LiveDataRequired } from "@/components/shell/live-data-required";
export const metadata: Metadata = { title: "Settings | Shop POS" };
export const dynamic="force-dynamic";
export default function SettingsPage() { return isTestSettingsRender()?<TestSettings/>:<LiveDataRequired route="/admin/settings" title="Settings"/>; }
