// Server/Node Types
export type ServerType = 'rr' | 'node'
export type ServerStatus = 'pending' | 'initializing' | 'online' | 'offline' | 'error'

// Auth Types
export type UserRole = 'admin' | 'member'

export interface User {
  id: number
  username: string
  display_name: string | null
  password_hash: string
  role: UserRole
  can_manage_users: boolean
  created_by: number | null
  last_login_at: number | null
  created_at: number
  updated_at: number
}

export type SafeUser = Omit<User, 'password_hash'>

export interface Server {
  id: number
  name: string
  type: ServerType
  is_core: boolean
  is_initialized: boolean
  icao_code: string
  node_id: number
  hostname: string | null
  
  // Geographic
  latitude: number
  longitude: number
  city: string | null
  country_code: string
  region_code: string
  
  // Network config
  local_asn: number
  ipv4_address: string | null
  ipv6_address: string
  ipv6_prefix: string | null
  router_id: string | null
  
  // SSH connection
  ssh_host: string
  ssh_port: number
  ssh_user: string
  ssh_key_id: number | null
  
  // Status
  status: ServerStatus
  last_seen_at: number | null
  created_at: number
  updated_at: number
}

export interface ServerFormData {
  name: string
  type: ServerType
  is_core: boolean
  icao_code: string
  node_id?: number
  latitude: number
  longitude: number
  city?: string
  country_code: string
  region_code: string
  ssh_host: string
  ssh_port: number
  ssh_user: string
  ssh_key_id?: number | null
}

export interface ServerIXPMembership {
  id: number
  server_id: number
  ix_id: number
  ix_name: string
  ix_name_long: string | null
  ix_country: string | null
  ix_city: string | null
  ix_region_continent: string | null
  local_asn: number
  local_ipaddr4: string | null
  local_ipaddr6: string | null
  speed: number | null
  is_rs_peer: boolean
  notes: string | null
  created_at: number
  updated_at: number
}

export interface PeeringDBIXP {
  id: number
  name: string
  name_long: string | null
  country: string | null
  city: string | null
  region_continent: string | null
  proto_unicast?: boolean
  proto_ipv6?: boolean
  website?: string | null
}

export interface PeeringDBIXPPeer {
  id: number
  net_id: number | null
  ix_id: number
  asn: number
  name: string
  peer_name: string
  peer_name_long: string | null
  peer_aka: string | null
  ipaddr4: string | null
  ipaddr6: string | null
  speed: number | null
  is_rs_peer: boolean
  operational: boolean
}

// SSH Keys
export interface SSHKey {
  id: number
  name: string
  private_key: string
  public_key: string | null
  created_at: number
}

// Tunnel Types
export type TunnelType = 'wireguard' | 'vxlan' | 'gre' | 'direct'
export type WireGuardMode = 'both' | 'a_only' | 'b_only'
export type OSPFMode = 'v4' | 'v6' | 'dual'
export type OSPFType = 'ptp' | 'broadcast'
export type TunnelStatus = 'pending' | 'configuring' | 'up' | 'down' | 'error'

export interface Tunnel {
  id: number
  name: string | null
  server_a_id: number
  server_b_id: number
  
  tunnel_type: TunnelType
  bandwidth_mbps: number | null
  
  // WireGuard config
  wg_mode: WireGuardMode | null
  wg_port: number
  wg_public_key_a: string | null
  wg_public_key_b: string | null
  
  // Tunnel IPs
  tunnel_ipv4_a: string | null
  tunnel_ipv4_b: string | null
  tunnel_ipv6_a: string | null
  tunnel_ipv6_b: string | null
  
  // OSPF config
  ospf_enabled: boolean
  ospf_mode: OSPFMode | null
  ospf_type: OSPFType | null
  ospf_password: string | null
  ospf_cost: number
  
  // Monitoring
  status: TunnelStatus
  latency_ms: number | null
  last_check_at: number | null
  
  created_at: number
  updated_at: number
}

export interface TunnelWithServers extends Tunnel {
  server_a: Server
  server_b: Server
  throughput_mbps?: number | null
  utilization_percent?: number | null
  utilization_status?: 'idle' | 'normal' | 'high' | 'saturated'
}

export interface ServerReachabilityResult {
  source_server_id: number
  target_server_id: number
  target_name: string
  target_address: string
  success: boolean
  exit_code: number | null
  packet_loss: number | null
  avg_latency_ms: number | null
  output: string
  tested_at: number
}

// BGP Session Types
export type SessionType = 'ibgp' | 'rr' | 'upstream' | 'downstream' | 'peer' | 'customer'
export type SessionStatus = 'pending' | 'established' | 'idle' | 'connect' | 'active' | 'opensent' | 'openconfirm' | 'error'
export type SessionTransportMode = 'ix' | 'internal' | 'tunnel'
export type SessionAddressFamily = 'ipv4' | 'ipv6' | 'dual'

export interface BGPSession {
  id: number
  server_id: number
  peer_server_id: number | null
  server_ixp_membership_id: number | null
  tunnel_id: number | null
  ix_id: number | null
  ix_name: string | null
  
  session_type: SessionType
  transport_mode: SessionTransportMode
  address_family: SessionAddressFamily
  
  peer_asn: number
  peer_name: string | null
  local_ipv4: string | null
  local_ipv6: string | null
  peer_ipv4: string | null
  peer_ipv6: string | null
  
  multihop: number
  password: string | null
  import_filter: string | null
  export_filter: string | null
  description: string | null
  source: string | null
  
  status: SessionStatus
  prefixes_received: number
  prefixes_sent: number
  last_state_change: number | null
  
