import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { URL, fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const docs = 'TempFile/文档资料'
const managedDocuments = [
  'AGENTS.md',
  'README.md',
  '.github/copilot-instructions.md',
  '.github/skills/dev-progress/SKILL.md',
  `${docs}/knowledge-index.md`,
  `${docs}/project-status.md`,
  `${docs}/dev-lessons.md`,
  `${docs}/other/灵月项目开发指南 .md`,
  `${docs}/记忆系统/memory-system-design.md`,
  `${docs}/记忆系统/local-folder-agent-development-guide.md`,
  `${docs}/记忆系统/memory-system-technical-architecture-GPT-5.md`,
  `${docs}/记忆系统/memory-system-technical-architecture-Opus.md`,
  'TempFile/demo/DEV_GUIDE.md',
  'TempFile/demo/灵月记忆系统/memory-system-design.md',
  'TempFile/demo/灵月记忆系统/memory-system-technical-architecture-GPT-5.md',
  'doc/记忆系统设计说明.md',
  'doc/VSCode智能体设计文档.md',
  'doc/小组件/组件模块通用设计.md',
]

function localLinks(markdown) {
  // The maintained guides use inline links; ignore examples and external URLs.
  const prose = markdown.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '')
  return [...prose.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)]
    .map((match) => match[1].trim().replace(/\s+"[^"]*"$/, '').replace(/^<(.+)>$/, '$1'))
    .filter((href) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href))
    .map((href) => decodeURIComponent(href.split(/[?#]/)[0]))
    .filter(Boolean)
}

function logEntries(markdown) {
  return markdown.match(/^## \[\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?\] .+/gm) ?? []
}

async function logFiles() {
  const names = await readdir(join(root, docs, 'archive'))
  return [
    `${docs}/dev-log.md`,
    ...names.filter((name) => /^dev-log-\d{4}-\d{2}\.md$/.test(name)).map((name) => `${docs}/archive/${name}`),
  ]
}

test('documentation link checks ignore fenced examples and external URLs', () => {
  const sample = [
    '[guide](guide%20name.md#section)',
    '[source](../src/main.ts "Source")',
    '[site](https://example.com)',
    '[section](#section)',
    '```markdown',
    '[example](does-not-exist.md)',
    '```',
  ].join('\n')
  assert.deepEqual(localLinks(sample), ['guide name.md', '../src/main.ts'])
})

test('maintained documentation links resolve within the repository', async () => {
  const failures = []
  for (const file of [...managedDocuments, ...(await logFiles())]) {
    const markdown = await readFile(join(root, file), 'utf8')
    for (const link of localLinks(markdown)) {
      const target = resolve(root, dirname(file), link)
      const fromRoot = relative(root, target)
      if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
        failures.push(`${file}: link leaves repository: ${link}`)
        continue
      }
      try {
        await access(target)
      } catch {
        failures.push(`${file}: missing link target: ${link}`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('documented npm script names exist in package.json', async () => {
  const { scripts } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  for (const file of managedDocuments.slice(0, 8)) {
    const markdown = await readFile(join(root, file), 'utf8')
    const commands = markdown.matchAll(/\bnpm(?:\.cmd)?\s+(?:run\s+([\w:-]+)|(test|start)\b)/g)
    for (const command of commands) {
      const name = command[1] ?? command[2]
      assert.ok(Object.hasOwn(scripts, name), `${file}: unknown npm script ${name}`)
    }
  }
})

test('standard validation still includes typecheck, read-only lint and unit contracts', async () => {
  const { scripts } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const visited = new Set()
  function visit(name) {
    if (visited.has(name)) return
    visited.add(name)
    for (const match of scripts[name].matchAll(/\bnpm run ([\w:-]+)/g)) visit(match[1])
  }
  visit('test')
  for (const name of ['typecheck', 'lint:check', 'test:unit']) assert.ok(visited.has(name), `Missing ${name} in npm test`)
  assert.ok(!visited.has('lint'), 'Standard validation must not invoke auto-fix lint')
})

test('Copilot and progress skill route back to the canonical root rules', async () => {
  for (const file of ['.github/copilot-instructions.md', '.github/skills/dev-progress/SKILL.md']) {
    const markdown = await readFile(join(root, file), 'utf8')
    const targets = localLinks(markdown).map((link) => resolve(root, dirname(file), link))
    assert.ok(targets.includes(resolve(root, 'AGENTS.md')), `${file}: missing canonical rules link`)
  }
})

test('event titles are unique across recent logs and correctly filed monthly archives', async () => {
  const seen = new Set()
  const recent = await readFile(join(root, docs, 'dev-log.md'), 'utf8')
  const indexed = new Set(localLinks(recent).map((link) => resolve(root, docs, link)))
  for (const file of await logFiles()) {
    const markdown = await readFile(join(root, file), 'utf8')
    const entries = logEntries(markdown)
    assert.ok(entries.length > 0, `${file}: no dated events found`)
    const month = /dev-log-(\d{4}-\d{2})\.md$/.exec(file)?.[1]
    if (month) assert.ok(indexed.has(resolve(root, file)), `${file}: archive missing from recent log index`)
    for (const title of entries) {
      const normalized = title.trim()
      assert.ok(!seen.has(normalized), `Duplicate event: ${normalized}`)
      seen.add(normalized)
      if (month) assert.ok(normalized.startsWith(`## [${month}-`), `${file}: event stored under the wrong month`)
    }
  }
})

test('reusable lessons have unique stable identifiers', async () => {
  const markdown = await readFile(join(root, docs, 'dev-lessons.md'), 'utf8')
  const ids = [...markdown.matchAll(/^## (L\d+)\s/gm)].map((match) => match[1])
  assert.ok(ids.length > 0)
  assert.equal(new Set(ids).size, ids.length)
})

test('delivery requests include remote handoff while explicit local limits still win', async () => {
  const rules = await readFile(join(root, 'AGENTS.md'), 'utf8')
  const progress = await readFile(join(root, '.github/skills/dev-progress/SKILL.md'), 'utf8')
  assert.match(rules, /用户要求“提交”[^\n]*commit \+ git push/)
  assert.match(rules, /用户要求“打包”[^\n]*GitHub Release[^\n]*完整更新资产发布/)
  assert.match(rules, /“仅本地”“不要推送”“不要发布”“不要提交”[^\n]*优先/)
  assert.match(rules, /要求记住以后的规则[^\n]*不立即触发/)
  assert.match(rules, /不能擅自合并到 main、force push/)
  assert.match(rules, /\.blockmap[^\n]*latest\.yml/)
  assert.match(rules, /已发布同一版本不得静默覆盖/)
  assert.match(progress, /git ls-remote/)
  assert.match(progress, /更新源能发现它/)
  for (const text of [rules, progress]) {
    assert.doesNotMatch(text, /git push[^\n]*必须由用户明确要求或单独确认/)
    assert.doesNotMatch(text, /不包含 push \/ 上传 \/ 发布/)
    assert.doesNotMatch(text, /不隐含 push 或发布授权/)
  }
})
