const CLAIMS = [
  "asks y/n before every write",
  "snapshots after every reply",
  "undo any step with /undo",
  "plan board above your input",
  "parallel sub-research agents",
  "bring your own key",
  "any OpenAI-compatible endpoint",
  "memory persists across sessions",
  "free, no strings",
];

function Item({ text }) {
  return (
    <li className="flex shrink-0 items-center gap-3 whitespace-nowrap">
      <span aria-hidden="true" className="text-ember">
        ❯
      </span>
      <span className="text-mute">{text}</span>
    </li>
  );
}

export default function Marquee() {
  return (
    <section
      aria-label="Why bajajbot"
      className="marquee border-y border-line bg-panel py-4"
    >
      <div className="marquee-track">
        <ul className="flex items-center gap-10 pr-10">
          {CLAIMS.map((c) => (
            <Item key={c} text={c} />
          ))}
        </ul>
        <ul className="flex items-center gap-10 pr-10" aria-hidden="true">
          {CLAIMS.map((c) => (
            <Item key={c} text={c} />
          ))}
        </ul>
      </div>
    </section>
  );
}