import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../shop-cloud.json");
const projectUrl = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/;
const publishableKey = /^(?:sb_publishable_[A-Za-z0-9_-]{20,120}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})$/;

export interface ShopCloudConfig {
  readonly url: string;
  readonly publishableKey: string;
  readonly projectHost: string;
}

export function readShopCloudConfig(): ShopCloudConfig | undefined {
  if (!existsSync(configFile)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(configFile, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "publishableKey,url") return undefined;
  if (typeof record.url !== "string" || typeof record.publishableKey !== "string") return undefined;
  const match = projectUrl.exec(record.url);
  if (!match || !publishableKey.test(record.publishableKey)) return undefined;
  return { url: record.url, publishableKey: record.publishableKey, projectHost: match[1] + ".supabase.co" };
}

export async function productionCloudStatus(): Promise<{ cloud: "NOT_CONFIGURED" | "SUPABASE" | "UNAVAILABLE"; projectHost?: string; cloudReachable?: boolean }> {
  const config = readShopCloudConfig();
  if (!config) return { cloud: "NOT_CONFIGURED" };
  try {
    const response = await fetch(config.url + "/auth/v1/health", {
      headers: { apikey: config.publishableKey },
      signal: AbortSignal.timeout(8000),
    });
    return { cloud: "SUPABASE", projectHost: config.projectHost, cloudReachable: response.ok };
  } catch {
    return { cloud: "SUPABASE", projectHost: config.projectHost, cloudReachable: false };
  }
}
