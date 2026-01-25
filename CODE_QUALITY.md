# Code Quality Setup

This project now includes ESLint and Prettier for code quality and formatting.

## Available Scripts

- `npm run lint` — Check code for linting issues
- `npm run lint:fix` — Auto-fix linting issues
- `npm run format` — Format all code files with Prettier
- `npm run format:check` — Check if files are formatted correctly

## Configuration Files

- `.eslintrc.json` — ESLint configuration with recommended rules
- `.prettierrc.json` — Prettier formatting rules
- `.eslintignore` — Files/folders to exclude from linting
- `.prettierignore` — Files/folders to exclude from formatting

## Installation

If you haven't already, install dependencies:

```bash
npm install
```

## IDE Integration

### VS Code

Install the official extensions:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

Add to `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Other Editors

Follow the official guides:

- [ESLint Editor Integration](https://eslint.org/docs/latest/use/integrations)
- [Prettier Editor Support](https://prettier.io/docs/en/editors.html)

## Rules Overview

### ESLint

- **No console.log** in production (warnings allowed)
- **Prefer const over let/var** for immutability
- **Strict equality** (=== instead of ==)
- **Template literals** for string interpolation
- **Arrow functions** preferred over function expressions
- Unused variables trigger errors (prefix with `_` to ignore)

### Prettier

- 100 character line width (readable on most displays)
- Single quotes for strings
- Semicolons required
- Trailing commas in ES5
- 2-space indentation

## Pre-commit Setup (Optional)

To ensure code quality before commits, install Husky and lint-staged:

```bash
npx husky-init --yarn
npm install lint-staged --save-dev
```

Edit `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

Edit `package.json` to add:

```json
{
  "lint-staged": {
    "*.{js,mjs}": "eslint --fix",
    "*.{js,mjs,json,md,html,css}": "prettier --write"
  }
}
```

## Workflow

1. **During development**: Editor auto-fixes on save with extensions installed
2. **Before commit**: Run `npm run lint:fix && npm run format`
3. **In CI/CD**: Run `npm run lint` and `npm run format:check` to verify

## Customization

Edit `.eslintrc.json` or `.prettierrc.json` to adjust rules for your team's preferences.
