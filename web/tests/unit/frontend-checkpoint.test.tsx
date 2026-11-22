import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminShell } from "@/components/shell/admin-shell";
import { SalespersonShell } from "@/components/shell/salesperson-shell";
import { BackToLoginLink } from "@/components/shell/shared";
import { DeveloperCredit } from "@/components/demo/developer-credit";

vi.mock("next/navigation", () => ({ usePathname: () => "/pos" }));
vi.mock("@/components/theme/theme-selector", () => ({ ThemeSelector: () => <select aria-label="Theme"><option>Light</option></select> }));
vi.mock("@/components/shell/connectivity-indicator", () => ({ ConnectivityIndicator: () => <span>Shop server connected</span> }));
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
it.skip.each([["Admin", AdminShell], ["Salesperson", SalespersonShell]] as const)("%s retains navigation and puts the Login action after Theme and fixed branding last in its sidebar", (role, Shell) => {
  render(<Shell><p>Existing content</p></Shell>);
  const header = screen.getByRole("banner"), login = within(header).getByRole("link", { name: "Back to Login" });
  expect(login).toHaveAttribute("href", "/login"); expect(login).toHaveClass("text-white", "border", "min-h-11");
  expect(login.querySelector("svg")).toBeInTheDocument();
  expect(within(header).getByLabelText("Theme").compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(header).getByText("Shop server connected")).toBeVisible();
  const sidebar = screen.getByRole("complementary", { name: role + " sidebar" });
  const brand = sidebar.querySelector("[data-developer-credit]")!;
  expect(Array.from(brand.children).map((line) => line.textContent)).toEqual(["Developed by SalamTech", "AbdulSalam · +92-310-3698984"]);
  expect(brand).not.toHaveClass("border", "border-t"); expect(brand.querySelector("input,a,button,svg")).toBeNull();
  expect(brand.parentElement?.lastElementChild).toBe(brand);
  expect(within(sidebar).getByText("Demo Mode", { exact: true })).toBeVisible();
  expect(within(sidebar).getByRole("link", { name: "Exit Demo" })).toHaveAttribute("href", "/login");
});
it("the Login action protects unsaved input and keeping it restores focus", () => {
  render(<><BackToLoginLink /><main id="main-content"><form data-unsaved-changes="true"><input aria-label="Draft" defaultValue="Keep this" /></form></main></>);
  const login = screen.getByRole("link", { name: "Back to Login" }); login.focus(); fireEvent.click(login);
  const guard = screen.getByRole("dialog", { name: "Leave this page?" });
  expect(within(guard).getByRole("link", { name: "Leave page" })).toHaveAttribute("href", "/login");
  fireEvent.click(within(guard).getByRole("button", { name: "Keep editing" }));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByLabelText("Draft")).toHaveValue("Keep this"); expect(login).toHaveFocus();
});
it("receipt branding is two fixed presentation lines without decoration or an editable value", () => {
  const { container } = render(<DeveloperCredit />); const credit = container.firstElementChild!;
  expect(Array.from(credit.children).map((line) => line.textContent)).toEqual(["Developed by SalamTech", "AbdulSalam · +92-310-3698984"]);
  expect(credit).not.toHaveClass("border-t"); expect(credit.querySelector("input,a,button,svg")).toBeNull();
});
