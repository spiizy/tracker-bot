/**
 * Лёгкие in-memory метрики для админ-панели. Без Prometheus — для MVP хватает.
 */
class Metrics {
  readonly startedAt = Date.now();
  eventsProcessed = 0;
  notificationsSent = 0;
  notificationsFailed = 0;
  sseConnected = false;
  activeWatchers = 0;

  private latencies: number[] = []; // мс, скользящее окно
  private readonly window = 200;
  private tpsBucket: number[] = []; // таймстемпы событий за последнюю минуту

  recordEvent(latencyMs: number): void {
    this.eventsProcessed++;
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.window) this.latencies.shift();
    const now = Date.now();
    this.tpsBucket.push(now);
    this.tpsBucket = this.tpsBucket.filter((t) => now - t < 60_000);
  }

  get avgLatencyMs(): number {
    if (this.latencies.length === 0) return 0;
    return Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length);
  }

  get tpm(): number {
    const now = Date.now();
    return this.tpsBucket.filter((t) => now - t < 60_000).length;
  }

  get uptimeSec(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
}

export const metrics = new Metrics();
