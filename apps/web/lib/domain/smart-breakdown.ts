import type { TaskCategory, TaskKind } from "@/lib/data/types";

export interface SuggestedSubtask {
  title: string;
  category: TaskCategory;
  kind: TaskKind;
  estimatedMinutes: number;
}

export function breakdownGoalIntoTasks(goalRaw: string): SuggestedSubtask[] {
  const goal = goalRaw.trim();
  if (!goal) return [];

  const lower = goal.toLowerCase();

  if (/(ôn thi|kiểm tra|exam|test|học|study|đọc|bài giảng|tiếng anh|english|ielts)/i.test(lower)) {
    return [
      {
        title: `Tổng hợp đề cương & tài liệu: ${goal}`,
        category: "study",
        kind: "must_do",
        estimatedMinutes: 20,
      },
      {
        title: `Học & ghi chú phần trọng tâm: ${goal}`,
        category: "study",
        kind: "must_do",
        estimatedMinutes: 35,
      },
      {
        title: `Làm bài tập / đề luyện tập: ${goal}`,
        category: "study",
        kind: "must_do",
        estimatedMinutes: 30,
      },
      {
        title: `Ôn lại lỗi sai & flashcard: ${goal}`,
        category: "study",
        kind: "should_do",
        estimatedMinutes: 15,
      },
    ];
  }

  if (/(code|dự án|project|app|web|fix|bug|deploy|api|feature|lập trình)/i.test(lower)) {
    return [
      {
        title: `Phân tích yêu cầu & thiết kế nhanh: ${goal}`,
        category: "work",
        kind: "must_do",
        estimatedMinutes: 20,
      },
      {
        title: `Triển khai phần lõi (Core): ${goal}`,
        category: "work",
        kind: "must_do",
        estimatedMinutes: 45,
      },
      {
        title: `Viết test & kiểm tra edge-cases: ${goal}`,
        category: "work",
        kind: "must_do",
        estimatedMinutes: 25,
      },
      {
        title: `Dọn code & cập nhật tài liệu: ${goal}`,
        category: "work",
        kind: "bonus",
        estimatedMinutes: 15,
      },
    ];
  }

  if (/(tập|gym|chạy|ngủ|health|sức khỏe|thể dục|thiền|yoga)/i.test(lower)) {
    return [
      {
        title: `Khởi động & chuẩn bị: ${goal}`,
        category: "health",
        kind: "must_do",
        estimatedMinutes: 10,
      },
      {
        title: `Thực hiện bài tập chính: ${goal}`,
        category: "health",
        kind: "must_do",
        estimatedMinutes: 30,
      },
      {
        title: `Giãn cơ & ghi nhận kết quả: ${goal}`,
        category: "health",
        kind: "should_do",
        estimatedMinutes: 10,
      },
    ];
  }

  return [
    {
      title: `Xác định kết quả cần đạt cho: ${goal}`,
      category: "personal",
      kind: "must_do",
      estimatedMinutes: 15,
    },
    {
      title: `Thực hiện bước quan trọng nhất: ${goal}`,
      category: "personal",
      kind: "must_do",
      estimatedMinutes: 35,
    },
    {
      title: `Rà soát & hoàn thiện: ${goal}`,
      category: "personal",
      kind: "should_do",
      estimatedMinutes: 20,
    },
    {
      title: `Tổng kết & dọn dẹp sau khi xong: ${goal}`,
      category: "personal",
      kind: "bonus",
      estimatedMinutes: 10,
    },
  ];
}
