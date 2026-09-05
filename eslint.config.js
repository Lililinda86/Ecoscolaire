import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // scripts/validate-staging.cjs est encodé en UTF-16 (artefact du workflow CI
  // validate-staging.yml qui l'exécute via `node scripts/validate-staging.cjs`).
  // ESLint ne peut pas parser ce fichier (Unexpected character '\0').
  // Il n'a pas besoin d'être linté : c'est un script CI exécuté directement par Node.js.
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/.vercel/**',
    '**/.firebase/**',
    '**/.codex/**',
    '**/.codex-isolated/**',
    '**/.codex-worktrees/**',
    '**/codex-worktrees/**',
    '**/reports/**',
    '**/functions/lib/**',
    'scripts/validate-staging.cjs',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Exemptions légitimes : hooks exportés co-localisés avec leur Provider
      // (pattern React standard : AppProvider + useAppContext dans AppContext.tsx,
      //  useI18n dans I18nContext.tsx, useGrades dans Grades.tsx)
      // allowExportNames est l'API documentée du plugin react-refresh.
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useAppContext',
            'AppProvider',
            'useI18n',
            'getAppreciation',
          ],
        },
      ],
      'no-restricted-syntax': [
        'warn',
        {
          selector: "CallExpression[callee.name='saveDB']",
          message: "P0-003: L'utilisation de saveDB() est un anti-pattern causant des Lost Updates. Utilisez updateDoc() ou runTransaction()."
        },
        {
          selector: "CallExpression[callee.name='setDoc'][arguments.length<3]",
          message: "P0-003: setDoc sans option {merge: true} écrase le document entier. Ajoutez {merge: true} ou utilisez updateDoc()."
        }
      ]
    }
  },
])
