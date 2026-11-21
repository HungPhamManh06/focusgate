import "server-only";

import { revalidatePath } from "next/cache";

/** Invalidate the shell (wallet balance) and every data-driven screen. */
export function revalidateWorkspace(): void {
  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  revalidatePath("/planner");
  revalidatePath("/focus");
  revalidatePath("/wallet");
  revalidatePath("/statistics");
}
