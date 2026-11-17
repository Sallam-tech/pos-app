import {test,expect} from "vitest";
import {karachiStart} from "../../src/server/reports/period";
import {expenseDay} from "../../src/server/expenses/calendar";
function original(day:string){let lo=Date.parse(day+"T00:00:00Z")-36*3600000,hi=lo+72*3600000;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(expenseDay(mid)<day)lo=mid+1;else hi=mid;}return BigInt(lo);}
test("bounded pure Karachi boundaries preserve the original search across DST, leap days and eviction",()=>{
 const days=["2008-06-01","2008-10-31","2009-04-15","2009-07-01","2009-11-01","2024-02-29","2026-11-15"];
 for(let i=0;i<600;i++)days.push(new Date(Date.UTC(2000,0,1+i*17)).toISOString().slice(0,10));
 for(const day of days){const expected=original(day);expect(karachiStart(day)).toBe(expected);expect(karachiStart(day)).toBe(expected);expect(expenseDay(Number(expected))).toBe(day);expect(expenseDay(Number(expected)-1)).not.toBe(day);}
 for(const day of days.slice(0,7))expect(karachiStart(day)).toBe(original(day));
 expect(karachiStart("2009-07-01")).toBe(BigInt(Date.parse("2009-06-30T18:00:00Z")));
 for(const bad of ["2026-02-30","1999-12-31","2026-11-15 "])expect(()=>karachiStart(bad)).toThrow();
});
