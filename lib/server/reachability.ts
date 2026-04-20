import 'server-only'

import type { Server, ServerReachabilityResult } from '@/types'
import { createServerSSHConnection } from './ssh-access'

function parsePacketLoss(output: string) {
  const match = output.match(/(\d+(?:\.\d+)?)%\s*packet loss/i)
  return match ? Number.parseFloat(match[1]) : null
}

function parseAverageLatency(output: string) {
  const slashMatch = output.match(/=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+\s*ms/)
  if (slashMatch) {
    return Number.parseFloat(slashMatch[1])
  }

  const rttMatch = output.match(/avg(?:imum)?\s*=\s*([\d.]+)\s*ms/i)
  return rttMatch ? Number.parseFloat(rttMatch[1]) : null
}

export async function pingBackboneAddress(source: Server, target: Server): Promise<ServerReachabilityResult> {
  const ssh = await createServerSSHConnection(source)
  const targetAddress = target.ipv6_address
  const command = `if command -v ping >/dev/null 2>&1; then ping -6 -c 3 -w 5 ${targetAddress}; elif command -v ping6 >/dev/null 2>&1; then ping6 -c 3 -w 5 ${targetAddress}; else echo 'ping not available' >&2; exit 127; fi`

  try {
    const result = await ssh.exec(command)
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()

    return {
      source_server_id: source.id,
      target_server_id: target.id,
      target_name: target.name,
      target_address: targetAddress,
      success: result.exitCode === 0,
      exit_code: result.exitCode,
      packet_loss: parsePacketLoss(output),
      avg_latency_ms: parseAverageLatency(output),
      output,
      tested_at: Date.now(),
    }
  } finally {
    ssh.close()
  }
}

export async function pingBackboneTargets(source: Server, targets: Server[]) {
  const results: ServerReachabilityResult[] = []

  for (const target of targets) {
    if (target.id === source.id || !target.ipv6_address) {
      continue
    }

    try {
      results.push(await pingBackboneAddress(source, target))
    } catch (error) {
      results.push({
        source_server_id: source.id,
        target_server_id: target.id,
        target_name: target.name,
        target_address: target.ipv6_address,
        success: false,
        exit_code: null,
        packet_loss: null,
        avg_latency_ms: null,
        output: error instanceof Error ? error.message : 'Ping test failed',
        tested_at: Date.now(),
      })
    }
  }

  return results
}
