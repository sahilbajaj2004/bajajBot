import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR_NAME } from "../config/constants.js";
import type { ToolArgs, ToolContext, ToolDef } from "./types.js";

export interface TodoItem {
  text: string;
  done: boolean;
}

const MAX_ITEMS = 50;
const MAX_TEXT_CHARS = 300;

export function todosFile(cwd: string): string {
  return join(cwd, APP_DIR_NAME, "todos.json");
}

export function loadTodos(cwd: string): TodoItem[] {
  try {
    const parsed = JSON.parse(readFileSync(todosFile(cwd), "utf8")) as unknown;
    const raw = Array.isArray(parsed) ? parsed : (parsed as { todos?: unknown })?.todos;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return null;
        const record = entry as Record<string, unknown>;
        const text = typeof record.text === "string" ? record.text.trim().slice(0, MAX_TEXT_CHARS) : "";
        if (!text) return null;
        return { text, done: record.done === true } as TodoItem;
      })
      .filter((entry): entry is TodoItem => entry !== null)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveTodos(cwd: string, items: TodoItem[]): void {
  const dir = join(cwd, APP_DIR_NAME);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(todosFile(cwd), JSON.stringify({ todos: items.slice(0, MAX_ITEMS) }, null, 2) + "\n");
}

export function todoTick(item: TodoItem): string {
  return item.done ? `- [x] ${item.text}` : `- [ ] ${item.text}`;
}

/** Markdown-ish list for the system prompt; "" when there are no todos. */
export function todosBlock(cwd: string): string {
  const items = loadTodos(cwd);
  if (!items.length) return "";
  return `\n\nThe project's persistent todo list (.bajajbot/todos.json) currently holds:\n${items.map(todoTick).join("\n")}\nUse update_todos to add, tick off, or remove items as you work.`;
}

export const updateTodosTool: ToolDef = {
  name: "update_todos",
  description:
    "Maintain the project's persistent cross-session todo list (.bajajbot/todos.json). Use list to show it, add for a new task, toggle to mark an existing item done/undone, remove to delete one, clear to wipe finished items.",
  risky: false,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "add", "toggle", "remove", "clear"],
        description: "What to do with the todo list",
      },
      text: {
        type: "string",
        description: "Item text (required for add; matched against existing items for toggle/remove)",
      },
    },
    required: ["action"],
  },
  summary: (args: ToolArgs) => `update_todos ${args.action ?? ""}${args.text ? ` "${args.text}"` : ""}`,
  execute: (args: ToolArgs, ctx: ToolContext) => {
    const action = (args.action ?? "list") as "list" | "add" | "toggle" | "remove" | "clear";
    const items = loadTodos(ctx.cwd);
    const text = (args.text ?? "").trim().slice(0, MAX_TEXT_CHARS);
    switch (action) {
      case "add": {
        if (!text) return "Error: update_todos add needs a text argument.";
        const next = [...items, { text, done: false }];
        saveTodos(ctx.cwd, next);
        return `Added "${text}" to the todo list.`;
      }
      case "toggle": {
        if (!text) return "Error: update_todos toggle needs the text of an existing item.";
        const match = items.find((item) => item.text.toLowerCase() === text.toLowerCase());
        if (!match) {
          const fuzzy = items.find((item) => item.text.toLowerCase().includes(text.toLowerCase()));
          if (!fuzzy) return `No todo matches "${text}". Call update_todos with action=list to see the list.`;
          fuzzy.done = !fuzzy.done;
          saveTodos(ctx.cwd, items);
          return `Toggled "${fuzzy.text}" to ${fuzzy.done ? "done" : "not done"}.`;
        }
        match.done = !match.done;
        saveTodos(ctx.cwd, items);
        return `Toggled "${match.text}" to ${match.done ? "done" : "not done"}.`;
      }
      case "remove": {
        if (!text) return "Error: update_todos remove needs the text of an existing item.";
        const next = items.filter((item) => item.text.toLowerCase() !== text.toLowerCase());
        if (next.length === items.length) return `No todo matches "${text}".`;
        saveTodos(ctx.cwd, next);
        return `Removed "${text}".`;
      }
      case "clear": {
        const remaining = items.filter((item) => !item.done);
        const removed = items.length - remaining.length;
        saveTodos(ctx.cwd, remaining);
        return removed ? `Cleared ${removed} finished todo(s).` : "No finished todos to clear.";
      }
      default: {
        return items.length ? items.map((item, index) => `${index + 1}. ${todoTick(item)}`).join("\n") : "The todo list is empty.";
      }
    }
  },
};