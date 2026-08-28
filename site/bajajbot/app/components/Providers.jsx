import Reveal from "./Reveal";

const PROVIDERS = [
  {
    name: "openrouter",
    endpoint: "https://openrouter.ai/api/v1",
    model: "openai/gpt-oss-20b:free",
  },
  {
    name: "ollama",
    endpoint: "http://localhost:11434/v1",
    model: "llama3.2",
  },
  {
    name: "vllm / lmstudio",
    endpoint: "http://your-host:8000/v1",
    model: "any served id",
  },
];

export default function Providers() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-14 md:py-20">
      <Reveal>
        <div className="rounded-lg border border-line bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <p className="text-sm text-mute"># bring your own model</p>
            <p className="text-xs text-faint">
              any OpenAI-compatible /v1 endpoint works
            </p>
          </div>
          <div className="border-t border-line">
            {PROVIDERS.map((p, i) => (
              <div
                key={p.name}
                className={`grid grid-cols-1 gap-1 px-5 py-4 text-[13px] sm:grid-cols-[180px_1fr_1fr] sm:gap-3 sm:items-baseline ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <p className="text-ember">
                  <span className="text-faint">▸ </span>
                  {p.name}
                </p>
                <p className="text-mute">{p.endpoint}</p>
                <p className="text-faint sm:text-right">{p.model}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}