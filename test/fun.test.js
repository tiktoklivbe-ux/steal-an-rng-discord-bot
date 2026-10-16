import test from 'node:test';
import assert from 'node:assert/strict';
import { funCommands, funReply } from '../src/fun.js';
test('fun commands handle random boundaries without granting rewards or echoing input', () => {
  for (const name of funCommands) for (const upper of [false, true]) {
    const result = funReply(name, { getInteger: () => 100 }, max => upper ? max - 1 : 0);
    assert.ok(result.length > 0 && result.length < 2000);
    if (['roll','heist'].includes(name)) assert.match(result, /no .*rewards/);
  }
  assert.match(funReply('dice', { getInteger: () => null }, () => 0), /1 \/ 6/);
  assert.match(funReply('roll', {}, max => max - 1), /OMEGA/);
});
