import "server-only";
import {calendar,expenseDay} from "../expenses/calendar";
// Find the real timezone boundary, including historical Karachi DST. Date labels
// are advanced on the UTC calendar; no fixed +05:00 assumption defines a day.
export function karachiStart(day:string):bigint{
 calendar(day);const anchor=Date.parse(day+"T00:00:00Z");let lo=anchor-36*3600000,hi=anchor+36*3600000;
 while(lo<hi){const mid=Math.floor((lo+hi)/2);if(expenseDay(mid)<day)lo=mid+1;else hi=mid;}
 if(expenseDay(lo)!==day)throw Error("Business day unavailable.");return BigInt(lo);
}
export function nextDay(day:string){calendar(day);return new Date(Date.parse(day+"T00:00:00Z")+86400000).toISOString().slice(0,10);}
