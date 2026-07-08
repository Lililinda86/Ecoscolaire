const fs = require('fs');
const https = require('https');

https.get('https://ecoscolaire-ghd6.vercel.app/', (res) => {
  let html = '';
  res.on('data', d => html += d);
  res.on('end', () => {
    const jsMatches = [...html.matchAll(/src="\/assets\/(index-[^\"]+\.js)"/g)];
    if(jsMatches.length > 0) {
      const url = `https://ecoscolaire-ghd6.vercel.app/assets/${jsMatches[0][1]}`;
      https.get(url, (jres) => {
        let jsContent = '';
        jres.on('data', d => jsContent += d);
        jres.on('end', () => {
          const hasLimitCheck = jsContent.includes('isStudentLimitReached') || jsContent.includes('getStudentLimit');
          const hasErrorBlock = jsContent.includes('Limite SaaS atteinte');
          console.log(`P0-024B Code Found in Production Bundle: ${hasLimitCheck && hasErrorBlock}`);
        });
      });
    } else {
      console.log('No main bundle found');
    }
  });
});
