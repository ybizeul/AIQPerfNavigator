import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { DateTimePicker } from '@mantine/dates'
import '@mantine/dates/styles.css'
import {
  ActionIcon,
  Alert,
  Anchor,
  AppShell,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Divider,
  Group,
  Indicator,
  Loader,
  Menu,
  Modal,
  MultiSelect,
  NavLink,
  Pagination,
  Paper,
  PasswordInput,
  Pill,
  Popover,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Table,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { AreaChart } from '@mantine/charts'
import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import {
  IconBookmark,
  IconBuilding,
  IconChartLine,
  IconCheck,
  IconCloud,
  IconDatabase,
  IconDeviceDesktop,
  IconDownload,
  IconFilter,
  IconFilterFilled,
  IconKey,
  IconLock,
  IconMoon,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSun,
  IconTag,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react'

const API_URL = 'https://gql.aiq.netapp.com/graphql'
const TOKEN_REFRESH_URL = 'https://api.activeiq.netapp.com/v1/tokens/accessToken'
const PERFORMANCE_API_URL = 'https://api.activeiq.netapp.com/v1/performance-data/graphs'
const WATCHLIST_API_URL = 'https://api.activeiq.netapp.com/v2/watchlist/list'
const WATCHLIST_ACTION_API_URL = 'https://api.activeiq.netapp.com/v2/watchlist/action'
const PAGE_SIZE = 100
const BROWSER_DATA_FILENAME = 'aiqperfnav.aiq'
const BROWSER_DATA_FORMAT = 'aiq-perf-navigator-browser-data'
const BROWSER_DATA_PREFIX = 'aiq-system-organizer-'
const COLOR_SCHEME_STORAGE_KEY = 'mantine-color-scheme-value'
const COLOR_SCHEME_LABELS = { auto: 'system', light: 'light', dark: 'dark' } as const
const NEXT_COLOR_SCHEME = { auto: 'light', light: 'dark', dark: 'auto' } as const

type BrowserDataExport = {
  format: typeof BROWSER_DATA_FORMAT
  version: 1
  exportedAt: string
  data: Record<string, string>
}

function isBrowserDataKey(key: string) {
  return key.startsWith(BROWSER_DATA_PREFIX) || key === COLOR_SCHEME_STORAGE_KEY
}

function isBrowserDataExport(value: unknown): value is BrowserDataExport {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<BrowserDataExport>
  return (
    candidate.format === BROWSER_DATA_FORMAT &&
    candidate.version === 1 &&
    typeof candidate.exportedAt === 'string' &&
    !!candidate.data &&
    typeof candidate.data === 'object' &&
    Object.entries(candidate.data).every(
      ([key, storedValue]) => isBrowserDataKey(key) && typeof storedValue === 'string',
    )
  )
}

const TAB_VALUES = ['search', 'saved', 'performance', 'capacity', 'customers'] as const
type TabValue = (typeof TAB_VALUES)[number]
const DEFAULT_TAB: TabValue = 'search'

function isTabValue(value: string | null): value is TabValue {
  return TAB_VALUES.includes(value as TabValue)
}

function getTabFromLocation(): TabValue {
  const pathTab = window.location.pathname.split('/').filter(Boolean)[0] ?? null
  return isTabValue(pathTab) ? pathTab : DEFAULT_TAB
}

const SYSTEMS_FIELDS = `
        __typename
        systemId
        serialNumber
        hostName
        platformType
        customerGroup
        hardwareModel {
          name
        }
        nagp {
          id
          name
        }
        customer {
          id
          name
        }
        site {
          id
          name
          cmatId
        }
        ... on ONTAPSystem {
          isMetroCluster
          cluster {
            id
            name
          }
          partner {
            serialNumber
            systemId
            hostName
            ... on ONTAPSystem {
              isMetroCluster
              capacity {
                physical {
                  rawMarketingKiB
                  usedKiB
                  usablePerformanceTierKiB
                  usedPerformanceTierKiB
                }
              }
            }
          }
          capacity {
            physical {
              rawMarketingKiB
              usedKiB
              usablePerformanceTierKiB
              usedPerformanceTierKiB
            }
          }
          monthlyCapacity {
            month
            physical {
              usablePerformanceTierKiB
              usedPerformanceTierKiB
            }
          }
        }
        ... on CloudVolumeONTAP {
          cluster {
            id
            name
          }
          capacity {
            physical {
              rawMarketingKiB
              usedKiB
              usablePerformanceTierKiB
              usedPerformanceTierKiB
            }
          }
        }
`

const QUERY_BY_CLUSTER = `
  query SearchByCluster($pageSize: Int!, $clusterName: String, $nagpId: String, $watchlistId: String, $customerId: String, $after: String) {
    systems(pageSize: $pageSize, clusterName: $clusterName, nagpId: $nagpId, watchlistId: $watchlistId, customerId: $customerId, after: $after) {
      totalCount
      cursor
      systems {${SYSTEMS_FIELDS}    }
    }
  }
`

const QUERY_BY_HOSTNAME = `
  query SearchByHostName($pageSize: Int!, $hostName: String, $nagpId: String, $watchlistId: String, $customerId: String, $after: String) {
    systems(pageSize: $pageSize, hostName: $hostName, nagpId: $nagpId, watchlistId: $watchlistId, customerId: $customerId, after: $after, caseInsensitiveFields: [hostName]) {
      totalCount
      cursor
      systems {${SYSTEMS_FIELDS}    }
    }
  }
`

const QUERY_BY_SYSTEM_KEY = `
  query SearchBySystemKey($pageSize: Int!, $systemKey: [SystemKey!], $nagpId: String, $watchlistId: String, $customerId: String, $after: String) {
    systems(pageSize: $pageSize, systemKey: $systemKey, nagpId: $nagpId, watchlistId: $watchlistId, customerId: $customerId, after: $after) {
      totalCount
      cursor
      systems {${SYSTEMS_FIELDS}    }
    }
  }
`

const QUERY_BY_NAGP = `
  query SearchByFilters($pageSize: Int!, $nagpId: String, $watchlistId: String, $customerId: String, $after: String) {
    systems(pageSize: $pageSize, nagpId: $nagpId, watchlistId: $watchlistId, customerId: $customerId, after: $after) {
      totalCount
      cursor
      systems {${SYSTEMS_FIELDS}    }
    }
  }
`

const CLUSTER_QUERY = `
  query GetSystemCluster($serialNumber: String!) {
    systems(
      pageSize: 1
      searchFilters: [{
        fieldName: SERIAL_NUMBER
        pattern: EXACT
        searchString: $serialNumber
      }]
    ) {
      systems {
        ... on ONTAPSystemInterface {
          cluster {
            id
            name
          }
        }
      }
    }
  }
`

type SearchForm = {
  customer: string
  watchlist: string
  query: string
}

type SearchQueryType = 'cluster' | 'serialNumber' | 'systemId' | 'hostName'

type Watchlist = {
  id: string
  name: string
  isDefault: boolean
}

type WatchlistListResponse = {
  results?: {
    default_watchlist_id?: string
    watchlist?: Array<{
      watchlist_id?: string
      watchlist_name?: string
    }>
  }
}

type WatchlistActionResponse = {
  results?: {
    customer_details?: Array<{
      customer_id?: string
      customer_name?: string
    }>
  }
}

type SearchScope = {
  nagpId: string
  watchlistId: string
  customerId: string
}

const EMPTY_SEARCH_SCOPE: SearchScope = {
  nagpId: '',
  watchlistId: '',
  customerId: '',
}

type GraphQlError = {
  message: string
}

type GraphQlResponse<TData> = {
  data?: TData
  errors?: GraphQlError[]
}

type SystemSummary = {
  __typename: string
  systemId: string | null
  serialNumber: string
  hostName: string | null
  platformType: string | null
  customerGroup: string | null
  isMetroCluster?: boolean | null
  hardwareModel: {
    name: string | null
  } | null
  nagp: {
    id: string | null
    name: string | null
  } | null
  cluster: {
    id: string | null
    name: string | null
  } | null
  partner: {
    serialNumber: string
    systemId: string | null
    hostName: string | null
    capacity?: {
      physical: {
        rawMarketingKiB: number | null
        usedKiB: number | null
        usablePerformanceTierKiB: number | null
        usedPerformanceTierKiB: number | null
      } | null
    } | null
  } | null
  customer: {
    id: string | null
    name: string | null
    cmatId: string | null
  } | null
  site: {
    id: string | null
    name: string | null
    cmatId: string | null
  } | null
  capacity?: {
    physical: {
      rawMarketingKiB: number | null
      usedKiB: number | null
      usablePerformanceTierKiB: number | null
      usedPerformanceTierKiB: number | null
    } | null
  } | null
  monthlyCapacity?: {
    month: string | null
    physical: {
      usablePerformanceTierKiB: number | null
      usedPerformanceTierKiB: number | null
    } | null
  }[] | null
}

type HAPair = {
  key: string
  node1: SystemSummary
  node2: SystemSummary | null
}

type SavedHAPair = {
  key: string
  node1: SystemSummary
  node2: SystemSummary | null
  savedAt: string
  tags: string[]
}

type SystemsQueryData = {
  systems: {
    totalCount: number
    cursor: string
    systems: SystemSummary[]
  } | null
}

type SearchResultState = {
  pairs: HAPair[]
  totalCount: number
  siteFilterWasClientSide: boolean
}

type VolumeCapacityBase = {
  totalUsedKB: number
  totalSnapshotsKiB: number
  totalSizeKB: number
}

type VolumeDetail = VolumeCapacityBase & {
  name: string
  isEncrypted: boolean | null
  snapLockMode: string | null
  tieringPolicy: string | null
}

const VOLUME_FEATURE_OPTIONS = [
  { value: 'encrypted', label: 'Encryption' },
  { value: 'snaplock', label: 'SnapLock' },
  { value: 'tiering', label: 'Tiering' },
] as const

type VolumeFeatureFilter = (typeof VOLUME_FEATURE_OPTIONS)[number]['value']

function volumeHasEncryption(volume: VolumeDetail) {
  return Boolean(volume.isEncrypted)
}

function volumeHasSnapLock(volume: VolumeDetail) {
  return Boolean(volume.snapLockMode && volume.snapLockMode !== 'NON_SNAPLOCK')
}

function volumeHasTiering(volume: VolumeDetail) {
  return Boolean(volume.tieringPolicy && volume.tieringPolicy !== 'NONE')
}

function volumeHasFeature(volume: VolumeDetail, feature: VolumeFeatureFilter) {
  if (feature === 'encrypted') return volumeHasEncryption(volume)
  if (feature === 'snaplock') return volumeHasSnapLock(volume)
  return volumeHasTiering(volume)
}

type WorkloadsSummary = VolumeCapacityBase & {
  volumes: VolumeDetail[]
}

function getVolumeUsage(workloads: VolumeCapacityBase) {
  const totalSizeKiB = workloads.totalSizeKB * 1000 / 1024
  const totalUsedKiB = workloads.totalUsedKB * 1000 / 1024
  const actualUsedKiB = Math.max(0, totalUsedKiB - workloads.totalSnapshotsKiB)
  const actualUsedPercent = totalSizeKiB > 0 ? (actualUsedKiB / totalSizeKiB) * 100 : 0
  const snapshotUsedPercent = totalSizeKiB > 0
    ? (workloads.totalSnapshotsKiB / totalSizeKiB) * 100
    : 0
  return {
    totalSizeKiB,
    totalUsedKiB,
    actualUsedKiB,
    actualUsedPercent,
    snapshotUsedPercent,
  }
}

type TokenRefreshResponse = {
  access_token: string
}

type PerformanceCounterData = {
  [timestamp: string]: Record<string, number>
}

type PerformanceResponse = {
  results: {
    counterMetaData: {
      graph_name: string
      counter_unit: string
      duration: string
    }
    counterData: PerformanceCounterData
  }
}

type ChartDataPoint = {
  timestamp: string
  // Hidden sort key (epoch ms); excluded from chart series wherever data keys are enumerated.
  __epochMs: number
  [key: string]: string | number
}

type PerformanceGraphConfig = {
  name: string
  label: string
  description: string
}

const PERFORMANCE_GRAPHS: PerformanceGraphConfig[] = [
  {
    name: 'node_headroom_cpu_utilization',
    label: 'Node CPU',
    description: 'CPU headroom utilization for the node',
  },
  {
    name: 'node_avg_iops',
    label: 'Node Average IOPs',
    description: 'Average Input/Output operations per second for the node',
  },
  {
    name: 'node_latency',
    label: 'Node Latency',
    description: 'Response latency for the node',
  },
  {
    name: 'node_protocol_iops',
    label: 'Node Protocol IOPs',
    description: 'Protocol-level IOPs for the node',
  },
  {
    name: 'node_network_throughput',
    label: 'Node Network Throughput',
    description: 'Network throughput for the node',
  },
]

// Within-bucket aggregation: how to reduce multiple sub-hourly raw samples into a single
// representative hourly value. Defaults to 'average'; headroom uses 'min' so that the
// worst-case (peak utilisation) moment in each hour is preserved rather than smoothed away.
const BUCKET_AGGREGATION: Record<string, 'average' | 'min' | 'max'> = {
  node_headroom_cpu_utilization: 'min',
  node_latency: 'max',
}

const AUTOMATIC_TAG_PREFIX = '_'
const AUTOMATIC_MODEL_TAGS = [
  { modelPrefix: 'aff', tag: '_aff' },
  { modelPrefix: 'fas', tag: '_fas' },
  { modelPrefix: 'cdvm', tag: '_cvo' },
] as const

// Vibrant colors for tag pills
const TAG_COLORS = [
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
] as const

// Deterministic color assignment based on tag name
function getTagColor(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

function isAutomaticTag(tag: string) {
  return tag.startsWith(AUTOMATIC_TAG_PREFIX)
}

function getTagLabel(tag: string) {
  return isAutomaticTag(tag) ? tag.slice(AUTOMATIC_TAG_PREFIX.length) : tag
}

function compareTags(left: string, right: string) {
  const labelComparison = getTagLabel(left).localeCompare(getTagLabel(right), undefined, {
    sensitivity: 'base',
  })
  if (labelComparison !== 0) {
    return labelComparison
  }
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function getAutomaticTagsForModel(modelName: string | null | undefined): string[] {
  const normalizedModelName = modelName?.trim().toLowerCase() ?? ''
  const matchingTag = AUTOMATIC_MODEL_TAGS.find(({ modelPrefix }) =>
    normalizedModelName.startsWith(modelPrefix),
  )
  return matchingTag ? [matchingTag.tag] : []
}

function normalizeTags(tags: string[], automaticTags: string[] = []) {
  return Array.from(
    new Set([
      ...tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && !isAutomaticTag(tag)),
      ...automaticTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
    ]),
  ).sort(compareTags)
}

const emptySearchForm: SearchForm = {
  customer: '',
  watchlist: '',
  query: '',
}

function CopyableText({
  children,
  textToCopy,
  fw,
  size,
  c,
}: {
  children: ReactNode
  textToCopy: string
  fw?: number
  size?: string
  c?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch((error) => {
        console.error('Failed to copy to clipboard:', error)
      })
  }

  return (
    <Group gap={4} wrap="nowrap" w="fit-content" style={{ cursor: 'pointer' }} onClick={handleCopy}>
      <Text fw={fw} size={size} c={copied ? 'teal' : c}>
        {children}
      </Text>
      {copied && <IconCheck size={14} style={{ color: 'var(--mantine-color-teal-6)' }} />}
    </Group>
  )
}

function normalizeValue(value: string) {
  return value.trim()
}

function createPairKey(serial1: string, serial2: string) {
  return [serial1, serial2].sort().join('::')
}

function groupIntoHAPairs(systems: SystemSummary[]): HAPair[] {
  const serialToSystem = new Map(systems.map((s) => [s.serialNumber, s]))
  const processed = new Set<string>()
  const pairs: HAPair[] = []

  for (const system of systems) {
    if (processed.has(system.serialNumber)) continue
    processed.add(system.serialNumber)

    const partnerSerial = system.partner?.serialNumber
    if (partnerSerial) {
      let partner = serialToSystem.get(partnerSerial)
      
      // If partner is not in search results, synthesize it from embedded partner data
      if (!partner && system.partner) {
        partner = {
          __typename: system.__typename,
          serialNumber: system.partner.serialNumber,
          systemId: system.partner.systemId,
          hostName: system.partner.hostName,
          platformType: system.platformType,
          customerGroup: system.customerGroup,
          hardwareModel: system.hardwareModel,
          nagp: system.nagp,
          cluster: system.cluster,
          partner: {
            serialNumber: system.serialNumber,
            systemId: system.systemId,
            hostName: system.hostName,
          },
          customer: system.customer,
          site: system.site,
          capacity: system.partner.capacity,
        }
      }
      
      if (partner && !processed.has(partnerSerial)) {
        processed.add(partnerSerial)
        pairs.push({
          key: createPairKey(system.serialNumber, partnerSerial),
          node1: system,
          node2: partner,
        })
      } else if (!partner) {
        pairs.push({
          key: createPairKey(system.serialNumber, partnerSerial),
          node1: system,
          node2: null,
        })
      }
    } else {
      pairs.push({
        key: system.serialNumber,
        node1: system,
        node2: null,
      })
    }
  }

  return pairs
}

function addClusterNameToNodes(
  node1: SystemSummary,
  node2: SystemSummary | null,
): [SystemSummary, SystemSummary | null] {
  const clusterName = node1.cluster?.name ?? node2?.cluster?.name
  if (!clusterName) return [node1, node2]

  const addClusterName = (node: SystemSummary) => ({
    ...node,
    cluster: {
      ...(node.cluster ?? { id: null }),
      name: node.cluster?.name ?? clusterName,
    },
  })

  return [addClusterName(node1), node2 ? addClusterName(node2) : null]
}

function pairLabel(pair: HAPair | SavedHAPair) {
  const n1 = pair.node1.hostName || pair.node1.serialNumber
  const n2 = pair.node2 ? pair.node2.hostName || pair.node2.serialNumber : '?'
  return `${n1} / ${n2}`
}

function pairSerialLabel(pair: HAPair | SavedHAPair) {
  return pair.node2
    ? `${pair.node1.serialNumber} / ${pair.node2.serialNumber}`
    : pair.node1.serialNumber
}

type CustomerGroup<T extends HAPair | SavedHAPair = HAPair | SavedHAPair> = {
  customerName: string | null
  siteName: string | null
  siteId: string | null
  nagpId: string | null
  nagpName: string | null
  pairs: T[]
}

type ClusterGroup<T extends HAPair | SavedHAPair = HAPair | SavedHAPair> = {
  clusterId: string | null
  clusterName: string | null
  pairs: T[]
}

function groupPairsByCluster<T extends HAPair | SavedHAPair>(pairs: T[]): ClusterGroup<T>[] {
  const groups = new Map<string, T[]>()
  
  for (const pair of pairs) {
    const clusterId = pair.node1.cluster?.id ?? null
    const clusterName = pair.node1.cluster?.name ?? null
    const key = `${clusterId ?? ''}::${clusterName ?? ''}`
    const existing = groups.get(key) ?? []
    existing.push(pair)
    groups.set(key, existing)
  }
  
  // Sort: clusters with names first (alphabetically), then by ID, then unknown
  const sortedEntries = Array.from(groups.entries()).sort(([a], [b]) => {
    const [aId, aName] = a.split('::')
    const [bId, bName] = b.split('::')
    
    // Sort by cluster name
    if (aName !== bName) {
      if (!aName) return 1
      if (!bName) return -1
      return aName.localeCompare(bName)
    }
    
    // Same name or both empty, sort by ID
    if (!aId) return 1
    if (!bId) return -1
    return aId.localeCompare(bId)
  })
  
  return sortedEntries.map(([key, pairs]) => {
    const [clusterId, clusterName] = key.split('::')
    return {
      clusterId: clusterId || null,
      clusterName: clusterName || null,
      pairs,
    }
  })
}

function normalizeForGrouping(value: string | null | undefined): string {
  if (!value) return ''
  // Trim, lowercase, and collapse multiple spaces to single space
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function groupPairsByCustomer<T extends HAPair | SavedHAPair>(pairs: T[]): CustomerGroup<T>[] {
  // First, sort all pairs by customer and site to ensure consistent ordering
  const sortedPairs = [...pairs].sort((a, b) => {
    const aCustomer = normalizeForGrouping(a.node1.customer?.name ?? a.node1.nagp?.name)
    const bCustomer = normalizeForGrouping(b.node1.customer?.name ?? b.node1.nagp?.name)
    const aSiteId = a.node1.site?.id ?? a.node1.site?.cmatId ?? ''
    const bSiteId = b.node1.site?.id ?? b.node1.site?.cmatId ?? ''
    const aSite = normalizeForGrouping(a.node1.site?.name)
    const bSite = normalizeForGrouping(b.node1.site?.name)
    
    const customerCompare = aCustomer.localeCompare(bCustomer)
    if (customerCompare !== 0) return customerCompare
    
    // Sort by site ID first (more reliable), then by site name
    const siteIdCompare = aSiteId.localeCompare(bSiteId)
    if (siteIdCompare !== 0) return siteIdCompare
    
    return aSite.localeCompare(bSite)
  })
  
  const groups = new Map<string, T[]>()
  
  for (const pair of sortedPairs) {
    const customerName = pair.node1.customer?.name ?? pair.node1.nagp?.name ?? null
    const siteId = pair.node1.site?.id ?? pair.node1.site?.cmatId ?? null
    const siteName = pair.node1.site?.name ?? null
    // Group by customer and site ID (more reliable than name)
    // Fall back to site name if no ID available
    const key = `${normalizeForGrouping(customerName)}::${siteId ?? normalizeForGrouping(siteName)}`
    const existing = groups.get(key) ?? []
    existing.push(pair)
    groups.set(key, existing)
  }
  
  // Sort groups: customers with names first (alphabetically), then by site
  const sortedEntries = Array.from(groups.entries()).sort(([a], [b]) => {
    const [aCustomer, aSite] = a.split('::')
    const [bCustomer, bSite] = b.split('::')
    
    // Sort by customer name
    if (!aCustomer && !bCustomer) {
      // Both unknown, sort by site
      if (!aSite) return 1
      if (!bSite) return -1
      return aSite.localeCompare(bSite)
    }
    if (!aCustomer) return 1
    if (!bCustomer) return -1
    
    const customerCompare = aCustomer.localeCompare(bCustomer)
    if (customerCompare !== 0) return customerCompare
    
    // Same customer, sort by site
    if (!aSite) return 1
    if (!bSite) return -1
    return aSite.localeCompare(bSite)
  })
  
  return sortedEntries.map(([, pairs]) => {
    // Use actual customer/site names from the first pair (preserve original casing)
    const customerName = pairs[0]?.node1.customer?.name ?? pairs[0]?.node1.nagp?.name ?? null
    const siteName = pairs[0]?.node1.site?.name ?? null
    const siteId = pairs[0]?.node1.site?.id ?? pairs[0]?.node1.site?.cmatId ?? null
    const nagpId = pairs[0]?.node1.nagp?.id ?? pairs[0]?.node1.customer?.cmatId ?? null
    return {
      customerName: customerName || null,
      siteName: siteName || null,
      siteId: siteId || null,
      nagpId: nagpId || null,
      nagpName: pairs[0]?.node1.nagp?.name ?? null,
      pairs,
    }
  })
}

function buildQueryVariables(
  scope: SearchScope,
  queryType: SearchQueryType,
  queryValue: string,
  cursor?: string,
): [string, Record<string, unknown>] {
  const base: Record<string, unknown> = { pageSize: PAGE_SIZE }
  if (scope.nagpId) base.nagpId = scope.nagpId
  if (scope.watchlistId) base.watchlistId = scope.watchlistId
  if (scope.customerId) base.customerId = scope.customerId
  if (cursor) base.after = cursor

  if (queryType === 'cluster') {
    return [QUERY_BY_CLUSTER, { ...base, clusterName: queryValue }]
  } else if (queryType === 'serialNumber') {
    return [QUERY_BY_SYSTEM_KEY, { ...base, systemKey: [{ serialNumber: queryValue }] }]
  } else if (queryType === 'systemId') {
    return [QUERY_BY_SYSTEM_KEY, { ...base, systemKey: [{ systemId: queryValue }] }]
  } else {
    return [QUERY_BY_HOSTNAME, { ...base, hostName: queryValue }]
  }
}

function matchesCustomerSite(system: SystemSummary, searchTerm: string) {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  if (!normalizedSearchTerm) {
    return true
  }

  const haystacks = [
    system.site?.name,
    system.site?.id,
    system.site?.cmatId,
    system.customer?.name,
  ]

  return haystacks.some((candidate) =>
    candidate?.toLowerCase().includes(normalizedSearchTerm),
  )
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  // Clean the token - remove any whitespace that might have been introduced
  const cleanToken = refreshToken.replace(/\s/g, '')
  
  // Validate token format before sending
  const segments = cleanToken.split('.')
  if (segments.length < 4 || segments.length > 5) {
    throw new Error(
      `Invalid refresh token format: expected 4 or 5 segments, got ${segments.length}. ` +
      `Token length: ${cleanToken.length} characters. ` +
      `Make sure you copied the entire refresh token.`
    )
  }

  let response: Response
  try {
    response = await fetch(TOKEN_REFRESH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: cleanToken,
      }),
    })
  } catch (fetchError) {
    const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown error'
    throw new Error(
      `Failed to connect to token refresh API: ${errorMsg}. ` +
      `This may be due to CORS restrictions or network connectivity issues.`
    )
  }

  // If we got a 401 and the token has 4 segments, try with a trailing dot
  if (!response.ok && response.status === 401 && segments.length === 4) {
    const tokenWith5Segments = `${cleanToken}.`
    try {
      response = await fetch(TOKEN_REFRESH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: tokenWith5Segments,
        }),
      })
    } catch (retryError) {
      const errorMsg = retryError instanceof Error ? retryError.message : 'Unknown error'
      throw new Error(`Token refresh retry failed: ${errorMsg}`)
    }
  }

  if (!response.ok) {
    let errorMessage = `Token refresh failed with HTTP ${response.status}.`
    try {
      const errorBody = await response.text()
      if (errorBody) {
        errorMessage += ` Response: ${errorBody}`
      }
    } catch {
      // Ignore parsing errors
    }
    throw new Error(errorMessage)
  }

  const payload = (await response.json()) as TokenRefreshResponse

  if (!payload.access_token) {
    throw new Error('Token refresh response missing access_token.')
  }

  return payload.access_token
}

