#!/usr/bin/env bun
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runPipeline } from "./runtime.ts";
import { loadRuntime } from "./plugins.ts";

const runtime = await loadRuntime(process.cwd());

const server = new McpServer(
  {
    name: "toolflow-mcp",
    version: "0.4.0",
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

await server.connect(new StdioServerTransport());
