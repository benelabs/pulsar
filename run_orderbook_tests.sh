#!/bin/bash

echo "Running get_orderbook unit tests..."
npx vitest run src/tools/get_orderbook.test.ts

echo ""
echo "Running get_orderbook integration tests..."
RUN_INTEGRATION_TESTS=true npx vitest run tests/integration/get_orderbook.test.ts

echo ""
echo "Running all tests to ensure no regressions..."
npx vitest run
