import type { z } from "zod";

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type TraceEntry = {
  step: number;
  station: string;
  args: JsonValue[];
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  note?: string;
};

export type Success<T> = {
  status: "success";
  value: T;
  meta: {
    trace: TraceEntry[];
    durationMs: number;
    pluginCount: number;
  };
};

export type Failure<E = string> = {
  status: "failure";
  error: E;
  lastValue: unknown;
  meta: {
    trace: TraceEntry[];
    durationMs: number;
    pluginCount: number;
  };
};

export type RailResult<T = unknown, E = string> = Success<T> | Failure<E>;

export type ValueRef =
  | { kind: "literal"; value: JsonValue }
  | { kind: "selector"; path: string };

export type Step = {
  name: string;
  args: ValueRef[];
  raw: string;
};

export type PluginSecrets = Record<string, JsonValue>;

export type VerbContext = {
  cwd: string;
  configPath?: string;
  secretsPath?: string;
  pluginName?: string;
  pluginConfig?: JsonValue;
  pluginSecrets?: PluginSecrets;
};

export type VerbFn = (input: unknown, args: JsonValue[], context: VerbContext) => Promise<unknown> | unknown;

export type ToolflowVerb = {
  name: string;
  description: string;
  inputHint?: string;
  argsHint?: string[];
  run: VerbFn;
};

export type ToolflowTool = {
  name: string;
  description: string;
  inputSchema?: z.ZodRawShape;
  run: (args: Record<string, unknown>) => Promise<JsonValue> | JsonValue;
};

export type PluginDefinition = {
  name: string;
  description?: string;
  verbs?: ToolflowVerb[];
  tools?: ToolflowTool[];
};

export type PluginConfigEntry = {
  name: string;
  module: string;
  enabled?: boolean;
  config?: JsonValue;
};

export type ToolflowConfig = {
  plugins?: PluginConfigEntry[];
};
