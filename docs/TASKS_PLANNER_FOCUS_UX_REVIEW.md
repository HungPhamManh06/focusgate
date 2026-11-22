# FOCUSGATE — UX/UI AUDIT REPORT: TASKS, PLANNER & FOCUS SCREENS

**Date:** 2026-11-22  
**Scope:** `apps/web` — `/tasks`, `/planner`, `/focus`  
**Phase:** Review & Audit Only (Zero application code changes)  
**Baseline Comparison:** Dashboard 2.0.4 (`apps/web/app/(app)/page.tsx`) & `docs/DESIGN_SYSTEM.md`

---

## PART 1 — EXECUTIVE SUMMARY

### 1.1. Đánh giá tổng quan
Sau khi Dashboard trải qua 5 vòng tối ưu (2.0 → 2.0.4) để đạt triết lý **"One screen. One clear next action"**, ba màn hình nghiệp vụ cốt lõi phía sau nó — **Tasks (`/tasks`)**, **Planner (`/planner`)** và **Focus (`/focus`)** — hiện đang ở trạng thái **"MVP chức năng đã chạy được, nhưng trải nghiệm người dùng và luồng liên kết giữa các màn hình chưa theo kịp chuẩn Dashboard 2.0.4"**.

Về mặt thẩm mỹ thị giác (Visual Polish), cả 3 màn hình đều tuân thủ tốt bảng màu Warm Paper (`#FAF9F6`), thẻ trắng (`#FFFFFF`), điểm nhấn Cobalt Blue (`#2155CD`), font chữ `Instrument Serif` + `Inter`, và đạt **0 lỗi tràn ngang (`scrollWidth === innerWidth`)** trên toàn bộ 7 kích thước màn hình từ `1920×1080` xuống `360×800`. Tuy nhiên, khi đi sâu vào **luồng nghiệp vụ (Business Workflow)**, **trạng thái rỗng/chưa cấu hình (`0/0`, `0%`)**, và **tính toàn vẹn của phiên tập trung (Focus Session Integrity)**, có những điểm đứt gãy nghiêm trọng cần xử lý trước khi sản phẩm sẵn sàng cho người dùng thực tế hàng ngày.

### 1.2. Điểm mạnh nhất hiện tại
1. **Kiến trúc dữ liệu & Bảo mật nghiệp vụ (Server-Authoritative Architecture):** Mọi thao tác quan trọng (khóa kế hoạch `rpc_confirm_daily_plan`, sửa kế hoạch có ghi log `rpc_amend_plan_task`, hoàn thành nhiệm vụ kiểm tra số phút tập trung `rpc_complete_plan_task`, cộng thưởng `rpc_recalculate_daily_rewards`) đều được kiểm chứng chặt chẽ ở tầng PostgreSQL.
2. **Thiết kế thị giác & Responsive kỷ luật:** Không có hiện tượng vỡ khung, chồng lấp chữ hay tràn ngang trên Desktop, Tablet và Mobile (`360px` / `390px`). Các hộp thoại (`TaskFormDialog`, `ConfirmDialog`) đều có Focus Trap, đóng bằng phím `ESC`, khóa cuộn nền và hoàn trả tiêu điểm (focus restoration) chuẩn chỉnh.
3. **Phân tầng nhiệm vụ rõ ràng (`Must-do`, `Should-do`, `Bonus`):** Cả `/tasks` và `/planner` đều giải thích rõ vai trò của từng nhóm đối với việc mở khóa cổng giải trí (Daily Gate).

### 1.3. Những vấn đề nghiêm trọng nhất (Top Blockers)
1. **[P0 / Data & UX Integrity — Focus]** Trong `supabase/migrations/20260101000001_init.sql` (dòng 298–300), trigger `rpc_validate_focus_session` quy định phiên chỉ hợp lệ khi `actual_minutes >= v_min_valid AND actual_minutes <= new.planned_minutes * 2`. Nhưng trên giao diện `FocusTimer` (`focus-timer.tsx`), đồng hồ đếm **tăng dần vô hạn** qua mốc `plannedMinutes` (ảnh chụp thực tế đang hiển thị **`56:45` / `25 min`**) và vẫn báo màu xanh: *"This session is long enough to count. End it whenever you are ready"*. Khi người dùng bấm kết thúc ở phút 56 (> 50 phút), database âm thầm đánh dấu **`is_valid = false`** khiến người dùng mất trắng 56 phút tập trung!
2. **[P1 / Workflow Friction — Planner]** Trình chọn công việc vào kế hoạch ngày (`AddPlanTask` trong `planner/add-plan-task.tsx`) dùng thẻ `<select>` nguyên thủy chỉ hiển thị đúng tên task (`task.title`), ẩn hoàn toàn mức độ ưu tiên, hạn chót (`overdue`), thời lượng dự kiến và số phút focus yêu cầu. Người dùng phải chọn mù từng task một và bấm `+ Add`.
3. **[P1 / Misleading Status — Tasks]** Trong `tasks/task-row.tsx` (dòng 22–23, 95–99), các task **đã hoàn thành** (`status === "completed"`, đã gạch ngang chữ và có tích xanh) vẫn tính toán và hiển thị cảnh báo đỏ **`5d overdue`**, **`7d overdue`** cạnh huy hiệu `Urgent` / `High`, gây nhiễu thị giác nghiêm trọng.
4. **[P1 / Misleading Metrics Regression — Planner & Focus]** Các lỗi số liệu giả khi kế hoạch chưa có Must-do (`0/0 must-dos done`, `MUST-DO PROGRESS: 0%`, `Focus done: 0m / 0m`, `VALID RATE: 0%`, và thẻ `PLAN FOCUS LEFT: 0m` bật biểu tượng thành công màu xanh lá khi kế hoạch trống) từng được sửa triệt để trên Dashboard 2.0.1–2.0.4 nhưng vẫn còn nguyên trên `/planner` và `/focus`.
5. **[P1 / Broken Cross-Screen Handoffs]** Ba màn hình hoạt động như 3 ốc đảo rời rạc:
   - Từ `/tasks`: Không biết task nào đã nằm trong kế hoạch hôm nay (`In today's plan`) hay còn ở `Backlog`, không có nút thêm nhanh vào kế hoạch ngày.
   - Từ `/planner`: Phải bấm 2 nút liên tiếp ở cùng một vị trí (`Confirm plan` rồi lại `Activate focus`) mà không rõ sự khác biệt; khi task bị khóa nút hoàn thành vì thiếu phút focus (*"25m more verified focus needed"*), không có nút `"Focus this task →"` để nhảy sang `/focus?taskId=...`.
   - Từ `/focus`: Khi hoàn thành một phiên tập trung đủ số phút yêu cầu cho một task, ứng dụng không gợi ý đánh dấu hoàn thành task đó luôn hoặc quay lại `/planner`.

### 1.4. Mức độ sẵn sàng của sản phẩm (Readiness Level)
- **Visual & Layout Readiness:** **8.5 / 10** (Production-ready về mặt khung giao diện, typography và responsive).
- **UX & Workflow Readiness:** **6.4 / 10** (Cần 1–2 milestone tinh chỉnh luồng liên kết và sửa lỗi logic đồng hồ Focus trước khi mở rộng cho người dùng thực tế).

---

## PART 2 — TASKS SCREEN REVIEW (`/tasks`)

**Files inspected:**
- `apps/web/app/(app)/tasks/page.tsx`
- `apps/web/app/(app)/tasks/task-row.tsx`
- `apps/web/app/(app)/tasks/task-form-dialog.tsx`
- `apps/web/app/(app)/tasks/task-search.tsx`
- `apps/web/lib/data/tasks.ts`
- `apps/web/lib/actions/tasks.ts`

### 2.1. Information Architecture (Kiến trúc thông tin)
- **Cấu trúc hiện tại:**
  - `PageHeader` hiển thị nhãn `Backlog`, tiêu đề `Tasks`, mô tả ngắn kèm bộ đếm `X open · Y completed`, và nút CTA chính `+ New task`.
  - Thanh công cụ lọc gồm 3 nhóm: Ô tìm kiếm tức thì (`TaskSearch` debounce 220ms), bộ lọc trạng thái (`All`, `Open`, `Done`), và bộ lọc phân loại cổng (`All types`, `Must-do`, `Should-do`, `Bonus`).
  - Danh sách công việc chia thành 3 thẻ `Card` độc lập theo thứ tự cố định: **Must-do** → **Should-do** → **Bonus**.
- **Đánh giá:**
  - Việc chia 3 thẻ theo `taskKind` giúp người dùng hiểu ngay triết lý của FocusGate (việc nào giữ chìa khóa mở cổng, việc nào thưởng thêm phút).
  - Tuy nhiên, vì mặc định tab đang chọn là **`All`** (`view = params.view ?? "all"` tại `tasks/page.tsx#L43`), các công việc **đã hoàn thành từ nhiều ngày trước** vẫn nằm lẫn lộn ngay trong 3 thẻ này cùng với công việc đang mở.
  - Thứ tự sắp xếp bên trong mỗi thẻ lấy trực tiếp từ `listTasks()` (`status ASC, due_date ASC NULLS LAST, priority DESC`), nhưng người dùng không có thanh phân cách giữa nhóm **Open** và **Completed** bên trong thẻ.

