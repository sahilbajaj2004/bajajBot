import Reveal from "./Reveal";
import CopyButton from "./CopyButton";

export default function Install() {
  return (
    <section id="install" className="mx-auto max-w-6xl px-5 py-20 md:py-24">
      <Reveal>
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-panel2 px-5 py-3">
            <p className="text-sm text-mute"># install</p>
            <p className="hidden text-xs text-faint sm:block">
              install once, or run without installing
            </p>
          </div>

          <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-faint">install globally</p>
              <p className="mt-1.5 text-lg md:text-xl">
                <span aria-hidden="true" className="text-ember">
                  $
                </span>{" "}
                <span className="font-semibold text-text">
                  npm install -g bajajbot
                </span>
                <span
                  aria-hidden="true"
                  className="cursor-blink ml-1 inline-block h-[1.1em] w-[8px] translate-y-[3px] bg-ember"
                />
              </p>
              <p className="mt-1.5 text-[13px] text-mute">
                then just run <span className="text-text">bajajbot</span> from
                any project
              </p>
            </div>
            <CopyButton text="npm install -g bajajbot" />
          </div>

          <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-faint">or run without installing</p>
              <p className="mt-1.5 text-[15px] md:text-base">
                <span aria-hidden="true" className="text-mute">
                  $
                </span>{" "}
                <span className="font-medium text-text">npx bajajbot</span>
              </p>
            </div>
            <CopyButton text="npx bajajbot" />
          </div>

          <div className="border-t border-line bg-panel2 px-5 py-3 text-[13px] text-mute">
            first run walks your setup · provider, key, endpoint and model ·
            verified against the live API before saving
          </div>
        </div>
      </Reveal>
    </section>
  );
}