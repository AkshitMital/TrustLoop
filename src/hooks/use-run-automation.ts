import { useAction, useMutation } from 'convex/react'
import { useEffect, useEffectEvent, useRef } from 'react'
import { api } from '../../convex/_generated/api'
import { runExecutionInWorker } from '../workers/evaluator'
import type { RunDetail } from '../types/app'

export function useRunAutomation(detail: RunDetail | null | undefined) {
  const processExecution = useAction(api.orchestrator.processExecution)
  const logEvent = useMutation(api.runs.logEvent)
  const reportRunError = useMutation(api.runs.reportRunError)
  const inFlightKeyRef = useRef<string | null>(null)

  const evaluateCurrentVersion = useEffectEvent(async (snapshot: RunDetail) => {
    if (!snapshot.currentVersion) {
      return
    }

    await logEvent({
      runId: snapshot.run._id,
      stage: 'awaiting_execution',
      source: 'worker',
      versionNumber: snapshot.currentVersion.versionNumber,
      title: 'Browser worker starting execution',
      detail: `Running ${snapshot.currentAttackCases.length} attack cases against version ${snapshot.currentVersion.versionNumber}.`,
      debugData: JSON.stringify(
        {
          codePreview: snapshot.currentVersion.code.slice(0, 240),
          attackTitles: snapshot.currentAttackCases.map((attackCase) => attackCase.title),
        },
        null,
        2,
      ),
      severity: 'info',
    })

    console.info('TrustLoop worker: starting execution', {
      runId: snapshot.run._id,
      versionNumber: snapshot.currentVersion.versionNumber,
      attackCount: snapshot.currentAttackCases.length,
    })

    const execution = await runExecutionInWorker({
      code: snapshot.currentVersion.code,
      attackCases: snapshot.currentAttackCases,
    })

    await logEvent({
      runId: snapshot.run._id,
      stage: 'evaluating',
      source: 'worker',
      versionNumber: snapshot.currentVersion.versionNumber,
      title: 'Browser worker finished execution',
      detail: `Worker returned ${execution.summary.passed} passing, ${execution.summary.failed} failing, and ${execution.summary.errors} errored attack cases.`,
      debugData: JSON.stringify(execution, null, 2),
      severity:
        execution.summary.failed > 0 || execution.summary.errors > 0 ? 'warning' : 'info',
    })

    console.info('TrustLoop worker: execution completed', execution)

    await processExecution({
      runId: snapshot.run._id,
      versionNumber: snapshot.currentVersion.versionNumber,
      execution,
    })

    await logEvent({
      runId: snapshot.run._id,
      stage: 'evaluating',
      source: 'client',
      versionNumber: snapshot.currentVersion.versionNumber,
      title: 'Client submitted execution report',
      detail: 'Execution results were sent to Convex for scoring and persistence.',
      severity: 'info',
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

    void evaluateCurrentVersion(detail).catch(async (error) => {
      inFlightKeyRef.current = null

      const message =
        error instanceof Error ? error.message : 'Unknown browser-side evaluation error.'

      console.error('TrustLoop evaluation failed:', error)

      await logEvent({
        runId: detail.run._id,
        stage: 'error',
        source: 'client',
        versionNumber: detail.currentVersion?.versionNumber,
        title: 'Client caught evaluation failure',
        detail: message,
        severity: 'error',
      })

      await reportRunError({
        runId: detail.run._id,
        stage: 'error',
        title: 'Browser evaluation failed',
        detail: message,
      })
    })
  }, [detail])
}
