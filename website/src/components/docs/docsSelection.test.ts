import { describe, expect, it } from "vitest";
import { resolveDocsSelection } from "./docsSelection";

const COLLECTIONS = [
  { id: "setup", articles: [{ id: "quickstart" }, { id: "install" }] },
  { id: "users", articles: [{ id: "roles" }, { id: "approvals" }] },
] as const;

const DEFAULT = { collectionId: "setup", articleId: "quickstart" };

const resolve = (c: string | null, a: string | null) => resolveDocsSelection(COLLECTIONS, { c, a }, DEFAULT);

describe("resolveDocsSelection", () => {
  it("falls back to the default when the URL has no selection", () => {
    expect(resolve(null, null)).toEqual(DEFAULT);
  });

  it("opens a collection overview when only a valid collection is given", () => {
    expect(resolve("users", null)).toEqual({ collectionId: "users", articleId: null });
  });

  it("opens an article inside the given collection", () => {
    expect(resolve("users", "roles")).toEqual({ collectionId: "users", articleId: "roles" });
  });

  it("keeps the article id even when it does not belong to the collection (the page shows its own not-found state)", () => {
    expect(resolve("users", "install")).toEqual({ collectionId: "users", articleId: "install" });
  });

  it("finds the owning collection when only an article is given", () => {
    expect(resolve(null, "approvals")).toEqual({ collectionId: "users", articleId: "approvals" });
  });

  it("finds the owning collection when the collection id is unknown but the article is valid", () => {
    expect(resolve("nope", "install")).toEqual({ collectionId: "setup", articleId: "install" });
  });

  it("falls back to the default when both ids are unknown", () => {
    expect(resolve("nope", "nothing")).toEqual(DEFAULT);
    expect(resolve("nope", null)).toEqual(DEFAULT);
    expect(resolve(null, "nothing")).toEqual(DEFAULT);
  });

  it("does not mutate the collections it reads", () => {
    const before = JSON.stringify(COLLECTIONS);
    resolve("users", "roles");
    expect(JSON.stringify(COLLECTIONS)).toBe(before);
  });
});