function parseWatchlists(payload: unknown): Watchlist[] {
  const results = (payload as WatchlistListResponse | null)?.results
  const list = results?.watchlist

  if (!Array.isArray(list)) {
    throw new Error('Watchlist response did not contain a list.')
  }

  const defaultId = results?.default_watchlist_id
  const watchlists = list.flatMap((item): Watchlist[] => {
    if (!item || typeof item !== 'object') return []
    const { watchlist_id: id, watchlist_name: name } = item
    return typeof id === 'string' && typeof name === 'string'
      ? [{ id, name, isDefault: id === defaultId }]
      : []
  })

  return Array.from(new Map(watchlists.map((watchlist) => [watchlist.id, watchlist])).values())
}

async function fetchWatchlistApi(url: string, token: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        AuthorizationToken: token,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error'
    throw new Error(`Failed to connect to the watchlist API: ${message}`)
  }

  if (!response.ok) {
    throw new Error(`Watchlist API returned HTTP ${response.status}.`)
  }

  return response.json()
}

async function fetchWatchlists(token: string): Promise<Watchlist[]> {
  return parseWatchlists(await fetchWatchlistApi(WATCHLIST_API_URL, token))
}

function parseWatchlistCustomerIds(payload: unknown): string[] {
  const customers = (payload as WatchlistActionResponse | null)?.results?.customer_details
  if (!Array.isArray(customers)) return []

  return Array.from(
    new Set(
      customers.flatMap((item) =>
        typeof item?.customer_id === 'string' && item.customer_id.trim()
          ? [item.customer_id.trim()]
          : [],
      ),
    ),
  )
}

async function fetchWatchlistCustomerIds(token: string, watchlistId: string): Promise<string[]> {
  const url = `${WATCHLIST_ACTION_API_URL}?id=${encodeURIComponent(watchlistId)}`
  return parseWatchlistCustomerIds(await fetchWatchlistApi(url, token))
}

async function resolveSearchScopes(
  token: string,
  nagpId: string,
  watchlistId: string,
): Promise<SearchScope[]> {
  if (!watchlistId) {
    return [{ nagpId, watchlistId: '', customerId: '' }]
  }

  const customerIds = await fetchWatchlistCustomerIds(token, watchlistId)
  if (customerIds.length > 0) {
    return customerIds.map((customerId) => ({
      nagpId,
      watchlistId: '',
      customerId,
    }))
  }

  return [{ nagpId, watchlistId, customerId: '' }]
}

async function fetchSystemsForQuery(
  token: string,
  scope: SearchScope,
  queryType: SearchQueryType,
  queryValue: string,
  cursor?: string,
  accumulatedResults: SystemSummary[] = [],
): Promise<SystemSummary[]> {
  const [queryString, variables] = buildQueryVariables(
    scope,
    queryType,
    queryValue,
    cursor,
  )

  const requestBody = {
    query: queryString,
    variables,
  }

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  } catch (fetchError) {
    // Network-level error (CORS, DNS, connectivity, etc.)
    const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown network error'
    throw new Error(
      `Network request failed: ${errorMsg}. ` +
      `This may be due to rate limiting, or connectivity issues. ` +
      `Querying ${API_URL} for ${queryType}.`
    )
  }

  if (!response.ok) {
    let errorMessage = `AIQ GraphQL API returned HTTP ${response.status}`
    
    // Try to get more details from response body
    try {
      const errorBody = await response.json()
      if (errorBody.error) {
        errorMessage += `: ${errorBody.error}`
      } else if (errorBody.errors) {
        errorMessage += `: ${JSON.stringify(errorBody.errors)}`
      }
      
      // Add helpful context for common errors
      if (response.status === 429) {
        errorMessage += `. The API is rate-limiting requests. Try waiting a few seconds before searching again, or reduce the number of parallel queries.`
      } else if (response.status === 401 || response.status === 403) {
        errorMessage += `. Check that your access token is valid and has the necessary permissions.`
      }
    } catch {
      // Ignore JSON parsing errors
      if (response.status === 429) {
        errorMessage += ` (Too Many Requests). The API is rate-limiting requests.`
      }
    }
    
    throw new Error(errorMessage)
  }

  const payload = (await response.json()) as GraphQlResponse<SystemsQueryData>

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors.map((error) => error.message).join('\n'))
  }

  const systems = payload.data?.systems?.systems ?? []
  const nextCursor = payload.data?.systems?.cursor
  const totalCount = payload.data?.systems?.totalCount ?? 0
  const allResults = [...accumulatedResults, ...systems]

  // If we have more results to fetch (cursor exists and we haven't fetched everything)
  if (nextCursor && allResults.length < totalCount) {
    return fetchSystemsForQuery(
      token,
      scope,
      queryType,
      queryValue,
      nextCursor,
      allResults,
    )
  }

  return allResults
}

async function fetchClusterForSystem(
  token: string,
  serialNumber: string,
): Promise<{ id: string; name: string } | null> {
  const requestBody = {
    query: CLUSTER_QUERY,
    variables: {
      serialNumber,
    },
  }

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  } catch (fetchError) {
    console.warn('Failed to fetch cluster data - network error:', fetchError)
    return null
  }

  if (!response.ok) {
    console.warn('Failed to fetch cluster data - HTTP', response.status)
    return null
  }

  const payload = (await response.json()) as GraphQlResponse<{
    systems: {
      systems: Array<{
        cluster?: { id: string; name: string } | null
      }>
    }
  }>

  if (payload.errors && payload.errors.length > 0) {
    console.warn('Cluster query errors:', payload.errors)
    return null
  }

  const cluster = payload.data?.systems?.systems?.[0]?.cluster
  return cluster || null
}

const WORKLOADS_QUERY = `
  query StorageVolumes($systemKey: [SystemKey!]) {
    systems(systemKey: $systemKey) {
      systems {
        ... on ONTAPSystem {
          storageVolumes {
            volumes {
              name
              isEncrypted
              snapLockMode
              tieringPolicy
              capacity {
                sizeKB
                usedKB
                logical {
                  usedSnapshotsKiB
                }
              }
            }
          }
        }
      }
    }
  }
`

type WorkloadsVolume = {
  name: string | null
  isEncrypted: boolean | null
  snapLockMode: string | null
  tieringPolicy: string | null
  capacity: {
    sizeKB: number | null
    usedKB: number | null
    logical: { usedSnapshotsKiB: number | null } | null
  } | null
}

type StorageVolumesPageData = {
  systems: {
    systems: Array<{
      storageVolumes: {
        volumes: WorkloadsVolume[] | null
      } | null
    }>
  } | null
}

async function fetchWorkloads(
  token: string,
  systemId: string,
): Promise<WorkloadsSummary | null> {
  const variables = { systemKey: [{ systemId }] }

  const requestBody = { query: WORKLOADS_QUERY, variables }

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  } catch {
    return null
  }

  if (!response.ok) {
    console.warn('Workloads query failed with HTTP', response.status)
    return null
  }

  const payload = (await response.json()) as GraphQlResponse<StorageVolumesPageData>

  if (payload.errors && payload.errors.length > 0) {
    console.warn('Workloads query errors:', payload.errors)
    return null
  }

  const volumes = payload.data?.systems?.systems[0]?.storageVolumes?.volumes ?? []
  const totalUsedKB = volumes.reduce((sum, v) => sum + (v.capacity?.usedKB ?? 0), 0)
  const totalSnapshotsKiB = volumes.reduce(
    (sum, v) => sum + (v.capacity?.logical?.usedSnapshotsKiB ?? 0),
    0,
  )
  const totalSizeKB = volumes.reduce((sum, v) => sum + (v.capacity?.sizeKB ?? 0), 0)
  const volumeDetails: VolumeDetail[] = volumes.map((v) => ({
    name: v.name ?? 'Unnamed volume',
    isEncrypted: v.isEncrypted,
    snapLockMode: v.snapLockMode,
    tieringPolicy: v.tieringPolicy,
    totalUsedKB: v.capacity?.usedKB ?? 0,
    totalSnapshotsKiB: v.capacity?.logical?.usedSnapshotsKiB ?? 0,
    totalSizeKB: v.capacity?.sizeKB ?? 0,
  }))
  return { totalUsedKB, totalSnapshotsKiB, totalSizeKB, volumes: volumeDetails }
}

async function fetchSystemsByFilters(
  token: string,
  scope: SearchScope,
  cursor?: string,
  accumulated: SystemSummary[] = [],
): Promise<SystemSummary[]> {
  const requestBody = {
    query: QUERY_BY_NAGP,
    variables: {
      pageSize: PAGE_SIZE,
      nagpId: scope.nagpId || undefined,
      watchlistId: scope.watchlistId || undefined,
      customerId: scope.customerId || undefined,
      after: cursor,
    },
  }

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  } catch (fetchError) {
    const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown error'
    throw new Error(
      `Network request failed for filtered search: ${errorMsg}. ` +
      `This may be due to rate limiting, or connectivity issues.`
    )
  }

  if (!response.ok) {
    let errorMessage = `AIQ filtered search returned HTTP ${response.status}`
    try {
      const errorBody = await response.json()
      if (errorBody.error) {
        errorMessage += `: ${errorBody.error}`
      }
      if (response.status === 429) {
        errorMessage += `. Rate limit exceeded - please wait before searching again.`
      }
    } catch {
      // Ignore parsing errors
    }
    throw new Error(errorMessage)
  }

  const payload = (await response.json()) as GraphQlResponse<SystemsQueryData>

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors.map((error) => error.message).join('\n'))
  }

  const systems = payload.data?.systems?.systems ?? []
  const nextCursor = payload.data?.systems?.cursor
  const totalCount = payload.data?.systems?.totalCount ?? 0
  const allResults = [...accumulated, ...systems]

  if (nextCursor && allResults.length < totalCount) {
    return fetchSystemsByFilters(token, scope, nextCursor, allResults)
  }

  return allResults
}

