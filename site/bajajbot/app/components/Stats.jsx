import Reveal from "./Reveal";

const STATS = [
  {
    key: "context_budget",
    value: "12000",
    label: "tokens before auto-compaction summarizes older turns",
  },
  {
    key: "max_retries",
    value: "3",
    label: "automatic backoff when a provider rate-limits you",
  },
  {
    key: "checkpoint_window",
    value: "300",
    label: "git snapshots kept per project, newest wins",
  },
  {
    key: "colorways",
    value: "6",
    label: "switch live with /theme, persisted to your config",
  },
];

export default function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <Reveal>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.key} className="bg-panel p-6">
              <p className="text-xs text-faint">
                <span aria-hidden="true" className="text-mute">
                  {s.key}
                </span>
              </p>
              <p className="mt-3 text-3xl font-semibold text-ember">{s.value}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-mute">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}