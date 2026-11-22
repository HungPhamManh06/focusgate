export type TaskKind = "must_do" | "should_do" | "bonus";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";
export type TaskCategory = "work" | "study" | "health" | "personal" | "finance" | "other";
export type PlanStatus = "draft" | "confirmed" | "active" | "completed" | "skipped";
export type GrantStatus = "active" | "consumed" | "expired" | "revoked";
export type FocusMode = "pomodoro_25_5" | "pomodoro_50_10" | "custom" | "open_ended";

export interface Profile {
  id: string;
  displayName: string;
  timezone: string;
}

export interface RewardSettings {
  baseMinutes: number;
  bonusMinutesPerTask: number;
  extraFocusBlockMinutes: number;
  extraFocusRewardMinutes: number;
  maxBonusMinutes: number;
  dailyCapMinutes: number;
  minValidFocusMinutes: number;
}

export interface Device {
  id: string;
  name: string;
  platform: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  kind: TaskKind;
  priority: TaskPriority;
  estimatedMinutes: number;
  requiredFocusMinutes: number;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
}

export interface PlanTask {
  id: string;
  taskId: string;
  kind: TaskKind;
  requiredFocusMinutes: number;
  completedAt: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  focusDone: number;
}

export interface PlanEvent {
  id: string;
  eventType: string;
  reason: string | null;
  createdAt: string;
}

export interface PlanProgress {
  mustDoTotal: number;
  mustDoCompleted: number;
  focusRequired: number;
  focusDone: number;
  bonusCompleted: number;
}

export interface Plan {
  id: string;
  planDate: string;
  status: PlanStatus;
  confirmedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  tasks: PlanTask[];
  events: PlanEvent[];
  progress: PlanProgress;
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  planId: string | null;
  mode: FocusMode;
  plannedMinutes: number;
  minValidMinutes: number;
  actualMinutes: number;
  creditedMinutes: number;
  status: "running" | "paused" | "completed" | "cancelled";
  startedAt: string;
  endedAt: string | null;
  pausedAt?: string | null;
  pausedSeconds?: number;
  interruptionCount?: number;
  isValid: boolean;
}

export interface Grant {
  id: string;
  dailyPlanId: string | null;
  grantedMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  status: GrantStatus;
  source: string;
  expiresAt: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  grantId: string | null;
  deltaMinutes: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

export interface UsageEntry {
  id: string;
  identifier: string;
  displayName: string;
  durationSeconds: number;
  wasBlocked: boolean;
  startedAt: string;
}

export interface Wallet {
  availableMinutes: number;
  earnedMinutes: number;
  consumedMinutes: number;
  grants: Grant[];
  ledger: LedgerEntry[];
  usage: UsageEntry[];
}

export interface DayPoint {
  date: string;
  label: string;
  focusMinutes: number;
  entertainmentMinutes: number;
  tasksCompleted: number;
}

export interface Statistics {
  days: DayPoint[];
  periodDays: number;
  focusMinutes: number;
  sessionCount: number;
  tasksCompleted: number;
  openTasks: number;
  completionRate: number;
  entertainmentMinutes: number;
  validRate: number;
  bestDay: DayPoint | null;
}
