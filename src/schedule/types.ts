export interface ScheduledPrompt {
  name: string;
  prompt: string;
  cron: string;
  model?: string;
  lastRunISO?: string;
  nextRunISO?: string;
}