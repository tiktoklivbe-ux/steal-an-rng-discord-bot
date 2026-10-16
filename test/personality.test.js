import test from 'node:test';
import assert from 'node:assert/strict';
import { personality, saltyAnswer, stefonId, stefonLetters } from '../src/personality.js';
const config = { game: { url: 'https://www.roblox.com/games/89881575589403', owner: 'stefunkwn' } };
test('Stefon gets six ordered reactions; bot mention replies suppress pings and respect cooldown', async () => {
  const reactions=[], replies=[], cooldowns=new Map();
  const message={author:{id:stefonId || 'sample-member'},mentions:{users:new Map([['bot',{}]])},content:'<@bot> how do I verify?',react:async e=>reactions.push(e),reply:async p=>replies.push(p)};
  await personality(message,'bot',config,k=>k,cooldowns,100000);
  assert.deepEqual(reactions,stefonId ? stefonLetters : []);
  assert.match(replies[0].content,/<#verify>/);
  assert.equal(replies[0].allowedMentions.repliedUser,false);
  await personality(message,'bot',config,k=>k,cooldowns,100001);
  assert.equal(replies.length,1);
  assert.match(saltyAnswer('what is the capital of Mars?',config,k=>k),/don’t have a reliable answer/);
});
