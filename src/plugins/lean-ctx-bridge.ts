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
    prefix: "ctx",
    description: "Bridge to Lean-Ctx MCP server",
    transport: {
      command: "lean-ctx",
      env: {
        "LEAN_CTX_DATA_DIR": "/home/rona/.lean-ctx"
      }
    },
    toolMappings: [
      { upstreamTool: "ctx_read", verbName: "ctx.read", exposeVerb: true, exposeDirectTool: true },
      { upstreamTool: "ctx_shell", verbName: "ctx.shell", exposeVerb: true, exposeDirectTool: true },
      { upstreamTool: "ctx_search", verbName: "ctx.search", exposeVerb: true, exposeDirectTool: true },
      { upstreamTool: "ctx_tree", verbName: "ctx.tree", exposeVerb: true, exposeDirectTool: true }
    ],
  };

  return await materializeBridge(bridge);
}