async function fetchSystemsForScope(
  token: string,
  scope: SearchScope,
  query: string,
): Promise<SystemSummary[]> {
  if (!query) {
    return fetchSystemsByFilters(token, scope)
  }

  const [clusterResults, serialResults, systemIdResults, hostResults] = await Promise.all([
    fetchSystemsForQuery(token, scope, 'cluster', query),
    fetchSystemsForQuery(token, scope, 'serialNumber', query),
    fetchSystemsForQuery(token, scope, 'systemId', query),
    fetchSystemsForQuery(token, scope, 'hostName', query),
  ])

  return [...clusterResults, ...serialResults, ...systemIdResults, ...hostResults]
}

async function searchSystems(token: string, form: SearchForm): Promise<SearchResultState> {
  const query = normalizeValue(form.query)
  const customer = normalizeValue(form.customer)
  const watchlist = normalizeValue(form.watchlist)

  // At least one search parameter is required
  if (!query && !customer && !watchlist) {
    return {
      pairs: [],
      totalCount: 0,
      siteFilterWasClientSide: false,
    }
  }

  const scopes = await resolveSearchScopes(token, customer, watchlist)
  const scopedResults = await Promise.all(
    scopes.map((scope) => fetchSystemsForScope(token, scope, query)),
  )
  const allResults = scopedResults.flat()

  // Merge and deduplicate results
  const systemMap = new Map<string, SystemSummary>()

  for (const system of allResults) {
    const key = system.serialNumber
    if (!systemMap.has(key)) {
      systemMap.set(key, system)
    }
  }

  let systems = Array.from(systemMap.values())

  // Apply client-side customer filter if selected
  if (customer) {
    systems = systems.filter((system) => system.nagp?.id === customer || system.customer?.cmatId === customer)
  }

  // Apply client-side customer site filter
  const filteredSystems = systems.filter((system) => matchesCustomerSite(system, query))
  const siteFilterWasClientSide = filteredSystems.length > 0 && filteredSystems.length < systems.length

  // Merge site-filtered results
  for (const system of filteredSystems) {
    const key = system.serialNumber
    if (!systemMap.has(key)) {
      systemMap.set(key, system)
    }
  }

  systems = Array.from(systemMap.values())
  const pairs = groupIntoHAPairs(systems)

  return {
    pairs,
    totalCount: pairs.length,
    siteFilterWasClientSide,
  }
}

