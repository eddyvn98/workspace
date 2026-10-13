import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBoardPendingCreate,
  markBoardSelfCreated,
  wasBoardSelfCreated,
} from "@/app/workspace/utils/selfCreatedBoards";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

describe("self-created board marker", () => {
  beforeEach(() => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage();
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it("remembers a new board within the session", () => {
    markBoardSelfCreated("board-a");
    expect(wasBoardSelfCreated("board-a")).toBe(true);
    expect(wasBoardSelfCreated("board-b")).toBe(false);
  });

  it("still remembers it after the tab or browser closes", () => {
    markBoardSelfCreated("board-a");
    (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage();
    expect(wasBoardSelfCreated("board-a")).toBe(true);
  });

  it("forgets it once the server has the board, so a later 404 means deleted", () => {
    markBoardSelfCreated("board-a");
    clearBoardPendingCreate("board-a");
    (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage();
    expect(wasBoardSelfCreated("board-a")).toBe(false);
  });
});
