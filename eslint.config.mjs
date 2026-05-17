import eslintJs from "@eslint/js";
import { globalIgnores, defineConfig } from "eslint/config";
// import prettier from "eslint-config-prettier";
// import eslintConfigPrettier from "eslint-config-prettier/flat";
import prettier from "eslint-plugin-prettier/recommended";
// import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptEslint from "typescript-eslint";
import typescriptParser from "@typescript-eslint/parser";
import eslintPluginImport from "eslint-plugin-import";
import stylistic from "@stylistic/eslint-plugin";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import jsdocPlugin from "eslint-plugin-jsdoc";

export default defineConfig([
  eslintJs.configs.recommended,
  typescriptEslint.configs.recommendedTypeChecked,
  typescriptEslint.configs.stylistic,
  sonarjsPlugin.configs.recommended,
  prettier,
  globalIgnores([
    "*.json",
    "node_modules/*",
    "*.mjs",
    "*.cjs",
    "build/*",
    "prisma.config.ts"
  ]),
  {
    languageOptions: {
      ecmaVersion: 2022,
      parser: typescriptParser,
      parserOptions: {
        projectService: true,
        // project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: { "@stylistic": stylistic, import: eslintPluginImport, jsdoc: jsdocPlugin },
    settings: { "import/resolver": { typescript: {} } },
    ignores: ["eslint.config.*", "*.json", "node_modules/*"],
    rules: {
      // Base ESLint rules
      curly: ["warn", "all"],
      "arrow-body-style": "off",
      "no-use-before-define": "off",
      "no-bitwise": "off",
      "no-unused-vars": "off",
      "no-else-return": [1, { allowElseIf: false }],
      "object-shorthand": "warn",
      "no-unneeded-ternary": "warn",
      "consistent-return": "warn",
      "no-useless-constructor": "warn",
      "prefer-destructuring": [
        "warn",
        {
          VariableDeclarator: {
            object: true,
            array: true
          },
          AssignmentExpression: {
            object: false,
            array: false
          }
        }
      ],
      "prefer-const": "warn",
      "prefer-object-spread": "off",
      "no-return-assign": "warn",
      "no-restricted-syntax": "off",
      "no-plusplus": "off",
      "no-case-declarations": "off",
      "no-param-reassign": "warn",
      "no-prototype-builtins": "off",
      "lines-between-class-members": "off",
      camelcase: "off",
      "no-underscore-dangle": "off",
      "no-duplicate-case": "error",
      "default-case": "error",
      "no-empty": "error",
      "no-ex-assign": "error",
      "no-unsafe-finally": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "getter-return": "error",
      "no-setter-return": "error",
      "no-constructor-return": "error",
      "no-empty-pattern": "error",
      "array-callback-return": "off",
      "no-void": "off",
      "no-restricted-globals": ["warn", "isNaN", "isFinite"],
      eqeqeq: [
        "error",
        "always",
        {
          null: "ignore"
        }
      ],
      radix: "warn",
      "no-unused-expressions": "error",
      "no-continue": "off",
      yoda: "warn",
      "func-names": "warn",
      "func-style": ["warn", "declaration", { allowArrowFunctions: true }],
      "no-promise-executor-return": "off",
      "no-nested-ternary": "error",
      "dot-notation": "warn",
      "no-lonely-if": "warn",
      "unicode-bom": "warn",
      "default-param-last": "warn",
      "class-methods-use-this": "warn",
      "max-params": ["warn", 5],
      "no-shadow": ["warn", { builtinGlobals: true, hoist: "functions", ignoreOnInitialization: false }],
      "prefer-arrow-callback": "off",
      "no-fallthrough": "off",
      "prefer-promise-reject-errors": "warn",
      "no-implied-eval": "error",

      // Import rules
      "import/order": [
        "warn",
        {
          groups: [
            ["builtin", "external"],
            ["parent", "sibling", "index", "type"]
          ]
        }
      ],
      "import/no-extraneous-dependencies": "off",
      "import/extensions": "off",
      "import/no-unresolved": "warn",
      "import/no-useless-path-segments": "warn",
      "import/prefer-default-export": "off",
      "import/no-cycle": "off",
      "import/no-self-import": "warn",
      "import/no-import-module-exports": "warn",

      // JSDOC
      "jsdoc/require-jsdoc": "warn",
      "jsdoc/no-types": "warn",
      "jsdoc/multiline-blocks": [
        "warn",
        {
          noMultilineBlocks: true,
          minimumLengthForMultiline: 100,
          allowMultipleTags: false
        }
      ],
      "jsdoc/no-blank-blocks": "warn",

      // Prettier
      "prettier/prettier": ["warn"],

      // Stylistic:
      "@stylistic/member-delimiter-style": "error",
      "@stylistic/type-annotation-spacing": "error",
      "@stylistic/brace-style": ["warn", "1tbs"],
      "@stylistic/semi": ["error", "always"],
      "@stylistic/max-len": [
        "warn",
        {
          code: 120,
          ignorePattern: "^\\s*(// eslint-disable-)|(describe)|(test).+"
        }
      ],
      "@stylistic/no-extra-semi": "error",
      "@stylistic/object-curly-newline": ["warn", { consistent: true }],
      "@stylistic/spaced-comment": "warn",

      // sonarjs:
      "sonarjs/prefer-immediate-return": "warn",
      "sonarjs/no-commented-code": "off",
      "sonarjs/no-nested-switch": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/no-duplicate-string": "warn",
      "sonarjs/max-switch-cases": "off",
      "sonarjs/unused-import": "off",
      "sonarjs/void-use": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/no-selector-parameter": "off",
      "sonarjs/no-hardcoded-passwords": "off",
      "sonarjs/function-return-type": "off",
      "sonarjs/deprecation": "off",
      "sonarjs/no-redundant-optional": "off",
      "sonarjs/todo-tag": "off",
      "sonarjs/post-message": "off",
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/no-array-delete": "off",
      "sonarjs/no-useless-catch": "off",
      "sonarjs/updated-const-var": "off",
      "sonarjs/production-debug": "off",
      "sonarjs/prefer-immediate-return": "off",
      "sonarjs/no-fallthrough": "off",
      "sonarjs/no-clear-text-protocols": "off",
      "sonarjs/different-types-comparison": "off",
      "sonarjs/prefer-read-only-props": "warn",
      "sonarjs/cognitive-complexity": "warn",
      "sonarjs/no-control-regex": "off",

      // TypeScript rules
      "@typescript-eslint/member-ordering": "error",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-for-in-array": "error",
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: ["variable", "property"],
          format: ["camelCase", "PascalCase", "snake_case", "UPPER_CASE"],
          leadingUnderscore: "allow",
          trailingUnderscore: "forbid"
        }
      ],
      "@typescript-eslint/no-misused-promises": [
        "warn",
        {
          checksVoidReturn: {
            attributes: false
          }
        }
      ],
      "@typescript-eslint/prefer-for-of": "off",
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: true
        }
      ]
    }
  }
]);
