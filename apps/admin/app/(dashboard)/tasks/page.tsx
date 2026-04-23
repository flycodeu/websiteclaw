import { getPlatformState } from "@shop-claw/shared/store";
import { TasksBoard } from "@/components/tasks-board";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const state = await getPlatformState();

  return <TasksBoard tasks={state.tasks} />;
}
