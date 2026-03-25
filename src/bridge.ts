import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import type {
  BridgeDefinition,
  BridgeToolMapping,
  JsonValue,
  PluginDefinition,
  ToolDescriptor,
  ToolflowTool,
  ToolflowVerb,
} from "./types.ts";

type BridgeClientState = {
  client: Client;
  transport: StdioClientTransport;
  tools: ToolDescriptor[];
};

const bridgeClients = new Map<string, Promise<BridgeClientState>>();

export async function materializeBridge(bridge: BridgeDefinition): Promise<PluginDefinition> {
  const tools = await listBridgeTools(bridge);
  const mappings = resolveMappings(bridge, tools);

  const verbs: ToolflowVerb[] = mappings
    .filter((mapping) => mapping.exposeVerb !== false)
    .map((mapping) => ({
      name: mapping.verbName ?? `${bridge.prefix}.${mapping.upstreamTool}`,
      description: mapping.description ?? describeTool(mapping.upstreamTool, tools),
      argsHint: ["arguments-json"],
      inputHint: "any",
      async run(_input, args) {
        const [rawArgs] = args;
        const callArgs = normalizeCallArgs(rawArgs);
        return await callBridgeTool(bridge, mapping.upstreamTool, callArgs);
      },
    }));

  const directTools: ToolflowTool[] = [
    {
      name: `${bridge.prefix}_list_tools`,
      description: `List tools exposed by the ${bridge.name} MCP bridge`,
      async run() {
        return {
          bridge: bridge.name,
          prefix: bridge.prefix,
          tools,
          mappings: mappings.map((mapping) => ({
            upstreamTool: mapping.upstreamTool,
            verbName: mapping.verbName ?? `${bridge.prefix}.${mapping.upstreamTool}`,
            directToolName:
              mapping.exposeDirectTool === false ? null : (mapping.directToolName ?? `${bridge.prefix}_${mapping.upstreamTool}`),
          })),
        } as JsonValue;
      },
    },
    {
      name: `${bridge.prefix}_call`,
      description: `Call any ${bridge.name} upstream MCP tool by name`,
      inputSchema: {
        tool: z.string().min(1),
        arguments_json: z.string().optional(),
      },
      async run(args) {
        const tool = args.tool;
        if (typeof tool !== "string" || tool.length === 0) throw new Error("tool is required");
        const rawJson = args.arguments_json;
        const parsedArgs =
          typeof rawJson === "string" && rawJson.trim().length > 0 ? normalizeCallArgs(JSON.parse(rawJson) as JsonValue) : {};
        return await callBridgeTool(bridge, tool, parsedArgs);
      },
    },
    ...mappings
      .filter((mapping) => mapping.exposeDirectTool === true)
      .map((mapping) => ({
        name: mapping.directToolName ?? `${bridge.prefix}_${mapping.upstreamTool}`,
        description: mapping.description ?? describeTool(mapping.upstreamTool, tools),
        inputSchema: {
          arguments_json: z.string().optional(),
        },
        async run(args) {
          const rawJson = args.arguments_json;
          const parsedArgs =
            typeof rawJson === "string" && rawJson.trim().length > 0 ? normalizeCallArgs(JSON.parse(rawJson) as JsonValue) : {};
          return await callBridgeTool(bridge, mapping.upstreamTool, parsedArgs);
        },
      })),
  ];

  return {
    name: bridge.name,
    description: bridge.description,
    verbs,
    tools: directTools,
    bridges: [bridge],
  };
}

async function listBridgeTools(bridge: BridgeDefinition): Promise<ToolDescriptor[]> {
  const state = await getBridgeClient(bridge);
  return state.tools;
}

async function callBridgeTool(bridge: BridgeDefinition, toolName: string, args: Record<string, unknown>) {
  const state = await getBridgeClient(bridge);
  const result = await state.client.callTool({
    name: toolName,
    arguments: args,
  });

  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent as JsonValue;
  }

  const text = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();

  if (text.length === 0) {
    return {
      isError: result.isError ?? false,
      content: result.content as unknown as JsonValue,
    };
  }

  return {
    isError: result.isError ?? false,
    text,
  } as JsonValue;
}

async function getBridgeClient(bridge: BridgeDefinition): Promise<BridgeClientState> {
  const cacheKey = JSON.stringify({
    name: bridge.name,
    transport: bridge.transport,
  });

  const existing = bridgeClients.get(cacheKey);
  if (existing) return await existing;

  const created = createBridgeClient(bridge);
  bridgeClients.set(cacheKey, created);
  try {
    return await created;
  } catch (error) {
    bridgeClients.delete(cacheKey);
    throw error;
  }
}

async function createBridgeClient(bridge: BridgeDefinition): Promise<BridgeClientState> {
  const client = new Client({
    name: `toolflow-bridge-${bridge.name}`,
    version: "0.2.0",
  });
  const transport = new StdioClientTransport({
    command: bridge.transport.command,
    args: bridge.transport.args,
    env: bridge.transport.env,
    cwd: bridge.transport.cwd,
    stderr: "inherit",
  });
  await client.connect(transport);
  const listed = await client.listTools();
  return {
    client,
    transport,
    tools: listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
      outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
    })),
  };
}

function resolveMappings(bridge: BridgeDefinition, tools: ToolDescriptor[]): BridgeToolMapping[] {
  if (bridge.toolMappings && bridge.toolMappings.length > 0) return bridge.toolMappings;
  return tools.map((tool) => ({
    upstreamTool: tool.name,
  }));
}

function describeTool(toolName: string, tools: ToolDescriptor[]) {
  return tools.find((tool) => tool.name === toolName)?.description ?? `Bridged MCP tool ${toolName}`;
}

function normalizeCallArgs(input: JsonValue | undefined): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      return normalizeCallArgs(JSON.parse(trimmed) as JsonValue);
    }
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Bridge tool arguments must be a JSON object");
  }
  return input as Record<string, unknown>;
}
