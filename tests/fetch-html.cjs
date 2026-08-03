const https = require('https');

https.get('https://ecoscolaire.vercel.app/', (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => {
    const scripts = data.match(/<script.*?<\/script>/gi);
    console.log("SCRIPTS:", scripts);
    const links = data.match(/<link.*?href=".*?".*?>/gi);
    console.log("LINKS:", links);
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
