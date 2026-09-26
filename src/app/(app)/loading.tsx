import { Skeleton, SkeletonGroup } from '@/components/ui';

/** Matches the dashboard's container so the page does not jump when it lands. */
export default function AppLoading() {
  return (
    <div className="mx-auto flex w-full max-w-1160 flex-col gap-24 px-16 pt-20 pb-64 min-[820px]:px-40 min-[820px]:pt-36">
      <SkeletonGroup label="Đang tải">
        <Skeleton className="h-38 w-260" />
        <div className="grid gap-16 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} radius="14" className="min-h-200" />
          ))}
        </div>
      </SkeletonGroup>
    </div>
  );
}
