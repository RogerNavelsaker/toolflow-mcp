import type { JsonValue, Step, ValueRef } from "./types.ts";

export function parsePipeline(script: string): Step[] {
  const parts = splitTopLevel(script, "|>");
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseStep);
}

function parseStep(segment: string): Step {
  const tokens = tokenize(segment);
  if (tokens.length === 0) throw new Error("Empty pipeline step");
  const [name, ...rest] = tokens;
  return {
    name,
    args: rest.map(parseToken),
    raw: segment.trim(),
  };
}

function parseToken(token: string): ValueRef {
  if (token.startsWith("$")) return { kind: "selector", path: token.slice(1) };
  return { kind: "literal", value: parseLiteral(token) };
}

function parseLiteral(token: string): JsonValue {
  if (token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  if (token === "true") return true;
  if (token === "false") return false;
  if (token === "null") return null;
  if ((token.startsWith("{") && token.endsWith("}")) || (token.startsWith("[") && token.endsWith("]"))) {
    return JSON.parse(token) as JsonValue;
  }
  return token;
}

function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | null = null;
  let depth = 0;

  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (quote) {
      current += char;
      if (char === quote && segment[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'") {
      quote = "'";
      current += char;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      current += char;
      continue;
    }
    if (/\s/.test(char) && depth === 0) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (quote) throw new Error(`Unclosed string in segment: ${segment}`);
  if (depth !== 0) throw new Error(`Unbalanced JSON literal in segment: ${segment}`);
  if (current) tokens.push(current);
  return tokens;
}

function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | null = null;
  let depth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input.slice(index, index + separator.length);
    if (quote) {
      current += char;
      if (char === quote && input[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'") {
      quote = "'";
      current += char;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      current += char;
      continue;
    }
    if (depth === 0 && next === separator) {
      parts.push(current);
      current = "";
      index += separator.length - 1;
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current);
  return parts;
}
