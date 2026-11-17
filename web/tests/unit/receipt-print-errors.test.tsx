import {fireEvent,render,screen,within} from "@testing-library/react";
import {beforeEach,test,expect,vi} from "vitest";
import {ReceiptPreview} from "@/components/demo/receipt-preview";
beforeEach(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value(this:HTMLDialogElement){this.open=false;}});
});
test("failed dialog opening has safe feedback; retry preserves the identical receipt and does not acknowledge or mutate",()=>{
 const done=vi.fn(),print=vi.spyOn(window,"print").mockImplementationOnce(()=>{throw Error("TEST private driver detail");}).mockImplementation(()=>{});
 render(<ReceiptPreview open onOpenChange={()=>{}} title="Saved invoice" backLabel="Close" onDone={done} developerCredit><p>Immutable saved invoice Rs. 315</p></ReceiptPreview>);
 const dialog=screen.getByRole("dialog",{name:"Saved invoice"}),paper=dialog.querySelector(".receipt-sheet")!,before=paper.innerHTML;
 expect(screen.queryByRole("alert")).toBeNull();
 fireEvent.click(within(dialog).getByRole("button",{name:"Print"}));
 expect(screen.getByRole("alert")).toHaveTextContent("The print dialog could not open. Try Print again.");
 expect(screen.getByRole("alert")).not.toHaveTextContent("private driver detail");
 expect(paper.innerHTML).toBe(before);expect(done).not.toHaveBeenCalled();
 fireEvent.click(within(dialog).getByRole("button",{name:"Print"}));
 expect(print).toHaveBeenCalledTimes(2);expect(screen.queryByRole("alert")).toBeNull();expect(done).not.toHaveBeenCalled();
 expect(paper.innerHTML).toBe(before);expect(dialog).toBeInTheDocument();
});
test("disabled printing cannot open a dialog or signal successful printing",()=>{
 const print=vi.spyOn(window,"print").mockImplementation(()=>{});
 render(<ReceiptPreview open onOpenChange={()=>{}} title="Receipt unavailable" backLabel="Close" printDisabled><p>Unavailable</p></ReceiptPreview>);
 fireEvent.click(screen.getByRole("button",{name:"Print"}));
 expect(print).not.toHaveBeenCalled();expect(screen.queryByRole("alert")).toBeNull();expect(screen.queryByText("Printed")).toBeNull();
});