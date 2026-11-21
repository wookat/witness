/** Shared ASR segment shape across live and batch providers. */
export interface AsrSeg {
  start: number;
  end: number;
  text: string;
}
