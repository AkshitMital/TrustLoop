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
  const bootstrapRun = useAction(api.orchestrator.bootstrapRun)
  const [isLaunching, setIsLaunching] = useState(false)

  async function launchRun(input: LaunchRunInput) {
    setIsLaunching(true)

    try {
      const runId = await createRun(input)
      await bootstrapRun({ runId })
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
