import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";
import { copyText } from "@/lib/copy-text";
import { demoLetterUnits, demoProfile, demoResumeUnits } from "@/lib/demo-profile";
import { DEFAULT_SECTION_LAYOUT } from "@/lib/resume-sections";
import { BUILT_IN_THEMES } from "@/lib/themes";

import { retry } from "@/lib/jobs/actions";
import type { JobView } from "@/lib/jobs/runner";

import {
  addApplicationEvidence,
  addNote,
  deleteNote,
  leaveOutUnit,
  listVersions,
  loadVersion,
  putBackTrimmed,
  restoreNote,
  restoreUnit,
  restoreVersion,
  saveUnit,
  sendMessage,
  setApplicationTheme,
  saveApplicationTheme,
  setApplicationSections,
  setCoverLetterLayout,
  setFollowThemeLayout,
  setShowPhoto,
  startRegenerating,
  startScoringResume,
  startWritingDocument,
  startWritingEmail,
  undoEmailRewrite,
  undoMessage,
  updateNote,
} from "./actions";
import { ApplicationView, type ApplicationViewProps } from "./application-view";
import { applyHiringContact, startPeopleSearch } from "./people-actions";

vi.mock("./actions", () => ({
  saveApplicationTheme: vi.fn(),
  setApplicationSections: vi.fn(async () => ({ ok: true, data: null })),
  setApplicationTheme: vi.fn(async () => ({ ok: true, data: null })),
  setCoverLetterLayout: vi.fn(async () => ({ ok: true, data: null })),
  setFollowThemeLayout: vi.fn(async () => ({ ok: true, data: null })),
  setShowPhoto: vi.fn(async () => ({ ok: true, data: null })),
  saveUnit: vi.fn(async ({ text }: { text: string }) => ({ ok: true, data: { text } })),
  startRegenerating: vi.fn(async () => ({ ok: true, data: "job-1" })),
  restoreUnit: vi.fn(async () => ({ ok: true, data: null })),
  sendMessage: vi.fn(async () => ({ ok: true, data: { jobId: "reply-1" } })),
  undoMessage: vi.fn(async () => ({ ok: true, data: { edited: [{ document: "RESUME", unitId: "summary" }] } })),
  addApplicationEvidence: vi.fn(async () => ({ ok: true, data: { fact: { id: "evidence-1", text: "Used Kubernetes" }, notice: "Information saved for this application. Ask Refine with AI to apply it to an existing document." } })),
  addNote: vi.fn(async () => ({ ok: true, data: null })),
  updateNote: vi.fn(async () => ({ ok: true, data: null })),
  deleteNote: vi.fn(async () => ({ ok: true, data: { body: "Called John.", createdAt: "2026-10-03T13:00:00.000Z", updatedAt: "2026-10-03T13:00:00.000Z" } })),
  restoreNote: vi.fn(async () => ({ ok: true, data: null })),
  putBackTrimmed: vi.fn(async () => ({ ok: true, data: null })),
  leaveOutUnit: vi.fn(async () => ({ ok: true, data: { index: 2 } })),
  listVersions: vi.fn(async () => ({ ok: true, data: [] })),
  loadVersion: vi.fn(),
  restoreVersion: vi.fn(async () => ({ ok: true, data: null, toast: "Restored the resume as it was then." })),
  startWritingEmail: vi.fn(async () => ({ ok: true, data: "email-1" })),
  startWritingDocument: vi.fn(async () => ({ ok: true, data: "document-1" })),
  startScoringResume: vi.fn(async () => ({ ok: true, data: "score-1" })),
  undoEmailRewrite: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("./people-actions", () => ({ startPeopleSearch: vi.fn(), applyHiringContact: vi.fn(), undoHiringContact: vi.fn() }));
vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));
vi.mock("@/lib/jobs/actions", () => ({ retry: vi.fn(async () => ({ ok: true, data: null })) }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => null }));
// Jobs report whatever the test says, as the real hook would.
const jobs = vi.hoisted(() => ({ listeners: new Map<string, (job: unknown) => void>(), revisions: new Map<string, number>() }));
vi.mock("@/hooks/use-job", async () => {
  const { useEffect } = await import("react");
  return {
    useJob: (id: string | null, revision: number, onChange?: (job: unknown) => void) => {
      useEffect(() => {
        if (!id) return;
        jobs.listeners.set(id, (job) => onChange?.(job));
        jobs.revisions.set(id, revision);
        return () => void jobs.listeners.delete(id);
      });
      return null;
    },
  };
});

function report(job: Partial<JobView>) {
  const view = { id: "job-1", type: "regenerate-unit", status: "RUNNING", step: null, error: null, result: null, ...job };
  act(() => jobs.listeners.get(view.id)?.(view));
}
vi.mock("@/components/change-status", () => ({ changeStatus: vi.fn() }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));

const theme = (id: string) => BUILT_IN_THEMES.find((entry) => entry.id === id)!;

const props: ApplicationViewProps = {
  application: {
    id: "app-1",
    title: "Senior Product Designer · Ledgerly",
    company: "Ledgerly",
    location: "Amsterdam",
    status: "DRAFT",
    tone: "WARM",
    language: "English",
    followThemeLayout: false,
    showPhoto: null,
    archived: false,
    nextInterviewAt: null,
  },
  posting: { text: "Ledgerly is hiring.\n\n  - Figma", url: "", pasted: "27 Sep" },
  match: null,
  requirements: [],
  facts: [{ id: "f1", text: "I know their product as a customer." }],
  activity: [{ kind: "created", id: "created", date: "27 Sep" }],
  meta: ["Amsterdam"],
  resume: { units: demoResumeUnits(), theme: theme("editorial") },
  letter: { units: demoLetterUnits(), theme: theme("editorial") },
  themes: [...BUILT_IN_THEMES, { ...theme("modern"), id: "mine", name: "Mine", builtIn: false }],
  sections: DEFAULT_SECTION_LAYOUT,
  ownSections: false,
  sent: false,
  canUpdate: false,
  baseSections: [],
  baseThemeId: "modern",
  email: null,
  writingEmail: null,
  attachments: { resume: "Jane Doe – Ledgerly – Resume.pdf", letter: "Jane Doe – Ledgerly – Cover letter.pdf" },
  profile: demoProfile(),
  paper: "A4",
  dateFormat: "DAY_MONTH_YEAR",
  includeReferences: false,
  letterDate: new Date(Date.UTC(2026, 8, 28)),
  score: { hit: 5, total: 7 },
  initialTab: "resume",
  aiReady: true,
  rewriting: [],
  messages: [],
  refining: null,
};

beforeEach(() => {
  window.history.replaceState(null, "", "/applications/app-1");
  vi.mocked(setFollowThemeLayout).mockClear();
  vi.mocked(setApplicationTheme).mockClear();
  vi.mocked(setCoverLetterLayout).mockClear();
  vi.mocked(saveUnit).mockClear();
  vi.mocked(startRegenerating).mockClear();
  vi.mocked(restoreUnit).mockClear();
  vi.mocked(sendMessage).mockClear();
  vi.mocked(undoMessage).mockClear();
  vi.mocked(startWritingEmail).mockClear();
  vi.mocked(undoEmailRewrite).mockClear();
  vi.mocked(toast).mockClear();
  router.refresh.mockClear();
  router.push.mockClear();
});

