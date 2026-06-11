const fs = require('fs');
const path = require('path');

const testsDir = path.join(__dirname, 'tests');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.spec.ts'));

for (const file of files) {
  const filePath = path.join(testsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  content = content.replace(/locator\('input\[type="email"\]'\)/g, "getByTestId('login-email')");
  content = content.replace(/locator\('input\[type="password"\]'\)/g, "getByTestId('login-password')");
  content = content.replace(/locator\('button\[type="submit"\]'\)/g, "getByTestId('login-submit')");
  
  fs.writeFileSync(filePath, content);
}
console.log('Locators updated successfully in ' + files.length + ' files.');
