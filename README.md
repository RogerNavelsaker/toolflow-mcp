# toolflow-mcp

`toolflow-mcp` is a Bun MCP server for pipe-oriented tool composition.

The model-facing surface is intentionally small:

- Binary: `toolflow`
- Primary tool: `railway_pipe`
- Introspection tool: `toolflow_registry`

The design takes inspiration from F# pipe-forward composition and Nushell-style data shaping, but keeps the MCP surface generic enough to evolve by loading new local plugins instead of upstreaming every verb.

## Goals

- Keep multi-step work inside one MCP tool call.
- Preserve a functional "current value" through the pipeline.
- Stop on failure and return a structured post-mortem trace.
- Load new verbs from local modules via config and secrets files.
- Bridge other MCP servers behind one client-visible MCP entry.

## DSL

Pipeline shape:

```text
verb [args] |> verb [args] |> verb [args]
```

Rules:

- The output of each successful step becomes the input of the next step.
- Use `$path.to.value` to select from the current value.
- Use `tee` to run a side effect without replacing the current value.
- Strings use single quotes.
- JSON literals are allowed for object and array arguments.

Examples:

```text
get 'https://example.com/data.json' |> jq '.items.0' |> write 'tmp/item.json'
```

```text
read 'package.json' |> json |> jq '.name'
```

```text
get 'https://example.com/data.json' |> tee write 'tmp/raw.json' |> jq '.items'
```

## Config And Secrets

The server looks for two files in the current working directory unless overridden by environment variables:

- `toolflow.config.json`
- `toolflow.secrets.json`

Environment overrides:

- `TOOLFLOW_CONFIG`
- `TOOLFLOW_SECRETS`

Example config:

```json
{
  "plugins": [
    {
      "name": "example-http",
      "module": "./src/plugins/example-http.ts",
      "enabled": true,
      "config": {
        "baseUrl": "https://example.com/api"
      }
    }
  ]
}
```

Example secrets:

```json
{
  "example-http": {
    "token": "replace-me"
  }
}
```

This split keeps connection details in the tracked config file and credentials in a separate local file.

The repo includes:

- [`toolflow.config.json`](/home/rona/Repositories/@runtime-intel/toolflow-mcp/toolflow.config.json) as the default tracked config
- [`toolflow.secrets.example.json`](/home/rona/Repositories/@runtime-intel/toolflow-mcp/toolflow.secrets.example.json) as the tracked secrets template

## Plugin Contract

A plugin module must export either `default` or `definePlugin` and return:

```ts
type PluginDefinition = {
  name: string;
  description?: string;
  verbs?: ToolflowVerb[];
  tools?: ToolflowTool[];
};
```

Plugin verbs are wired into `railway_pipe`, and plugin-defined direct MCP tools are also registered at server startup. That gives you mixed mode from the start: pipe verbs plus standalone MCP tools loaded from local modules.

## MCP Bridge Plugins

`toolflow-mcp` can also bridge other stdio MCP servers.

Current mapping model:

- Namespaced pipe verbs for composition: `flox.search_packages`
- Bridge introspection tool: `flox_list_tools`
- Generic bridge direct tool: `flox_call`
- Selected explicit direct tools for high-value cases: `flox_search_packages`, `flox_install_package`, `flox_run_command`

The generic bridge helper launches the upstream MCP server over stdio, lists its tools, and re-exposes them inside `toolflow`.

Current first bridge:

- `flox-bridge` in [`src/plugins/flox-bridge.ts`](/home/rona/Repositories/@runtime-intel/toolflow-mcp/src/plugins/flox-bridge.ts)

## Built-In Verbs

- `echo`: return the first argument or current value
- `get`: fetch URL content and parse JSON when possible
- `jq`: select a dot-path from the current value
- `write`: write the current value to a file and keep flowing
- `read`: read a UTF-8 file
- `json`: parse the current string value as JSON
- `tee`: run a side effect and preserve the current value

## Bridge Verb Examples

```text
flox.search_packages '{"search_term":"python","limit":5}'
```

```text
flox.run_command '{"working_dir":"/home/rona","environment_dir":"","command":"command -v bun"}'
```

## Install

```bash
bun install
bun run dev
```

Minimal MCP config:

```json
{
  "mcpServers": {
    "toolflow": {
      "command": "toolflow"
    }
  }
}
```

## Scope

- Bun-first MCP runtime
- Functional pipeline execution with trace output
- Configurable plugin loading

## Next

- Register plugin-defined direct MCP tools in addition to verbs
- Add richer selectors and transforms
- Add OneTool and Context Mode bridge plugins outside the core package
