import { existsSync } from "node:fs";
import { loadRuntime } from "./plugins.ts";
import { listVerbs } from "./runtime.ts";

type CliCommand = "doctor" | "help" | "registry" | "status";

export async function runCli(command: CliCommand, cwd: string, options: { json?: boolean } = {}) {
  const payload = await buildCliPayload(cwd);

  if (options.json) {
    console.log(JSON.stringify(renderCommandPayload(command, payload), null, 2));
    return;
  }

  console.log(renderCommandText(command, payload));
}

type RuntimePayload = Awaited<ReturnType<typeof buildCliPayload>>;

async function buildCliPayload(cwd: string) {
  const runtime = await loadRuntime(cwd);
  const bridgeChecks = runtime.registry.plugins.flatMap((plugin) =>
    (plugin.bridges ?? []).map((bridge) => ({
      plugin: plugin.name,
      prefix: bridge.prefix,
      command: bridge.transport.command,
      available: Bun.which(bridge.transport.command) !== null,
    })),
  );

  return {
    cwd,
    configPath: runtime.configPath ?? null,
    secretsPath: runtime.secretsPath ?? null,
    configPresent: runtime.configPath ? existsSync(runtime.configPath) : false,
    secretsPresent: runtime.secretsPath ? existsSync(runtime.secretsPath) : false,
    pluginCount: runtime.registry.plugins.length,
    plugins: runtime.registry.plugins.map((plugin) => ({
      name: plugin.name,
      description: plugin.description ?? null,
      verbCount: plugin.verbs?.length ?? 0,
      bridgeCount: plugin.bridges?.length ?? 0,
    })),
    verbs: listVerbs(runtime.registry),
    bridgeChecks,
  };
}

function renderCommandPayload(command: CliCommand, payload: RuntimePayload) {
  if (command === "help") {
    return {
      commands: ["toolflow", "toolflow help", "toolflow registry", "toolflow status", "toolflow doctor"],
      examples: [
        "toolflow registry --json",
        "toolflow status",
        "toolflow doctor",
      ],
    };
  }
  if (command === "registry") {
    return {
      verbs: payload.verbs,
      configPath: payload.configPath,
      secretsPath: payload.secretsPath,
      pluginCount: payload.pluginCount,
      plugins: payload.plugins,
    };
  }
  if (command === "status") {
    return {
      cwd: payload.cwd,
      configPath: payload.configPath,
      secretsPath: payload.secretsPath,
      pluginCount: payload.pluginCount,
      plugins: payload.plugins.map((plugin) => plugin.name),
      bridgeChecks: payload.bridgeChecks,
    };
  }
  return {
    checks: [
      { name: "config", ok: payload.configPresent, detail: payload.configPath ?? "not found" },
      { name: "secrets", ok: true, detail: payload.secretsPath ?? "not configured" },
      ...payload.bridgeChecks.map((check) => ({
        name: `${check.prefix}.command`,
        ok: check.available,
        detail: check.command,
      })),
    ],
  };
}

function renderCommandText(command: CliCommand, payload: RuntimePayload) {
  if (command === "help") {
    return [
      "toolflow",
      "",
      "Commands:",
      "  toolflow registry [--json]",
      "  toolflow status [--json]",
      "  toolflow doctor [--json]",
      "  toolflow help [--json]",
      "",
      "MCP:",
      "  toolflow { flow: \"...\" }",
    ].join("\n");
  }

  if (command === "registry") {
    return [
      `Plugins: ${payload.pluginCount}`,
      `Config: ${payload.configPath ?? "not found"}`,
      `Secrets: ${payload.secretsPath ?? "not configured"}`,
      "",
      "Verbs:",
      ...payload.verbs.map((verb) => `- ${verb.name} (${verb.plugin})${verb.description ? `: ${verb.description}` : ""}`),
    ].join("\n");
  }

  if (command === "status") {
    return [
      `cwd: ${payload.cwd}`,
      `config: ${payload.configPath ?? "not found"}`,
      `secrets: ${payload.secretsPath ?? "not configured"}`,
      `plugins: ${payload.plugins.map((plugin) => plugin.name).join(", ") || "none"}`,
      ...payload.bridgeChecks.map(
        (check) => `${check.prefix}: ${check.available ? "ok" : "missing"} (${check.command})`,
      ),
    ].join("\n");
  }

  return [
    `${payload.configPresent ? "[ok]" : "[missing]"} config: ${payload.configPath ?? "not found"}`,
    `[ok] secrets: ${payload.secretsPath ?? "not configured"}`,
    ...payload.bridgeChecks.map(
      (check) => `${check.available ? "[ok]" : "[missing]"} ${check.prefix}: ${check.command}`,
    ),
  ].join("\n");
}
