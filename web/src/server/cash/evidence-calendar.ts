import "server-only";
import type {SqlRow} from "../db/connection";
import {calendar} from "../expenses/calendar";
import {karachiStart,nextDay} from "../reports/period";
import {big,deny} from "./model";
// Only pure ICU-derived day boundaries are reused. Every source row and both
// original timestamps are still checked in the caller's admitted snapshot.
export function assertCashEvidenceCalendar(rows:readonly SqlRow[]){
 const days=new Map<string,readonly[bigint,bigint]>();
 for(const row of rows){
  let bounds=typeof row.actual_date==="string"?days.get(row.actual_date):undefined;
  if(!bounds){const day=calendar(row.actual_date);bounds=[karachiStart(day),karachiStart(nextDay(day))];if(days.size>=512)days.delete(days.keys().next().value!);days.set(day,bounds);}
  const earliest=big(row.earliest_at_ms),latest=big(row.latest_at_ms);
  if(earliest<bounds[0]||earliest>=bounds[1]||latest<bounds[0]||latest>=bounds[1])return deny("UNAVAILABLE");
 }
}