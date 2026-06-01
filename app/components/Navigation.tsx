'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { NavItem } from '@/types';
import styles from './Navigation.module.css';

// Import images
import TreeIcon from '@/assets/Tree.png';
import PintBeerIcon from '@/assets/PintBeer.png';
import TrekIcon from '@/assets/Trek.png';
import MapIcon from '@/assets/Map.png';

const navItems = [
  { path: '/', label: 'Routes', icon: TreeIcon },
  { path: '/create', label: 'Create', icon: PintBeerIcon },
  { path: '/my-walks', label: 'My Walks', icon: TrekIcon },
  { path: '/map', label: 'Map', icon: MapIcon },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {navItems.map((item) => {
        const isActive = pathname === item.path;
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
          >
            <Image
              src={item.icon}
              alt={`${item.label} icon`}
              width={30}
              height={30}
              className={styles.navIcon}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}