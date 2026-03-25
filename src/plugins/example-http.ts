import type { JsonValue, PluginDefinition, PluginSecrets, ToolflowVerb } from "../types.ts";

type PluginFactoryArgs = {
  name: string;
  config?: JsonValue;
  secrets?: PluginSecrets;
};

export default function definePlugin({ name, config, secrets }: PluginFactoryArgs): PluginDefinition {
  const baseUrl = readString(config, "baseUrl");
  const token = typeof secrets?.token === "string" ? secrets.token : undefined;

  const verb: ToolflowVerb = {
    name: "one_get",
    description: "Fetches JSON from a configured upstream using plugin config and secrets",
    argsHint: ["path"],
    async run(_input, args) {
      const [path] = args;
      if (typeof path !== "string") throw new Error("one_get expects a path string");
      if (!baseUrl) throw new Error(`Plugin ${name} is missing config.baseUrl`);
      const url = new URL(path, ensureTrailingSlash(baseUrl)).toString();
      const headers = token ? { authorization: `Bearer ${token}` } : undefined;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
      return (await response.json()) as JsonValue;
    },
  };

  return {
    name,
    description: "Example plugin loaded from toolflow.config.json and toolflow.secrets.json",
    verbs: [verb],
  };
}

function readString(value: JsonValue | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function ensureTrailingSlash(input: string) {
  return input.endsWith("/") ? input : `${input}/`;
}
