import { useState } from 'react'
import { Check, Loader2, Undo2 } from 'lucide-react'
import type { ActionReceipt } from '@shared/tool-result'
import './chat-shared.css'

type ReceiptState = { status: 'idle' | 'undoing' | 'undone' | 'error'; message?: string }

/** Desktop changes of one reply, each with a one-click undo. */
export function ActionReceipts({
  receipts,
  onUndo,
}: {
  receipts: ActionReceipt[]
  onUndo: (id: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [states, setStates] = useState<Record<string, ReceiptState>>({})
  if (receipts.length === 0) return null

  const undo = async (id: string) => {
    setStates((prev) => ({ ...prev, [id]: { status: 'undoing' } }))
    try {
      const result = await onUndo(id)
      setStates((prev) => ({ ...prev, [id]: result.ok ? { status: 'undone' } : { status: 'error', message: result.error } }))
    } catch (error) {
      setStates((prev) => ({ ...prev, [id]: { status: 'error', message: (error as Error).message } }))
    }
  }

  return (
    <div className="ly-receipts">
      {receipts.map((receipt) => {
        const state = states[receipt.id] ?? { status: 'idle' }
        return (
          <div key={receipt.id} className={`ly-receipt ly-receipt--${state.status}`} title={state.message}>
            <Check size={12} className="ly-receipt__icon" />
            <span className="ly-receipt__text">{state.status === 'undone' ? `已撤回：${receipt.summary}` : receipt.summary}</span>
            {receipt.undoable && state.status !== 'undone' && (
              <button type="button" className="ly-receipt__undo" disabled={state.status === 'undoing'} onClick={() => void undo(receipt.id)}>
                {state.status === 'undoing' ? <Loader2 size={11} className="ly-spin" /> : <Undo2 size={11} />}
                撤回
              </button>
            )}
            {state.status === 'error' && <span className="ly-receipt__error">{state.message ?? '没撤回成功'}</span>}
          </div>
        )
      })}
    </div>
  )
}
