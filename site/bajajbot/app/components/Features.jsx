import Section from "./Section";

const FEATURES = [
  {
    cmd: "tools.ask_first",
    title: "Real tools that ask before they run",
    body: "Write, edit, delete and run are actual tools. Each risky step previews a colorized unified diff and waits for a y or n. Nothing executes without your approval.",
  },
  {
    cmd: "plan.board",
    title: "A live checklist above your input",
    body: "set_plan keeps a ✓ / ▸ / ○ board that updates as the agent works. It persists with the session and clears on /new.",
  },
  {
    cmd: "agents.subresearch",
    title: "Parallel mini-agents while you keep typing",
    body: "/subagent fans out background research tasks, /btw answers a side question mid-task, and /compare pits two models side by side. Keep the winner, drop the rest.",
  },
  {
    cmd: "git.checkpoints",
    title: "Every reply is a snapshot",
    body: "The working tree snapshots to a hidden git ref after each reply, without touching your branch. /changes diffs your session, /undo rewinds a reply, /checkpoints restores any point.",
  },
  {
    cmd: "memory.durable",
    title: "It remembers what you teach it",
    body: "Durable facts persist across sessions, BAJAJBOT.md reads your project rules, and markdown skills load on demand. Re-read files every message, so edits apply instantly.",
  },
];

export default function Features() {
  return (
    <Section
      id="features"
      comment="why bajajbot"
      headline={
        <>
          Built for the terminal,{" "}
          <span className="text-ember">tuned for real work</span>.
        </>
      }
      lede="No dashboard to babysit, no sandbox to sync. Just an agent that works where your code already lives."
    >
      <div className="mt-10">
        {FEATURES.map((f, i) => (
          <div
            key={f.cmd}
            className={`grid grid-cols-1 gap-3 py-8 lg:grid-cols-[240px_1fr] lg:gap-10 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <p className="text-sm text-ember">
              <span className="text-faint">▸ </span>
              {f.cmd}
            </p>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-mute">
                {f.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}