const summary = demoResumeUnits()[0];

describe("the document tabs (E8-2)", () => {
  it("has Resume, Cover letter, Email and the posting with its match", () => {
    render(<ApplicationView {...props} />);
    const tabs = within(screen.getByRole("tablist", { name: "Application" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Resume", "Cover letter", "Email", "Job posting · 5/7 match", "People", "Notes"]);
    expect(screen.getByRole("tab", { name: "Resume" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens the hiring contacts introduction in the People tab", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.click(screen.getByRole("tab", { name: "People" }));
    expect(window.location.search).toBe("?tab=people");
    const people = screen.getByRole("tabpanel", { name: "People" });
    expect(within(people).getByRole("heading", { name: "Hiring contacts" })).toBeVisible();
    expect(within(people).getByText(/look for people involved in hiring for this role/)).toBeVisible();
    expect(within(people).getByRole("button", { name: "Find hiring contacts" })).toBeEnabled();
    expect(screen.queryByRole("complementary", { name: "Refine with AI" })).not.toBeInTheDocument();
  });

  it("starts an on-demand People search and follows the application job", async () => {
    vi.mocked(startPeopleSearch).mockResolvedValue({ ok: true, data: "people-job" });
    const user = userEvent.setup();
    render(<ApplicationView {...props} initialTab="people" />);
    await user.click(screen.getByRole("button", { name: "Find hiring contacts" }));
    expect(startPeopleSearch).toHaveBeenCalledWith({ id: props.application.id });
    expect(await screen.findByText("Starting the search…")).toBeVisible();
    expect(jobs.listeners.has("people-job")).toBe(true);
  });

  it("shows a saved contact with evidence and applies it to one existing draft", async () => {
    const user = userEvent.setup();
    const searchedAt = "2026-11-22T08:00:00.000Z";
    vi.mocked(applyHiringContact).mockResolvedValue({ ok: true, data: { previous: null, updated: "Dear Maya Rao," } });
    render(<ApplicationView {...props} initialTab="people" peopleSearch={{
      postingFingerprint: "a".repeat(64), activeJob: null, previousError: null,
      saved: {
        version: 1, status: "found", fingerprint: "a".repeat(64), searchedAt, partial: false,
        contacts: [{
          id: "contact-1", name: "Maya Rao", title: "Design Director", relationship: "likely_team_lead",
          reason: "Leads the relevant design team.", linkedinUrl: "https://www.linkedin.com/in/maya",
          sources: [{ title: "Company design team", url: "https://example.com/design", excerpt: "Maya leads Design." }],
        }],
      },
    }} />);
    expect(screen.getByRole("heading", { name: "Maya Rao" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Company design team" })).toHaveAttribute("href", "https://example.com/design");
    expect(screen.queryByRole("button", { name: "Use in email" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use in cover letter" }));
    expect(applyHiringContact).toHaveBeenCalledWith(expect.objectContaining({ target: "COVER_LETTER", contactId: "contact-1", searchedAt }));
    expect(await screen.findByRole("button", { name: "Undo greeting change" })).toBeVisible();
  });

  it("keeps the tab in the URL", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.click(screen.getByRole("tab", { name: "Cover letter" }));
    expect(window.location.search).toBe("?tab=letter");
    await user.click(screen.getByRole("tab", { name: "Resume" }));
    expect(window.location.search).toBe("");
  });

  it("opens on the tab from the URL", () => {
    render(<ApplicationView {...props} initialTab="posting" />);
    expect(screen.getByRole("tab", { name: /Job posting/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Ledgerly is hiring\./)).toHaveTextContent("Ledgerly is hiring. - Figma");
    // The application's facts for the AI come first (APP-15).
    const facts = screen.getByRole("region", { name: "Facts for this application" });
    expect(within(facts).getByLabelText("Fact 1")).toHaveValue("I know their product as a customer.");
    expect(within(facts).getByRole("link", { name: "Facts about me" })).toHaveAttribute("href", "/profile?section=facts");
  });

  it("shows the tailored resume in its theme, in a single column by default", () => {
    render(<ApplicationView {...props} />);
    expect(screen.getByText(/^Tailored resume ·/)).toHaveTextContent("Tailored resume · Editorial");
    const resume = screen.getByRole("article", { name: "Resume" });
    expect(resume.querySelector('[data-unit="summary"]')).toHaveTextContent(demoResumeUnits()[0].text);
    // Editorial is a single-column theme: nothing to switch.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("lets a sidebar theme use its own layout, saved on the application", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} resume={{ units: demoResumeUnits(), theme: theme("modern") }} />);
    const resume = screen.getByRole("article", { name: "Resume" });
    expect(within(resume).queryByText("Contact")).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Sidebar layout" }));
    expect(setFollowThemeLayout).toHaveBeenCalledWith({ id: "app-1", follow: true });
  });

  it("has a Photo switch while the profile has a photo, starting from its Show on resumes (#224)", async () => {
    const user = userEvent.setup();
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const profile = { ...props.profile, photo: { src: png, onResumes: true } };
    render(<ApplicationView {...props} profile={profile} />);
    const resume = screen.getByRole("article", { name: "Resume" });
    expect(within(resume).getByRole("img", { name: profile.basics.name })).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: "Photo" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(setShowPhoto).toHaveBeenCalledWith({ id: "app-1", show: false });
  });

  it("shows the photo as the application says, and has no Photo switch without one (#224)", () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const profile = { ...props.profile, photo: { src: png, onResumes: false } };
    const { unmount } = render(<ApplicationView {...props} profile={profile} application={{ ...props.application, showPhoto: true }} />);
    expect(screen.getByRole("switch", { name: "Photo" })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByRole("article", { name: "Resume" })).getByRole("img")).toBeInTheDocument();
    unmount();

    render(<ApplicationView {...props} />);
    expect(screen.queryByRole("switch", { name: "Photo" })).not.toBeInTheDocument();
  });

  it("changes the resume's and cover letter's theme together from the Theme menu (#226)", async () => {
    const user = userEvent.setup();
    let answer: (result: { ok: true; data: null }) => void = () => {};
    vi.mocked(setApplicationTheme).mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    render(<ApplicationView {...props} />);
    expect(screen.queryByRole("switch", { name: "Sidebar layout" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Resume controls" }));
    expect(screen.queryByRole("button", { name: "Editorial theme" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editorial theme, in use" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Modern theme" }));
    expect(setApplicationTheme).toHaveBeenCalledWith({ id: "app-1", themeId: "modern" });
    expect(screen.getByRole("button", { name: "Modern theme, in use" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Sidebar layout" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Cover letter" }));
    expect(screen.getByRole("button", { name: "Modern theme" })).toBeInTheDocument();
    await act(async () => answer({ ok: true, data: null }));
  });

  it("doesn't save the theme the documents already have", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} initialTab="letter" />);
    await user.click(screen.getByRole("button", { name: "Editorial theme" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Editorial" }));
    expect(setApplicationTheme).not.toHaveBeenCalled();
  });

  it("follows the theme's layout when the application says so", () => {
    render(
      <ApplicationView
        {...props}
        application={{ ...props.application, followThemeLayout: true }}
        resume={{ units: demoResumeUnits(), theme: theme("modern") }}
      />,
    );
    expect(screen.getByRole("switch", { name: "Sidebar layout" })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByRole("article", { name: "Resume" })).getByText("Contact")).toBeInTheDocument();
  });

  it("lays out the cover letter with its word count", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.click(screen.getByRole("tab", { name: "Cover letter" }));
    const letter = screen.getByRole("article", { name: "Cover letter" });
    expect(within(letter).getByText("28 September 2026")).toBeInTheDocument();
    expect(within(letter).getByText("Ledgerly · Hiring team")).toBeInTheDocument();
    expect(within(letter).getByText("Dear Ledgerly team,")).toBeInTheDocument();
    expect(screen.getByText(/^Cover letter · about \d+0 words$/)).toBeInTheDocument();
  });

  it("scores the tailored resume on request, and shows the score with its reasons (#370)", async () => {
    const user = userEvent.setup();
    const view = render(<ApplicationView {...props} />);
    await user.click(screen.getByRole("button", { name: "Score" }));
    expect(startScoringResume).toHaveBeenCalledWith({ id: props.application.id });
    expect(screen.getByRole("button", { name: "Scoring…" })).toBeDisabled();
    view.unmount();
    const fit = { score: 82, reasons: ["Payments, as the posting asks"], redFlags: ["No Dutch"], scoredWith: "score-posting@2", scoredAt: "2026-11-08T12:00:00.000Z" };
    render(<ApplicationView {...props} resumeFit={fit} />);
    expect(screen.getByRole("img", { name: "Score 82 of 100" })).toBeInTheDocument();
    expect(screen.getByText("Good fit")).toBeInTheDocument();
    expect(screen.getByText("Payments, as the posting asks Watch out: No Dutch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Score again" })).toBeInTheDocument();
  });

  it("says so when a document is missing, and writes it on request (#367)", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} resume={null} score={null} />);
    expect(screen.getByText("This application was created without a tailored resume.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Job posting" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Write the tailored resume" }));
    expect(startWritingDocument).toHaveBeenCalledWith({ id: props.application.id, kind: "RESUME" });
  });

  it("introduces the cover letter and starts a draft on request", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} initialTab="letter" letter={null} />);
    const panel = screen.getByRole("tabpanel", { name: "Cover letter" });
    expect(within(panel).getByRole("heading", { name: "Cover letter" })).toBeVisible();
    expect(within(panel).getByText(/draft a cover letter tailored to this role/)).toBeVisible();
    await user.click(within(panel).getByRole("button", { name: "Write the cover letter" }));
    expect(startWritingDocument).toHaveBeenCalledWith({ id: props.application.id, kind: "COVER_LETTER" });
    expect(await within(panel).findByRole("button", { name: "Writing the cover letter…" })).toBeDisabled();
  });
});

describe("editing a unit (E8-3)", () => {
  it("gives every unit a focusable frame with its toolbar", () => {
    render(<ApplicationView {...props} />);
    expect(screen.getByText("Hover a section to edit or regenerate it")).toBeInTheDocument();
    const frame = screen.getByRole("group", { name: "Summary" });
    expect(frame).toHaveAttribute("tabindex", "0");
    expect(frame).toHaveAttribute("data-unit", "summary");
    expect(within(frame).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    // Printed parts that aren't units, like the header, have none.
    expect(screen.getAllByRole("group")).toHaveLength(demoResumeUnits().length);
  });

  it("leaves a part of the resume out, with Undo on the toast (#217)", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    const frame = screen.getByRole("group", { name: "Summary" });
    expect(within(frame).getAllByRole("button").map((button) => button.textContent)).toEqual(["Edit", "Regenerate", "Ask AI", "Leave out"]);
    await user.click(within(frame).getByRole("button", { name: "Leave out" }));
    expect(leaveOutUnit).toHaveBeenCalledWith({ id: "app-1", unitId: "summary" });
    expect(toast).toHaveBeenLastCalledWith("Left out: Summary.", { action: expect.objectContaining({ label: "Undo" }) });
    await act(async () => vi.mocked(toast).mock.lastCall?.[1]?.action?.onClick());
    expect(putBackTrimmed).toHaveBeenCalledWith({ id: "app-1", index: 2 });
    expect(toast).toHaveBeenLastCalledWith("Put back.");
  });

  it("allows Ask AI on a publication while keeping automatic regeneration off", () => {
    render(<ApplicationView {...props} />);
    const publication = screen.getByRole("group", { name: /^Publication “Doe, J\./ });
    expect(within(publication).getAllByRole("button").map((button) => button.textContent)).toEqual(["Edit", "Ask AI", "Leave out"]);
    expect(within(publication).getByText("Doe, J.").tagName).toBe("STRONG");
  });

  it("allows Ask AI on a certification while keeping automatic regeneration off", () => {
    render(<ApplicationView {...props} />);
    const certification = screen.getByRole("group", { name: /^Certification “Certified Accessibility Specialist”/ });
    expect(within(certification).getAllByRole("button").map((button) => button.textContent)).toEqual(["Edit", "Ask AI", "Leave out"]);
  });

  it("leaves nothing out of the cover letter", () => {
    render(<ApplicationView {...props} initialTab="letter" />);
    expect(screen.queryByRole("button", { name: "Leave out" })).not.toBeInTheDocument();
  });

  it("swaps in a text box and saves what was written", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ApplicationView {...props} />);
    const frame = screen.getByRole("group", { name: "Summary" });
    await user.click(within(frame).getByRole("button", { name: "Edit" }));

    const box = screen.getByRole("textbox", { name: "Edit Summary" });
    expect(box).toHaveFocus();
    expect(box).toHaveValue(summary.text);
    await user.clear(box);
    await user.type(box, "Calm tools for complex work.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveUnit).toHaveBeenCalledWith({
      id: "app-1",
      document: "RESUME",
      unitId: "summary",
      text: "Calm tools for complex work.",
      expected: summary.text,
    });
    expect(screen.queryByRole("textbox", { name: /^Edit / })).not.toBeInTheDocument();
    // The action refreshes the page with the saved text.
    const units = demoResumeUnits().map((unit) => (unit.id === "summary" ? { ...unit, text: "Calm tools for complex work." } : unit));
    rerender(<ApplicationView {...props} resume={{ units, theme: theme("editorial") }} />);
    expect(screen.getByRole("group", { name: "Summary" })).toHaveTextContent("Calm tools for complex work.");
  });

  it("keeps a role's title line while its bullets are edited", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    const role = screen.getByRole("group", { name: "Studio Brik role" });
    await user.click(within(role).getByRole("button", { name: "Edit" }));
    expect(role).toHaveTextContent(/^UX Designer, Studio Brik/);
    expect(within(role).getByRole("textbox")).toHaveAccessibleDescription("One bullet per line");
  });

  it("cancels with Escape and keeps the text", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.click(within(screen.getByRole("group", { name: "Summary" })).getByRole("button", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Edit Summary" }), " More.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Summary" })).toHaveTextContent(summary.text);
    expect(saveUnit).not.toHaveBeenCalled();
  });

  it("keeps the editor open with the text when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(saveUnit).mockResolvedValueOnce({ ok: false, error: "This part changed while you were editing it." });
    render(<ApplicationView {...props} />);
    await user.click(within(screen.getByRole("group", { name: "Summary" })).getByRole("button", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Edit Summary" }), " More.");
    await user.keyboard("{Control>}{Enter}{/Control}");

    // The save runs in a transition: wait for it to come back.
    await waitFor(() => expect(toast).toHaveBeenCalledWith("This part changed while you were editing it."));
    expect(screen.getByRole("textbox", { name: "Edit Summary" })).toHaveValue(`${summary.text} More.`);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
  });

  it("glows for a moment after a save", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ApplicationView {...props} />);
      const frame = screen.getByRole("group", { name: "Summary" });
      await user.click(within(frame).getByRole("button", { name: "Edit" }));
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(frame.className).toMatch(/flash/);
      act(() => vi.advanceTimersByTime(1700));
      expect(frame.className).not.toMatch(/flash/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks details the fact guard couldn't back", async () => {
    const user = userEvent.setup();
    const units = demoResumeUnits().map((unit) => (unit.id === "summary" ? { ...unit, unverified: ["40%", "2019"] } : unit));
    render(<ApplicationView {...props} resume={{ units, theme: theme("editorial") }} />);
    const marker = screen.getByRole("button", { name: "Check this: “40%”, “2019”" });
    await user.click(marker);
    expect(screen.getByText(/I couldn't find “40%”, “2019” in your profile or the posting/)).toBeInTheDocument();
  });
});

describe("regenerating a unit (E8-4)", () => {
  const rewritten = { text: "A new summary.", unverified: undefined };
  const toastAction = () => vi.mocked(toast).mock.lastCall?.[1]?.action;

  it("dims the unit while it's rewritten and leaves the rest usable", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    const frame = screen.getByRole("group", { name: "Summary" });
    await user.click(within(frame).getByRole("button", { name: "Regenerate" }));

    expect(startRegenerating).toHaveBeenCalledWith({ id: "app-1", document: "RESUME", unitId: "summary" });
    expect(frame).toHaveAttribute("aria-busy", "true");
    expect(within(frame).getByText("Rewriting…")).toBeInTheDocument();
    expect(within(frame).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Skills" })).getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows the new text with Undo on the toast", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    const frame = screen.getByRole("group", { name: "Summary" });
    await user.click(within(frame).getByRole("button", { name: "Regenerate" }));
    report({ status: "DONE", result: { outcome: "rewritten", previous: summary, unit: { ...summary, ...rewritten } } });

    expect(frame).not.toHaveAttribute("aria-busy");
    expect(router.refresh).toHaveBeenCalled();
    expect(frame.className).toMatch(/flash/);
    expect(toast).toHaveBeenLastCalledWith("Rewrote the summary.", { action: expect.objectContaining({ label: "Undo" }) });

    await act(async () => toastAction()?.onClick());
    expect(restoreUnit).toHaveBeenCalledWith({
      id: "app-1",
      document: "RESUME",
      unitId: "summary",
      text: summary.text,
      unverified: undefined,
      expected: "A new summary.",
    });
    expect(toast).toHaveBeenLastCalledWith("Put the summary back.");
  });

  it("keeps an edit made meanwhile", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.click(within(screen.getByRole("group", { name: "Summary" })).getByRole("button", { name: "Regenerate" }));
    report({ status: "DONE", result: { outcome: "changed" } });
    expect(toast).toHaveBeenLastCalledWith("The summary changed while I was rewriting it, so I left your version.");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("restores the unit on failure and offers Retry", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    const frame = screen.getByRole("group", { name: "Summary" });
    await user.click(within(frame).getByRole("button", { name: "Regenerate" }));
    report({ status: "FAILED", error: "The AI server didn't answer in time." });

    expect(frame).not.toHaveAttribute("aria-busy");
    expect(frame).toHaveTextContent(summary.text);
    expect(toast).toHaveBeenLastCalledWith("The AI server didn't answer in time.", { action: expect.objectContaining({ label: "Retry" }) });

    await act(async () => toastAction()?.onClick());
    expect(retry).toHaveBeenCalledWith({ id: "job-1" });
    expect(frame).toHaveAttribute("aria-busy", "true");
    expect(jobs.revisions.get("job-1")).toBe(1);
  });

  it("picks up a rewrite that was running before a reload", () => {
    render(<ApplicationView {...props} rewriting={[{ jobId: "job-7", document: "COVER_LETTER", unitId: "paragraph:2" }]} initialTab="letter" />);
    expect(screen.getByText("Rewriting…").closest("[data-unit]")).toHaveAttribute("data-unit", "paragraph:2");
  });

  it("points to Settings without an AI provider", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} aiReady={false} />);
    await user.click(within(screen.getByRole("group", { name: "Summary" })).getByRole("button", { name: "Regenerate" }));
    expect(startRegenerating).not.toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith("That needs an AI provider. Choose one in Settings → AI provider.", {
      action: expect.objectContaining({ label: "Open Settings" }),
    });
    toastAction()?.onClick();
    expect(router.push).toHaveBeenCalledWith("/settings?section=ai");
  });
});

describe("the Refine with AI panel (E8-5)", () => {
  const opening = {
    id: "m1",
    role: "AI" as const,
    text: "Here's what I tailored for Ledgerly:\n\n- Rewrote your summary\n- Wrote a warm cover letter\n\nNothing invented: every line comes from your profile.",
    targetUnit: null,
    opening: true,
    canUndo: false,
    undone: false,
  };
  const panel = () => screen.getByRole("complementary", { name: "Refine with AI" });
  const input = () => screen.getByRole("textbox", { name: "Ask for a change" });

  it("shows the conversation, with the opening list and its footnote", () => {
    render(
      <ApplicationView
        {...props}
        messages={[opening, { id: "m2", role: "USER", text: "Shorter please", targetUnit: "Summary", opening: false, canUndo: false, undone: false }]}
      />,
    );
    const log = within(panel()).getByRole("log", { name: "Conversation" });
    expect(within(log).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Rewrote your summary", "Wrote a warm cover letter"]);
    expect(within(log).getByText("Nothing invented: every line comes from your profile.")).toHaveClass("text-muted");
    expect(within(log).getByText("About: Summary")).toBeInTheDocument();
  });

  it("keeps the heading in the conversation scroll area and the composer outside it", () => {
    render(<ApplicationView {...props} />);
    const log = within(panel()).getByRole("log", { name: "Conversation" });
    expect(within(log).getByRole("heading", { name: "Refine with AI" })).toBeInTheDocument();
    expect(within(log).getByText(/^Ask for content, structure or formatting changes to this resume/)).toBeInTheDocument();
    expect(log).not.toContainElement(input());
    expect(log).not.toContainElement(within(panel()).getByRole("button", { name: "Send" }));
  });

  it("changes its subtitle with the tab without showing suggestion buttons", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    expect(within(panel()).getByText(/^Ask for content, structure or formatting changes to this resume/)).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Make the summary shorter" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Cover letter" }));
    expect(within(panel()).getByText(/^Ask for content, structure or formatting changes to this cover letter/)).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Make it more formal" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Job posting/ }));
    expect(within(panel()).getByText("Switch to the resume, cover letter or email to make changes.")).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: /Make/ })).not.toBeInTheDocument();
  });

  it("sends a typed request about the document on screen, then thinks", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.type(input(), "Make the summary shorter{Enter}");
    expect(sendMessage).toHaveBeenCalledWith({ id: "app-1", text: "Make the summary shorter", viewing: "RESUME", target: null });
    expect(within(panel()).getByText("Thinking…")).toBeInTheDocument();
  });

  it("sends with Enter and starts a new line with Shift+Enter", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.type(input(), "Sound more{Shift>}{Enter}{/Shift}confident");
    expect(input()).toHaveValue("Sound more\nconfident");
    await user.keyboard("{Enter}");
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "Sound more\nconfident" }));
    expect(input()).toHaveValue("");
  });

  it("asks about a unit picked with Ask AI", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.click(within(screen.getByRole("group", { name: "Summary" })).getByRole("button", { name: "Ask AI" }));
    expect(input()).toHaveFocus();
    expect(input()).toHaveAttribute("placeholder", "What should change in the summary?");
    expect(within(panel()).getByText("About: Summary")).toBeInTheDocument();

    await user.type(input(), "Mention payments{Enter}");
    expect(sendMessage).toHaveBeenCalledWith({
      id: "app-1",
      text: "Mention payments",
      viewing: "RESUME",
      target: { document: "RESUME", unitId: "summary" },
    });
    expect(within(panel()).queryByRole("button", { name: "Stop asking about the summary" })).not.toBeInTheDocument();
  });

  it("drops the picked unit with ×", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.click(within(screen.getByRole("group", { name: "Summary" })).getByRole("button", { name: "Ask AI" }));
    await user.click(screen.getByRole("button", { name: "Stop asking about the summary" }));
    expect(input()).toHaveAttribute("placeholder", "Ask for a change, e.g. “sound more confident”");
  });

  it("shows the reply's edits, switching to the document they're on", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.type(input(), "Make the letter more formal{Enter}");
    report({ id: "reply-1", type: "refine", status: "DONE", result: { messageId: "m9", edited: [{ document: "COVER_LETTER", unitId: "paragraph:1" }] } });

    expect(router.refresh).toHaveBeenCalled();
    expect(within(panel()).queryByText("Thinking…")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cover letter" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("group", { name: demoLetterUnits()[0].label }).className).toMatch(/flash/);
  });

  it("keeps the message in the box when it can't be sent", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessage).mockResolvedValueOnce({ ok: false, error: "I'm still working on your last message." });
    render(<ApplicationView {...props} />);
    await user.type(input(), "Shorter{Enter}");
    expect(toast).toHaveBeenCalledWith("I'm still working on your last message.");
    expect(input()).toHaveValue("Shorter");
  });

  it("offers Retry when the reply fails", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    await user.type(input(), "Shorter{Enter}");
    report({ id: "reply-1", type: "refine", status: "FAILED", error: "The AI server didn't answer in time." });
    expect(toast).toHaveBeenLastCalledWith("The AI server didn't answer in time.", { action: expect.objectContaining({ label: "Retry" }) });
    await act(async () => vi.mocked(toast).mock.lastCall?.[1]?.action?.onClick());
    expect(retry).toHaveBeenCalledWith({ id: "reply-1" });
    expect(within(panel()).getByText("Thinking…")).toBeInTheDocument();
  });

  it("keeps thinking about a reply started before a reload", () => {
    render(<ApplicationView {...props} refining="reply-7" />);
    expect(within(panel()).getByText("Thinking…")).toBeInTheDocument();
  });

  it("answers on the Job posting tab without the AI", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} aiReady={false} initialTab="posting" />);
    await user.type(input(), "Change the salary{Enter}");
    expect(sendMessage).toHaveBeenCalledWith({ id: "app-1", text: "Change the salary", viewing: null, target: null });
  });

  it("points to Settings without an AI provider", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} aiReady={false} />);
    expect(within(panel()).getByRole("link", { name: "Choose one in Settings" })).toHaveAttribute("href", "/settings?section=ai");
    await user.type(input(), "Shorter{Enter}");
    expect(sendMessage).not.toHaveBeenCalled();
    expect(input()).toHaveValue("Shorter");
  });
});

