import { cn } from "@/lib/cn";
import { letterFormatting, sidebarLetterTheme, type CoverLetterLayout } from "@/lib/cover-letter-format";
import type { DocumentStyle } from "@/lib/document-state";
import { DocumentText, PlainDocumentText } from "@/components/document-text";
import { Fragment } from "react";

import { ThemeLayout, type DateFormat, type PaperSize, type Tone } from "@/generated/prisma/enums";
import { SIGN_OFF_UNIT, type Unit } from "@/lib/application-data";
import { documentLabels } from "@/lib/document-labels";
import { documentLanguage } from "@/lib/document-language";
import { defaultFrame, isFrameUnit, withFrame, type FrameUnitId } from "@/lib/letter-frame";
import type { Basics } from "@/lib/profile";
import { resolveTheme, type ThemeData } from "@/lib/themes";
import { TONES } from "@/lib/tones";

import { ContactDetail, ContactLine, DocumentPage, plainUnit, type UnitRenderer } from "./document-page";
import styles from "./document.module.css";

type CoverLetterDocumentProps = {
  theme: ThemeData;
  layout?: CoverLetterLayout;
  role?: string;
  formatting?: Record<string, DocumentStyle>;
  paper: PaperSize;
  /** The sender, for a letter without its own sender and signature units. */
  basics: Basics;
  /** The letter's parts: frame units, paragraphs ("paragraph:1", …) and its "sign-off" (E8-11). */
  units: Unit[];
  company: string;
  location: string;
  tone: Tone;
  /** The date for a letter without its own date unit, at UTC midnight. */
  date: Date;
  dateFormat: DateFormat;
  /** Overrides the "sign-off" unit; without either, the tone's sign-off. */
  signOff?: string;
  /** The language it's written in (SET-7); without one, it's read from the text. */
  language?: string | null;
  /** Draws each part; the preview's adds editing (E8-3). */
  renderUnit?: UnitRenderer;
};

/** The contact items in a typed contact line ("a · b · c"). */
const contactsIn = (line: string) =>
  line
    .split(/\s+·\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * A cover letter (APP-10) in its Classic frame or Sidebar format. Every
 * part is a unit (E8-11); a letter written
 * before that shows the parts it lacks as letters always had them.
 */
export function CoverLetterDocument({
  theme,
  layout = "CLASSIC",
  role = "",
  formatting,
  paper,
  basics,
  units,
  company,
  location,
  tone,
  date,
  dateFormat,
  signOff,
  language,
  renderUnit = plainUnit,
}: CoverLetterDocumentProps) {
  const appliedFormatting = letterFormatting(layout, formatting);
  const resolved = resolveTheme(layout === "SIDEBAR" && !formatting ? sidebarLetterTheme(theme) : theme, ThemeLayout.SINGLE, 0, paper);
  const Text = formatting || layout === "SIDEBAR" ? DocumentText : PlainDocumentText;
  const parts = withFrame(units, defaultFrame({ basics, company, location, date, dateFormat, labels: documentLabels(language) }));
  const text = (id: FrameUnitId) => parts.find((unit) => unit.id === id)?.text.trim() ?? "";
  const paragraphs = parts.filter((unit) => !isFrameUnit(unit.id) && unit.id !== SIGN_OFF_UNIT);
  const closing = signOff ?? parts.find((unit) => unit.id === SIGN_OFF_UNIT)?.text.trim() ?? TONES[tone].signOff;
  const [name = "", ...contactLines] = text("sender").split("\n");
  const { lang, dir } = documentLanguage(language, paragraphs.map((unit) => unit.text).join(" "));

  const sidebar = layout === "SIDEBAR";
  const separateContacts = parts.find(unit => unit.id === "contacts");
  const contactText = separateContacts?.text ?? contactLines.join("\n");
  const contacts = contactText.split("\n").flatMap(line => contactsIn(line));
  const headline = parts.find(unit => unit.id === "headline")?.text ?? (role.trim() || basics.headline);
  const contactBlock = () => renderUnit({ id: "contacts", className: sidebar ? styles.sidebarContacts : undefined, children: <>
    {sidebar && name.trim() && <p className={styles.sidebarContactName}><Text text={name.trim()} /></p>}
    {contacts.map((item, index) => <p key={index}><ContactDetail>{item}</ContactDetail></p>)}
  </> });
  const identity = () => renderUnit({ id: "sender", children: <p data-document-name={formatting || sidebar ? true : undefined} className={styles.senderName}><Text text={name.trim()} /></p> });
  const body = () => <>
      {renderUnit({ id: "date", className: styles.letterDate, children: text("date") })}
      {renderUnit({
        id: "recipient",
        className: styles.recipient,
        children: text("recipient")
          .split("\n")
          .map((line, index) => line.trim() && <p key={index}><Text text={line.trim()} /></p>),
      })}
      {renderUnit({ id: "greeting", className: styles.greeting, children: <Text text={text("greeting")} /> })}
      <div data-paragraphs={formatting ? true : undefined} className={styles.paragraphs}>
        {paragraphs.map(
          (unit) =>
            unit.text.trim() && (
              <Fragment key={unit.id}>
                {renderUnit({ id: unit.id, className: styles.paragraph, children: <Text text={unit.text.trim()} /> })}
              </Fragment>
            ),
        )}
      </div>
      <div className={styles.signOff}>
        {renderUnit({ id: SIGN_OFF_UNIT, children: <Text text={closing} /> })}
        {renderUnit({ id: "signature", children: <Text text={text("signature")} /> })}
      </div>
  </>;
  return (
    <DocumentPage formatting={appliedFormatting} theme={resolved} paper={paper} lang={lang} dir={dir} label="Cover letter" className={cn(styles.letter, sidebar && styles.sidebarLetter)}>
      {sidebar ? <>
        <aside className={styles.letterSidebar} data-document-header>
          {identity()}
          {headline.trim() && renderUnit({ id: "headline", className: styles.sidebarRole, children: <Text text={headline} /> })}
          {contacts.length > 0 && <><div className={styles.sidebarDivider} aria-hidden="true" />{contactBlock()}</>}
        </aside>
        <div className={styles.letterMain}>{body()}</div>
      </> : <>
        {separateContacts ? <div className={styles.sender}>{identity()}{contactBlock()}</div> : <>
      {renderUnit({
        id: "sender",
        className: styles.sender,
        children: (
          <>
            <p data-document-name={formatting ? true : undefined} className={styles.senderName}><Text text={name.trim()} /></p>
            {contactLines.map((line, index) => contactsIn(line).length > 0 && <ContactLine key={index} items={contactsIn(line)} />)}
          </>
        ),
      })}

        </>}
        {body()}
      </>}
    </DocumentPage>
  );
}
