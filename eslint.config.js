import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
