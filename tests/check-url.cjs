const fetch = require('node-fetch') || globalThis.fetch;

async function check() {
  try {
    const r = await fetch('https://ecoscolaire-z3tw.vercel.app/');
    const d = await r.text();
    const m = d.match(/src="(\/assets\/index-[^"]+?\.js)"/);
    if(m) {
      console.log('Found JS:', 'https://ecoscolaire-z3tw.vercel.app' + m[1]);
      const r2 = await fetch('https://ecoscolaire-z3tw.vercel.app' + m[1]);
      const js = await r2.text();
      console.log('Includes randomUUID:', js.includes('randomUUID'));
    } else {
      console.log('No JS', d.substring(0, 100));
    }
  } catch (e) {
    console.error(e);
  }
}
check();
