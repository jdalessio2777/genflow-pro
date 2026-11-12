import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const createSignedUrl = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: (...a) => createSignedUrl(...a) }) } },
}));
const { storagePathOf, signedUrlFor, clearSignedUrlCache, StoredImage, StoredFileLink, SIGNED_URL_SECONDS } = await import("@/lib/storageUrls");

const PUB = "https://ntpbjcvlzophmbowocwt.supabase.co/storage/v1/object/public/uploads/abc-123-receipt%20one.jpg";

beforeEach(() => {
  clearSignedUrlCache();
  createSignedUrl.mockReset();
  createSignedUrl.mockImplementation(async (path) => ({ data: { signedUrl: `https://signed.test/${path}?token=t` }, error: null }));
});

describe("storagePathOf", () => {
  it("reads the path from a stored public URL or an old signed URL", () => {
    expect(storagePathOf(PUB)).toBe("abc-123-receipt one.jpg");
    expect(storagePathOf("https://x.supabase.co/storage/v1/object/sign/uploads/a/b.png?token=zzz")).toBe("a/b.png");
  });
  it("leaves anything else alone", () => {
    expect(storagePathOf("blob:https://app/123")).toBe(null);
    expect(storagePathOf("data:image/png;base64,AAAA")).toBe(null);
    expect(storagePathOf("https://x.supabase.co/storage/v1/object/public/other-bucket/a.png")).toBe(null);
    expect(storagePathOf(null)).toBe(null);
  });
});

describe("signedUrlFor", () => {
  it("signs for one hour and caches until near expiry", async () => {
    let t = 0; const now = () => t;
    expect(await signedUrlFor(PUB, { now })).toBe("https://signed.test/abc-123-receipt one.jpg?token=t");
    expect(createSignedUrl).toHaveBeenCalledWith("abc-123-receipt one.jpg", SIGNED_URL_SECONDS);
    await signedUrlFor(PUB, { now });
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    t = 56 * 60 * 1000; // within 5 minutes of expiry: sign again
    await signedUrlFor(PUB, { now });
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });
  it("a refused signature (not staff, file gone) gives null, never the raw URL", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    expect(await signedUrlFor(PUB)).toBe(null);
  });
  it("non-bucket URLs come back unchanged without signing", async () => {
    expect(await signedUrlFor("blob:https://app/1")).toBe("blob:https://app/1");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

describe("components", () => {
  it("StoredImage shows the signed URL, never the stored public one", async () => {
    render(<StoredImage src={PUB} alt="Receipt" />);
    await waitFor(() => expect(screen.getByRole("img", { name: "Receipt" }).getAttribute("src") || "").toContain("signed.test"));
    expect(document.body.innerHTML).not.toContain("/object/public/");
  });
  it("StoredFileLink opens the signed URL in a new tab", async () => {
    render(<StoredFileLink href={PUB}>open</StoredFileLink>);
    await waitFor(() => expect(screen.getByText("open").getAttribute("href")).toContain("signed.test"));
    expect(screen.getByText("open").getAttribute("target")).toBe("_blank");
  });
});
