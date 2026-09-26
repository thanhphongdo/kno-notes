import { chromium, devices } from '@playwright/test';
const BASE='https://kno-notes.vercel.app';
const b=await chromium.launch();
const ctx=await b.newContext({ ...devices['iPhone 13'] });
const page=await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.getByLabel(/Tên đăng nhập/i).fill('hongloan');
await page.getByLabel(/Mật khẩu/i).fill('abcd1234');
await page.getByRole('button',{name:'Đăng nhập'}).click();
await page.waitForURL(`${BASE}/`);
const vp = page.viewportSize();

// 1. search overlay
await page.locator('[data-search-box] input').click();
await page.waitForTimeout(900);
const ov = await page.locator('[data-search-overlay]').evaluate(el=>{const r=el.getBoundingClientRect();const cs=getComputedStyle(el);return{w:Math.round(r.width),h:Math.round(r.height),bg:cs.backgroundColor,z:cs.zIndex};}).catch(()=>null);
console.log(`1. SEARCH overlay : ${ov ? `${ov.w}x${ov.h} bg=${ov.bg} z=${ov.z} -> fullscreen ${ov.w===vp.width&&ov.h>=vp.height-2?'CÓ':'KHÔNG'}` : 'KHÔNG CÓ'}`);
await page.screenshot({ path:'/tmp/prod-search.png' });
await page.keyboard.press('Escape'); await page.waitForTimeout(500);

// 2. table scroll
await page.goto(`${BASE}/notes/nmuiaq1d92mrr`); await page.waitForLoadState('networkidle');
const t = await page.evaluate(()=>{const e=document.querySelector('[data-prose] table');return{c:Math.round(e.clientWidth),s:Math.round(e.scrollWidth)};});
console.log(`2. BẢNG cuộn ngang: khung ${t.c} / nội dung ${t.s} -> ${t.s>t.c?'CÓ':'KHÔNG'}`);

// 3. lightbox
await page.locator('[data-image-thumb]').first().click();
await page.waitForSelector('[data-lightbox]', { timeout: 8000 });
const lb = await page.locator('[data-lightbox]').evaluate(el=>{const r=el.getBoundingClientRect();return{w:Math.round(r.width),h:Math.round(r.height)};});
console.log(`3. LIGHTBOX       : ${lb.w}x${lb.h} -> fullscreen ${lb.w===vp.width&&lb.h>=vp.height-2?'CÓ':'KHÔNG'}`);
const cx=vp.width/2, cy=vp.height/2;
await page.mouse.move(cx+120,cy); await page.mouse.down();
for(let i=0;i<10;i++) await page.mouse.move(cx+120-(i+1)*24, cy);
await page.mouse.up(); await page.waitForTimeout(700);
console.log(`   vuốt sang ảnh 2: ${/2\s*\/\s*3/.test(await page.textContent('[data-lightbox]')||'')?'CÓ':'KHÔNG'}`);
await page.mouse.click(cx-70,cy); await page.mouse.click(cx-70,cy,{delay:40}); await page.waitForTimeout(500);
const zoomed = await page.evaluate(()=>{const i=document.querySelector('[data-lightbox-image]');const el=i.closest('[style*="transform"]')??i;return getComputedStyle(el).transform;});
console.log(`   double-tap zoom : ${/matrix\((?!1,\s*0,\s*0,\s*1)/.test(zoomed)?'CÓ ('+zoomed.slice(0,26)+'…)':'KHÔNG'}`);
await page.screenshot({ path:'/tmp/prod-lightbox.png' });

// 4. apple meta
const meta = await page.evaluate(()=>document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content);
console.log(`4. PWA iOS meta   : ${meta==='yes'?'CÓ':'THIẾU'}`);
await b.close();
