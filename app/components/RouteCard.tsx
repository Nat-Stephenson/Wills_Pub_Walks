import Link from 'next/link';
import Image from 'next/image';
import type { Route } from '@/types';
import styles from './RouteCard.module.css';

interface RouteCardProps {
  route: Route;
}

export function RouteCard({ route }: RouteCardProps) {
  const getDifficultyClass = (difficulty: Route['difficulty']) => {
    switch (difficulty) {
      case 'Easy':
        return styles.difficultyEasy;
      case 'Moderate':
        return styles.difficultyModerate;
      case 'Challenging':
        return styles.difficultyChallenging;
      default:
        return styles.difficultyModerate;
    }
  };

  return (
    <Link href={`/route/${route.id}`} className={styles.routeCard}>
      <div className={styles.imageContainer}>
        <Image
          src="/WithoutName.png"
          alt={route.name}
          fill
          className={styles.routeImage}
          style={{ objectFit: 'cover' }}
        />
        {route.isCompleted && (
          <div className={styles.completedBadge}>
            ✓
          </div>
        )}
        <div className={`${styles.difficultyBadge} ${getDifficultyClass(route.difficulty)}`}>
          {route.difficulty}
        </div>
      </div>
      
      <div className={styles.routeContent}>
        <h3 className={styles.routeName}>{route.name}</h3>
        <p className={styles.routeDescription}>{route.description}</p>
        
        <div className={styles.routeStats}>
          <div className={styles.statGroup}>
            <span className={styles.stat}>
              📏 {route.distance}
            </span>
            <span className={styles.stat}>
              ⏱️ {route.duration}
            </span>
          </div>
          <div className={styles.pubStat}>
            🍺 1
          </div>
        </div>
        
        <div className={styles.routeRegion}>
          📍 {route.region}
        </div>
      </div>
    </Link>
  );
}