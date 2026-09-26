import Section from "./Section";

const QUOTES = [
  {
    quote: "The diff preview before every write is the trust I needed. I stopped reviewing my agent's work on faith.",
    name: "Priya",
    role: "backend engineer",
  },
  {
    quote: "/subagent is the feature I didn't know I wanted. I fire off a check and keep typing while it goes.",
    name: "Daniel",
    role: "solo founder",
  },
  {
    quote: "It remembered my stack after the first session and never forgot it. My BAJAJBOT.md is the rulebook it never skips.",
    name: "Mei",
    role: "frontend engineer",
  },
];

export default function Testimonials() {
  return (
    <Section
      id="devs"
      comment="what devs say"
      headline="Loved where the work actually happens."
    >
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {QUOTES.map((q) => (
          <figure
            key={q.name}
            className="flex flex-col rounded-lg border border-line bg-panel p-6"
          >
            <p className="text-[14px] leading-relaxed text-text">
              <span aria-hidden="true" className="mr-1 text-ember">
                &gt;
              </span>
              {q.quote}
            </p>
            <figcaption className="mt-5 text-[13px] text-faint">
              {q.name} · {q.role}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}