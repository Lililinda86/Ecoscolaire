import { expect, type Page, type ConsoleMessage } from '@playwright/test';

type ConsoleMonitorOptions = {
  allowedConsoleErrors?: RegExp[];
  allowedPageErrors?: RegExp[];
};

export function attachConsoleMonitor(page: Page, options: ConsoleMonitorOptions = {}) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  const consoleHandler = (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;

    const text = message.text();
    const allowed = options.allowedConsoleErrors?.some((pattern) => pattern.test(text));

    if (!allowed) {
      consoleErrors.push(text);
    }
  };

  const pageErrorHandler = (error: Error) => {
    const text = error.message;
    const allowed = options.allowedPageErrors?.some((pattern) => pattern.test(text));

    if (!allowed) {
      pageErrors.push(text);
    }
  };

  page.on('console', consoleHandler);
  page.on('pageerror', pageErrorHandler);

  return {
    assertNoCriticalErrors() {
      page.off('console', consoleHandler);
      page.off('pageerror', pageErrorHandler);
      expect(consoleErrors, `Unexpected console.error:\n${consoleErrors.join('\n')}`).toEqual([]);
      expect(pageErrors, `Unexpected pageerror:\n${pageErrors.join('\n')}`).toEqual([]);
    },
  };
}
