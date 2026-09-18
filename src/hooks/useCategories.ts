"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { categoryService } from "@/services/categoryService";
import type { Category, CategoryFetchState } from "@/types/category";

/**
 * Loads the category tree once per page load and keeps it.
 *
 * Switching the selected parent must not refetch — the whole tree is already
 * in memory, so the right-hand panel is a local lookup.
 */
export function useCategories(initial?: Category[]) {
  const [state, setState] = useState<CategoryFetchState>(
    initial && initial.length > 0
      ? { status: "ready", categories: initial }
      : { status: "loading" },
  );

  // Bumping this re-runs the effect; that is what Retry does.
  const [attempt, setAttempt] = useState(0);
  const hasServerData = useRef(Boolean(initial && initial.length > 0));

  useEffect(() => {
    // Server-rendered data is already correct on first paint; only refetch when
    // the user explicitly retries.
    if (hasServerData.current && attempt === 0) return;

    const controller = new AbortController();
    let live = true;

    setState({ status: "loading" });

    categoryService
      .getCategories(controller.signal)
      .then((categories) => {
        if (live) setState({ status: "ready", categories });
      })
      .catch((error: unknown) => {
        if (!live || controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load categories.",
        });
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
