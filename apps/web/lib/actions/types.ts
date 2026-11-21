export interface ActionState {
  error?: string;
  success?: string;
}

export const EMPTY_ACTION_STATE: ActionState = {};

export function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Please check the form.";
}
