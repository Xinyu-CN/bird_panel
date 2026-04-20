import 'server-only'

import { db } from '@/lib/db'
import { DEFAULT_SYSTEM_SETTINGS } from '@/lib/system-settings-defaults'
import type { SystemSettings } from '@/types'

export async function getSystemSettings(): Promise<SystemSettings> {
  const settings = await db.getSettings()
  const nextSettings = { ...DEFAULT_SYSTEM_SETTINGS }

  for (const setting of settings) {
    if (setting.key in nextSettings) {
      nextSettings[setting.key as keyof SystemSettings] = setting.value
    }
  }

  return nextSettings
}

export function parseBooleanSetting(value: string | null | undefined) {
  return value === 'true'
}
