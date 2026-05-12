"use client";

import type { StoredProgress } from "./types";

export const STORAGE_KEY = "gplx-b-progress-v1";

export const emptyProgress: StoredProgress = {
  answered: {},
  wrongQuestionIds: [],
  examHistory: [],
};

export function readProgress() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? ({ ...emptyProgress, ...JSON.parse(stored) } as StoredProgress) : emptyProgress;
  } catch {
    return emptyProgress;
  }
}

export function writeProgress(progress: StoredProgress) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