### 2.2. Task Creation Flow (Luồng tạo công việc)
- **Kiểm tra thực tế (`task-form-dialog.tsx` & `audit_tasks_modal_1440x900.png`):**
  - Modal tạo task hiển thị cùng lúc **8 trường dữ liệu**:
    1. `Title *`
    2. `Notes` (textarea)
    3. `Gate type` (`Must-do — required for daily gate`, `Should-do — adds bonus minutes`, `Bonus — extra credit`)
    4. `Priority` (`Low`, `Medium`, `High`, `Urgent`)
    5. `Category` (`Work`, `Study`, `Personal`, ...)
    6. `Due date` (date picker)
    7. `Estimate (min)` (mặc định `30`)
    8. `Focus required (min)` (mặc định `25`)
- **Vấn đề UX phát hiện:**
  1. **Quá tải nhận thức khi muốn thêm nhanh (High Friction for Quick Capture):** Người dùng chỉ muốn ghi nhanh 5 đầu việc vào Backlog phải đối mặt với một biểu mẫu 8 trường. Không có ô nhập nhanh một dòng (inline quick-add) trên đầu danh sách và không có cơ chế ẩn các trường nâng cao (Progressive Disclosure).
  2. **Mâu thuẫn và gây lú giữa `Estimate (min)` và `Focus required (min)`:**
     - Trường `Focus required (min)` mặc định là `25` ngay cả khi `Gate type` mặc định là `Should-do`.
     - Dòng chú thích dưới ô ghi: *"Must-do tasks need this many valid focus minutes before they can be marked complete"* (`task-form-dialog.tsx#L202-L204`). Nhưng thực tế trong database (`rpc_complete_plan_task` tại `20260101000002_plan_and_reward.sql#L455`), **bất kỳ task nào trong Daily Plan** (kể cả `Should-do` hay `Bonus`) nếu có `required_focus_minutes > 0` đều bị chặn hoàn thành nếu chưa đủ phút focus!
     - Hơn nữa, form không hề kiểm tra ràng buộc `requiredFocusMinutes <= estimatedMinutes`. Người dùng có thể nhập `Estimate = 15 min` nhưng để nguyên `Focus required = 25 min`.

### 2.3. Task List Usability & Khả năng mở rộng (5, 20, 100 tasks)
- **Ở quy mô 5–10 tasks (như ảnh chụp hiện tại):** Giao diện thoáng, dễ đọc.
- **Ở quy mô 20–100 tasks:**
  - Vì mặc định hiển thị `All` (`Open` + `Done`) và không có phân trang hay gập nhóm `Completed`, danh sách sẽ kéo dài rất sâu.
  - Mỗi hàng task (`TaskRow`) hiển thị tới 4–5 huy hiệu ngang hàng (`PriorityBadge`, `category`, `estimatedMinutes`, `requiredFocusMinutes`, `dueDate`), nhưng lại **thiếu thông tin quan trọng nhất trong ngày**: Task này đã được đưa vào **Today's Plan** hay chưa?

### 2.4. Task Lifecycle & Liên kết với Daily Plan
- **Lỗi hiển thị trạng thái quá hạn trên task đã hoàn thành (`UX-001`):**
  - Tại `tasks/task-row.tsx#L22-L23`:
    ```ts
    const due = relativeDue(task.dueDate, timezone);
    const overdue = due?.includes("overdue") ?? false;
    ```
    Và tại dòng 95–99, nhãn `due` vẫn được render với class `font-medium text-danger` bất kể `completed === true`.
  - **Bằng chứng thị giác (`audit_tasks_1440x900.png`):** Các task đã hoàn thành như *"Outline the reward ledger rules"*, *"Draft the onboarding survey"*, *"Interview two FocusGate testers"*, *"Fix planner drag state"* có dấu tích xanh lá và chữ gạch ngang mờ đi, nhưng bên phải vẫn đỏ rực dòng chữ **`5d overdue`**, **`3d overdue`**, **`7d overdue`**. Điều này tạo cảm giác hệ thống bị lỗi logic và gây căng thẳng giả tạo cho người dùng.
- **Đứt gãy giữa Backlog và Daily Plan (`UX-002`):**
  - Trên Dashboard 2.0.4, chúng ta đã phân biệt rõ huy hiệu `In today's plan` vs `Backlog task`. Nhưng tại `/tasks`, `listTasks()` hoàn toàn không truy vấn trạng thái của task trong `daily_plan_tasks` hôm nay.
  - Hệ quả kép:
    1. Người dùng nhìn vào `/tasks` không biết việc nào đã cam kết làm hôm nay, việc nào chưa.
    2. Nếu một task đang nằm trong `Today's Plan (Active)` và yêu cầu `30m focus`, trên `/tasks` hàng đó trông giống hệt mọi task bình thường khác (ô checkbox vẫn sáng). Khi người dùng bấm vào checkbox để hoàn thành, `completeTask()` (`lib/data/tasks.ts#L199-L214`) gọi `rpc_complete_plan_task` và bắn ra một thông báo lỗi đỏ (*"Task requires 30m of valid focus (0m logged)"*) mà trước đó trên dòng task không hề có biểu tượng ổ khóa hay tiến độ `0m / 30m focus`.

### 2.5. Điểm UX của màn hình Tasks (Thang điểm 10)

| Tiêu chí | Điểm | Nhận xét ngắn |
| :--- | :---: | :--- |
| 1. Clarity of purpose | **8.5 / 10** | Phân nhóm Must-do / Should-do / Bonus kèm giải thích rất rõ ràng. |
| 2. Visual hierarchy | **7.0 / 10** | Bị nhiễu nặng bởi nhãn đỏ `overdue` và badge `Urgent` trên các task đã hoàn thành. |
| 3. Ease of completing core action | **7.5 / 10** | Tìm kiếm, lọc, sửa/xóa mượt; nhưng form tạo mới 8 trường hơi nặng. |
| 4. Connection to product workflow | **6.0 / 10** | Không hiển thị badge `In today's plan` và không có nút đẩy nhanh task sang Planner. |
| 5. Empty/error/edge state quality | **8.0 / 10** | Empty state có ngữ cảnh theo bộ lọc; hộp thoại xóa có cảnh báo rõ ràng. |
| 6. Information density | **7.5 / 10** | Vừa phải ở <15 tasks, nhưng tab mặc định `All` sẽ gây loãng khi có nhiều task cũ. |
| 7. Responsive layout | **9.0 / 10** | Không tràn ngang ở cả 7 viewport; bộ lọc và modal co giãn tốt trên `360px`/`390px`. |
| 8. Consistency with Dashboard 2.0.4 | **7.0 / 10** | Thiếu sự phân biệt `Backlog` vs `In today's plan` mà Dashboard 2.0.4 đã thiết lập. |
| **TRUNG BÌNH TASKS** | **7.6 / 10** | **Nền tảng tốt, cần sửa lỗi overdue trên task đã xong và nối luồng sang Planner.** |

### 2.6. Đề xuất cải thiện cụ thể cho Tasks
1. **Ẩn cảnh báo `overdue` trên task đã hoàn thành (`task-row.tsx`):** Khi `task.status === "completed"`, thay nhãn `dueDate` đỏ bằng nhãn xám nhẹ `"Completed"` (hoặc `"Completed · <ngày>"`) và làm dịu màu `PriorityBadge` về `neutral` để mắt người dùng chỉ tập trung vào các việc còn đang mở (`open`).
2. **Đổi tab mặc định từ `All` sang `Open` (hoặc tách nhóm `Completed` xuống cuối):** Giúp người dùng mở `/tasks` là thấy ngay công việc cần giải quyết.
3. **Hiển thị trạng thái `In today's plan` và nút hành động nhanh `+ Today`:** Join nhẹ danh sách `taskIds` của kế hoạch hôm nay vào `/tasks`. Nếu task đã ở trong kế hoạch ngày, hiển thị badge `In today's plan` (và tiến độ focus `15m / 30m focus` nếu có). Nếu chưa, hiển thị nút phụ `+ Plan today` ngay trên hàng task.
4. **Rút gọn Modal Tạo Task (Progressive Disclosure):** Mặc định chỉ hiển thị `Title`, `Gate type`, `Priority`, `Due date`, `Focus required (min)`. Gộp `Notes`, `Category`, `Estimate (min)` vào phần mở rộng hoặc tự động đồng bộ `Estimate = Focus required` kèm validation `requiredFocusMinutes <= estimatedMinutes`.

---

## PART 3 — PLANNER SCREEN REVIEW (`/planner`)

**Files inspected:**
- `apps/web/app/(app)/planner/page.tsx`
- `apps/web/app/(app)/planner/plan-task-row.tsx`
- `apps/web/app/(app)/planner/add-plan-task.tsx`
- `apps/web/lib/data/planner.ts`
- `apps/web/lib/actions/planner.ts`

### 3.1. Daily Planning Workflow (Luồng lập kế hoạch ngày)
- **Kiểm tra thực tế (`audit_planner_1440x900.png` & `planner/page.tsx`):**
  - Màn hình chia làm 3 phần:
    1. Header (`Daily Contract`, tiêu đề ngày thứ, trạng thái `Draft · 0 tasks · 0/0 must-dos done`, nút `Confirm plan`).
    2. Thanh tiến trình 4 bước (`PlanStepper`: `1 Draft`, `2 Confirm`, `3 Focus`, `4 Complete`).
    3. Bố cục 2 cột (`lg:grid-cols-[1fr_320px]`): Cột trái chứa hộp `Add from backlog` + 3 thẻ nhóm (`Must-do`, `Should-do`, `Bonus`); cột phải chứa `Gate summary`, `Actions`, và `Gate history`.
