import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';

// Direct local-file checks: no Next.js server, network, new packages or browser downloads.
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const file=resolve(repository,'demo/shop-pos-showcase.html');
const html=readFileSync(file,'utf8');
const provenance=JSON.parse(html.match(/<script id="showcase-provenance" type="application\/json">(.*?)<\/script>/s)[1]);
assert.equal(provenance.sources.length,9);
assert.equal(provenance.theme.file,"web/src/styles/tokens.css");
assert.equal(createHash("sha256").update(readFileSync(resolve(repository,provenance.theme.file),"utf8")).digest("hex"),provenance.theme.sha256,"Shared theme tokens differ; regenerate first");
for(const entry of provenance.sources) assert.equal(createHash('sha256').update(readFileSync(resolve(repository,entry.file),'utf8')).digest('hex'),entry.sha256,entry.file+' differs from bundled source; regenerate first');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
const errors=[],network=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith('file:')&&!request.url().startsWith('data:')) network.push(request.url());});
const nav=name=>page.getByRole('navigation',{name:'Admin showcase'}).getByRole('button',{name,exact:true}).click();
const salesNav=name=>page.getByRole('navigation',{name:'Salesperson showcase'}).getByRole('button',{name,exact:true}).click();
async function salespersonPrivacy(){assert.equal(await page.getByRole('navigation',{name:'Admin showcase'}).count(),0);assert.doesNotMatch(await page.getByRole('main').innerText(),/purchase costs?|historical costs?|gross profit|available stock|admin-only|cost snapshots?|investment|Rs\. 5,140\.00|Rs\. 20,550\.00/i);assert.deepEqual(await page.getByRole('navigation',{name:'Salesperson showcase'}).getByRole('button').allTextContents(),['Make a Sale','Return Item','Shop Expenses']);}