  created_at: number
  updated_at: number
}

export interface BGPSessionWithRelations extends BGPSession {
  server: Server
  peer_server: Server | null
  tunnel: Tunnel | null
}

// Traffic Statistics
export interface TrafficStats {
  id: number
  server_id: number
  tunnel_id: number | null
  
  timestamp: number
  bytes_in: number
  bytes_out: number
  packets_in: number
  packets_out: number
}

// Alerts
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface Alert {
  id: number
  server_id: number | null
  tunnel_id: number | null
  session_id: number | null
  
  severity: AlertSeverity
  type: string
  message: string
  resolved: boolean
  resolved_at: number | null
  
  created_at: number
}

// Settings
export interface Setting {
  key: string
  value: string
  updated_at: number
}

export interface SystemSettings {
  local_asn: string
  backbone_v4_prefix: string
  backbone_v6_prefix: string
  dns_zone: string
  cloudflare_zone_id: string
  git_repo_node: string
  git_branch_node: string
  git_branch_rr: string
  notify_telegram_enabled: string
  notify_telegram_bot_token: string
  notify_telegram_chat_id: string
  notify_email_enabled: string
  notify_email_smtp_host: string
  notify_email_smtp_port: string
  notify_email_smtp_secure: string
  notify_email_smtp_user: string
  notify_email_smtp_pass: string
  notify_email_from: string
  notify_email_to: string
  notify_bark_enabled: string
  notify_bark_url: string
  notify_feishu_enabled: string
  notify_feishu_webhook_url: string
}

// Region and Country codes mapping
export interface RegionCode {
  code: string
  name: string
  description: string
}

export const REGION_CODES: RegionCode[] = [
  { code: '41', name: 'R_EU', description: 'Europe' },
  { code: '42', name: 'R_NA_E', description: 'North America East' },
  { code: '43', name: 'R_NA_C', description: 'North America Central' },
  { code: '44', name: 'R_NA_W', description: 'North America West' },
  { code: '45', name: 'R_CA', description: 'Central America' },
  { code: '46', name: 'R_SA-E', description: 'South America East' },
  { code: '47', name: 'R_SA-W', description: 'South America West' },
  { code: '48', name: 'R_AFR_N', description: 'North Africa (north of the Sahara)' },
  { code: '49', name: 'R_AFR_S', description: 'Sub-Saharan Africa' },
  { code: '50', name: 'R_ASIA_S', description: 'South Asia (India, Pakistan, Bangladesh)' },
  { code: '51', name: 'R_ASIA_SE', description: 'Southeast Asia (Thailand, Singapore, Philippines, Indonesia, Malaysia)' },
  { code: '52', name: 'R_AS_E', description: 'East Asia (Japan, Korea, China)' },
  { code: '53', name: 'R_PO', description: 'Oceania (Australia, New Zealand, Fiji)' },
  { code: '55', name: 'R_ASIA_N', description: 'North Asia (Russia)' },
  { code: '56', name: 'R_ASIA_W', description: 'West Asia (Iran, Turkey, UAE)' },
  { code: '57', name: 'R_ASIA_C', description: 'Central Asia (Afghanistan, Uzbekistan, Kazakhstan)' },
];

// Globe visualization types
export interface GlobePoint {
  id: number
  name: string
  lat: number
  lng: number
  type: ServerType
  is_core: boolean
  status: ServerStatus
  city?: string
}

export interface AirportOption {
  country_code: string
  region_name: string
  iata: string
  icao: string
  airport: string
  latitude: number
  longitude: number
}

export interface GlobeArc {
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  status: TunnelStatus
  latency?: number
  type: TunnelType
}

// Topology canvas types
export interface TopologyNode {
  id: number
  x: number
  y: number
  server: Server
}

export interface TopologyConnection {
  id: number
  sourceId: number
  targetId: number
  tunnel: Tunnel
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// BIRD config generation
export interface BirdVarsConfig {
  local_asn: number
  local_v6_kernel: string
  local_v4_kernel?: string
  bb_v4_prefix?: string
  bb_v4?: string
  bb_v4_prefix_check?: string
  bb_ospf_v4?: string
  bb_v6: string
  bb_ospf_v6: string
  bb_v6_prefix: string
  bb_v6_prefix_check: string
  my_community: number
  my_region: string
  my_country: string
  my_node: number
  router_id: string
}

// SSH execution types
export interface SSHCommand {
  command: string
  timeout?: number
}

export interface SSHResult {
  success: boolean
  stdout?: string
  stderr?: string
  error?: string
}

export type InitTaskStatus = 'idle' | 'running' | 'success' | 'error'
export type InitTaskMode = 'auto' | 'manual'
export type InitLogLevel = 'system' | 'command' | 'stdout' | 'stderr' | 'error'

export interface ServerInitializationLogEntry {
  id: string
  timestamp: number
  level: InitLogLevel
  message: string
}

export interface ServerInitializationTask {
  server_id: number
  status: InitTaskStatus
  mode: InitTaskMode
  started_at: number | null
  finished_at: number | null
  allow_manual: boolean
  message: string | null
  error: string | null
  logs: ServerInitializationLogEntry[]
}

export interface ServerConsoleCommandResult {
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  executed_at: number
}

export interface ServerConsoleState {
  server_id: number
  connected: boolean
  running: boolean
  current_command: string | null
  updated_at: number | null
  logs: ServerInitializationLogEntry[]
}

// Cloudflare DNS types
export interface DNSRecord {
  id?: string
  type: 'A' | 'AAAA' | 'CNAME'
  name: string
  content: string
  ttl?: number
  proxied?: boolean
}
