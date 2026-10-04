export type QuestionStatus = "awaiting_survey" | "ready";
export type ResponseMode = "single" | "multiple" | "unconfirmed";

export interface Answer {
  id: string;
  rank: number;
  text: string;
  /** Survey points. Never normalised to 100. */
  count: number;
  aliases: string[];
}

export interface Survey {
  source: string;
  respondents: number | null;
  responseMode: ResponseMode;
  collectedAt: string | null;
  note: string;
}

export interface Question {
  id: string;
  category: string;
  prompt: string;
  status: QuestionStatus;
  survey: Survey;
  answers: Answer[];
  approval: { confirmedBy: string; confirmedAt: string } | null;
}

export type PackPurpose = "event" | "demo";

export interface Pack {
  schemaVersion: 1;
  packId: string;
  title: string;
  purpose: PackPurpose;
  questions: Question[];
}

export const MAX_ANSWERS = 10;
export const DEMO_LABEL = "DEMO: INVENTED RESULTS";
