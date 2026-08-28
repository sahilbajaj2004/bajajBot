import Section from "./Section";

const GROUPS = [
  {
    name: "talk",
    items: [
      ["/btw", "instant side answer, never in history"],
      ["/compare", "two models side by side, keep the winner"],
      ["/subagent", "parallel research agents while you wait"],
    ],
  },
  {
    name: "work",
    items: [
      ["/checkpoints", "browse auto git snapshots"],
      ["/changes", "files touched this session"],
      ["/undo", "remove the last exchange"],
      ["/export", "save the chat to md or json"],
    ],
  },
  {
    name: "tune",
    items: [
      ["/model", "switch models mid-chat"],
      ["/theme", "six colorways, live preview"],
      ["/memory", "see what it remembers"],
      ["/usage", "tokens and cost, per model"],
      ["/skills", "browse and run playbooks"],
    ],
  },
];

export default function CheatSheet() {
  return (
    <Section
      id="cheat-sheet"
      comment="cheat sheet"
      headline="Everything is a slash command."
      lede="Type / and Tab autocompletes every command. Esc closes anything, Enter confirms, y or n approves."
    >
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.name} className="overflow-hidden rounded-lg border border-line bg-panel">
            <div className="border-b border-line bg-panel2 px-5 py-2.5 text-xs uppercase tracking-[0.18em] text-faint">
              {g.name}
            </div>
            <ul className="divide-y divide-line">
              {g.items.map(([cmd, desc]) => (
                <li key={cmd} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <span className="text-[13px] text-ember">{cmd}</span>
                  <span className="truncate text-right text-[13px] text-mute">
                    {desc}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}