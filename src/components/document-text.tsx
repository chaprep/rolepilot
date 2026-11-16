import { Fragment } from "react";

import { citationSpans } from "@/lib/citation";
function CitationText({ text }: { text: string }) {
  return citationSpans(text).map((span, index) => {
    const content = span.italic ? <em>{span.text}</em> : span.text;
    return span.bold ? <strong key={index}>{content}</strong> : <Fragment key={index}>{content}</Fragment>;
  });
}
import { webHref } from "@/lib/web-link";

/** Explicit inline document marks, escaped by React; arbitrary HTML is never interpreted. */
export function DocumentText({ text, depth = 0 }: { text: string; depth?: number }) {
  if (depth >= 4) return <CitationText text={text} />;
  const pattern = /\[([^\]\n]+)\]\(([^)\s]+)\)|__([^\n]+?)__|==([^\n]+?)==/g;
  const parts = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(<CitationText key={`plain:${offset}`} text={text.slice(offset, match.index)} />);
    const inner = <DocumentText text={match[1] ?? match[3] ?? match[4]} depth={depth + 1} />;
    const href = match[2] ? webHref(match[2]) : null;
    parts.push(<Fragment key={`mark:${match.index}`}>{match[1] ? href ? <a href={href} rel="noreferrer" target="_blank">{inner}</a> : match[0] : match[3] ? <u>{inner}</u> : <mark>{inner}</mark>}</Fragment>);
    offset = match.index + match[0].length;
  }
  parts.push(<CitationText key={`plain:${offset}`} text={text.slice(offset)} />);
  return parts;
}

/** Unformatted legacy fields retain their original rendering. */
export function PlainDocumentText({ text }: { text: string }) { return <>{text}</>; }
