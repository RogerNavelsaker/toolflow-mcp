#!/usr/bin/env bun
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listVerbs, runPipeline } from "./runtime.ts";
import { loadRuntime } from "./plugins.ts";

const runtime = await loadRuntime(process.cwd());

const server = new McpServer(
  {
    name: "toolflow-mcp",
    version: "0.3.2",
  },
  {
    instructions:
      "Toolflow executes compositional pipelines with higher-order verbs and Nushell-style data passing. Configure plugins in toolflow.config.json and keep credentials in toolflow.secrets.json.",
  },
);

server.registerTool(
  "toolflow",
  {
    title: "Toolflow",
    description: "Runs a Toolflow flow and returns a Result container with trace metadata.",
    inputSchema: {
      flow: z.string().min(1),
    },
  },
  async ({ flow }) => {
    const result = await runPipeline(flow, runtime.registry, {
      cwd: process.cwd(),
      configPath: runtime.configPath,
      secretsPath: runtime.secretsPath,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "toolflow_registry",
  {
    title: "Toolflow Registry",
    description: "Lists built-in and plugin-loaded verbs and tools available to the Toolflow pipeline runtime.",
  },
  async () => {
    const payload = {
      verbs: listVerbs(runtime.registry),
      tools: runtime.registry.plugins.flatMap((plugin) => (plugin.tools ?? []).map((tool) => ({ name: tool.name, plugin: plugin.name }))),
      configPath: runtime.configPath ?? null,
      secretsPath: runtime.secretsPath ?? null,
      pluginCount: runtime.registry.plugins.length,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
);

for (const plugin of runtime.registry.plugins) {
  for (const tool of plugin.tools ?? []) {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ?? {},
      },
      async (args) => {
        const payload = await tool.run(args as Record<string, unknown>);
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        };
      },
    );
  }
}

await server.connect(new StdioServerTransport());