- **Đánh giá:**
  - Người dùng hiểu được quy tắc *"At least 1 Must-do and ≤ 5 Must-dos"* nhờ dòng nhắc trong thẻ `Add from backlog` và thẻ `Actions`.
  - Tuy nhiên, trải nghiệm thực tế khi chọn việc từ Backlog đưa vào kế hoạch đang rất bất tiện.

### 3.2. Daily Plan Builder (Trình chọn việc từ Backlog — Vấn đề P1 `UX-006`)
- **Cơ chế hiện tại (`planner/add-plan-task.tsx#L41-L75`):**
  - Sử dụng một thẻ HTML `<select>` thả xuống chứa danh sách các task còn mở, bên cạnh là bộ chọn `Must-do / Should-do / Bonus` và nút `+ Add`.
  - Bên trong `<option value={t.id}>{t.title}</option>`, **chỉ có duy nhất tên công việc (`t.title`) được hiển thị**.
- **Tại sao đây là điểm nghẽn UX lớn nhất của Planner?**
  1. **Mù thông tin khi ra quyết định:** Khi lập kế hoạch đầu ngày, người dùng cần biết task nào đang **quá hạn (`overdue`)**, task nào có độ ưu tiên **`Urgent` / `High`**, task nào tốn **`45m focus`**, và task nào vốn đã được gán loại `Must-do` lúc tạo. Thẻ `<select>` xóa sạch toàn bộ các siêu dữ liệu này!
  2. **Nghịch lý thiết kế ngay trong cùng một file (`planner/page.tsx#L179-L213`):** Khi người dùng chưa bấm `Create today's plan` (`!plan`), cột bên phải hiển thị một thẻ `Backlog ready` liệt kê các task kèm `TaskKindBadge`. Nhưng ngay khi người dùng bấm `Create today's plan` để bắt đầu chọn việc, thẻ `Backlog ready` đó biến mất và bị thay thế bằng chiếc hộp `<select>` mù thông tin!
  3. **Thao tác lặp lại chậm chạp:** Muốn thêm 4 công việc vào kế hoạch, người dùng phải mở dropdown → tìm chữ → chọn loại → bấm `+ Add` → chờ server reload → lặp lại 4 lần.

### 3.3. Time Planning & Workload Visibility (Kiểm soát khối lượng công việc)
- **Thiếu tổng thời gian cam kết trong ngày (`UX-008`):**
  - Trong `Gate summary` (`planner/page.tsx#L353-L370`), hệ thống chỉ cộng tổng `requiredFocusMinutes` của riêng nhóm **Must-do** (`Focus done: Xm / Ym`).
  - Không có nơi nào hiển thị **tổng thời gian ước tính (`estimatedMinutes`) của toàn bộ kế hoạch** (Must-do + Should-do + Bonus) hoặc tổng số phút Focus cần thiết khi người dùng đang thêm task ở trạng thái `Draft`.
  - Nếu người dùng chọn 5 Must-do, mỗi task yêu cầu 90 phút focus (tổng 7.5 giờ focus liên tục), Planner không hề có cảnh báo quá tải (Over-commitment warning).
- **Thiếu khả năng sắp xếp thứ tự thực hiện:**
  - Dù bảng `daily_plan_tasks` có cột `sort_order`, giao diện `PlanTaskRow` không có nút di chuyển lên/xuống hay kéo thả để người dùng quyết định sẽ làm Must-do nào trước, Must-do nào sau.

### 3.4. Plan Lifecycle (`Draft` → `Confirmed` → `Active` → `Completed`)
- **Ma sát 2 bước thừa thãi (`Confirm plan` → `Activate focus` — `UX-007`):**
  - Khi kế hoạch đang ở `Draft` và đã có ít nhất 1 Must-do, nút CTA chính ở góc phải trên cùng và ở cột phải là **`Confirm plan`**.
  - Khi người dùng bấm **`Confirm plan`**, trang tải lại, trạng thái đổi sang `Confirmed`, và ngay tại đúng vị trí nút đó xuất hiện nút mới: **`Activate focus`**.
  - Đối với người dùng, việc "Xác nhận kế hoạch hôm nay" (`Confirm plan`) đồng nghĩa với việc "Bắt đầu thực hiện kế hoạch đó". Việc bắt người dùng bấm `Confirm plan` rồi phải bấm tiếp `Activate focus` ngay lập tức (nếu không bấm `Activate focus`, trạng thái vẫn treo ở `Confirmed` và các nút hoàn thành task bị vô hiệu hóa) là một rào cản kỹ thuật bị lộ lên tầng giao diện.
- **Đứt gãy từ `PlanTaskRow` sang `/focus` (`plan-task-row.tsx#L87-L91, L111-L116`):**
  - Khi kế hoạch đã `Active`, nếu một task yêu cầu 30 phút focus (`remainingFocus > 0`), nút tích hoàn thành bên trái bị khóa (`disabled`) và dòng chữ vàng hiện ra: *"30m more verified focus needed to complete"*.
  - Thế nhưng trên hàng task đó **không có nút `"Start focus →"`** để đưa người dùng sang `/focus?taskId=<id>`. Người dùng phải tự bấm menu sang trang Focus rồi tự chọn lại đúng task đó từ dropdown!

### 3.5. Empty States & Số liệu gây hiểu nhầm (`UX-005`)
- **Bằng chứng thị giác (`audit_planner_1440x900.png` & `audit_planner_390x844.png`):**
  - Khi kế hoạch đang ở trạng thái `Draft` và chưa có task nào (`tasks.length === 0`), màn hình `/planner` hiển thị tới **3 cụm số liệu `0/0` và `0%`**:
    1. Dưới tiêu đề trang: `Draft · 0 tasks · 0/0 must-dos done`
    2. Trong hộp `Gate summary`: **`MUST-DO PROGRESS: 0%`** kèm **`0/0 done`** và thanh progress bar trống.
    3. Trong danh sách chỉ số bên dưới: **`Focus done: 0m / 0m`** và **`Focus coverage: 0%`**.
  - Như đã thống nhất ở các bản vá Dashboard 2.0.1–2.0.4, khi mẫu số bằng 0 (`mustDoTotal === 0`), việc hiển thị `0/0` và `0%` là vô nghĩa về mặt toán học và tạo cảm giác tiêu cực. Nó cần được thay bằng trạng thái hướng dẫn: *"Not configured — Add 1 to 5 Must-do tasks to set today's gate."*

### 3.6. Điểm UX của màn hình Planner (Thang điểm 10)

| Tiêu chí | Điểm | Nhận xét ngắn |
| :--- | :---: | :--- |
| 1. Clarity of purpose | **7.5 / 10** | Khái niệm Daily Contract và giới hạn 1–5 Must-do được truyền đạt rõ. |
| 2. Visual hierarchy | **7.0 / 10** | Bố cục 2 cột rõ ràng, nhưng trên mobile 4 ô `PlanStepper` đẩy nội dung chính xuống quá sâu. |
| 3. Ease of completing core action | **5.5 / 10** | Chọn việc qua thẻ `<select>` mù thông tin + phải bấm 2 bước `Confirm` → `Activate`. |
| 4. Connection to product workflow | **6.0 / 10** | Thiếu nút `"Focus this task"` trên từng hàng công việc cần hoàn thành. |
| 5. Empty/error/edge state quality | **6.0 / 10** | Còn nguyên các chỉ số `0/0 done`, `0%`, `0m / 0m` khi kế hoạch đang trống. |
| 6. Information density | **7.5 / 10** | Cân đối trên Desktop; thẻ `Amend` có kiểm soát lý do chỉnh sửa rất tốt. |
| 7. Responsive layout | **8.0 / 10** | Không tràn ngang (`overflow=false`), nhưng `PlanStepper` chiếm quá nhiều chiều dọc trên mobile. |
| 8. Consistency with Dashboard 2.0.4 | **6.0 / 10** | Dùng stepper 4 bước kiểu hộp cũ (khác hẳn stepper 5 bước của Dashboard) và còn lỗi `0/0`. |
| **TRUNG BÌNH PLANNER** | **6.7 / 10** | **Điểm nghẽn lớn nhất nằm ở Backlog Picker `<select>` và luồng chuyển trạng thái.** |

