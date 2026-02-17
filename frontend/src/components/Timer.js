/**
 * Timer — Elapsed Time Display Component
 *
 * Renders a live-updating timer (MM:SS) inside the given DOM element.
 * Call `start()` to begin, `stop()` to freeze, and `getElapsedSeconds()`
 * to read the total duration.
 *
 * @class Timer
 */
export class Timer {
  /**
   * @param {HTMLElement} element — DOM element whose textContent will be updated
   */
  constructor(element) {
    this.element = element;
    this.startTime = null;
    this.intervalId = null;
    this.elapsedSeconds = 0;
  }

  /** Start the timer. Subsequent calls are ignored if already running. */
  start() {
    if (this.intervalId) return; // Already running
    this.startTime = Date.now();
    this.intervalId = setInterval(() => this.update(), 1000);
  }

  /** Update the display with the current elapsed time. */
  update() {
    this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const m = String(Math.floor(this.elapsedSeconds / 60)).padStart(2, "0");
    const s = String(this.elapsedSeconds % 60).padStart(2, "0");
    this.element.textContent = `Time: ${m}:${s}`;
  }

  /** Stop the timer. Safe to call multiple times. */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get the total elapsed time in seconds.
   * @returns {number}
   */
  getElapsedSeconds() {
    return this.elapsedSeconds;
  }
}
