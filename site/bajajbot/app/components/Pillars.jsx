import Section from "./Section";

const PILLARS = [
  {
    name: "terminal_native",
    title: "Terminal-native",
    body: "No GUI to babysit and no synced dashboard. npx bajajbot and you're inside, in the shell you already live in.",
  },
  {
    name: "developer_first",
    title: "Developer-first",
    body: "Plain markdown, colorized diffs, git checkpoints and /usage cost tracking. Built for engineers, not dashboards.",
  },
  {
    name: "privacy_first",
    title: "Privacy-first",
    body: "Everything lives under ~/.bajajbot on your machine. Messages go only to the endpoint you configure, nothing is synced.",
  },
  {
    name: "built_to_survive",
    title: "Built to survive",
    body: "/retry, /undo, message queueing and auto-compaction keep a long, busy session useful from start to finish.",
  },
];

export default function Pillars() {
  return (
    <Section
      id="way"
      comment="the bajajbot way"
      headline="Four principles, one binary."
    >
      <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
        {PILLARS.map((p) => (
          <div key={p.name} className="bg-panel p-7">
            <p className="text-xs text-faint">
              <span className="text-ember">// </span>
              {p.name}
            </p>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">
              {p.title}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-mute">
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}