import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('Debug P0-022', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await loginAs(page, 'parent1.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  await page.waitForTimeout(3000);
  
  const result = await page.evaluate(async () => {
    try {
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      const { getAuth } = await import('firebase/auth');
      const db = getFirestore();
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return 'No user';
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      return userDoc.data();
    } catch(e) { return e.toString(); }
  });
  console.log('USER DOC EXACT:', JSON.stringify(result, null, 2));

  // Force failure to see logs in playwright output
  expect(1).toBe(0);
});
