/**
 * FocusGate shared contracts.
 *
 * These types mirror the database enums and the RPC payloads in
 * supabase/migrations. They are the single source of truth for web, the
 * Android client and the Windows agent. Android mirrors these with Kotlin
 * sealed/data classes; the mission-critical rule is that the backend, not the
 * client, decides rewards.
 */

export type TaskKind = "must_do" | "should_do" | "bonus";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";
export type TaskCategory =
  | "work"
  | "study"
  | "health"
  | "personal"
  | "finance"
  | "other";

export type PlanStatus = "draft" | "confirmed" | "active" | "completed" | "skipped";
export type FocusSessionStatus = "running" | "paused" | "completed" | "cancelled";
export type FocusMode = "pomodoro_25_5" | "pomodoro_50_10" | "custom" | "open_ended";
export type DevicePlatform = "windows" | "android" | "web";
export type DeviceStatus = "active" | "revoked";
export type BlockCategory = "social" | "video" | "games" | "entertainment" | "other";
export type BlockRuleType = "block" | "allow";
export type BlockAction = "overlay" | "minimize" | "terminate" | "notify";
export type UnlockGrantStatus = "active" | "consumed" | "expired" | "revoked";
export type UnlockSource =
  | "daily_plan_base"
  | "bonus_task"
  | "extra_focus"
  | "adjustment";
export type LedgerReason =
  | "grant"
  | "consume"
  | "expire"
  | "revoke"
  | "adjustment";

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  kind: TaskKind;
  priority: TaskPriority;
  estimatedMinutes: number;
  requiredFocusMinutes: number;
  dueDate: string | null;
  status: TaskStatus;
  recurrenceRule: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyPlan {
  id: string;
  userId: string;
  planDate: string;
  status: PlanStatus;
  confirmedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
}

export interface DailyPlanTask {
  id: string;
  planId: string;
  taskId: string;
  kind: TaskKind;
  sortOrder: number;
  requiredFocusMinutes: number;
  plannedStart: string | null;
  completedAt: string | null;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId: string | null;
  dailyPlanId: string | null;
  deviceId: string;
  mode: FocusMode;
  plannedMinutes: number;
  actualMinutes: number;
  status: FocusSessionStatus;
  startedAt: string;
  endedAt: string | null;
  isValid: boolean;
  clientId: string;
}

export interface BlockRule {
  id: string;
  userId: string;
  deviceId: string;
  platform: DevicePlatform;
  ruleType: BlockRuleType;
  identifier: string;
  displayName: string;
  category: BlockCategory;
  action: BlockAction;
  isEnabled: boolean;
  policyVersion: number;
}

export interface UnlockGrant {
  id: string;
  userId: string;
  dailyPlanId: string;
  deviceId: string | null;
  grantedMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  status: UnlockGrantStatus;
  validFrom: string;
  expiresAt: string;
}

export interface RewardWallet {
  userId: string;
  earnedMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
}

/** Reward configuration – server-side defaults, all overridable per user. */
export interface RewardSettings {
  baseMinutes: number;
  bonusMinutesPerTask: number;
  extraFocusBlockMinutes: number;
  extraFocusRewardMinutes: number;
  maxBonusMinutes: number;
  dailyCapMinutes: number;
  minValidFocusMinutes: number;
}

export const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  baseMinutes: 30,
  bonusMinutesPerTask: 5,
  extraFocusBlockMinutes: 50,
  extraFocusRewardMinutes: 5,
  maxBonusMinutes: 30,
  dailyCapMinutes: 60,
  minValidFocusMinutes: 1,
};

/** Request/response payloads for the PostgreSQL RPCs. */
export interface EvaluateUnlockRequest {
  planId: string;
  deviceId: string;
  idempotencyKey: string;
}

export interface EvaluateUnlockResult {
  grantId: string;
  grantedMinutes: number;
  breakdown: {
    base: number;
    bonus: number;
    extraFocus: number;
    cappedAt: number;
  };
}

export interface ConsumeUnlockRequest {
  grantId: string;
  deviceId: string;
  minutes: number;
  idempotencyKey: string;
}

export interface ConsumeUnlockResult {
  grantId: string;
  consumedMinutes: number;
  remainingMinutes: number;
}

/**
 * Error codes returned by the backend. Clients must translate them, never
 * invent their own unlock decisions.
 */
export type FocusGateErrorCode =
  | "not_authenticated"
  | "forbidden"
  | "plan_not_found"
  | "plan_not_active"
  | "plan_requirements_unmet"
  | "already_granted"
  | "grant_not_found"
  | "grant_exhausted"
  | "grant_expired"
  | "invalid_input"
  | "not_implemented";