### 3.7. Đề xuất cải thiện cụ thể cho Planner
1. **Thay thế `<select>` trong `AddPlanTask` bằng Danh sách Backlog Trực quan (Interactive Backlog Drawer / Tray):** Hiển thị danh sách các task còn mở ngay bên dưới hoặc trong một bảng chọn có đầy đủ: Tên task, `PriorityBadge`, hạn chót (`overdue` / `due today`), số phút `Focus required`, và các nút bấm 1 chạm (`+ Must-do`, `+ Should-do`, `+ Bonus`).
2. **Xóa bỏ toàn bộ `0/0`, `0%`, `0m / 0m` khi `mustDoTotal === 0`:** Thay hộp `MUST-DO PROGRESS: 0% (0/0 done)` trong `Gate summary` bằng hộp trạng thái *"No Must-do tasks selected yet (Pick 1–5 tasks from your backlog to define today's gate)"*.
3. **Gộp hoặc tự động hóa bước `Confirm plan` → `Activate focus`:** Khi người dùng bấm **`Confirm & Activate Plan`** (hoặc tự động chuyển sang `active` ngay khi confirm, trừ khi có lý do nghiệp vụ đặc biệt cần tách riêng), đồng thời hiển thị nút **`Start first focus session →`** ngay sau khi kích hoạt.
4. **Thêm nút `"Focus →"` (`/focus?taskId=...`) trực tiếp trên `PlanTaskRow`:** Khi một task trong kế hoạch `Active` còn thiếu phút tập trung (`remainingFocus > 0`), hiển thị nút hành động rõ ràng để nhảy thẳng sang màn hình Focus với task đó đã được chọn sẵn.
5. **Đồng bộ `PlanStepper` với thiết kế Stepper gọn của Dashboard 2.0.4:** Giúp tiết kiệm diện tích chiều dọc trên cả Desktop lẫn Mobile.

---

## PART 4 — FOCUS SCREEN REVIEW (`/focus`)

**Files inspected:**
- `apps/web/app/(app)/focus/page.tsx`
- `apps/web/app/(app)/focus/focus-starter.tsx`
- `apps/web/app/(app)/focus/focus-timer.tsx`
- `apps/web/lib/data/focus.ts`
- `apps/web/lib/actions/focus.ts`
- `supabase/migrations/20260101000001_init.sql`

### 4.1. Information Hierarchy (Phân cấp thông tin khi đang tập trung)
- **Kiểm tra thực tế (`audit_focus_1440x900.png` & `focus/page.tsx`):**
  - Màn hình `/focus` hiện hiển thị cùng lúc:
    1. `PageHeader` (`Deep Work · Focus`, tiêu đề + mô tả).
    2. Hàng 3 thẻ `StatCard` lớn (`VERIFIED TODAY`, `VALID RATE`, `PLAN FOCUS LEFT`).
    3. Cột trái: Thẻ đồng hồ `FocusTimer` (hoặc form `FocusStarter` khi chưa chạy).
    4. Cột phải (`320px`): Thẻ `Today's gate` + Thẻ `Today's sessions`.
- **Đánh giá:**
  - Khi người dùng chưa bắt đầu phiên (`FocusStarter`), việc hiển thị các thẻ thống kê là hợp lý.
  - Nhưng **khi phiên tập trung đang chạy (`activeSession !== null`)**, có quá nhiều yếu tố xung quanh đồng hồ (3 thẻ StatCard phía trên, Sidebar bên trái, 2 thẻ bên phải) làm giảm tính tĩnh lặng của một không gian Deep Work. Dù vậy, đồng hồ trung tâm (`ProgressRing` `260px` + chữ số `Instrument Serif` `60px`) vẫn giữ được trọng tâm thị giác tốt.

### 4.2. Focus Timer Experience & Lỗi P0/P1 về Toàn vẹn Phiên tập trung (`UX-010`)
- **Bằng chứng trực tiếp từ ảnh chụp màn hình (`audit_focus_1440x900.png` & `audit_focus_390x844.png`):**
  - Ảnh chụp thực tế ghi lại một phiên `Pomodoro 25/5` đang chạy ở mốc:
    - Đồng hồ trung tâm: **`FOCUSED FOR 56:45`** (`56 / 25 min`).
    - Hộp thông báo màu xanh lá bên dưới: **`"This session is long enough to count. End it whenever you are ready."`**
- **Phân tích 2 lỗi nghiêm trọng kết hợp tại đây:**
  1. **Đồng hồ đếm LÊN (`elapsedSeconds`) vượt quá thời lượng kế hoạch mà không có trạng thái Hoàn thành / Overrun:**
     - Người dùng chọn `Pomodoro 25/5` (`plannedMinutes = 25`) thường kỳ vọng đồng hồ đếm ngược từ `25:00` về `00:00` (hoặc khi đếm lên tới `25:00` thì phải đổi trạng thái sang **"Target reached! (25:00) · +31:45 overtime"**, phát tín hiệu âm thanh/thông báo trình duyệt và nổi bật nút hoàn thành).
     - Hiện tại (`focus-timer.tsx#L28-L35`), vòng tròn tiến độ bị kẹp cứng ở `Math.min(1, elapsedSeconds / plannedSeconds)` (luôn đầy 100% từ phút 25 trở đi) và đồng hồ cứ thế đếm lên `56:45` mà không có bất kỳ sự thay đổi trạng thái nào.
  2. **[LỖI P0 NGHIÊM TRỌNG] Bẫy mất toàn bộ phút tập trung khi chạy quá `2 × planned_minutes`:**
     - Hãy đối chiếu code Frontend (`apps/web/app/(app)/focus/focus-timer.tsx#L34-L35`) với code Backend PostgreSQL (`supabase/migrations/20260101000001_init.sql#L294-L300`):
     - **Ở Frontend (`focus-timer.tsx#L34-L35`):**
       ```ts
       const minValidSeconds = minValidMinutes * 60;
       const willBeValid = elapsedSeconds >= minValidSeconds;
       ```
       Giao diện chỉ kiểm tra cận dưới (`elapsedSeconds >= 5 phút`), nên ở phút thứ **56** của phiên 25 phút, giao diện vẫn hiện hộp màu xanh lá khẳng định: *"This session is long enough to count. End it whenever you are ready."*
     - **Ở Backend (`20260101000001_init.sql#L298-L300`):**
       ```sql
       new.actual_minutes := greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)) / 60)::int);
       new.is_valid := new.actual_minutes >= v_min_valid
                       and new.actual_minutes <= new.planned_minutes * 2;
       ```
       Khi phiên `25 min` chạy quá `50 min` (ví dụ ở `56:45` như trên màn hình hiện tại!), `actual_minutes = 56 > 25 * 2 (50)`. Ngay khi người dùng bấm **`End & log session`**, trigger PostgreSQL sẽ gán **`is_valid = false`**!
     - **Hậu quả cho người dùng:** Người dùng tập trung sâu suốt 56 phút (hoặc quên tắt tab sau khi hết 25 phút), tin vào dòng chữ xanh lá trên màn hình và bấm `End & log session`, nhưng kết quả nhận lại là thông báo: *"Session ended (not counted toward gate)."* Toàn bộ 56 phút không được cộng vào task và không mở khóa bất kỳ phút thưởng nào!
     - **Cách khắc phục bắt buộc ở Milestone tới:**
       - Khi phiên đạt tới `plannedMinutes` (hoặc tối đa `plannedMinutes * 2`), Frontend phải hiển thị cảnh báo rõ ràng hoặc tự động giới hạn (`cap`) số phút được tính ở mức `plannedMinutes` (hoặc `plannedMinutes * 2`), tuyệt đối không được báo màu xanh lá *"This session is long enough to count"* rồi lại đánh trượt (`is_valid = false`) ở backend.

### 4.3. Thiếu tính năng Pause / Resume theo PRD (`UX-012`)
- Trong `docs/PRD.md` (Mục 4.D dòng 79 và Mục 5 dòng 132) cũng như enum `focus_session_status` trong database (`'running'`, `'paused'`, `'completed'`, `'cancelled'`, `'invalidated'`), sản phẩm được thiết kế có trạng thái **Tạm dừng (`Pause` / `Resume`)**.
- Tuy nhiên, trên `FocusTimer` (`focus-timer.tsx#L118-L131`) chỉ có 2 nút: **`End & log session`** và **`Cancel`**. Nếu người dùng có việc đột xuất 2 phút (nghe điện thoại, mở cửa) ở phút thứ 3 trong khi ngưỡng tối thiểu là 5 phút, họ không thể Pause mà chỉ có thể để đồng hồ chạy khống hoặc hủy bỏ phiên.

### 4.4. Empty States, Misleading Metrics & Định dạng chuỗi (`UX-013`, `UX-015`)
- **Bằng chứng thị giác (`audit_focus_1440x900.png`):**
  1. **Thẻ `PLAN FOCUS LEFT: 0m` hiển thị biểu tượng màu xanh lá (`tone="success"`) khi kế hoạch đang trống (`0/0 must-dos done`):**
     - Tại `focus/page.tsx#L73-L79`:
       ```tsx
       <StatCard
         label="Plan focus left"
         value={`${planFocusRemaining}m`}
         hint={plan ? `${plan.mustDoCompleted}/${plan.mustDoTotal} must-dos done` : "No active plan today"}
         icon={ Hourglass }
         tone={planFocusRemaining === 0 && plan ? "success" : "default"}
       />
       ```
       Vì `plan` đang ở trạng thái `Draft` với `0` task, `planFocusRemaining` tính ra bằng `0`, làm điều kiện `planFocusRemaining === 0 && plan` trả về `true`! Thế là thẻ hiện màu xanh lá thành công (`0m · 0/0 must-dos done`) dù người dùng chưa hề thêm bất kỳ task nào vào kế hoạch!
  2. **Thẻ `VALID RATE: 0%` khi chưa có phiên nào hoàn thành:** Khi `completedSessions.length === 0`, tỷ lệ hợp lệ chưa tồn tại (nên hiển thị `—` сопровож bởi `"No completed sessions yet"` thay vì `0%`).
  3. **Thẻ `Today's gate` bên phải:** Hiển thị `0m / 0m verified` và `Must-dos complete: 0/0`.
  4. **Lỗi hiển thị tên chế độ thô trong `Today's sessions` (`focus/page.tsx#L217`):**
     - Code hiện tại viết: `{s.mode.replaceAll("_", " ")}`, khiến chuỗi `'pomodoro_25_5'` hiển thị thành **`12:16 · pomodoro 25 5 · 0 min`** trong ảnh chụp `audit_focus_1440x900.png` thay vì **`Pomodoro 25/5`**.

