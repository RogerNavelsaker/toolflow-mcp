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
    prefix: "flox",
    description: "Bridge to the installed Flox MCP server",
    transport: {
      command: readString(config, "command") ?? "flox-mcp",
      args: readStringArray(config, "args") ?? [],
      cwd: readString(config, "cwd"),
      env: readStringRecord(config, "env"),
    },
    toolMappings: [
      directAndVerb("search_packages"),
      directAndVerb("show_package"),
      directAndVerb("list_environments"),
      directAndVerb("list_installed_packages"),
      directAndVerb("install_package"),
      directAndVerb("uninstall_package"),
      directAndVerb("run_command"),
      {
        upstreamTool: "init_new_environment",
        exposeVerb: true,
        exposeDirectTool: false,
      },
    ],
  };

  return await materializeBridge(bridge);
}

function directAndVerb(upstreamTool: string) {
  return {
    upstreamTool,
    exposeVerb: true,
    exposeDirectTool: true,
  };
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
