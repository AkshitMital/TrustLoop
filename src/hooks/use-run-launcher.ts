import { useAction, useMutation } from 'convex/react'
import { startTransition, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { SourceType } from '../../shared/pipeline'
import type { GitHubRunContext } from '../../shared/github'

interface LaunchRunInput {
  title: string
  sourceType: SourceType
  sourceText: string
  githubContext?: GitHubRunContext
}

export function useRunLauncher() {
  const navigate = useNavigate()
  const createRun = useMutation(api.runs.createRun)
  const logEvent = useMutation(api.runs.logEvent)
  const bootstrapRun = useAction(api.orchestrator.bootstrapRun)
  const [isLaunching, setIsLaunching] = useState(false)

  async function provisionRun(input: LaunchRunInput) {
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
          githubContext: input.githubContext
            ? {
                owner: input.githubContext.owner,
                repo: input.githubContext.repo,
                filePath: input.githubContext.filePath,
                sourceKind: input.githubContext.sourceKind,
              }
            : undefined,
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
      detail:
        'The initial version and attack cases were provisioned, and backend evaluation was queued in Convex.',
      severity: 'info',
    })

    return runId
  }

  async function launchRuns(inputs: LaunchRunInput[]) {
    setIsLaunching(true)

    try {
      const runIds: string[] = []

      for (const input of inputs) {
        const runId = await provisionRun(input)
        runIds.push(runId)
      }

      if (runIds.length === 1) {
        startTransition(() => navigate(`/runs/${runIds[0]}`))
      } else {
        const githubContext = inputs[0]?.githubContext
        startTransition(() =>
          navigate('/', {
            state: {
              batchLaunch: {
                count: runIds.length,
                runIds,
                sourceType: inputs[0]?.sourceType,
                repoLabel: githubContext
                  ? `${githubContext.owner}/${githubContext.repo}`
                  : undefined,
              },
            },
          }),
        )
      }

      return runIds
    } finally {
      setIsLaunching(false)
    }
  }

  async function launchRun(input: LaunchRunInput) {
    const [runId] = await launchRuns([input])
    return runId
  }

  return {
    launchRun,
    launchRuns,
    isLaunching,
  }
}
