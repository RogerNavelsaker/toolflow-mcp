import { dirname, isAbsolute, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import type { JsonValue, PluginDefinition, RailResult, Step, ToolflowVerb, TraceEntry, ValueRef, VerbContext } from "./types.ts";
import { parsePipeline } from "./parser.ts";

export type Registry = {
  verbs: Map<string, { plugin: string; verb: ToolflowVerb }>;
  plugins: PluginDefinition[];
};

export async function runPipeline(
  script: string,
  registry: Registry,
  context: Omit<VerbContext, "pluginName" | "pluginConfig" | "pluginSecrets">,
): Promise<RailResult> {
  const startedAt = Date.now();
  const trace: TraceEntry[] = [];
  let currentValue: unknown = null;

  try {
    const steps = parsePipeline(script);
    if (steps.length === 0) throw new Error("Pipeline is empty");

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const stationStartedAt = Date.now();
      try {
        currentValue = await executeStep(step, currentValue, registry, context);
        trace.push(buildTrace(index, step, stationStartedAt, true));
      } catch (error) {
        trace.push(buildTrace(index, step, stationStartedAt, false, error instanceof Error ? error.message : String(error)));
        return {
          status: "failure",
          error: error instanceof Error ? error.message : String(error),
          lastValue: currentValue,
          meta: {
            trace,
            durationMs: Date.now() - startedAt,
            pluginCount: registry.plugins.length,
          },
        };
      }
    }

    return {
      status: "success",
      value: currentValue,
      meta: {
        trace,
        durationMs: Date.now() - startedAt,
        pluginCount: registry.plugins.length,
      },
    };
  } catch (error) {
    return {
      status: "failure",
      error: error instanceof Error ? error.message : String(error),
      lastValue: currentValue,
      meta: {
        trace,
        durationMs: Date.now() - startedAt,
        pluginCount: registry.plugins.length,
      },
    };
  }
}

export function createCoreRegistry(): Registry {
  const corePlugin: PluginDefinition = {
    name: "core",
    description: "Built-in functional verbs",
    verbs: [
      {
        name: "echo",
        description: "Returns the first argument or the incoming value",
        run(input, args) {
          return args.length > 0 ? args[0] : input;
        },
      },
      {
        name: "get",
        description: "Fetches a URL and returns parsed JSON or text",
        async run(_input, args) {
          const [url, headersArg] = args;
          if (typeof url !== "string") throw new Error("get expects a URL string");
          const headers = headersArg && typeof headersArg === "object" && !Array.isArray(headersArg) ? headersArg : undefined;
          const response = await fetch(url, { headers: headers as HeadersInit | undefined });
          if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
          const type = response.headers.get("content-type") ?? "";
          if (type.includes("application/json")) return (await response.json()) as JsonValue;
          return await response.text();
        },
      },
      {
        name: "jq",
        description: "Selects a value from the current payload using dot-path syntax",
        run(input, args) {
          const [path] = args;
          if (typeof path !== "string") throw new Error("jq expects a path string");
          return selectPath(input, path);
        },
      },
      {
        name: "write",
        description: "Writes the current payload to a file and returns the original value",
        async run(input, args, context) {
          const [filePath] = args;
          if (typeof filePath !== "string") throw new Error("write expects a path string");
          const target = isAbsolute(filePath) ? filePath : resolve(context.cwd, filePath);
          const payload = typeof input === "string" ? input : JSON.stringify(input, null, 2);
          await writeFile(target, payload);
          return input;
        },
      },
      {
        name: "read",
        description: "Reads a UTF-8 file from disk",
        async run(_input, args, context) {
          const [filePath] = args;
          if (typeof filePath !== "string") throw new Error("read expects a path string");
          const target = isAbsolute(filePath) ? filePath : resolve(context.cwd, filePath);
          return await Bun.file(target).text();
        },
      },
      {
        name: "json",
        description: "Parses the current string value as JSON",
        run(input) {
          if (typeof input !== "string") throw new Error("json expects the current value to be a string");
          return JSON.parse(input) as JsonValue;
        },
      },
    ],
  };

  return buildRegistry([corePlugin]);
}

