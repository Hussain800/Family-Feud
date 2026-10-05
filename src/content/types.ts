export type QuestionStatus = "awaiting_survey" | "ready";
export type ResponseMode = "single" | "multiple" | "unconfirmed";

export interface Answer {
  id: string;
  rank: number;
  text: string;
  /** The points this answer scores, as supplied. Never normalised to 100. The engine scores this field only. */
  count: number;
  /** Raw survey frequency when the source gives votes and points separately (the event workbook). Never scored. */
  votes?: number;
  /** Moderator-only source guidance, e.g. what people wrote. Never projected, never an accepted alias. */
  notes?: string;
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

/** "q04" or "w04" reads as "Question 4" wherever a person sees it. */
export const questionLabel = (id: string): string => `Question ${Number(id.replace(/\D/g, "")) || id}`;
