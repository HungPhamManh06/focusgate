export function friendlyDbError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split("\n")[0]?.trim() ?? "Something went wrong.";
  const cleaned = firstLine.replace(/^error:\s*/i, "");

  if (cleaned.includes("violates foreign key constraint")) {
    return "This task is part of a plan and cannot be removed.";
  }
  if (cleaned.includes("duplicate key")) {
    return "That item already exists.";
  }
  if (cleaned.includes("permission denied")) {
    return "You do not have permission to do that.";
  }
  return cleaned;
}
