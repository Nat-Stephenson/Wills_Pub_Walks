'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from '@/types';
import styles from './RouteCard.module.css';

interface RouteCardProps {
  route: Route;
  isLoggedIn?: boolean;
  isCompleted?: boolean;
  onMarkComplete?: (routeId: string) => void;
}

export function RouteCard({ route, isLoggedIn = false, isCompleted = false, onMarkComplete }: RouteCardProps) {
  const router = useRouter();

  const getDifficultyClass = (difficulty: Route['difficulty']) => {
    if (difficulty === null) return styles.difficultyMid;
    if (difficulty <= 2) return styles.difficultyEasy;
    if (difficulty <= 3) return styles.difficultyMid;
    return styles.difficultyHard;
  };

  const getDifficultyLabel = (difficulty: Route['difficulty']) => {
    if (difficulty === null) return null;
    const labels: Record<number, string> = {
      1: 'Grade 1',
      2: 'Grade 2',
      3: 'Grade 3',
      4: 'Grade 4',
      5: 'Grade 5',
    };
    return labels[difficulty];
  };

  return (
    <div className={styles.routeCard}>
      <Link href={`/routes/${route.route_code}`} className={styles.routeLink}>
        <div className={styles.routeContent}>
          <h3 className={styles.routeName}>{route.name}</h3>

          {route.story && (
            <p className={styles.routeDescription}>{route.story}</p>
          )}

          <div className={styles.routeStats}>
            <div className={styles.statGroup}>
              {route.distance_km != null && (
                <span className={styles.stat}>📏 {route.distance_km} km</span>
              )}
              {route.duration_hours != null && (
                <span className={styles.stat}>⏱️ {route.duration_hours} hrs</span>
              )}
            </div>
            {route.difficulty && (
              <div className={`${styles.difficultyBadge} ${getDifficultyClass(route.difficulty)}`}>
                {getDifficultyLabel(route.difficulty)}
              </div>
            )}
          </div>
        </div>
      </Link>

      <div className={styles.cardActions}>
        <button
          className={styles.startButton}
          onClick={() => router.push(`/map?route=${route.route_code}`)}
        >
          🗺 Start Route
        </button>

        {isLoggedIn && (
          isCompleted ? (
            <div className={styles.completedBadge}>✓ Completed</div>
          ) : (
            <button
              className={styles.completeButton}
              onClick={() => onMarkComplete?.(route.id)}
            >
              Mark as Completed
            </button>
          )
        )}
      </div>
    </div>
  );
}