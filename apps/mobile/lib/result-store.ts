import type { ScorePhotoResponse } from "@kaldirim/shared-types";

let current: ScorePhotoResponse | null = null;

export const resultStore = {
  set(result: ScorePhotoResponse) {
    current = result;
  },
  get(): ScorePhotoResponse | null {
    return current;
  },
};
