"use strict";
document.getElementById("setup").addEventListener("submit",async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector("button"),admin=document.getElementById("admin"),staff=document.getElementById("salesperson"),error=document.getElementById("error");
 if(!form.reportValidity())return;button.disabled=true;error.textContent="";
 try{const result=await window.shopPOSTestSetup.submit({ADMIN:admin.value,SALESPERSON:staff.value,confirmed:document.getElementById("confirm").checked});admin.value="";staff.value="";if(!result.ok){error.textContent=result.code==="PASSWORD_POLICY"?"Use two different passwords of 8–128 characters. Common and repeated passwords are rejected. Re-enter both passwords; existing data is retained.":"Setup could not be saved. Existing data is retained.";button.disabled=false;}}catch{error.textContent="Setup could not be saved. Existing data is retained.";button.disabled=false;}
});