export function buildRegistry(plugins: PluginDefinition[]): Registry {
  const verbs = new Map<string, { plugin: string; verb: ToolflowVerb }>();
  for (const plugin of plugins) {
    for (const verb of plugin.verbs ?? []) {
      verbs.set(verb.name, { plugin: plugin.name, verb });
    }
  }
  return { verbs, plugins };
}

export function listVerbs(registry: Registry) {
  const verbs = [...registry.verbs.entries()].map(([name, entry]) => ({
    name,
    plugin: entry.plugin,
    description: entry.verb.description,
    argsHint: entry.verb.argsHint ?? [],
    inputHint: entry.verb.inputHint ?? "any",
  }));
  verbs.push({
    name: "tee",
    plugin: "core",
    description: "Runs another verb for side effects and preserves the current value",
    argsHint: ["verb", "...args"],
    inputHint: "any",
  });
  return verbs.sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveModulePath(baseFile: string, modulePath: string) {
  if (isAbsolute(modulePath)) return modulePath;
  return resolve(dirname(baseFile), modulePath);
}

async function executeStep(
  step: Step,
  currentValue: unknown,
  registry: Registry,
  context: Omit<VerbContext, "pluginName" | "pluginConfig" | "pluginSecrets">,
) {
  if (step.name === "tee") return await executeTee(step, currentValue, registry, context);
  const entry = registry.verbs.get(step.name);
  if (!entry) throw new Error(`Unknown verb: ${step.name}`);
  const args = step.args.map((arg) => resolveArg(arg, currentValue));
  return await entry.verb.run(currentValue, args, {
    ...context,
    pluginName: entry.plugin,
  });
}

async function executeTee(
  step: Step,
  currentValue: unknown,
  registry: Registry,
  context: Omit<VerbContext, "pluginName" | "pluginConfig" | "pluginSecrets">,
) {
  const [verbRef, ...rest] = step.args;
  const verbName = resolveArg(verbRef, currentValue);
  if (typeof verbName !== "string") throw new Error("tee expects the first argument to resolve to a verb name");
  const entry = registry.verbs.get(verbName);
  if (!entry) throw new Error(`Unknown tee target: ${verbName}`);
  const args = rest.map((arg) => resolveArg(arg, currentValue));
  await entry.verb.run(currentValue, args, {
    ...context,
    pluginName: entry.plugin,
  });
  return currentValue;
}

function resolveArg(arg: ValueRef, currentValue: unknown): JsonValue {
  if (arg.kind === "literal") return arg.value;
  return selectPath(currentValue, arg.path) as JsonValue;
}

function selectPath(input: unknown, path: string): unknown {
  const normalized = path.startsWith(".") ? path.slice(1) : path;
  if (!normalized) return input;
  const parts = normalized.split(".").filter(Boolean);
  let current = input as Record<string, unknown> | unknown[];
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`Path not found: ${path}`);
      }
      current = current[index] as unknown[] | Record<string, unknown>;
      continue;
    }
    if (!current || typeof current !== "object" || !(part in current)) {
      throw new Error(`Path not found: ${path}`);
    }
    current = (current as Record<string, unknown>)[part] as unknown[] | Record<string, unknown>;
  }
  return current;
}

function buildTrace(index: number, step: Step, stationStartedAt: number, ok: boolean, note?: string): TraceEntry {
  const finishedAt = Date.now();
  return {
    step: index + 1,
    station: step.raw,
    args: step.args.map((arg) => (arg.kind === "literal" ? arg.value : `$${arg.path}`)),
    ok,
    startedAt: new Date(stationStartedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - stationStartedAt,
    note,
  };
}
