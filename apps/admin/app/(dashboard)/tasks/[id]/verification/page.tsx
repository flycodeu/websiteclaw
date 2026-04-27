import { getPlatformState } from "@shop-claw/shared/store";
import { notFound } from "next/navigation";
import { VerificationLauncher } from "@/components/verification-launcher";

export const dynamic = "force-dynamic";

export default async function TaskVerificationPage({
  params
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = await params;
  const state = await getPlatformState();
  const task = state.tasks.find((item) => item.id === resolvedParams.id);

  if (!task) {
    notFound();
  }

  return <VerificationLauncher taskId={task.id} sourceName={task.sourceName} />;
}