async function noOverflow(label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),label+' has horizontal overflow');}
async function responsive(label){for(const width of [320,375,768,1024,1440,1920]){await page.setViewportSize({width,height:900});await noOverflow(label+' at '+width);}await page.setViewportSize({width:1440,height:900});}
try {
  await page.goto(pathToFileURL(file).href);
  await expect(page.getByRole('heading',{name:'Welcome to Shop POS'})).toBeVisible();
  assert.equal(await page.locator('script[src],link[rel="stylesheet"],img[src^="http"]').count(),0);
  await responsive('Entry');
  const invariants=await page.evaluate(()=>{
    const totals=core.profit.calculateMockProfitTotals(core.costs.getFictionalProfitSales());
    const diapersSales=core.sales.aggregateMockSales(core.sales.mockSales).find(item=>item.productId==='diapers');
    const diapersProfit=core.profit.aggregateMockProfit(core.costs.getFictionalProfitSales()).find(item=>item.productId==='diapers');
    return {products:core.inventory.mockInventory.length,stock:core.inventory.mockInventory.reduce((sum,item)=>sum+item.quantity,0),low:core.inventory.getMockLowStockProducts().length,sales:core.sales.mockSales.length,revenue:String(totals.revenuePaise),cogs:String(totals.costOfGoodsSoldPaise),profit:String(totals.grossProfitPaise),diapersRevenue:String(diapersSales.revenuePaise),diapersProfit:String(diapersProfit.grossProfitPaise),suggested:core.suggestions.getMockSuggestedSellingPrice('diapers'),quantity:totals.quantity,differentProducts:core.sales.aggregateMockSales(core.sales.mockSales).length};
  });
  assert.deepEqual(invariants,{products:7,stock:123,low:3,sales:8,revenue:'2569000',cogs:'2055000',profit:'514000',diapersRevenue:'749950',diapersProfit:'129950',suggested:'1250.00',quantity:'42',differentProducts:6});
  await page.getByRole('button',{name:'Preview Admin',exact:true}).focus();
  assert.match(await page.getByRole('button',{name:'Preview Admin',exact:true}).evaluate(node=>getComputedStyle(node).outlineStyle),/solid/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Admin Dashboard',exact:true})).toBeVisible();
  await responsive('Dashboard');
  assert.deepEqual(await page.getByRole('navigation',{name:'Admin showcase'}).getByRole('button').allTextContents(),['Dashboard','Products','Inventory','Sales','Reports','Total Investment']);
  await expect(page.getByRole('navigation',{name:'Admin showcase'}).getByRole('button',{name:'Dashboard',exact:true})).toHaveAttribute('aria-current','page');
  assert.equal(await page.getByText('Demo Tools',{exact:true}).count(),0);
  await nav('Products');await page.getByLabel('Search product name').fill('tooth');
  await expect(page.locator('#stock-rows tr')).toHaveCount(1);await expect(page.locator('#stock-rows')).toContainText('Toothpaste');await expect(page.locator('#stock-rows')).toContainText('Out of stock');
  await nav('Inventory');await page.getByLabel('Stock status').selectOption('Out of stock');await expect(page.locator('#stock-rows tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Clear',exact:true}).click();await expect(page.locator('#stock-rows tr')).toHaveCount(7);
  await responsive('Inventory');
  await nav('Sales');await expect(page.getByRole('main')).toContainText('Rs. 25,690.00');await expect(page.getByRole('main')).toContainText('Rs. 7,499.50');
  await nav('Reports');await expect(page.getByRole('heading',{name:'Reports',exact:true})).toBeVisible();await page.getByRole('button',{name:'View Profit Report',exact:true}).click();await expect(page.getByRole('main')).toContainText('Rs. 20,550.00');await expect(page.getByRole('main')).toContainText('Rs. 5,140.00');await expect(page.getByRole('main')).toContainText('Rs. 1,299.50');await expect(page.getByRole('main')).toContainText('fictional examples');
  await responsive('Profit');
  await page.getByRole('button',{name:'Back to Login',exact:true}).click();await page.getByRole('button',{name:'Preview Salesperson',exact:true}).click();await salesNav('Shop Expenses');await salespersonPrivacy();await expect(page.getByRole('navigation',{name:'Salesperson showcase'}).getByRole('button',{name:'Shop Expenses',exact:true})).toHaveAttribute('aria-current','page');await expect(page.getByText('No demo expenses entered.',{exact:true})).toBeVisible();
  await page.getByLabel('Amount (Rs.)',{exact:true}).fill('100.999');await page.getByRole('button',{name:'Add Demo Expense',exact:true}).click();await expect(page.locator('#expense-amount-error')).toContainText('no more than 2 decimal places');
  await page.getByLabel('Expense type',{exact:true}).selectOption('Transport');await page.getByLabel('Note (optional)',{exact:true}).fill('Trip <b>example</b>');await page.getByLabel('Amount (Rs.)',{exact:true}).fill('100.50');await page.getByRole('button',{name:'Add Demo Expense',exact:true}).click();
  await expect(page.getByRole('region',{name:'Temporary expenses'})).toContainText('Rs. 100.50');await expect(page.locator('.metrics > div').filter({has:page.locator('dt',{hasText:'Daily Demo Expenses'})})).toContainText('Rs. 100.50');await expect(page.locator('.metrics > div').filter({has:page.locator('dt',{hasText:'Monthly Demo Expenses'})})).toContainText('Rs. 100.50');await expect(page.getByRole('region',{name:'Temporary expenses'})).toContainText('Trip <b>example</b>');assert.equal(await page.getByRole('region',{name:'Temporary expenses'}).locator('b').count(),0);
  await page.getByRole('button',{name:'Correct Transport expense'}).click();await page.getByLabel('Amount (Rs.)',{exact:true}).fill('120.00');await page.getByRole('button',{name:'Update Demo Expense',exact:true}).click();await expect(page.getByRole('region',{name:'Temporary expenses'})).toContainText('Rs. 120.00');
  await responsive('Expenses');await page.getByRole('button',{name:'Remove Transport expense'}).click();await expect(page.getByText('No demo expenses entered.',{exact:true})).toBeVisible();
  await salesNav('Return Item');await salespersonPrivacy();await page.getByLabel('Original demo sale',{exact:true}).selectOption('demo-sale-1');await page.getByLabel('Quantity to return',{exact:true}).fill('3');await page.getByRole('button',{name:'Review Return Preview',exact:true}).click();await expect(page.getByRole('alert')).toContainText('cannot exceed');
  await page.getByLabel('Quantity to return',{exact:true}).fill('1');await page.getByRole('button',{name:'Review Return Preview',exact:true}).click();await expect(page.locator('#return-review')).toContainText('Rs. 1,250.25');await expect(page.locator('#return-review')).toContainText('Refund amount not available for this demo sale.');await salespersonPrivacy();
  await page.getByLabel('Quantity to return',{exact:true}).fill('2');await expect(page.locator('#return-review')).toHaveCount(0);await page.getByRole('button',{name:'Review Return Preview',exact:true}).click();await expect(page.locator('#return-review')).toContainText('Rs. 2,500.50');await responsive('Return review');
  await page.getByRole('button',{name:'Back to Login',exact:true}).click();await page.getByRole('button',{name:'Preview Admin',exact:true}).click();await nav('Total Investment');await expect(page.locator('#investment-total')).toHaveText('Not entered');await page.getByLabel('Amount Invested (Rs.)',{exact:true}).fill('-1');await page.getByRole('button',{name:'Show Demo Investment',exact:true}).click();await expect(page.getByRole('alert')).toContainText('non-negative');
  await page.getByLabel('Amount Invested (Rs.)',{exact:true}).fill('100000.50');await page.getByLabel('Note (optional)',{exact:true}).fill('Owner <b>sample</b>');await page.getByRole('button',{name:'Show Demo Investment',exact:true}).click();await expect(page.locator('#investment-total')).toHaveText('Rs. 100,000.50');await expect(page.getByRole('main')).toContainText('Owner <b>sample</b>');assert.equal(await page.getByRole('main').locator('b').count(),0);
  await page.getByRole('button',{name:'Reset Demo',exact:true}).click();await expect(page.locator('#investment-total')).toHaveText('Not entered');
  await page.getByRole('button',{name:'Back to Login',exact:true}).click();await page.getByRole('button',{name:'Preview Salesperson',exact:true}).click();
  await salespersonPrivacy();await expect(page.getByLabel('Discount (%) - optional',{exact:true})).toBeVisible();await expect(page.getByLabel('Cash Received (Rs.) - optional',{exact:true})).toBeVisible();
  await page.getByLabel('Search products',{exact:true}).fill('diap');await expect(page.locator('#sale-product option')).toHaveCount(2);await page.getByLabel('Choose Product',{exact:true}).selectOption('mock-diapers');
  await expect(page.locator('#suggested-price')).toContainText('Rs. 1,250.00');await page.getByLabel('Quantity',{exact:true}).fill('2');await page.getByLabel('Actual Selling Price (Rs.)',{exact:true}).fill('100.999');await page.getByLabel('Actual Selling Price (Rs.)',{exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'Make a Sale',exact:true})).toBeVisible();await expect(page.locator('#sale-price-error')).toHaveText('Enter a price with no more than 2 decimal places.');
  await page.getByLabel('Actual Selling Price (Rs.)',{exact:true}).fill('1250.25');await expect(page.locator('#final-amount')).toHaveText('Rs. 2,500.50');
  for(const invalid of ['-1','101','1.001']){await page.getByLabel('Discount (%) - optional',{exact:true}).fill(invalid);await page.getByRole('button',{name:'Preview Sale',exact:true}).click();await expect(page.locator('#sale-discount-error')).not.toHaveText('');await expect(page.getByRole('heading',{name:'Make a Sale',exact:true})).toBeVisible();}
  await page.getByLabel('Actual Selling Price (Rs.)',{exact:true}).fill('100.99');await page.getByLabel('Discount (%) - optional',{exact:true}).fill('0.01');await expect(page.locator('#sale-discount-error')).toContainText('fractions of a paisa');
  await page.getByLabel('Actual Selling Price (Rs.)',{exact:true}).fill('1200');await page.getByLabel('Discount (%) - optional',{exact:true}).fill('10');await page.getByLabel('Cash Received (Rs.) - optional',{exact:true}).fill('2000');await expect(page.locator('#checkout-summary')).toContainText('Cash received is less than the amount due.');await page.getByLabel('Cash Received (Rs.) - optional',{exact:true}).fill('2200');await expect(page.locator('#final-amount')).toHaveText('Rs. 2,160.00');await expect(page.locator('#checkout-summary')).toContainText('Rs. 240.00');await expect(page.locator('#checkout-summary')).toContainText('Rs. 40.00');
  await responsive('Checkout');
  await page.getByLabel('Theme',{exact:true}).selectOption('Dark');assert.equal(await page.locator('html').getAttribute('class'),'dark');await noOverflow('Dark checkout');await page.getByLabel('Theme',{exact:true}).selectOption('System');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveClass('dark');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).not.toHaveClass('dark');await page.getByLabel('Theme',{exact:true}).selectOption('Light');
  await page.evaluate(()=>window.scrollTo(0,0));mkdirSync(resolve(repository,'web/test-results'),{recursive:true});await page.screenshot({path:resolve(repository,'web/test-results/standalone-showcase-desktop.png'),fullPage:false});
  await page.getByRole('button',{name:'Preview Sale',exact:true}).click();await expect(page.getByRole('heading',{name:'SAMPLE RECEIPT - DEMO ONLY',exact:true})).toBeVisible();await expect(page.locator('#sample-receipt')).toContainText('Rs. 2,160.00');await expect(page.locator('#sample-receipt')).toContainText('Rs. 40.00');await responsive('Receipt');await salespersonPrivacy();await expect(page.getByRole('navigation',{name:'Salesperson showcase'}).getByRole('button',{name:'Make a Sale',exact:true})).toHaveAttribute('aria-current','page');
  await page.getByLabel('Compact receipt layout',{exact:true}).check();await page.evaluate(()=>{window.__demoPrintRequested=false;window.print=()=>{window.__demoPrintRequested=true;};});await page.getByRole('button',{name:'Print Sample Receipt',exact:true}).click();assert.equal(await page.evaluate(()=>window.__demoPrintRequested),true);
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('header').evaluate(node=>getComputedStyle(node).display),'none');assert.ok(await page.locator('#sample-receipt').isVisible());await page.emulateMedia({media:'screen'});
  await page.getByRole('button',{name:'New Sale',exact:true}).click();await expect(page.getByLabel('Choose Product',{exact:true})).toHaveValue('');await expect(page.getByLabel('Actual Selling Price (Rs.)',{exact:true})).toHaveValue('');
  await page.reload();await expect(page.getByRole('heading',{name:'Welcome to Shop POS'})).toBeVisible();
  assert.equal(await page.evaluate(()=>localStorage.length),0);assert.deepEqual(await context.cookies(),[]);assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
  console.log('PASS: 9 exact helper source hashes plus shared theme-token SHA-256; all 12 financial/inventory invariants; local-file role navigation and active states; Salesperson DOM confidentiality; Light/Dark/System themes; stock search/filter; original Sales/Profit views; expense validation/correction/removal; safe return review; investment/reset; price precision; discount rejection/exactness; cash/change; receipt/print styling; reset/reload; keyboard focus; six viewport widths on eight views; zero HTTP requests, cookies or storage.');
  console.log('Screenshot: web/test-results/standalone-showcase-desktop.png');
} finally {await browser.close();}
