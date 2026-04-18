import { useAction, useMutation } from 'convex/react'
import { startTransition, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { SourceType } from '../../shared/pipeline'

interface LaunchRunInput {
  title: string
  sourceType: SourceType
  sourceText: string
}

export function useRunLauncher() {
  const navigate = useNavigate()
  const createRun = useMutation(api.runs.createRun)
  const logEvent = useMutation(api.runs.logEvent)
  const bootstrapRun = useAction(api.orchestrator.bootstrapRun)
  const [isLaunching, setIsLaunching] = useState(false)

  async function launchRun(input: LaunchRunInput) {
    setIsLaunching(true)

    try {
      const runId = await createRun(input)
      console.info('TrustLoop launchRun: created run', { runId, input })

      await logEvent({
        runId,
        stage: 'queued',
        source: 'client',
        title: 'Client requested orchestration',
        detail: `Launching a ${input.sourceType} run from the browser.`,
        debugData: JSON.stringify(
          {
            title: input.title,
            sourceType: input.sourceType,
            sourceTextPreview: input.sourceText.slice(0, 180),
          },
          null,
          2,
        ),
        severity: 'info',
      })

      await bootstrapRun({ runId })
      console.info('TrustLoop launchRun: bootstrap completed', { runId })

      await logEvent({
        runId,
        stage: 'generating',
        source: 'client',
        versionNumber: 1,
        title: 'Client received bootstrap response',
        detail: 'The initial version and attack cases were provisioned in Convex.',
        severity: 'info',
      })

      startTransition(() => navigate(`/runs/${runId}`))
      return runId
    } finally {
      setIsLaunching(false)
    }
  }

  return {
    launchRun,
    isLaunching,
  }
}
