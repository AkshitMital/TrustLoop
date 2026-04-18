import { v } from 'convex/values'
import { internal } from './_generated/api.js'
import { action } from './_generated/server.js'
import {
  buildInitialArtifacts,
  buildPatchedArtifacts,
  inferScenarioFromText,
  scoreExecution,
  type ExecutionReport,
} from '../shared/pipeline.js'

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

export const bootstrapRun = action({
  args: {
    runId: v.id('runs'),
  },
  handler: async (ctx, args) => {
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

    const draft = buildInitialArtifacts({
      sourceType: run.sourceType,
      title: run.title,
      sourceText: run.sourceText,
    })

    await ctx.runMutation(internal.runs.appendEvent, {
      runId: args.runId,
      stage: 'generating',
      title: 'Maker draft ready',
      detail: draft.changeSummary,
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
      title: `Red Team generated ${draft.cases.length} attack cases`,
      detail: 'The current version is ready for constrained execution in the browser worker.',
      severity: 'info',
    })

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
  handler: async (ctx, args) => {
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

    const evaluation = scoreExecution(
      context.version.code,
      args.execution as ExecutionReport,
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
      title: `Version ${args.versionNumber} scored ${evaluation.overallScore}`,
      detail: evaluation.summary,
      severity: evaluation.passFail === 'pass' ? 'info' : 'warning',
    })

    if (args.versionNumber === 1 && evaluation.passFail === 'fail') {
      await ctx.runMutation(internal.runs.setRunStatus, {
        runId: args.runId,
        status: 'repairing',
      })

      const scenario = inferScenarioFromText(
        `${context.run.title}\n${context.run.sourceText}\n${context.version.code}`,
      )
      const patch = buildPatchedArtifacts(
        scenario,
        context.version.code,
        evaluation.detectedFailures,
      )

      await ctx.runMutation(internal.runs.createPatchedVersion, {
        runId: args.runId,
        fromVersionNumber: 1,
        toVersionNumber: 2,
        code: patch.code,
        changeSummary: patch.changeSummary,
        issueSummary: patch.issueSummary,
        suggestion: patch.suggestion,
        cases: patch.cases,
      })

      await ctx.runMutation(internal.runs.appendEvent, {
        runId: args.runId,
        stage: 'repairing',
        title: 'Maker patch ready',
        detail: patch.changeSummary,
        severity: 'info',
      })

      return {
        status: 'awaiting_execution',
        versionNumber: 2,
      }
    }

    await ctx.runMutation(internal.runs.completeRun, {
      runId: args.runId,
      passFail: evaluation.passFail,
      currentScore: evaluation.overallScore,
    })

    await ctx.runMutation(internal.runs.appendEvent, {
      runId: args.runId,
      stage: 'completed',
      title:
        evaluation.passFail === 'pass'
          ? 'Run completed with a passing score'
          : 'Run completed with remaining failures',
      detail: `Final score ${evaluation.overallScore}.`,
      severity: evaluation.passFail === 'pass' ? 'info' : 'warning',
    })

    return {
      status: 'completed',
      versionNumber: args.versionNumber,
      overallScore: evaluation.overallScore,
      passFail: evaluation.passFail,
    }
  },
})
