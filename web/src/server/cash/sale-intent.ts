import "server-only";
import {digest,object} from "../inventory/validation";
import {MONEY_POLICY} from "../sales/calculations";
import type {SaleLineInput} from "../sales/service";
export type CashSaleIntent={requestKey:string;context:string;lines:SaleLineInput[];customerName:string;customerPhone:string};
// Permission binds the cart. Tender/change/date must be separately observed.
export function cashSaleIntent(value:unknown):CashSaleIntent{const o=object(value,["requestKey","context","lines","customerName","customerPhone"],["cashPaisa","cashDate"]);const {cashPaisa,cashDate,...bound}=o;void cashPaisa;void cashDate;return bound as CashSaleIntent;}
export const cashSaleIntentHash=(value:unknown)=>digest({kind:"SALE",policy:MONEY_POLICY,...cashSaleIntent(value)});
