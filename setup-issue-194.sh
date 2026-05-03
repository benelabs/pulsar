#!/usr/bin/env bash
# setup-issue-194.sh
# Creates the feature branch and runs all tests for Issue #194
# Usage: bash setup-issue-194.sh

set -e

echo "==> Creating branch feature/formal-verification-examples"
git checkout -b feature/formal-verification-examples 2>/dev/null || git checkout feature/formal-verification-examples

echo "==> Staging new files"
git add \
  tests/unit/verify_escrow_conditions.test.ts \
  tests/integration/verify_escrow_conditions.test.ts \
  docs/verify_escrow_conditions.md

echo "==> Running unit tests"
npx vitest run tests/unit/verify_escrow_conditions.test.ts

echo "==> Running integration tests"
npx vitest run tests/integration/verify_escrow_conditions.test.ts

echo "==> Running full test suite with coverage"
npm run test:coverage

echo ""
echo "All done! Commit with:"
echo "  git commit -m 'feat(verify_escrow_conditions): add formal verification tests & docs (closes #194)'"
