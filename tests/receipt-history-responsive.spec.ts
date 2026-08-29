import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const receiptHistoryCss = readFileSync(
  fileURLToPath(new URL('../src/components/ReceiptHistory.css', import.meta.url)),
  'utf8',
);

const receiptFixture = `
  <main class="receipt-page">
    <div class="receipt-history-scroll" data-testid="receipt-history-scroll">
      <table class="receipt-history-table">
        <thead><tr><th></th><th>N° Reçu</th><th>Date</th><th>Élève</th><th>Paiement ID</th><th>Montant</th><th>Actions</th></tr></thead>
        <tbody>
          <tr class="receipt-history-row" data-receipt-row="true" data-receipt-number="REC-2026-0013">
            <td class="receipt-history-toggle-cell">
              <button type="button" data-testid="receipt-detail-toggle-receipt-transport-credit"
                aria-expanded="false" aria-controls="receipt-detail-receipt-transport-credit">Détail</button>
            </td>
            <td class="receipt-history-number-cell"><div class="receipt-history-number">REC-2026-0013</div></td>
            <td class="receipt-history-date-cell">29/08/2026</td>
            <td class="receipt-history-student-cell">Élève Transport</td>
            <td class="receipt-history-payment-cell">payment-transport-credit</td>
            <td class="receipt-history-amount-cell">10 000 FCFA</td>
            <td class="receipt-history-actions-cell"><div class="receipt-history-actions">
              <button>Télécharger le PDF</button><button>Imprimer</button><button>Envoyer par WhatsApp</button>
            </div></td>
          </tr>
          <tr id="receipt-detail-receipt-transport-credit" class="receipt-history-detail-row"
            data-testid="receipt-detail-receipt-transport-credit" hidden>
            <td colspan="7" class="receipt-history-detail-cell">
              <div class="receipt-history-detail-grid"><div>Transport</div><div>Espèces</div></div>
              <div class="receipt-history-allocation" data-testid="transport-receipt-allocation-receipt-transport-credit">
                <div>Ventilation du versement Transport</div>
                <div class="receipt-history-allocation-row"><span>Période 2025-12</span><strong>4 000 FCFA</strong></div>
                <div class="receipt-history-allocation-row"><span>Crédit Transport</span><strong>2 000 FCFA</strong></div>
                <div class="receipt-history-credit"><strong>Crédit disponible : 2 000 FCFA</strong></div>
              </div>
            </td>
          </tr>
          <tr class="receipt-history-row" data-receipt-row="true" data-receipt-number="REC-2026-0012">
            <td class="receipt-history-toggle-cell"><button type="button" aria-expanded="false">Détail</button></td>
            <td class="receipt-history-number-cell">REC-2026-0012</td><td class="receipt-history-date-cell">28/08/2026</td>
            <td class="receipt-history-student-cell">Autre élève</td><td class="receipt-history-payment-cell">payment-second</td>
            <td class="receipt-history-amount-cell">4 000 FCFA</td><td class="receipt-history-actions-cell"></td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
  <script>
    const toggle = document.querySelector('[data-testid="receipt-detail-toggle-receipt-transport-credit"]');
    const detail = document.querySelector('[data-testid="receipt-detail-receipt-transport-credit"]');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      detail.hidden = expanded;
    });
  </script>`;

for (const width of [360, 768, 1440]) {
  test(`Receipt History remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>
      * { box-sizing: border-box; }
      :root { --border-color: #dbe1ea; --text-muted: #64748b; }
      body { margin: 0; }
      button { min-height: 44px; }
      .receipt-page { width: 100%; max-width: 1200px; margin: 0 auto; }
      ${receiptHistoryCss}
    </style>${receiptFixture}`);

    const row = page.locator('[data-receipt-row="true"]:visible').filter({ hasText: 'REC-2026-0013' });
    await expect(row).toHaveCount(1);
    const toggle = row.getByTestId('receipt-detail-toggle-receipt-transport-credit');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox?.width).toBeGreaterThanOrEqual(44);
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

    for (const actionName of ['Télécharger le PDF', 'Imprimer', 'Envoyer par WhatsApp']) {
      const actionBox = await row.getByRole('button', { name: actionName, exact: true }).boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox!.x).toBeGreaterThanOrEqual(0);
      expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(width + 1);
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = page.getByTestId('receipt-detail-receipt-transport-credit');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Période 2025-12')).toBeVisible();
    await expect(detail.getByText('Crédit disponible : 2 000 FCFA')).toBeVisible();

    const scrollMetrics = await page.getByTestId('receipt-history-scroll').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowX: getComputedStyle(element).overflowX,
    }));
    if (width <= 899) {
      expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.clientWidth + 1);
      expect(scrollMetrics.overflowX).toBe('visible');
      const direction = await detail.locator('.receipt-history-allocation-row').first()
        .evaluate((element) => getComputedStyle(element).flexDirection);
      expect(direction).toBe('column');
    } else {
      expect(scrollMetrics.overflowX).toBe('auto');
    }

    const documentMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(documentMetrics.scrollWidth).toBeLessThanOrEqual(documentMetrics.clientWidth + 1);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(detail).toBeHidden();
    await expect(page.locator('[data-receipt-row="true"]').filter({ hasText: 'REC-2026-0012' }))
      .toHaveCount(1);
  });
}