### 4.5. Điểm UX của màn hình Focus (Thang điểm 10)

| Tiêu chí | Điểm | Nhận xét ngắn |
| :--- | :---: | :--- |
| 1. Clarity of purpose | **8.0 / 10** | Đồng hồ lớn, rõ ràng; form chọn chế độ (Pomodoro 25/5, Deep 50/10, Custom) trực quan. |
| 2. Visual hierarchy | **8.0 / 10** | Vòng tròn `ProgressRing` và số `Instrument Serif` rất nổi bật, dù xung quanh hơi nhiều thẻ phụ. |
| 3. Ease of completing core action | **6.0 / 10** | Thiếu Pause/Resume; đồng hồ đếm lên quá giờ mà không báo; lỗi P0 trượt phiên khi > 2× thời lượng. |
| 4. Connection to product workflow | **6.0 / 10** | Không nhận `?taskId=` từ Planner/Dashboard; kết thúc phiên xong không gợi ý hoàn thành task. |
| 5. Empty/error/edge state quality | **5.5 / 10** | Báo `PLAN FOCUS LEFT: 0m` màu xanh lá khi kế hoạch `0/0`; lỗi chuỗi `pomodoro 25 5`. |
| 6. Information density | **7.5 / 10** | Bố cục thoáng, dễ quan sát trên cả Desktop và Mobile. |
| 7. Responsive layout | **9.0 / 10** | Hoàn hảo về mặt khung hình trên cả 7 kích thước màn hình (`scrollWidth === innerWidth`). |
| 8. Consistency with Dashboard 2.0.4 | **6.5 / 10** | Cùng ngôn ngữ thiết kế nhưng còn lặp lại lỗi số liệu `0/0` và `0%` mà Dashboard đã bỏ. |
| **TRUNG BÌNH FOCUS** | **7.1 / 10** | **Giao diện đẹp nhưng cần vá gấp lỗi logic `is_valid` khi chạy lố giờ và nối luồng với Task.** |

### 4.6. Đề xuất cải thiện cụ thể cho Focus
1. **[Ưu tiên P0] Sửa ngay sự bất đồng bộ giữa `FocusTimer` và `rpc_validate_focus_session`:**
   - Cho phép người dùng chọn hiển thị đếm ngược (Countdown về `00:00`) hoặc khi đồng hồ chạm mốc `plannedMinutes` thì chuyển sang trạng thái **"Target Reached!"** nổi bật.
   - Nếu người dùng để đồng hồ chạy quá `plannedMinutes * 2`, hoặc là cảnh báo rõ trên UI trước khi chạm ngưỡng `2×`, hoặc ở backend chỉ cap `actual_minutes = min(elapsed, planned_minutes * 2)` thay vì đánh trượt (`is_valid = false`) toàn bộ phiên tập trung của người dùng.
2. **Hỗ trợ Deep-link `/focus?taskId=<id>` và Luồng Hậu Phiên (Post-Session Next Action):**
   - Cho phép bấm từ Dashboard hoặc `/planner` sang `/focus?taskId=...` với task đó đã được chọn sẵn trong `FocusStarter`.
   - Sau khi bấm `End & log session` thành công, nếu số phút tích lũy của task đã đủ (`completedFocusMinutes >= requiredFocusMinutes`), hiển thị ngay hộp thoại/banner: **"Task focus requirement met! Mark '<Task Title>' as completed now?"** kèm nút 1 chạm.
3. **Sửa lỗi `0/0`, `0%`, thẻ xanh lá giả trên `PLAN FOCUS LEFT`, và format `MODE_LABELS`:**
   - Chỉ bật `tone="success"` cho `Plan focus left` khi `plan && plan.mustDoTotal > 0 && planFocusRemaining === 0`.
   - Khi `completedSessions.length === 0`, hiển thị `Valid rate: —` thay vì `0%`.
   - Map `s.mode` qua bảng nhãn chuẩn (`pomodoro_25_5` → `"Pomodoro 25/5"`, `deep_50_10` → `"Deep work 50/10"`, `custom` → `"Custom"`).

---

## PART 5 — CROSS-SCREEN WORKFLOW AUDIT (`TASKS → PLANNER → FOCUS → COMPLETE`)

Triết lý cốt lõi của FocusGate là:
**`1. Capture Tasks` → `2. Commit Daily Plan` → `3. Run Verified Focus` → `4. Complete Must-dos` → `5. Unlock Rewards`**

Dưới đây là kết quả kiểm thử 4 kịch bản thực tế xuyên suốt các màn hình:

### Kịch bản 1: Người dùng mới (New User — Ngày đầu tiên sử dụng)
- **Bước 1:** Vào `/tasks`, tạo 3 công việc mới. (Hoạt động tốt, nhưng form tạo có 8 trường hơi dài và mặc định đặt `Gate type = Should-do` nhưng `Focus required = 25m`).
- **Bước 2:** Sau khi tạo xong 3 việc ở `/tasks`, **không có bất kỳ nút dẫn hướng hay gợi ý nào** trên `/tasks` bảo người dùng *"Bước tiếp theo: Đưa các việc này vào Today's Plan"* (`Build Today's Plan →`). Người dùng phải tự biết bấm vào mục `Planner` trên thanh Sidebar.
- **Bước 3:** Sang `/planner`, bấm `Create today's plan`. Danh sách preview backlog biến mất, thay bằng ô `<select>`. Người dùng chọn từng việc rồi bấm `+ Add`.
- **Bước 4:** Bấm `Confirm plan` → Trang tải lại, hiện tiếp nút `Activate focus` ở đúng chỗ đó. Người dùng mới dễ bối rối không hiểu sao xác nhận rồi mà vẫn chưa xong.
- **Bước 5:** Sau khi bấm `Activate focus`, người dùng vẫn đứng ở `/planner`. Muốn bắt đầu tập trung cho Task số 1, họ bấm vào ô tròn cạnh Task số 1 thì thấy nút bị khóa (`disabled`) kèm chữ vàng *"25m more verified focus needed to complete"*, nhưng **không có đường link nào dẫn sang `/focus`**.

### Kịch bản 2: Người dùng quay lại (Returning User — Đang có kế hoạch và nhiều task cũ)
- **Ở `/tasks`:** Vì tab mặc định là `All`, người dùng thấy một danh sách trộn lẫn các task đã gạch ngang từ tuần trước (nhưng vẫn báo đỏ `7d overdue`!) với các task mới của hôm nay.
- **Ở `/tasks`:** Người dùng muốn đánh dấu hoàn thành nhanh một task nhưng không biết task đó có nằm trong kế hoạch hôm nay hay không. Khi bấm vào, hệ thống báo lỗi đỏ vì task đó nằm trong kế hoạch ngày và chưa đủ phút focus.
- **Ở `/focus`:** Sau khi chạy xong 25 phút tập trung và bấm `End & log session`, màn hình quay về form `FocusStarter` trống trơn. Người dùng không được nhắc quay lại `/planner` để tích hoàn thành công việc vừa làm xong.

### Kịch bản 3: Trạng thái lỗi & Biên (Error & Edge States)
- **Chạy Focus khi kế hoạch vẫn ở `Draft` hoặc `Confirmed` (chưa `Active`):**
  - Màn hình `/focus` vẫn cho phép chọn task thuộc kế hoạch đang `Draft` và bấm `Start focus session` mà không hề cảnh báo rằng *"Kế hoạch hôm nay của bạn vẫn đang ở bản nháp (Draft) — hãy xác nhận và kích hoạt kế hoạch để mở khóa cổng thưởng"*.
- **Để đồng hồ Focus chạy lố `2 × plannedMinutes` (như ảnh chụp `56:45 / 25 min`):**
  - Giao diện báo xanh lá *"This session is long enough to count"*, nhưng bấm kết thúc thì bị database đánh `is_valid = false` làm mất toàn bộ thời gian.

### Kịch bản 4: Có Backlog nhưng chưa lập Daily Plan (`Draft · 0 tasks`)
- Trong khi **Dashboard 2.0.4** đã xử lý rất mượt trạng thái này (ẩn `0/0`, hiển thị `Your Next Move` với nhãn `Backlog task` + nút `Add to Today's Plan`), thì khi người dùng bước sang **`/planner`** và **`/focus`**, họ lại gặp lại hàng loạt chỉ số `0/0 must-dos done`, `MUST-DO PROGRESS: 0%`, `Focus done: 0m / 0m`, và thẻ `PLAN FOCUS LEFT: 0m` bật biểu tượng thành công màu xanh lá!

---

## PART 6 — DESIGN CONSISTENCY (SO SÁNH VỚI DASHBOARD 2.0.4)

