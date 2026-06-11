import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/Users/leejinseok/Desktop/oss_team_project/presentation/slides';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const B = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });

async function fresh(beforeApp) {
  const p = await B.newPage();
  if (beforeApp) await p.evaluateOnNewDocument(beforeApp);
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await wait(1500);
  return p;
}
const navTo = (p, label) =>
  p.evaluate((t) => [...document.querySelectorAll('.sidebar-nav-item')].find((b) => b.textContent.includes(t))?.click(), label);
const clickText = (p, sel, txt) =>
  p.evaluate((s, t) => [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t))?.click(), sel, txt);

// 01 — Today (line layout: context bar + 최우선 + pending)
let p = await fresh();
await p.screenshot({ path: `${OUT}/01-today.png` });
await p.close();

// 02 — Command palette with a query
p = await fresh();
await p.keyboard.down('Meta'); await p.keyboard.press('k'); await p.keyboard.up('Meta'); await wait(350);
await p.type('.cmdk__input input', '리뷰'); await wait(400);
await p.screenshot({ path: `${OUT}/02-palette.png` });
await p.close();

// 03 — Archive (archive a zombie first, then open 보관함)
p = await fresh();
await p.evaluate(() => document.querySelector('.task-card--line-zombie')?.click()); await wait(400);
await clickText(p, 'button', '보관하기'); await wait(500);
await navTo(p, '보관함'); await wait(900);
await p.screenshot({ path: `${OUT}/03-archive.png` });
await p.close();

// 04 — Notifications popover
p = await fresh();
await p.evaluate(() => document.querySelector('.topbar__bell')?.click()); await wait(350);
await p.screenshot({ path: `${OUT}/04-notif.png` });
await p.close();

// 05 — Important list
p = await fresh();
await navTo(p, '중요'); await wait(900);
await p.screenshot({ path: `${OUT}/05-important.png` });
await p.close();

// 06 — History
p = await fresh();
await navTo(p, '기록'); await wait(900);
await p.screenshot({ path: `${OUT}/06-history.png` });
await p.close();

// 07 — Mini widget: force popup fallback (delete documentPictureInPicture), capture the popup window
try {
  p = await fresh(() => { try { delete window.documentPictureInPicture; } catch { } });
  const targetsBefore = B.targets().length;
  await p.evaluate(() => document.querySelector('.page-header__actions button[aria-label*="미니 위젯"]')?.click());
  await wait(900);
  const popupTarget = B.targets().find((t) => t !== p.target() && (t.url() === 'about:blank' || t.url().includes('localhost')) && t.type() === 'page');
  if (popupTarget) {
    const popup = await popupTarget.page();
    if (popup) {
      await popup.setViewport({ width: 320, height: 460, deviceScaleFactor: 2 });
      await wait(500);
      await popup.screenshot({ path: `${OUT}/07-widget.png` });
    }
  }
  await p.close();
} catch (e) {
  console.log('widget capture skipped:', e.message);
}

await B.close();
console.log('captured');
