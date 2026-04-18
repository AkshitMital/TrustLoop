"use node";

import {
  MAX_VERSION_NUMBER,
  ensureExported,
  inferScenarioFromText,
  type AssertionType,
  type AttackCaseTemplate,
  type AttackCategory,
  type FailureItem,
  type RunSeedInput,
  type ScenarioKey,
  type Severity,
  type SourceType,
} from "../shared/pipeline.js";

declare const process: {
  env: Record<string, string | undefined>;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_TRUSTLOOP_MODEL?.trim() || "gpt-5-mini";

const ATTACK_CATEGORIES: AttackCategory[] = [
  "null_undefined",
  "empty_input",
  "malformed_payload",
  "large_payload",
  "boundary_condition",
  "type_mismatch",
  "injection_like",
  "repeated_calls",
  "logical_edge",
  "performance_sensitive",
];

const ASSERTION_TYPES: AssertionType[] = [
  "returns",
  "not_includes",
  "no_throw",
  "max_length",
  "stable_repeat",
];

const SEVERITIES: Severity[] = ["low", "medium", "high"];

type StructuredResponse<T> = {
  data: T;
  model: string;
};

type ResponsesContentItem = {
  type?: string;
  text?: string;
  refusal?: string;
};

type ResponsesOutputItem = {
  type?: string;
  content?: ResponsesContentItem[];
};

type ResponsesPayload = {
  model?: string;
  output?: ResponsesOutputItem[];
};

type MakerDraftResponse = {
  code: string;
  changeSummary: string;
};

type MakerRepairResponse = {
  code: string;
  changeSummary: string;
  issueSummary: string;
  suggestion: string;
};

type RedTeamCaseResponse = {
  summary: string;
  cases: Array<{
    title: string;
    category: AttackCategory;
    inputKind: "json" | "undefined";
    inputJson: string;
    inputPreview: string;
    expectedOutcome: string;
    whyThisCaseMatters: string;
    severity: Severity;
    assertionType: AssertionType;
    expectedValueJson: string;
    maxDurationMs: number | null;
    repeatCount: number | null;
  }>;
};

function jsonLiteralSchema(description: string) {
  return {
    type: "string",
    description,
  };
}

function makerSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["code", "changeSummary"],
    properties: {
      code: { type: "string" },
      changeSummary: { type: "string" },
    },
  };
}

function repairSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["code", "changeSummary", "issueSummary", "suggestion"],
    properties: {
      code: { type: "string" },
      changeSummary: { type: "string" },
      issueSummary: { type: "string" },
      suggestion: { type: "string" },
    },
  };
}

function redTeamSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "cases"],
    properties: {
      summary: { type: "string" },
      cases: {
        type: "array",
        minItems: 8,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "category",
            "inputKind",
            "inputJson",
            "inputPreview",
            "expectedOutcome",
            "whyThisCaseMatters",
            "severity",
            "assertionType",
            "expectedValueJson",
            "maxDurationMs",
            "repeatCount",
          ],
          properties: {
            title: { type: "string" },
            category: {
              type: "string",
              enum: ATTACK_CATEGORIES,
            },
            inputKind: {
              type: "string",
              enum: ["json", "undefined"],
            },
            inputJson: jsonLiteralSchema(
              "A JSON literal string for the input value. Use an empty string when inputKind is undefined.",
            ),
            inputPreview: { type: "string" },
            expectedOutcome: { type: "string" },
            whyThisCaseMatters: { type: "string" },
            severity: {
              type: "string",
              enum: SEVERITIES,
            },
            assertionType: {
              type: "string",
              enum: ASSERTION_TYPES,
            },
            expectedValueJson: jsonLiteralSchema(
              "A JSON literal string for the expected value. Use an empty string when the assertionType is no_throw.",
            ),
            maxDurationMs: {
              type: ["number", "null"],
              description:
                "Execution budget in milliseconds when the case is performance sensitive, otherwise null.",
            },
            repeatCount: {
              type: ["number", "null"],
              description:
                "Repeat count for stability or stress probes, otherwise null.",
            },
          },
        },
      },
    },
  };
}

function getApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export function hasOpenAIConfig() {
  return Boolean(getApiKey());
}

export function getOpenAIModel() {
  return DEFAULT_MODEL;
}

