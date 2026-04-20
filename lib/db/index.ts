import 'server-only'

import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type {
  Alert,
  BGPSession,
  BGPSessionWithRelations,
  Server,
  ServerIXPMembership,
  Setting,
  SSHKey,
  TrafficStats,
  Tunnel,
  TunnelWithServers,
  User,
} from '@/types'

const DB_DIRECTORY = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIRECTORY, 'panel.sqlite')

interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

interface Statement {
  run(...params: unknown[]): RunResult
  get<T>(...params: unknown[]): T | undefined
  all<T>(...params: unknown[]): T[]
}

interface SqliteDatabase {
  pragma(source: string): unknown
  exec(sql: string): SqliteDatabase
  prepare(sql: string): Statement
}

declare global {
  var __bgpPanelDb: SqliteDatabase | undefined
}

function now() {
  return Math.floor(Date.now() / 1000)
}

function normalizeBoolean(value: unknown) {
  return Boolean(value)
}

function normalizeUser(row: User): User {
  return {
    ...row,
    can_manage_users: normalizeBoolean(row.can_manage_users),
  }
}

function normalizeServer(row: Server): Server {
  return {
    ...row,
    is_core: normalizeBoolean(row.is_core),
    is_initialized: normalizeBoolean(row.is_initialized),
  }
}

function normalizeTunnel(row: Tunnel): Tunnel {
  return {
    ...row,
    ospf_enabled: normalizeBoolean(row.ospf_enabled),
  }
}

function normalizeBGPSession(row: BGPSession): BGPSession {
  return {
    ...row,
    multihop: Number(row.multihop || 0),
  }
}

function normalizeServerIxpMembership(row: ServerIXPMembership): ServerIXPMembership {
  return {
    ...row,
    is_rs_peer: normalizeBoolean(row.is_rs_peer),
  }
}

function normalizeAlert(row: Alert): Alert {
  return {
    ...row,
    resolved: normalizeBoolean(row.resolved),
  }
}