| Hạng mục thiết kế | Chuẩn Dashboard 2.0.4 (`/`) | Hiện trạng `/tasks`, `/planner`, `/focus` | Đánh giá & Khuyến nghị |
| :--- | :--- | :--- | :--- |
| **1. Desktop Container Width** | `max-w-[1280px]` (tận dụng tốt màn hình `1440px` và `1920px`). | Đang bị giới hạn ở `max-w-[1180px]` trong `apps/web/app/(app)/layout.tsx#L38`. | Nên nâng container chung trong `(app)/layout.tsx` lên `max-w-[1280px]` để đồng nhất biên trái/phải khi chuyển tab. |
| **2. Mission / Plan Stepper** | Stepper 5 bước ngang gọn gàng (`01 Plan` → `02 Commit` → `03 Focus` → `04 Complete` → `05 Unlock`). | `/planner` dùng `PlanStepper` 4 hộp lớn (`1 Draft`, `2 Confirm`, `3 Focus`, `4 Complete`), chiếm rất nhiều chiều dọc trên mobile. | Đồng bộ Stepper của `/planner` với kiểu dáng gọn của Dashboard 2.0.4. |
| **3. Xử lý số liệu khi chưa cấu hình (`0/0`, `0%`)** | Tuyệt đối không hiển thị `0/0` hay `0%` khi `mustDoTotal === 0` (hiển thị `Not set` / `No Must-dos yet`). | `/planner` và `/focus` vẫn hiển thị `0/0 must-dos done`, `0%`, `0m / 0m`, `VALID RATE: 0%`. | Áp dụng cùng quy tắc "No 0/0 or 0% on unconfigured plans" cho cả `/planner` và `/focus`. |
| **4. Phân biệt `Backlog` vs `In today's plan`** | Mọi task đều có badge phân biệt rõ đang ở `Backlog` hay `In today's plan`. | `/tasks` không hiển thị task nào đã nằm trong kế hoạch hôm nay. | Bổ sung badge `In today's plan` vào `TaskRow` trên `/tasks`. |
| **5. Typography, Color & Surfaces** | Warm off-white `#FAF9F6`, White cards, Cobalt `#2155CD`, `Instrument Serif` + `Inter`. | Tuân thủ đúng 100% bảng màu, bo góc, đổ bóng và font chữ. | **Giữ nguyên 100%.** |

---

## PART 7 — RESPONSIVE & ACCESSIBILITY AUDIT

### 7.1. Kiểm tra Responsive thực tế trên 7 Viewports
Đã chạy kiểm tra tự động qua Chrome DevTools Protocol (`capture-audit-screens.mjs`) đo đạc `document.documentElement.scrollWidth` so với `window.innerWidth` trên toàn bộ 21 tổ hợp màn hình:

| Viewport | Loại thiết bị | `/tasks` (`scrollWidth / innerWidth`) | `/planner` (`scrollWidth / innerWidth`) | `/focus` (`scrollWidth / innerWidth`) | Trạng thái |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **`1920×1080`** | Full HD Desktop | `1920 / 1920` (overflow: `false`) | `1920 / 1920` (overflow: `false`) | `1920 / 1920` (overflow: `false`) | **PASS** |
| **`1440×900`** | Standard Laptop | `1440 / 1440` (overflow: `false`) | `1440 / 1440` (overflow: `false`) | `1440 / 1440` (overflow: `false`) | **PASS** |
| **`1280×800`** | Compact Laptop | `1280 / 1280` (overflow: `false`) | `1280 / 1280` (overflow: `false`) | `1280 / 1280` (overflow: `false`) | **PASS** |
| **`1024×768`** | Tablet Landscape | `1024 / 1024` (overflow: `false`) | `1024 / 1024` (overflow: `false`) | `1024 / 1024` (overflow: `false`) | **PASS** |
| **`768×1024`** | Tablet Portrait | `768 / 768` (overflow: `false`) | `768 / 768` (overflow: `false`) | `768 / 768` (overflow: `false`) | **PASS** |
| **`390×844`** | Mobile (iPhone 14) | `390 / 390` (overflow: `false`) | `390 / 390` (overflow: `false`) | `390 / 390` (overflow: `false`) | **PASS** |
| **`360×800`** | Small Android | `360 / 360` (overflow: `false`) | `360 / 360` (overflow: `false`) | `360 / 360` (overflow: `false`) | **PASS** |

**Nhận xét chi tiết trên Mobile (`390×844` & `360×800`):**
- **Điểm tốt:** Thanh điều hướng đáy (`MobileNav`) và Header cố định hoạt động mượt; các nút hành động trong Modal (`audit_tasks_modal_390x844.png`) và trên `FocusTimer` (`audit_focus_390x844.png`) không bị cắt chữ.
- **Điểm cần tối ưu trên Mobile:**
  - Trên `/planner` (`audit_planner_390x844.png`), 4 hộp của `PlanStepper` xếp chồng thành 4 thẻ dọc chiếm gần hết màn hình đầu tiên (Above the fold), đẩy phần `Add from backlog` và danh sách Must-do xuống dưới. Trên mobile, `PlanStepper` nên gộp thành 1 thanh ngang gọn (compact horizontal stepper).
  - Trên `/tasks` (`task-row.tsx#L49, L104`), nút Checkbox hoàn thành (`h-5 w-5` = `20×20px`) và 2 nút `Edit` / `Delete` (`h-7 w-7` = `28×28px`) hơi nhỏ so với chuẩn chạm ngón tay trên di động (nên tăng vùng chạm `min-h-[36px] min-w-[36px]` hoặc dùng `p-2` trên mobile).

