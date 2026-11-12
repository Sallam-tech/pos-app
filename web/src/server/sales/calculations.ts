import "server-only";
import { int64 } from "../db/integers";
const MAX_PRICE=BigInt("99999999999999"), MAX_COUNT=BigInt("999999999999");
export const MONEY_POLICY="PKR_UNIT_HALF_UP_V1" as const;
export class SaleError extends Error {
 constructor(readonly code:"INVALID_INPUT"|"PRICE_NOT_ALLOWED"|"CONFLICT"|"NOT_FOUND"|"UNAVAILABLE"="INVALID_INPUT"){super("Sale unavailable.");this.name="SaleError";}
}
export const deny=(code:SaleError["code"]="INVALID_INPUT"):never=>{throw new SaleError(code);};
export function unsigned(v:unknown,max=BigInt("9223372036854775807"),zero=false):bigint{
 if(typeof v!=="string"||v.length>19||!/^(?:0|[1-9][0-9]*)$/.test(v))return deny();
 const n=BigInt(v);if(n<(zero?BigInt(0):BigInt(1))||n>max)return deny();return n;
}
export function money(v:unknown,zero=false,max=MAX_PRICE){const n=unsigned(v,max,zero);if(n%BigInt(100))return deny();return n;}
export function halfUp(n:bigint,d:bigint){if(n<BigInt(0)||d<=BigInt(0))return deny();return n/d+(n%d*BigInt(2)>=d?BigInt(1):BigInt(0));}
export function lineAmounts(price:unknown,quantity:unknown,discount:unknown,cost:bigint){
 const unit=money(price),count=unsigned(quantity,MAX_COUNT),percent=unsigned(discount,BigInt(100),true);
 if(cost<=BigInt(0)||cost>MAX_PRICE)return deny("UNAVAILABLE");
 const numerator=unit/BigInt(100)*(BigInt(100)-percent),unitPayable=int64(halfUp(numerator,BigInt(100))*BigInt(100));
 const charged=int64(unitPayable*count),base=int64(unit*count),cogs=int64(cost*count);
 if(charged<=BigInt(0)||charged<cogs)return deny("PRICE_NOT_ALLOWED");
 return {unit,count,percent,numerator,denominator:BigInt(100),unitPayable,charged,base,cogs,profit:int64(charged-cogs)};
}
// Original ACTUALLY PAID whole-paisa line; not an authorization/refund capability.
export function cumulativeRefund(paid:unknown,count:unknown,priorCount:unknown,priorPaid:unknown,nextCount:unknown){
 const total=money(paid,false,BigInt("9223372036854775807")),n=unsigned(count,MAX_COUNT),r=unsigned(priorCount,n,true),previous=money(priorPaid,true,BigInt("9223372036854775807")),add=unsigned(nextCount,n);
 if(r+add>n||previous!==halfUp((total/BigInt(100))*r,n)*BigInt(100))return deny();
 return int64(halfUp((total/BigInt(100))*(r+add),n)*BigInt(100)-previous);
}
