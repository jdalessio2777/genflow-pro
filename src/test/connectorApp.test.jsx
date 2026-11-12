import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const oauth = { getAuthorizationDetails: vi.fn(), approveAuthorization: vi.fn(), denyAuthorization: vi.fn() };
let auth;
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { oauth } } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => auth }));
const { default: OAuthConsent, redirectHostAllowed } = await import("../pages/OAuthConsent.jsx");

const assign = vi.fn();
const page = (q = "?authorization_id=abc") => render(<MemoryRouter initialEntries={[`/oauth/consent${q}`]}><OAuthConsent /></MemoryRouter>);
const claude = { authorization_id: "abc", client: { name: "Claude" }, redirect_uri: "https://claude.ai/api/mcp/auth_callback", scope: "email" };

beforeEach(() => {
  vi.clearAllMocks();
  auth = { isAuthenticated: true, isLoadingAuth: false, staffStatus: "staff", signInWithGoogle: vi.fn(), authError: null };
  Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true, configurable: true });
});

describe("consent screen", () => {
  it("only Claude's hosts count", () => {
    expect(redirectHostAllowed("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectHostAllowed("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(redirectHostAllowed("https://claude.ai.evil.example/x")).toBe(false);
    expect(redirectHostAllowed("http://claude.ai/x")).toBe(false);
    expect(redirectHostAllowed("nonsense")).toBe(false);
  });
  it("signed out: sign in and come back to this request", () => {
    auth.isAuthenticated = false;
    page();
    fireEvent.click(screen.getByTestId("consent-sign-in"));
    expect(auth.signInWithGoogle).toHaveBeenCalledWith({ returnTo: "/oauth/consent?authorization_id=abc" });
    expect(oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  });
  it("Allow approves and returns to Claude", async () => {
    oauth.getAuthorizationDetails.mockResolvedValue({ data: claude, error: null });
    oauth.approveAuthorization.mockResolvedValue({ data: { redirect_url: "https://claude.ai/api/mcp/auth_callback?code=1" }, error: null });
    page();
    fireEvent.click(await screen.findByTestId("consent-allow"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?code=1"));
    expect(oauth.approveAuthorization).toHaveBeenCalledWith("abc");
  });
  it("Deny denies", async () => {
    oauth.getAuthorizationDetails.mockResolvedValue({ data: claude, error: null });
    oauth.denyAuthorization.mockResolvedValue({ data: { redirect_url: "https://claude.ai/x?error=access_denied" }, error: null });
    page();
    fireEvent.click(await screen.findByTestId("consent-deny"));
    await waitFor(() => expect(oauth.denyAuthorization).toHaveBeenCalledWith("abc"));
  });
  it("a request going anywhere else can't be approved", async () => {
    oauth.getAuthorizationDetails.mockResolvedValue({ data: { ...claude, client: { name: "Claude" }, redirect_uri: "https://evil.example/cb" }, error: null });
    page();
    expect(await screen.findByTestId("consent-refused")).toBeInTheDocument();
    expect(screen.queryByTestId("consent-allow")).toBeNull();
  });
  it("no Allow until the staff check has passed", async () => {
    auth.staffStatus = "checking";
    oauth.getAuthorizationDetails.mockResolvedValue({ data: claude, error: null });
    page();
    await waitFor(() => expect(oauth.getAuthorizationDetails).toHaveBeenCalled());
    expect(screen.queryByTestId("consent-allow")).toBeNull();
  });
  it("missing request id", () => {
    page("");
    expect(screen.getByText(/missing its sign-in request/)).toBeInTheDocument();
  });
});
