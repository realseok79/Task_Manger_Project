/**
 * useAvailableTime — 오늘의 가용시간 스냅샷(total/allocated/consumed/remaining) + 설정/갱신.
 * 작업 생성·완료(환급) 후 refetch 로 게이지를 갱신한다.
 */
import { useCallback, useEffect, useState } from 'react';
import { getAvailableTime, setAvailableTime } from '../api/availableTime';

export function useAvailableTime() {
  const [snapshot, setSnapshot] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const s = await getAvailableTime();
      setSnapshot(s);
    } catch (e) {
      setError(e.message || '가용시간을 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  /** 가용시간(초) 설정. 할당량보다 작으면 서버가 400(AVAILABLE_BELOW_ALLOCATED) → throw. */
  const updateAvailable = useCallback(async (seconds) => {
    const r = await setAvailableTime(seconds);
    await refetch();
    return r;
  }, [refetch]);

  return { snapshot, isLoading, error, refetch, updateAvailable };
}
