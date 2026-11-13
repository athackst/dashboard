const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const backend = readFileSync(require.resolve('../netlify/functions/repo-info.js'), 'utf8');

async function loadRepository({ enabled = true, token = true, scannerResponse } = {}) {
  const requests = [];
  const context = {
    exports: {},
    process: { env: {
      INCLUDE_SECURITY_ALERTS: String(enabled),
      GITHUB_TOKEN: token ? 'test-token' : ''
    } },
    console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (name === 'dotenv') return { config() {} };
      assert.equal(name, 'axios');
      return { async get(url, options) {
        requests.push({ url, options });
        if (url.includes('/users/')) return { data: [{
          name: 'example', full_name: 'owner/example',
          html_url: 'https://github.com/owner/example', default_branch: null
        }] };
        if (url.includes('/alerts?')) return scannerResponse(url, options);
        return { data: [] };
      } };
    }
  };
  vm.runInNewContext(backend, context);
  const response = await context.exports.handler({ queryStringParameters: {
    repositorySources: '["owner"]'
  } });
  assert.equal(response.statusCode, 200);
  return { repository: JSON.parse(response.body)[0], response, requests };
}

test('counts all open-alert pages and returns no alert details', async () => {
  const { repository, response, requests } = await loadRepository({
    scannerResponse(url, options) {
      const parsedUrl = new URL(url);
      assert.equal(parsedUrl.searchParams.get('state'), 'open');
      assert.equal(parsedUrl.searchParams.get('per_page'), '100');
      assert.equal(parsedUrl.searchParams.has('page'), false);
      assert.equal(options.params, undefined);
      const nextPage = parsedUrl.searchParams.has('after');
      const size = url.includes('/dependabot/') ? (nextPage ? 1 : 100) : 0;
      return {
        data: Array.from({ length: size }, () => ({ secret: 'sensitive-value' })),
        headers: size === 100 ? { link: `<${url}&after=cursor>; rel="next"` } : {}
      };
    }
  });
  assert.deepEqual(repository.security_alerts, {
    dependabot: 101, 'code-scanning': 0, 'secret-scanning': 0
  });
  assert.equal(response.body.includes('sensitive-value'), false);
  assert.equal(requests.filter(({ url }) => url.includes('/alerts?')).length, 4);
});

for (const status of [403, 404, 429, 500]) {
  test(`security API ${status} preserves other scanner counts and repository data`, async () => {
    const { repository } = await loadRepository({ scannerResponse(url) {
      if (url.includes('/code-scanning/')) throw { response: { status } };
      return { data: [{ number: 1 }] };
    } });
    assert.deepEqual(repository.security_alerts, {
      dependabot: 1, 'code-scanning': null, 'secret-scanning': 1
    });
    assert.equal(repository.name, 'example');
    assert.equal(repository.pull_requests, 0);
  });
}

test('disabled reporting makes no security requests', async () => {
  const { repository, requests } = await loadRepository({ enabled: false });
  assert.equal(repository.security_alerts, null);
  assert.equal(requests.some(({ url }) => url.includes('/alerts?')), false);
});

test('missing authentication is unavailable without making security requests', async () => {
  const { repository, requests } = await loadRepository({ token: false });
  assert.deepEqual(repository.security_alerts, {
    dependabot: null, 'code-scanning': null, 'secret-scanning': null
  });
  assert.equal(requests.some(({ url }) => url.includes('/alerts?')), false);
});

test('security cells distinguish zero, unavailable, and disabled reporting', () => {
  const frontend = readFileSync(require.resolve('../assets/js/dashboard.js'), 'utf8')
    .replace(/^---\n---\n/, '').split('const repositories =')[0];
  const context = { document: { createElement() {
    return { children: [], classList: { add() {} }, appendChild(child) { this.children.push(child); } };
  } } };
  vm.runInNewContext(frontend, context);
  const cell = context.createSecurityCell({
    html_url: 'https://github.com/owner/example',
    security_alerts: { dependabot: 0, 'code-scanning': 2, 'secret-scanning': null }
  });
  assert.equal(cell.children[0].textContent, 'Dependabot: 0 open');
  assert.equal(cell.children[1].textContent, 'Code scanning: 2 open');
  assert.equal(cell.children[2].textContent, 'Secret scanning: Unavailable');
  assert.equal(cell.children[2].href, 'https://github.com/owner/example/security/secret-scanning');
  assert.equal(context.createSecurityCell({}).textContent, 'Not enabled');
});
