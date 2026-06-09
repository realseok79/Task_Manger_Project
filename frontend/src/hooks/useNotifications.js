/**
 * useNotifications — derives a small notification list from the live task data:
 * repeatedly-delayed (zombie) tasks and tasks whose deadline is imminent.
 * No separate backend channel; this reuses the existing tasks endpoint.
 */
import { useEffect, useState } from 'react';
import { getAllPending, toViewModel } from '../api/tasks';
import { DEFAULT_USER_ID } from '../api/client';

function ddayNum(dday) {
  if (!dday) return 9999;
  if (dday === 'D-DAY') return 0;
  const m = dday.match(/D([+-])(\d+)/);
  return m ? (m[1] === '-' ? 1 : -1) * Number(m[2]) : 9999;
}

export function useNotifications(userId = DEFAULT_USER_ID) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    let alive = true;
    getAllPending(userId)
      .then((data) => {
        if (!alive) return;
        const notes = [];
        data.map(toViewModel).forEach((v) => {
          if (v.isZombie) {
            notes.push({ id: `z-${v.id}`, kind: 'danger', title: v.title, text: `${v.delayCount}번 미뤄진 작업이에요` });
          } else if (ddayNum(v.dday) <= 1) {
            notes.push({ id: `d-${v.id}`, kind: 'warning', title: v.title, text: `마감이 임박했어요 · ${v.dday}` });
          }
        });
        // Danger (zombie) first, then imminent deadlines.
        notes.sort((a, b) => Number(b.kind === 'danger') - Number(a.kind === 'danger'));
        setNotifications(notes);
      })
      .catch(() => setNotifications([]));
    return () => {
      alive = false;
    };
  }, [userId]);

  return notifications;
}
