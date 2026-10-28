import { Sun, House, BookOpen, MoonStars, SneakerMove, type Icon } from '@phosphor-icons/react'
import type { KidId } from './types'

export interface KidMeta {
  id: KidId
  name: string
  color: string
  light: string
  dark: string
}

export const KIDS: KidMeta[] = [
  { id: 'alex', name: 'Alex', color: '#1186ac', light: '#cbeeff', dark: '#006786' },
  { id: 'sam', name: 'Sam', color: '#d82071', light: '#ffdee6', dark: '#aa0b56' },
]

export function kidMeta(id: KidId): KidMeta {
  return KIDS.find((k) => k.id === id)!
}

export interface SectionMeta {
  name: string
  Icon: Icon
}

export const SECTIONS: SectionMeta[] = [
  { name: 'Morning', Icon: Sun },
  { name: 'After School', Icon: House },
  { name: 'Homework Time', Icon: BookOpen },
  { name: 'Evening', Icon: MoonStars },
  { name: 'Activities', Icon: SneakerMove },
]

export const CONFETTI_INKS = ['#0088b0', '#d6006c', '#edbb00', '#201e1d']