function extractOutputText(payload: ResponsesPayload) {
  const messages = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of messages) {
    if (item?.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (content?.type === "refusal" && typeof content.refusal === "string") {
        throw new Error(`OpenAI refusal: ${content.refusal}`);
      }
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  throw new Error("OpenAI returned no text output.");
}

async function callStructuredOutput<T>(options: {
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
  maxOutputTokens: number;
}): Promise<StructuredResponse<T>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      instructions: options.instructions,
      input: options.input,
      max_output_tokens: options.maxOutputTokens,
      store: false,
      reasoning: {
        effort: "low",
      },
      text: {
        format: {
          type: "json_schema",
          name: options.schemaName,
          strict: true,
          schema: options.schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OpenAI request failed with ${response.status}: ${detail.slice(0, 500)}`,
    );
  }

  const payload = (await response.json()) as ResponsesPayload;
  const outputText = extractOutputText(payload);

  return {
    data: JSON.parse(outputText) as T,
    model: typeof payload?.model === "string" ? payload.model : DEFAULT_MODEL,
  };
}

function scenarioHint(sourceType: SourceType, title: string, sourceText: string) {
  const scenario = inferScenarioFromText(`${title}\n${sourceText}`);
  const nameHint =
    scenario === "sanitize" ? "sanitizeUserInput" : "addNumbers";

  return {
    scenario,
    nameHint,
    sourceType,
  };
}

function repairFocusForVersion(scenario: ScenarioKey, targetVersionNumber: number) {
  if (scenario === "sum") {
    if (targetVersionNumber === 2) {
      return "Fix missing-input and malformed-array crashes first. Guard the reducer and preserve the basic summing behavior.";
    }
    if (targetVersionNumber === 3) {
      return "Fix mixed-item robustness next. Ignore non-number items and keep the sum deterministic.";
    }
    return "Perform the final cleanup pass. Keep the reducer strict, readable, and stable under repeated calls and noisy values.";
  }

  if (targetVersionNumber === 2) {
    return "Fix null, undefined, and non-string handling first. Keep the basic normalization path but do not solve every remaining issue yet.";
  }
  if (targetVersionNumber === 3) {
    return "Fix oversized-input handling next. Bound the output length while preserving the earlier null/type protections.";
  }
  return "Perform the final security hardening pass. Remove raw script tags while preserving the earlier safety and length protections.";
}

function parseJsonLiteral(
  rawValue: string,
  fieldName: string,
  allowEmpty = false,
) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    if (allowEmpty) {
      return undefined;
    }
    throw new Error(`Expected ${fieldName} to contain a JSON literal string.`);
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const repeatedStringMatch = trimmed.match(
      /^(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))\.repeat\((\d+)\)$/,
    );

    if (repeatedStringMatch) {
      const literal = repeatedStringMatch[1];
      const repeatCount = Number(repeatedStringMatch[3]);

      if (!Number.isInteger(repeatCount) || repeatCount < 0 || repeatCount > 20000) {
        throw new Error(`Repeat count in ${fieldName} is out of bounds.`);
      }

      if (literal.startsWith('"')) {
        return JSON.parse(literal).repeat(repeatCount) as unknown;
      }

      const singleQuoted = literal
        .slice(1, -1)
        .replace(/\\\\/g, "\\")
        .replace(/\\'/g, "'")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t");

      return singleQuoted.repeat(repeatCount) as unknown;
    }

    throw new Error(`Could not parse ${fieldName} as JSON.`);
  }
}

function normalizeRedTeamCases(
  payload: RedTeamCaseResponse,
): AttackCaseTemplate[] {
  return payload.cases.map((caseItem) => ({
    title: caseItem.title,
    category: caseItem.category,
    inputEnvelope:
      caseItem.inputKind === "undefined"
        ? { kind: "undefined" }
        : {
            kind: "json",
            value: parseJsonLiteral(caseItem.inputJson, `${caseItem.title} inputJson`),
          },
    inputPreview: caseItem.inputPreview,
    expectedOutcome: caseItem.expectedOutcome,
    whyThisCaseMatters: caseItem.whyThisCaseMatters,
    severity: caseItem.severity,
    assertionType: caseItem.assertionType,
    expectedValue:
      caseItem.expectedValueJson.trim().length > 0
        ? parseJsonLiteral(
            caseItem.expectedValueJson,
            `${caseItem.title} expectedValueJson`,
            true,
          )
        : undefined,
    maxDurationMs: caseItem.maxDurationMs ?? undefined,
    repeatCount: caseItem.repeatCount ?? undefined,
  }));
}

export async function generateMakerDraftWithOpenAI(input: RunSeedInput) {
  const hint = scenarioHint(input.sourceType, input.title, input.sourceText);
  const response = await callStructuredOutput<MakerDraftResponse>({
    schemaName: "maker_initial_draft",
    schema: makerSchema(),
    maxOutputTokens: 1800,
    instructions: [
      "You are the Maker stage inside TrustLoop, an AI trust-and-eval pipeline for JavaScript and TypeScript utilities.",
      "Return JSON only matching the supplied schema.",
      "Write exactly one exported JavaScript-compatible TypeScript function.",
      "Do not use imports, external packages, filesystem access, or network calls.",
      "Keep the code concise and readable.",
      "Prioritize core correctness, but do not over-harden every edge case in the first draft. Leave room for the evaluation loop to improve the code in later iterations.",
      `If the task looks like ${hint.scenario}, prefer the function name ${hint.nameHint}.`,
    ].join(" "),
    input: [
      `Source type: ${input.sourceType}`,
      `Run title: ${input.title}`,
      `Task or source material:`,
      input.sourceText,
    ].join("\n\n"),
  });

  return {
    code: ensureExported(response.data.code),
    changeSummary: response.data.changeSummary,
    model: response.model,
  };
}

export async function generateRedTeamCasesWithOpenAI(input: {
  title: string;
  sourceType: SourceType;
  sourceText: string;
  code: string;
}) {
  const hint = scenarioHint(input.sourceType, input.title, input.sourceText);
  const response = await callStructuredOutput<RedTeamCaseResponse>({
    schemaName: "red_team_attack_cases",
    schema: redTeamSchema(),
    maxOutputTokens: 3200,
    instructions: [
      "You are the Red Team stage inside TrustLoop.",
      "Return JSON only matching the supplied schema.",
      "Generate exactly 8 high-signal attack cases for the code under test.",
      "Use only the allowed enum values.",
      "Inputs must be JSON-serializable or undefined.",
      "For inputJson and expectedValueJson, return valid JSON literal strings. Use an empty string when the field does not apply.",
      "Every schema field is required. Use null for maxDurationMs and repeatCount when they do not apply.",
      "Do not use JavaScript expressions such as .repeat() inside inputJson or expectedValueJson unless the literal would be impractically large.",
      "Do not duplicate cases.",
      "Prefer realistic correctness, robustness, security, and performance probes over toy examples.",
      `The scenario hint is ${hint.scenario}.`,
    ].join(" "),
    input: [
      `Run title: ${input.title}`,
      `Source type: ${input.sourceType}`,
      `Original task or source:`,
      input.sourceText,
      `Code under attack:`,
      input.code,
    ].join("\n\n"),
  });

  return {
    summary: response.data.summary,
    cases: normalizeRedTeamCases(response.data),
    model: response.model,
  };
}

export async function generateMakerRepairWithOpenAI(input: {
  title: string;
  sourceText: string;
  code: string;
  failures: FailureItem[];
  targetVersionNumber: number;
}) {
  const hint = scenarioHint("prompt", input.title, input.sourceText);
  const response = await callStructuredOutput<MakerRepairResponse>({
    schemaName: "maker_repair_patch",
    schema: repairSchema(),
    maxOutputTokens: 2200,
    instructions: [
      "You are the Maker repair stage inside TrustLoop.",
      "Return JSON only matching the supplied schema.",
      "Write exactly one exported JavaScript-compatible TypeScript function.",
      "Do not use imports, external packages, filesystem access, or network calls.",
      "Apply one scoped hardening pass only for this iteration. Do not rewrite the entire function unless the current code is fundamentally unusable.",
      `This is repair version ${input.targetVersionNumber} out of ${MAX_VERSION_NUMBER}.`,
      `Focus for this iteration: ${repairFocusForVersion(hint.scenario, input.targetVersionNumber)}`,
      `If the task looks like ${hint.scenario}, prefer the function name ${hint.nameHint}.`,
    ].join(" "),
    input: [
      `Run title: ${input.title}`,
      `Original task or source:`,
      input.sourceText,
      `Current code:`,
      input.code,
      `Detected failures for this iteration:`,
      JSON.stringify(input.failures, null, 2),
    ].join("\n\n"),
  });

  return {
    code: ensureExported(response.data.code),
    changeSummary: response.data.changeSummary,
    issueSummary: response.data.issueSummary,
    suggestion: response.data.suggestion,
    model: response.model,
  };
}
