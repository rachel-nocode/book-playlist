import { BookDetail } from "./book-detail";
import { Id } from "../../../convex/_generated/dataModel";

export default function BookPage({
  params,
}: {
  params: { bookId: string };
}) {
  return (
    <main className="min-h-dvh bg-black px-4 py-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl rounded-2xl bg-[#181818] p-4 sm:p-6">
        <BookDetail bookId={params.bookId as Id<"books">} />
      </div>
    </main>
  );
}
