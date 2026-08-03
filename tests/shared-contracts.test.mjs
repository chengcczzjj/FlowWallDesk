import test from 'node:test'
import assert from 'node:assert/strict'

import { isTrustedRendererAssetOrigin, toAssetUrl, toRendererPublicUrl } from '../src/shared/asset-url.ts'
import { isGeneratedWidgetDefinition } from '../src/shared/generated-widget.ts'
import { DEFAULT_WIDGET_SIZE_BY_TYPE, WIDGET_TYPES } from '../src/shared/desktop-scene.ts'
import { TOOL_MANIFEST, getToolManifest } from '../src/shared/tool-manifest.ts'
import { approvalMatchesRequest } from '../src/shared/approval-scope.ts'
import { automationStatusFromChat } from '../src/shared/agent-runtime.ts'
import { rectCoversDisplay, StableBooleanTransition } from '../src/shared/desktop-occlusion.ts'
import { CanvasPointerGate } from '../src/shared/canvas-pointer-gate.ts'

test('asset URLs preserve Windows paths and packaged public assets', () => {
  assert.equal(
    toAssetUrl('G:\\壁纸\\a b.jpg'),
    'lyasset://local/G%3A/%E5%A3%81%E7%BA%B8/a%20b.jpg',
  )

  const originalLocation = globalThis.location
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { href: 'file:///C:/Lingyue/resources/app.asar/out/renderer/main-ui/index.html' },
  })
  assert.equal(
    toRendererPublicUrl('/audio/Water.WAV'),
    'file:///C:/Lingyue/resources/app.asar/out/renderer/audio/Water.WAV',
  )
  Object.defineProperty(globalThis, 'location', { configurable: true, value: originalLocation })
})

test('asset CORS is limited to packaged and local development renderers', () => {
  assert.equal(isTrustedRendererAssetOrigin('null'), true)
  assert.equal(isTrustedRendererAssetOrigin('file://'), true)
  assert.equal(isTrustedRendererAssetOrigin('http://localhost:5174'), true)
  assert.equal(isTrustedRendererAssetOrigin('http://127.0.0.1:5174'), true)
  assert.equal(isTrustedRendererAssetOrigin('https://example.com'), false)
  assert.equal(isTrustedRendererAssetOrigin(null), false)
})

test('generated widgets use a validated declarative contract', () => {
  const valid = {
    version: 1,
    name: 'reading-plan',
    title: '阅读计划',
    theme: 'glass',
    accent: '#ffb86b',
    blocks: [{
      type: 'list',
      interactive: true,
      items: [{ id: 'book-1', text: '读完第一章', done: false }],
    }],
  }
  assert.equal(isGeneratedWidgetDefinition(valid), true)
  assert.equal(isGeneratedWidgetDefinition({ ...valid, blocks: [{ type: 'list', items: [{ text: 'missing id' }] }] }), false)
  assert.equal(isGeneratedWidgetDefinition({ ...valid, blocks: [{ type: 'script', code: 'alert(1)' }] }), false)
  assert.ok(WIDGET_TYPES.includes('generated-widget'))
  assert.ok(DEFAULT_WIDGET_SIZE_BY_TYPE['generated-widget'].width > 0)
})

test('tool manifest is unique and owns generated-widget routing metadata', () => {
  const names = TOOL_MANIFEST.map((entry) => entry.name)
  assert.equal(new Set(names).size, names.length)
  assert.ok(TOOL_MANIFEST.every((entry) => entry.label && entry.compactLabel))
  assert.deepEqual(
    getToolManifest('create_generated_widget'),
    {
      name: 'create_generated_widget',
      category: 'widget',
      risk: 'low',
      cacheable: false,
      tracksAgentRun: false,
      label: '生成桌面组件',
      compactLabel: '组件',
    },
  )
})

test('approval scope cannot cross workspace, command, tool, or path boundaries', () => {
  const approval = {
    workspaceId: 'workspace-a',
    toolName: 'run_command',
    action: '运行命令',
    affectedPaths: ['src\\app.ts'],
    command: 'npm test',
  }
  assert.equal(approvalMatchesRequest(approval, {
    workspaceId: 'workspace-a', toolName: 'run_command', action: '运行命令', affectedPaths: ['src/app.ts'], command: 'npm test',
  }), true)
  assert.equal(approvalMatchesRequest(approval, {
    workspaceId: 'workspace-b', toolName: 'run_command', action: '运行命令', affectedPaths: ['src/app.ts'], command: 'npm test',
  }), false)
  assert.equal(approvalMatchesRequest(approval, {
    workspaceId: 'workspace-a', toolName: 'run_command', action: '运行命令', affectedPaths: ['src/other.ts'], command: 'npm test',
  }), false)
  assert.equal(approvalMatchesRequest(approval, {
    workspaceId: 'workspace-a', toolName: 'run_command', action: '运行命令', affectedPaths: ['src/app.ts'], command: 'npm run build',
  }), false)
})

test('automations never report approval waits or failures as completed', () => {
  assert.deepEqual(automationStatusFromChat('completed'), { status: 'completed' })
  assert.deepEqual(automationStatusFromChat('cancelled'), { status: 'cancelled' })
  assert.equal(automationStatusFromChat('failed').status, 'failed')
  assert.equal(automationStatusFromChat('waiting-approval').status, 'failed')
})

test('desktop occlusion only commits stable coverage of the primary display', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1080 }
  assert.equal(rectCoversDisplay({ left: 0, top: 0, right: 1920, bottom: 1080 }, primary), true)
  assert.equal(rectCoversDisplay({ left: 1920, top: 0, right: 3840, bottom: 1080 }, primary), false)
  assert.equal(rectCoversDisplay({ left: 0, top: 0, right: 1920, bottom: 1040 }, primary), false)

  const transition = new StableBooleanTransition(false, 2)
  assert.equal(transition.sample(true), null)
  assert.equal(transition.sample(false), null)
  assert.equal(transition.sample(true), null)
  assert.equal(transition.sample(true), true)
  assert.equal(transition.value, true)
  assert.equal(transition.sample(false), null)
  assert.equal(transition.sample(false), false)
  assert.equal(transition.value, false)
})

test('canvas mouse passthrough stays locked until an active pointer gesture ends', () => {
  const gate = new CanvasPointerGate()
  assert.equal(gate.shouldIgnoreMouse(false, false), true)
  assert.equal(gate.shouldIgnoreMouse(true, false), false)

  gate.begin(7)
  assert.equal(gate.shouldIgnoreMouse(false, false), false)
  gate.end(7)
  assert.equal(gate.shouldIgnoreMouse(false, false), true)

  gate.begin(8)
  gate.reset()
  assert.equal(gate.shouldIgnoreMouse(false, false), true)
  assert.equal(gate.shouldIgnoreMouse(false, true), false)
})
