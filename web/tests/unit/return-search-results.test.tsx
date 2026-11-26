import {fireEvent,render,within} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {ReturnSearchResults,wholeBillSelection,type ReturnSearchInvoice} from "@/components/pos/return-search-results";
import {returnSearch,lineMatches} from "@/server/returns/search";

const line=(id:string,name:string,extra:Partial<ReturnSearchInvoice["lines"][number]>={})=>({saleLineId:id,name,code:"C-"+id,sizeLabel:null,quantity:"3",remainingQuantity:"3",unitPayablePaisa:"10000",paidPaisa:"30000",matched:false,...extra});
const paid:ReturnSearchInvoice={invoiceId:"i1",invoiceNumber:"TEST-11111111-1111-4111-8111-111111111111",paymentRecorded:true,businessDate:"2026-11-26",customerName:"Ayesha Khan",customerPhone:"0300-1234567",
 lines:[line("a","Milk Powder",{sizeLabel:"400 g",matched:true}),line("b","Baby Wipes",{remainingQuantity:"1"}),line("c","Rice 5kg",{remainingQuantity:"0"})]};
const unpaid:ReturnSearchInvoice={...paid,invoiceId:"i2",invoiceNumber:"TEST-22222222-2222-4222-8222-222222222222",paymentRecorded:false,customerName:null,customerPhone:null,lines:[line("d","Milk Powder",{matched:true})]};

it("lists every product on each bill, marks matches in text and shows date and customer",()=>{
 const {getByRole}=render(<ReturnSearchResults invoices={[paid,unpaid]} onChoose={()=>{}}/>);
 const bill=within(getByRole("list",{name:/^Products on bill .*1111$/}));
 expect(bill.getAllByRole("listitem")).toHaveLength(3);
 expect(bill.getByText("Match")).toBeInTheDocument();
 expect(bill.getByText(/Code C-a · 400 g · Sold 3 · Can return 3/)).toBeInTheDocument();
 expect(bill.getByText(/Already returned/)).toBeInTheDocument();
 expect(getByRole("button",{name:paid.invoiceNumber})).toHaveTextContent("2026-11-26 · Ayesha Khan · 0300-1234567");
});

it("Return this item picks one unit of only that product; Return whole bill picks every remaining quantity",()=>{
 const onChoose=vi.fn();const {getByRole}=render(<ReturnSearchResults invoices={[paid]} onChoose={onChoose}/>);
 fireEvent.click(getByRole("button",{name:/^Return this item — Baby Wipes/}));
 expect(onChoose).toHaveBeenLastCalledWith(paid,{b:"1"});
 fireEvent.click(getByRole("button",{name:/^Return whole bill/}));
 expect(onChoose).toHaveBeenLastCalledWith(paid,{a:"3",b:"1"});
 expect(wholeBillSelection(paid)).toEqual({a:"3",b:"1"});
 fireEvent.click(getByRole("button",{name:paid.invoiceNumber}));
 expect(onChoose).toHaveBeenLastCalledWith(paid,{});
 expect(getByRole("button",{name:/^Return this item — Rice 5kg/})).toBeDisabled();
});

it("a bill without recorded cash cannot start a refund from the results",()=>{
 const onChoose=vi.fn();const {getByRole,getByText}=render(<ReturnSearchResults invoices={[unpaid]} onChoose={onChoose}/>);
 expect(getByRole("button",{name:/^Return whole bill/})).toBeDisabled();
 expect(getByRole("button",{name:/^Return this item — Milk Powder/})).toBeDisabled();
 expect(getByText("Cash received was not entered for this bill, so it cannot be refunded.")).toBeInTheDocument();
 expect(onChoose).not.toHaveBeenCalled();
});

it("renders nothing when there are no results",()=>{
 const {container}=render(<ReturnSearchResults invoices={[]} onChoose={()=>{}}/>);
 expect(container).toBeEmptyDOMElement();
});

it("search text: day-first and ISO dates, phone digits, and no accidental date for a bare number",()=>{
 expect(returnSearch(" 26/11/2026 ")).toEqual({text:"26/11/2026",phone:null,date:"2026-11-26"});
 expect(returnSearch("5.1.2026").date).toBe("2026-01-05");
 expect(returnSearch("2026-11").date).toBe("2026-11");
 expect(returnSearch("2026-11-26").date).toBe("2026-11-26");
 expect(returnSearch("31/13/2026").date).toBeNull();
 expect(returnSearch("11").date).toBeNull();
 expect(returnSearch("0300-123 4567").phone).toBe("03001234567");
 expect(returnSearch("+92 (300) 1234567").phone).toBe("923001234567");
 expect(returnSearch("Milk").phone).toBeNull();
 expect(returnSearch("MP-400").text).toBe("mp-400");
});

it("a line matches on name, code, size or barcode, case-insensitively, and never on an empty search",()=>{
 const milk={name:"Milk Powder",code:"MP-400",sizeLabel:"400 g",barcode:"8961234567890"};
 for(const q of ["milk","mp-4","400 G","896123"])expect(lineMatches(returnSearch(q),milk)).toBe(true);
 expect(lineMatches(returnSearch("rice"),milk)).toBe(false);
 expect(lineMatches(returnSearch(""),milk)).toBe(false);
 expect(lineMatches(returnSearch("x"),{name:"Soap",code:"S1",sizeLabel:null,barcode:null})).toBe(false);
});
