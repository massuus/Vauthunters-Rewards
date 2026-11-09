import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

test('lint catches undefined names in every runtime while accepting its configured globals', async () => {
  const eslint = new ESLint();
  for (const [filePath, source] of [
    ['functions/services/lint-probe.js', 'console.error(process.version);'],
    ['public/js/core/lint-probe.js', 'console.error(document.title);'],
    ['scripts/companion-collector/lint-probe.mjs', 'console.error(process.version);'],
    ['tests/lint-probe.test.js', 'console.error(Buffer.alloc(1));'],
    ['public/sw.js', 'console.error(self.location, __BUILD_REV__);'],
  ]) {
    const [result] = await eslint.lintText(`${source}\nmissingCleanupIdentifier();\n`, {
      filePath,
    });
    const errors = result.messages.filter((message) => message.severity === 2);
    assert.equal(errors.length, 1, `${filePath}: ${JSON.stringify(errors)}`);
    assert.equal(errors[0].ruleId, 'no-undef', filePath);
    assert.match(errors[0].message, /missingCleanupIdentifier/);
  }
});
