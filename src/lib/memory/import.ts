import type { RolepilotExport } from "@/lib/data-export";

/** Validate all memory relationships before an import deletes existing data. */
export function validateMemoryImport(data: RolepilotExport) {
  const memory = data.memory;
  if (!memory) return;
  const ids = (rows: { id: string }[]) => new Set(rows.map(row => row.id));
  const facts = ids(memory.facts), sources = ids(memory.sources), applications = ids(data.applications);
  const roles = ids(data.profile.experience), projects = ids(data.profile.projects);
  const messages = ids(data.applications.flatMap(row => row.messages));
  const documents = ids(data.applications.flatMap(row => row.documents));
  const appFacts = ids(data.applications.flatMap(row => row.facts));
  const fail = () => { throw new Error("The export contains inconsistent remembered information."); };
  const unique = <T>(rows: T[], key: (row: T) => string) => { if (new Set(rows.map(key)).size !== rows.length) fail(); };
  unique(memory.facts, row => row.id); unique(memory.facts, row => row.fingerprint);
  unique(memory.sources, row => row.id); unique(memory.sources, row => `${row.sourceKey}:${row.revision}`); unique(memory.sources, row => String(row.sequence));
  unique(memory.evidence, row => `${row.sourceId}:${row.memoryFactId}`);
  if ((memory.facts.length || memory.sources.length) && !memory.state) fail();
  for (const source of memory.sources) {
    if (source.sequence > (memory.state?.nextSourceSequence ?? 0) || source.profileEpoch > (memory.state?.profileEpoch ?? 0)) fail();
    if (source.applicationId && !applications.has(source.applicationId) || source.messageId && !messages.has(source.messageId) || source.factId && !appFacts.has(source.factId) || source.documentId && !documents.has(source.documentId)) fail();
    const app = data.applications.find(app => app.id === source.applicationId);
    if (source.messageId && !app?.messages.some(row => row.id === source.messageId) || source.factId && !app?.facts.some(row => row.id === source.factId) || source.documentId && !app?.documents.some(row => row.id === source.documentId)) fail();
  }
  for (const fact of memory.facts) {
    if (fact.experienceId && !roles.has(fact.experienceId) || fact.projectId && !projects.has(fact.projectId) || fact.experienceId && fact.projectId || fact.supersededById && !facts.has(fact.supersededById)) fail();
    const visited = new Set([fact.id]);
    let next = fact.supersededById;
    while (next) { if (visited.has(next)) fail(); visited.add(next); next = memory.facts.find(row => row.id === next)?.supersededById ?? null; }
    if (fact.status === "FORGOTTEN" && (fact.text || fact.subject || fact.capabilities.length)) fail();
  }
  for (const link of memory.evidence) if (!facts.has(link.memoryFactId) || !sources.has(link.sourceId)) fail();
}