describe("undoing an AI change (E8-6)", () => {
  const replyWith = (extra: object) => ({
    id: "m3",
    role: "AI" as const,
    text: "Trimmed your summary.",
    targetUnit: null,
    opening: false,
    canUndo: true,
    undone: false,
    ...extra,
  });
  const log = () => screen.getByRole("log", { name: "Conversation" });

  it("offers Undo under a reply that changed something", () => {
    render(
      <ApplicationView
        {...props}
        messages={[replyWith({}), replyWith({ id: "m4", text: "Your profile doesn't mention that.", canUndo: false })]}
      />,
    );
    expect(within(log()).getAllByRole("button", { name: "Undo" })).toHaveLength(1);
  });

  it("puts the change back, marks the units and says Undone", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} messages={[replyWith({})]} />);
    await user.click(within(log()).getByRole("button", { name: "Undo" }));
    expect(undoMessage).toHaveBeenCalledWith({ id: "app-1", messageId: "m3" });
    expect(screen.getByRole("group", { name: "Summary" }).className).toMatch(/flash/);
  });

  it("stays Undone after a reload", () => {
    render(<ApplicationView {...props} messages={[replyWith({ undone: true })]} />);
    expect(within(log()).getByText("Undone")).toBeInTheDocument();
    expect(within(log()).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("explains when it can't undo", async () => {
    const user = userEvent.setup();
    const why = "You've changed the summary since, so undoing this would overwrite that. Edit it by hand instead.";
    vi.mocked(undoMessage).mockResolvedValueOnce({ ok: false, error: why });
    render(<ApplicationView {...props} messages={[replyWith({})]} />);
    await user.click(within(log()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(why));
    // Back once the action has finished.
    expect(await within(log()).findByRole("button", { name: "Undo" })).toBeInTheDocument();
  });
});

describe("the Job posting tab (E8-7)", () => {
  const requirements = [
    { text: "Strong prototyping skills in Figma", kind: "skill" as const, skill: "Figma", years: null, language: null },
    { text: "Experience with Kubernetes", kind: "skill" as const, skill: "Kubernetes", years: null, language: null },
  ];
  const match = {
    items: [
      { requirement: requirements[0].text, result: "covered" as const, skill: "Figma", experienceIds: ["e2"], note: "Used at Fieldnote" },
      { requirement: requirements[1].text, result: "gap" as const, skill: null, experienceIds: [], note: "Not in your profile" },
    ],
  };
  const open = (extra: Partial<ApplicationViewProps> = {}) =>
    render(<ApplicationView {...props} match={match} requirements={requirements} initialTab="posting" {...extra} />);

  it("shows how the profile matches, then the posting as pasted", () => {
    open();
    expect(screen.getByRole("heading", { name: "How you match" })).toBeInTheDocument();
    expect(screen.getByText("1 of 2 covered by your profile")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Requirements" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Original posting" })).toBeInTheDocument();
    expect(screen.getByText(/^Ledgerly is hiring\./)).toHaveClass("whitespace-pre-wrap");
    expect(screen.getByText("Pasted 27 Sep")).toBeInTheDocument();
  });

  it("saves application context without starting an automatic resume update", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getAllByRole("button", { name: "Add for this application" })[1]);
    await user.type(screen.getByLabelText("Supporting experience"), "Deployed Kubernetes services.");
    await user.click(screen.getByRole("button", { name: "Save for this application" }));
    expect(addApplicationEvidence).toHaveBeenCalledWith({ id: "app-1", evidence: expect.objectContaining({ requirementIndex: 1, text: "Deployed Kubernetes services.", targetUnitId: null }) });
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
  });

  it("links to the saved posting in a new tab", () => {
    open({ posting: { ...props.posting, url: "https://jobs.ledgerly.com/senior-designer" } });
    const link = within(screen.getByRole("tabpanel", { name: /Job posting/ })).getByRole("link", { name: "jobs.ledgerly.com/senior-designer (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://jobs.ledgerly.com/senior-designer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows only the posting when it wasn't matched", () => {
    open({ match: null });
    expect(screen.queryByRole("heading", { name: "How you match" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel", { name: /Job posting/ })).queryByRole("link", { name: /opens in a new tab/ })).not.toBeInTheDocument();
  });
});

describe("downloading PDFs (E8-8)", () => {
  const download = () => screen.getByRole("link", { name: "Download PDF" });

  it("downloads the document on screen, and the resume from the Job posting tab", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} />);
    expect(download()).toHaveAttribute("href", "/api/pdf?doc=resume&application=app-1");
    await user.click(screen.getByRole("tab", { name: "Cover letter" }));
    expect(download()).toHaveAttribute("href", "/api/pdf?doc=letter&application=app-1");
    await user.click(screen.getByRole("tab", { name: /Job posting/ }));
    expect(download()).toHaveAttribute("href", "/api/pdf?doc=resume&application=app-1");
  });

  it("isn't offered without documents", () => {
    render(<ApplicationView {...props} resume={null} letter={null} />);
    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
  });
});

describe("notes and activity (E8-9)", () => {
  const activity = [
    { kind: "note" as const, id: "n1", body: "Called John.\nSecond round next week.", date: "3 Oct", edited: false },
    { kind: "status" as const, id: "e2", status: "INTERVIEW" as const, date: "3 Oct" },
    { kind: "note" as const, id: "n2", body: "Sent a thank-you.", date: "1 Oct", edited: true },
    { kind: "status" as const, id: "e1", status: "SENT" as const, date: "1 Oct" },
    { kind: "created" as const, id: "created" as const, date: "28 Sep" },
  ];
  const open = () => render(<ApplicationView {...props} activity={activity} initialTab="notes" />);
  const timeline = () => screen.getByRole("list", { name: "Notes and activity" });

  beforeEach(() => {
    vi.mocked(addNote).mockClear();
    vi.mocked(updateNote).mockClear();
    vi.mocked(deleteNote).mockClear();
    vi.mocked(restoreNote).mockClear();
  });

  it("has a Notes tab with the number of notes", () => {
    open();
    expect(screen.getByRole("tab", { name: "Notes · 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Private and never sent to the AI")).toBeInTheDocument();
  });

  it("shows notes and status changes in one timeline, newest first", () => {
    open();
    const items = within(timeline()).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Called John.\nSecond round next week.3 OctEditDelete",
      "Moved to Interview3 Oct",
      "Sent a thank-you.1 Oct · editedEditDelete",
      "Moved to Sent1 Oct",
      "Created28 Sep",
    ]);
  });

  it("adds a note", async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("Add a note"), "Recruiter said salary is flexible.");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(addNote).toHaveBeenCalledWith({ id: "app-1", body: "Recruiter said salary is flexible." });
    expect(screen.getByLabelText("Add a note")).toHaveValue("");
  });

  it("edits a note in place", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Edit the note from 1 Oct" }));
    const box = screen.getByRole("textbox", { name: "Edit note" });
    expect(box).toHaveFocus();
    await user.type(box, " And a follow-up.");
    await user.click(within(timeline()).getByRole("button", { name: "Save" }));
    expect(updateNote).toHaveBeenCalledWith({ id: "app-1", noteId: "n2", body: "Sent a thank-you. And a follow-up." });
  });

  it("deletes a note with Undo on the toast", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Delete the note from 3 Oct" }));
    expect(deleteNote).toHaveBeenCalledWith({ id: "app-1", noteId: "n1" });
    expect(toast).toHaveBeenLastCalledWith("Note deleted.", { action: expect.objectContaining({ label: "Undo" }) });
    await act(async () => vi.mocked(toast).mock.lastCall?.[1]?.action?.onClick());
    expect(restoreNote).toHaveBeenCalledWith({
      id: "app-1",
      body: "Called John.",
      createdAt: "2026-10-03T13:00:00.000Z",
      updatedAt: "2026-10-03T13:00:00.000Z",
    });
  });

  it("keeps the refine panel to the documents", () => {
    open();
    expect(within(screen.getByRole("complementary", { name: "Refine with AI" })).getByText("Switch to the resume, cover letter or email to make changes.")).toBeInTheDocument();
  });
});

