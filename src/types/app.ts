import type { Id } from '../../convex/_generated/dataModel'
import type { GitHubRunContext } from '../../shared/github'
import type {
  AttackCategory,
  AttackCaseTemplate,
  CategoryScore,
  PassFail,
  RunStatus,
  Severity,
  SourceType,
} from '../../shared/pipeline'
import type { ProviderSummary } from '../../shared/provider'

export type RunId = Id<'runs'>
export type AttackCaseId = Id<'attackCases'>

export interface RunDoc {
  _id: RunId
  _creationTime: number
  title: string
  sourceType: SourceType
  sourceText: string
  githubContext?: GitHubRunContext
  language: 'ts'
  status: RunStatus
  currentVersionNumber: number
  latestVersionNumber?: number
  currentScore: number
  passFail: PassFail
  createdAt: number
  updatedAt: number
}

export interface RunListItem extends RunDoc {
  provider: ProviderSummary
}

export interface RunVersionDoc {
  _id: string
  _creationTime: number
  runId: RunId
  versionNumber: number
  role: 'maker_initial' | 'maker_patch'
  code: string
  changeSummary: string
  createdAt: number
}

export interface AttackCaseDoc extends AttackCaseTemplate {
  _id: AttackCaseId
  _creationTime: number
  runId: RunId
  versionNumber: number
  result: 'pass' | 'fail' | 'error' | 'not_run'
  evidence?: string
  createdAt: number
}

export interface FailureDoc {
  title: string
  severity: Severity
  category: AttackCategory
  detail: string
}

export interface EvidenceDoc {
  label: string
  detail: string
}

export interface EvalResultDoc {
  _id: string
  _creationTime: number
  runId: RunId
  versionNumber: number
  mode: 'executed' | 'analysis_only'
  correctnessScore: number
  robustnessScore: number
  securityScore: number
  performanceScore: number
  codeQualityScore: number
  overallScore: number
  summary: string
  detectedFailures: FailureDoc[]
  evidence: EvidenceDoc[]
  breakdown: {
    correctness: CategoryScore
    robustness: CategoryScore
    security: CategoryScore
    performance: CategoryScore
    codeQuality: CategoryScore
  }
  createdAt: number
}

export interface FixSuggestionDoc {
  _id: string
  _creationTime: number
  runId: RunId
  fromVersionNumber: number
  toVersionNumber: number
  issueSummary: string
  suggestion: string
  patchedCode: string
  createdAt: number
}

export interface RunEventDoc {
  _id: string
  _creationTime: number
  runId: RunId
  stage: string
  source?: 'client' | 'worker' | 'orchestrator' | 'maker' | 'red_team' | 'eval_engine' | 'system'
  versionNumber?: number
  title: string
  detail: string
  debugData?: string
  severity: 'info' | 'warning' | 'error'
  createdAt: number
}

export interface RunDetail {
  run: RunDoc
  provider: ProviderSummary
  versions: RunVersionDoc[]
  currentVersion: RunVersionDoc | null
  attackCases: AttackCaseDoc[]
  currentAttackCases: AttackCaseDoc[]
  evalResults: EvalResultDoc[]
  currentEval: EvalResultDoc | null
  previousEval: EvalResultDoc | null
  fixSuggestions: FixSuggestionDoc[]
  events: RunEventDoc[]
}
