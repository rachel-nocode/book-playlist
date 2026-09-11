import { BookDetail } from "./book-detail";
import { Id } from "../../../convex/_generated/dataModel";
import { SiteHeader } from "../../site-header";

export default function BookPage({
  params,
}: {
  params: { bookId: string };
}) {
  return (
    <main className="min-h-dvh text-foreground">
      <SiteHeader />
      <div className="page-shell pb-16 pt-6 sm:pt-8">
        <BookDetail bookId={params.bookId as Id<"books">} />
      </div>
    </main>
  );
}
