const https = require('https');

https.get('https://ecoscolaire.vercel.app/assets/index-CSQVSr-U.js', (resp) => {
  console.log('Status code:', resp.statusCode);
  console.log('Content-Type:', resp.headers['content-type']);
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
