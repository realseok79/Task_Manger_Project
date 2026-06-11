import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/Users/leejinseok/Desktop/oss_team_project/presentation/slides';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--hide-scrollbars'] });
async function fresh() {
  const p = await B.newPage();
  await p.emulateMediaFeatures([{ name:'prefers-color-scheme', value:'light' }]);
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle0' }); await wait(1500);
  return p;
}
const clickText = (p, sel, txt) => p.evaluate((s,t)=>[...document.querySelectorAll(s)].find(x=>x.textContent.includes(t))?.click(), sel, txt);

// 08 — Quick add composer (press 'n')
let p = await fresh();
await p.keyboard.press('n'); await wait(500);
await p.screenshot({ path: `${OUT}/08-composer.png` });
await p.close();

// 09 — Zombie modal (click zombie card)
p = await fresh();
await p.evaluate(()=>document.querySelector('.task-card--line-zombie')?.click()); await wait(500);
await p.screenshot({ path: `${OUT}/09-zombie.png` });
await p.close();

// 10 — Settings modal (sidebar 설정)
p = await fresh();
await clickText(p, '.sidebar-nav-item', '설정'); await wait(500);
await p.screenshot({ path: `${OUT}/10-settings.png` });
await p.close();

await B.close(); console.log('captured extra');
