/**
 * Base Abstract Provider Adapter
 */

export class BaseLyricsProvider {
  constructor(name, priority = 10) {
    this.name = name;
    this.priority = priority;
  }

  isConfigured() {
    return true;
  }

  async fetchLyrics(trackSeed, options = {}) {
    throw new Error(`fetchLyrics() not implemented for provider ${this.name}`);
  }
}
