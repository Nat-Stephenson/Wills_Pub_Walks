'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Route } from '@/types';
import styles from './RouteCard.module.css';

interface RouteCardProps {
  route: Route;
  isCompleted?: boolean;
  isFavourited?: boolean;
}

export function RouteCard({ route, isCompleted = false, isFavourited = false }: RouteCardProps) {
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
      <div className={styles.cardHeader}>
        <Image src="/WithoutName.png" alt="" width={80} height={80} />
        {isFavourited && <span className={styles.favouriteIndicator} title="Favourited">♥</span>}
      </div>
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
              {route.duration_minutes != null && (
                <span className={styles.stat}>⏱️ {route.duration_minutes} mins</span>
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

      {route.pub_label && (
        <div className={styles.pubInfo}>
          <Image src="/PintBeer.png" alt="" width={16} height={16} />
          {route.pub_postcode ? (
            <a
              href={`https://www.google.com/maps/search/${encodeURIComponent((route.pub_label ?? "") + " " + route.pub_postcode)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.pubName}
              style={{ textDecoration: "underline", color: "inherit" }}
              onClick={(e) => e.stopPropagation()}
            >
              {route.pub_label}
              <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem", opacity: 0.7 }}>{route.pub_postcode}</span>
            </a>
          ) : (
            <span className={styles.pubName}>{route.pub_label}</span>
          )}
        </div>
      )}

      <div className={styles.cardActions}>
        <button
          className={styles.startButton}
          onClick={() => router.push(`/map?route=${route.route_code}`)}
        >
          Start Route
        </button>
        {isCompleted && <div className={styles.completedBadge}>✓ Completed</div>}
      </div>
    </div>
  );
}