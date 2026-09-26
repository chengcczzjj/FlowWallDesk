import { useEffect, useState } from 'react'
import { ShieldQuestion } from 'lucide-react'
import type { ActionConfirmDecision, ActionConfirmRequest } from '@shared/agent-actions'
import './chat-shared.css'

/**
 * The companion paused a desktop action (open an app, take a screenshot,
 * delete the Dock...) and waits here for the user's answer.
 */
export function ActionConfirmCard({
  request,
  onResolve,
  compact = false,
}: {
  request: ActionConfirmRequest
  onResolve: (request: ActionConfirmRequest, decision: ActionConfirmDecision) => void
  compact?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const secondsLeft = Math.max(0, Math.ceil((request.expiresAt - now) / 1000))

  return (
    <div className={`ly-confirm ly-confirm--${request.risk} ${compact ? 'ly-confirm--compact' : ''}`} role="dialog" aria-label="操作确认">
      <div className="ly-confirm__head">
        <ShieldQuestion size={16} />
        <div className="ly-confirm__title">{request.title}</div>
      </div>
      {request.detail && <div className="ly-confirm__detail">{request.detail}</div>}
      <div className="ly-confirm__actions">
        <span className="ly-confirm__timer">{secondsLeft > 0 ? `${secondsLeft}s 后自动取消` : '已超时'}</span>
        <button type="button" onClick={() => onResolve(request, 'deny')}>不用了</button>
        {request.rememberKey && (
          <button type="button" onClick={() => onResolve(request, 'allow-always')}>以后都直接做</button>
        )}
        <button type="button" className="ly-confirm__primary" onClick={() => onResolve(request, 'allow')} autoFocus>好的</button>
      </div>
    </div>
  )
}
