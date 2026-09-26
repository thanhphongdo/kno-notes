import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-1120 flex-wrap gap-56 px-16 pt-20 pb-80 min-[820px]:px-40 min-[820px]:pt-36">
      <div className="flex max-w-740 flex-[1_1_560px] flex-col gap-16">
        <Skeleton className="h-26 w-180" radius="full" />
        <Skeleton className="h-44 w-[80%]" radius="6" />
        <Skeleton className="h-320" radius="12" />
      </div>
      <Skeleton className="h-280 max-w-300 flex-[1_1_260px]" radius="12" />
    </div>
  );
}
