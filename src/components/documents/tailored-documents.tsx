import type { DateFormat, PaperSize, Tone } from "@/generated/prisma/enums";
import type { DocumentData } from "@/lib/application-documents";
import type { ProfileData } from "@/lib/profile";
import type { SectionLayout } from "@/lib/resume-sections";
import { letterFormatting } from "@/lib/cover-letter-format";
import { withoutSidebar } from "@/lib/themes";

import { CoverLetterDocument } from "./cover-letter-document";
import type { UnitRenderer } from "./document-page";
import { ResumeDocument } from "./resume-document";

// An application's tailored documents, drawn the same way on its page and
// for its PDFs (E8-8); only the page passes a unit renderer.

export function TailoredResume({
  resume,
  profile,
  paper,
  followThemeLayout,
  showPhoto,
  language,
  includeReferences,
  sections,
  renderUnit,
}: {
  resume: DocumentData;
  profile: ProfileData;
  paper: PaperSize;
  /** The theme's own layout, sidebar included; otherwise its sidebar folds into a single column (APP-4). */
  followThemeLayout: boolean;
  /** The application's Photo switch (#224); null follows the profile. */
  showPhoto: boolean | null;
  language: string;
  includeReferences: boolean;
  /** Its sections' order and which are off (#297). */
  sections: SectionLayout;
  renderUnit?: UnitRenderer;
}) {
  const state = resume.state;
  return (
    <ResumeDocument
      theme={state?.theme ?? resume.theme}
      formatting={state?.styles}
      profile={state?.profile ?? profile}
      paper={state?.paper ?? paper}
      units={resume.units}
      entryOrderFromProfile={Boolean(state)}
      dateLabels={state?.dateLabels}
      layout={(state?.followThemeLayout ?? followThemeLayout) ? undefined : withoutSidebar((state?.theme ?? resume.theme).layout)}
      showPhoto={state ? state.showPhoto : showPhoto}
      language={state?.language ?? language}
      includeReferences={state?.includeReferences ?? includeReferences}
      sections={state?.sections ?? sections}
      renderUnit={renderUnit}
    />
  );
}

export function TailoredLetter({
  letter,
  profile,
  paper,
  company,
  role,
  location,
  tone,
  date,
  dateFormat,
  language,
  renderUnit,
}: {
  letter: DocumentData;
  profile: ProfileData;
  paper: PaperSize;
  company: string;
  role?: string;
  location: string;
  tone: Tone;
  date: Date;
  dateFormat: DateFormat;
  language: string;
  renderUnit?: UnitRenderer;
}) {
  const state = letter.state;
  const layout = state?.coverLetterLayout ?? letter.initialLetterLayout ?? "CLASSIC";
  return (
    <CoverLetterDocument
      theme={state?.theme ?? letter.theme}
      layout={layout}
      role={state?.role || role}
      formatting={letterFormatting(layout, state?.styles)}
      paper={state?.paper ?? paper}
      basics={state?.profile.basics ?? profile.basics}
      units={letter.units}
      company={state?.company ?? company}
      location={state?.location ?? location}
      tone={state?.tone ?? tone}
      date={state ? new Date(state.letterDate) : date}
      dateFormat={state?.dateFormat ?? dateFormat}
      language={state?.language ?? language}
      renderUnit={renderUnit}
    />
  );
}