function createSchema(sqlite: SqliteDatabase) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      can_manage_users INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ssh_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      private_key TEXT NOT NULL,
      public_key TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('rr', 'node')),
      is_core INTEGER NOT NULL DEFAULT 0,
      is_initialized INTEGER NOT NULL DEFAULT 0,
      icao_code TEXT NOT NULL,
      node_id INTEGER NOT NULL,
      hostname TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      city TEXT,
      country_code TEXT NOT NULL,
      region_code TEXT NOT NULL,
      local_asn INTEGER NOT NULL,
      ipv4_address TEXT,
      ipv6_address TEXT NOT NULL,
      ipv6_prefix TEXT,
      router_id TEXT,
      ssh_host TEXT NOT NULL,
      ssh_port INTEGER NOT NULL,
      ssh_user TEXT NOT NULL,
      ssh_key_id INTEGER REFERENCES ssh_keys(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'initializing', 'online', 'offline', 'error')),
      last_seen_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tunnels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      server_a_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      server_b_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      tunnel_type TEXT NOT NULL CHECK (tunnel_type IN ('wireguard', 'vxlan', 'gre', 'direct')),
      bandwidth_mbps INTEGER,
      wg_mode TEXT,
      wg_port INTEGER NOT NULL,
      wg_public_key_a TEXT,
      wg_public_key_b TEXT,
      tunnel_ipv4_a TEXT,
      tunnel_ipv4_b TEXT,
      tunnel_ipv6_a TEXT,
      tunnel_ipv6_b TEXT,
      ospf_enabled INTEGER NOT NULL DEFAULT 1,
      ospf_mode TEXT,
      ospf_type TEXT,
      ospf_password TEXT,
      ospf_cost INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'configuring', 'up', 'down', 'error')),
      latency_ms INTEGER,
      last_check_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tunnel_secrets (
      tunnel_id INTEGER PRIMARY KEY REFERENCES tunnels(id) ON DELETE CASCADE,
      wg_private_key_a TEXT,
      wg_private_key_b TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_ixps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      ix_id INTEGER NOT NULL,
      ix_name TEXT NOT NULL,
      ix_name_long TEXT,
      ix_country TEXT,
      ix_city TEXT,
      ix_region_continent TEXT,
      local_asn INTEGER NOT NULL,
      local_ipaddr4 TEXT,
      local_ipaddr6 TEXT,
      speed INTEGER,
      is_rs_peer INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(server_id, ix_id)
    );

    CREATE TABLE IF NOT EXISTS bgp_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      peer_server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
      server_ixp_membership_id INTEGER REFERENCES server_ixps(id) ON DELETE SET NULL,
      tunnel_id INTEGER REFERENCES tunnels(id) ON DELETE SET NULL,
      ix_id INTEGER,
      ix_name TEXT,
      session_type TEXT NOT NULL CHECK (session_type IN ('ibgp', 'rr', 'upstream', 'downstream', 'peer', 'customer')),
      transport_mode TEXT NOT NULL CHECK (transport_mode IN ('ix', 'internal', 'tunnel')) DEFAULT 'internal',
      address_family TEXT NOT NULL CHECK (address_family IN ('ipv4', 'ipv6', 'dual')) DEFAULT 'dual',
      peer_asn INTEGER NOT NULL,
      peer_name TEXT,
      local_ipv4 TEXT,
      local_ipv6 TEXT,
      peer_ipv4 TEXT,
      peer_ipv6 TEXT,
      multihop INTEGER NOT NULL DEFAULT 0,
      password TEXT,
      import_filter TEXT,
      export_filter TEXT,
      description TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'established', 'idle', 'connect', 'active', 'opensent', 'openconfirm', 'error')),
      prefixes_received INTEGER NOT NULL DEFAULT 0,
      prefixes_sent INTEGER NOT NULL DEFAULT 0,
      last_state_change INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traffic_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      tunnel_id INTEGER REFERENCES tunnels(id) ON DELETE CASCADE,
      timestamp INTEGER NOT NULL,
      bytes_in INTEGER NOT NULL DEFAULT 0,
      bytes_out INTEGER NOT NULL DEFAULT 0,
      packets_in INTEGER NOT NULL DEFAULT 0,
      packets_out INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
      tunnel_id INTEGER REFERENCES tunnels(id) ON DELETE SET NULL,
      session_id INTEGER REFERENCES bgp_sessions(id) ON DELETE SET NULL,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_servers_type ON servers(type);
    CREATE INDEX IF NOT EXISTS idx_server_ixps_server_id ON server_ixps(server_id);
    CREATE INDEX IF NOT EXISTS idx_tunnels_status ON tunnels(status);
    CREATE INDEX IF NOT EXISTS idx_tunnel_secrets_tunnel_id ON tunnel_secrets(tunnel_id);
    CREATE INDEX IF NOT EXISTS idx_bgp_sessions_server_id ON bgp_sessions(server_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_traffic_stats_timestamp ON traffic_stats(timestamp DESC);
  `)
}

function migrateEmptyLegacySchema(sqlite: SqliteDatabase) {
  const serverColumns = sqlite
    .prepare("SELECT name FROM pragma_table_info('servers')")
    .all<{ name: string }>()

  if (serverColumns.length === 0) {
    createSchema(sqlite)
    return
  }

  const hasIsCore = serverColumns.some((column) => column.name === 'is_core')
  if (hasIsCore) {
    return
  }

  const tableCounts = {
    users: sqlite.prepare('SELECT COUNT(*) as count FROM users').get<{ count: number }>()?.count || 0,
    servers: sqlite.prepare('SELECT COUNT(*) as count FROM servers').get<{ count: number }>()?.count || 0,
    tunnels: sqlite.prepare('SELECT COUNT(*) as count FROM tunnels').get<{ count: number }>()?.count || 0,
    sessions: sqlite.prepare('SELECT COUNT(*) as count FROM bgp_sessions').get<{ count: number }>()?.count || 0,
    alerts: sqlite.prepare('SELECT COUNT(*) as count FROM alerts').get<{ count: number }>()?.count || 0,
    traffic: sqlite.prepare('SELECT COUNT(*) as count FROM traffic_stats').get<{ count: number }>()?.count || 0,
  }

  const hasData = Object.values(tableCounts).some((count) => count > 0)
  if (hasData) {
    throw new Error('Legacy server schema detected. Please migrate existing data manually before using the new rr/node model.')
  }

  sqlite.pragma('foreign_keys = OFF')
  sqlite.exec(`
    DROP TABLE IF EXISTS alerts;
    DROP TABLE IF EXISTS traffic_stats;
    DROP TABLE IF EXISTS bgp_sessions;
    DROP TABLE IF EXISTS tunnels;
    DROP TABLE IF EXISTS servers;
    DROP TABLE IF EXISTS ssh_keys;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS users;
  `)
  createSchema(sqlite)
  sqlite.pragma('foreign_keys = ON')
}

function hasColumn(sqlite: SqliteDatabase, table: string, column: string) {
  const columns = sqlite
    .prepare(`SELECT name FROM pragma_table_info('${table}')`)
    .all<{ name: string }>()

  return columns.some((entry) => entry.name === column)
}

function migrateCurrentSchema(sqlite: SqliteDatabase) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tunnel_secrets (
      tunnel_id INTEGER PRIMARY KEY REFERENCES tunnels(id) ON DELETE CASCADE,
      wg_private_key_a TEXT,
      wg_private_key_b TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tunnel_secrets_tunnel_id ON tunnel_secrets(tunnel_id);

    CREATE TABLE IF NOT EXISTS server_ixps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      ix_id INTEGER NOT NULL,
      ix_name TEXT NOT NULL,
      ix_name_long TEXT,
      ix_country TEXT,
      ix_city TEXT,
      ix_region_continent TEXT,
      local_asn INTEGER NOT NULL,
      local_ipaddr4 TEXT,
      local_ipaddr6 TEXT,
      speed INTEGER,
      is_rs_peer INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(server_id, ix_id)
    );

    CREATE INDEX IF NOT EXISTS idx_server_ixps_server_id ON server_ixps(server_id);
  `)

  const bgpSessionTableSql = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bgp_sessions'")
    .get<{ sql: string }>()?.sql || ''

  const needsSessionRebuild =
    !bgpSessionTableSql.includes('transport_mode') ||
    bgpSessionTableSql.includes("'ixp'") ||
    !bgpSessionTableSql.includes('local_ipv4')

  if (needsSessionRebuild) {
    sqlite.pragma('foreign_keys = OFF')
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS bgp_sessions_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        peer_server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
        server_ixp_membership_id INTEGER REFERENCES server_ixps(id) ON DELETE SET NULL,
        tunnel_id INTEGER REFERENCES tunnels(id) ON DELETE SET NULL,
        ix_id INTEGER,
        ix_name TEXT,
        session_type TEXT NOT NULL CHECK (session_type IN ('ibgp', 'rr', 'upstream', 'downstream', 'peer', 'customer')),
        transport_mode TEXT NOT NULL CHECK (transport_mode IN ('ix', 'internal', 'tunnel')) DEFAULT 'internal',
        address_family TEXT NOT NULL CHECK (address_family IN ('ipv4', 'ipv6', 'dual')) DEFAULT 'dual',
        peer_asn INTEGER NOT NULL,
        peer_name TEXT,
        local_ipv4 TEXT,
        local_ipv6 TEXT,
        peer_ipv4 TEXT,
        peer_ipv6 TEXT,
        multihop INTEGER NOT NULL DEFAULT 0,
        password TEXT,
        import_filter TEXT,
        export_filter TEXT,
        description TEXT,
        source TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'established', 'idle', 'connect', 'active', 'opensent', 'openconfirm', 'error')),
        prefixes_received INTEGER NOT NULL DEFAULT 0,
        prefixes_sent INTEGER NOT NULL DEFAULT 0,
        last_state_change INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO bgp_sessions_v2 (
        id,
        server_id,
        peer_server_id,
        server_ixp_membership_id,
        tunnel_id,
        ix_id,
        ix_name,
        session_type,
        transport_mode,
        address_family,
        peer_asn,
        peer_name,
        local_ipv4,
        local_ipv6,
        peer_ipv4,
        peer_ipv6,
        multihop,
        password,
        import_filter,
        export_filter,
        description,
        source,
        status,
        prefixes_received,
        prefixes_sent,
        last_state_change,
        created_at,
        updated_at
      )
      SELECT
        id,
        server_id,
        peer_server_id,
        NULL,
        NULL,
        NULL,
        NULL,
        CASE WHEN session_type = 'ixp' THEN 'peer' ELSE session_type END,
        'internal',
        'dual',
        peer_asn,
        peer_name,
        NULL,
        NULL,
        peer_ipv4,
        peer_ipv6,
        multihop,
        password,
        import_filter,
        export_filter,
        NULL,
        NULL,
        status,
        prefixes_received,
        prefixes_sent,
        last_state_change,
        created_at,
        updated_at
      FROM bgp_sessions;

      DROP TABLE bgp_sessions;
      ALTER TABLE bgp_sessions_v2 RENAME TO bgp_sessions;
    `)
    sqlite.pragma('foreign_keys = ON')
  }

  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_bgp_sessions_server_id ON bgp_sessions(server_id);')

  const sessionColumns: Array<{ name: string; definition: string }> = [
    { name: 'is_initialized', definition: 'INTEGER NOT NULL DEFAULT 0' },
  ]

  for (const column of sessionColumns) {
    if (!hasColumn(sqlite, 'servers', column.name)) {
      sqlite.exec(`ALTER TABLE servers ADD COLUMN ${column.name} ${column.definition}`)
    }
  }

  const bgpSessionColumns: Array<{ name: string; definition: string }> = [
    { name: 'server_ixp_membership_id', definition: 'INTEGER REFERENCES server_ixps(id) ON DELETE SET NULL' },
    { name: 'tunnel_id', definition: 'INTEGER REFERENCES tunnels(id) ON DELETE SET NULL' },
    { name: 'ix_id', definition: 'INTEGER' },
    { name: 'ix_name', definition: 'TEXT' },
    { name: 'transport_mode', definition: "TEXT NOT NULL DEFAULT 'internal'" },
    { name: 'address_family', definition: "TEXT NOT NULL DEFAULT 'dual'" },
    { name: 'local_ipv4', definition: 'TEXT' },
    { name: 'local_ipv6', definition: 'TEXT' },
    { name: 'description', definition: 'TEXT' },
    { name: 'source', definition: 'TEXT' },
  ]

  for (const column of bgpSessionColumns) {
    if (!hasColumn(sqlite, 'bgp_sessions', column.name)) {
      sqlite.exec(`ALTER TABLE bgp_sessions ADD COLUMN ${column.name} ${column.definition}`)
    }
  }

  if (!hasColumn(sqlite, 'tunnels', 'bandwidth_mbps')) {
    sqlite.exec('ALTER TABLE tunnels ADD COLUMN bandwidth_mbps INTEGER')
  }
}

function ensureDatabase() {
  if (globalThis.__bgpPanelDb) {
    return globalThis.__bgpPanelDb
  }

  fs.mkdirSync(DB_DIRECTORY, { recursive: true })

  const sqlite = new Database(DB_PATH) as unknown as SqliteDatabase
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  createSchema(sqlite)
  migrateEmptyLegacySchema(sqlite)
  migrateCurrentSchema(sqlite)

  globalThis.__bgpPanelDb = sqlite
  return sqlite
}

function run(sql: string, params: unknown[] = []) {
  return ensureDatabase().prepare(sql).run(...params)
}

function get<T>(sql: string, params: unknown[] = []) {
  return ensureDatabase().prepare(sql).get<T>(...params) ?? null
}

function all<T>(sql: string, params: unknown[] = []) {
  return ensureDatabase().prepare(sql).all<T>(...params)
}

function mapServerRow(row: Server | null) {
  return row ? normalizeServer(row) : null
}

function mapServers(rows: Server[]) {
  return rows.map((row) => mapServerRow(row) as Server)
}

function mapSSHKeys(rows: SSHKey[]) {
  return rows
}

function mapTunnels(rows: Tunnel[]) {
  return rows.map(normalizeTunnel)
}

function mapBGPSessions(rows: BGPSession[]) {
  return rows.map(normalizeBGPSession)
}

function mapServerIxpMemberships(rows: ServerIXPMembership[]) {
  return rows.map(normalizeServerIxpMembership)
}

function mapAlerts(rows: Alert[]) {
  return rows.map(normalizeAlert)
}

function buildUpdateStatement(table: string, id: number, data: Record<string, unknown>) {
  const fields = Object.entries(data).filter(([, value]) => value !== undefined)
  if (fields.length === 0) {
    return false
  }

  const columns = fields.map(([key]) => `${key} = ?`).join(', ')
  const values = fields.map(([, value]) => value)
  const result = run(`UPDATE ${table} SET ${columns} WHERE id = ?`, [...values, id])
  return result.changes > 0
}

function toIntegerBoolean(value: boolean | undefined) {
  if (value === undefined) {
    return undefined
  }

  return value ? 1 : 0
}

export const db = {
  async getUsers(): Promise<User[]> {
    return all<User>('SELECT * FROM users ORDER BY created_at DESC').map(normalizeUser)
  },

  async getUser(id: number): Promise<User | null> {
    const row = get<User>('SELECT * FROM users WHERE id = ?', [id])
    return row ? normalizeUser(row) : null
  },

  async getUserByUsername(username: string): Promise<User | null> {
    const row = get<User>('SELECT * FROM users WHERE username = ?', [username])
    return row ? normalizeUser(row) : null
  },

  async createUser(data: Omit<User, 'id' | 'last_login_at' | 'created_at' | 'updated_at'>): Promise<number> {
    const timestamp = now()
    const result = run(
      'INSERT INTO users (username, display_name, password_hash, role, can_manage_users, created_by, last_login_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        data.username,
        data.display_name,
        data.password_hash,
        data.role,
        data.can_manage_users ? 1 : 0,
        data.created_by,
        null,
        timestamp,
        timestamp,
      ],
    )
    return Number(result.lastInsertRowid)
  },

  async updateUser(id: number, data: Partial<User>): Promise<boolean> {
    return buildUpdateStatement('users', id, {
      ...data,
      can_manage_users: data.can_manage_users === undefined ? undefined : toIntegerBoolean(data.can_manage_users),
      updated_at: now(),
    })
  },

  async deleteUser(id: number): Promise<boolean> {
    const result = run('DELETE FROM users WHERE id = ?', [id])
    return result.changes > 0
  },

  async getUserCount(): Promise<number> {
    const result = get<{ count: number }>('SELECT COUNT(*) as count FROM users')
    return result?.count || 0
  },

  async getServers(type?: Server['type']): Promise<Server[]> {
    const rows = type
      ? all<Server>('SELECT * FROM servers WHERE type = ? ORDER BY created_at DESC', [type])
      : all<Server>('SELECT * FROM servers ORDER BY created_at DESC')
    return mapServers(rows)
  },

  async getServer(id: number): Promise<Server | null> {
    return mapServerRow(get<Server>('SELECT * FROM servers WHERE id = ?', [id]))
  },

  async createServer(data: Omit<Server, 'id' | 'status' | 'last_seen_at' | 'created_at' | 'updated_at'>): Promise<number> {
    const timestamp = now()
    const result = run(
      `INSERT INTO servers (name, type, is_core, is_initialized, icao_code, node_id, hostname, latitude, longitude, city, country_code, region_code, local_asn, ipv4_address, ipv6_address, ipv6_prefix, router_id, ssh_host, ssh_port, ssh_user, ssh_key_id, status, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.type,
        data.is_core ? 1 : 0,
        data.is_initialized ? 1 : 0,
        data.icao_code,
        data.node_id,
        data.hostname,
        data.latitude,
        data.longitude,
        data.city,
        data.country_code,
        data.region_code,
        data.local_asn,
        data.ipv4_address,
        data.ipv6_address,
        data.ipv6_prefix,
        data.router_id,
        data.ssh_host,
        data.ssh_port,
        data.ssh_user,
        data.ssh_key_id,
        'pending',
        null,
        timestamp,
        timestamp,
      ],
    )
    return Number(result.lastInsertRowid)
  },

  async updateServer(id: number, data: Partial<Server>): Promise<boolean> {
    return buildUpdateStatement('servers', id, {
      ...data,
      is_core: data.is_core === undefined ? undefined : toIntegerBoolean(data.is_core),
      is_initialized: data.is_initialized === undefined ? undefined : toIntegerBoolean(data.is_initialized),
      updated_at: now(),
    })
  },

  async deleteServer(id: number): Promise<boolean> {
    const result = run('DELETE FROM servers WHERE id = ?', [id])
    return result.changes > 0
  },

  async getServerIxpMemberships(serverId: number): Promise<ServerIXPMembership[]> {
    return mapServerIxpMemberships(
      all<ServerIXPMembership>(
        'SELECT * FROM server_ixps WHERE server_id = ? ORDER BY ix_name ASC, created_at DESC',
        [serverId],
      ),
    )
  },

  async getServerIxpMembership(id: number): Promise<ServerIXPMembership | null> {
    const row = get<ServerIXPMembership>('SELECT * FROM server_ixps WHERE id = ?', [id])
    return row ? normalizeServerIxpMembership(row) : null
  },

  async createServerIxpMembership(
    data: Omit<ServerIXPMembership, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<number> {
    const timestamp = now()
    const result = run(
      `INSERT INTO server_ixps (
        server_id,
        ix_id,
        ix_name,
        ix_name_long,
        ix_country,
        ix_city,
        ix_region_continent,
        local_asn,
        local_ipaddr4,
        local_ipaddr6,
        speed,
        is_rs_peer,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.server_id,
        data.ix_id,
        data.ix_name,
        data.ix_name_long,
        data.ix_country,
        data.ix_city,
        data.ix_region_continent,
        data.local_asn,
        data.local_ipaddr4,
        data.local_ipaddr6,
        data.speed,
        data.is_rs_peer ? 1 : 0,
        data.notes,
        timestamp,
        timestamp,
      ],
    )

    return Number(result.lastInsertRowid)
  },

  async updateServerIxpMembership(id: number, data: Partial<ServerIXPMembership>): Promise<boolean> {
    return buildUpdateStatement('server_ixps', id, {
      ...data,
      is_rs_peer: data.is_rs_peer === undefined ? undefined : toIntegerBoolean(data.is_rs_peer),
      updated_at: now(),
    })
  },

  async deleteServerIxpMembership(id: number): Promise<boolean> {
    const result = run('DELETE FROM server_ixps WHERE id = ?', [id])
    return result.changes > 0
  },

  async getSSHKeys(): Promise<SSHKey[]> {
    return mapSSHKeys(all<SSHKey>('SELECT * FROM ssh_keys ORDER BY created_at DESC'))
  },

  async getSSHKey(id: number): Promise<SSHKey | null> {
    return get<SSHKey>('SELECT * FROM ssh_keys WHERE id = ?', [id])
  },

  async createSSHKey(data: Omit<SSHKey, 'id' | 'created_at'>): Promise<number> {
    const result = run(
      'INSERT INTO ssh_keys (name, private_key, public_key, created_at) VALUES (?, ?, ?, ?)',
      [data.name, data.private_key, data.public_key, now()],
    )
    return Number(result.lastInsertRowid)
  },

  async deleteSSHKey(id: number): Promise<boolean> {
    const result = run('DELETE FROM ssh_keys WHERE id = ?', [id])
    return result.changes > 0
  },

  async getTunnels(): Promise<Tunnel[]> {
    return mapTunnels(all<Tunnel>('SELECT * FROM tunnels ORDER BY created_at DESC'))
  },

  async getTunnelsWithServers(): Promise<TunnelWithServers[]> {
    const tunnels = await this.getTunnels()
    const servers = await this.getServers()
    const utilizationMap = await this.getTunnelUtilizationSnapshot()
    const serverMap = new Map(servers.map((server) => [server.id, server]))

    return tunnels
      .map((tunnel) => ({
        ...tunnel,
        server_a: serverMap.get(tunnel.server_a_id)!,
        server_b: serverMap.get(tunnel.server_b_id)!,
        throughput_mbps: utilizationMap.get(tunnel.id)?.throughput_mbps ?? null,
        utilization_percent: utilizationMap.get(tunnel.id)?.utilization_percent ?? null,
        utilization_status: utilizationMap.get(tunnel.id)?.utilization_status ?? 'idle',
      }))
      .filter((tunnel) => tunnel.server_a && tunnel.server_b)
  },

  async getTunnel(id: number): Promise<Tunnel | null> {
    const row = get<Tunnel>('SELECT * FROM tunnels WHERE id = ?', [id])
    return row ? normalizeTunnel(row) : null
  },

  async createTunnel(data: Omit<Tunnel, 'id' | 'status' | 'latency_ms' | 'last_check_at' | 'created_at' | 'updated_at'>): Promise<number> {
    const timestamp = now()
    const result = run(
      `INSERT INTO tunnels (name, server_a_id, server_b_id, tunnel_type, bandwidth_mbps, wg_mode, wg_port, wg_public_key_a, wg_public_key_b, tunnel_ipv4_a, tunnel_ipv4_b, tunnel_ipv6_a, tunnel_ipv6_b, ospf_enabled, ospf_mode, ospf_type, ospf_password, ospf_cost, status, latency_ms, last_check_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.server_a_id,
        data.server_b_id,
        data.tunnel_type,
        data.bandwidth_mbps,
        data.wg_mode,
        data.wg_port,
        data.wg_public_key_a,
        data.wg_public_key_b,
        data.tunnel_ipv4_a,
        data.tunnel_ipv4_b,
        data.tunnel_ipv6_a,
        data.tunnel_ipv6_b,
        data.ospf_enabled ? 1 : 0,
        data.ospf_mode,
        data.ospf_type,
        data.ospf_password,
        data.ospf_cost,
        'pending',
        null,
        null,
        timestamp,
        timestamp,
      ],
    )
    return Number(result.lastInsertRowid)
  },

  async updateTunnel(id: number, data: Partial<Tunnel>): Promise<boolean> {
    return buildUpdateStatement('tunnels', id, {
      ...data,
      ospf_enabled: data.ospf_enabled === undefined ? undefined : toIntegerBoolean(data.ospf_enabled),
      updated_at: now(),
    })
  },

  async deleteTunnel(id: number): Promise<boolean> {
    const result = run('DELETE FROM tunnels WHERE id = ?', [id])
    return result.changes > 0
  },

  async getTunnelWireGuardSecrets(tunnelId: number): Promise<{ wg_private_key_a: string | null; wg_private_key_b: string | null } | null> {
    return get<{ wg_private_key_a: string | null; wg_private_key_b: string | null }>(
      'SELECT wg_private_key_a, wg_private_key_b FROM tunnel_secrets WHERE tunnel_id = ?',
      [tunnelId],
    )
  },

  async setTunnelWireGuardSecrets(
    tunnelId: number,
    data: { wg_private_key_a?: string | null; wg_private_key_b?: string | null },
  ): Promise<void> {
    run(
      `INSERT INTO tunnel_secrets (tunnel_id, wg_private_key_a, wg_private_key_b, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tunnel_id) DO UPDATE SET
         wg_private_key_a = COALESCE(excluded.wg_private_key_a, tunnel_secrets.wg_private_key_a),
         wg_private_key_b = COALESCE(excluded.wg_private_key_b, tunnel_secrets.wg_private_key_b),
         updated_at = excluded.updated_at`,
      [tunnelId, data.wg_private_key_a ?? null, data.wg_private_key_b ?? null, now()],
    )
  },

  async getTunnelUtilizationSnapshot(windowMinutes = 5): Promise<Map<number, { throughput_mbps: number; utilization_percent: number | null; utilization_status: 'idle' | 'normal' | 'high' | 'saturated' }>> {
    const since = now() - windowMinutes * 60
    const rows = all<{
      tunnel_id: number
      bytes_total: number
      samples: number
      bandwidth_mbps: number | null
    }>(
      `SELECT
         tunnels.id AS tunnel_id,
         COALESCE(SUM(traffic_stats.bytes_in + traffic_stats.bytes_out), 0) AS bytes_total,
         COUNT(traffic_stats.id) AS samples,
         tunnels.bandwidth_mbps AS bandwidth_mbps
       FROM tunnels
       LEFT JOIN traffic_stats
         ON traffic_stats.tunnel_id = tunnels.id
        AND traffic_stats.timestamp >= ?
       GROUP BY tunnels.id`,
      [since],
    )

    const map = new Map<number, { throughput_mbps: number; utilization_percent: number | null; utilization_status: 'idle' | 'normal' | 'high' | 'saturated' }>()
    const seconds = Math.max(windowMinutes * 60, 1)

    for (const row of rows) {
      const throughput = Number((((row.bytes_total || 0) * 8) / 1_000_000 / seconds).toFixed(2))
      const utilizationPercent = row.bandwidth_mbps && row.bandwidth_mbps > 0
        ? Number(((throughput / row.bandwidth_mbps) * 100).toFixed(2))
        : null

      let utilizationStatus: 'idle' | 'normal' | 'high' | 'saturated' = 'idle'
      if (utilizationPercent !== null) {
        if (utilizationPercent >= 90) {
          utilizationStatus = 'saturated'
        } else if (utilizationPercent >= 70) {
          utilizationStatus = 'high'
        } else if (utilizationPercent > 0) {
          utilizationStatus = 'normal'
        }
      } else if (throughput > 0) {
        utilizationStatus = 'normal'
      }

      map.set(row.tunnel_id, {
        throughput_mbps: throughput,
        utilization_percent: utilizationPercent,
        utilization_status: utilizationStatus,
      })
    }

    return map
  },

  async getBGPSessions(serverId?: number): Promise<BGPSession[]> {
    const rows = serverId
      ? all<BGPSession>('SELECT * FROM bgp_sessions WHERE server_id = ? ORDER BY created_at DESC', [serverId])
      : all<BGPSession>('SELECT * FROM bgp_sessions ORDER BY created_at DESC')

    return mapBGPSessions(rows)
  },

  async getBGPSession(id: number): Promise<BGPSession | null> {
    const row = get<BGPSession>('SELECT * FROM bgp_sessions WHERE id = ?', [id])
    return row ? normalizeBGPSession(row) : null
  },

  async getBGPSessionsWithRelations(serverId?: number): Promise<BGPSessionWithRelations[]> {
    const sessions = await this.getBGPSessions(serverId)
    const servers = await this.getServers()
    const tunnels = await this.getTunnels()
    const serverMap = new Map(servers.map((server) => [server.id, server]))
    const tunnelMap = new Map(tunnels.map((tunnel) => [tunnel.id, tunnel]))

    return sessions
      .map((session) => ({
        ...session,
        server: serverMap.get(session.server_id)!,
        peer_server: session.peer_server_id ? serverMap.get(session.peer_server_id) || null : null,
        tunnel: session.tunnel_id ? tunnelMap.get(session.tunnel_id) || null : null,
      }))
      .filter((session) => session.server)
  },

  async createBGPSession(data: Omit<BGPSession, 'id' | 'status' | 'prefixes_received' | 'prefixes_sent' | 'last_state_change' | 'created_at' | 'updated_at'>): Promise<number> {
    const timestamp = now()
    const result = run(
      `INSERT INTO bgp_sessions (
        server_id,
        peer_server_id,
        server_ixp_membership_id,
        tunnel_id,
        ix_id,
        ix_name,
        session_type,
        transport_mode,
        address_family,
        peer_asn,
        peer_name,
        local_ipv4,
        local_ipv6,
        peer_ipv4,
        peer_ipv6,
        multihop,
        password,
        import_filter,
        export_filter,
        description,
        source,
        status,
        prefixes_received,
        prefixes_sent,
        last_state_change,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.server_id,
        data.peer_server_id,
        data.server_ixp_membership_id,
        data.tunnel_id,
        data.ix_id,
        data.ix_name,
        data.session_type,
        data.transport_mode,
        data.address_family,
        data.peer_asn,
        data.peer_name,
        data.local_ipv4,
        data.local_ipv6,
        data.peer_ipv4,
        data.peer_ipv6,
        data.multihop,
        data.password,
        data.import_filter,
        data.export_filter,
        data.description,
        data.source,
        'pending',
        0,
        0,
        null,
        timestamp,
        timestamp,
      ],
    )
    return Number(result.lastInsertRowid)
  },

  async deleteBGPSession(id: number): Promise<boolean> {
    const result = run('DELETE FROM bgp_sessions WHERE id = ?', [id])
    return result.changes > 0
  },

  async getAlerts(limit = 50, unresolvedOnly = false): Promise<Alert[]> {
    const rows = unresolvedOnly
      ? all<Alert>('SELECT * FROM alerts WHERE resolved = 0 ORDER BY created_at DESC LIMIT ?', [limit])
      : all<Alert>('SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?', [limit])
    return mapAlerts(rows)
  },

  async getAlert(id: number): Promise<Alert | null> {
    const row = get<Alert>('SELECT * FROM alerts WHERE id = ?', [id])
    return row ? normalizeAlert(row) : null
  },

  async createAlert(data: Omit<Alert, 'id' | 'resolved' | 'resolved_at' | 'created_at'>): Promise<number> {
    const result = run(
      'INSERT INTO alerts (server_id, tunnel_id, session_id, severity, type, message, resolved, resolved_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.server_id, data.tunnel_id, data.session_id, data.severity, data.type, data.message, 0, null, now()],
    )
    return Number(result.lastInsertRowid)
  },

  async getSettings(): Promise<Setting[]> {
    return all<Setting>('SELECT * FROM settings ORDER BY key ASC')
  },

  async getSetting(key: string): Promise<string | null> {
    const row = get<Setting>('SELECT * FROM settings WHERE key = ?', [key])
    return row?.value || null
  },

  async setSetting(key: string, value: string): Promise<void> {
    run(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, value, now()],
    )
  },

  async getServerCount(): Promise<number> {
    const result = get<{ count: number }>('SELECT COUNT(*) as count FROM servers')
    return result?.count || 0
  },

  async getTunnelCount(): Promise<number> {
    const result = get<{ count: number }>('SELECT COUNT(*) as count FROM tunnels')
    return result?.count || 0
  },

  async createTrafficStat(data: Omit<TrafficStats, 'id'>): Promise<number> {
    const result = run(
      'INSERT INTO traffic_stats (server_id, tunnel_id, timestamp, bytes_in, bytes_out, packets_in, packets_out) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.server_id, data.tunnel_id, data.timestamp, data.bytes_in, data.bytes_out, data.packets_in, data.packets_out],
    )
    return Number(result.lastInsertRowid)
  },

  async getTrafficSeries(hours = 24): Promise<Array<{ time: string; inbound: number; outbound: number }>> {
    const since = now() - hours * 3600
    const rows = all<{ timestamp: number; bytes_in: number; bytes_out: number }>(
      'SELECT timestamp, bytes_in, bytes_out FROM traffic_stats WHERE timestamp >= ? ORDER BY timestamp ASC',
      [since],
    )

    const buckets = new Map<string, { inbound: number; outbound: number }>()
    for (const row of rows) {
      const date = new Date(row.timestamp * 1000)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`
      const current = buckets.get(key) || { inbound: 0, outbound: 0 }
      current.inbound += row.bytes_in
      current.outbound += row.bytes_out
      buckets.set(key, current)
    }

    const result: Array<{ time: string; inbound: number; outbound: number }> = []
    const start = new Date(Date.now() - (hours - 1) * 3600 * 1000)
    start.setMinutes(0, 0, 0)

    for (let index = 0; index < hours; index += 1) {
      const bucketDate = new Date(start.getTime() + index * 3600 * 1000)
      const key = `${bucketDate.getFullYear()}-${bucketDate.getMonth()}-${bucketDate.getDate()}-${bucketDate.getHours()}`
      const bucket = buckets.get(key) || { inbound: 0, outbound: 0 }
      result.push({
        time: bucketDate.getHours().toString().padStart(2, '0') + ':00',
        inbound: Number((bucket.inbound / 1024 / 1024 / 1024).toFixed(2)),
        outbound: Number((bucket.outbound / 1024 / 1024 / 1024).toFixed(2)),
      })
    }

    return result
  },

  async getTopRoutes(limit = 5): Promise<Array<{ tunnel_id: number; name: string; traffic_gb: number; status: Tunnel['status'] }>> {
    const rows = all<{
      tunnel_id: number
      name: string
      traffic_gb: number
      status: Tunnel['status']
    }>(
      `SELECT
         tunnels.id as tunnel_id,
         COALESCE(tunnels.name, server_a.icao_code || ' - ' || server_b.icao_code) as name,
         ROUND(COALESCE(SUM(traffic_stats.bytes_in + traffic_stats.bytes_out), 0) / 1024.0 / 1024.0 / 1024.0, 2) as traffic_gb,
         tunnels.status as status
       FROM tunnels
       LEFT JOIN traffic_stats ON traffic_stats.tunnel_id = tunnels.id
       LEFT JOIN servers AS server_a ON server_a.id = tunnels.server_a_id
       LEFT JOIN servers AS server_b ON server_b.id = tunnels.server_b_id
       GROUP BY tunnels.id
       HAVING traffic_gb > 0
       ORDER BY traffic_gb DESC, tunnels.created_at DESC
       LIMIT ?`,
      [limit],
    )

    return rows
  },

  async getDatabasePath(): Promise<string> {
    ensureDatabase()
    return DB_PATH
  },
}
