export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-panel">
      <div className="mx-auto max-w-6xl px-5 pt-14">
        <p
          aria-hidden="true"
          className="select-none text-center text-[clamp(3rem,14vw,10.5rem)] font-semibold leading-[0.95] tracking-tighter text-faint/20"
        >
          <span className="align-middle text-[0.35em] text-ember">❯</span>
          bajajbot
        </p>

        <div className="mt-12 border-t border-line pt-10">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="max-w-xs">
            <p className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
              <span className="text-ember">❯</span>
              bajajbot
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-mute">
              An AI coding agent in your terminal. Free, bring your own key,
              works with any OpenAI-compatible endpoint.
            </p>
          </div>

          <div className="flex gap-16">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-faint">
                product
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px]">
                {[
                  ["Features", "#features"],
                  ["Cheat sheet", "#cheat-sheet"],
                  ["The way", "#way"],
                  ["Get started", "#install"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      className="text-mute transition-colors hover:text-text"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-faint">
                connect
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px]">
                <li>
                  <a
                    href="https://www.npmjs.com/package/bajajbot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-mute transition-colors hover:text-text"
                  >
                    npm
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:Sahilbajaj2004@gmail.com"
                    className="text-mute transition-colors hover:text-text"
                  >
                    contact
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Sahil Bajaj. Free forever, no strings.</p>
          <p>
            <span className="text-ember">$</span> npm install -g bajajbot
          </p>
        </div>
        </div>
      </div>
    </footer>
  );
}