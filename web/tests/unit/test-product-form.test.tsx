import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the recovery/mutation hook; the real form, validation helpers and fields are exercised.
const state = { busy: false, uncertain: false, error: null as string | null, submit: vi.fn(), onSaved: null as null | ((r: unknown) => void) };
vi.mock("@/lib/inventory/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/inventory/client")>("@/lib/inventory/client");
  return {
    ...actual,
    useInventoryMutation: (onSaved: (r: unknown) => void) => {
      state.onSaved = onSaved;
      return { submit: state.submit, busy: state.busy, uncertain: state.uncertain, error: state.error };
    },
  };
});
import { TestProductForm } from "@/components/admin/test-product-form";

function fillValid(name: string) {
  fireEvent.change(screen.getByLabelText(/Product Name/), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/Buying Price/), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText(/Stock Quantity/), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText(/Low Stock Alert/), { target: { value: "2" } });
}

describe("TestProductForm after a confirmed save", () => {
  beforeEach(() => { vi.useFakeTimers(); state.busy = false; state.uncertain = false; state.error = null; state.submit = vi.fn(); });

  it("clears the fields, stays enabled, focuses Product Name and accepts a second product", () => {
    render(<TestProductForm />);
    fillValid("Rice 5kg");
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));
    expect(state.submit).toHaveBeenCalledTimes(1);

    act(() => { state.onSaved!({ operationId: "op-1", product: { id: "p1", name: "Rice 5kg" } }); vi.runAllTimers(); });

    expect(screen.getByRole("status")).toHaveTextContent("Saved Rice 5kg");
    const name = screen.getByLabelText(/Product Name/) as HTMLInputElement;
    expect(name.value).toBe("");
    expect((screen.getByLabelText(/Buying Price/) as HTMLInputElement).value).toBe("");
    expect(name).toBeEnabled();
    expect(name).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save Product" })).toBeEnabled();

    fillValid("Sugar 1kg");
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));
    expect(state.submit).toHaveBeenCalledTimes(2);
    expect(state.submit.mock.calls[1][1]).toMatchObject({ name: "Sugar 1kg" });
  });

  it("hides the saved notice once the next product is being typed", () => {
    render(<TestProductForm />);
    fillValid("Rice 5kg");
    act(() => { state.onSaved!({ operationId: "op-1", product: { id: "p1", name: "Rice 5kg" } }); vi.runAllTimers(); });
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Product Name/), { target: { value: "S" } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays locked while a save is busy or an unresolved operation blocks saves", () => {
    state.uncertain = true;
    render(<TestProductForm />);
    expect(screen.getByLabelText(/Product Name/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Product" })).toBeDisabled();
  });
});
