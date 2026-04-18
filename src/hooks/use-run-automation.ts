import { useAction } from 'convex/react'
import { useEffect, useEffectEvent, useRef } from 'react'
import { api } from '../../convex/_generated/api'
import { runExecutionInWorker } from '../workers/evaluator'
import type { RunDetail } from '../types/app'

export function useRunAutomation(detail: RunDetail | null | undefined) {
  const processExecution = useAction(api.orchestrator.processExecution)
  const inFlightKeyRef = useRef<string | null>(null)

  const evaluateCurrentVersion = useEffectEvent(async (snapshot: RunDetail) => {
    if (!snapshot.currentVersion) {
      return
    }

    const execution = await runExecutionInWorker({
      code: snapshot.currentVersion.code,
      attackCases: snapshot.currentAttackCases,
    })

    await processExecution({
      runId: snapshot.run._id,
      versionNumber: snapshot.currentVersion.versionNumber,
      execution,
    })
  })

  useEffect(() => {
    if (!detail || !detail.currentVersion) {
      return
    }

    if (detail.run.status !== 'awaiting_execution' || detail.currentEval) {
      return
    }

    const key = `${detail.run._id}:${detail.currentVersion.versionNumber}`
    if (inFlightKeyRef.current === key) {
      return
    }

    inFlightKeyRef.current = key

    void evaluateCurrentVersion(detail).catch(() => {
      inFlightKeyRef.current = null
    })
  }, [detail])
}
