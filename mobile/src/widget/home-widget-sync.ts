// The iPhone home-screen widget lives in home-widget-sync.ios.ts; Android draws its widget in
// the widget task (widget-task.tsx). Nothing to do here.
import type { Repo } from '@/db/repo';

export async function updateHomeWidget(_repo: Repo): Promise<void> {}

export function registerHomeWidget(): void {}
