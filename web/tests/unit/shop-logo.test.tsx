import {fireEvent,render} from "@testing-library/react";
import {expect,it} from "vitest";
import {ShopLogo} from "@/components/brand/shop-logo";
import {shopLogoDataUri} from "@/components/brand/shop-logo-data";
import {InvoicePaperHeader} from "@/components/pos/invoice-presentation";

it("embeds the AL.MADINA logo as a self-contained PNG so it needs no server route or internet",()=>{
 expect(shopLogoDataUri.startsWith("data:image/png;base64,iVBORw0KGgo")).toBe(true);
 expect(shopLogoDataUri.length).toBeLessThan(150_000);
});
it("is decorative beside the shop name and hides itself if the image cannot load",()=>{
 const {container}=render(<ShopLogo className="size-10"/>);const img=container.querySelector("img")!;
 expect(img).toHaveAttribute("alt","");expect(img).toHaveAttribute("aria-hidden","true");expect(img.getAttribute("src")).toBe(shopLogoDataUri);
 fireEvent.error(img);expect(container.querySelector("img")).toBeNull();
});
it("prints the logo above the editable shop name, address and phone on every receipt",()=>{
 const {container,getByText}=render(<InvoicePaperHeader shopName="AL.MADINA MEDICAL & TRADERS" address="Noorani Chowk, Dadu" phone="03147715737"/>);
 const logo=container.querySelector("img.receipt-logo")!;
 expect(logo).not.toBeNull();
 expect(logo.compareDocumentPosition(getByText("AL.MADINA MEDICAL & TRADERS"))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(getByText("Noorani Chowk, Dadu")).toBeInTheDocument();expect(getByText("Phone: 03147715737")).toBeInTheDocument();
});
