import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FREE_FOREVER_DEFAULTS, freeForeverConfig, isFreeForeverProfile } from '../server/free-forever-policy.js';

const EMAIL = 'owner@example.com', LOGIN = 'owner-bot';
const cfg = freeForeverConfig({ POTHUB_FREE_FOREVER_EMAILS: EMAIL, POTHUB_FREE_FOREVER_GITHUB_LOGINS: LOGIN });
const lib = fs.readFileSync(new URL('../server/lib.js', import.meta.url), 'utf8');

test('nothing is hard-coded: with no environment variables nobody is free', () => {
  const empty = freeForeverConfig({});
  assert.equal(FREE_FOREVER_DEFAULTS.emails.length + FREE_FOREVER_DEFAULTS.githubLogins.length + FREE_FOREVER_DEFAULTS.githubIds.length, 0);
  assert.equal(isFreeForeverProfile({ github_login: 'google:u', email: EMAIL }, 'g', empty), false);
  assert.equal(isFreeForeverProfile({ github_login: LOGIN }, '1', empty), false);
});

test('accounts set in the environment are granted', () => {
  assert.equal(isFreeForeverProfile({ github_login: 'google:uid123', email: EMAIL }, 'g1', cfg), true);
  assert.equal(isFreeForeverProfile({ github_login: LOGIN }, '12345', cfg), true);
});

test('matching is case-insensitive but otherwise exact', () => {
  assert.equal(isFreeForeverProfile({ github_login: 'google:u', email: '  Owner@Example.COM ' }, 'g', cfg), true);
  assert.equal(isFreeForeverProfile({ github_login: 'Owner-Bot' }, '1', cfg), true);
  for (const email of ['owne@example.com', 'owner@example.com.evil.com', 'x+owner@example.com', 'o.wner@example.com'])
    assert.equal(isFreeForeverProfile({ github_login: 'google:u', email }, 'g', cfg), false, email);
  for (const login of ['owner-bot2', 'owner-bo', 'my-owner-bot', 'owner-bot-'])
    assert.equal(isFreeForeverProfile({ github_login: login }, '1', cfg), false, login);
});

test('identity types cannot be crossed: GitHub accounts never match by email, Google accounts never by login', () => {
  assert.equal(isFreeForeverProfile({ github_login: 'someone-else', email: EMAIL }, '99', cfg), false);
  assert.equal(isFreeForeverProfile({ github_login: 'google:owner-bot', email: 'other@example.com' }, 'g', cfg), false);
  assert.equal(isFreeForeverProfile({ github_login: 'vercel:owner-bot', email: EMAIL }, 'v', cfg), false);
});

test('missing, malformed or empty profiles are never free', () => {
  for (const p of [null, undefined, 'owner-bot', 42, {}, { github_login: '' }, { github_login: 'google:u' }, { github_login: 'google:u', email: '' }])
    assert.equal(isFreeForeverProfile(p, '1', cfg), false);
});

test('environment variables add accounts, including the safer numeric GitHub id', () => {
  const env = { POTHUB_FREE_FOREVER_EMAILS: 'a@x.com, B@X.com', POTHUB_FREE_FOREVER_GITHUB_LOGINS: 'octocat;hubot', POTHUB_FREE_FOREVER_GITHUB_IDS: '583231 9919' };
  const c = freeForeverConfig(env);
  assert.equal(isFreeForeverProfile({ github_login: 'google:u', email: 'b@x.com' }, 'g', c), true);
  assert.equal(isFreeForeverProfile({ github_login: 'hubot' }, '5', c), true);
  assert.equal(isFreeForeverProfile({ github_login: 'renamed-owner' }, '583231', c), true, 'id match survives a login rename');
  assert.equal(isFreeForeverProfile({ github_login: 'renamed-owner' }, '583232', c), false);
  assert.equal(isFreeForeverProfile({ github_login: 'unlisted' }, '1', c), false);
});

test('every charge path in lib.js checks free-forever status, and lookup failure fails closed', () => {
  assert.match(lib, /import \{isFreeForeverProfile\} from '\.\/free-forever-policy\.js'/);
  for (const fn of ['spendCredits', 'reserveCredits', 'spendCreditsOnce'])
    assert.match(lib, new RegExp(`export async function ${fn}\\([^)]*\\)\\{[^]*?freeForeverState\\(id\\)`), fn);
  assert.match(lib, /export async function commitCreditReservation[^\n]*freeForeverState\(id\)/);
  assert.match(lib, /export async function releaseCreditReservation[^\n]*freeForeverState\(id\)/);
  assert.match(lib, /catch\{value=null\}/, 'a failed profile lookup must mean "charge normally"');
  assert.match(lib, /if\(!error&&profile&&isFreeForeverProfile\(profile,userId\)\)/);
});

test('purchases and grants are untouched by the bypass', () => {
  assert.match(lib, /export async function addCredits\(id,amount,reference,reason='Credit pack purchase'\)\{if\(!ensureDatabase\(\)\)throw Error\('Configure Firebase Firestore before enabling real credit purchases\.'\);return grantCreditsOnce/);
});
