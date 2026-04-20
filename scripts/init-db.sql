-- BIRD BGP Panel Database Schema
-- Compatible with both SQLite and Cloudflare D1

-- 1. SSH Keys table
CREATE TABLE IF NOT EXISTS ssh_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  private_key TEXT NOT NULL,
  public_key TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- 2. Servers/Nodes table
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('rr', 'node')),
  is_core INTEGER NOT NULL DEFAULT 0,
  icao_code TEXT NOT NULL,
  node_id INTEGER NOT NULL,
  hostname TEXT,
  
  -- Geographic location
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  city TEXT,
  country_code TEXT NOT NULL,
  region_code TEXT NOT NULL,
  
  -- Network configuration
  local_asn INTEGER DEFAULT 151673,
  ipv4_address TEXT,
  ipv6_address TEXT NOT NULL,
  ipv6_prefix TEXT,
  router_id TEXT,
  
  -- SSH connection
  ssh_host TEXT NOT NULL,
  ssh_port INTEGER DEFAULT 22,
  ssh_user TEXT DEFAULT 'root',
  ssh_key_id INTEGER REFERENCES ssh_keys(id),
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'initializing', 'online', 'offline', 'error')),
  last_seen_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- 3. Tunnels/Connections table
CREATE TABLE IF NOT EXISTS tunnels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  server_a_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  server_b_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  
  -- Tunnel type
  tunnel_type TEXT NOT NULL CHECK(tunnel_type IN ('wireguard', 'vxlan', 'gre', 'direct')),
  
  -- WireGuard configuration
  wg_mode TEXT CHECK(wg_mode IN ('both', 'a_only', 'b_only')),
  wg_port INTEGER DEFAULT 51820,
  wg_public_key_a TEXT,
  wg_public_key_b TEXT,
  
  -- Tunnel IPs
  tunnel_ipv4_a TEXT,
  tunnel_ipv4_b TEXT,
  tunnel_ipv6_a TEXT,
  tunnel_ipv6_b TEXT,
  
  -- OSPF configuration
  ospf_enabled INTEGER DEFAULT 1,
  ospf_mode TEXT CHECK(ospf_mode IN ('v4', 'v6', 'dual')),
  ospf_type TEXT CHECK(ospf_type IN ('ptp', 'broadcast')),
  ospf_password TEXT,
  ospf_cost INTEGER DEFAULT 10,
  
  -- Status monitoring
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'configuring', 'up', 'down', 'error')),
  latency_ms INTEGER,
  last_check_at INTEGER,
  
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  
  UNIQUE(server_a_id, server_b_id)
);

-- 4. BGP Sessions table
CREATE TABLE IF NOT EXISTS bgp_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  peer_server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
  
  session_type TEXT NOT NULL CHECK(session_type IN ('rr', 'upstream', 'downstream', 'peer', 'ixp', 'customer')),
  
  -- Peer information
  peer_asn INTEGER NOT NULL,
  peer_name TEXT,
  peer_ipv4 TEXT,
  peer_ipv6 TEXT,
  
  -- Configuration
  multihop INTEGER DEFAULT 0,
  password TEXT,
  import_filter TEXT,
  export_filter TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'established', 'idle', 'connect', 'active', 'opensent', 'openconfirm', 'error')),
  prefixes_received INTEGER DEFAULT 0,
  prefixes_sent INTEGER DEFAULT 0,
  last_state_change INTEGER,
  
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- 5. Traffic Statistics table
CREATE TABLE IF NOT EXISTS traffic_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  tunnel_id INTEGER REFERENCES tunnels(id) ON DELETE CASCADE,
  
  timestamp INTEGER NOT NULL,
  bytes_in INTEGER DEFAULT 0,
  bytes_out INTEGER DEFAULT 0,
  packets_in INTEGER DEFAULT 0,
  packets_out INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_traffic_stats_server_time ON traffic_stats(server_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_traffic_stats_tunnel_time ON traffic_stats(tunnel_id, timestamp);

-- 6. Alerts/Events table
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
  tunnel_id INTEGER REFERENCES tunnels(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES bgp_sessions(id) ON DELETE CASCADE,
  
  severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'error', 'critical')),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  resolved_at INTEGER,
  
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON alerts(resolved, created_at DESC);

-- 7. System Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('local_asn', '151673'),
  ('backbone_v4_prefix', ''),
  ('backbone_v6_prefix', '2a14:7581:3810::/44'),
  ('dns_zone', 'net.xxx.xxx'),
  ('cloudflare_zone_id', ''),
  ('git_repo_node', 'https://github.com/AS151673/Xinyu-Network-Config'),
  ('git_branch_node', 'node'),
  ('git_branch_rr', 'rr');

-- Additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_servers_type ON servers(type);
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_tunnels_status ON tunnels(status);
CREATE INDEX IF NOT EXISTS idx_bgp_sessions_server ON bgp_sessions(server_id);
CREATE INDEX IF NOT EXISTS idx_bgp_sessions_status ON bgp_sessions(status);
