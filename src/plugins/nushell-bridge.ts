import type { BridgeDefinition, JsonValue, PluginDefinition, PluginSecrets } from "../types.ts";
import { materializeBridge } from "../bridge.ts";

type PluginFactoryArgs = {
  name: string;
  config?: JsonValue;
  secrets?: PluginSecrets;
};

export default async function definePlugin({ name, config }: PluginFactoryArgs): Promise<PluginDefinition> {
  const bridge: BridgeDefinition = {
    name,
    prefix: "nu",
    description: "Bridge to Nushell MCP server",
    transport: {
      command: readString(config, "command") ?? "nu",
      args: (readStringArray(config, "args") ?? []).concat(["--mcp"]),
      cwd: readString(config, "cwd"),
      env: readStringRecord(config, "env"),
    },
    toolMappings: [
      {
        upstreamTool: "run",
        exposeVerb: true,
        exposeDirectTool: true,
      },
      {
        upstreamTool: "query",
        exposeVerb: true,
        exposeDirectTool: true,
      }
    ],
  };

  return await materializeBridge(bridge);
}

function readString(value: JsonValue | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function readStringArray(value: JsonValue | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value[key];
  if (!Array.isArray(candidate)) return undefined;
  return candidate.filter((item): item is string => typeof item === "string");
}

function readStringRecord(value: JsonValue | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value[key];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const entries = Object.entries(candidate).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Object.fromEntries(entries);
}
