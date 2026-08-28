import Reveal from "./Reveal";

export default function Section({
  id,
  comment,
  headline,
  lede,
  children,
  className = "",
}) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-5 py-20 md:py-28 ${className}`}>
      <Reveal>
        {comment && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-mute"># {comment}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </div>
        )}
        <h2 className="mt-5 max-w-[22ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          {headline}
        </h2>
        {lede && (
          <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-mute md:text-base">
            {lede}
          </p>
        )}
      </Reveal>
      <Reveal delay={0.1}>{children}</Reveal>
    </section>
  );
}