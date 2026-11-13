const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const frontend = readFileSync(require.resolve('../assets/js/dashboard.js'), 'utf8')
  .replace(/^---\n---\n/, '');

async function render(securityAlerts) {
  function element(tag) {
    return { tag, children: [], style: {}, dataset: {}, classList: { add() {} },
      appendChild(child) { this.children.push(child); } };
  }
  const elements = Object.fromEntries(
    ['repositories', 'repository-data', 'loading', 'security-alerts-heading']
      .map(id => [id, element('div')])
  );
  const repository = {
    name: 'example', owner: 'owner', html_url: 'https://github.com/owner/example',
    pull_requests: 1, issues: 2, latest_release: 'v1', latest_draft_release: 'v2',
    latest_commit_conclusion: '', security_alerts: securityAlerts
  };
  let request;
  const errors = [];
  vm.runInNewContext(frontend, {
    document: { createElement: element, getElementById: id => elements[id] },
    window: { location: { origin: 'https://dashboard.example' } }, URL,
    console: { error(error) { errors.push(error); } },
    fetch() {
      request = Promise.resolve({ ok: true, json: () => [repository] });
      return request;
    }
  });
  // Allow the fetch, JSON, and rendering promise callbacks to finish.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  return elements;
}

for (const enabled of [false, true]) {
  test(`security column and source heading align when alerts are ${enabled ? 'enabled' : 'disabled'}`, async () => {
    const elements = await render(enabled ? { dependabot: 0, 'code-scanning': 1, 'secret-scanning': null } : null);
    assert.equal(elements['security-alerts-heading'].hidden, !enabled);
    const [sourceRow, repositoryRow] = elements['repository-data'].children;
    assert.equal(sourceRow.children[0].colSpan, enabled ? 5 : 4);
    assert.equal(repositoryRow.children.length, enabled ? 5 : 4);
  });
}

test('all rendered dashboard links open in a new tab', async () => {
  const elements = await render({ dependabot: 0, 'code-scanning': 1, 'secret-scanning': 2 });
  const links = [];
  function walk(node) {
    if (node.tag === 'a') links.push(node);
    node.children.forEach(walk);
  }
  walk(elements['repository-data']);
  assert.equal(links.length, 9); // Owner, repository, PRs, issues, two releases, three scanners.
  for (const link of links) {
    assert.equal(link.target, '_blank', link.href);
    assert.equal(link.rel, 'noreferrer', link.href);
  }
});
