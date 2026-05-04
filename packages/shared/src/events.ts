export const HOOK_EVENTS = {
  SESSION_START: 'session_start',
  USER_PROMPT_SUBMIT: 'user_prompt_submit',
  STOP: 'stop',
  SUBAGENT_STOP: 'subagent_stop',
  PRE_TOOL_TASK: 'pre_tool_task',
  PRE_TOOL_FILE: 'pre_tool_file',
  PRE_TOOL_BASH: 'pre_tool_bash',
  POST_TOOL: 'post_tool',
  NOTIFICATION: 'notification',
} as const;

export type HookEventName = (typeof HOOK_EVENTS)[keyof typeof HOOK_EVENTS];

export interface HookEvent<P = Record<string, unknown>> {
  event: HookEventName;
  pid: number;
  cwd: string;
  ts: number;
  payload: P;
}
