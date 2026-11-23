import {render,screen,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {TestSettings} from "@/components/settings/test-settings";
vi.mock("@/components/settings/test-backup-card",()=>({TestBackupCard:()=>null}));
vi.mock("@/components/settings/password-security-preview",()=>({PasswordSecurityPreview:()=>null}));
vi.mock("@/components/settings/settings-preview",()=>({ShopDetailsForm:({disabled}:{disabled:boolean})=><button disabled={disabled}>Save Settings</button>}));
vi.mock("@/components/settings/use-shop-settings",()=>({refreshSharedShopSettings:vi.fn()}));
vi.mock("@/lib/settings/recovery-store",()=>({readMarker:async()=>null,claimMarker:vi.fn(),confirmMarker:vi.fn(),acknowledgeMarker:vi.fn(),sameMarker:vi.fn()}));
it("enables ordinary shop settings without extra reason/password controls",async()=>{vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes("/history")?{items:[],nextCursor:null}:{context:"a".repeat(64),saved:null,fallbackShopName:"TEST"}})));try{render(<TestSettings/>);await waitFor(()=>expect(screen.getByRole("button",{name:"Save Settings"})).toBeEnabled());expect(screen.queryByLabelText("Reason for settings change")).not.toBeInTheDocument();expect(screen.queryByLabelText("Current Admin password")).not.toBeInTheDocument();}finally{vi.unstubAllGlobals();}});