describe("one-page trimming on the Resume tab (E10-10)", () => {
  it("lists what was left out, each with Put back", async () => {
    const user = userEvent.setup();
    const trimmed = [
      { kind: "unit" as const, unit: { id: "experience:e3", label: "Studio Brik role", text: "Built things" }, index: 3 },
      { kind: "bullets" as const, unitId: "experience:e2", label: "Fieldnote role", lines: ["Ran research"] },
    ];
    render(<ApplicationView {...props} resume={{ units: demoResumeUnits(), theme: theme("editorial"), trimmed }} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Left out to fit the page limit:Studio Brik rolePut back1 bullet from the Fieldnote rolePut back");
    await user.click(within(note).getByRole("button", { name: "Put back 1 bullet from the Fieldnote role" }));
    expect(putBackTrimmed).toHaveBeenCalledWith({ id: "app-1", index: 1 });
    expect(toast).toHaveBeenLastCalledWith("Put back.");
  });

  it("lists parts left out by hand with them, and says which the page limit left out (#217)", async () => {
    const user = userEvent.setup();
    const trimmed = [
      { kind: "unit" as const, unit: { id: "experience:e3", label: "Studio Brik role", text: "Built things" }, index: 3 },
      { kind: "unit" as const, unit: { id: "languages", label: "Languages", text: "Dutch: Native" }, index: 9, byHand: true as const },
    ];
    render(<ApplicationView {...props} resume={{ units: demoResumeUnits(), theme: theme("editorial"), trimmed }} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Left out of this resume:Studio Brik role · to fit the page limitPut backLanguagesPut back");
    await user.click(within(note).getByRole("button", { name: "Put back the Languages" }));
    expect(putBackTrimmed).toHaveBeenCalledWith({ id: "app-1", index: 1 });
    expect(toast).toHaveBeenLastCalledWith("Put back.");
  });

  it("says nothing when nothing was left out", () => {
    render(<ApplicationView {...props} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("version history (E8-10)", () => {
  const written = { id: "v1", cause: "WRITTEN" as const, detail: "", createdAt: "2026-09-29T08:05:00.000Z" };
  const refined = { id: "v2", cause: "REFINED" as const, detail: "Make it shorter", createdAt: "2026-09-29T09:10:00.000Z" };

  it("lists the versions with why and when, and says when there are none", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ApplicationView {...props} />);
    await user.click(screen.getAllByRole("button", { name: "History" })[0]);
    expect(await screen.findByText("No versions yet. The next AI change saves the first one.")).toBeInTheDocument();
    expect(listVersions).toHaveBeenCalledWith({ id: props.application.id, document: "RESUME" });
    unmount();

    vi.mocked(listVersions).mockResolvedValueOnce({ ok: true, data: [refined, written] });
    render(<ApplicationView {...props} />);
    await user.click(screen.getAllByRole("button", { name: "History" })[0]);
    const list = await screen.findByRole("list", { name: "Versions" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Changed from the chat: “Make it shorter”");
    expect(items[0]).toHaveTextContent("· the newest");
    expect(items[1]).toHaveTextContent("Written by the AI");
  });

  it("shows an earlier version in place, restores it, or goes back", async () => {
    const user = userEvent.setup();
    vi.mocked(listVersions).mockResolvedValue({ ok: true, data: [written] });
    const older = demoResumeUnits().map((unit) => (unit.id === "summary" ? { ...unit, text: "An older summary." } : unit));
    vi.mocked(loadVersion).mockResolvedValue({ ok: true, data: { document: "RESUME", units: older, state: null } });
    render(<ApplicationView {...props} />);

    await user.click(screen.getAllByRole("button", { name: "History" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Look at the version from/ }));
    expect(loadVersion).toHaveBeenCalledWith({ id: props.application.id, versionId: "v1" });
    expect(screen.getByRole("note")).toHaveTextContent("You're looking at the version from");
    expect(screen.getByRole("note")).toHaveTextContent("Written by the AI.");
    expect(screen.getByText("An older summary.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Resume controls" }));
    expect(screen.getByText("Return to the current resume to change its theme or sections.")).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Customize" })).not.toBeInTheDocument();
    // No editing tools on an earlier version.
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to the current one" }));
    expect(screen.queryByText("An older summary.")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "History" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Look at the version from/ }));
    await user.click(screen.getByRole("button", { name: "Restore this version" }));
    expect(restoreVersion).toHaveBeenCalledWith({ id: props.application.id, versionId: "v1" });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Restore this version" })).not.toBeInTheDocument();
  });
});

describe("the Email tab", () => {
  const email = [
    { id: "to", label: "Recipient", text: "John Doe <john@example.com>" },
    { id: "subject", label: "Subject", text: "Application: Senior Product Designer, Jane Doe" },
    { id: "body", label: "Message", text: "Dear John,\n\nI'd love to bring calm to Ledgerly's payments.\n\nWarm regards,\nJane Doe" },
  ];
  const toastAction = () => vi.mocked(toast).mock.lastCall?.[1]?.action;
  const panel = () => screen.getByRole("complementary", { name: "Refine with AI" });

  it("offers to write the email, then shows it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ApplicationView {...props} initialTab="email" />);
    await user.click(screen.getByRole("button", { name: "Write the email" }));
    expect(startWritingEmail).toHaveBeenCalledWith({ id: "app-1" });
    expect(screen.getByRole("button", { name: "Writing the email…" })).toHaveAttribute("aria-disabled", "true");

    report({ id: "email-1", type: "write-email", status: "DONE", result: { units: email, previous: null } });
    expect(router.refresh).toHaveBeenCalled();
    // The first email just appears.
    expect(toast).not.toHaveBeenCalled();
    rerender(<ApplicationView {...props} initialTab="email" email={email} />);
    const article = screen.getByRole("article", { name: "Email" });
    expect(within(article).getByRole("group", { name: "Recipient" })).toHaveTextContent("John Doe <john@example.com>");
    expect(within(article).getByRole("group", { name: "Subject" })).toHaveTextContent("Application: Senior Product Designer, Jane Doe");
    expect(within(article).getByRole("group", { name: "Message" })).toHaveTextContent("I'd love to bring calm to Ledgerly's payments.");
  });

  it("points to Settings without an AI provider", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} initialTab="email" aiReady={false} />);
    await user.click(screen.getByRole("button", { name: "Write the email" }));
    expect(startWritingEmail).not.toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith("That needs an AI provider. Choose one in Settings → AI provider.", {
      action: expect.objectContaining({ label: "Open Settings" }),
    });
  });

  it("keeps writing one started before a reload", () => {
    render(<ApplicationView {...props} initialTab="email" writingEmail="email-7" />);
    expect(screen.getByRole("button", { name: "Writing the email…" })).toBeInTheDocument();
  });

  it("copies each part and opens the email in the mail app", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} initialTab="email" email={email} />);
    await user.click(screen.getByRole("button", { name: "Copy the recipient" }));
    expect(copyText).toHaveBeenLastCalledWith("John Doe <john@example.com>");
    await user.click(screen.getByRole("button", { name: "Copy the subject" }));
    expect(copyText).toHaveBeenLastCalledWith("Application: Senior Product Designer, Jane Doe");
    expect(toast).toHaveBeenLastCalledWith("Copied the subject.");
    await user.click(screen.getByRole("button", { name: "Copy message" }));
    expect(copyText).toHaveBeenLastCalledWith(email[2].text);

    const mailto = screen.getByRole("link", { name: "Open in mail app" }).getAttribute("href")!;
    expect(mailto).toMatch(/^mailto:john@example\.com\?subject=Application%3A%20Senior/);
    expect(mailto).toContain("body=Dear%20John%2C%0D%0A%0D%0AI'd%20love");
  });

  it("lists the resume and cover letter to attach, each with its download", () => {
    render(<ApplicationView {...props} initialTab="email" email={email} />);
    expect(screen.getByRole("link", { name: "Download Jane Doe – Ledgerly – Resume.pdf" })).toHaveAttribute(
      "href",
      "/api/pdf?doc=resume&application=app-1",
    );
    expect(screen.getByRole("link", { name: "Download Jane Doe – Ledgerly – Cover letter.pdf" })).toHaveAttribute(
      "href",
      "/api/pdf?doc=letter&application=app-1",
    );
  });

  it("says when the posting gives no address, and allows editing or asking AI about the recipient", () => {
    render(<ApplicationView {...props} initialTab="email" email={[{ ...email[0], text: "" }, email[1], email[2]]} />);
    const recipient = screen.getByRole("group", { name: "Recipient" });
    expect(recipient).toHaveTextContent("The posting doesn't give an address. Edit to add one.");
    expect(within(recipient).getAllByRole("button").map((button) => button.textContent)).toEqual(["Edit", "Ask AI"]);
    expect(screen.queryByRole("button", { name: "Copy the recipient" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Subject" })).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Edit",
      "Regenerate",
      "Ask AI",
    ]);
  });

  it("rewrites it, with Undo on the toast", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} initialTab="email" email={email} />);
    await user.click(screen.getByRole("button", { name: "Rewrite" }));
    expect(startWritingEmail).toHaveBeenCalledWith({ id: "app-1" });
    expect(screen.getByRole("article", { name: "Email" })).toHaveAttribute("aria-busy", "true");

    report({ id: "email-1", type: "write-email", status: "DONE", result: { units: email, previous: email } });
    expect(screen.getByRole("group", { name: "Message" }).className).toMatch(/flash/);
    expect(toast).toHaveBeenLastCalledWith("Rewrote the email.", { action: expect.objectContaining({ label: "Undo" }) });
    await act(async () => toastAction()?.onClick());
    expect(undoEmailRewrite).toHaveBeenCalledWith({ id: "app-1", jobId: "email-1" });
    expect(toast).toHaveBeenLastCalledWith("Put the email back.");
  });

  it("offers Retry when writing fails", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} initialTab="email" />);
    await user.click(screen.getByRole("button", { name: "Write the email" }));
    report({ id: "email-1", type: "write-email", status: "FAILED", error: "The AI server didn't answer in time." });
    expect(screen.getByRole("button", { name: "Write the email" })).toBeInTheDocument();
    expect(toast).toHaveBeenLastCalledWith("The AI server didn't answer in time.", { action: expect.objectContaining({ label: "Retry" }) });
    await act(async () => toastAction()?.onClick());
    expect(retry).toHaveBeenCalledWith({ id: "email-1" });
    expect(screen.getByRole("button", { name: "Writing the email…" })).toBeInTheDocument();
  });

  it("refines the email from the chat once there is one", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ApplicationView {...props} initialTab="email" />);
    expect(within(panel()).queryByRole("button", { name: "Shorter, under 100 words" })).not.toBeInTheDocument();
    unmount();

    render(<ApplicationView {...props} initialTab="email" email={email} />);
    expect(within(panel()).getByText(/^Ask for changes to this application/)).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Shorter, under 100 words" })).not.toBeInTheDocument();
    await user.type(within(panel()).getByRole("textbox", { name: "Ask for a change" }), "Shorter, under 100 words{Enter}");
    expect(sendMessage).toHaveBeenCalledWith({ id: "app-1", text: "Shorter, under 100 words", viewing: "EMAIL", target: null });
  });

  it("switches to the email when a reply changed it", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} email={email} />);
    await user.type(screen.getByRole("textbox", { name: "Ask for a change" }), "Make the email shorter{Enter}");
    report({ id: "reply-1", type: "refine", status: "DONE", result: { messageId: "m9", edited: [{ document: "EMAIL", unitId: "body" }] } });
    expect(screen.getByRole("tab", { name: "Email" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("group", { name: "Message" }).className).toMatch(/flash/);
  });

  it("has a history of its own", async () => {
    const user = userEvent.setup();
    render(<ApplicationView {...props} initialTab="email" email={email} />);
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History of the email" })).toBeInTheDocument();
    expect(listVersions).toHaveBeenLastCalledWith({ id: "app-1", document: "EMAIL" });
  });
});


