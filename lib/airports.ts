import 'server-only'

import fs from 'node:fs'
import path from 'node:path'
import type { AirportOption } from '@/types'

const AIRPORT_CSV_PATH = path.join(process.cwd(), 'data', 'iata-icao.csv')

let airportCache: AirportOption[] | null = null

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      const nextCharacter = line[index + 1]

      if (insideQuotes && nextCharacter === '"') {
        current += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }

      continue
    }

    if (character === ',' && !insideQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += character
  }

  values.push(current)
  return values
}

function loadAirports(): AirportOption[] {
  if (airportCache) {
    return airportCache
  }

  const csvContent = fs.readFileSync(AIRPORT_CSV_PATH, 'utf-8').replace(/^\ufeff/, '')
  const rows = csvContent
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  airportCache = rows
    .slice(1)
    .map((line) => parseCsvLine(line))
    .map(([country_code, region_name, iata, icao, airport, latitude, longitude]) => ({
      country_code,
      region_name,
      iata,
      icao,
      airport,
      latitude: Number.parseFloat(latitude),
      longitude: Number.parseFloat(longitude),
    }))
    .filter((airport) => airport.icao && Number.isFinite(airport.latitude) && Number.isFinite(airport.longitude))

  return airportCache
}

function scoreAirport(airport: AirportOption, query: string) {
  const exactIcao = airport.icao.toLowerCase() === query ? 120 : 0
  const startsWithIcao = airport.icao.toLowerCase().startsWith(query) ? 80 : 0
  const exactIata = airport.iata.toLowerCase() === query ? 70 : 0
  const startsWithIata = airport.iata.toLowerCase().startsWith(query) ? 50 : 0
  const airportName = airport.airport.toLowerCase().includes(query) ? 40 : 0
  const regionName = airport.region_name.toLowerCase().includes(query) ? 30 : 0
  const countryCode = airport.country_code.toLowerCase().includes(query) ? 10 : 0

  return Math.max(exactIcao, startsWithIcao, exactIata, startsWithIata, airportName, regionName, countryCode)
}

export function getAirports(): AirportOption[] {
  return loadAirports()
}

export function getAirportByICAO(icao: string): AirportOption | null {
  const normalized = icao.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  return loadAirports().find((airport) => airport.icao.toLowerCase() === normalized) || null
}

export function searchAirports(query: string, limit = 20): AirportOption[] {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return []
  }

  return loadAirports()
    .map((airport) => ({
      airport,
      score: scoreAirport(airport, normalized),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.airport.icao.localeCompare(right.airport.icao)
    })
    .slice(0, limit)
    .map((entry) => entry.airport)
}
