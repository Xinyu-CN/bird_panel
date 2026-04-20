import 'server-only'

import nodemailer from 'nodemailer'
import { db } from '@/lib/db'
import { getSystemSettings, parseBooleanSetting } from '@/lib/system-settings'
import type { Alert } from '@/types'

function buildAlertText(alert: Alert, context: { serverName?: string | null }) {
  const parts = [
    `级别：${alert.severity}`,
    `类型：${alert.type}`,
    `内容：${alert.message}`,
  ]

  if (context.serverName) {
    parts.push(`节点：${context.serverName}`)
  }

  if (alert.tunnel_id) {
    parts.push(`隧道 ID：${alert.tunnel_id}`)
  }

  if (alert.session_id) {
    parts.push(`Session ID：${alert.session_id}`)
  }

  parts.push(`时间：${new Date(alert.created_at * 1000).toLocaleString('zh-CN')}`)
  return parts.join('\n')
}

async function sendTelegramNotification(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Telegram returned ${response.status}`)
  }
}

async function sendBarkNotification(url: string, title: string, body: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      body,
      level: 'active',
    }),
  })

  if (!response.ok) {
    throw new Error(`Bark returned ${response.status}`)
  }
}

async function sendFeishuNotification(webhookUrl: string, title: string, body: string) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text: `${title}\n${body}`,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Feishu returned ${response.status}`)
  }
}

async function sendEmailNotification(config: {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  to: string
}, subject: string, body: string) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user || config.pass ? {
      user: config.user,
      pass: config.pass,
    } : undefined,
  })

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject,
    text: body,
  })
}

export async function notifyAlert(alertId: number) {
  const alert = await db.getAlert(alertId)
  if (!alert) {
    return
  }

  const [settings, server] = await Promise.all([
    getSystemSettings(),
    alert.server_id ? db.getServer(alert.server_id) : Promise.resolve(null),
  ])

  const title = `[BGP Panel 告警] ${alert.severity.toUpperCase()} · ${alert.type}`
  const body = buildAlertText(alert, { serverName: server?.name || null })
  const errors: string[] = []
  const smtpPort = Number.parseInt(settings.notify_email_smtp_port || '587', 10)

  if (parseBooleanSetting(settings.notify_telegram_enabled) && settings.notify_telegram_bot_token && settings.notify_telegram_chat_id) {
    try {
      await sendTelegramNotification(settings.notify_telegram_bot_token, settings.notify_telegram_chat_id, `${title}\n${body}`)
    } catch (error) {
      errors.push(`Telegram: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  if (parseBooleanSetting(settings.notify_email_enabled) && settings.notify_email_smtp_host && settings.notify_email_from && settings.notify_email_to) {
    try {
      await sendEmailNotification({
        host: settings.notify_email_smtp_host,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: parseBooleanSetting(settings.notify_email_smtp_secure),
        user: settings.notify_email_smtp_user,
        pass: settings.notify_email_smtp_pass,
        from: settings.notify_email_from,
        to: settings.notify_email_to,
      }, title, body)
    } catch (error) {
      errors.push(`Email: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  if (parseBooleanSetting(settings.notify_bark_enabled) && settings.notify_bark_url) {
    try {
      await sendBarkNotification(settings.notify_bark_url, title, body)
    } catch (error) {
      errors.push(`Bark: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  if (parseBooleanSetting(settings.notify_feishu_enabled) && settings.notify_feishu_webhook_url) {
    try {
      await sendFeishuNotification(settings.notify_feishu_webhook_url, title, body)
    } catch (error) {
      errors.push(`Feishu: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  if (errors.length > 0) {
    console.error('Alert notification errors:', errors.join(' | '))
  }
}
