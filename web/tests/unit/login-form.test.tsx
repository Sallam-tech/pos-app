import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/login/login-form";

describe("password-only Login UI preview", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const password = () => screen.getByLabelText("Password", { exact: true });
  const form = () => screen.getByRole("form", { name: "Login UI preview" });
  it("has one required password, no username/role selection and no native credential serialization", () => {
    render(<LoginForm />);
    expect(password()).toBeRequired(); expect(password()).toHaveAttribute("type", "password");
    expect(password()).not.toHaveAttribute("name");
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Shop" })).toBeEnabled();
  });
  it("starts empty, discourages autocomplete, clears restored text and never restores credentials", () => {
    const view = render(<LoginForm />);
    expect(password()).toHaveValue("");
    expect(password()).toHaveAttribute("autocomplete", "off");
    expect(form()).toHaveAttribute("autocomplete", "off");
    fireEvent.change(password(), { target: { value: "temporary-only" } });
    fireEvent(window, new Event("pageshow"));
    expect(password()).toHaveValue("");
    view.unmount(); render(<LoginForm />);
    expect(password()).toHaveValue("");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("announces and focuses the missing password without entering a loading state", () => {
    render(<LoginForm />); fireEvent.submit(form());
    expect(password()).toHaveFocus(); expect(password()).toBeInvalid();
    expect(password()).toHaveAccessibleDescription("Enter a password.");
    expect(screen.getByText("Check the form")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Previewing…" })).not.toBeInTheDocument();
  });
  it.each(["lettersallowed", "123456789012", "!@#$%^&*()_+", "مبینہ پاس ورڈ"])("does not compare or impose a character-type policy on %j", (value) => {
    render(<LoginForm />); fireEvent.change(password(), { target: { value } }); fireEvent.submit(form());
    expect(password()).toHaveValue(""); act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole("alert")).toHaveTextContent("No credentials were checked.");
  });
  it("shows and hides the same input without submitting and clears field errors when edited", () => {
    render(<LoginForm />); fireEvent.submit(form());
    fireEvent.change(password(), { target: { value: "made-up-preview" } });
    expect(password()).not.toBeInvalid();
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password()).toHaveAttribute("type", "text"); expect(password()).toHaveValue("made-up-preview");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password()).toHaveAttribute("type", "password"); expect(screen.queryByRole("button", { name: "Previewing…" })).not.toBeInTheDocument();
  });
  it("discards text, guards repeated submissions and reports unavailable authentication without storage or requests", () => {
    const request = vi.spyOn(globalThis, "fetch"); const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<LoginForm />); fireEvent.change(password(), { target: { value: "made-up-preview" } });
    fireEvent.submit(form()); fireEvent.submit(form());
    expect(password()).toHaveValue(""); expect(password()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previewing…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("No sign-in request is sent.");
    expect(vi.getTimerCount()).toBe(1); act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole("alert")).toHaveFocus(); expect(screen.getByRole("alert")).toHaveTextContent("Sign-in is unavailable");
    expect(screen.getByRole("button", { name: "Open Shop" })).toBeEnabled();
    expect(request).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
    fireEvent.change(password(), { target: { value: "another-preview" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("cancels pending feedback on unmount", () => {
    const view = render(<LoginForm />); fireEvent.change(password(), { target: { value: "preview-only" } });
    fireEvent.submit(form()); expect(vi.getTimerCount()).toBe(1); view.unmount(); expect(screen.queryByRole("button", { name: "Previewing…" })).not.toBeInTheDocument();
  });
  it("keeps the server form disabled until the submit handler is hydrated", () => {
    const container = document.createElement("div"); container.innerHTML = renderToStaticMarkup(<LoginForm />);
    expect(container.querySelector("fieldset")).toHaveAttribute("disabled");
    expect(container).toHaveTextContent("JavaScript is required");
    expect(container.querySelectorAll("input[name]")).toHaveLength(0);
  });
});
