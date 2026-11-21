"use client";

import { useRef, useState } from "react";

import { useTrackSave } from "@/components/save-tracker";
import { toastResult } from "@/components/toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { DocumentKind, type DateFormat, type PaperSize, type Tone } from "@/generated/prisma/enums";
import { FILE_NAME_TOKENS, resolveFileName } from "@/lib/file-name";
import { DATE_FORMATS, DOCUMENTS_TO_WRITE, DOCUMENTS_TO_WRITE_LABELS, type DocumentsToWrite } from "@/lib/settings";
import { PAPER_SIZES } from "@/lib/themes";
import { TONES } from "@/lib/tones";
import { useAutosave } from "@/hooks/use-autosave";

import { updateSettings } from "./actions";
import { SettingsSectionIntro } from "./settings-screen";

export type DocumentSettings = {
  paper: PaperSize;
  dateFormat: DateFormat;
  defaultTone: Tone;
  fileNamePattern: string;
  includeRefs: boolean;
  documentsToWrite: DocumentsToWrite;
};

/**
 * Settings → Documents (E10-3, SET-6 to SET-9): the defaults for every new
 * application. Choices save at once, the file name once typing pauses.
 */
export function DocumentsSection({
  initial,
  preview,
}: {
  initial: DocumentSettings;
  /** For the file name's preview: the user's name and the latest application, or sample values. */
  preview: { name: string; company: string; role: string };
}) {
  const track = useTrackSave();
  const [settings, setSettings] = useState(initial);
  const pattern = useRef<HTMLInputElement>(null);

  const change = (next: Partial<DocumentSettings>) => {
    const previous = settings;
    setSettings({ ...settings, ...next });
    void track(updateSettings(next)).then((result) => {
      if (!toastResult(result).ok) setSettings(previous);
    });
  };

  const { flush } = useAutosave(settings.fileNamePattern, (fileNamePattern) =>
    track(updateSettings({ fileNamePattern })),
  );

  const insertToken = (token: string) => {
    const input = pattern.current;
    const value = settings.fileNamePattern;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    setSettings({ ...settings, fileNamePattern: value.slice(0, start) + token + value.slice(end) });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const previewName = resolveFileName(settings.fileNamePattern, { ...preview, doc: DocumentKind.RESUME, date: new Date() });

  return (
    <>
      <SettingsSectionIntro title="Documents">Defaults for every new application. You can still change them per job.</SettingsSectionIntro>
      <p className="text-meta text-muted">New drafts are written in English. Existing documents and the languages listed in your profile are preserved.</p>
      <Card padding="none" className="grid gap-x-[18px] gap-y-5 px-7 py-[26px] sm:grid-cols-2">
        <Select label="Paper size" value={settings.paper} onChange={(event) => change({ paper: event.target.value as PaperSize })}>
          {Object.entries(PAPER_SIZES).map(([value, size]) => (
            <option key={value} value={value}>
              {size.label}
            </option>
          ))}
        </Select>
        <Select label="Date format" value={settings.dateFormat} onChange={(event) => change({ dateFormat: event.target.value as DateFormat })}>
          {DATE_FORMATS.map((format) => (
            <option key={format.value} value={format.value}>
              {format.label}
            </option>
          ))}
        </Select>
        <Select label="Cover letter tone" value={settings.defaultTone} onChange={(event) => change({ defaultTone: event.target.value as Tone })}>
          {Object.entries(TONES).map(([value, tone]) => (
            <option key={value} value={value}>
              {tone.label}
            </option>
          ))}
        </Select>
        <Select
          label="Documents to write"
          hint="What New application writes, unless you choose there. A skipped one can be written later from the application."
          value={settings.documentsToWrite}
          onChange={(event) => change({ documentsToWrite: event.target.value as DocumentsToWrite })}
        >
          {DOCUMENTS_TO_WRITE.map((value) => (
            <option key={value} value={value}>
              {DOCUMENTS_TO_WRITE_LABELS[value]}
            </option>
          ))}
        </Select>

        <div className="flex flex-col gap-2.5 sm:col-span-2">
          <Input
            ref={pattern}
            label="PDF file name"
            inputClassName="font-mono text-[13.5px]"
            spellCheck={false}
            value={settings.fileNamePattern}
            onChange={(event) => setSettings({ ...settings, fileNamePattern: event.target.value })}
            onBlur={flush}
          />
          <span id="file-name-tokens" className="text-label text-muted">
            Click to insert
          </span>
          <div role="group" aria-labelledby="file-name-tokens" className="flex flex-wrap gap-1.5">
            {FILE_NAME_TOKENS.map(({ token, description }) => (
              <button
                key={token}
                type="button"
                title={description}
                onClick={() => insertToken(token)}
                className="flex items-baseline gap-2 rounded-control border border-line-field bg-input px-2.5 py-1.5 hover:border-line-strong"
              >
                <span className="font-mono text-label text-ink">{token}</span>{" "}
                <span className="text-xs text-muted">{description}</span>
              </button>
            ))}
          </div>
          <p className="flex flex-wrap items-baseline gap-2 text-meta text-muted">
            <span>Preview</span>
            <output className="font-mono text-label [overflow-wrap:anywhere] text-ink">{previewName}</output>
          </p>
        </div>
      </Card>

      <Card padding="none" className="flex flex-col px-7 pt-1.5 pb-2.5">
        <Toggle
          className="py-4"
          label="Include references"
          description="Add your references to resumes when a posting asks for them. Otherwise they're left out."
          checked={settings.includeRefs}
          onCheckedChange={(includeRefs) => change({ includeRefs })}
        />
      </Card>
    </>
  );
}
