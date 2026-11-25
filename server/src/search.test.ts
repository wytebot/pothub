import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDdg, unwrap } from './search.ts';

const page = `<div class="result"><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1&amp;rut=abc">Example &amp; <b>One</b></a></h2>
<a class="result__snippet" href="//duckduckgo.com/l/?uddg=x">The <b>first</b> snippet &#x27;here&#x27;</a></div>
<div class="result"><h2><a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad=1">An advert</a></h2></div>
<div class="result"><h2><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fb">Two</a></h2><a class="result__snippet">Second</a></div>`;

test('reads titles, real addresses and snippets, and skips ads', () => {
  const h = parseDdg(page);
  assert.equal(h.length, 2);
  assert.deepEqual(h[0], { title: 'Example & One', url: 'https://example.com/a?x=1', snippet: "The first snippet 'here'" });
  assert.equal(h[1].url, 'https://example.org/b');
});
test('unwrap only returns http(s) addresses', () => {
  assert.equal(unwrap('//duckduckgo.com/l/?uddg=javascript%3Aalert(1)'), null);
  assert.equal(unwrap('https://duckduckgo.com/y.js?x=1'), null);
});
