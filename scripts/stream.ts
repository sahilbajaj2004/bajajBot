import { loadConfig } from "../src/config/store.js";
import { streamChat } from "../src/provider/client.js";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error("Usage: npm run stream -- \"your message\"");
  process.exitCode = 1;
} else {
  const config = loadConfig();
  for await (const token of streamChat(config, [{
    role: "user",
    content: prompt,
    timestamp: new Date().toISOString(),
  }])) process.stdout.write(token);
  process.stdout.write("\n");
}
