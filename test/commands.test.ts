import assert from "node:assert/strict";
import { test } from "node:test";
import { filterCommands, matchCommand } from "../src/ui/commands.js";

test("filterCommands matches command prefixes", () => {
  assert.deepEqual(filterCommands("/").map((command) => command.name), [
    "/help",
    "/model",
    "/copy",
    "/retry",
    "/undo",
    "/export",
    "/search",
    "/skills",
    "/checkpoints",
    "/changes",
    "/theme",
    "/memory",
    "/sessions",
    "/usage",
    "/profile",
    "/new",
    "/logout",
  ]);
  assert.deepEqual(filterCommands("/pro").map((command) => command.name), ["/profile"]);
  assert.deepEqual(filterCommands("/lo").map((command) => command.name), ["/logout"]);
  assert.deepEqual(filterCommands("/co").map((command) => command.name), ["/copy"]);
  assert.deepEqual(filterCommands("/re").map((command) => command.name), ["/retry"]);
  assert.deepEqual(filterCommands("/un").map((command) => command.name), ["/undo"]);
  assert.deepEqual(filterCommands("/sea").map((command) => command.name), ["/search"]);
  assert.deepEqual(filterCommands("/mo").map((command) => command.name), ["/model"]);
  assert.deepEqual(filterCommands("/model").map((command) => command.name), ["/model"]);
});

test("filterCommands hides popup once arguments are typed or input is not a command", () => {
  assert.equal(filterCommands("/model gpt-x").length, 0);
  assert.equal(filterCommands("hello /mo").length, 0);
  assert.equal(filterCommands("/zzz").length, 0);
});

test("matchCommand parses name and argument, rejects unknown commands", () => {
  const matched = matchCommand("/model gpt-4");
  assert.equal(matched?.command.name, "/model");
  assert.equal(matched?.arg, "gpt-4");
  assert.equal(matchCommand("/nope")?.command.name ?? null, null);
  assert.equal(matchCommand("just a message"), null);
});
