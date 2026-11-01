import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/login/login-form";

describe("Login UI preview", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function inputs() {
    return {
      username: screen.getByLabelText("Username"),
      password: screen.getByLabelText("Password", { exact: true }),
      form: screen.getByRole("form", { name: "Login UI preview" }),
    };
  }

  it("labels required fields and never gives them native credential serialization names", () => {
    render(<LoginForm />);
    const { username, password } = inputs();
    expect(username).toBeRequired();
    expect(password).toBeRequired();
    expect(password).toHaveAttribute("type", "password");
    expect(username).not.toHaveAttribute("name");
    expect(password).not.toHaveAttribute("name");
    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });

  it("announces missing fields, associates messages and focuses the first invalid field", () => {
    render(<LoginForm />);
    const { username, password, form } = inputs();
    fireEvent.submit(form);
    expect(screen.getByText("Check the form")).toBeVisible();
    expect(username).toHaveFocus();
    expect(username).toBeInvalid();
    expect(username).toHaveAccessibleDescription("Enter a username.");
    expect(password).toHaveAccessibleDescription("Enter a password.");
    act(() => vi.advanceTimersByTime(700));
    expect(screen.queryByRole("button", { name: "Previewing…" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sign-in is unavailable in this UI preview.")).not.toBeInTheDocument();
  });

  it("treats a blank username as missing without imposing password-format policy", () => {
    render(<LoginForm />);
    const { username, password, form } = inputs();
    fireEvent.change(username, { target: { value: "   " } });
    fireEvent.change(password, { target: { value: "x" } });
    fireEvent.submit(form);
    expect(username).toHaveFocus();
    expect(username).toHaveAccessibleDescription("Enter a username.");
    expect(password).not.toHaveAccessibleDescription();
  });

  it("focuses password when only that field is missing", () => {
    render(<LoginForm />);
    const { username, password, form } = inputs();
    fireEvent.change(username, { target: { value: "preview-only" } });
    fireEvent.submit(form);
    expect(password).toHaveFocus();
    expect(username).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("Complete the required field below.")).toBeVisible();
  });

  it("shows and hides the same password without submitting", () => {
    render(<LoginForm />);
    const { password } = inputs();
    fireEvent.change(password, { target: { value: "made-up-preview" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("made-up-preview");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    expect(screen.queryByText("Check the form")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears a field error as it is edited", () => {
    render(<LoginForm />);
    const { username, password, form } = inputs();
    fireEvent.submit(form);
    fireEvent.change(username, { target: { value: "preview-only" } });
    expect(username).not.toBeInvalid();
    expect(screen.queryByText("Enter a username.")).not.toBeInTheDocument();
    fireEvent.change(password, { target: { value: "preview-only" } });
    expect(screen.queryByText("Check the form")).not.toBeInTheDocument();
  });

  it("discards input, guards repeat submits and ends with an honest focused preview error", () => {
    const request = vi.spyOn(globalThis, "fetch");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<LoginForm />);
    const { username, password, form } = inputs();
    fireEvent.change(username, { target: { value: "preview-only" } });
    fireEvent.change(password, { target: { value: "made-up-preview" } });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(username).toHaveValue("");
    expect(password).toHaveValue("");
    expect(username).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previewing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previewing…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("No sign-in request is sent.");
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in is unavailable in this UI preview.");
    expect(screen.getByRole("alert")).toHaveTextContent("No credentials were checked.");
    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled();
    expect(request).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    fireEvent.change(username, { target: { value: "another-preview" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cancels the loading preview when unmounted", () => {
    const { unmount } = render(<LoginForm />);
    const { username, password, form } = inputs();
    fireEvent.change(username, { target: { value: "preview-only" } });
    fireEvent.change(password, { target: { value: "preview-only" } });
    fireEvent.submit(form);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the server-rendered form disabled until its submit handler is hydrated", () => {
    const html = renderToStaticMarkup(<LoginForm />);
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelector("fieldset")).toHaveAttribute("disabled");
    expect(container).toHaveTextContent("JavaScript is required to try the form preview.");
    expect(container.querySelectorAll("input[name]")).toHaveLength(0);
  });
});
