import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPreview } from "@/components/settings/settings-preview";
import { ShopName } from "@/components/settings/shop-identity";
import { saveShopSettings } from "@/components/settings/use-shop-settings";
import { defaultShopSettings, normalizeShopSettings, parseShopSettings, shopSettingsStorageKey, validatePasswordPreview, validateShopSettings } from "@/lib/shop-display-settings";
const methods = ["showModal", "close"] as const;
const originals = methods.map((key) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key));
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterAll(() => methods.forEach((key, index) => {
  if (originals[index]) Object.defineProperty(HTMLDialogElement.prototype, key, originals[index]!);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
}));
beforeEach(() => { localStorage.clear(); });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

describe("public browser-local shop settings", () => {
  it.each([null, "", "{", "[]", "null", '{"shopName":"wrong shape"}'])("falls back safely for corrupt/unsupported storage %j", (raw) => {
    expect(parseShopSettings(raw)).toEqual(defaultShopSettings);
  });
  it("validates fields, keeps currency/layout constrained, and serializes only public display values", () => {
    expect(validateShopSettings({ ...defaultShopSettings, shopName: " " }).shopName).toBeTruthy();
    for (const [key, limit] of [["shopName", 80], ["address", 240], ["phone", 32], ["footer", 160]] as const) {
      expect(validateShopSettings({ ...defaultShopSettings, [key]: "a".repeat(limit + 1) })[key]).toBeTruthy();
    }
    expect(validateShopSettings({ ...defaultShopSettings, phone: "not a phone" }).phone).toBeTruthy();
    expect(validateShopSettings({ ...defaultShopSettings, shopName: "bad\nname" }).shopName).toBeTruthy();
    expect(parseShopSettings(JSON.stringify({ ...defaultShopSettings, currency: "USD" }))).toEqual(defaultShopSettings);
    expect(parseShopSettings(JSON.stringify({ ...defaultShopSettings, receiptLayout: "58mm" }))).toEqual(defaultShopSettings);
    const extra = { ...defaultShopSettings, password: "never serialize", shopName: " Al Madina Store " };
    expect(normalizeShopSettings(extra)).not.toHaveProperty("password");
    expect(parseShopSettings(JSON.stringify(extra)).shopName).toBe("Al Madina Store");
  });
  it("focuses invalid settings and saves valid public details across a remount", () => {
    const view = render(<SettingsPreview />);
    change("Shop Name", ""); fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    expect(screen.getByLabelText("Shop Name")).toHaveFocus(); expect(screen.getByRole("alert")).toHaveTextContent("Enter your shop name.");
    change("Shop Name", "Al Madina Store"); change("Shop Address", "Main Road");
    change("Phone Number", "+92 300 1234567"); change("Receipt Message", "Thank you!");
    change("Receipt Paper", "compact"); fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    expect(screen.getByRole("status")).toHaveTextContent("saved on this browser only");
    expect(JSON.parse(localStorage.getItem(shopSettingsStorageKey)!)).toEqual({ ...defaultShopSettings, shopName: "Al Madina Store", address: "Main Road", phone: "+92 300 1234567", footer: "Thank you!", receiptLayout: "compact" });
    view.unmount(); render(<SettingsPreview />);
    expect(screen.getByLabelText("Shop Name")).toHaveValue("Al Madina Store");
    fireEvent.click(screen.getByRole("button", { name: "Preview Receipt" }));
    const dialog = screen.getByRole("dialog", { name: "Sample Receipt" });
    expect(dialog).toHaveTextContent("Al Madina Store"); expect(dialog).toHaveTextContent("Main Road");
    expect(within(dialog).getByLabelText("Print layout")).toHaveValue("compact");
    expect(dialog).not.toHaveTextContent(/purchase cost|gross profit/i);
  });
  it("renders shop text safely and synchronizes same-browser/external preference updates", () => {
    render(<ShopName as="h1" />);
    const shopName = '<img src=x onerror="alert(1)">';
    act(() => { expect(saveShopSettings({ ...defaultShopSettings, shopName })).toBe(true); });
    expect(screen.getByRole("heading", { name: shopName })).toBeVisible(); expect(document.querySelector("img")).toBeNull();
    act(() => {
      localStorage.setItem(shopSettingsStorageKey, JSON.stringify({ ...defaultShopSettings, shopName: "Other tab" }));
      window.dispatchEvent(new StorageEvent("storage", { key: shopSettingsStorageKey }));
    });
    expect(screen.getByRole("heading", { name: "Other tab" })).toBeVisible();
  });
  it("reports blocked storage without claiming preferences were saved", () => {
    render(<SettingsPreview />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    change("Shop Name", "Cannot save"); fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("truthful security and backup preparation", () => {
  it.each(["abcdefgh", "12345678", "!@#$%^&*", "letter12!more", "a".repeat(128)])("allows any password character combination for %j", (value) => {
    expect(validatePasswordPreview(value, value)).toEqual({ password: undefined, confirmation: undefined });
  });
  it("validates format/matching without implementing credential checks", () => {
    expect(validatePasswordPreview("seven77", "other")).toMatchObject({ password: expect.any(String), confirmation: expect.any(String) });
    expect(validatePasswordPreview("a".repeat(129), "a".repeat(129)).password).toBeTruthy();
  });
  it("shows/hides ephemeral preview text, keeps save disabled and clears on close", () => {
    const request = vi.spyOn(globalThis, "fetch");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<SettingsPreview />);
    const changeButton = screen.getByRole("button", { name: "Change Admin password" });
    changeButton.focus(); fireEvent.click(changeButton);
    const dialog = screen.getByRole("dialog", { name: "Admin Password" });
    const password = within(dialog).getByLabelText("New password", { exact: true });
    fireEvent.change(password, { target: { value: "short" } }); fireEvent.blur(password);
    expect(within(dialog).getByText("Use at least 8 characters in this preview.")).toBeVisible();
    fireEvent.change(password, { target: { value: "made-up-password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Show new password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(within(dialog).getByRole("button", { name: "Secure setup required" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })); expect(changeButton).toHaveFocus();
    fireEvent.click(changeButton); expect(screen.getByLabelText("New password", { exact: true })).toHaveValue("");
    expect(request).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  });
  it("displays pending automatic backup with no download or fake successful backup", () => {
    render(<SettingsPreview />);
    expect(screen.getByText("Daily backup and restore options will become available with the local database.")).toBeVisible();
    expect(screen.getByText("Setup pending")).toBeVisible();
    expect(screen.queryByRole("link", { name: /download|restore/i })).not.toBeInTheDocument();
  });
});
