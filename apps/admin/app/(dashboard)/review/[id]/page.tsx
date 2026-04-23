import { notFound } from "next/navigation";
import { getReviewById } from "@shop-claw/shared/store";
import { ReviewWorkbench } from "@/components/review-workbench";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await getReviewById(id);

  if (!review) {
    notFound();
  }

  return <ReviewWorkbench review={review} />;
}