### 7.2. Accessibility (Khả năng tiếp cận)
- **Điểm làm rất tốt:**
  - `TaskFormDialog` và `ConfirmDialog` đều có `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, bẫy bàn phím `Tab / Shift+Tab`, đóng bằng phím `Escape`, và trả focus về nút kích hoạt sau khi đóng.
  - Các bộ lọc trên `/tasks` sử dụng `aria-current="page"` chuẩn xác.
  - Đồng hồ `FocusTimer` dùng `font-variant-numeric: tabular-nums` giúp các con số không bị giật ngang mỗi giây.
- **Điểm cần bổ sung:**
  - Vòng tròn tiến độ `ProgressRing` (`components/ui/progress-ring.tsx`) và đồng hồ đếm thời gian nên có `aria-live="polite"` (cập nhật theo từng phút hoặc khi đạt mốc quan trọng) để trình đọc màn hình thông báo khi phiên tập trung đạt ngưỡng hợp lệ hoặc hoàn thành.

---

## PART 8 — PRIORITIZED ISSUES TABLE (`UX-001` → `UX-015`)

| ID | Screen | Severity | Location | Problem | User Impact | Evidence | Recommendation | Effort |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **`UX-001`** | **Focus** | **P0** | `focus-timer.tsx#L34-L35` & `20260101000001_init.sql#L298-L300` | Frontend chỉ kiểm tra `elapsedSeconds >= minValidSeconds` và báo xanh lá *"This session is long enough to count"*, trong khi Backend đánh trượt (`is_valid = false`) mọi phiên có `actual_minutes > planned_minutes * 2`. Đồng hồ lại đếm lên vô hạn không có cảnh báo khi qua mốc `plannedMinutes`. | Người dùng tập trung lố gấp đôi thời gian (hoặc quên tắt sau 25m, như `56:45 / 25 min` trong ảnh chụp) khi bấm kết thúc sẽ bị **mất trắng toàn bộ phiên tập trung**. | Ảnh `audit_focus_1440x900.png` hiển thị `FOCUSED FOR 56:45 (56 / 25 min)` kèm hộp xanh lá *"This session is long enough to count"*. | 1) Thêm trạng thái "Target Reached" ở mốc `plannedMinutes` (hoặc hỗ trợ Countdown). 2) Ở Backend/Frontend, cap số phút hợp lệ tối đa ở `planned_minutes * 2` thay vì đánh `is_valid = false` khi người dùng làm việc quá giờ. | **M** |
| **`UX-002`** | **Tasks** | **P1** | `tasks/task-row.tsx#L22-L23, L95-L99` | Task đã hoàn thành (`status === "completed"`) vẫn tính `relativeDue()` và hiển thị chữ đỏ `5d overdue`, `7d overdue` cùng badge `Urgent` / `High` đỏ. | Gây nhiễu thị giác nặng và tạo cảm giác báo động giả cho những việc người dùng đã làm xong. | Ảnh `audit_tasks_1440x900.png`: 4 task đã tích xanh và gạch ngang chữ vẫn báo đỏ `5d overdue`, `3d overdue`, `7d overdue`. | Khi `completed === true`, ẩn cảnh báo `overdue`, hiển thị nhãn xám `"Completed"` và hạ `PriorityBadge` về tone trung tính. | **S** |
| **`UX-003`** | **Planner** | **P1** | `planner/add-plan-task.tsx#L41-L75` | Hộp chọn việc từ Backlog vào kế hoạch ngày dùng thẻ `<select>` chỉ hiển thị đúng tên task (`t.title`), ẩn hết độ ưu tiên, hạn chót (`overdue`), và số phút focus yêu cầu. | Người dùng phải chọn mù từng task một, không biết việc nào đang quá hạn hay tốn bao nhiêu phút khi lập kế hoạch. | Ảnh `audit_planner_1440x900.png` & code `add-plan-task.tsx#L53` (`<option value={t.id}>{t.title}</option>`). | Thay `<select>` bằng danh sách Backlog trực quan (hiển thị badges `Priority`, `Overdue`, `Focus min` và nút 1 chạm `+ Must-do` / `+ Should-do`). | **M** |
| **`UX-004`** | **Planner & Focus** | **P1** | `planner/page.tsx#L114, L221, L338-L368` & `focus/page.tsx#L73-L79, L109-L137` | Khi kế hoạch ngày đang ở `Draft` và chưa có Must-do nào (`0 tasks`), `/planner` và `/focus` vẫn hiển thị `0/0 must-dos done`, `MUST-DO PROGRESS: 0%`, `0m / 0m`, `VALID RATE: 0%`, và thẻ `PLAN FOCUS LEFT: 0m` bật icon xanh lá `success` giả tạo. | Mâu thuẫn trực tiếp với chuẩn Dashboard 2.0.4; báo màu xanh lá thành công (`0m focus left`) khi thực chất người dùng chưa lập kế hoạch. | Ảnh `audit_planner_1440x900.png` và `audit_focus_1440x900.png`. | Khi `mustDoTotal === 0`, ẩn `0/0` và `0%`, hiển thị trạng thái `"Not configured"`. Chỉ bật `tone="success"` cho `Plan focus left` khi `mustDoTotal > 0 && planFocusRemaining === 0`. | **S** |
| **`UX-005`** | **Tasks** | **P1** | `tasks/page.tsx`, `task-row.tsx` & `lib/data/tasks.ts` | Màn hình `/tasks` không hiển thị task nào đã nằm trong `Today's Plan` vs `Backlog`, không có nút thêm nhanh vào kế hoạch ngày, và không khóa/hiển thị tiến độ focus trên các task thuộc kế hoạch đang `Active`. | Người dùng không phân biệt được việc hôm nay với việc tồn đọng; bấm tích hoàn thành task trên `/tasks` bị báo lỗi bất ngờ nếu task đó nằm trong Active Plan và thiếu phút focus. | Đối chiếu `tasks/task-row.tsx` với Dashboard 2.0.4 (`Your Next Move`). | Truyền tập `todayPlanTaskMap` vào `/tasks` để gắn badge `In today's plan` (kèm tiến độ focus `Xm / Ym`) hoặc nút nhanh `+ Plan today`. | **M** |
| **`UX-006`** | **Planner** | **P1** | `planner/page.tsx#L391-L420` & `plan-task-row.tsx#L87-L91, L111-L116` | Ma sát 2 bước liên tiếp (`Confirm plan` → `Activate focus`) ở cùng một vị trí nút; khi task trong kế hoạch `Active` cần thêm phút focus, hàng task khóa nút hoàn thành nhưng không có link `"Focus →"` sang `/focus`. | Người dùng mới không hiểu sự khác biệt giữa `Confirmed` và `Active`; người dùng đang làm việc phải chuyển tab thủ công và chọn lại task bên trang Focus. | Code `planner/page.tsx#L119-L162` và `plan-task-row.tsx#L111-L116`. | Gộp thành 1 hành động `Confirm & Start Plan` (hoặc tự động kích hoạt), và thêm nút `"Focus →"` (`/focus?taskId=...`) ngay trên `PlanTaskRow` khi `remainingFocus > 0`. | **M** |
| **`UX-007`** | **Focus** | **P1** | `focus/page.tsx`, `focus-starter.tsx` & `focus-timer.tsx` | `/focus` không hỗ trợ nhận `?taskId=` từ URL để chọn sẵn công việc; khi hoàn thành phiên tập trung đủ số phút yêu cầu cho một task, không có gợi ý đánh dấu hoàn thành task đó luôn. | Luồng `Planner → Focus → Complete Task` bị đứt rời thành các thao tác tìm kiếm thủ công ở từng trang. | Code `focus/page.tsx#L31` (không đọc `searchParams.taskId`) và `focus-timer.tsx#L39-L46`. | Đọc `searchParams.taskId` để pre-select task trong `FocusStarter`; sau khi `completeFocusAction` thành công và task đã đủ phút focus, hiển thị CTA `"Mark task complete"` hoặc `"Back to Planner"`. | **M** |
| **`UX-008`** | **Focus** | **P1** | `focus/focus-timer.tsx` vs `docs/PRD.md#L79, L132` | Thiếu tính năng `Pause` / `Resume` phiên tập trung dù PRD và enum database (`focus_session_status = 'paused'`) đã định nghĩa. | Người dùng có việc gián đoạn ngắn (1–2 phút) không thể tạm dừng đồng hồ, buộc phải để thời gian chạy khống hoặc hủy bỏ phiên. | Ảnh `audit_focus_1440x900.png` chỉ có 2 nút `End & log session` và `Cancel`. | Bổ sung trạng thái `Pause / Resume` (hoặc giải thích rõ triết lý không cho pause nếu muốn giữ kỷ luật nghiêm ngặt). | **M** |
| **`UX-009`** | **Tasks** | **P2** | `tasks/page.tsx#L43` | Bộ lọc trạng thái trên `/tasks` mặc định là `All` thay vì `Open` (hoặc không tách riêng khu vực `Completed`). | Khi người dùng tích lũy 20–100 tasks qua nhiều tuần, các công việc đã hoàn thành chiếm chỗ và chôn vùi các công việc đang mở ngay trong 3 thẻ chính. | Ảnh `audit_tasks_1440x900.png` hiển thị 4 task đã gạch ngang nằm xen kẽ ngay trong thẻ Must-do và Should-do. | Đổi mặc định sang `Open` (hoặc gom các task `Completed` vào một phần gập/mở ở cuối mỗi thẻ). | **S** |
| **`UX-010`** | **Tasks** | **P2** | `tasks/task-form-dialog.tsx#L107-L206` | Modal tạo task hiển thị cùng lúc 8 trường; `Focus required (min)` mặc định là `25` kể cả cho `Should-do`, không kiểm tra `requiredFocusMinutes <= estimatedMinutes`, và dòng chú thích nói chỉ áp dụng cho Must-do nhưng backend áp dụng cho mọi loại task trong Plan. | Tạo rào cản khi người dùng chỉ muốn thêm nhanh công việc; gây hiểu nhầm về quy tắc khóa hoàn thành của `Should-do` và `Bonus`. | Ảnh `audit_tasks_modal_1440x900.png` & `20260101000002_plan_and_reward.sql#L455`. | Thu gọn các trường phụ (`Notes`, `Category`, `Estimate`) vào phần mở rộng; tự động ràng buộc `Focus required <= Estimate`; làm rõ chú thích. | **S** |
| **`UX-011`** | **Planner** | **P2** | `planner/page.tsx` & `plan-task-row.tsx` | Không hiển thị tổng thời lượng ước tính (`estimatedMinutes`) của cả kế hoạch ngày, không cảnh báo khi cam kết quá nhiều giờ focus, và không có nút sắp xếp thứ tự (`sort_order`) giữa các task. | Người dùng dễ lập kế hoạch quá tải (ví dụ 5 Must-do tốn 8 tiếng focus) dẫn đến thất bại mở cổng cuối ngày. | Ảnh `audit_planner_1440x900.png` (`Gate summary` chỉ báo số lượng task và phút focus của Must-do). | Hiển thị tổng thời lượng dự kiến (`Total workload: Xh Ym`) kèm cảnh báo vàng nếu > 6 giờ; thêm nút di chuyển thứ tự hoặc tự động sắp theo độ ưu tiên. | **M** |
| **`UX-012`** | **Planner** | **P2** | `planner/page.tsx#L42-L99` | `PlanStepper` trên `/planner` dùng lưới 4 hộp lớn kiểu cũ, khác với Stepper 5 bước trên Dashboard 2.0.4 và chiếm gần hết màn hình đầu tiên trên di động (`390×844`). | Gây thiếu đồng bộ thị giác với Dashboard và bắt người dùng mobile phải cuộn dài mới tới nơi thêm công việc. | Ảnh `audit_planner_390x844.png` và `audit_planner_1440x900.png`. | Thiết kế lại `PlanStepper` theo dạng thanh ngang tinh gọn đồng bộ với Dashboard 2.0.4. | **S** |
| **`UX-013`** | **Focus** | **P2** | `focus/page.tsx` & `focus-starter.tsx` | Cho phép bắt đầu phiên tập trung trên task ngay cả khi kế hoạch hôm nay vẫn đang ở trạng thái `Draft` hoặc `Confirmed` (chưa `Active`) mà không có banner nhắc nhở kích hoạt kế hoạch. | Người dùng tưởng mình đã bắt đầu ngày làm việc chính thức nhưng thực tế kế hoạch vẫn chưa được khóa/kích hoạt. | Ảnh `audit_focus_1440x900.png`: Phiên focus đang chạy trong khi kế hoạch vẫn ở `Draft (0/0)`. | Hiển thị banner nhắc nhở nhẹ trên `/focus` nếu kế hoạch hôm nay đang ở `Draft` hoặc `Confirmed` kèm nút kích hoạt nhanh. | **S** |
| **`UX-014`** | **Shared Layout** | **P3** | `apps/web/app/(app)/layout.tsx#L38` | Container chung trong `(app)/layout.tsx` giới hạn ở `max-w-[1180px]`, trong khi Dashboard 2.0.4 đã mở rộng lên `max-w-[1280px]`. | Khi chuyển qua lại giữa Dashboard và Tasks/Planner/Focus trên màn hình Desktop rộng (`1440px` / `1920px`), lề nội dung bị co vào 100px. | Code `apps/web/app/(app)/layout.tsx#L38`. | Đổi `max-w-[1180px]` thành `max-w-[1280px]` trong `(app)/layout.tsx`. | **S** |
| **`UX-015`** | **Focus & Tasks** | **P3** | `focus/page.tsx#L217` & `tasks/task-row.tsx#L49, L104` | 1) Danh sách `Today's sessions` format enum bằng `replaceAll("_", " ")` làm hiện chữ thô `pomodoro 25 5`. 2) Vùng chạm (touch target) của checkbox hoàn thành (`20×20px`) và nút Edit/Delete (`28×28px`) trên `/tasks` hơi nhỏ trên màn hình cảm ứng. | Giảm độ chỉn chu của văn bản hiển thị và hơi khó bấm chính xác bằng ngón tay trên điện thoại nhỏ (`360px`). | Ảnh `audit_focus_1440x900.png` (`12:16 · pomodoro 25 5 · 0 min`). | Dùng bảng map nhãn chuẩn (`Pomodoro 25/5`, `Deep work 50/10`) và tăng vùng đệm chạm (`min-h-9 min-w-9`) cho các nút icon trên mobile. | **S** |

