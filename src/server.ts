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
    version: "0.1.0",
  },
  {
    instructions:
      "Toolflow executes pipe-oriented workflows. Configure plugins in toolflow.config.json and keep credentials in toolflow.secrets.json.",
  },
);

server.registerTool(
  "railway_pipe",
  {
    title: "Railway Pipe",
    description: "Runs a Toolflow pipeline script and returns a Result container with trace metadata.",
    inputSchema: {
      script: z.string().min(1),
    },
  },
  async ({ script }) => {
    const result = await runPipeline(script, runtime.registry, {
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
    description: "Lists built-in and plugin-loaded verbs available to railway_pipe.",
  },
  async () => {
    const payload = {
      verbs: listVerbs(runtime.registry),
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
