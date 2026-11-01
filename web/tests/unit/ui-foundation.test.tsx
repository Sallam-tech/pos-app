import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";

describe("shared controls", () => {
  it("guards loading buttons and exposes busy state", () => {
    const clicked = vi.fn();
    render(<Button loading onClick={clicked}>Loading preview</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(clicked).not.toHaveBeenCalled();
  });
  it("prevents disabled link-button actions", () => {
    const clicked = vi.fn();
    render(<Button asChild disabled onClick={clicked}><a href="/login">Unavailable</a></Button>);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
    expect(fireEvent.click(link)).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
  });
  it("provides explicit field labels, descriptions and errors", () => {
    render(<Field id="sample" label="Sample input" hint="Example help" error="Example error">
      <Input id="sample" aria-invalid="true" aria-describedby="sample-hint sample-error" />
    </Field>);
    expect(screen.getByLabelText("Sample input")).toHaveAccessibleDescription("Example help Example error");
    expect(screen.getByRole("textbox")).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent("Example error");
  });
  it("keeps selects native and labels available", () => {
    render(<><label htmlFor="choice">Sample choice</label><Select id="choice" defaultValue="one"><option value="one">One</option><option value="two">Two</option></Select></>);
    fireEvent.change(screen.getByLabelText("Sample choice"), { target: { value: "two" } });
    expect(screen.getByRole("combobox")).toHaveValue("two");
  });
  it("provides alert and empty-state semantics without claiming a write", () => {
    render(<><Alert title="Example error" tone="danger">No request was sent.</Alert><EmptyState title="No preview rows" description="A sample empty state." /></>);
    expect(screen.getByRole("alert")).toHaveTextContent("No request was sent.");
    expect(screen.getByRole("heading", { name: "No preview rows" })).toBeVisible();
  });
  it("provides named table regions, captions and column headers", () => {
    render(<TableRegion label="Preview table"><Table><caption>Example rows</caption><thead><tr><TableHead>Label</TableHead></tr></thead><tbody><tr><TableCell>Sample</TableCell></tr></tbody></Table></TableRegion>);
    expect(screen.getByRole("table", { name: "Example rows" })).toBeVisible();
    expect(screen.getByRole("columnheader")).toHaveAttribute("scope", "col");
    expect(screen.getByRole("region", { name: "Preview table" })).toHaveAttribute("tabindex", "0");
  });
});

describe("dialog contract (browser tests verify real focus trapping)", () => {
  const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
  });
  afterEach(() => {
    if (show) Object.defineProperty(HTMLDialogElement.prototype, "showModal", show);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    if (close) Object.defineProperty(HTMLDialogElement.prototype, "close", close);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });
  function Preview() {
    const [open, setOpen] = useState(false);
    return <><Button onClick={() => setOpen(true)}>Open sample</Button><Dialog open={open} onOpenChange={setOpen} title="Sample dialog" description="Nothing is saved."><Input aria-label="Sample note" /></Dialog></>;
  }
  it("names the dialog, focuses its close control and restores the opener", () => {
    render(<Preview />);
    const opener = screen.getByRole("button", { name: "Open sample" });
    opener.focus(); fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Sample dialog" })).toHaveAccessibleDescription("Nothing is saved.");
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });
  it("handles native cancellation through the controlled state", () => {
    render(<Preview />);
    fireEvent.click(screen.getByRole("button", { name: "Open sample" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
