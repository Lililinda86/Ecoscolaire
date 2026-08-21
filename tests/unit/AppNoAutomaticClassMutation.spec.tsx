// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appState = vi.hoisted(() => ({
  role: 'owner',
  safePatchDB: vi.fn(),
}));

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: () => ({
    authLoading: false,
    currentUser: { id: `${appState.role}-test`, role: appState.role },
    db: { school: {}, classes: [], students: [], staff: [] },
    safePatchDB: appState.safePatchDB,
  }),
}));

vi.mock('react-router-dom', () => ({
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Routes: () => null,
  Route: () => null,
  Navigate: () => null,
}));

import App from '../../src/App';

describe('App class writes on load', () => {
  beforeEach(() => appState.safePatchDB.mockClear());

  for (const role of ['owner', 'director']) {
    it(`performs zero writes when ${role} loads the app`, () => {
      appState.role = role;
      render(<App />);
      expect(appState.safePatchDB).toHaveBeenCalledTimes(0);
    });
  }
});
