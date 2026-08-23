export interface ToolContext {
  cwd: string;
  confirm: (title: string, detail: string) => Promise<boolean>;
}

export type ToolArgs = Record<string, string | undefined>;

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risky: boolean;
  summary: (args: ToolArgs) => string;
  execute: (args: ToolArgs, ctx: ToolContext) => Promise<string> | string;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
