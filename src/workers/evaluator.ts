import type { ExecutionReport } from '../../shared/pipeline'
import type { AttackCaseDoc } from '../types/app'

interface WorkerPayload {
  code: string
  attackCases: AttackCaseDoc[]
}

export function runExecutionInWorker(payload: WorkerPayload) {
  return new Promise<ExecutionReport>((resolve, reject) => {
    const worker = new Worker(new URL('./evaluator.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<ExecutionReport>) => {
      resolve(event.data)
      worker.terminate()
    }

    worker.onerror = (event) => {
      reject(event.error ?? new Error('Worker execution failed.'))
      worker.terminate()
    }

    worker.postMessage(payload)
  })
}
