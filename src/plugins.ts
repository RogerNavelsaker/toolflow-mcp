import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { JsonValue, PluginDefinition, PluginSecrets, ToolflowConfig } from "./types.ts";
import { buildRegistry, createCoreRegistry, resolveModulePath, type Registry } from "./runtime.ts";

const DEFAULT_CONFIG_PATH = "toolflow.config.json";
const DEFAULT_SECRETS_PATH = "toolflow.secrets.json";

export type LoadedRuntime = {
  registry: Registry;
  configPath?: string;
  secretsPath?: string;
};

export async function loadRuntime(cwd: string): Promise<LoadedRuntime> {
  const configPath = process.env.TOOLFLOW_CONFIG ? resolve(cwd, process.env.TOOLFLOW_CONFIG) : resolve(cwd, DEFAULT_CONFIG_PATH);
  const secretsPath = process.env.TOOLFLOW_SECRETS ? resolve(cwd, process.env.TOOLFLOW_SECRETS) : resolve(cwd, DEFAULT_SECRETS_PATH);
  const config = await loadConfig(configPath);
  const secrets = await loadSecrets(secretsPath);

  const base = createCoreRegistry();
  const loadedPlugins: PluginDefinition[] = [];

  for (const entry of config.plugins ?? []) {
    if (entry.enabled === false) continue;
    const modulePath = resolveModulePath(configPath, entry.module);
    const module = await import(modulePath);
    const factory = module.default ?? module.definePlugin;
    if (typeof factory !== "function") throw new Error(`Plugin ${entry.name} must export default or definePlugin`);
    const plugin = (await factory({
      name: entry.name,
      config: entry.config,
      secrets: (secrets[entry.name] ?? {}) as PluginSecrets,
    })) as PluginDefinition;
    loadedPlugins.push(plugin);
  }

  return {
    registry: buildRegistry([...base.plugins, ...loadedPlugins]),
    configPath: existsSync(configPath) ? configPath : undefined,
    secretsPath: existsSync(secretsPath) ? secretsPath : undefined,
  };
}

async function loadConfig(configPath: string): Promise<ToolflowConfig> {
  if (!existsSync(configPath)) return {};
  return (await Bun.file(configPath).json()) as ToolflowConfig;
}

async function loadSecrets(secretsPath: string): Promise<Record<string, JsonValue>> {
  if (!existsSync(secretsPath)) return {};
  return (await Bun.file(secretsPath).json()) as Record<string, JsonValue>;
}
