export type TaskKind = "appointment" | "complaint" | "restock";

export interface TeamTask {
  id: string;
  kind: TaskKind;
  title: string;
  detail: string;
  assigneeStaffId: string;
  due: string;
  done: boolean;
}

/** Mock unified team task list — pulls conceptually from bookings/reviews/inventory; a dedicated aggregate is INT-009. */
export const TEAM_TASKS: TeamTask[] = [
  { id: "t1", kind: "appointment", title: "Full Color & Highlights — Lena Fischer", detail: "11:00 AM today", assigneeStaffId: "s1", due: "Today", done: false },
  { id: "t2", kind: "complaint", title: "Follow up: slow checkout complaint", detail: "Casey Nolan — private feedback", assigneeStaffId: "s1", due: "Today", done: false },
  { id: "t3", kind: "appointment", title: "Beard Trim — Tariq Malik", detail: "10:00 AM today", assigneeStaffId: "s2", due: "Today", done: false },
  { id: "t4", kind: "restock", title: "Reorder Heat Protectant Spray", detail: "1 left, below threshold", assigneeStaffId: "s2", due: "This week", done: false },
  { id: "t5", kind: "appointment", title: "Classic Manicure — Priya Nair", detail: "4:00 PM today", assigneeStaffId: "s3", due: "Today", done: true },
  { id: "t6", kind: "appointment", title: "Express Facial — Jordan Blake", detail: "1:00 PM today", assigneeStaffId: "s4", due: "Today", done: false },
];
