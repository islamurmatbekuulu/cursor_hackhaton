import type { ScoreResponse } from "@kaldirim/shared-types";

// Tiny in-memory holder to pass the score from the capture screen to the result
// screen without serializing a large object through navigation params.
let current: ScoreResponse | null = null;

export const resultStore = {
  set(result: ScoreResponse) {
    current = result;
  },
  get(): ScoreResponse | null {
    return current;
  },
};
