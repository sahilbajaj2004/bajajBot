import TerminalDemo from "./TerminalDemo";
import Reveal from "./Reveal";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-70"
      />
      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-24 md:pt-28">
        <Reveal>
          <p className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs text-mute">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ember" />
            terminal-first · bring your own key · free
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <h1 className="mx-auto mt-7 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Your AI coding agent,
            <br className="hidden md:block" /> in your{" "}
            <span className="text-ember">terminal</span>.
          </h1>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mx-auto mt-6 max-w-[62ch] text-balance text-[15px] leading-relaxed text-mute md:text-base">
            Bring your own key, pick any model. BajajBot reads, writes and runs
            code in your repo, and it asks before it touches anything.
          </p>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#install"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-ember px-6 py-3.5 text-[15px] font-semibold text-black transition-all hover:brightness-110 active:scale-[0.98] sm:w-auto"
            >
              <span aria-hidden="true">$</span>
              npx bajajbot
            </a>
            <a
              href="#cheat-sheet"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-panel px-6 py-3.5 text-[15px] font-medium text-text transition-colors hover:border-ember/40 active:scale-[0.98] sm:w-auto"
            >
              Cheat sheet
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.1} y={26}>
          <div className="mx-auto mt-14 max-w-3xl">
            <TerminalDemo />
          </div>
        </Reveal>
      </div>
    </section>
  );
}