async function fetchPerformanceData(
  token: string,
  graphName: string,
  node: SystemSummary,
  startDate: string,
  endDate: string,
): Promise<PerformanceResponse> {
  const params = new URLSearchParams({
    graphName,
    startDate,
    endDate,
  })

  const isClusterGraph = graphName.startsWith('cluster_')
  const isNodeGraph = graphName.startsWith('node_')
  const clusterId = node.cluster?.id

  // Add cluster parameter for cluster-based graphs
  if (isClusterGraph) {
    if (clusterId) {
      params.append('cluster', clusterId)
    }
  }

  // Add node-specific parameters for node-based graphs
  if (isNodeGraph) {
    if (clusterId) {
      params.append('cluster', clusterId)
    }
    params.append('serialNumber', node.serialNumber)
    if (node.systemId) {
      params.append('systemId', node.systemId)
    }
  }

  const url = `${PERFORMANCE_API_URL}?${params.toString()}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'authorizationtoken': token,
    },
  })

  if (!response.ok) {
    let errorMessage = `Performance API returned HTTP ${response.status}`
    try {
      const errorBody = await response.text()
      if (errorBody) {
        errorMessage += `: ${errorBody}`
      }
    } catch {
      // Ignore parsing errors
    }
    console.error('Performance API error:', errorMessage)
    throw new Error(errorMessage)
  }

  const data = (await response.json()) as PerformanceResponse
  return data
}

function transformPerformanceData(
  data: PerformanceResponse,
  bucketAggregation: 'average' | 'min' | 'max' = 'average',
): ChartDataPoint[] {
  const counterData = data.results.counterData

  // Bucket raw samples into hourly slots so every controller produces identical
  // timestamp keys, enabling correct cross-controller consolidation.
  const buckets = new Map<number, Record<string, number[]>>()

  for (const [timestamp, values] of Object.entries(counterData)) {
    const ms = Number(timestamp) / 1_000_000
    const hourMs = Math.floor(ms / 3_600_000) * 3_600_000

    const bucket = buckets.get(hourMs) ?? {}
    if (!buckets.has(hourMs)) buckets.set(hourMs, bucket)

    for (const [key, value] of Object.entries(values)) {
      if (!bucket[key]) bucket[key] = []
      bucket[key].push(value)
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([hourMs, keyValues]) => {
      const date = new Date(hourMs)
      const point: ChartDataPoint = {
        timestamp: date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        // Hidden sort key: avoids relying on Date.parse of the locale-formatted
        // label, which is browser-dependent and ambiguous across year boundaries.
        __epochMs: hourMs,
      }
      for (const [key, values] of Object.entries(keyValues)) {
        if (bucketAggregation === 'min') {
          point[key] = Math.min(...values)
        } else if (bucketAggregation === 'max') {
          point[key] = Math.max(...values)
        } else {
          point[key] = values.reduce((a, b) => a + b, 0) / values.length
        }
      }
      return point
    })
}

// Chart is ~1000px wide; 500 pts = ~2px/pt — full visual fidelity at any time range.
const CHART_MAX_POINTS = 500

function lttbDownsample(data: ChartDataPoint[], threshold: number): ChartDataPoint[] {
  if (data.length <= threshold) return data
  const rep = (p: ChartDataPoint) => {
    const vals = Object.entries(p).filter(([k, v]) => k !== 'timestamp' && k !== '__epochMs' && typeof v === 'number').map(([, v]) => v as number)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const sampled: ChartDataPoint[] = [data[0]]
  const bSize = (data.length - 2) / (threshold - 2)
  let a = 0
  for (let i = 0; i < threshold - 2; i++) {
    const avgS = Math.floor((i + 1) * bSize) + 1
    const avgE = Math.min(Math.floor((i + 2) * bSize) + 1, data.length)
    let avgX = 0, avgY = 0
    for (let j = avgS; j < avgE; j++) { avgX += j; avgY += rep(data[j]) }
    avgX /= (avgE - avgS); avgY /= (avgE - avgS)
    const bS = Math.floor(i * bSize) + 1
    const bE = Math.min(Math.floor((i + 1) * bSize) + 1, data.length)
    const aY = rep(data[a])
    let maxArea = -1, nextA = bS
    for (let j = bS; j < bE; j++) {
      const area = Math.abs((a - avgX) * (rep(data[j]) - aY) - (a - j) * (avgY - aY)) * 0.5
      if (area > maxArea) { maxArea = area; nextA = j }
    }
    sampled.push(data[nextA]); a = nextA
  }
  sampled.push(data[data.length - 1])
  return sampled
}

// Median filter: window = data points covering ~5px at ~1000px chart width.
function smoothChartData(data: ChartDataPoint[]): ChartDataPoint[] {
  const w = Math.max(3, Math.round(data.length * 5 / 1000))
  if (data.length <= w) return data
  const half = Math.floor(w / 2)
  return data.map((point, i) => {
    const smoothed: ChartDataPoint = { timestamp: point.timestamp, __epochMs: point.__epochMs }
    for (const key of Object.keys(point)) {
      if (key === 'timestamp' || key === '__epochMs') continue
      const win: number[] = []
      for (let j = Math.max(0, i - half); j <= Math.min(data.length - 1, i + half); j++) {
        const v = data[j][key]; if (typeof v === 'number') win.push(v)
      }
      win.sort((a, b) => a - b); smoothed[key] = win[Math.floor(win.length / 2)]
    }
    return smoothed
  })
}

function consolidateChartDataPerNode(
  datasets: Array<{ data: ChartDataPoint[]; nodeLabel: string }>,
): ChartDataPoint[] {
  if (datasets.length === 0) return []

  const timestampMap = new Map<string, { epochMs: number; values: Record<string, number> }>()

  for (const { data, nodeLabel } of datasets) {
    for (const point of data) {
      const entry = timestampMap.get(point.timestamp) ?? { epochMs: point.__epochMs, values: {} }
      if (!timestampMap.has(point.timestamp)) timestampMap.set(point.timestamp, entry)
      for (const [key, value] of Object.entries(point)) {
        if (key === 'timestamp' || key === '__epochMs' || typeof value !== 'number') continue
        const labeledKey = `${nodeLabel} – ${key}`
        entry.values[labeledKey] = value
      }
    }
  }

  const result: ChartDataPoint[] = []
  for (const [timestamp, { epochMs, values }] of timestampMap) {
    result.push({ timestamp, __epochMs: epochMs, ...values })
  }

  // Map insertion order doesn't guarantee chronological order when nodes have
  // mismatched timestamp sets, so sort explicitly by the underlying epoch
  // rather than parsing the display label (unreliable across browsers/years).
  result.sort((a, b) => a.__epochMs - b.__epochMs)

  return result
}

function CustomerHeader({
  group,
  onSaveNagp,
  nagpAlreadySaved,
}: {
  group: CustomerGroup
  onSaveNagp?: () => void
  nagpAlreadySaved?: boolean
}) {
  return (
    <Group gap="xs" mb="xs">
      <ThemeIcon variant="light" color="blue" size="md">
        <IconBuilding size={16} />
      </ThemeIcon>
      <div>
        <Text fw={600} size="sm">
          {group.customerName || 'Unknown customer'}
        </Text>
        <Group gap="md">
          <Text size="xs" c="dimmed">
            Site: {group.siteName || 'Unknown'}{group.siteId ? ` (${group.siteId})` : ''}
          </Text>
          {group.nagpId ? (
            <Group gap={4}>
              <Text size="xs" c="dimmed">
                {group.nagpName ? `${group.nagpName} (${group.nagpId})` : group.nagpId}
              </Text>
              {onSaveNagp ? (
                <Tooltip label={nagpAlreadySaved ? 'Already in customers list' : 'Add to customers list'}>
                  <ActionIcon
                    size="xs"
                    variant={nagpAlreadySaved ? 'light' : 'filled'}
                    color={nagpAlreadySaved ? 'teal' : 'green'}
                    radius="xl"
                    aria-label="Add NAGP to customers list"
                    onClick={onSaveNagp}
                    disabled={nagpAlreadySaved}
                  >
                    {nagpAlreadySaved ? <IconCheck size={10} /> : <IconPlus size={10} stroke={3} />}
                  </ActionIcon>
                </Tooltip>
              ) : null}
            </Group>
          ) : null}
          <Text size="xs" c="dimmed">
            {group.pairs.length} HA pair{group.pairs.length !== 1 ? 's' : ''}
          </Text>
        </Group>
      </div>
    </Group>
  )
}

function ClusterBlock<T extends HAPair | SavedHAPair>({
  clusterGroup,
  renderPair,
}: {
  clusterGroup: ClusterGroup<T>
  renderPair: (pair: T) => ReactNode
}) {
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        {clusterGroup.clusterName ? (
          <CopyableText fw={600} size="sm" textToCopy={clusterGroup.clusterName}>
            {clusterGroup.clusterName}
          </CopyableText>
        ) : (
          <Text fw={600} size="sm">
            No cluster
          </Text>
        )}
        {clusterGroup.pairs.map((pair) => (
          <div key={pair.key}>
            {renderPair(pair)}
          </div>
        ))}
      </Stack>
    </Paper>
  )
}

function TagsEditor({
  value,
  onChange,
  allTags,
}: {
  value: string[]
  onChange: (value: string[]) => void
  allTags: string[]
}) {
  const [error, setError] = useState<string | null>(null)

  const automaticTags = value.filter(isAutomaticTag)
  const manualTags = value.filter((tag) => !isAutomaticTag(tag))
  const availableTags = allTags.filter((tag) => !isAutomaticTag(tag))

  const handleChange = (nextTags: string[]) => {
    setError(
      nextTags.some((tag) => isAutomaticTag(tag.trim()))
        ? 'Tags starting with "_" are reserved for automatic model tags.'
        : null,
    )
    onChange(normalizeTags(nextTags, automaticTags))
  }

  const automaticTagPills = automaticTags.map((item) => (
    <Pill key={item} color={getTagColor(item)}>
      {getTagLabel(item)}
    </Pill>
  ))

  return (
    <Stack gap={4}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--mantine-spacing-xs)' }}>
        {automaticTagPills.length > 0 ? (
          <Group gap={4} wrap="wrap" style={{ flexShrink: 0, paddingTop: 6 }}>
            {automaticTagPills}
          </Group>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <TagsInput
            placeholder="Pick tag from list"
            data={availableTags}
            value={manualTags}
            onChange={handleChange}
            clearable
          />
        </div>
      </div>
      {error ? <Text size="xs" c="red">{error}</Text> : null}
    </Stack>
  )
}

function getAutomaticTagsForPair(pair: Pick<HAPair, 'node1'> | Pick<SavedHAPair, 'node1'>) {
  const tags = getAutomaticTagsForModel(pair.node1.hardwareModel?.name)
  if (pair.node1.isMetroCluster) {
    tags.push('_metrocluster')
  }
  return tags
}

function buildConsolidatedMonthlyCapacity(nodes: SystemSummary[]) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthlyTotals = new Map<string, { usedKiB: number; usableKiB: number }>()

  for (const node of nodes) {
    const nodeMonths = new Map(
      (node.monthlyCapacity ?? [])
        .filter(
          (entry) =>
            entry.month &&
            /^\d{4}-(0[1-9]|1[0-2])$/.test(entry.month) &&
            entry.month <= currentMonth,
        )
        .map((entry) => [entry.month!, entry]),
    )

    for (const [month, entry] of nodeMonths) {
      const usedKiB = entry.physical?.usedPerformanceTierKiB
      const usableKiB = entry.physical?.usablePerformanceTierKiB
      if (
        typeof usedKiB !== 'number' ||
        !Number.isFinite(usedKiB) ||
        typeof usableKiB !== 'number' ||
        !Number.isFinite(usableKiB)
      ) {
        continue
      }

      const total = monthlyTotals.get(month) ?? { usedKiB: 0, usableKiB: 0 }
      total.usedKiB += usedKiB
      total.usableKiB += usableKiB
      monthlyTotals.set(month, total)
    }
  }

  return Array.from(monthlyTotals)
    .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
    .slice(-12)
    .map(([month, total]) => ({
      month,
      Used: total.usedKiB / 1024 ** 3,
      Usable: total.usableKiB / 1024 ** 3,
    }))
}

function CapacityHistoryChart({
  nodes,
  isLoading,
}: {
  nodes: SystemSummary[]
  isLoading: boolean
}) {
  const data = useMemo(() => buildConsolidatedMonthlyCapacity(nodes), [nodes])

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">12-month capacity history</Text>
      {isLoading ? (
        <Skeleton h={220} />
      ) : data.length > 0 ? (
        <AreaChart
          h={220}
          data={data}
          dataKey="month"
          series={[
            { name: 'Used', color: 'blue.6' },
            { name: 'Usable', color: 'grape.6' },
          ]}
          curveType="monotone"
          strokeWidth={2}
          valueFormatter={(value) => `${value.toFixed(1)} TiB`}
          withDots={false}
          withGradient={false}
          withLegend
          withTooltip
        />
      ) : (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          No monthly capacity history available for this selection
        </Text>
      )}
    </Stack>
  )
}

function CapacityGauge({
  capacity,
}: {
  capacity: {
    rawMarketingKiB: number | null
    usedKiB: number | null
    usablePerformanceTierKiB: number | null
    usedPerformanceTierKiB: number | null
  } | null
}) {
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true })
  const isDarkMode = computedColorScheme === 'dark'

  if (!capacity) return null

  const raw = capacity.rawMarketingKiB ?? 0
  const usable = capacity.usablePerformanceTierKiB ?? 0
  const used = capacity.usedPerformanceTierKiB ?? 0

  if (raw === 0 && usable === 0 && used === 0) return null

  const usedPercent = usable > 0 ? (used / usable) * 100 : 0
  const usedPercentOfRaw = raw > 0 ? (used / raw) * 100 : 0
  const availablePercentOfRaw = raw > 0 ? ((usable - used) / raw) * 100 : 0
  const unusablePercentOfRaw = raw > 0 ? ((raw - usable) / raw) * 100 : 0

  const getUsedColor = (percent: number) => {
    if (percent >= 90) return 'red'
    if (percent >= 75) return 'orange'
    return 'green'
  }

  const labelColor = isDarkMode ? 'white' : 'dark'
  const usableColor = isDarkMode ? 'dark.4' : 'gray.4'
  const rawColor = isDarkMode ? 'dark.5' : 'gray.2'

  const formatKiB = (kib: number) => {
    const tib = kib / (1024 ** 3)
    return tib >= 1 ? `${tib.toFixed(1)} TiB` : `${(kib / (1024 ** 2)).toFixed(1)} GiB`
  }

  return (
    <Stack gap={4}>
      <Group justify="flex-end" gap="xs">
        <Text size="xs" c="dimmed">
          {formatKiB(used)} / {formatKiB(usable)} ({usedPercent.toFixed(1)}%) / {formatKiB(raw)}
        </Text>
      </Group>
      <Tooltip.Group openDelay={300} closeDelay={100}>
        <Progress.Root size="xl">
          <Tooltip label={`Used: ${formatKiB(used)}`} color="dark">
            <Progress.Section value={usedPercentOfRaw} color={getUsedColor(usedPercent)}>
              <Progress.Label c={labelColor}>{formatKiB(used)}</Progress.Label>
            </Progress.Section>
          </Tooltip>
          {availablePercentOfRaw > 0 ? (
            <Tooltip label={`Usable: ${formatKiB(usable)}`} color="dark">
              <Progress.Section value={availablePercentOfRaw} color={usableColor}>
                <Progress.Label c={labelColor}>{formatKiB(usable - used)}</Progress.Label>
              </Progress.Section>
            </Tooltip>
          ) : null}
          {unusablePercentOfRaw > 0 ? (
            <Tooltip label={`Marketing: ${formatKiB(raw)}`} color="dark">
              <Progress.Section value={unusablePercentOfRaw} color={rawColor} />
            </Tooltip>
          ) : null}
        </Progress.Root>
      </Tooltip.Group>
    </Stack>
  )
}

function fmtVolumeSize(kib: number) {
  const tib = kib / 1024 ** 3
  return tib >= 1 ? `${tib.toFixed(1)} TiB` : `${(kib / 1024 ** 2).toFixed(1)} GiB`
}

function VolumeGauge({ volume }: { volume: VolumeCapacityBase }) {
  const usage = getVolumeUsage(volume)
  const usedColor = usage.actualUsedPercent >= 90 ? 'red' : usage.actualUsedPercent >= 75 ? 'orange' : 'green'
  const snapshotPercent = Math.min(
    usage.snapshotUsedPercent,
    Math.max(0, 100 - usage.actualUsedPercent),
  )
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {fmtVolumeSize(usage.actualUsedKiB)} actual + {fmtVolumeSize(volume.totalSnapshotsKiB)} snapshots / {fmtVolumeSize(usage.totalSizeKiB)}
      </Text>
      <Tooltip.Group openDelay={300} closeDelay={100}>
        <Progress.Root size="sm">
          <Tooltip label={`Actual used: ${fmtVolumeSize(usage.actualUsedKiB)}`}>
            <Progress.Section value={usage.actualUsedPercent} color={usedColor} />
          </Tooltip>
          {snapshotPercent > 0 ? (
            <Tooltip label={`Snapshots: ${fmtVolumeSize(volume.totalSnapshotsKiB)}`}>
              <Progress.Section value={snapshotPercent} color="violet" />
            </Tooltip>
          ) : null}
        </Progress.Root>
      </Tooltip.Group>
    </Stack>
  )
}

function ColumnFilterHeader({
  label,
  isActive,
  onClear,
  children,
}: {
  label: string
  isActive: boolean
  onClear: () => void
  children: ReactNode
}) {
  const [opened, setOpened] = useState(false)

  return (
    <Group gap={4} wrap="nowrap">
      <span>{label}</span>
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        shadow="md"
        width={240}
        trapFocus
      >
        <Popover.Target>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={() => setOpened((current) => !current)}
            aria-label={`Filter by ${label.toLowerCase()}`}
          >
            {isActive ? <IconFilterFilled size={14} /> : <IconFilter size={14} />}
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            {children}
            <Group justify="flex-end">
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                onClick={onClear}
                disabled={!isActive}
              >
                Clear
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  )
}

function VolumesTable({
  volumes,
}: {
  volumes: Array<{ nodeLabel: string; volume: VolumeDetail }>
}) {
  const [nameFilter, setNameFilter] = useState('')
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])

  const nodeOptions = useMemo(() => {
    const labels = Array.from(new Set(volumes.map((row) => row.nodeLabel))).sort((a, b) =>
      a.localeCompare(b),
    )
    return labels.map((label) => ({ value: label, label }))
  }, [volumes])

  const showNodeColumn = nodeOptions.length > 1

  const filteredVolumes = useMemo(() => {
    const nameQuery = nameFilter.trim().toLowerCase()
    return volumes
      .filter(({ nodeLabel, volume }) => {
        if (nameQuery && !volume.name.toLowerCase().includes(nameQuery)) {
          return false
        }
        if (selectedNodes.length > 0 && !selectedNodes.includes(nodeLabel)) {
          return false
        }
        if (selectedFeatures.length > 0) {
          const hasAnySelectedFeature = selectedFeatures.some((feature) =>
            volumeHasFeature(volume, feature as VolumeFeatureFilter),
          )
          if (!hasAnySelectedFeature) return false
        }
        return true
      })
      .sort((a, b) => b.volume.totalUsedKB - a.volume.totalUsedKB)
  }, [volumes, nameFilter, selectedNodes, selectedFeatures])

  if (volumes.length === 0) return null

  const isFiltered =
    nameFilter.trim() !== '' || selectedNodes.length > 0 || selectedFeatures.length > 0
  const countLabel = isFiltered
    ? `Volumes (${filteredVolumes.length} of ${volumes.length})`
    : `Volumes (${volumes.length})`

  const columnCount = showNodeColumn ? 4 : 3

  return (
    <Stack gap="sm">
      <Text fw={500}>{countLabel}</Text>
      <Table verticalSpacing="xs" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            {showNodeColumn ? (
              <Table.Th>
                <ColumnFilterHeader
                  label="Node"
                  isActive={selectedNodes.length > 0}
                  onClear={() => setSelectedNodes([])}
                >
                  <ScrollArea.Autosize mah={200} type="auto">
                    <Checkbox.Group value={selectedNodes} onChange={setSelectedNodes}>
                      <Stack gap="xs">
                        {nodeOptions.map((option) => (
                          <Checkbox
                            key={option.value}
                            value={option.value}
                            label={option.label}
                            size="xs"
                          />
                        ))}
                      </Stack>
                    </Checkbox.Group>
                  </ScrollArea.Autosize>
                </ColumnFilterHeader>
              </Table.Th>
            ) : null}
            <Table.Th>
              <ColumnFilterHeader
                label="Volume"
                isActive={nameFilter.trim() !== ''}
                onClear={() => setNameFilter('')}
              >
                <TextInput
                  placeholder="Filter by name"
                  leftSection={<IconSearch size={16} />}
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.currentTarget.value)}
                  size="xs"
                  rightSection={
                    nameFilter ? (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => setNameFilter('')}
                        aria-label="Clear volume name filter"
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    ) : null
                  }
                />
              </ColumnFilterHeader>
            </Table.Th>
            <Table.Th>
              <ColumnFilterHeader
                label="Features"
                isActive={selectedFeatures.length > 0}
                onClear={() => setSelectedFeatures([])}
              >
                <Checkbox.Group value={selectedFeatures} onChange={setSelectedFeatures}>
                  <Stack gap="xs">
                    {VOLUME_FEATURE_OPTIONS.map((option) => (
                      <Checkbox
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        size="xs"
                      />
                    ))}
                  </Stack>
                </Checkbox.Group>
              </ColumnFilterHeader>
            </Table.Th>
            <Table.Th>Used / snapshots</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filteredVolumes.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={columnCount}>
                <Text size="sm" c="dimmed">
                  No volumes match your filters.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : null}
          {filteredVolumes.map(({ nodeLabel, volume }, index) => (
            <Table.Tr key={`${nodeLabel}-${volume.name}-${index}`}>
              {showNodeColumn ? (
                <Table.Td>
                  <CopyableText size="xs" c="dimmed" textToCopy={nodeLabel}>
                    {nodeLabel}
                  </CopyableText>
                </Table.Td>
              ) : null}
              <Table.Td>
                <CopyableText size="xs" fw={500} textToCopy={volume.name}>
                  {volume.name}
                </CopyableText>
              </Table.Td>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  {volumeHasEncryption(volume) ? (
                    <Tooltip label="Encryption enabled">
                      <IconKey size={16} aria-label="Encryption enabled" />
                    </Tooltip>
                  ) : null}
                  {volumeHasSnapLock(volume) ? (
                    <Tooltip label={`SnapLock: ${volume.snapLockMode}`}>
                      <IconLock size={16} aria-label={`SnapLock: ${volume.snapLockMode}`} />
                    </Tooltip>
                  ) : null}
                  {volumeHasTiering(volume) ? (
                    <Tooltip label={`Tiering: ${volume.tieringPolicy}`}>
                      <IconCloud size={16} aria-label={`Tiering: ${volume.tieringPolicy}`} />
                    </Tooltip>
                  ) : null}
                </Group>
              </Table.Td>
              <Table.Td style={{ minWidth: 220 }}>
                <VolumeGauge volume={volume} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

function VolumeSummarySkeleton({ size = 'xs' }: { size?: 'xs' | 'sm' }) {
  const isSmall = size === 'xs'
  return (
    <Stack gap={4}>
      <Skeleton h={isSmall ? 10 : 12} w={60} radius="sm" />
      <Skeleton h={isSmall ? 9 : 10} w="80%" radius="sm" />
      <Skeleton h={isSmall ? 6 : 8} radius="xl" />
    </Stack>
  )
}

function VolumesTableSkeleton({
  rows = 5,
  showNodeColumn = false,
}: {
  rows?: number
  showNodeColumn?: boolean
}) {
  return (
    <Table verticalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          {showNodeColumn ? <Table.Th>Node</Table.Th> : null}
          <Table.Th>Volume</Table.Th>
          <Table.Th>Features</Table.Th>
          <Table.Th>Used / snapshots</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {Array.from({ length: rows }, (_, index) => (
          <Table.Tr key={index}>
            {showNodeColumn ? (
              <Table.Td>
                <Skeleton h={10} w={110} radius="sm" />
              </Table.Td>
            ) : null}
            <Table.Td>
              <Skeleton h={10} w={150} radius="sm" />
            </Table.Td>
            <Table.Td>
              <Group gap={6} wrap="nowrap">
                <Skeleton h={16} w={16} circle />
                <Skeleton h={16} w={16} circle />
              </Group>
            </Table.Td>
            <Table.Td style={{ minWidth: 220 }}>
              <Stack gap={2}>
                <Skeleton h={9} w="70%" radius="sm" />
                <Skeleton h={8} radius="xl" />
              </Stack>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

function VolumesPanelSkeleton({ showNodeColumn = false }: { showNodeColumn?: boolean }) {
  return (
    <Paper withBorder radius="lg" p="md">
      <Stack gap="sm">
        <Skeleton h={16} w={120} radius="sm" />
        <VolumesTableSkeleton showNodeColumn={showNodeColumn} />
      </Stack>
    </Paper>
  )
}

function NodeInfo({
  node,
  label,
  workloads,
  workloadsLoading,
}: {
  node: SystemSummary | null
  label: string
  workloads?: WorkloadsSummary | null
  workloadsLoading?: boolean
}) {
  if (!node) {
    return (
      <Stack gap="xs">
        <Text size="xs" c="dimmed" fw={600}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          No partner information
        </Text>
      </Stack>
    )
  }

  const nodeName = node.hostName || node.serialNumber

  return (
    <Stack gap="xs">
      <Stack gap={4}>
        <CopyableText fw={600} size="sm" textToCopy={nodeName}>
          {nodeName}
        </CopyableText>
        <CopyableText size="xs" c="dimmed" textToCopy={node.serialNumber}>
          {node.serialNumber}
        </CopyableText>
      </Stack>
      {node.capacity?.physical ? (
        <CapacityGauge
          capacity={node.capacity.physical}
        />
      ) : (
        <Text size="xs" c="dimmed">No capacity data</Text>
      )}
      {workloads ? (() => {
        const fmt = (kib: number) => {
          const tib = kib / 1024 ** 3
          return tib >= 1 ? `${tib.toFixed(1)} TiB` : `${(kib / 1024 ** 2).toFixed(1)} GiB`
        }
        const usage = getVolumeUsage(workloads)
        const getUsedColor = (pct: number) => pct >= 90 ? 'red' : pct >= 75 ? 'orange' : 'green'
        const snapshotPercent = Math.min(
          usage.snapshotUsedPercent,
          Math.max(0, 100 - usage.actualUsedPercent),
        )
        return (
          <Stack gap={4}>
            <Text size="xs" fw={500}>Volumes</Text>
            <Text size="xs" c="dimmed">
              {fmt(usage.actualUsedKiB)} actual + {fmt(workloads.totalSnapshotsKiB)} snapshots / {fmt(usage.totalSizeKiB)}
            </Text>
            <Tooltip.Group openDelay={300} closeDelay={100}>
              <Progress.Root size="sm">
                <Tooltip label={`Actual used: ${fmt(usage.actualUsedKiB)}`}>
                  <Progress.Section value={usage.actualUsedPercent} color={getUsedColor(usage.actualUsedPercent)} />
                </Tooltip>
                {snapshotPercent > 0 ? (
                  <Tooltip label={`Snapshots: ${fmt(workloads.totalSnapshotsKiB)}`}>
                    <Progress.Section value={snapshotPercent} color="violet" />
                  </Tooltip>
                ) : null}
              </Progress.Root>
            </Tooltip.Group>
          </Stack>
        )
      })() : workloadsLoading ? (
        <VolumeSummarySkeleton />
      ) : null}
    </Stack>
  )
}

function getHardwareModelColor(modelName: string) {
  if (modelName.includes('AFF')) return 'green'
  if (modelName.includes('FAS')) return 'blue'
  return 'gray'
}

function HardwareModelCornerBadge({
  name,
  roundedTopLeft = true,
}: {
  name: string
  roundedTopLeft?: boolean
}) {
  return (
    <Badge
      size="sm"
      color={getHardwareModelColor(name)}
      variant="filled"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        borderRadius: `${roundedTopLeft ? '0.375rem' : '0'} 0 0.5rem 0`,
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        zIndex: 1,
      }}
    >
      {name}
    </Badge>
  )
}

function PairSelectionNavLink({
  pair,
  selected,
  onToggle,
}: {
  pair: SavedHAPair
  selected: boolean
  onToggle: () => void
}) {
  const modelName = pair.node1.hardwareModel?.name

  return (
    <div style={{ position: 'relative' }}>
      {modelName ? <HardwareModelCornerBadge name={modelName} roundedTopLeft={false} /> : null}
      <NavLink
        label={pairLabel(pair)}
        description={
          <Stack gap={2}>
            <span>{pairSerialLabel(pair)}</span>
            {pair.tags.length > 0 ? (
              <Group gap={2}>
                {pair.tags.map((tag) => (
                  <Badge
                    key={tag}
                    size="xs"
                    variant="filled"
                    color={getTagColor(tag)}
                    style={{ fontSize: 9 }}
                  >
                    {getTagLabel(tag)}
                  </Badge>
                ))}
              </Group>
            ) : null}
          </Stack>
        }
        active={selected}
        onClick={onToggle}
        styles={{
          root: {
            paddingTop: modelName ? 20 : undefined,
          },
        }}
      />
    </div>
  )
}

function HAPairCard({
  pair,
  action,
  actionLabel,
  tagsEditor,
  onRefreshCapacity,
  isRefreshing,
  node1Workloads,
  node2Workloads,
  node1WorkloadsLoading,
  node2WorkloadsLoading,
}: {
  pair: HAPair | SavedHAPair
  action?: () => void
  actionLabel?: string
  tagsEditor?: ReactNode
  onRefreshCapacity?: () => void
  isRefreshing?: boolean
  node1Workloads?: WorkloadsSummary | null
  node2Workloads?: WorkloadsSummary | null
  node1WorkloadsLoading?: boolean
  node2WorkloadsLoading?: boolean
}) {
  const { node1, node2 } = pair

  return (
    <Card withBorder radius="md" shadow="sm" p="sm" style={{ position: 'relative' }}>
      {node1.hardwareModel?.name ? (
        <HardwareModelCornerBadge name={node1.hardwareModel.name} />
      ) : null}
      
      <Stack gap="sm" pt={node1.hardwareModel?.name ? 'sm' : 0}>
        {/* Two nodes side by side */}
        <div style={{ display: 'flex', gap: 'var(--mantine-spacing-md)', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 50%', minWidth: 0 }}>
            <NodeInfo
              node={node1}
              label="Node 1"
              workloads={node1Workloads}
              workloadsLoading={node1WorkloadsLoading}
            />
          </div>
          <Divider orientation="vertical" />
          <div style={{ flex: '1 1 50%', minWidth: 0 }}>
            <NodeInfo
              node={node2}
              label="Node 2"
              workloads={node2Workloads}
              workloadsLoading={node2WorkloadsLoading}
            />
          </div>
        </div>

        {node1.customerGroup ? (
          <Group gap={4} wrap="wrap">
            <Badge size="xs" color="cyan">{node1.customerGroup}</Badge>
          </Group>
        ) : null}

        {node2 === null && 'partner' in node1 && node1.partner ? (
          <Text size="xs" c="orange">
            Partner information incomplete — some details may be inferred.
          </Text>
        ) : null}

        {/* Controls area */}
        <Divider />
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ flex: 1, minWidth: 0 }}>
            {tagsEditor}
          </div>
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            {onRefreshCapacity ? (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="blue"
                aria-label="Refresh capacity"
                onClick={onRefreshCapacity}
                loading={isRefreshing}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            ) : null}
            {action ? (
              actionLabel ? (
                <Button size="xs" variant="light" onClick={action}>
                  {actionLabel}
                </Button>
              ) : (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label="Remove saved HA pair"
                  onClick={action}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              )
            ) : null}
          </Group>
        </Group>
      </Stack>
    </Card>
  )
}

function App() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const [tokenModalOpened, { open: openTokenModal, close: closeTokenModal }] =
    useDisclosure(false)
  const browserDataInputRef = useRef<HTMLInputElement>(null)
  const [browserDataError, setBrowserDataError] = useState<string | null>(null)
  const [token, setToken] = useLocalStorage({
    key: 'aiq-system-organizer-token',
    defaultValue: '',
    getInitialValueInEffect: false,
  })
  const [refreshToken, setRefreshToken] = useLocalStorage({
    key: 'aiq-system-organizer-refresh-token',
    defaultValue: '',
    getInitialValueInEffect: false,
  })
  const [draftRefreshToken, setDraftRefreshToken] = useState(refreshToken)
  const [savedPairs, setSavedPairs] = useLocalStorage<SavedHAPair[]>({
    key: 'aiq-system-organizer-pairs',
    defaultValue: [],
    getInitialValueInEffect: false,
  })
  const [nagpMappings, setNagpMappings] = useLocalStorage<Record<string, string>>({
    key: 'aiq-system-organizer-nagp-mappings',
    defaultValue: {},
  })
  const [metricsTagFilter, setMetricsTagFilter] = useLocalStorage<string[]>({
    key: 'aiq-system-organizer-metrics-tag-filter',
    defaultValue: [],
    getInitialValueInEffect: false,
  })
  const [selectedPairKeys, setSelectedPairKeys] = useLocalStorage<string[]>({
    key: 'aiq-system-organizer-metrics-selected-pairs',
    defaultValue: [],
    getInitialValueInEffect: false,
  })
  const [activeTab, setActiveTab] = useState<TabValue>(() => getTabFromLocation())
  const [searchForm, setSearchForm] = useState<SearchForm>(emptySearchForm)
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [watchlistsError, setWatchlistsError] = useState<string | null>(null)
  const [isWatchlistsLoading, setIsWatchlistsLoading] = useState(() => Boolean(refreshToken))
  const [savedSystemsFilter, setSavedSystemsFilter] = useState('')
  const [pairPendingRemoval, setPairPendingRemoval] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResultState>({
    pairs: [],
    totalCount: 0,
    siteFilterWasClientSide: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResultTags, setSearchResultTags] = useState<Map<string, string[]>>(new Map())
  const [performanceData, setPerformanceData] = useState<Map<string, ChartDataPoint[]>>(new Map())
  const [performanceLoading, setPerformanceLoading] = useState<Set<string>>(new Set())
  const [performanceError, setPerformanceError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState('7')
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null)
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null)
  const [searchPage, setSearchPage] = useState(1)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [stackLines, setStackLines] = useState(true)
  const [stackedGraphs, setStackedGraphs] = useState<Record<string, boolean>>({
    node_protocol_iops: true,
    node_network_throughput: true,
  })
  const [showHeadroom, setShowHeadroom] = useState(false)
  const [refreshingCapacity, setRefreshingCapacity] = useState<Set<string>>(new Set())
  const [workloadsData, setWorkloadsData] = useState<Map<string, WorkloadsSummary>>(new Map())
  const [workloadsLoading, setWorkloadsLoading] = useState<Set<string>>(new Set())
  const workloadsLoadingRef = useRef(new Set<string>())

  const lastFetchedDates = useRef<{ startDateStr: string; endDateStr: string } | null>(null)
  const hasRestoredSelection = useRef(false)
  const searchGenerationRef = useRef(0)

  const tokenRef = useRef(token)
  const pendingTokenRequestRef = useRef<Promise<string> | null>(null)

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  useEffect(() => {
    if (!refreshToken) {
      return
    }

    let isCancelled = false

    async function loadWatchlists() {
      setIsWatchlistsLoading(true)
      setWatchlistsError(null)

      try {
        let accessToken = tokenRef.current
        if (!accessToken) {
          accessToken = await refreshAccessToken(refreshToken)
          tokenRef.current = accessToken
          setToken(accessToken)
        }

        let nextWatchlists: Watchlist[]
        try {
          nextWatchlists = await fetchWatchlists(accessToken)
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (!message.includes('HTTP 401')) throw error

          accessToken = await refreshAccessToken(refreshToken)
          tokenRef.current = accessToken
          setToken(accessToken)
          nextWatchlists = await fetchWatchlists(accessToken)
        }

        if (!isCancelled) {
          setWatchlists(
            nextWatchlists.sort(
              (a, b) =>
                Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
            ),
          )
        }
      } catch (error) {
        if (!isCancelled) {
          setWatchlists([])
          setWatchlistsError(
            error instanceof Error ? error.message : 'Failed to load watchlists.',
          )
        }
      } finally {
        if (!isCancelled) setIsWatchlistsLoading(false)
      }
    }

    void loadWatchlists()
    return () => {
      isCancelled = true
    }
  }, [refreshToken, setToken])

  // Concurrent callers join the pending request instead of each asking the API for its own token.
  const requestAccessToken = () => {
    if (!refreshToken) {
      return Promise.reject(new Error('No refresh token configured.'))
    }
    if (!pendingTokenRequestRef.current) {
      pendingTokenRequestRef.current = (async () => {
        try {
          const newToken = await refreshAccessToken(refreshToken)
          tokenRef.current = newToken
          setToken(newToken)
          return newToken
        } finally {
          pendingTokenRequestRef.current = null
        }
      })()
    }
    return pendingTokenRequestRef.current
  }

  const getAccessToken = async () => tokenRef.current || requestAccessToken()

  // Another caller may have already replaced the token that failed; reuse theirs when so.
  const renewAccessToken = async (failedToken: string) => {
    if (tokenRef.current && tokenRef.current !== failedToken) return tokenRef.current
    return requestAccessToken()
  }

  useEffect(() => {
    const handlePopState = () => setActiveTab(getTabFromLocation())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function handleTabChange(value: string | null) {
    if (!isTabValue(value)) {
      return
    }
    setActiveTab(value)
    const url = new URL(window.location.href)
    url.pathname = `/${value}`
    window.history.pushState(null, '', url)
  }

  useEffect(() => {
    const normalizedPairs = savedPairs.map((pair) => {
      const normalizedTags = normalizeTags(pair.tags, getAutomaticTagsForPair(pair))
      return normalizedTags.length === pair.tags.length &&
        normalizedTags.every((tag, index) => tag === pair.tags[index])
        ? pair
        : { ...pair, tags: normalizedTags }
    })

    if (normalizedPairs.some((pair, index) => pair !== savedPairs[index])) {
      setSavedPairs(normalizedPairs)
    }
  }, [savedPairs, setSavedPairs])

  const savedPairMap = useMemo(
    () => new Map(savedPairs.map((pair) => [pair.key, pair])),
    [savedPairs],
  )
  const selectedPairKeySet = useMemo(() => new Set(selectedPairKeys), [selectedPairKeys])

  useEffect(() => {
    const validKeys = new Set(savedPairs.map((pair) => pair.key))
    const next = selectedPairKeys.filter((key) => validKeys.has(key))
    if (next.length !== selectedPairKeys.length) {
      setSelectedPairKeys(next)
    }
  }, [savedPairs, selectedPairKeys, setSelectedPairKeys])
  const allTags = useMemo(
    () =>
      Array.from(
        new Set(savedPairs.flatMap((pair) => pair.tags).map((tag) => tag.trim()).filter(Boolean)),
      ).sort(compareTags),
    [savedPairs],
  )
  const tagOptions = useMemo(
    () =>
      allTags.map((tag) => ({
        value: tag,
        label: getTagLabel(tag),
      })),
    [allTags],
  )
  const filteredSavedPairs = useMemo(() => {
    if (!savedSystemsFilter.trim()) {
      return savedPairs
    }

    const searchTerm = savedSystemsFilter.toLowerCase().trim()
    return savedPairs.filter((pair) => {
      // Check tags
      if (pair.tags.some((tag) => {
        const label = getTagLabel(tag).toLowerCase()
        return label.includes(searchTerm) || tag.toLowerCase().includes(searchTerm)
      })) {
        return true
      }
      // Check node1 hostname and serial
      if (pair.node1.hostName?.toLowerCase().includes(searchTerm) ||
          pair.node1.serialNumber.toLowerCase().includes(searchTerm)) {
        return true
      }
      // Check node2 hostname and serial
      if (pair.node2?.hostName?.toLowerCase().includes(searchTerm) ||
          pair.node2?.serialNumber.toLowerCase().includes(searchTerm)) {
        return true
      }
      return false
    })
  }, [savedPairs, savedSystemsFilter])

  const sortedSavedPairs = useMemo(
    () =>
      [...savedPairs].sort((a, b) => pairLabel(a).localeCompare(pairLabel(b))),
    [savedPairs],
  )

  const metricsVisiblePairs = useMemo(() => {
    if (metricsTagFilter.length === 0) return sortedSavedPairs
    return sortedSavedPairs.filter((pair) =>
      metricsTagFilter.every((tag) => pair.tags.includes(tag)),
    )
  }, [sortedSavedPairs, metricsTagFilter])

  const filteredSearchResults = useMemo(() => {
    if (!showSavedOnly) return results.pairs
    return results.pairs.filter((pair) => savedPairMap.has(pair.key))
  }, [results.pairs, showSavedOnly, savedPairMap])

  const RESULTS_PER_PAGE = 20
  const totalPages = Math.ceil(filteredSearchResults.length / RESULTS_PER_PAGE)
  const paginatedSearchResults = useMemo(() => {
    const start = (searchPage - 1) * RESULTS_PER_PAGE
    return filteredSearchResults.slice(start, start + RESULTS_PER_PAGE)
  }, [filteredSearchResults, searchPage])

  const consolidatedPerformanceData = useMemo(() => {
    const result = new Map<string, ChartDataPoint[]>()
    for (const graph of PERFORMANCE_GRAPHS) {
      const datasets: Array<{ data: ChartDataPoint[]; nodeLabel: string }> = []
      for (const pairKey of selectedPairKeys) {
        const pair = savedPairMap.get(pairKey)
        if (!pair) continue
        const d1 = performanceData.get(`${pair.node1.serialNumber}::${graph.name}`)
        if (d1 && d1.length > 0) {
          const nodeLabel = pair.node1.hostName || pair.node1.serialNumber
          datasets.push({ data: d1, nodeLabel })
        }
        if (pair.node2) {
          const d2 = performanceData.get(`${pair.node2.serialNumber}::${graph.name}`)
          if (d2 && d2.length > 0) {
            const nodeLabel = pair.node2.hostName || pair.node2.serialNumber
            datasets.push({ data: d2, nodeLabel })
          }
        }
      }
      result.set(graph.name, lttbDownsample(consolidateChartDataPerNode(datasets), CHART_MAX_POINTS))
    }
    return result
  }, [performanceData, selectedPairKeys, savedPairMap])

  const onlySiteFilterIsUsed =
    results.siteFilterWasClientSide &&
    !normalizeValue(searchForm.customer) &&
    normalizeValue(searchForm.query).length > 0

  const handleFieldChange = (field: keyof SearchForm, value: string) => {
    setSearchForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleTokenSave = () => {
    // Clean token - remove all whitespace including newlines
    setRefreshToken(draftRefreshToken.replace(/\s/g, ''))
    // Clear any existing access token - it will be fetched when needed
    tokenRef.current = ''
    setToken('')
    closeTokenModal()
  }

  const handleBrowserDataExport = () => {
    const data = Object.fromEntries(
      Array.from({ length: window.localStorage.length }, (_, index) => {
        const key = window.localStorage.key(index)
        return key && isBrowserDataKey(key) ? [key, window.localStorage.getItem(key) ?? ''] : null
      }).filter((entry): entry is [string, string] => entry !== null),
    )
    const browserData: BrowserDataExport = {
      format: BROWSER_DATA_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    }
    const downloadUrl = URL.createObjectURL(
      new Blob([JSON.stringify(browserData, null, 2)], { type: 'application/json' }),
    )
    const downloadLink = document.createElement('a')
    downloadLink.href = downloadUrl
    downloadLink.download = BROWSER_DATA_FILENAME
    downloadLink.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const handleBrowserDataImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) {
      return
    }

    try {
      const parsedData: unknown = JSON.parse(await file.text())
      if (!isBrowserDataExport(parsedData)) {
        throw new Error('The selected file is not a valid AIQ Perf Navigator backup.')
      }

      const shouldImport = window.confirm(
        'Importing this backup will replace browser data, including saved systems and tokens. Continue?',
      )
      if (!shouldImport) {
        return
      }

      Object.keys(window.localStorage)
        .filter(isBrowserDataKey)
        .forEach((key) => window.localStorage.removeItem(key))
      Object.entries(parsedData.data).forEach(([key, value]) => {
        window.localStorage.setItem(key, value)
      })
      window.location.reload()
    } catch (error) {
      setBrowserDataError(
        error instanceof Error ? error.message : 'The browser data import failed.',
      )
    }
  }

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const query = normalizeValue(searchForm.query)
    const customer = normalizeValue(searchForm.customer)
    const watchlist = normalizeValue(searchForm.watchlist)
    
    if (!query && !customer && !watchlist) {
      setSearchError('Enter a search term or select a NAGP or watchlist.')
      return
    }

    if (!refreshToken) {
      setSearchError('Set a refresh token first with the key button in the toolbar.')
      return
    }

    const generation = ++searchGenerationRef.current
    setIsLoading(true)
    setSearchError(null)
    setSearchPage(1)

    try {
      let accessToken: string
      try {
        accessToken = await getAccessToken()
      } catch (error) {
        if (generation !== searchGenerationRef.current) return
        setSearchError(
          error instanceof Error
            ? `Failed to get access token: ${error.message}`
            : 'Failed to get access token.',
        )
        return
      }

      try {
        const nextResults = await searchSystems(accessToken, searchForm)
        if (generation !== searchGenerationRef.current) return
        setResults(nextResults)
      } catch (error) {
        if (generation !== searchGenerationRef.current) return
        console.error('Search error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Search failed with unknown error.'

        // On 401 or token expiration, try refreshing the access token and retry
        const isTokenExpired = errorMessage.includes('401') ||
          errorMessage.toLowerCase().includes('token is expired') ||
          errorMessage.toLowerCase().includes('expired token')

        if (isTokenExpired) {
          try {
            const newAccessToken = await renewAccessToken(accessToken)

            const nextResults = await searchSystems(newAccessToken, searchForm)
            if (generation !== searchGenerationRef.current) return
            setResults(nextResults)
            return
          } catch (refreshError) {
            if (generation !== searchGenerationRef.current) return
            setSearchError(
              refreshError instanceof Error
                ? `Token refresh failed: ${refreshError.message}`
                : 'Token refresh failed.',
            )
          }
        } else if (errorMessage.includes('429')) {
          setSearchError('Rate exceeded, please wait 5 minutes.')
        } else {
          setSearchError(errorMessage)
        }

        setResults({
          pairs: [],
          totalCount: 0,
          siteFilterWasClientSide: false,
        })
      }
    } finally {
      if (generation === searchGenerationRef.current) {
        setIsLoading(false)
      }
    }
  }

  const handleSavePair = async (pair: HAPair, tags?: string[]) => {
    let node2 = pair.node2

    // If partner not in search results, try to fetch it
    if (!node2 && pair.node1.partner?.serialNumber) {
      let accessToken = ''
      try {
        accessToken = await getAccessToken()
      } catch {
        // Continue without fetching partner
      }
      if (accessToken) {
        try {
          const partners = await fetchSystemsForQuery(
            accessToken,
            EMPTY_SEARCH_SCOPE,
            'serialNumber',
            pair.node1.partner.serialNumber,
          )
          if (partners.length > 0) node2 = partners[0]
        } catch {
          // Continue without partner
        }
      }
    }

    const [node1, enrichedNode2] = addClusterNameToNodes(pair.node1, node2)

    setSavedPairs((current) => {
      const existing = current.find((entry) => entry.key === pair.key)
      const automaticTags = getAutomaticTagsForPair(pair)
      const nextTags = normalizeTags(tags ?? existing?.tags ?? [], automaticTags)
      const nextPair: SavedHAPair = {
        key: pair.key,
        node1,
        node2: enrichedNode2,
        savedAt: existing?.savedAt ?? new Date().toISOString(),
        tags: nextTags,
      }
      if (existing) {
        return current.map((entry) => (entry.key === existing.key ? nextPair : entry))
      }
      return [nextPair, ...current]
    })
  }

  const pairPendingRemovalLabel = (() => {
    if (!pairPendingRemoval) return ''
    const pair = savedPairs.find((entry) => entry.key === pairPendingRemoval)
    return pair?.node1.hostName || pair?.node1.serialNumber || pairPendingRemoval
  })()

  const handleRemovePair = (key: string) => {
    setPairPendingRemoval(key)
  }

  const confirmRemovePair = () => {
    const key = pairPendingRemoval
    setPairPendingRemoval(null)
    if (!key) {
      return
    }
    setSavedPairs((current) => current.filter((entry) => entry.key !== key))
  }

  const handleDeleteNagp = (nagpId: string) => {
    setNagpMappings((current) => {
      const next = { ...current }
      delete next[nagpId]
      return next
    })
  }

  const handleTagsChange = (key: string, tags: string[]) => {
    setSavedPairs((current) =>
      current.map((pair) =>
        pair.key === key
          ? {
              ...pair,
              tags: normalizeTags(tags, getAutomaticTagsForPair(pair)),
            }
          : pair,
      ),
    )
  }

  const handleMetricsTagFilterChange = (value: string[]) => {
    setMetricsTagFilter(value)
    setSelectedPairKeys([])
    setPerformanceData(new Map())
  }

  // A capacity refresh fetches the token and systems before volumes start loading, so treat the
  // whole refresh as pending to keep the volume skeletons on screen from the first render.
  const isNodeWorkloadsLoading = (pairKey: string, systemId?: string | null) =>
    refreshingCapacity.has(pairKey) || (systemId ? workloadsLoading.has(systemId) : false)

  const loadWorkloadsIfNeeded = async (accessToken: string, systemId: string) => {
    if (workloadsData.has(systemId) || workloadsLoadingRef.current.has(systemId)) return

    workloadsLoadingRef.current.add(systemId)
    setWorkloadsLoading((current) => new Set(current).add(systemId))
    try {
      const workloads = await fetchWorkloads(accessToken, systemId)
      if (workloads) {
        setWorkloadsData((current) => new Map(current).set(systemId, workloads))
      }
    } finally {
      workloadsLoadingRef.current.delete(systemId)
      setWorkloadsLoading((current) => {
        const next = new Set(current)
        next.delete(systemId)
        return next
      })
    }
  }

  const handleRefreshCapacity = async (pairKey: string) => {
    if (!refreshToken) return

    const pair = savedPairMap.get(pairKey)
    if (!pair) return

    setRefreshingCapacity((current) => new Set([...current, pairKey]))

    const doFetch = async (accessToken: string) => {
      const node1Systems = await fetchSystemsForQuery(
        accessToken,
        EMPTY_SEARCH_SCOPE,
        'serialNumber',
        pair.node1.serialNumber,
      )

      let node2Systems: SystemSummary[] = []
      if (pair.node2) {
        node2Systems = await fetchSystemsForQuery(
          accessToken,
          EMPTY_SEARCH_SCOPE,
          'serialNumber',
          pair.node2.serialNumber,
        )
      }

      setSavedPairs((current) =>
        current.map((p) => {
          if (p.key !== pairKey) return p
          const updatedNode1 = node1Systems.length > 0
            ? {
                ...p.node1,
                capacity: node1Systems[0].capacity,
                monthlyCapacity: node1Systems[0].monthlyCapacity,
              }
            : p.node1
          const updatedNode2 = p.node2 && node2Systems.length > 0
            ? {
                ...p.node2,
                capacity: node2Systems[0].capacity,
                monthlyCapacity: node2Systems[0].monthlyCapacity,
              }
            : p.node2
          return { ...p, node1: updatedNode1, node2: updatedNode2 }
        }),
      )

      if (pair.node1.systemId) {
        await loadWorkloadsIfNeeded(accessToken, pair.node1.systemId)
      }
      if (pair.node2?.systemId) {
        await loadWorkloadsIfNeeded(accessToken, pair.node2.systemId)
      }
    }

    try {
      const accessToken = await getAccessToken()

      try {
        await doFetch(accessToken)
      } catch (error) {
        const msg = error instanceof Error ? error.message : ''
        const isExpired =
          msg.includes('401') ||
          msg.toLowerCase().includes('token is expired') ||
          msg.toLowerCase().includes('expired token')

        if (isExpired) {
          const newToken = await renewAccessToken(accessToken)
          await doFetch(newToken)
        } else {
          throw error
        }
      }
    } catch (error) {
      console.error('Failed to refresh capacity:', error)
    } finally {
      setRefreshingCapacity((current) => {
        const next = new Set(current)
        next.delete(pairKey)
        return next
      })
    }
  }

  const handleLoadPerformanceData = async (node: SystemSummary, graphName: string, startDateStr: string, endDateStr: string) => {
    if (!refreshToken) {
      setPerformanceError('Set a refresh token first with the key button in the toolbar.')
      return
    }

    let accessToken: string
    try {
      accessToken = await getAccessToken()
    } catch (error) {
      setPerformanceError(
        error instanceof Error
          ? `Failed to get access token: ${error.message}`
          : 'Failed to get access token.',
      )
      return
    }

    const cacheKey = `${node.serialNumber}::${graphName}`
    setPerformanceLoading((current) => new Set([...current, cacheKey]))
    setPerformanceError(null)

    // Fetch cluster data if not available
    let nodeWithCluster = node
    if (!node.cluster) {
      try {
        const cluster = await fetchClusterForSystem(accessToken, node.serialNumber)
        if (cluster) {
          nodeWithCluster = { ...node, cluster }
        }
      } catch {
        // Continue without cluster
      }
    }

    try {
      const data = await fetchPerformanceData(
        accessToken,
        graphName,
        nodeWithCluster,
        startDateStr,
        endDateStr,
      )

      const bucketAggr = BUCKET_AGGREGATION[graphName] ?? 'average'
      const chartData = smoothChartData(transformPerformanceData(data, bucketAggr))
      setPerformanceData((current) => new Map(current).set(cacheKey, chartData))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load performance data.'

      const isTokenExpired =
        errorMessage.includes('401') ||
        errorMessage.toLowerCase().includes('token is expired') ||
        errorMessage.toLowerCase().includes('expired token')

      if (isTokenExpired) {
        try {
          const newAccessToken = await renewAccessToken(accessToken)

          const data = await fetchPerformanceData(
            newAccessToken,
            graphName,
            nodeWithCluster,
            startDateStr,
            endDateStr,
          )

          const bucketAggr = BUCKET_AGGREGATION[graphName] ?? 'average'
          const chartData = smoothChartData(transformPerformanceData(data, bucketAggr))
          setPerformanceData((current) => new Map(current).set(cacheKey, chartData))
          setPerformanceError(null)
        } catch (refreshError) {
          const refreshErrorMsg =
            refreshError instanceof Error ? refreshError.message : 'Unknown error'
          const isStillTokenError =
            refreshErrorMsg.includes('401') ||
            refreshErrorMsg.toLowerCase().includes('token is expired') ||
            refreshErrorMsg.toLowerCase().includes('expired token')

          setPerformanceError(
            isStillTokenError
              ? 'Authentication failed. Check that your refresh token has access to performance data.'
              : `After token refresh: ${refreshErrorMsg}`,
          )
        }
      } else {
        setPerformanceError(errorMessage)
      }
    } finally {
      setPerformanceLoading((current) => {
        const next = new Set(current)
        next.delete(cacheKey)
        return next
      })
    }
  }

  const computeDateStrings = () => {
    const toDate = (d: Date | null) => (d ? new Date(+d) : null)
    const endDate = toDate(customEndDate) ?? new Date()
    const startDate = toDate(customStartDate) ?? (() => {
      const d = new Date(endDate)
      d.setDate(d.getDate() - Number.parseInt(dateRange, 10))
      return d
    })()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return { startDateStr: fmt(startDate), endDateStr: fmt(endDate) }
  }

  const applySelectedPairKeys = (nextKeys: string[]) => {
    const nextSet = new Set(nextKeys)
    setSelectedPairKeys([...nextSet])

    const { startDateStr, endDateStr } = computeDateStrings()
    for (const key of nextSet) {
      if (selectedPairKeySet.has(key)) continue
      const pair = savedPairMap.get(key)
      if (!pair) continue
      void handleRefreshCapacity(key)
      for (const graph of PERFORMANCE_GRAPHS) {
        void handleLoadPerformanceData(pair.node1, graph.name, startDateStr, endDateStr)
        if (pair.node2) void handleLoadPerformanceData(pair.node2, graph.name, startDateStr, endDateStr)
      }
    }

    setPerformanceData((currentData) => {
      const nextData = new Map(currentData)
      for (const key of selectedPairKeys) {
        if (nextSet.has(key)) continue
        const pair = savedPairMap.get(key)
        if (!pair) continue
        for (const graph of PERFORMANCE_GRAPHS) {
          nextData.delete(`${pair.node1.serialNumber}::${graph.name}`)
          if (pair.node2) nextData.delete(`${pair.node2.serialNumber}::${graph.name}`)
        }
      }
      return nextData
    })
  }

  const handleTogglePairSelection = (pairKey: string) => {
    applySelectedPairKeys(
      selectedPairKeySet.has(pairKey)
        ? selectedPairKeys.filter((key) => key !== pairKey)
        : [...selectedPairKeys, pairKey],
    )
  }

  useEffect(() => {
    if (selectedPairKeys.length === 0 || !refreshToken) return
    if ((customStartDate !== null) !== (customEndDate !== null)) return
    const { startDateStr, endDateStr } = computeDateStrings()
    if (lastFetchedDates.current?.startDateStr === startDateStr && lastFetchedDates.current?.endDateStr === endDateStr) return
    lastFetchedDates.current = { startDateStr, endDateStr }
    setPerformanceData(new Map())
    setPerformanceLoading(new Set())
    for (const pairKey of selectedPairKeys) {
      const pair = savedPairMap.get(pairKey)
      if (!pair) continue
      for (const graph of PERFORMANCE_GRAPHS) {
        void handleLoadPerformanceData(pair.node1, graph.name, startDateStr, endDateStr)
        if (pair.node2) void handleLoadPerformanceData(pair.node2, graph.name, startDateStr, endDateStr)
      }
    }
  }, [dateRange, customStartDate, customEndDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // The refresh token and saved pairs are read from storage after mount, so the
  // persisted selection can only be restored once both are available.
  useEffect(() => {
    if (hasRestoredSelection.current) return
    if (!refreshToken || savedPairs.length === 0 || selectedPairKeys.length === 0) return
    hasRestoredSelection.current = true

    const { startDateStr, endDateStr } = computeDateStrings()
    lastFetchedDates.current = { startDateStr, endDateStr }
    for (const pairKey of selectedPairKeys) {
      const pair = savedPairMap.get(pairKey)
      if (!pair) continue
      void handleRefreshCapacity(pairKey)
      for (const graph of PERFORMANCE_GRAPHS) {
        void handleLoadPerformanceData(pair.node1, graph.name, startDateStr, endDateStr)
        if (pair.node2) void handleLoadPerformanceData(pair.node2, graph.name, startDateStr, endDateStr)
      }
    }
  }, [refreshToken, savedPairs, selectedPairKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <input
        ref={browserDataInputRef}
        type="file"
        accept=".aiq,application/json"
        hidden
        onChange={handleBrowserDataImport}
      />
      <Modal
        opened={browserDataError !== null}
        onClose={() => setBrowserDataError(null)}
        title="Browser data import"
        centered
      >
        <Alert color="red" title="Import failed">
          {browserDataError}
        </Alert>
      </Modal>
      <Modal
        opened={pairPendingRemoval !== null}
        onClose={() => setPairPendingRemoval(null)}
        title="Remove saved HA pair"
        centered
      >
        <Stack>
          <Text size="sm">
            Remove{' '}
            <Text span fw={600}>
              {pairPendingRemovalLabel}
            </Text>{' '}
            from your saved HA pairs?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPairPendingRemoval(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmRemovePair}>
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={tokenModalOpened}
        onClose={closeTokenModal}
        title="Authentication"
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">
            The refresh token is stored locally in this browser and used to obtain access tokens
            from {TOKEN_REFRESH_URL}. Access tokens are fetched automatically when needed.
          </Text>
          <PasswordInput
            label="Refresh token"
            placeholder="Paste your refresh token"
            description="JWE token used to obtain access tokens (4-5 segment format)"
            value={draftRefreshToken}
            onChange={(event) => setDraftRefreshToken(event.currentTarget.value)}
          />
          {draftRefreshToken && draftRefreshToken.trim().split('.').length < 4 ? (
            <Alert color="yellow" title="Warning">
              Refresh tokens should be in JWE format with 4-5 segments separated by dots. The current
              token has {draftRefreshToken.trim().split('.').length} segments. Make sure you copied
              the entire token correctly.
            </Alert>
          ) : null}
          <Group justify="space-between">
            <Button
              variant="default"
              onClick={() => {
                setDraftRefreshToken('')
              }}
            >
              Clear draft
            </Button>
            <Group>
              {refreshToken ? (
                <Button
                  variant="default"
                  color="red"
                  onClick={() => {
                    tokenRef.current = ''
                    setToken('')
                    setRefreshToken('')
                    setDraftRefreshToken('')
                    setWatchlists([])
                    setWatchlistsError(null)
                    setIsWatchlistsLoading(false)
                  }}
                >
                  Remove token
                </Button>
              ) : null}
              <Button onClick={handleTokenSave}>Save token</Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      <AppShell header={{ height: 72 }} padding="lg">
        <AppShell.Header>
          <Container size="xl" h="100%">
            <Group justify="space-between" align="center" h="100%">
              <div>
                <Title order={2}>AIQ Perf Navigator</Title>
              </div>

              <Group gap="sm">
                <Tooltip label={`Appearance: ${COLOR_SCHEME_LABELS[colorScheme]}`}>
                  <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label={`Appearance: ${COLOR_SCHEME_LABELS[colorScheme]}. Switch to ${
                      COLOR_SCHEME_LABELS[NEXT_COLOR_SCHEME[colorScheme]]
                    }.`}
                    onClick={() => setColorScheme(NEXT_COLOR_SCHEME[colorScheme])}
                  >
                    {colorScheme === 'auto' ? (
                      <IconDeviceDesktop size={18} />
                    ) : colorScheme === 'dark' ? (
                      <IconMoon size={18} />
                    ) : (
                      <IconSun size={18} />
                    )}
                  </ActionIcon>
                </Tooltip>
                <Menu position="bottom-end" shadow="md" width={210}>
                  <Menu.Target>
                    <ActionIcon
                      variant="default"
                      size="lg"
                      aria-label="Import or export browser data"
                    >
                      <IconDownload size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconUpload size={16} />}
                      onClick={() => browserDataInputRef.current?.click()}
                    >
                      Import browser data
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconDownload size={16} />}
                      onClick={handleBrowserDataExport}
                    >
                      Export browser data
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <Indicator
                  inline
                  color={refreshToken ? 'teal' : 'gray'}
                  disabled={false}
                  label={refreshToken ? 'OK' : '!'}
                  size={16}
                >
                  <ActionIcon
                    variant={refreshToken ? 'filled' : 'default'}
                    size="lg"
                    aria-label="Set refresh token"
                    onClick={() => {
                      setDraftRefreshToken(refreshToken)
                      openTokenModal()
                    }}
                  >
                    <IconKey size={18} />
                  </ActionIcon>
                </Indicator>
              </Group>
            </Group>
          </Container>
        </AppShell.Header>

        <AppShell.Main>
          {!refreshToken && (
            <Container size="sm" py="xl">
              <Stack gap="xl" align="center" mt="xl">
                <Stack gap="xs" align="center">
                  <Title order={2}>Welcome to AIQ Perf Navigator</Title>
                  <Text c="dimmed" ta="center">
                    You need to configure an ActiveIQ refresh token before continuing. Go to the{' '}
                    <Anchor href="https://aiq.netapp.com/api" target="_blank" rel="noopener noreferrer">
                      AIQ website
                    </Anchor>
                    {' '}to generate a token and paste it here.
                  </Text>
                </Stack>
                <Paper withBorder radius="lg" p="lg" style={{ width: '100%' }}>
                  <Stack gap="md">
                    <PasswordInput
                      label="Refresh token"
                      placeholder="Paste your refresh token"
                      description="JWE token used to obtain access tokens (4-5 segment format)"
                      value={draftRefreshToken}
                      onChange={(event) => setDraftRefreshToken(event.currentTarget.value)}
                    />
                    {draftRefreshToken && draftRefreshToken.trim().split('.').length < 4 ? (
                      <Alert color="yellow" title="Warning">
                        Refresh tokens should be in JWE format with 4-5 segments separated by dots. The current
                        token has {draftRefreshToken.trim().split('.').length} segments. Make sure you copied
                        the entire token correctly.
                      </Alert>
                    ) : null}
                    <Button
                      onClick={handleTokenSave}
                      disabled={!draftRefreshToken.trim()}
                      leftSection={<IconKey size={16} />}
                    >
                      Save token
                    </Button>
                  </Stack>
                </Paper>
              </Stack>
            </Container>
          )}
          {refreshToken && (
          <Container size="xl">
            <Stack gap="lg">
              <Tabs value={activeTab} onChange={handleTabChange} keepMounted={false}>
                <Tabs.List>
                  <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
                    Search
                  </Tabs.Tab>
                  <Tabs.Tab value="saved" leftSection={<IconBookmark size={16} />}>
                    Saved systems
                  </Tabs.Tab>
                  <Tabs.Tab value="performance" leftSection={<IconChartLine size={16} />}>
                    Performance
                  </Tabs.Tab>
                  <Tabs.Tab value="capacity" leftSection={<IconDatabase size={16} />}>
                    Capacity
                  </Tabs.Tab>
                  <Tabs.Tab value="customers" leftSection={<IconBuilding size={16} />}>
                    Customers
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="search" pt="md">
                  <Stack gap="lg">
                    {!refreshToken ? (
                      <Alert color="yellow" title="Authentication required">
                        Use the key button in the toolbar to configure your refresh token before searching.
                      </Alert>
                    ) : null}

                    <Paper withBorder radius="lg" p="lg">
                      <form onSubmit={handleSearch}>
                        <Stack gap="md">
                          <SimpleGrid cols={{ base: 1, md: 3 }}>
                            <Select
                              label="NAGP"
                              placeholder="Select NAGP"
                              data={Object.entries(nagpMappings)
                                .map(([nagpId, nagpName]) => ({
                                  value: nagpId,
                                  label: nagpName,
                                }))
                                .sort((a, b) => a.label.localeCompare(b.label))}
                              value={searchForm.customer}
                              onChange={(value) => handleFieldChange('customer', value || '')}
                              clearable
                              searchable
                              withAlignedLabels
                              nothingFoundMessage="No NAGPs stored"
                            />
                            <Select
                              label="Watchlist"
                              placeholder={
                                isWatchlistsLoading ? 'Loading watchlists...' : 'Select watchlist'
                              }
                              data={watchlists.map((watchlist) => ({
                                value: watchlist.id,
                                label: watchlist.isDefault
                                  ? `${watchlist.name} (default)`
                                  : watchlist.name,
                              }))}
                              value={searchForm.watchlist}
                              onChange={(value) => handleFieldChange('watchlist', value || '')}
                              clearable
                              searchable
                              withAlignedLabels
                              disabled={isWatchlistsLoading || !!watchlistsError}
                              error={watchlistsError}
                              rightSection={
                                isWatchlistsLoading ? <Loader size="xs" /> : undefined
                              }
                              rightSectionPointerEvents={isWatchlistsLoading ? 'none' : undefined}
                              nothingFoundMessage="No watchlists found"
                            />
                            <TextInput
                              label="Search"
                              placeholder="Cluster, serial number, system ID, system name, or customer site"
                              value={searchForm.query}
                              onChange={(event) =>
                                handleFieldChange('query', event.currentTarget.value)
                              }
                              withAsterisk
                            />
                          </SimpleGrid>

                          <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                              Searches by cluster name, serial number, system ID, and host name in
                              parallel.
                              NAGP and watchlist filters can be combined. Customer watchlists
                              are expanded via their customer IDs.
                            </Text>
                            <Group>
                              <Button
                                variant="default"
                                onClick={() => {
                                  setSearchForm(emptySearchForm)
                                  setSearchError(null)
                                  setResults({
                                    pairs: [],
                                    totalCount: 0,
                                    siteFilterWasClientSide: false,
                                  })
                                }}
                              >
                                Clear
                              </Button>
                              <Button type="submit" loading={isLoading} leftSection={<IconSearch size={16} />}>
                                Search systems
                              </Button>
                            </Group>
                          </Group>
                        </Stack>
                      </form>
                    </Paper>

                    {searchError ? <Alert color="red">{searchError}</Alert> : null}

                    {results.siteFilterWasClientSide ? (
                      <Alert color="blue" title="Customer site filter">
                        The schema exposes site data on each returned system, but not a dedicated
                        site-name search field on `systems`. The customer-site match is therefore
                        applied client-side to the fetched result set.
                        {onlySiteFilterIsUsed
                          ? ' Using only a customer-site filter may require narrowing the search further if the first page does not contain the expected system.'
                          : ''}
                      </Alert>
                    ) : null}

                    <Group justify="space-between">
                      <div>
                        <Title order={3}>Search results</Title>
                        <Text size="sm" c="dimmed">
                          Showing {filteredSearchResults.length} HA pairs
                          {showSavedOnly ? ' (saved only)' : ` (${results.totalCount} total)`}.
                        </Text>
                      </div>
                      {results.pairs.length > 0 ? (
                        <Switch
                          label="Show saved only"
                          checked={showSavedOnly}
                          onChange={(event) => {
                            setShowSavedOnly(event.currentTarget.checked)
                            setSearchPage(1)
                          }}
                        />
                      ) : null}
                    </Group>

                    {results.pairs.length === 0 ? (
                      <Paper withBorder radius="lg" p="xl">
                        <Text c="dimmed">
                          No systems to show yet. Run a search to populate this view.
                        </Text>
                      </Paper>
                    ) : (
                      <>
                        <Stack gap="md">
                          {groupPairsByCustomer(paginatedSearchResults).map((group, groupIndex) => (
                            <div key={groupIndex}>
                              <CustomerHeader
                                group={group}
                                onSaveNagp={group.nagpId ? () => {
                                  const name = group.nagpName || group.customerName || group.nagpId!
                                  setNagpMappings((current) => ({ ...current, [group.nagpId!]: name }))
                                } : undefined}
                                nagpAlreadySaved={group.nagpId ? !!nagpMappings[group.nagpId] : false}
                              />
                              <Stack gap="xs">
                                {groupPairsByCluster(group.pairs).map((clusterGroup, clusterIndex) => (
                                  <ClusterBlock
                                    key={clusterIndex}
                                    clusterGroup={clusterGroup}
                                    renderPair={(pair) => {
                                      const isSaved = savedPairMap.has(pair.key)
                                      const pairTags = normalizeTags(
                                        searchResultTags.get(pair.key) ?? savedPairMap.get(pair.key)?.tags ?? [],
                                        getAutomaticTagsForPair(pair),
                                      )
                                      return (
                                        <HAPairCard
                                          pair={pair}
                                          action={() => void handleSavePair(pair, pairTags)}
                                          actionLabel={isSaved ? 'Update saved entry' : 'Save HA pair'}
                                          tagsEditor={
                                            <TagsEditor
                                              value={pairTags}
                                              onChange={(value) => setSearchResultTags((curr) => new Map(curr).set(pair.key, value))}
                                              allTags={allTags}
                                            />
                                          }
                                        />
                                      )
                                    }}
                                  />
                                ))}
                              </Stack>
                            </div>
                          ))}
                        </Stack>
                        {totalPages > 1 ? (
                          <Group justify="center">
                            <Pagination
                              total={totalPages}
                              value={searchPage}
                              onChange={setSearchPage}
                            />
                          </Group>
                        ) : null}
                      </>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="saved" pt="md">
                  <Stack gap="lg">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Title order={3}>Saved HA pairs</Title>
                        <Text size="sm" c="dimmed">
                          Saved HA pairs and tags are persisted in local browser storage.
                        </Text>
                      </div>
                      {savedPairs.length > 0 ? (
                        <TextInput
                          placeholder="Filter by tags, node names, or serial numbers"
                          leftSection={<IconSearch size={16} />}
                          value={savedSystemsFilter}
                          onChange={(event) => setSavedSystemsFilter(event.currentTarget.value)}
                          radius="xl"
                          style={{ width: 350 }}
                          rightSection={
                            savedSystemsFilter ? (
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="gray"
                                onClick={() => setSavedSystemsFilter('')}
                              >
                                <IconX size={14} />
                              </ActionIcon>
                            ) : null
                          }
                        />
                      ) : null}
                    </Group>

                    {savedPairs.length === 0 ? (
                      <Paper withBorder radius="lg" p="xl">
                        <Text c="dimmed">
                          Save an HA pair from the search tab to start building tagged collections.
                        </Text>
                      </Paper>
                    ) : (
                      <Stack gap="md">
                        {filteredSavedPairs.length === 0 ? (
                          <Paper withBorder radius="lg" p="xl">
                            <Text c="dimmed">
                              No saved HA pairs match your filter.
                            </Text>
                          </Paper>
                        ) : null}
                        {groupPairsByCustomer(filteredSavedPairs).map((group, groupIndex) => (
                          <div key={groupIndex}>
                            <CustomerHeader group={group} />
                            <Stack gap="xs">
                              {groupPairsByCluster(group.pairs).map((clusterGroup, clusterIndex) => (
                                <ClusterBlock
                                  key={clusterIndex}
                                  clusterGroup={clusterGroup}
                                  renderPair={(pair) => (
                                    <HAPairCard
                                      pair={pair}
                                      action={() => handleRemovePair(pair.key)}
                                      onRefreshCapacity={() => void handleRefreshCapacity(pair.key)}
                                      isRefreshing={refreshingCapacity.has(pair.key)}
                                      node1Workloads={pair.node1.systemId ? workloadsData.get(pair.node1.systemId) ?? null : null}
                                      node2Workloads={pair.node2?.systemId ? workloadsData.get(pair.node2.systemId) ?? null : null}
                                      node1WorkloadsLoading={isNodeWorkloadsLoading(pair.key, pair.node1.systemId)}
                                      node2WorkloadsLoading={isNodeWorkloadsLoading(pair.key, pair.node2?.systemId)}
                                      tagsEditor={
                                        <TagsEditor
                                          value={pair.tags}
                                          onChange={(value) => handleTagsChange(pair.key, value)}
                                          allTags={allTags}
                                        />
                                      }
                                    />
                                  )}
                                />
                              ))}
                            </Stack>
                          </div>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="performance" pt="md">
                  <Stack gap="lg">
                    <div>
                      <Title order={3}>Performance Graphs</Title>
                      <Text size="sm" c="dimmed">
                        View performance metrics for saved systems over time.
                      </Text>
                    </div>

                    {!refreshToken ? (
                      <Alert color="yellow" title="Authentication required">
                        Configure your refresh token to view performance data. The token must have
                        permissions for API Services to access the performance API endpoint.
                      </Alert>
                    ) : null}

                    {savedPairs.length === 0 ? (
                      <Paper withBorder radius="lg" p="xl">
                        <Text c="dimmed">
                          Save HA pairs from the search tab to view their performance metrics.
                        </Text>
                      </Paper>
                    ) : (
                      <div style={{ display: 'flex', gap: 'var(--mantine-spacing-md)', alignItems: 'flex-start', height: 'calc(100vh - 200px)' }}>
                        <Paper withBorder radius="lg" style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div style={{ padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                            <Group justify="space-between" align="flex-start">
                              <div>
                                <Text fw={500} size="sm">HA Pairs</Text>
                                <Text size="xs" c="dimmed">
                                  {metricsVisiblePairs.length}{metricsTagFilter.length > 0 ? ` / ${savedPairs.length}` : ''} saved
                                </Text>
                              </div>
                              {metricsVisiblePairs.length > 0 ? (
                                <Button
                                  size="compact-xs"
                                  variant="light"
                                  onClick={() => {
                                    const allSelected = metricsVisiblePairs.every((p) =>
                                      selectedPairKeySet.has(p.key),
                                    )
                                    applySelectedPairKeys(
                                      allSelected ? [] : metricsVisiblePairs.map((p) => p.key),
                                    )
                                  }}
                                >
                                  {metricsVisiblePairs.every((p) => selectedPairKeySet.has(p.key)) ? 'Clear' : 'Select all'}
                                </Button>
                              ) : null}
                            </Group>
                            <MultiSelect
                              mt="xs"
                              size="xs"
                              placeholder="Filter by tag"
                              data={tagOptions}
                              value={metricsTagFilter}
                              onChange={handleMetricsTagFilterChange}
                              clearable
                              searchable
                              withAlignedLabels
                              nothingFoundMessage="No tags"
                              leftSection={<IconTag size={12} />}
                            />
                          </div>
                          <ScrollArea style={{ flex: 1 }} styles={{ scrollbar: { zIndex: 3 } }}>
                            {groupPairsByCluster(metricsVisiblePairs).map((group, groupIndex) => (
                              <div key={groupIndex}>
                                <div style={{ 
                                  padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
                                  backgroundColor: 'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))',
                                  borderBottom: '1px solid var(--mantine-color-default-border)',
                                  position: 'sticky',
                                  top: 0,
                                  zIndex: 2,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}>
                                  <Text size="xs" fw={600}>
                                    {group.clusterName || 'Unknown'}
                                  </Text>
                                  <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    color="gray"
                                    style={{ border: '1px solid var(--mantine-color-gray-4)' }}
                                    onClick={() => {
                                      const clusterPairKeys = group.pairs.map((p) => p.key)
                                      const allSelected = group.pairs.every((p) =>
                                        selectedPairKeySet.has(p.key),
                                      )
                                      applySelectedPairKeys(
                                        allSelected
                                          ? selectedPairKeys.filter((k) => !clusterPairKeys.includes(k))
                                          : [...new Set([...selectedPairKeys, ...clusterPairKeys])],
                                      )
                                    }}
                                  >
                                    {group.pairs.every((p) => selectedPairKeySet.has(p.key)) ? 'Clear' : 'Select All'}
                                  </Button>
                                </div>
                                {group.pairs.map((pair) => (
                                  <PairSelectionNavLink
                                    key={pair.key}
                                    pair={pair}
                                    selected={selectedPairKeySet.has(pair.key)}
                                    onToggle={() => handleTogglePairSelection(pair.key)}
                                  />
                                ))}
                              </div>
                            ))}
                          </ScrollArea>
                        </Paper>

                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <Stack gap="md">
                            <Group gap="md" align="flex-end" wrap="wrap">
                              <Select
                                label="Time Range"
                                data={[
                                  { value: '7', label: '7 days' },
                                  { value: '14', label: '14 days' },
                                  { value: '30', label: '30 days' },
                                  { value: '90', label: '90 days' },
                                  { value: '365', label: '1 year' },
                                ]}
                                value={customStartDate || customEndDate ? null : dateRange}
                                onChange={(value) => {
                                  setDateRange(value || '7')
                                  setCustomStartDate(null)
                                  setCustomEndDate(null)
                                }}
                                style={{ width: 180 }}
                                disabled={!!(customStartDate || customEndDate)}
                              />
                              <DateTimePicker
                                label="Start"
                                placeholder="Custom start"
                                value={customStartDate}
                                onChange={(v) => setCustomStartDate(v ? new Date(v) : null)}
                                clearable
                                style={{ width: 200 }}
                                maxDate={customEndDate ?? new Date()}
                              />
                              <DateTimePicker
                                label="End"
                                placeholder="Custom end"
                                value={customEndDate}
                                onChange={(v) => setCustomEndDate(v ? new Date(v) : null)}
                                clearable
                                style={{ width: 200 }}
                                minDate={customStartDate ?? undefined}
                                maxDate={new Date()}
                              />
                            </Group>
                            {selectedPairKeys.length > 1 ? (
                              <Switch
                                label="Stack"
                                checked={stackLines}
                                onChange={(event) => {
                                  const stacked = event.currentTarget.checked
                                  setStackLines(stacked)
                                  if (stacked) setShowHeadroom(false)
                                }}
                                size="sm"
                              />
                            ) : null}

                            {selectedPairKeys.length === 0 ? (
                              <Paper withBorder radius="lg" p="xl">
                                <Text c="dimmed" ta="center">
                                  Select one or more HA pairs to view performance graphs
                                </Text>
                              </Paper>
                            ) : !refreshToken ? (
                              <Alert color="yellow" title="Authentication required">
                                Configure your refresh token to view performance data.
                              </Alert>
                            ) : (
                              <ScrollArea style={{ flex: 1 }}>
                                <Stack gap="lg">
                                  {performanceError ? (
                                    <Alert color="red" title="Error loading performance data">
                                      {performanceError}
                                    </Alert>
                                  ) : null}

                                  {PERFORMANCE_GRAPHS.map((graph) => {
                                    const isSinglePair = selectedPairKeys.length === 1
                                    const supportsStacking = ['node_protocol_iops', 'node_network_throughput'].includes(graph.name)
                                    const isGraphStacked = stackedGraphs[graph.name] ?? false
                                    const [singlePairKey] = selectedPairKeys
                                    const singlePair = isSinglePair ? savedPairMap.get(singlePairKey) : null

                                    const rawNode1Data = singlePair
                                      ? lttbDownsample(performanceData.get(`${singlePair.node1.serialNumber}::${graph.name}`) ?? [], CHART_MAX_POINTS)
                                      : null
                                    const rawNode2Data = singlePair?.node2
                                      ? lttbDownsample(performanceData.get(`${singlePair.node2.serialNumber}::${graph.name}`) ?? [], CHART_MAX_POINTS)
                                      : null
                                    const node1Label = singlePair?.node1.hostName || singlePair?.node1.serialNumber
                                    const node2Label = singlePair?.node2
                                      ? (singlePair.node2.hostName || singlePair.node2.serialNumber)
                                      : null

                                    const rawChartData = isSinglePair
                                      ? null
                                      : consolidatedPerformanceData.get(graph.name)
                                    const isLoading = Array.from(selectedPairKeys).some((pairKey) => {
                                      const pair = savedPairMap.get(pairKey)
                                      if (!pair) return false
                                      return (
                                        performanceLoading.has(`${pair.node1.serialNumber}::${graph.name}`) ||
                                        (pair.node2
                                          ? performanceLoading.has(`${pair.node2.serialNumber}::${graph.name}`)
                                          : false)
                                      )
                                    })

                                    const CHART_COLORS = [
                                      'blue.6',
                                      'teal.6',
                                      'orange.6',
                                      'grape.6',
                                      'red.6',
                                      'cyan.6',
                                      'yellow.6',
                                      'indigo.6',
                                    ]

                                    // Transform data keys to human-readable labels
                                    const transformDataKeys = (data: ChartDataPoint[]): ChartDataPoint[] => {
                                      return data.map((point) => {
                                        const transformed: ChartDataPoint = { timestamp: point.timestamp, __epochMs: point.__epochMs }
                                        for (const [key, value] of Object.entries(point)) {
                                          if (key === 'timestamp' || key === '__epochMs') continue
                                          
                                          const separatorIndex = key.indexOf(' – ')
                                          let newKey = key
                                          if (separatorIndex !== -1) {
                                            const metricPart = key.slice(separatorIndex + 3)
                                            const nodePart = key.slice(0, separatorIndex)
                                            const humanReadableMetric = metricPart
                                              .replace('peak_performance', 'Headroom')
                                              .replace('current_utilization', 'CPU Utilization')
                                            newKey = `${nodePart} – ${humanReadableMetric}`
                                          } else {
                                            newKey = key
                                              .replace('peak_performance', 'Headroom')
                                              .replace('current_utilization', 'CPU Utilization')
                                          }
                                          transformed[newKey] = value
                                        }
                                        return transformed
                                      })
                                    }

                                    const buildSeries = (data: ChartDataPoint[]) => {
                                      const keys = Object.keys(data[0]).filter((key) => key !== 'timestamp' && key !== '__epochMs')
                                      
                                      // Filter out Headroom when showHeadroom is false for CPU graph
                                      const filteredKeys = keys.filter((key) => {
                                        if (graph.name === 'node_headroom_cpu_utilization' && !showHeadroom && key.includes('Headroom')) {
                                          return false
                                        }
                                        return true
                                      })
                                      
                                      // Build a map of node prefix -> color index
                                      const nodeColors = new Map<string, number>()
                                      let colorIndex = 0
                                      
                                      for (const key of filteredKeys) {
                                        // Extract node name (everything before " – ")
                                        const separatorIndex = key.indexOf(' – ')
                                        const nodePrefix = separatorIndex !== -1 ? key.slice(0, separatorIndex) : key
                                        
                                        if (!nodeColors.has(nodePrefix)) {
                                          nodeColors.set(nodePrefix, colorIndex++)
                                        }
                                      }
                                      
                                      return filteredKeys.map((key) => {
                                        const isHeadroom = key.includes('Headroom')
                                        
                                        // Get the node prefix to determine color
                                        const separatorIndex = key.indexOf(' – ')
                                        const nodePrefix = separatorIndex !== -1 ? key.slice(0, separatorIndex) : key
                                        const colorIdx = nodeColors.get(nodePrefix) ?? 0
                                        
                                        return {
                                          name: key,
                                          color: CHART_COLORS[colorIdx % CHART_COLORS.length],
                                          strokeDasharray: isHeadroom ? '0 1000' : undefined,
                                          fillOpacity: isHeadroom ? 0.2 : 0,
                                        } as any
                                      })
                                    }

                                    // Transform data keys to human-readable labels
                                    const node1Data = rawNode1Data ? transformDataKeys(rawNode1Data) : null
                                    const node2Data = rawNode2Data ? transformDataKeys(rawNode2Data) : null
                                    const chartData = rawChartData ? transformDataKeys(rawChartData) : null

                                    return (
                                      <Paper key={graph.name} withBorder radius="lg" p="md">
                                        <Stack gap="md">
                                          <Group justify="space-between" align="flex-start">
                                            <div>
                                              <Text fw={500}>{graph.label}</Text>
                                              <Text size="xs" c="dimmed">
                                                {graph.description}
                                              </Text>
                                            </div>
                                            <Group gap="md">
                                              {supportsStacking ? (
                                                <Switch
                                                  label="Stack"
                                                  checked={isGraphStacked}
                                                  onChange={(event) => {
                                                    const stacked = event.currentTarget.checked
                                                    setStackedGraphs((current) => ({
                                                      ...current,
                                                      [graph.name]: stacked,
                                                    }))
                                                  }}
                                                  size="sm"
                                                />
                                              ) : null}
                                              {graph.name === 'node_headroom_cpu_utilization' ? (
                                                <Switch
                                                  label="Show headroom"
                                                  description="Show Headroom metric"
                                                  checked={showHeadroom}
                                                  onChange={(event) => setShowHeadroom(event.currentTarget.checked)}
                                                  size="sm"
                                                  disabled={stackLines && !isSinglePair}
                                                />
                                              ) : null}
                                            </Group>
                                          </Group>

                                          {isSinglePair ? (
                                            <SimpleGrid cols={node2Label ? 2 : 1}>
                                              <Stack gap="xs">
                                                <CopyableText size="sm" fw={500} c="dimmed" textToCopy={node1Label ?? ''}>
                                                  {node1Label}
                                                </CopyableText>
                                                {performanceLoading.has(`${singlePair!.node1.serialNumber}::${graph.name}`) ? (
                                                  <Skeleton h={220} />
                                                ) : node1Data && node1Data.length > 0 ? (
                                                  <AreaChart
                                                    h={220}
                                                    data={node1Data}
                                                    dataKey="timestamp"
                                                    type={isGraphStacked ? 'stacked' : undefined}
                                                    series={buildSeries(node1Data)}
                                                    curveType="monotone"
                                                    strokeWidth={1}
                                                    withGradient={false}
                                                    withLegend
                                                    withTooltip
                                                    withDots={false}
                                                  />
                                                ) : (
                                                  <Text size="sm" c="dimmed" ta="center" py="xl">
                                                    No data available for this metric
                                                  </Text>
                                                )}
                                              </Stack>
                                              {node2Label ? (
                                                <Stack gap="xs">
                                                  <CopyableText size="sm" fw={500} c="dimmed" textToCopy={node2Label}>
                                                    {node2Label}
                                                  </CopyableText>
                                                  {performanceLoading.has(`${singlePair!.node2!.serialNumber}::${graph.name}`) ? (
                                                    <Skeleton h={220} />
                                                  ) : node2Data && node2Data.length > 0 ? (
                                                    <AreaChart
                                                      h={220}
                                                      data={node2Data}
                                                      dataKey="timestamp"
                                                      type={isGraphStacked ? 'stacked' : undefined}
                                                      series={buildSeries(node2Data)}
                                                      curveType="monotone"
                                                      strokeWidth={1}
                                                      withGradient={false}
                                                      withLegend
                                                      withTooltip
                                                      withDots={false}
                                                    />
                                                  ) : (
                                                    <Text size="sm" c="dimmed" ta="center" py="xl">
                                                      No data available for this metric
                                                    </Text>
                                                  )}
                                                </Stack>
                                              ) : null}
                                            </SimpleGrid>
                                          ) : isLoading ? (
                                            <Skeleton h={250} />
                                          ) : chartData && chartData.length > 0 ? (
                                            graph.name === 'node_headroom_cpu_utilization' && stackLines ? (
                                              <AreaChart
                                                h={250}
                                                data={chartData}
                                                dataKey="timestamp"
                                                type="stacked"
                                                strokeWidth={1}
                                                withGradient={false}
                                                series={(() => {
                                                  const keys = Object.keys(chartData[0])
                                                    .filter((key) => key !== 'timestamp' && key !== '__epochMs')
                                                    .filter((key) => {
                                                      // When stacking, only show CPU Utilization metrics
                                                      if (!key.includes('CPU Utilization')) {
                                                        return false
                                                      }
                                                      return true
                                                    })
                                                  const isPerNode = keys.some((key) => key.includes(' – '))
                                                  if (isPerNode) {
                                                    const NODE_COLOR_FAMILIES = [
                                                      ['blue.4', 'blue.7', 'blue.9'],
                                                      ['teal.4', 'teal.7', 'teal.9'],
                                                      ['orange.4', 'orange.7', 'orange.9'],
                                                      ['grape.4', 'grape.7', 'grape.9'],
                                                    ]
                                                    const nodeGroups = new Map<string, string[]>()
                                                    for (const key of keys) {
                                                      const sep = key.indexOf(' – ')
                                                      const prefix = sep !== -1 ? key.slice(0, sep) : key
                                                      if (!nodeGroups.has(prefix)) nodeGroups.set(prefix, [])
                                                      nodeGroups.get(prefix)!.push(key)
                                                    }
                                                    const result: { name: string; color: string }[] = []
                                                    let nodeIndex = 0
                                                    for (const nodeKeys of nodeGroups.values()) {
                                                      const family =
                                                        NODE_COLOR_FAMILIES[nodeIndex % NODE_COLOR_FAMILIES.length]
                                                      nodeKeys.forEach((key) => {
                                                        result.push({ name: key, color: family[0] })
                                                      })
                                                      nodeIndex++
                                                    }
                                                    return result
                                                  }
                                                  return keys.map((key, i) => ({
                                                    name: key,
                                                    color: CHART_COLORS[i % CHART_COLORS.length],
                                                  }))
                                                })()}
                                                curveType="monotone"
                                                withLegend
                                                withTooltip
                                                withDots={false}
                                              />
                                            ) : (
                                              <AreaChart
                                                h={250}
                                                data={chartData}
                                                dataKey="timestamp"
                                                strokeWidth={1}
                                                withGradient={false}
                                                type={isGraphStacked || (stackLines && graph.name === 'node_avg_iops') ? 'stacked' : undefined}
                                                series={(() => {
                                                  const keys = Object.keys(chartData[0])
                                                    .filter((key) => key !== 'timestamp' && key !== '__epochMs')
                                                    .filter((key) => {
                                                      // Filter out Headroom when showHeadroom is false for CPU graph
                                                      if (graph.name === 'node_headroom_cpu_utilization' && !showHeadroom && key.includes('Headroom')) {
                                                        return false
                                                      }
                                                      return true
                                                    })
                                                  const isPerNode = keys.some((key) => key.includes(' – '))
                                                  if (isPerNode) {
                                                    const NODE_COLOR_FAMILIES = [
                                                      ['blue.4', 'blue.7', 'blue.9'],
                                                      ['teal.4', 'teal.7', 'teal.9'],
                                                      ['orange.4', 'orange.7', 'orange.9'],
                                                      ['grape.4', 'grape.7', 'grape.9'],
                                                    ]
                                                    const nodeGroups = new Map<string, string[]>()
                                                    for (const key of keys) {
                                                      const sep = key.indexOf(' – ')
                                                      const prefix = sep !== -1 ? key.slice(0, sep) : key
                                                      if (!nodeGroups.has(prefix)) nodeGroups.set(prefix, [])
                                                      nodeGroups.get(prefix)!.push(key)
                                                    }
                                                    
                                                    const result: Array<{ name: string; color: string; strokeWidth?: number; fillOpacity?: number }> = []
                                                    let nodeIndex = 0
                                                    for (const nodeKeys of nodeGroups.values()) {
                                                      const family = NODE_COLOR_FAMILIES[nodeIndex % NODE_COLOR_FAMILIES.length]
                                                      
                                                      // Use the same base color for both CPU Utilization and Headroom
                                                      // They both get family[0]
                                                      nodeKeys.forEach((key) => {
                                                        const isHeadroom = key.includes('Headroom')
                                                        result.push({
                                                          name: key,
                                                          color: family[0],
                                                          strokeDasharray: isHeadroom ? '0 1000' : undefined,
                                                          fillOpacity: isHeadroom ? 0.2 : 0,
                                                        } as any)
                                                      })
                                                      nodeIndex++
                                                    }
                                                    return result
                                                  }
                                                  return keys.map((key, i) => ({
                                                    name: key,
                                                    color: CHART_COLORS[i % CHART_COLORS.length],
                                                  }))
                                                })()}
                                                curveType="monotone"
                                                withLegend
                                                withTooltip
                                                withDots={false}
                                              />
                                            )
                                          ) : chartData && chartData.length === 0 ? (
                                            <Text size="sm" c="dimmed" ta="center" py="xl">
                                              No data available for this metric
                                            </Text>
                                          ) : null}
                                        </Stack>
                                      </Paper>
                                    )
                                  })}
                                </Stack>
                              </ScrollArea>
                            )}
                          </Stack>
                        </div>
                      </div>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="capacity" pt="md">
                  <Stack gap="lg">
                    <Group justify="space-between" align="flex-end">
                      <div>
                        <Title order={3}>Capacity</Title>
                        <Text size="sm" c="dimmed">
                          View capacity metrics for saved systems.
                        </Text>
                      </div>
                    </Group>

                    {savedPairs.length === 0 ? (
                      <Paper withBorder radius="lg" p="xl">
                        <Text c="dimmed">
                          Save HA pairs from the search tab to view their capacity metrics.
                        </Text>
                      </Paper>
                    ) : (
                      <div style={{ display: 'flex', gap: 'var(--mantine-spacing-md)', alignItems: 'flex-start', height: 'calc(100vh - 200px)' }}>
                        <Paper withBorder radius="lg" style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div style={{ padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                            <Text fw={500} size="sm">HA Pairs</Text>
                            <Text size="xs" c="dimmed">
                              {metricsVisiblePairs.length}{metricsTagFilter.length > 0 ? ` / ${savedPairs.length}` : ''} saved
                            </Text>
                            <MultiSelect
                              mt="xs"
                              size="xs"
                              placeholder="Filter by tag"
                              data={tagOptions}
                              value={metricsTagFilter}
                              onChange={handleMetricsTagFilterChange}
                              clearable
                              searchable
                              withAlignedLabels
                              nothingFoundMessage="No tags"
                              leftSection={<IconTag size={12} />}
                            />
                          </div>
                          <ScrollArea style={{ flex: 1 }} styles={{ scrollbar: { zIndex: 3 } }}>
                            {groupPairsByCluster(metricsVisiblePairs).map((group, groupIndex) => (
                              <div key={groupIndex}>
                                <div style={{
                                  padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
                                  backgroundColor: 'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))',
                                  borderBottom: '1px solid var(--mantine-color-default-border)',
                                  position: 'sticky',
                                  top: 0,
                                  zIndex: 2,
                                }}>
                                  <Text size="xs" fw={600}>
                                    {group.clusterName || 'Unknown'}
                                  </Text>
                                </div>
                                {group.pairs.map((pair) => (
                                  <PairSelectionNavLink
                                    key={pair.key}
                                    pair={pair}
                                    selected={selectedPairKeySet.has(pair.key)}
                                    onToggle={() => handleTogglePairSelection(pair.key)}
                                  />
                                ))}
                              </div>
                            ))}
                          </ScrollArea>
                        </Paper>

                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                          {selectedPairKeySet.size === 0 ? (
                            <Paper withBorder radius="lg" p="xl">
                              <Text c="dimmed" ta="center">
                                Select an HA pair to view capacity details
                              </Text>
                            </Paper>
                          ) : selectedPairKeySet.size === 1 ? (() => {
                            const [pairKey] = selectedPairKeySet
                            const pair = savedPairMap.get(pairKey)
                            if (!pair) return null
                            const node1Workloads = pair.node1.systemId ? workloadsData.get(pair.node1.systemId) ?? null : null
                            const node2Workloads = pair.node2?.systemId ? workloadsData.get(pair.node2.systemId) ?? null : null
                            const areWorkloadsLoading =
                              isNodeWorkloadsLoading(pair.key, pair.node1.systemId) ||
                              isNodeWorkloadsLoading(pair.key, pair.node2?.systemId)
                            const volumeRows = [
                              ...(node1Workloads?.volumes ?? []).map((volume) => ({
                                nodeLabel: pair.node1.hostName || pair.node1.serialNumber,
                                volume,
                              })),
                              ...(node2Workloads?.volumes ?? []).map((volume) => ({
                                nodeLabel: pair.node2!.hostName || pair.node2!.serialNumber,
                                volume,
                              })),
                            ]
                            return (
                              <Stack gap="md">
                                <Paper withBorder radius="lg" p="md">
                                  <CapacityHistoryChart
                                    nodes={pair.node2 ? [pair.node1, pair.node2] : [pair.node1]}
                                    isLoading={refreshingCapacity.has(pair.key)}
                                  />
                                </Paper>
                                <HAPairCard
                                  pair={pair}
                                  onRefreshCapacity={() => void handleRefreshCapacity(pair.key)}
                                  isRefreshing={refreshingCapacity.has(pair.key)}
                                  node1Workloads={node1Workloads}
                                  node2Workloads={node2Workloads}
                                  node1WorkloadsLoading={isNodeWorkloadsLoading(pair.key, pair.node1.systemId)}
                                  node2WorkloadsLoading={isNodeWorkloadsLoading(pair.key, pair.node2?.systemId)}
                                  tagsEditor={
                                    <TagsEditor
                                      value={pair.tags}
                                      onChange={(value) => handleTagsChange(pair.key, value)}
                                      allTags={allTags}
                                    />
                                  }
                                />
                                {volumeRows.length > 0 ? (
                                  <Paper withBorder radius="lg" p="md">
                                    <VolumesTable volumes={volumeRows} />
                                  </Paper>
                                ) : areWorkloadsLoading ? (
                                  <VolumesPanelSkeleton showNodeColumn={Boolean(pair.node2)} />
                                ) : null}
                              </Stack>
                            )
                          })() : (() => {
                            const selectedPairs = Array.from(selectedPairKeySet)
                              .map((k) => savedPairMap.get(k))
                              .filter((p): p is SavedHAPair => p !== undefined)
                            const nodes = selectedPairs.flatMap((p) =>
                              p.node2 ? [p.node1, p.node2] : [p.node1],
                            )
                            const isCapacityHistoryLoading = selectedPairs.some((pair) =>
                              refreshingCapacity.has(pair.key),
                            )
                            const agg = nodes.reduce(
                              (acc, node) => {
                                const phys = node.capacity?.physical
                                return {
                                  rawMarketingKiB: acc.rawMarketingKiB + (phys?.rawMarketingKiB ?? 0),
                                  usedKiB: acc.usedKiB + (phys?.usedKiB ?? 0),
                                  usablePerformanceTierKiB: acc.usablePerformanceTierKiB + (phys?.usablePerformanceTierKiB ?? 0),
                                  usedPerformanceTierKiB: acc.usedPerformanceTierKiB + (phys?.usedPerformanceTierKiB ?? 0),
                                }
                              },
                              { rawMarketingKiB: 0, usedKiB: 0, usablePerformanceTierKiB: 0, usedPerformanceTierKiB: 0 },
                            )
                            const aggWorkloads = nodes.reduce(
                              (acc, node) => {
                                const w = node.systemId ? workloadsData.get(node.systemId) : null
                                return {
                                  totalUsedKB: acc.totalUsedKB + (w?.totalUsedKB ?? 0),
                                  totalSnapshotsKiB: acc.totalSnapshotsKiB + (w?.totalSnapshotsKiB ?? 0),
                                  totalSizeKB: acc.totalSizeKB + (w?.totalSizeKB ?? 0),
                                }
                              },
                              { totalUsedKB: 0, totalSnapshotsKiB: 0, totalSizeKB: 0 },
                            )
                            const hasWorkloads = nodes.some((n) => n.systemId && workloadsData.has(n.systemId))
                            const areWorkloadsLoading = selectedPairs.some(
                              (p) =>
                                isNodeWorkloadsLoading(p.key, p.node1.systemId) ||
                                isNodeWorkloadsLoading(p.key, p.node2?.systemId),
                            )
                            const volumeRows = nodes.flatMap((node) => {
                              const w = node.systemId ? workloadsData.get(node.systemId) : null
                              return (w?.volumes ?? []).map((volume) => ({
                                nodeLabel: node.hostName || node.serialNumber,
                                volume,
                              }))
                            })
                            return (
                              <Stack gap="md">
                              <Paper withBorder radius="lg" p="md">
                                <Stack gap="md">
                                  <div>
                                    <Text fw={500}>Aggregated Capacity</Text>
                                    <Text size="xs" c="dimmed">
                                      {selectedPairs.length} HA pairs · {nodes.length} nodes
                                    </Text>
                                  </div>
                                  <CapacityHistoryChart
                                    nodes={nodes}
                                    isLoading={isCapacityHistoryLoading}
                                  />
                                  <CapacityGauge capacity={agg} />
                                  {hasWorkloads ? (() => {
                                    const fmt = (kib: number) => {
                                      const tib = kib / 1024 ** 3
                                      return tib >= 1 ? `${tib.toFixed(1)} TiB` : `${(kib / 1024 ** 2).toFixed(1)} GiB`
                                    }
                                    const usage = getVolumeUsage(aggWorkloads)
                                    const usedColor = usage.actualUsedPercent >= 90 ? 'red' : usage.actualUsedPercent >= 75 ? 'orange' : 'green'
                                    const snapshotPercent = Math.min(
                                      usage.snapshotUsedPercent,
                                      Math.max(0, 100 - usage.actualUsedPercent),
                                    )
                                    return (
                                      <Stack gap={4}>
                                        <Text fw={500} size="sm">Volumes</Text>
                                        <Text size="xs" c="dimmed">
                                          {fmt(usage.actualUsedKiB)} actual + {fmt(aggWorkloads.totalSnapshotsKiB)} snapshots / {fmt(usage.totalSizeKiB)}
                                        </Text>
                                        <Tooltip.Group openDelay={300} closeDelay={100}>
                                          <Progress.Root size="sm">
                                            <Tooltip label={`Actual used: ${fmt(usage.actualUsedKiB)}`}>
                                              <Progress.Section value={usage.actualUsedPercent} color={usedColor} />
                                            </Tooltip>
                                            {snapshotPercent > 0 ? (
                                              <Tooltip label={`Snapshots: ${fmt(aggWorkloads.totalSnapshotsKiB)}`}>
                                                <Progress.Section value={snapshotPercent} color="violet" />
                                              </Tooltip>
                                            ) : null}
                                          </Progress.Root>
                                        </Tooltip.Group>
                                      </Stack>
                                    )
                                  })() : areWorkloadsLoading ? (
                                    <VolumeSummarySkeleton size="sm" />
                                  ) : null}
                                </Stack>
                              </Paper>
                              {volumeRows.length > 0 ? (
                                <Paper withBorder radius="lg" p="md">
                                  <VolumesTable volumes={volumeRows} />
                                </Paper>
                              ) : areWorkloadsLoading ? (
                                <VolumesPanelSkeleton showNodeColumn />
                              ) : null}
                              </Stack>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="customers" pt="md">
                  <Stack gap="lg">
                    <div>
                      <Title order={3}>NAGP Customers</Title>
                      <Text size="sm" c="dimmed">
                        Locally stored NAGP ID and Name mappings.
                      </Text>
                    </div>

                    {Object.keys(nagpMappings).length === 0 ? (
                      <Paper withBorder radius="lg" p="xl">
                        <Text c="dimmed">
                          No NAGP mappings stored yet. Click the plus icon next to a NAGP ID in the
                          search results to save it.
                        </Text>
                      </Paper>
                    ) : (
                      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
                        {Object.entries(nagpMappings)
                          .sort((a, b) => a[1].localeCompare(b[1]))
                          .map(([nagpId, nagpName]) => (
                            <Card key={nagpId} withBorder radius="md" shadow="sm">
                              <Group justify="space-between" align="flex-start">
                                <Stack gap={4}>
                                  <Text fw={600}>{nagpName}</Text>
                                  <Text size="sm" c="dimmed">
                                    NAGP ID: {nagpId}
                                  </Text>
                                </Stack>
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  aria-label="Delete NAGP mapping"
                                  onClick={() => handleDeleteNagp(nagpId)}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Group>
                            </Card>
                          ))}
                      </SimpleGrid>
                    )}
                  </Stack>
                </Tabs.Panel>
              </Tabs>
            </Stack>
          </Container>
          )}
        </AppShell.Main>
      </AppShell>
    </>
  )
}

export default App
