"use node";

import { v } from 'convex/values'
import { internal } from './_generated/api.js'
import { action, internalAction, type ActionCtx } from './_generated/server.js'
import type { Id } from './_generated/dataModel.js'
import {
  MAX_VERSION_NUMBER,
  buildInitialArtifacts,
  buildPatchedArtifacts,
  derivePassFailFromEvaluation,
  ensureExported,
  inferScenarioFromText,
  pickBestEvaluation,
  scoreExecution,
  type ExecutionReport,
} from '../shared/pipeline.js'
import {
  generateMakerDraftWithOpenAI,
  generateMakerRepairWithOpenAI,
  generateRedTeamCasesWithOpenAI,
  hasOpenAIConfig,
} from './openai.js'
import { executeCodeInNode } from './execution.js'

const executionReportValidator = v.object({
  mode: v.union(v.literal('executed'), v.literal('analysis_only')),
  entryPoint: v.optional(v.string()),
  notes: v.array(v.string()),
  attackResults: v.array(
    v.object({
      attackCaseId: v.id('attackCases'),
      title: v.string(),
      category: v.union(
        v.literal('null_undefined'),
        v.literal('empty_input'),
        v.literal('malformed_payload'),
        v.literal('large_payload'),
        v.literal('boundary_condition'),
        v.literal('type_mismatch'),
        v.literal('injection_like'),
        v.literal('repeated_calls'),
        v.literal('logical_edge'),
        v.literal('performance_sensitive'),
      ),
      severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
      result: v.union(v.literal('pass'), v.literal('fail'), v.literal('error')),
      durationMs: v.number(),
      outputSummary: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
  ),
  summary: v.object({
    total: v.number(),
    passed: v.number(),
    failed: v.number(),
    errors: v.number(),
    averageDurationMs: v.number(),
  }),
})

type BootstrapRunResult = {
  versionNumber: number
  caseCount?: number
}

type ProcessExecutionResult =
  | {
      status: 'awaiting_execution'
      versionNumber: number
    }
  | {
      status: 'completed'
      versionNumber: number
      overallScore: number
      passFail: 'pass' | 'fail'
    }

function normalizeCodeFingerprint(code: string) {
  return code.replace(/\s+/g, ' ').trim()
}

function codesAreEquivalent(left: string, right: string) {
  return normalizeCodeFingerprint(left) === normalizeCodeFingerprint(right)
}

async function queueVersionExecution(
  ctx: ActionCtx,
  runId: Id<'runs'>,
  versionNumber: number,
) {
  await ctx.scheduler.runAfter(0, internal.orchestrator.executeVersion, {
    runId,
    versionNumber,
  })

  await ctx.runMutation(internal.runs.appendEvent, {
    runId,
    stage: 'awaiting_execution',
    source: 'system',
    versionNumber,
    title: `Queued backend evaluation for version ${versionNumber}`,
    detail: 'Convex scheduled the backend evaluator to continue the loop automatically.',
    severity: 'info',
  })
}

async function finalizeRun(
  ctx: ActionCtx,
  args: {
    runId: Id<'runs'>
    latestVersionNumber: number
    reason: 'pass' | 'cap' | 'converged'
  },
) {
  const evaluations = await ctx.runQuery(internal.runs.listRunEvaluations, {
    runId: args.runId,
  })
  const bestEvaluation = pickBestEvaluation(evaluations)

  if (!bestEvaluation) {
    throw new Error('No evaluations were available to finalize this run.')
  }

  const finalPassFail = derivePassFailFromEvaluation(bestEvaluation)
  const isBestLatest = bestEvaluation.versionNumber === args.latestVersionNumber

  await ctx.runMutation(internal.runs.completeRun, {
    runId: args.runId,
    passFail: finalPassFail,
    currentScore: bestEvaluation.overallScore,
    currentVersionNumber: bestEvaluation.versionNumber,
  })

  const title =
    args.reason === 'pass'
      ? 'Run completed with a passing score'
      : args.reason === 'converged'
        ? 'Run completed after the repair loop converged'
        : 'Run completed after reaching the iteration cap'
  const detail =
    args.reason === 'pass'
      ? `Final score ${bestEvaluation.overallScore} on version ${bestEvaluation.versionNumber}.`
      : isBestLatest
        ? `Best score ${bestEvaluation.overallScore} came from version ${bestEvaluation.versionNumber}. The loop stopped after ${args.latestVersionNumber} iterations.`
        : `Best score ${bestEvaluation.overallScore} came from version ${bestEvaluation.versionNumber}, while the loop stopped after version ${args.latestVersionNumber}.`

  await ctx.runMutation(internal.runs.appendEvent, {
    runId: args.runId,
    stage: 'completed',
    source: 'system',
    versionNumber: args.latestVersionNumber,
    title,
    detail,
    debugData: JSON.stringify(
      {
        latestVersionNumber: args.latestVersionNumber,
        bestVersionNumber: bestEvaluation.versionNumber,
        bestScore: bestEvaluation.overallScore,
        finalPassFail,
        reason: args.reason,
      },
      null,
      2,
    ),
    severity: finalPassFail === 'pass' ? 'info' : 'warning',
  })

  return {
    status: 'completed' as const,
    versionNumber: bestEvaluation.versionNumber,
    overallScore: bestEvaluation.overallScore,
    passFail: finalPassFail,
  }
}

async function processExecutionResult(
  ctx: ActionCtx,
  args: {
    runId: Id<'runs'>
    versionNumber: number
    execution: ExecutionReport
    sourceLabel: string
  },
): Promise<ProcessExecutionResult> {
  const context = await ctx.runQuery(internal.runs.getExecutionContext, {
    runId: args.runId,
    versionNumber: args.versionNumber,
  })

  if (!context) {
    throw new Error('Execution context not found.')
  }

  await ctx.runMutation(internal.runs.setRunStatus, {
    runId: args.runId,
    status: 'evaluating',
  })

  await ctx.runMutation(internal.runs.appendEvent, {
    runId: args.runId,
    stage: 'evaluating',
    source: 'eval_engine',
    versionNumber: args.versionNumber,
    title: `Evaluating version ${args.versionNumber}`,
    detail: `${args.sourceLabel} submitted ${args.execution.summary.total} attack results in ${args.execution.mode.replaceAll('_', ' ')} mode.`,
    debugData: JSON.stringify(
      {
        mode: args.execution.mode,
        entryPoint: args.execution.entryPoint,
        summary: args.execution.summary,
        notes: args.execution.notes,
      },
      null,
      2,
    ),
    severity: 'info',
  })

  const evaluation = scoreExecution(
    context.version.code,
    args.execution,
  )

  await ctx.runMutation(internal.runs.saveEvaluation, {
    runId: args.runId,
    versionNumber: args.versionNumber,
    mode: args.execution.mode,
    correctnessScore: evaluation.correctnessScore,
    robustnessScore: evaluation.robustnessScore,
    securityScore: evaluation.securityScore,
    performanceScore: evaluation.performanceScore,
    codeQualityScore: evaluation.codeQualityScore,
    overallScore: evaluation.overallScore,
    summary: evaluation.summary,
    detectedFailures: evaluation.detectedFailures,
    evidence: evaluation.evidence,
    breakdown: {
      correctness: evaluation.perCategory.correctness,
      robustness: evaluation.perCategory.robustness,
      security: evaluation.perCategory.security,
      performance: evaluation.perCategory.performance,
      codeQuality: evaluation.perCategory.codeQuality,
    },
    attackResults: args.execution.attackResults.map((result) => ({
      attackCaseId: result.attackCaseId,
      result: result.result,
      durationMs: result.durationMs,
      outputSummary: result.outputSummary,
      errorMessage: result.errorMessage,
    })),
  })

  await ctx.runMutation(internal.runs.appendEvent, {
    runId: args.runId,
    stage: 'evaluating',
    source: 'eval_engine',
    versionNumber: args.versionNumber,
    title: `Version ${args.versionNumber} scored ${evaluation.overallScore}`,
    detail: evaluation.summary,
    debugData: JSON.stringify(
      {
        overallScore: evaluation.overallScore,
        passFail: evaluation.passFail,
        detectedFailures: evaluation.detectedFailures.map((failure) => ({
          title: failure.title,
          severity: failure.severity,
          category: failure.category,
        })),
      },
      null,
      2,
    ),
    severity: evaluation.passFail === 'pass' ? 'info' : 'warning',
  })

  if (evaluation.passFail === 'pass') {
    return await finalizeRun(ctx, {
      runId: args.runId,
      latestVersionNumber: args.versionNumber,
      reason: 'pass',
    })
  }

  if (args.versionNumber >= MAX_VERSION_NUMBER) {
    return await finalizeRun(ctx, {
      runId: args.runId,
      latestVersionNumber: args.versionNumber,
      reason: 'cap',
    })
  }

  await ctx.runMutation(internal.runs.setRunStatus, {
    runId: args.runId,
    status: 'repairing',
  })

  const nextVersionNumber = args.versionNumber + 1
  const scenario = inferScenarioFromText(
    `${context.run.title}\n${context.run.sourceText}\n${context.version.code}`,
  )
  const deterministicPatch = buildPatchedArtifacts(
    scenario,
    context.version.code,
    evaluation.detectedFailures,
    nextVersionNumber,
  )
  let patch = deterministicPatch
  let repairMode: 'openai' | 'deterministic' =
    context.run.sourceType === 'demo' ? 'deterministic' : 'openai'
  let repairModel: string | null = null
  let repairFallbackReason: string | null = null
  let redTeamMode: 'openai' | 'deterministic' =
    context.run.sourceType === 'demo' ? 'deterministic' : 'openai'
  let redTeamModel: string | null = null
  let redTeamFallbackReason: string | null = null
  let redTeamSummary =
    'The patched version is ready for backend execution in the next loop turn.'

  if (hasOpenAIConfig() && context.run.sourceType !== 'demo') {
    try {
      const makerRepair = await generateMakerRepairWithOpenAI({
        title: context.run.title,
        sourceText: context.run.sourceText,
        code: context.version.code,
        failures: evaluation.detectedFailures,
        targetVersionNumber: nextVersionNumber,
      })

      patch = {
        code: makerRepair.code,
        changeSummary: makerRepair.changeSummary,
        issueSummary: makerRepair.issueSummary,
        suggestion: makerRepair.suggestion,
        cases: deterministicPatch.cases,
      }
      repairMode = 'openai'
      repairModel = makerRepair.model

      try {
        const redTeam = await generateRedTeamCasesWithOpenAI({
          title: context.run.title,
          sourceType: context.run.sourceType,
          sourceText: context.run.sourceText,
          code: makerRepair.code,
        })

        patch = {
          ...patch,
          cases: redTeam.cases,
        }
        redTeamMode = 'openai'
        redTeamModel = redTeam.model
        redTeamSummary = redTeam.summary
      } catch (error) {
        redTeamMode = 'deterministic'
        redTeamFallbackReason =
          error instanceof Error
            ? error.message
            : 'Unknown OpenAI Red Team repair error.'
        redTeamSummary =
          'The Maker patch came from OpenAI, but the attack pack fell back to deterministic cases for this iteration.'
      }
    } catch (error) {
      patch = deterministicPatch
      repairMode = 'deterministic'
      redTeamMode = 'deterministic'
      repairFallbackReason =
        error instanceof Error
          ? error.message
          : 'Unknown OpenAI repair error.'
    }
  } else {
    repairMode = 'deterministic'
    redTeamMode = 'deterministic'
  }

  if (repairFallbackReason) {
    await ctx.runMutation(internal.runs.appendEvent, {
      runId: args.runId,
      stage: 'repairing',
      source: 'system',
      versionNumber: nextVersionNumber,
      title: 'OpenAI repair fallback',
      detail: 'The run fell back to deterministic repair logic for this iteration.',
      debugData: JSON.stringify(
        {
          reason: repairFallbackReason,
        },
        null,
        2,
      ),
      severity: 'warning',
    })
  }

  if (redTeamFallbackReason) {
    await ctx.runMutation(internal.runs.appendEvent, {
      runId: args.runId,
      stage: 'attacking',
      source: 'system',
      versionNumber: nextVersionNumber,
      title: 'OpenAI Red Team fallback',
      detail:
        'The Maker patch stayed on the OpenAI path, but attack-case generation fell back to deterministic cases for this iteration.',
      debugData: JSON.stringify(
        {
          reason: redTeamFallbackReason,
          repairMode,
          repairModel,
        },
        null,
        2,
      ),
      severity: 'warning',
    })
  } else if (context.run.sourceType !== 'demo' && !hasOpenAIConfig()) {
    await ctx.runMutation(internal.runs.appendEvent, {
      runId: args.runId,
      stage: 'repairing',
      source: 'system',
      versionNumber: nextVersionNumber,
      title: 'OpenAI disabled for this repair',
      detail:
        'Convex OPENAI_API_KEY is not configured, so this repair iteration is using deterministic local logic.',
      debugData: JSON.stringify(
        {
          reason: 'missing_convex_openai_api_key',
          sourceType: context.run.sourceType,
        },
        null,
        2,
      ),
      severity: 'warning',
    })
  }

  if (codesAreEquivalent(patch.code, context.version.code)) {
    await ctx.runMutation(internal.runs.appendEvent, {
      runId: args.runId,
      stage: 'repairing',
      source: 'system',
      versionNumber: nextVersionNumber,
      title: 'Repair loop converged without a code delta',
      detail:
        'The generated repair matched the current version, so the loop stopped instead of repeating the same patch.',
      debugData: JSON.stringify(
        {
          fromVersionNumber: args.versionNumber,
          attemptedVersionNumber: nextVersionNumber,
          repairMode,
          repairModel,
        },
        null,
        2,
      ),
      severity: 'warning',
    })

    return await finalizeRun(ctx, {
      runId: args.runId,
      latestVersionNumber: args.versionNumber,
      reason: 'converged',
    })
  }

  await ctx.runMutation(internal.runs.createPatchedVersion, {
    runId: args.runId,
    fromVersionNumber: args.versionNumber,
    toVersionNumber: nextVersionNumber,
    code: patch.code,
    changeSummary: patch.changeSummary,
    issueSummary: patch.issueSummary,
    suggestion: patch.suggestion,
    cases: patch.cases,
  })

  await ctx.runMutation(internal.runs.appendEvent, {
    runId: args.runId,
    stage: 'repairing',
    source: 'maker',
    versionNumber: nextVersionNumber,
    title:
      repairMode === 'openai' && repairModel
        ? `Maker patch ready for version ${nextVersionNumber} via ${repairModel}`
        : `Maker patch ready for version ${nextVersionNumber}`,
    detail: patch.changeSummary,
    debugData: JSON.stringify(
      {
        fromVersionNumber: args.versionNumber,
        toVersionNumber: nextVersionNumber,
        repairMode,
        repairModel,
        issueSummary: patch.issueSummary,
        suggestion: patch.suggestion,
      },
      null,
      2,
    ),
    severity: 'info',
  })

  await ctx.runMutation(internal.runs.appendEvent, {
    runId: args.runId,
    stage: 'attacking',
    source: 'red_team',
    versionNumber: nextVersionNumber,
    title:
      redTeamMode === 'openai' && redTeamModel
        ? `Red Team regenerated ${patch.cases.length} attack cases via ${redTeamModel}`
        : `Red Team regenerated ${patch.cases.length} attack cases`,
    detail: redTeamSummary,
    debugData: JSON.stringify(
      {
        redTeamMode,
        redTeamModel,
        caseTitles: patch.cases.map((caseItem) => caseItem.title),
        categories: patch.cases.map((caseItem) => caseItem.category),
      },
      null,
      2,
    ),
    severity: 'info',
  })

  await queueVersionExecution(ctx, args.runId, nextVersionNumber)

  return {
    status: 'awaiting_execution',
    versionNumber: nextVersionNumber,
  }
}

export const bootstrapRun = action({
  args: {
    runId: v.id('runs'),
  },
  handler: async (ctx, args): Promise<BootstrapRunResult> => {
    const run = await ctx.runQuery(internal.runs.getRunForBootstrap, {
      runId: args.runId,
    })

    if (!run) {
      throw new Error('Run not found.')
    }

    if (run.currentVersionNumber > 0) {
      return { versionNumber: run.currentVersionNumber }
    }

    await ctx.runMutation(internal.runs.setRunStatus, {
      runId: args.runId,
      status: 'generating',
      passFail: 'pending',
    })

    const deterministicDraft = buildInitialArtifacts({
      sourceType: run.sourceType,
      title: run.title,
      sourceText: run.sourceText,
    })
    let draft = deterministicDraft
    let makerMode: 'openai' | 'deterministic' =
      run.sourceType === 'demo' ? 'deterministic' : 'openai'
    let redTeamMode: 'openai' | 'deterministic' =
      run.sourceType === 'demo' ? 'deterministic' : 'openai'
    let makerModel: string | null = null
    let redTeamModel: string | null = null
    let redTeamSummary =
      'The current version is queued for backend execution in Convex.'
    let fallbackReason: string | null = null
    let redTeamFallbackReason: string | null = null

    if (hasOpenAIConfig() && run.sourceType !== 'demo') {
      if (run.sourceType === 'code') {
        try {
          const code = ensureExported(run.sourceText)

          draft = {
            scenario: inferScenarioFromText(
              `${run.title}\n${run.sourceText}\n${code}`,
            ),
            code,
            changeSummary: 'User-supplied code was registered as version 1 for evaluation.',
            cases: deterministicDraft.cases,
          }
          makerMode = 'deterministic'
          try {
            const redTeam = await generateRedTeamCasesWithOpenAI({
              title: run.title,
              sourceType: run.sourceType,
              sourceText: run.sourceText,
              code,
            })

            draft = {
              ...draft,
              cases: redTeam.cases,
            }
            redTeamMode = 'openai'
            redTeamModel = redTeam.model
            redTeamSummary = redTeam.summary
          } catch (error) {
            redTeamMode = 'deterministic'
            redTeamFallbackReason =
              error instanceof Error
                ? error.message
                : 'Unknown OpenAI Red Team bootstrap error.'
            redTeamSummary =
              'The submitted code stayed local, and deterministic attack cases were substituted for this bootstrap iteration.'
          }
        } catch (error) {
          makerMode = 'deterministic'
          redTeamMode = 'deterministic'
          fallbackReason =
            error instanceof Error
              ? error.message
              : 'Unknown OpenAI bootstrap error.'
          draft = deterministicDraft
        }
      } else {
        try {
          const makerDraft = await generateMakerDraftWithOpenAI({
            sourceType: run.sourceType,
            title: run.title,
            sourceText: run.sourceText,
          })

          draft = {
            scenario: inferScenarioFromText(
              `${run.title}\n${run.sourceText}\n${makerDraft.code}`,
            ),
            code: makerDraft.code,
            changeSummary: makerDraft.changeSummary,
            cases: deterministicDraft.cases,
          }
          makerMode = 'openai'
          makerModel = makerDraft.model
          try {
            const redTeam = await generateRedTeamCasesWithOpenAI({
              title: run.title,
              sourceType: run.sourceType,
              sourceText: run.sourceText,
              code: makerDraft.code,
            })

            draft = {
              ...draft,
              cases: redTeam.cases,
            }
            redTeamMode = 'openai'
            redTeamModel = redTeam.model
            redTeamSummary = redTeam.summary
          } catch (error) {
            redTeamMode = 'deterministic'
            redTeamFallbackReason =
              error instanceof Error
                ? error.message
                : 'Unknown OpenAI Red Team bootstrap error.'
            redTeamSummary =
              'The Maker draft came from OpenAI, but attack-case generation fell back to deterministic cases for bootstrap.'
          }
        } catch (error) {
          makerMode = 'deterministic'
          redTeamMode = 'deterministic'
          fallbackReason =
            error instanceof Error ? error.message : 'Unknown OpenAI bootstrap error.'
          draft = deterministicDraft
        }
      }
    } else {
      makerMode = 'deterministic'
      redTeamMode = 'deterministic'
    }

    if (fallbackReason) {
      await ctx.runMutation(internal.runs.appendEvent, {
        runId: args.runId,
        stage: 'generating',
        source: 'system',
        versionNumber: 1,
        title: 'OpenAI bootstrap fallback',
        detail: 'The run fell back to deterministic Maker and Red Team logic.',
        debugData: JSON.stringify(
          {
            reason: fallbackReason,
        },
        null,
        2,
      ),
      severity: 'warning',
    })
    }

    if (redTeamFallbackReason) {
      await ctx.runMutation(internal.runs.appendEvent, {
        runId: args.runId,
        stage: 'attacking',
        source: 'system',
        versionNumber: 1,
        title: 'OpenAI Red Team fallback',
        detail:
          'The run kept the successful Maker output, but attack-case generation fell back to deterministic cases.',
        debugData: JSON.stringify(
          {
            reason: redTeamFallbackReason,
            makerMode,
            makerModel,
          },
          null,
          2,
        ),
        severity: 'warning',
      })
    } else if (run.sourceType !== 'demo' && !hasOpenAIConfig()) {
      await ctx.runMutation(internal.runs.appendEvent, {
        runId: args.runId,
        stage: 'generating',
        source: 'system',
        versionNumber: 1,
        title: 'OpenAI disabled for this run',
        detail:
          'Convex OPENAI_API_KEY is not configured, so this run is using deterministic local orchestration.',
        debugData: JSON.stringify(
          {
            reason: 'missing_convex_openai_api_key',
            sourceType: run.sourceType,
          },
          null,
          2,
        ),
        severity: 'warning',
      })
    }

    await ctx.runMutation(internal.runs.appendEvent, {
      runId: args.runId,
      stage: 'generating',
      source: 'maker',
      versionNumber: 1,
      title:
        makerMode === 'openai' && makerModel
          ? `Maker draft ready via ${makerModel}`
          : 'Maker draft ready',
      detail: draft.changeSummary,
      debugData: JSON.stringify(
        {
          makerMode,
          makerModel,
        },
        null,
        2,
      ),
      severity: 'info',
    })

    await ctx.runMutation(internal.runs.seedVersionArtifacts, {
      runId: args.runId,
      versionNumber: 1,
      role: 'maker_initial',
      code: draft.code,
      changeSummary: draft.changeSummary,
      cases: draft.cases,
    })

    await ctx.runMutation(internal.runs.appendEvent, {
      runId: args.runId,
      stage: 'attacking',
      source: 'red_team',
      versionNumber: 1,
      title:
        redTeamMode === 'openai' && redTeamModel
          ? `Red Team generated ${draft.cases.length} attack cases via ${redTeamModel}`
          : `Red Team generated ${draft.cases.length} attack cases`,
      detail: redTeamSummary,
      debugData: JSON.stringify(
        {
          redTeamMode,
          redTeamModel,
          caseTitles: draft.cases.map((caseItem) => caseItem.title),
          categories: draft.cases.map((caseItem) => caseItem.category),
        },
        null,
        2,
      ),
      severity: 'info',
    })

    await queueVersionExecution(ctx, args.runId, 1)

    return {
      versionNumber: 1,
      caseCount: draft.cases.length,
    }
  },
})

export const processExecution = action({
  args: {
    runId: v.id('runs'),
    versionNumber: v.number(),
    execution: executionReportValidator,
  },
  handler: async (ctx, args): Promise<ProcessExecutionResult> => {
    try {
      return await processExecutionResult(ctx, {
        runId: args.runId,
        versionNumber: args.versionNumber,
        execution: args.execution,
        sourceLabel: 'Client execution layer',
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown evaluation failure.'

      await ctx.runMutation(internal.runs.setRunStatus, {
        runId: args.runId,
        status: 'error',
      })

      await ctx.runMutation(internal.runs.appendEvent, {
        runId: args.runId,
        stage: 'error',
        source: 'eval_engine',
        versionNumber: args.versionNumber,
        title: 'Evaluation failed',
        detail: message,
        severity: 'error',
      })

      throw error
    }
  },
})

export const executeVersion = internalAction({
  args: {
    runId: v.id('runs'),
    versionNumber: v.number(),
  },
  handler: async (ctx, args): Promise<ProcessExecutionResult> => {
    try {
      const context = await ctx.runQuery(internal.runs.getExecutionContext, {
        runId: args.runId,
        versionNumber: args.versionNumber,
      })

      if (!context) {
        throw new Error('Execution context not found.')
      }

      if (context.run.status === 'completed' || context.run.status === 'error') {
        return {
          status: 'completed',
          versionNumber: context.run.currentVersionNumber,
          overallScore: context.run.currentScore,
          passFail:
            context.run.passFail === 'pending'
              ? 'fail'
              : context.run.passFail,
        }
      }

      const existingEvaluation = await ctx.runQuery(internal.runs.getEvaluationForVersion, {
        runId: args.runId,
        versionNumber: args.versionNumber,
      })

      if (existingEvaluation) {
        return {
          status: 'completed',
          versionNumber: existingEvaluation.versionNumber,
          overallScore: existingEvaluation.overallScore,
          passFail: derivePassFailFromEvaluation(existingEvaluation),
        }
      }

      await ctx.runMutation(internal.runs.setRunStatus, {
        runId: args.runId,
        status: 'evaluating',
        currentVersionNumber: args.versionNumber,
        latestVersionNumber: context.run.latestVersionNumber ?? args.versionNumber,
      })

      await ctx.runMutation(internal.runs.appendEvent, {
        runId: args.runId,
        stage: 'awaiting_execution',
        source: 'eval_engine',
        versionNumber: args.versionNumber,
        title: 'Backend evaluator starting execution',
        detail: `Running ${context.attackCases.length} attack cases against version ${args.versionNumber}.`,
        debugData: JSON.stringify(
          {
            codePreview: context.version.code.slice(0, 240),
            attackTitles: context.attackCases.map((attackCase) => attackCase.title),
          },
          null,
          2,
        ),
        severity: 'info',
      })

      const execution = await executeCodeInNode({
        code: context.version.code,
        attackCases: context.attackCases,
      })

      await ctx.runMutation(internal.runs.appendEvent, {
        runId: args.runId,
        stage: 'evaluating',
        source: 'eval_engine',
        versionNumber: args.versionNumber,
        title: 'Backend evaluator finished execution',
        detail: `Evaluator returned ${execution.summary.passed} passing, ${execution.summary.failed} failing, and ${execution.summary.errors} errored attack cases.`,
        debugData: JSON.stringify(execution, null, 2),
        severity:
          execution.summary.failed > 0 || execution.summary.errors > 0 ? 'warning' : 'info',
      })

      return await processExecutionResult(ctx, {
        runId: args.runId,
        versionNumber: args.versionNumber,
        execution,
        sourceLabel: 'Backend evaluator',
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown backend execution failure.'

      await ctx.runMutation(internal.runs.setRunStatus, {
        runId: args.runId,
        status: 'error',
      })

      await ctx.runMutation(internal.runs.appendEvent, {
        runId: args.runId,
        stage: 'error',
        source: 'eval_engine',
        versionNumber: args.versionNumber,
        title: 'Backend evaluation failed',
        detail: message,
        severity: 'error',
      })

      throw error
    }
  },
})