---

## PART 9 — RECOMMENDED REDESIGN PLAN (LỘ TRÌNH TRIỂN KHAI TIẾP THEO)

Để giữ vững sự ổn định của hệ thống và không đập đi xây lại những phần đã tốt, lộ trình nâng cấp cho 3 màn hình **Tasks, Planner & Focus** nên được chia thành **2 Milestone gọn, rõ mục tiêu**:

### Milestone A — Core Integrity, Misleading Metrics & Quick UX Wins (Xử lý toàn bộ P0 & P1 dữ liệu/trạng thái)
1. **Focus Timer & Validation Integrity (`UX-001`, `UX-015`):**
   - Bổ sung trạng thái **"Target Reached"** rõ ràng khi đồng hồ chạm mốc `plannedMinutes` (hiển thị thời gian hoàn thành + thời gian làm thêm giờ nếu có).
   - Loại bỏ bẫy mất phiên khi chạy quá `2 × plannedMinutes` (cảnh báo trên UI và điều chỉnh logic cập nhật/cap phút hợp lệ để người dùng không bao giờ bị đánh `is_valid = false` sau khi giao diện đã báo xanh lá *"This session is long enough to count"*).
   - Format chuẩn tên chế độ (`Pomodoro 25/5`, `Deep work 50/10`, `Custom`).
2. **Eliminate `0/0`, `0%`, and False Green States on `/planner` & `/focus` (`UX-004`):**
   - Áp dụng chuẩn Dashboard 2.0.4: Khi `mustDoTotal === 0`, hiển thị trạng thái hướng dẫn *"Not configured"* thay vì `0/0 done` và `0%`.
   - Sửa điều kiện `tone="success"` của thẻ `PLAN FOCUS LEFT` trên `/focus` (chỉ xanh khi `mustDoTotal > 0 && planFocusRemaining === 0`).
3. **Tasks Visual Cleanup (`UX-002`, `UX-009`, `UX-010`, `UX-014`):**
   - Ẩn hoàn toàn cảnh báo đỏ `overdue` trên các task đã hoàn thành (`status === "completed"`), thay bằng nhãn `"Completed"`.
   - Đổi tab mặc định hoặc tách nhóm `Completed` xuống cuối để danh sách task luôn gọn gàng.
   - Đồng bộ độ rộng container `max-w-[1280px]` trong `(app)/layout.tsx`.

### Milestone B — Seamless Cross-Screen Workflow & Interactive Plan Builder (Nối liền luồng `Tasks → Planner → Focus`)
1. **Interactive Backlog Picker trên `/planner` (`UX-003`, `UX-011`, `UX-012`):**
   - Thay thẻ `<select>` mù thông tin trong `AddPlanTask` bằng danh sách Backlog trực quan có đầy đủ badges (`Priority`, `Overdue`, `Focus required`) và các nút thêm nhanh 1 chạm (`+ Must-do`, `+ Should-do`, `+ Bonus`).
   - Hiển thị tổng khối lượng thời gian cam kết trong ngày (`Total estimated workload`) và thu gọn `PlanStepper` đồng bộ với Dashboard 2.0.4.
2. **Streamlined Plan Activation & Deep-linked Focus Handoff (`UX-005`, `UX-006`, `UX-007`):**
   - Trên `/tasks`: Hiển thị badge `In today's plan` (kèm tiến độ focus) hoặc nút `+ Plan today`.
   - Trên `/planner`: Gộp/đơn giản hóa bước `Confirm plan` → `Activate focus`; thêm nút `"Focus →"` (`/focus?taskId=...`) ngay trên mỗi hàng `PlanTaskRow` còn thiếu phút tập trung.
   - Trên `/focus`: Nhận `?taskId=` để tự động chọn sẵn task cần tập trung; sau khi kết thúc phiên đủ phút yêu cầu, hiển thị nút gợi ý hoàn thành task hoặc quay về Planner.

---

## PART 10 — SCREENSHOTS & VISUAL EVIDENCE

Toàn bộ 23 ảnh chụp màn hình thực tế từ ứng dụng đang chạy (`http://localhost:3000`) đã được lưu trữ và kiểm chứng:

### 10.1. Tasks Screen (`/tasks`)
- **Desktop & Laptop:** `audit_tasks_1920x1080.png`, `audit_tasks_1440x900.png`, `audit_tasks_1280x800.png`, `audit_tasks_modal_1440x900.png`
- **Tablet & Mobile:** `audit_tasks_1024x768.png`, `audit_tasks_768x1024.png`, `audit_tasks_390x844.png`, `audit_tasks_360x800.png`, `audit_tasks_modal_390x844.png`
- **Bằng chứng ghi nhận trên ảnh:**
  - Trong `audit_tasks_1440x900.png`, 4 công việc đã có dấu tích hoàn thành màu xanh lá và chữ gạch ngang (*"Outline the reward ledger rules"*, *"Draft the onboarding survey"*, *"Interview two FocusGate testers"*, *"Fix planner drag state"*) vẫn hiển thị nhãn đỏ **`5d overdue`**, **`3d overdue`**, **`7d overdue`** (`UX-001`/`UX-002`).
  - Trong `audit_tasks_modal_1440x900.png`, modal hiển thị 8 trường nhập liệu cùng lúc, với `Gate type = Should-do` nhưng `Focus required (min) = 25` (`UX-010`).

### 10.2. Planner Screen (`/planner`)
- **Desktop & Laptop:** `audit_planner_1920x1080.png`, `audit_planner_1440x900.png`, `audit_planner_1280x800.png`
- **Tablet & Mobile:** `audit_planner_1024x768.png`, `audit_planner_768x1024.png`, `audit_planner_390x844.png`, `audit_planner_360x800.png`
- **Bằng chứng ghi nhận trên ảnh:**
  - Trong `audit_planner_1440x900.png`, khi kế hoạch ở trạng thái `Draft` chưa có task nào, màn hình hiển thị `Draft · 0 tasks · 0/0 must-dos done`, thẻ `Gate summary` hiển thị `MUST-DO PROGRESS: 0% (0/0 done)` và `Focus done: 0m / 0m` (`UX-004`).
  - Khu vực `Add from backlog` chỉ là một ô dropdown `<select>` đơn điệu không hiển thị hạn chót hay độ ưu tiên của các task trong backlog (`UX-003`).
  - Trong `audit_planner_390x844.png`, 4 hộp `PlanStepper` xếp chồng theo chiều dọc chiếm phần lớn màn hình đầu tiên trên điện thoại (`UX-012`).

### 10.3. Focus Screen (`/focus`)
- **Desktop & Laptop:** `audit_focus_1920x1080.png`, `audit_focus_1440x900.png`, `audit_focus_1280x800.png`
- **Tablet & Mobile:** `audit_focus_1024x768.png`, `audit_focus_768x1024.png`, `audit_focus_390x844.png`, `audit_focus_360x800.png`
- **Bằng chứng ghi nhận trên ảnh:**
  - Trong `audit_focus_1440x900.png`, phiên `Pomodoro 25/5` đang đếm lên tới **`FOCUSED FOR 56:45` (`56 / 25 min`)** với hộp thông báo màu xanh lá *"This session is long enough to count. End it whenever you are ready"* — nhưng nếu bấm kết thúc ở phút 56 (> 50 phút), trigger PostgreSQL sẽ đánh dấu `is_valid = false` (`UX-001`).
  - Thẻ thống kê thứ 3 hiển thị **`PLAN FOCUS LEFT: 0m`** với biểu tượng đồng hồ cát **màu xanh lá (`success`)** kèm dòng phụ `0/0 must-dos done`, và thẻ `Today's sessions` hiển thị chuỗi thô **`12:16 · pomodoro 25 5 · 0 min`** (`UX-004`, `UX-015`).
