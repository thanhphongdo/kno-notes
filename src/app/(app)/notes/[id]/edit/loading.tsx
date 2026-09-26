import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-1120 flex-wrap gap-40 px-16 pt-20 pb-80 min-[820px]:px-40 min-[820px]:pt-36">
      <div className="flex min-w-0 flex-[1_1_600px] flex-col gap-14">
        <Skeleton className="h-44 w-[70%]" radius="6" />
        <Skeleton className="h-22 w-[90%]" radius="6" />
        <Skeleton className="h-460" radius="14" />
      </div>
      <Skeleton className="h-420 max-w-300 flex-[1_1_280px]" radius="12" />
    </div>
  );
}