describe("the resume sidebar", () => {
  const openControls = async () => userEvent.click(screen.getByRole("tab", { name: "Resume controls" }));

  it("keeps an unfinished AI message and returns to it from Ask AI", async () => {
    render(<ApplicationView {...props} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Ask for a change" }), "Keep this draft");
    await openControls();
    expect(screen.queryByRole("textbox", { name: "Ask for a change" })).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("group", { name: "Summary" })).getByRole("button", { name: "Ask AI" }));
    expect(screen.getByRole("textbox", { name: "Ask for a change" })).toHaveValue("Keep this draft");
    expect(screen.getByRole("textbox", { name: "Ask for a change" })).toHaveFocus();
  });

  it("preserves customization across views and tabs, and cancels without saving", async () => {
    render(<ApplicationView {...props} />);
    await openControls();
    await userEvent.click(screen.getByRole("tab", { name: "Customize" }));
    const name = screen.getByRole("textbox", { name: "Theme name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Application copy");
    await userEvent.click(screen.getByRole("tab", { name: "Refine with AI" }));
    await openControls();
    await userEvent.click(screen.getByRole("tab", { name: "Sections" }));
    await userEvent.click(screen.getByRole("tab", { name: "Customize" }));
    expect(screen.getByRole("textbox", { name: "Theme name" })).toHaveValue("Application copy");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(saveApplicationTheme).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Themes" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps a failed customization draft and saves a new application theme on retry", async () => {
    vi.mocked(saveApplicationTheme).mockResolvedValueOnce({ ok: false, error: "Try again." })
      .mockResolvedValueOnce({ ok: true, data: { ...theme("editorial"), id: "new-copy", name: "My theme", builtIn: false } });
    render(<ApplicationView {...props} />);
    await openControls();
    await userEvent.click(screen.getByRole("tab", { name: "Customize" }));
    await userEvent.click(screen.getByRole("button", { name: "Save theme" }));
    expect(screen.getByRole("textbox", { name: "Theme name" })).toHaveValue("My theme");
    await userEvent.click(screen.getByRole("button", { name: "Save theme" }));
    expect(saveApplicationTheme).toHaveBeenLastCalledWith(expect.objectContaining({ applicationId: "app-1", name: "My theme" }));
    expect(screen.getByRole("tab", { name: "Themes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "My theme theme" })).toBeInTheDocument();
  });

  it("moves sections through the existing application save action", async () => {
    render(<ApplicationView {...props} />);
    await openControls();
    await userEvent.click(screen.getByRole("tab", { name: "Sections" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Summary" }));
    expect(setApplicationSections).toHaveBeenCalledWith(expect.objectContaining({ id: "app-1", off: ["summary"] }));
  });

  it("swipes between views without treating vertical or input gestures as navigation", () => {
    render(<ApplicationView {...props} />);
    const swipe = (target: Element, dx: number, dy = 0) => {
      fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: 100 }] });
      fireEvent.touchEnd(target, { changedTouches: [{ clientX: 100 + dx, clientY: 100 + dy }] });
    };
    const input = screen.getByRole("textbox", { name: "Ask for a change" });
    swipe(input, 100);
    expect(input).toBeVisible();
    swipe(screen.getByRole("log"), 20, 120);
    expect(input).toBeVisible();
    swipe(screen.getByRole("log"), 100);
    expect(screen.getByRole("tab", { name: "Themes" })).toBeVisible();
    swipe(screen.getByRole("tab", { name: "Themes" }).closest('[role=tabpanel]')!, -100);
    expect(input).toBeVisible();
  });
});
