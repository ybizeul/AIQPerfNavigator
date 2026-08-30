import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { DateTimePicker } from '@mantine/dates'
import '@mantine/dates/styles.css'
import './App.css'
import {
  ActionIcon,
  Alert,
  Anchor,
  AppShell,
  Badge,
  Button,
  Card,
  Checkbox,
  Combobox,
  Container,
  Divider,
  Drawer,
  Group,
  Loader,
  Menu,
  Modal,
  MultiSelect,
  Pagination,
  Paper,
  PasswordInput,
  Pill,
  PillsInput,
  Popover,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
  useCombobox,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { AreaChart } from '@mantine/charts'
import { useDisclosure, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import {
  IconArrowBack,
  IconBookmark,
  IconBuilding,
  IconChartLine,
  IconCheck,
  IconCloud,
  IconCopy,
  IconDeviceDesktop,
  IconDownload,
  IconFilter,
  IconFilterFilled,
  IconKey,
  IconKeyOff,
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
import { BUILD_INFO, rememberCurrentVersion, unseenReleaseVersions } from './version'

const API_URL = 'https://gql.aiq.netapp.com/graphql'
const TOKEN_REFRESH_URL = 'https://api.activeiq.netapp.com/v1/tokens/accessToken'
const REFRESH_TOKEN_HINT = 'From the Active IQ website.'
const PERFORMANCE_API_URL = 'https://api.activeiq.netapp.com/v1/performance-data/graphs'
const WATCHLIST_API_URL = 'https://api.activeiq.netapp.com/v2/watchlist/list'
const WATCHLIST_ACTION_API_URL = 'https://api.activeiq.netapp.com/v2/watchlist/action'
const PAGE_SIZE = 100
const BROWSER_DATA_FILENAME = 'aiqperfnav.aiq'
const BROWSER_DATA_FORMAT = 'aiq-perf-navigator-browser-data'
const BROWSER_DATA_PREFIX = 'aiq-system-organizer-'
const ACCESS_TOKEN_STORAGE_KEY = 'aiq-system-organizer-token'
const REFRESH_TOKEN_STORAGE_KEY = 'aiq-system-organizer-refresh-token'
const COLOR_SCHEME_STORAGE_KEY = 'mantine-color-scheme-value'
const SESSION_EXPIRED_MESSAGE =
  'Could not sign in to Active IQ. Check that your refresh token is still valid.'
const RATE_LIMIT_MESSAGE =
  'Active IQ is asking us to slow down. Wait a few seconds and try again.'
const ACTIVE_IQ_UNAVAILABLE_MESSAGE = 'Active IQ is unavailable. Try again later.'
const ACTIVE_IQ_REQUEST_FAILED_MESSAGE = 'Active IQ request failed. Try again.'
const ACTIVE_IQ_UNREACHABLE_MESSAGE =
  'Could not reach Active IQ. Check your network connection.'
const COLOR_SCHEME_LABELS = { auto: 'system', light: 'light', dark: 'dark' } as const
const NEXT_COLOR_SCHEME = { auto: 'light', light: 'dark', dark: 'auto' } as const
type BrowserDataExport = {
  format: typeof BROWSER_DATA_FORMAT
  version: 1
  exportedAt: string
  data: Record<string, string>
}

function isCredentialStorageKey(key: string) {
  return key === ACCESS_TOKEN_STORAGE_KEY || key === REFRESH_TOKEN_STORAGE_KEY
}

function isBrowserDataKey(key: string) {
  return key.startsWith(BROWSER_DATA_PREFIX) || key === COLOR_SCHEME_STORAGE_KEY
}

function isExportableBrowserDataKey(key: string) {
  return isBrowserDataKey(key) && !isCredentialStorageKey(key)
}

function isTokenExpiredError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not sign in') ||
    normalized.includes('session expired') ||
    normalized.includes('token is expired') ||
    normalized.includes('expired token') ||
    message.includes('401') ||
    message.includes('403')
  )
}

function isRateLimitedError(message: string) {
  return message === RATE_LIMIT_MESSAGE || message.includes('429')
}

function messageForHttpStatus(status: number) {
  if (status === 401 || status === 403) return SESSION_EXPIRED_MESSAGE
  if (status === 429) return RATE_LIMIT_MESSAGE
  if (status >= 500) return ACTIVE_IQ_UNAVAILABLE_MESSAGE
  return ACTIVE_IQ_REQUEST_FAILED_MESSAGE
}

function messageForGraphqlErrors(errors: GraphQlError[]) {
  const joined = errors.map((error) => error.message).join('\n')
  if (isTokenExpiredError(joined)) return SESSION_EXPIRED_MESSAGE
  return ACTIVE_IQ_REQUEST_FAILED_MESSAGE
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

const TAB_VALUES = ['search', 'saved', 'metrics'] as const
type TabValue = (typeof TAB_VALUES)[number]
type MetricsView = 'graphs' | 'capacity'
const DEFAULT_TAB: TabValue = 'search'
const DEFAULT_METRICS_VIEW: MetricsView = 'graphs'

type LocationState = {
  tab: TabValue
  metricsView: MetricsView
  openSavedFilters: boolean
}

function isTabValue(value: string | null): value is TabValue {
  return TAB_VALUES.includes(value as TabValue)
}

function parseLocation(): LocationState {
  const pathTab = window.location.pathname.split('/').filter(Boolean)[0] ?? null
  const viewParam = new URLSearchParams(window.location.search).get('view')

  if (pathTab === 'performance') {
    return { tab: 'metrics', metricsView: 'graphs', openSavedFilters: false }
  }
  if (pathTab === 'capacity') {
    return { tab: 'metrics', metricsView: 'capacity', openSavedFilters: false }
  }
  if (pathTab === 'customers') {
    return { tab: 'search', metricsView: DEFAULT_METRICS_VIEW, openSavedFilters: true }
  }
  if (pathTab === 'metrics') {
    return {
      tab: 'metrics',
      metricsView: viewParam === 'capacity' ? 'capacity' : DEFAULT_METRICS_VIEW,
      openSavedFilters: false,
    }
  }
  if (isTabValue(pathTab)) {
    return { tab: pathTab, metricsView: DEFAULT_METRICS_VIEW, openSavedFilters: false }
  }
  return { tab: DEFAULT_TAB, metricsView: DEFAULT_METRICS_VIEW, openSavedFilters: false }
}

function buildTabUrl(tab: TabValue, metricsView: MetricsView) {
  const url = new URL(window.location.href)
  url.pathname = `/${tab}`
  if (tab === 'metrics' && metricsView === 'capacity') {
    url.searchParams.set('view', 'capacity')
  } else {
    url.searchParams.delete('view')
  }
  return url
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

const QUERY_BY_CLUSTER_ID = `
  query SearchByClusterId($pageSize: Int!, $clusterId: String, $nagpId: String, $watchlistId: String, $customerId: String, $after: String) {
    systems(pageSize: $pageSize, clusterId: $clusterId, nagpId: $nagpId, watchlistId: $watchlistId, customerId: $customerId, after: $after) {
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
  scope: string
  watchlist: string
  query: string
}

type SearchQueryType = 'cluster' | 'clusterId' | 'serialNumber' | 'systemId' | 'hostName'

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

type ScopeKind = 'nagp' | 'customer'

type ScopeSelection = {
  kind: ScopeKind
  id: string
}

function encodeScopeSelection(kind: ScopeKind, id: string) {
  return `${kind}:${id}`
}

function parseScopeSelection(value: string): ScopeSelection | null {
  const separatorIndex = value.indexOf(':')
  if (separatorIndex < 1) return null

  const kind = value.slice(0, separatorIndex)
  const id = value.slice(separatorIndex + 1).trim()
  if (!id || (kind !== 'nagp' && kind !== 'customer')) return null

  return { kind, id }
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

// Graphs whose own series (protocols, network directions) can be stacked even for a
// single node. Every graph can additionally stack per node once several pairs are shown.
const STACKABLE_GRAPHS = ['node_protocol_iops', 'node_network_throughput']

// Within-bucket aggregation: how to reduce multiple sub-hourly raw samples into a single
// representative hourly value. Defaults to 'average'; headroom uses 'min' so that the
// worst-case (peak utilisation) moment in each hour is preserved rather than smoothed away.
const BUCKET_AGGREGATION: Record<string, 'average' | 'min' | 'max'> = {
  node_headroom_cpu_utilization: 'min',
  node_latency: 'max',
}

const AUTOMATIC_TAG_PREFIX = '_'
const CREATE_TAG_OPTION = '$create-tag'
const METROCLUSTER_TAG = '_metrocluster'
const RESERVED_TAG_LABELS = ['aff', 'fas', 'cvo', 'metrocluster'] as const
const RESERVED_TAG_LABEL_SET = new Set<string>(RESERVED_TAG_LABELS)
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

function getReservedTagKey(tag: string) {
  let result = tag.trim()
  while (result.startsWith(AUTOMATIC_TAG_PREFIX)) {
    result = result.slice(AUTOMATIC_TAG_PREFIX.length)
  }
  return result.toLowerCase()
}

function isReservedCustomTag(tag: string) {
  const trimmed = tag.trim()
  if (trimmed.length === 0) {
    return false
  }
  return trimmed.startsWith(AUTOMATIC_TAG_PREFIX) || RESERVED_TAG_LABEL_SET.has(getReservedTagKey(trimmed))
}

function getReservedTagHint(tag: string) {
  const trimmed = tag.trim()
  if (trimmed.startsWith(AUTOMATIC_TAG_PREFIX)) {
    return 'Names starting with "_" are reserved for automatic tags. Try a name without an underscore.'
  }
  return `"${getReservedTagKey(trimmed)}" is reserved for automatic tags. Try a different name.`
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
      ...tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && !isReservedCustomTag(tag)),
      ...automaticTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
    ]),
  ).sort(compareTags)
}

const emptySearchForm: SearchForm = {
  scope: '',
  watchlist: '',
  query: '',
}

// A search is always exactly one of these: a free-text term, a saved
// customer/NAGP, or a watchlist. The form never mixes them.
type SearchKind = 'query' | 'customer' | 'watchlist'

const WATCHLIST_OPTION_PREFIX = 'watchlist:'

const SEARCH_EMPTY_HINTS: Record<SearchKind, string> = {
  query:
    'Check the cluster name, serial number, system ID, or hostname, or pick a saved customer instead.',
  customer:
    'This customer or NAGP has no systems in Active IQ. Try another one, or search by name.',
  watchlist:
    'This watchlist has no systems in Active IQ. Try another watchlist, or search by name.',
}

function getSearchKind(form: SearchForm): SearchKind {
  if (normalizeValue(form.scope)) return 'customer'
  if (normalizeValue(form.watchlist)) return 'watchlist'
  return 'query'
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
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        clearTimeout(copiedTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setCopied(true)
        if (copiedTimeoutRef.current !== null) {
          clearTimeout(copiedTimeoutRef.current)
        }
        copiedTimeoutRef.current = setTimeout(() => {
          setCopied(false)
          copiedTimeoutRef.current = null
        }, 1500)
      })
      .catch((error) => {
        console.error('Failed to copy to clipboard:', error)
      })
  }

  const iconSize = size === 'xs' ? 12 : 14

  return (
    <UnstyledButton
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `Copied ${textToCopy}` : `Copy ${textToCopy}`}
      style={{ width: 'fit-content', maxWidth: '100%' }}
    >
      <Group gap={4} wrap="nowrap">
        <Text fw={fw} size={size} c={copied ? 'teal' : c} span truncate>
          {children}
        </Text>
        {copied ? (
          <IconCheck
            size={iconSize}
            style={{ color: 'var(--mantine-color-teal-6)', flexShrink: 0 }}
          />
        ) : (
          <IconCopy
            size={iconSize}
            style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }}
          />
        )}
      </Group>
    </UnstyledButton>
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
  customerId: string | null
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
    const customerId = pairs[0]?.node1.customer?.id ?? null
    const customerName = pairs[0]?.node1.customer?.name ?? pairs[0]?.node1.nagp?.name ?? null
    const siteName = pairs[0]?.node1.site?.name ?? null
    const siteId = pairs[0]?.node1.site?.id ?? pairs[0]?.node1.site?.cmatId ?? null
    const nagpId = pairs[0]?.node1.nagp?.id ?? null
    return {
      customerId: customerId || null,
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
  } else if (queryType === 'clusterId') {
    return [QUERY_BY_CLUSTER_ID, { ...base, clusterId: queryValue }]
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

function IncompleteTokenAlert({ value }: { value: string }) {
  const parts = value.trim().split('.').length
  if (!value.trim() || parts >= 4) return null

  return (
    <Alert color="yellow" title="This token looks incomplete">
      A complete Active IQ refresh token is one long string. This paste has {parts}{' '}
      {parts === 1 ? 'part' : 'parts'}; copy the whole token from Active IQ and try again.
    </Alert>
  )
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  // Clean the token - remove any whitespace that might have been introduced
  const cleanToken = refreshToken.replace(/\s/g, '')
  
  // Validate token format before sending
  const segments = cleanToken.split('.')
  if (segments.length < 4 || segments.length > 5) {
    throw new Error(
      `This refresh token does not look complete (${segments.length} parts, ${cleanToken.length} characters). Copy the entire token from Active IQ and try again.`,
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
  } catch {
    throw new Error(ACTIVE_IQ_UNREACHABLE_MESSAGE)
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
    } catch {
      throw new Error(ACTIVE_IQ_UNREACHABLE_MESSAGE)
    }
  }

  if (!response.ok) {
    throw new Error(messageForHttpStatus(response.status))
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
  } catch {
    throw new Error(ACTIVE_IQ_UNREACHABLE_MESSAGE)
  }

  if (!response.ok) {
    throw new Error(messageForHttpStatus(response.status))
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
  selection: ScopeSelection | null,
  watchlistId: string,
): Promise<SearchScope[]> {
  const nagpId = selection?.kind === 'nagp' ? selection.id : ''
  const customerId = selection?.kind === 'customer' ? selection.id : ''

  if (!watchlistId) {
    return [{ nagpId, watchlistId: '', customerId }]
  }

  const watchlistCustomerIds = await fetchWatchlistCustomerIds(token, watchlistId)
  if (watchlistCustomerIds.length > 0) {
    // A customer selection narrows the watchlist to that customer only.
    const scopedCustomerIds = customerId
      ? watchlistCustomerIds.filter((id) => id === customerId)
      : watchlistCustomerIds

    return scopedCustomerIds.map((id) => ({
      nagpId,
      watchlistId: '',
      customerId: id,
    }))
  }

  return [{ nagpId, watchlistId, customerId }]
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
  } catch {
    throw new Error(ACTIVE_IQ_UNREACHABLE_MESSAGE)
  }

  if (!response.ok) {
    throw new Error(messageForHttpStatus(response.status))
  }

  const payload = (await response.json()) as GraphQlResponse<SystemsQueryData>

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(messageForGraphqlErrors(payload.errors))
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
    console.warn('Cluster query failed')
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
    console.warn('Workloads query failed')
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
  } catch {
    throw new Error(ACTIVE_IQ_UNREACHABLE_MESSAGE)
  }

  if (!response.ok) {
    throw new Error(messageForHttpStatus(response.status))
  }

  const payload = (await response.json()) as GraphQlResponse<SystemsQueryData>

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(messageForGraphqlErrors(payload.errors))
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

const PARALLEL_SEARCH_QUERY_TYPES: SearchQueryType[] = [
  'cluster',
  'serialNumber',
  'systemId',
  'hostName',
]

const EMPTY_SEARCH_RESULTS: SearchResultState = {
  pairs: [],
  totalCount: 0,
  siteFilterWasClientSide: false,
}

function buildSearchResultState(
  systems: Iterable<SystemSummary>,
  query: string,
): SearchResultState {
  const systemMap = new Map<string, SystemSummary>()
  for (const system of systems) {
    if (!systemMap.has(system.serialNumber)) {
      systemMap.set(system.serialNumber, system)
    }
  }

  const unique = Array.from(systemMap.values())
  const siteMatches = unique.filter((system) => matchesCustomerSite(system, query))
  const siteFilterWasClientSide =
    siteMatches.length > 0 && siteMatches.length < unique.length
  const pairs = groupIntoHAPairs(unique)

  return {
    pairs,
    totalCount: pairs.length,
    siteFilterWasClientSide,
  }
}

function searchFetchTasks(
  token: string,
  scopes: SearchScope[],
  query: string,
): Array<Promise<SystemSummary[]>> {
  if (!query) {
    return scopes.map((scope) => fetchSystemsByFilters(token, scope))
  }

  return scopes.flatMap((scope) =>
    PARALLEL_SEARCH_QUERY_TYPES.map((queryType) =>
      fetchSystemsForQuery(token, scope, queryType, query),
    ),
  )
}

async function searchSystems(
  token: string,
  form: SearchForm,
  onUpdate?: (state: SearchResultState) => void,
): Promise<SearchResultState> {
  const query = normalizeValue(form.query)
  const selection = parseScopeSelection(normalizeValue(form.scope))
  const watchlist = normalizeValue(form.watchlist)

  if (!query && !selection && !watchlist) {
    return EMPTY_SEARCH_RESULTS
  }

  const scopes = await resolveSearchScopes(token, selection, watchlist)
  if (scopes.length === 0) {
    return EMPTY_SEARCH_RESULTS
  }

  const systemMap = new Map<string, SystemSummary>()

  const publish = () => {
    const state = buildSearchResultState(systemMap.values(), query)
    onUpdate?.(state)
    return state
  }

  const addSystems = (systems: SystemSummary[]) => {
    let added = false
    for (const system of systems) {
      if (!systemMap.has(system.serialNumber)) {
        systemMap.set(system.serialNumber, system)
        added = true
      }
    }
    if (added) {
      publish()
    }
  }

  const outcomes = await Promise.allSettled(
    searchFetchTasks(token, scopes, query).map((task) => task.then(addSystems)),
  )

  let tokenExpired: Error | null = null
  let rateLimited: Error | null = null
  const errors: Error[] = []

  for (const outcome of outcomes) {
    if (outcome.status !== 'rejected') continue
    const error =
      outcome.reason instanceof Error
        ? outcome.reason
        : new Error('Search failed with unknown error.')
    if (isTokenExpiredError(error.message)) {
      tokenExpired = error
    } else if (isRateLimitedError(error.message)) {
      rateLimited = error
    } else {
      errors.push(error)
    }
  }

  if (systemMap.size === 0) {
    if (tokenExpired) throw tokenExpired
    if (rateLimited) throw rateLimited
    if (errors.length > 0) throw errors[0]
  }

  return publish()
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
    throw new Error(messageForHttpStatus(response.status))
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

// Nodes whose data starts partway through the range have no keys on the earliest
// rows, so series must be collected across every point rather than just the first.
function collectSeriesKeys(data: ChartDataPoint[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const point of data) {
    for (const key of Object.keys(point)) {
      if (key === 'timestamp' || key === '__epochMs' || seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }
  return keys
}

function SaveScopeButton({
  label,
  alreadySaved,
  onSave,
}: {
  label: string
  alreadySaved: boolean
  onSave: () => void
}) {
  return (
    <Button
      size="compact-xs"
      variant="light"
      color={alreadySaved ? 'teal' : 'blue'}
      leftSection={alreadySaved ? <IconCheck size={12} /> : <IconPlus size={12} />}
      aria-label={alreadySaved ? `${label} already saved as a filter` : `Save ${label} as a filter`}
      onClick={onSave}
      disabled={alreadySaved}
    >
      {alreadySaved ? 'Saved as filter' : 'Save as filter'}
    </Button>
  )
}

function CustomerHeader({
  group,
  onSaveCustomer,
  customerAlreadySaved,
  onSaveNagp,
  nagpAlreadySaved,
}: {
  group: CustomerGroup
  onSaveCustomer?: () => void
  customerAlreadySaved?: boolean
  onSaveNagp?: () => void
  nagpAlreadySaved?: boolean
}) {
  return (
    <Group gap="xs" mb="xs">
      <ThemeIcon variant="light" color="blue" size="md">
        <IconBuilding size={16} />
      </ThemeIcon>
      <div>
        <Group gap={4}>
          <Text fw={600} size="sm">
            {group.customerName || 'Unknown customer'}
          </Text>
          {onSaveCustomer ? (
            <SaveScopeButton
              label="customer"
              alreadySaved={!!customerAlreadySaved}
              onSave={onSaveCustomer}
            />
          ) : null}
        </Group>
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
                <SaveScopeButton
                  label="NAGP"
                  alreadySaved={!!nagpAlreadySaved}
                  onSave={onSaveNagp}
                />
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
  onAddCluster,
  isAddingCluster,
  clusterAddDisabled,
}: {
  clusterGroup: ClusterGroup<T>
  renderPair: (pair: T) => ReactNode
  onAddCluster?: () => void
  isAddingCluster?: boolean
  clusterAddDisabled?: boolean
}) {
  return (
    <Stack component="section" gap="xs">
      <Group
        gap="xs"
        justify="space-between"
        wrap="wrap"
        pb={4}
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group gap="xs" wrap="nowrap">
          {clusterGroup.clusterName ? (
            <CopyableText fw={600} size="sm" textToCopy={clusterGroup.clusterName}>
              {clusterGroup.clusterName}
            </CopyableText>
          ) : (
            <Text fw={600} size="sm">
              No cluster
            </Text>
          )}
          {onAddCluster ? (
            <Button
              size="compact-xs"
              variant="light"
              loading={isAddingCluster}
              disabled={clusterAddDisabled}
              onClick={onAddCluster}
            >
              Save cluster
            </Button>
          ) : null}
        </Group>
        <Text size="xs" c="dimmed">
          {clusterGroup.pairs.length} HA pair{clusterGroup.pairs.length !== 1 ? 's' : ''}
        </Text>
      </Group>
      {clusterGroup.pairs.map((pair) => (
        <div key={pair.key}>
          {renderPair(pair)}
        </div>
      ))}
    </Stack>
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
  const [search, setSearch] = useState('')
  const reservedHintId = useId()
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })

  // Derived from the typed text so the hint appears as soon as a reserved
  // name is typed, and disappears as soon as it is edited away.
  const reservedHint =
    search.trim().length > 0 && isReservedCustomTag(search) ? getReservedTagHint(search) : null

  const automaticTags = value.filter(isAutomaticTag)
  const manualTags = value.filter((tag) => !isAutomaticTag(tag) && !isReservedCustomTag(tag))
  const availableTags = allTags.filter((tag) => !isReservedCustomTag(tag))

  const applyManualTags = (nextManualTags: string[]) => {
    onChange(normalizeTags(nextManualTags, automaticTags))
  }

  const handleAddTag = (rawTag: string) => {
    const tag = rawTag.trim()
    if (tag.length === 0) {
      return
    }
    if (isReservedCustomTag(tag)) {
      combobox.openDropdown()
      return
    }
    setSearch('')
    if (!manualTags.includes(tag)) {
      applyManualTags([...manualTags, tag])
    }
  }

  const handleRemoveTag = (tag: string) => {
    applyManualTags(manualTags.filter((item) => item !== tag))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      combobox.openDropdown()
      combobox.selectNextOption()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      combobox.selectPreviousOption()
      return
    }

    if (event.key === 'Escape') {
      combobox.closeDropdown()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (combobox.getSelectedOptionIndex() >= 0) {
        combobox.clickSelectedOption()
      } else {
        handleAddTag(search)
      }
      return
    }

    if (event.key === 'Backspace' && search.length === 0 && manualTags.length > 0) {
      event.preventDefault()
      handleRemoveTag(manualTags[manualTags.length - 1])
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const options = availableTags.filter(
    (tag) => !manualTags.includes(tag) && tag.toLowerCase().includes(normalizedSearch),
  )
  const canCreate =
    search.trim().length > 0 &&
    !isReservedCustomTag(search.trim()) &&
    ![...manualTags, ...availableTags].some((tag) => tag.toLowerCase() === normalizedSearch)

  return (
    <Stack gap={4}>
      <Combobox
        store={combobox}
        onOptionSubmit={(optionValue) => {
          handleAddTag(optionValue === CREATE_TAG_OPTION ? search : optionValue)
          combobox.updateSelectedOptionIndex('active')
        }}
      >
        <Combobox.DropdownTarget>
          <PillsInput
            rightSection={
              manualTags.length > 0 ? (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label="Clear tags"
                  onClick={() => applyManualTags([])}
                >
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            rightSectionPointerEvents="all"
            onClick={() => combobox.openDropdown()}
          >
            <Pill.Group>
              {automaticTags.map((tag) => (
                <Tooltip
                  key={tag}
                  label={tag === METROCLUSTER_TAG ? 'From MetroCluster' : 'From hardware model'}
                >
                  <Pill styles={{ label: { display: 'flex', alignItems: 'center', gap: 4 } }}>
                    <IconLock size={10} aria-hidden style={{ flexShrink: 0 }} />
                    {getTagLabel(tag)}
                  </Pill>
                </Tooltip>
              ))}
              {manualTags.map((tag) => (
                <Pill key={tag} withRemoveButton onRemove={() => handleRemoveTag(tag)}>
                  {tag}
                </Pill>
              ))}
              <PillsInput.Field
                placeholder="Add or choose a tag"
                value={search}
                aria-invalid={reservedHint ? true : undefined}
                aria-describedby={reservedHint ? reservedHintId : undefined}
                onChange={(event) => {
                  setSearch(event.currentTarget.value)
                  combobox.openDropdown()
                  combobox.updateSelectedOptionIndex()
                }}
                onFocus={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
                onKeyDown={handleKeyDown}
              />
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>

        <Combobox.Dropdown>
          {reservedHint ? (
            <Group
              gap={6}
              wrap="nowrap"
              align="flex-start"
              p="xs"
              id={reservedHintId}
              role="status"
            >
              <IconLock
                size={14}
                style={{ color: 'var(--mantine-color-dimmed)', marginTop: 2, flexShrink: 0 }}
              />
              <Text size="xs" c="dimmed">
                {reservedHint}
              </Text>
            </Group>
          ) : null}
          <Combobox.Options mah={220} style={{ overflowY: 'auto' }}>
            {options.map((tag) => (
              <Combobox.Option key={tag} value={tag}>
                {tag}
              </Combobox.Option>
            ))}
            {canCreate ? (
              <Combobox.Option value={CREATE_TAG_OPTION}>
                Create &quot;{search.trim()}&quot;
              </Combobox.Option>
            ) : null}
            {options.length === 0 && !canCreate && !reservedHint ? (
              <Combobox.Empty>No tags to add</Combobox.Empty>
            ) : null}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
      {reservedHint ? (
        <Text size="xs" c="dimmed">
          {reservedHint}
        </Text>
      ) : null}
    </Stack>
  )
}

function getAutomaticTagsForPair(pair: Pick<HAPair, 'node1'> | Pick<SavedHAPair, 'node1'>) {
  const tags = getAutomaticTagsForModel(pair.node1.hardwareModel?.name)
  if (pair.node1.isMetroCluster) {
    tags.push(METROCLUSTER_TAG)
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
          <Tooltip label={`Used: ${formatKiB(used)}`}>
            <Progress.Section value={usedPercentOfRaw} color={getUsedColor(usedPercent)}>
              <Progress.Label c={labelColor}>{formatKiB(used)}</Progress.Label>
            </Progress.Section>
          </Tooltip>
          {availablePercentOfRaw > 0 ? (
            <Tooltip label={`Usable: ${formatKiB(usable)}`}>
              <Progress.Section value={availablePercentOfRaw} color={usableColor}>
                <Progress.Label c={labelColor}>{formatKiB(usable - used)}</Progress.Label>
              </Progress.Section>
            </Tooltip>
          ) : null}
          {unusablePercentOfRaw > 0 ? (
            <Tooltip label={`Marketing: ${formatKiB(raw)}`}>
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
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Skeleton h={16} w={120} radius="sm" />
        <VolumesTableSkeleton showNodeColumn={showNodeColumn} />
      </Stack>
    </Paper>
  )
}

function SearchResultsSkeleton() {
  return (
    <Stack gap="md">
      {Array.from({ length: 2 }, (_, groupIndex) => (
        <Paper key={groupIndex} withBorder radius="md" p="md">
          <Stack gap="xs">
            <Skeleton h={16} w={180} radius="sm" />
            {Array.from({ length: 2 }, (_, cardIndex) => (
              <Paper key={cardIndex} withBorder radius="md" p="sm">
                <Stack gap="sm">
                  <Group grow>
                    <Stack gap={6}>
                      <Skeleton h={14} w="60%" radius="sm" />
                      <Skeleton h={10} w="40%" radius="sm" />
                      <Skeleton h={8} radius="xl" />
                    </Stack>
                    <Stack gap={6}>
                      <Skeleton h={14} w="60%" radius="sm" />
                      <Skeleton h={10} w="40%" radius="sm" />
                      <Skeleton h={8} radius="xl" />
                    </Stack>
                  </Group>
                  <Skeleton h={28} radius="sm" />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}

function SearchEmptyState({
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
}: {
  title: string
  description: string
  actionLabel?: string
  actionIcon?: ReactNode
  onAction?: () => void
}) {
  return (
    <Paper withBorder radius="md" p="xl">
      <Stack gap="sm" align="center">
        <ThemeIcon variant="light" color="gray" size="lg">
          <IconSearch size={18} />
        </ThemeIcon>
        <Text fw={500}>{title}</Text>
        <Text size="sm" c="dimmed" ta="center" maw={420}>
          {description}
        </Text>
        {actionLabel && onAction ? (
          <Button
            size="sm"
            leftSection={actionIcon ?? <IconSearch size={16} />}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
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

function getPairModels(pair: HAPair | SavedHAPair) {
  const models = [
    pair.node1.hardwareModel?.name
      ? { nodeLabel: 'Node 1', name: pair.node1.hardwareModel.name }
      : null,
    pair.node2?.hardwareModel?.name
      ? { nodeLabel: 'Node 2', name: pair.node2.hardwareModel.name }
      : null,
  ].filter((model): model is { nodeLabel: string; name: string } => model !== null)
  const hasDifferentModels = new Set(models.map((model) => model.name)).size > 1

  return {
    hasDifferentModels,
    displayedModels: hasDifferentModels ? models : models.slice(0, 1),
  }
}

function HardwareModelCornerBadge({ pair }: { pair: HAPair | SavedHAPair }) {
  const { hasDifferentModels, displayedModels } = getPairModels(pair)

  if (displayedModels.length === 0) return null

  return (
    <Group
      gap={0}
      wrap="nowrap"
      style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
    >
      {displayedModels.map((model, index) => (
        <Badge
          key={`${model.nodeLabel}-${model.name}`}
          size="sm"
          color={getHardwareModelColor(model.name)}
          variant="filled"
          style={{
            borderRadius: `${index === 0 ? '0.375rem' : '0'} 0 ${
              index === displayedModels.length - 1 ? '0.5rem' : '0'
            } 0`,
            paddingLeft: '0.5rem',
            paddingRight: '0.5rem',
          }}
        >
          {hasDifferentModels ? `${model.nodeLabel} ${model.name}` : model.name}
        </Badge>
      ))}
    </Group>
  )
}

function PairSelectionRow({
  pair,
  selected,
  onToggle,
}: {
  pair: SavedHAPair
  selected: boolean
  onToggle: () => void
}) {
  const label = pairLabel(pair)
  const { hasDifferentModels, displayedModels } = getPairModels(pair)
  const modelLabel = displayedModels
    .map((model) => (hasDifferentModels ? `${model.nodeLabel} ${model.name}` : model.name))
    .join(' / ')

  return (
    <Checkbox
      className="metrics-pair-row"
      checked={selected}
      onChange={onToggle}
      label={
        <Stack gap={4}>
          <Text size="sm" fw={500} lh={1.3}>
            {label}
          </Text>
          <Text size="xs" c="dimmed">
            {pairSerialLabel(pair)}
            {modelLabel ? ` · ${modelLabel}` : ''}
          </Text>
          {pair.tags.length > 0 ? (
            <Group gap={4}>
              {pair.tags.map((tag) => (
                <Badge
                  key={tag}
                  size="xs"
                  variant="filled"
                  color={getTagColor(tag)}
                >
                  {getTagLabel(tag)}
                </Badge>
              ))}
            </Group>
          ) : null}
        </Stack>
      }
      styles={{
        body: { alignItems: 'flex-start' },
        inner: { marginTop: 3 },
        label: { paddingInlineStart: 8 },
      }}
    />
  )
}

function MetricsPairLibrary({
  savedCount,
  visiblePairs,
  tagOptions,
  metricsTagFilter,
  selectedPairKeys,
  selectedPairKeySet,
  onFilterChange,
  onTogglePair,
  onApplyKeys,
}: {
  savedCount: number
  visiblePairs: SavedHAPair[]
  tagOptions: { value: string; label: string }[]
  metricsTagFilter: string[]
  selectedPairKeys: string[]
  selectedPairKeySet: Set<string>
  onFilterChange: (value: string[]) => void
  onTogglePair: (key: string) => void
  onApplyKeys: (keys: string[]) => void
}) {
  const allVisibleSelected =
    visiblePairs.length > 0 && visiblePairs.every((pair) => selectedPairKeySet.has(pair.key))

  return (
    <Paper withBorder radius="md" className="metrics-library">
      <div style={{ padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={500} size="sm">HA pairs</Text>
            <Text size="xs" c="dimmed">
              {visiblePairs.length}{metricsTagFilter.length > 0 ? ` / ${savedCount}` : ''} saved
              {selectedPairKeySet.size > 0
                ? ` · ${selectedPairKeySet.size} selected for Performance and Capacity`
                : ''}
            </Text>
          </div>
          {visiblePairs.length > 0 ? (
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => {
                onApplyKeys(allVisibleSelected ? [] : visiblePairs.map((pair) => pair.key))
              }}
            >
              {allVisibleSelected ? 'Clear' : 'Select all'}
            </Button>
          ) : null}
        </Group>
        <MultiSelect
          mt="xs"
          size="xs"
          placeholder="Filter by tag"
          data={tagOptions}
          value={metricsTagFilter}
          onChange={onFilterChange}
          clearable
          searchable
          withAlignedLabels
          nothingFoundMessage="No tags"
          leftSection={<IconTag size={12} />}
        />
      </div>
      <ScrollArea className="metrics-library-scroll" styles={{ scrollbar: { zIndex: 3 } }}>
        {groupPairsByCluster(visiblePairs).map((group, groupIndex) => {
          const clusterPairKeys = group.pairs.map((pair) => pair.key)
          const clusterSelected = group.pairs.every((pair) => selectedPairKeySet.has(pair.key))
          return (
            <div key={groupIndex}>
              <div
                style={{
                  padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
                  backgroundColor: 'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))',
                  borderBottom: '1px solid var(--mantine-color-default-border)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text size="xs" fw={600}>
                  {group.clusterName || 'Unknown'}
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  style={{ border: '1px solid var(--mantine-color-gray-4)' }}
                  onClick={() => {
                    onApplyKeys(
                      clusterSelected
                        ? selectedPairKeys.filter((key) => !clusterPairKeys.includes(key))
                        : [...new Set([...selectedPairKeys, ...clusterPairKeys])],
                    )
                  }}
                >
                  {clusterSelected ? 'Clear' : 'Select all'}
                </Button>
              </div>
              {group.pairs.map((pair) => (
                <PairSelectionRow
                  key={pair.key}
                  pair={pair}
                  selected={selectedPairKeySet.has(pair.key)}
                  onToggle={() => onTogglePair(pair.key)}
                />
              ))}
            </div>
          )
        })}
      </ScrollArea>
    </Paper>
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
    <Card withBorder radius="md" p="sm" style={{ position: 'relative' }}>
      <HardwareModelCornerBadge pair={pair} />

      <Stack gap="sm" pt={getPairModels(pair).displayedModels.length > 0 ? 'sm' : 0}>
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
  // Read on first render so the header does not flip layouts after mount.
  const isWideHeader = useMediaQuery('(min-width: 48em)', true, {
    getInitialValueInEffect: false,
  })
  const [tokenModalOpened, { open: openTokenModal, close: closeTokenModal }] =
    useDisclosure(false)
  const browserDataInputRef = useRef<HTMLInputElement>(null)
  const [browserDataError, setBrowserDataError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useLocalStorage({
    key: REFRESH_TOKEN_STORAGE_KEY,
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
  const [customerMappings, setCustomerMappings] = useLocalStorage<Record<string, string>>({
    key: 'aiq-system-organizer-customer-mappings',
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
  const [bootLocation] = useState(parseLocation)
  const [activeTab, setActiveTab] = useState<TabValue>(bootLocation.tab)
  const [metricsView, setMetricsView] = useState<MetricsView>(bootLocation.metricsView)
  const [savedFiltersOpened, { open: openSavedFilters, close: closeSavedFilters }] =
    useDisclosure(bootLocation.openSavedFilters)
  const [unseenVersions] = useState(unseenReleaseVersions)
  // A deep link that opens the saved filters drawer is a stronger intent than the
  // changelog, so hold the release notes back for the next plain visit instead.
  const [greetsNewRelease] = useState(
    () => unseenVersions.size > 0 && !bootLocation.openSavedFilters,
  )
  const [showNewReleaseNotice, setShowNewReleaseNotice] = useState(greetsNewRelease)
  const [versionModalOpened, { open: openVersionModal, close: closeVersionModal }] =
    useDisclosure(greetsNewRelease)
  const versionModalDescriptionId = useId()
  const versionLabel = BUILD_INFO.version
  const [searchForm, setSearchForm] = useState<SearchForm>(emptySearchForm)
  const [lastSearchKind, setLastSearchKind] = useState<SearchKind>('query')
  const searchCombobox = useCombobox({
    onDropdownClose: () => searchCombobox.resetSelectedOption(),
  })
  const searchFieldRef = useRef<HTMLInputElement>(null)
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
  const [hasSearched, setHasSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [savingClusterId, setSavingClusterId] = useState<string | null>(null)
  const [clusterSaveError, setClusterSaveError] = useState<string | null>(null)
  const [searchResultTags, setSearchResultTags] = useState<Map<string, string[]>>(new Map())
  const [performanceData, setPerformanceData] = useState<Map<string, ChartDataPoint[]>>(new Map())
  const [performanceLoading, setPerformanceLoading] = useState<Set<string>>(new Set())
  const [performanceError, setPerformanceError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState('7')
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null)
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null)
  const [searchPage, setSearchPage] = useState(1)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [stackSeries, setStackSeries] = useState(true)
  const [showHeadroom, setShowHeadroom] = useState(false)
  const [refreshingCapacity, setRefreshingCapacity] = useState<Set<string>>(new Set())
  const [workloadsData, setWorkloadsData] = useState<Map<string, WorkloadsSummary>>(new Map())
  const [workloadsLoading, setWorkloadsLoading] = useState<Set<string>>(new Set())
  const workloadsLoadingRef = useRef(new Set<string>())

  const lastFetchedDates = useRef<{ startDateStr: string; endDateStr: string } | null>(null)
  const hasRestoredSelection = useRef(false)
  const searchGenerationRef = useRef(0)

  const tokenRef = useRef('')
  const pendingTokenRequestRef = useRef<Promise<string> | null>(null)

  useEffect(() => {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  }, [])

  // First visits have nothing to greet, so record a baseline. An upgrade waits
  // until the changelog is dismissed so a reload still shows the notes.
  useEffect(() => {
    if (unseenVersions.size === 0) {
      rememberCurrentVersion()
    }
  }, [unseenVersions])

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
        }

        let nextWatchlists: Watchlist[]
        try {
          nextWatchlists = await fetchWatchlists(accessToken)
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (!isTokenExpiredError(message)) throw error

          accessToken = await refreshAccessToken(refreshToken)
          tokenRef.current = accessToken
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
  }, [refreshToken])

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
    const canonical = buildTabUrl(bootLocation.tab, bootLocation.metricsView)
    if (
      canonical.pathname !== window.location.pathname ||
      canonical.search !== window.location.search
    ) {
      window.history.replaceState(null, '', canonical)
    }
  }, [bootLocation.metricsView, bootLocation.tab])

  useEffect(() => {
    const handlePopState = () => {
      const next = parseLocation()
      setActiveTab(next.tab)
      setMetricsView(next.metricsView)
      if (next.openSavedFilters) {
        openSavedFilters()
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [openSavedFilters])

  function handleTabChange(value: string | null) {
    if (!isTabValue(value)) {
      return
    }
    setActiveTab(value)
    window.history.pushState(null, '', buildTabUrl(value, metricsView))
  }

  function handleMetricsViewChange(value: string) {
    const nextView: MetricsView = value === 'capacity' ? 'capacity' : 'graphs'
    setMetricsView(nextView)
    window.history.pushState(null, '', buildTabUrl('metrics', nextView))
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

  // With several pairs every graph stacks per node. With one pair only the graphs
  // that carry several series of their own can stack, and a node that reports a
  // single series leaves nothing to stack at all.
  const canStackCurrentGraphs = useMemo(() => {
    if (selectedPairKeys.length === 0) return false
    if (selectedPairKeys.length > 1) return true

    const pair = savedPairMap.get(selectedPairKeys[0])
    if (!pair) return false

    const nodes = [pair.node1, pair.node2].filter(Boolean) as SystemSummary[]
    let hasLoadedData = false
    for (const graphName of STACKABLE_GRAPHS) {
      for (const node of nodes) {
        const data = performanceData.get(`${node.serialNumber}::${graphName}`)
        if (!data || data.length === 0) continue
        hasLoadedData = true
        if (collectSeriesKeys(data).length > 1) return true
      }
    }

    // Nothing has arrived yet, so keep the control live rather than flickering.
    return !hasLoadedData
  }, [performanceData, selectedPairKeys, savedPairMap])

  const savedScopeEntries = useMemo(
    () =>
      [
        ...Object.entries(customerMappings).map(([id, name]) => ({
          kind: 'customer' as const,
          id,
          name,
        })),
        ...Object.entries(nagpMappings).map(([id, name]) => ({
          kind: 'nagp' as const,
          id,
          name,
        })),
      ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [customerMappings, nagpMappings],
  )

  // The scope list is a browsable menu of everything saved, so it stays
  // independent of whatever is typed in the field.
  const searchSuggestions = useMemo(
    () => ({
      customers: savedScopeEntries.filter((entry) => entry.kind === 'customer'),
      nagps: savedScopeEntries.filter((entry) => entry.kind === 'nagp'),
      watchlists,
    }),
    [savedScopeEntries, watchlists],
  )

  const selectedScope = useMemo(() => {
    if (searchForm.scope) {
      const selection = parseScopeSelection(searchForm.scope)
      const entry = selection
        ? savedScopeEntries.find(
            (candidate) => candidate.kind === selection.kind && candidate.id === selection.id,
          )
        : null
      return {
        kindLabel: selection?.kind === 'nagp' ? 'NAGP' : 'Customer',
        label: entry?.name ?? selection?.id ?? searchForm.scope,
      }
    }

    if (searchForm.watchlist) {
      const watchlist = watchlists.find((entry) => entry.id === searchForm.watchlist)
      return {
        kindLabel: 'Watchlist',
        label: watchlist?.name ?? searchForm.watchlist,
      }
    }

    return null
  }, [searchForm.scope, searchForm.watchlist, savedScopeEntries, watchlists])

  const hasSearchInput = Boolean(selectedScope) || normalizeValue(searchForm.query).length > 0

  const onlySiteFilterIsUsed = results.siteFilterWasClientSide && lastSearchKind === 'query'


  const handleTokenSave = () => {
    // Clean token - remove all whitespace including newlines
    setRefreshToken(draftRefreshToken.replace(/\s/g, ''))
    // Clear any existing access token - it will be fetched when needed
    tokenRef.current = ''
    closeTokenModal()
  }

  const handleBrowserDataExport = () => {
    const data = Object.fromEntries(
      Array.from({ length: window.localStorage.length }, (_, index) => {
        const key = window.localStorage.key(index)
        return key && isExportableBrowserDataKey(key)
          ? [key, window.localStorage.getItem(key) ?? '']
          : null
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
        throw new Error('The selected file is not a valid AIQ Navigator backup.')
      }

      const shouldImport = window.confirm(
        'Importing this backup will replace saved HA pairs and other browser data. ' +
          'Tokens in the file are ignored, so your refresh token will stay as it is. Continue?',
      )
      if (!shouldImport) {
        return
      }

      Object.keys(window.localStorage)
        .filter(isExportableBrowserDataKey)
        .forEach((key) => window.localStorage.removeItem(key))
      Object.entries(parsedData.data).forEach(([key, value]) => {
        if (isExportableBrowserDataKey(key)) {
          window.localStorage.setItem(key, value)
        }
      })
      window.location.reload()
    } catch (error) {
      setBrowserDataError(
        error instanceof SyntaxError || !(error instanceof Error)
          ? 'The backup could not be imported.'
          : error.message,
      )
    }
  }

  const runSearch = async (form: SearchForm) => {
    const activeForm: SearchForm = {
      scope: normalizeValue(form.scope),
      watchlist: normalizeValue(form.watchlist),
      query: normalizeValue(form.query),
    }

    if (!activeForm.scope && !activeForm.watchlist && !activeForm.query) {
      setSearchError('Enter a search term, or pick a saved customer or watchlist.')
      return
    }

    if (!refreshToken) {
      setSearchError('Set a refresh token first with the key button in the toolbar.')
      return
    }

    const generation = ++searchGenerationRef.current
    setLastSearchKind(getSearchKind(activeForm))
    setHasSearched(true)
    setIsLoading(true)
    setSearchError(null)
    setClusterSaveError(null)
    setSearchPage(1)
    setResults(EMPTY_SEARCH_RESULTS)

    const publishResults = (nextResults: SearchResultState) => {
      if (generation !== searchGenerationRef.current) return
      setResults(nextResults)
    }

    try {
      let accessToken: string
      try {
        accessToken = await getAccessToken()
      } catch (error) {
        if (generation !== searchGenerationRef.current) return
        setSearchError(
          error instanceof Error ? error.message : ACTIVE_IQ_UNREACHABLE_MESSAGE,
        )
        return
      }

      try {
        const nextResults = await searchSystems(accessToken, activeForm, publishResults)
        publishResults(nextResults)
      } catch (error) {
        if (generation !== searchGenerationRef.current) return
        console.error('Search error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Search failed with unknown error.'

        if (isTokenExpiredError(errorMessage)) {
          try {
            const newAccessToken = await renewAccessToken(accessToken)

            const nextResults = await searchSystems(
              newAccessToken,
              activeForm,
              publishResults,
            )
            publishResults(nextResults)
            return
          } catch (refreshError) {
            if (generation !== searchGenerationRef.current) return
            setSearchError(
              refreshError instanceof Error
                ? refreshError.message
                : ACTIVE_IQ_UNREACHABLE_MESSAGE,
            )
          }
        } else if (isRateLimitedError(errorMessage)) {
          setSearchError(RATE_LIMIT_MESSAGE)
        } else {
          setSearchError(errorMessage)
        }

        setResults(EMPTY_SEARCH_RESULTS)
      }
    } finally {
      if (generation === searchGenerationRef.current) {
        setIsLoading(false)
      }
    }
  }

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    searchCombobox.closeDropdown()
    void runSearch(searchForm)
  }

  // Picking a scope only fills the field; the search still has to be submitted.
  const handleSearchOptionSubmit = (value: string) => {
    searchCombobox.closeDropdown()

    setSearchForm((current) =>
      value.startsWith(WATCHLIST_OPTION_PREFIX)
        ? {
            scope: '',
            watchlist: value.slice(WATCHLIST_OPTION_PREFIX.length),
            query: current.query,
          }
        : { scope: value, watchlist: '', query: current.query },
    )
    setSearchError(null)
    searchFieldRef.current?.focus()
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      searchCombobox.openDropdown()
      searchCombobox.selectNextOption()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      searchCombobox.selectPreviousOption()
      return
    }

    if (event.key === 'Escape') {
      searchCombobox.closeDropdown()
      return
    }

    // Enter picks the highlighted suggestion when the user has arrowed into the
    // list; otherwise it falls through and submits the form as a text search.
    if (event.key === 'Enter') {
      if (searchCombobox.getSelectedOptionIndex() >= 0) {
        event.preventDefault()
        searchCombobox.clickSelectedOption()
      } else {
        searchCombobox.closeDropdown()
      }
      return
    }

    if (event.key === 'Backspace' && searchForm.query.length === 0 && selectedScope) {
      event.preventDefault()
      setSearchForm(emptySearchForm)
    }
  }

  const handleSearchQueryChange = (value: string) => {
    setSearchForm((current) => ({ ...current, query: value }))
    setSearchError(null)
    searchCombobox.openDropdown()
  }

  const handleClearSearch = () => {
    searchGenerationRef.current += 1
    searchCombobox.closeDropdown()
    setIsLoading(false)
    setHasSearched(false)
    setSearchForm(emptySearchForm)
    setSearchError(null)
    setClusterSaveError(null)
    setShowSavedOnly(false)
    setSearchPage(1)
    setResults(EMPTY_SEARCH_RESULTS)
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

  const handleSaveCluster = async (clusterId: string) => {
    if (!refreshToken) {
      setClusterSaveError('Set a refresh token first with the key button in the toolbar.')
      return
    }

    setSavingClusterId(clusterId)
    setClusterSaveError(null)

    try {
      let accessToken = await getAccessToken()

      const fetchClusterSystems = (token: string) =>
        fetchSystemsForQuery(token, EMPTY_SEARCH_SCOPE, 'clusterId', clusterId)

      let systems: SystemSummary[]
      try {
        systems = await fetchClusterSystems(accessToken)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Cluster search failed.'
        if (!isTokenExpiredError(errorMessage)) {
          throw error
        }

        accessToken = await renewAccessToken(accessToken)
        systems = await fetchClusterSystems(accessToken)
      }

      const systemMap = new Map<string, SystemSummary>()
      for (const system of systems) {
        if (!systemMap.has(system.serialNumber)) {
          systemMap.set(system.serialNumber, system)
        }
      }

      const pairs = groupIntoHAPairs(Array.from(systemMap.values()))
      if (pairs.length === 0) {
        setClusterSaveError('No systems found for this cluster.')
        return
      }

      const draftTagsByPair = searchResultTags
      setSavedPairs((current) => {
        const existingByKey = new Map(current.map((entry) => [entry.key, entry]))
        const additions: SavedHAPair[] = []
        const updates = new Map<string, SavedHAPair>()
        const savedAt = new Date().toISOString()

        for (const pair of pairs) {
          const [node1, node2] = addClusterNameToNodes(pair.node1, pair.node2)
          const automaticTags = getAutomaticTagsForPair(pair)
          const existing = existingByKey.get(pair.key)

          if (existing) {
            updates.set(pair.key, {
              ...existing,
              node1,
              node2,
              tags: normalizeTags(existing.tags, automaticTags),
            })
          } else {
            additions.push({
              key: pair.key,
              node1,
              node2,
              savedAt,
              tags: normalizeTags(draftTagsByPair.get(pair.key) ?? [], automaticTags),
            })
          }
        }

        return [...additions, ...current.map((entry) => updates.get(entry.key) ?? entry)]
      })
    } catch (error) {
      setClusterSaveError(
        error instanceof Error ? error.message : 'Failed to add cluster.',
      )
    } finally {
      setSavingClusterId(null)
    }
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

  const handleDeleteScope = (kind: ScopeKind, id: string) => {
    const setMappings = kind === 'nagp' ? setNagpMappings : setCustomerMappings
    setMappings((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setSearchForm((current) =>
      current.scope === encodeScopeSelection(kind, id) ? { ...current, scope: '' } : current,
    )
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
        if (isTokenExpiredError(msg)) {
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
        error instanceof Error ? error.message : ACTIVE_IQ_UNREACHABLE_MESSAGE,
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

      if (isTokenExpiredError(errorMessage)) {
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
          setPerformanceError(
            isTokenExpiredError(refreshErrorMsg)
              ? 'Authentication failed. Check that your refresh token has access to performance data.'
              : refreshErrorMsg,
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

  const tokenActionLabel = refreshToken
    ? 'Signed in. Open token settings'
    : 'Add refresh token'
  const handleTokenButtonClick = () => {
    setDraftRefreshToken(refreshToken)
    openTokenModal()
  }

  const handleVersionModalClose = () => {
    if (showNewReleaseNotice || unseenVersions.size > 0) {
      rememberCurrentVersion()
    }
    setShowNewReleaseNotice(false)
    closeVersionModal()
  }

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
        opened={versionModalOpened}
        onClose={handleVersionModalClose}
        title={showNewReleaseNotice ? "What's new" : 'Changelog'}
        aria-describedby={versionModalDescriptionId}
        closeOnClickOutside={!showNewReleaseNotice}
        centered
        size="lg"
      >
        <Stack gap="md">
          <ScrollArea.Autosize mah="70vh" type="auto">
            <Stack gap="lg">
              <Text size="sm" c="dimmed" id={versionModalDescriptionId}>
                {!versionLabel
                  ? 'This session has no version metadata. Start the app with the usual dev or production build to see the version and notes.'
                  : showNewReleaseNotice
                    ? `Updated to ${versionLabel} since your last visit. Reopen this anytime from the version in the header.`
                    : `Current version: ${versionLabel}`}
              </Text>
              {BUILD_INFO.releases.length === 0 ? (
                <Text size="sm">
                  {versionLabel
                    ? 'No feature or fix notes yet. They appear here after the next release.'
                    : 'Release notes need that build metadata too.'}
                </Text>
              ) : (
                BUILD_INFO.releases.map((release, releaseIndex) => (
                  <Stack key={release.version} gap="xs">
                    <Group gap="xs">
                      <Title order={3}>{release.version}</Title>
                      {unseenVersions.has(release.version) ? (
                        <Badge size="sm" color="blue">
                          New
                        </Badge>
                      ) : null}
                      {BUILD_INFO.isTagged && release.version === BUILD_INFO.version ? (
                        <Badge size="sm" variant="light">
                          Current
                        </Badge>
                      ) : null}
                    </Group>
                    {release.changes.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No feature or fix entries.
                      </Text>
                    ) : (
                      <Stack gap="xs">
                        {release.changes.map((change, index) => (
                          <Group
                            key={`${release.version}-${change.type}-${index}`}
                            gap="xs"
                            align="flex-start"
                            wrap="nowrap"
                          >
                            <Badge
                              color={change.type === 'feat' ? 'blue' : 'teal'}
                              variant="light"
                              size="sm"
                            >
                              {change.type === 'feat' ? 'Feature' : 'Fix'}
                            </Badge>
                            <Text size="sm">{change.description}</Text>
                          </Group>
                        ))}
                      </Stack>
                    )}
                    {releaseIndex < BUILD_INFO.releases.length - 1 ? <Divider /> : null}
                  </Stack>
                ))
              )}
            </Stack>
          </ScrollArea.Autosize>
          {showNewReleaseNotice ? (
            <Group justify="flex-end">
              <Button onClick={handleVersionModalClose}>Got it</Button>
            </Group>
          ) : null}
        </Stack>
      </Modal>
      <Modal
        opened={browserDataError !== null}
        onClose={() => setBrowserDataError(null)}
        title="Backup import"
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
            Paste a refresh token from Active IQ. It is stored only in this browser and is
            used only to sign in here.
          </Text>
          <PasswordInput
            label="Refresh token"
            placeholder="Paste your refresh token"
            description={REFRESH_TOKEN_HINT}
            value={draftRefreshToken}
            onChange={(event) => setDraftRefreshToken(event.currentTarget.value)}
          />
          <IncompleteTokenAlert value={draftRefreshToken} />
          <Group justify="flex-end">
            {refreshToken ? (
              <Button
                variant="default"
                color="red"
                onClick={() => {
                  tokenRef.current = ''
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
        </Stack>
      </Modal>

      <Drawer
        opened={savedFiltersOpened}
        onClose={closeSavedFilters}
        title="Saved filters"
        position="right"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Customers and NAGPs saved from search, used as scope chips in the search box.
          </Text>
          {savedScopeEntries.length === 0 ? (
            <Text c="dimmed">
              None yet. Use the plus next to a customer name or NAGP ID in search results to save
              a filter.
            </Text>
          ) : (
            <Stack gap="sm">
              {savedScopeEntries.map((entry) => (
                <Card key={`${entry.kind}:${entry.id}`} withBorder radius="md">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={4}>
                      <Group gap="xs">
                        <Text fw={600}>{entry.name}</Text>
                        <Badge
                          size="xs"
                          color={entry.kind === 'customer' ? 'blue' : 'grape'}
                        >
                          {entry.kind === 'customer' ? 'Customer' : 'NAGP'}
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed">
                        {entry.kind === 'customer' ? 'Customer ID' : 'NAGP ID'}: {entry.id}
                      </Text>
                    </Stack>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Delete ${entry.kind} mapping`}
                      onClick={() => handleDeleteScope(entry.kind, entry.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Drawer>

      <AppShell
        header={{ height: { base: 56, sm: 72 } }}
        footer={{ height: { base: 36, sm: 0 } }}
        padding={{ base: 'sm', sm: 'md', md: 'lg' }}
      >
        <AppShell.Header>
          <Container size="xl" h="100%" px={{ base: 'xs', sm: 'md' }}>
            <Group justify="space-between" align="center" h="100%" gap="sm" wrap="nowrap">
              <Group gap="xs" align="baseline" wrap="nowrap" style={{ minWidth: 0 }}>
                <Title
                  order={2}
                  fz={{ base: 'h4', sm: 'h2' }}
                  lh={1.2}
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  AIQ Navigator
                </Title>
                <UnstyledButton
                  visibleFrom="sm"
                  onClick={openVersionModal}
                  aria-label={versionLabel ? `Version ${versionLabel}. Open changelog` : 'Open changelog'}
                >
                  <Text size="xs" c="dimmed" td="underline">
                    {versionLabel || 'Changelog'}
                  </Text>
                </UnstyledButton>
              </Group>

              <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                <Tooltip label={`Appearance: ${COLOR_SCHEME_LABELS[colorScheme]}`}>
                  <ActionIcon
                    variant="default"
                    size={isWideHeader ? 'lg' : 'xl'}
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
                <Menu position="bottom-end" shadow="md" width={280}>
                  <Menu.Target>
                    {isWideHeader ? (
                      <Button
                        variant="default"
                        size="sm"
                        leftSection={<IconDownload size={16} />}
                        aria-label="Backup: import or export browser data"
                      >
                        Backup
                      </Button>
                    ) : (
                      <ActionIcon
                        variant="default"
                        size="xl"
                        aria-label="Backup: import or export browser data"
                      >
                        <IconDownload size={20} />
                      </ActionIcon>
                    )}
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Saved HA pairs and filters. Tokens are not included.</Menu.Label>
                    <Menu.Item
                      leftSection={<IconUpload size={16} />}
                      onClick={() => browserDataInputRef.current?.click()}
                    >
                      Import
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconDownload size={16} />}
                      onClick={handleBrowserDataExport}
                    >
                      Export
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                {isWideHeader ? (
                  <Button
                    variant={refreshToken ? 'light' : 'default'}
                    color={refreshToken ? 'teal' : undefined}
                    size="sm"
                    leftSection={
                      refreshToken ? <IconKey size={16} /> : <IconKeyOff size={16} />
                    }
                    aria-label={tokenActionLabel}
                    onClick={handleTokenButtonClick}
                  >
                    {refreshToken ? 'Signed in' : 'Add token'}
                  </Button>
                ) : (
                  <ActionIcon
                    variant={refreshToken ? 'light' : 'default'}
                    color={refreshToken ? 'teal' : undefined}
                    size="xl"
                    aria-label={tokenActionLabel}
                    onClick={handleTokenButtonClick}
                  >
                    {refreshToken ? <IconKey size={20} /> : <IconKeyOff size={20} />}
                  </ActionIcon>
                )}
              </Group>
            </Group>
          </Container>
        </AppShell.Header>

        <AppShell.Main>
          {!refreshToken && (
            <Container size="sm" py="xl">
              <Stack gap="xl" align="center" mt="xl">
                <Stack gap="xs" align="center">
                  <Title order={2}>Welcome to AIQ Navigator</Title>
                  <Text c="dimmed" ta="center">
                    You need an Active IQ refresh token to continue. Generate one on the{' '}
                    <Anchor href="https://aiq.netapp.com/api" target="_blank" rel="noopener noreferrer">
                      AIQ website
                    </Anchor>
                    {' '}and paste it here. It stays in this browser.
                  </Text>
                </Stack>
                <Paper withBorder radius="md" p="lg" style={{ width: '100%' }}>
                  <Stack gap="md">
                    <PasswordInput
                      label="Refresh token"
                      placeholder="Paste your refresh token"
                      description={REFRESH_TOKEN_HINT}
                      value={draftRefreshToken}
                      onChange={(event) => setDraftRefreshToken(event.currentTarget.value)}
                    />
                    <IncompleteTokenAlert value={draftRefreshToken} />
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
              <Tabs value={activeTab} onChange={handleTabChange}>
                <Tabs.List>
                  <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
                    Search
                  </Tabs.Tab>
                  <Tabs.Tab value="saved" leftSection={<IconBookmark size={16} />}>
                    Saved HA pairs
                  </Tabs.Tab>
                  <Tabs.Tab value="metrics" leftSection={<IconChartLine size={16} />}>
                    Metrics
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="search" pt="md">
                  <Stack gap="lg">
                    {!refreshToken ? (
                      <Alert color="yellow" title="Authentication required">
                        Use the key button in the toolbar to configure your refresh token before searching.
                      </Alert>
                    ) : null}

                    <Paper withBorder radius="md" p="lg">
                      <form onSubmit={handleSearch}>
                        <Stack gap="sm" align="center">
                          <div style={{ width: '100%', maxWidth: 620 }}>
                            <Group justify="flex-end" mb={4}>
                              <Button
                                type="button"
                                size="compact-xs"
                                variant="subtle"
                                leftSection={<IconBuilding size={14} />}
                                onClick={openSavedFilters}
                              >
                                Saved filters
                                {savedScopeEntries.length > 0 ? (
                                  <Badge size="xs" variant="light" circle>
                                    {savedScopeEntries.length}
                                  </Badge>
                                ) : null}
                              </Button>
                            </Group>
                            <Combobox
                              store={searchCombobox}
                              withinPortal={false}
                              onOptionSubmit={handleSearchOptionSubmit}
                            >
                              <Combobox.DropdownTarget>
                                <PillsInput
                                  label="Search"
                                  description="Searches cluster name, serial number, system ID, and hostname. Pick a saved customer, NAGP, or watchlist to search that scope, with or without a term."
                                  leftSection={<IconSearch size={16} />}
                                  radius="md"
                                  rightSection={
                                    <Group gap={2} h="100%" w="100%" wrap="nowrap" justify="flex-end">
                                      {hasSearchInput ? (
                                        <ActionIcon
                                          size="sm"
                                          variant="subtle"
                                          color="gray"
                                          aria-label="Clear search and results"
                                          onClick={handleClearSearch}
                                        >
                                          <IconX size={14} />
                                        </ActionIcon>
                                      ) : null}
                                      <ActionIcon
                                        type="submit"
                                        variant="filled"
                                        aria-label="Search systems"
                                        loading={isLoading}
                                        disabled={!hasSearchInput}
                                        h="100%"
                                        w={44}
                                        radius={0}
                                        style={{
                                          borderTopRightRadius: 'var(--mantine-radius-md)',
                                          borderBottomRightRadius: 'var(--mantine-radius-md)',
                                        }}
                                      >
                                        <IconArrowBack size={18} />
                                      </ActionIcon>
                                    </Group>
                                  }
                                  rightSectionWidth={hasSearchInput ? 68 : 44}
                                  rightSectionPointerEvents="all"
                                  onClick={() => searchCombobox.openDropdown()}
                                >
                                  <Pill.Group>
                                    {selectedScope ? (
                                      <Pill
                                        withRemoveButton
                                        onRemove={() => setSearchForm(emptySearchForm)}
                                      >
                                        {selectedScope.kindLabel}: {selectedScope.label}
                                      </Pill>
                                    ) : null}
                                    <PillsInput.Field
                                      placeholder={
                                        selectedScope
                                          ? 'Narrow within this scope (optional)'
                                          : 'Cluster, serial, system ID, hostname, or customer'
                                      }
                                      ref={searchFieldRef}
                                      value={searchForm.query}
                                      onChange={(event) =>
                                        handleSearchQueryChange(event.currentTarget.value)
                                      }
                                      onBlur={() => searchCombobox.closeDropdown()}
                                      onKeyDown={handleSearchKeyDown}
                                    />
                                  </Pill.Group>
                                </PillsInput>
                              </Combobox.DropdownTarget>

                              <Combobox.Dropdown>
                                <Combobox.Options mah={280} style={{ overflowY: 'auto' }}>
                                  {searchSuggestions.customers.length > 0 ? (
                                    <Combobox.Group label="Customers">
                                      {searchSuggestions.customers.map((entry) => (
                                        <Combobox.Option
                                          key={`customer-${entry.id}`}
                                          value={encodeScopeSelection('customer', entry.id)}
                                        >
                                          {entry.name}
                                        </Combobox.Option>
                                      ))}
                                    </Combobox.Group>
                                  ) : null}

                                  {searchSuggestions.nagps.length > 0 ? (
                                    <Combobox.Group label="NAGPs">
                                      {searchSuggestions.nagps.map((entry) => (
                                        <Combobox.Option
                                          key={`nagp-${entry.id}`}
                                          value={encodeScopeSelection('nagp', entry.id)}
                                        >
                                          {entry.name}
                                        </Combobox.Option>
                                      ))}
                                    </Combobox.Group>
                                  ) : null}

                                  {searchSuggestions.watchlists.length > 0 ? (
                                    <Combobox.Group label="Watchlists">
                                      {searchSuggestions.watchlists.map((watchlist) => (
                                        <Combobox.Option
                                          key={`watchlist-${watchlist.id}`}
                                          value={`${WATCHLIST_OPTION_PREFIX}${watchlist.id}`}
                                        >
                                          {watchlist.isDefault
                                            ? `${watchlist.name} (default)`
                                            : watchlist.name}
                                        </Combobox.Option>
                                      ))}
                                    </Combobox.Group>
                                  ) : null}

                                  {isWatchlistsLoading ? (
                                    <Combobox.Empty>
                                      <Group gap="xs" justify="center" wrap="nowrap">
                                        <Loader size="xs" />
                                        <span>Loading watchlists...</span>
                                      </Group>
                                    </Combobox.Empty>
                                  ) : searchSuggestions.customers.length === 0 &&
                                    searchSuggestions.nagps.length === 0 &&
                                    searchSuggestions.watchlists.length === 0 ? (
                                    <Combobox.Empty>
                                      Type to search systems. Saved customers and watchlists appear
                                      here once you have some.
                                    </Combobox.Empty>
                                  ) : null}
                                </Combobox.Options>
                              </Combobox.Dropdown>
                            </Combobox>
                          </div>

                          {watchlistsError ? (
                            <Text size="xs" c="red" ta="center">
                              Watchlists could not be loaded: {watchlistsError}
                            </Text>
                          ) : null}
                        </Stack>
                      </form>
                    </Paper>

                    {searchError ? <Alert color="red">{searchError}</Alert> : null}
                    {clusterSaveError ? <Alert color="red">{clusterSaveError}</Alert> : null}

                    {results.siteFilterWasClientSide ? (
                      <Alert color="blue" title="Customer site is checked after search">
                        Customer site is applied to the systems that came back, not as part of
                        the search itself. If the pair you want is not on this page, add a serial,
                        cluster, or hostname.
                        {onlySiteFilterIsUsed
                          ? ' Searching by site alone can miss systems that are further down the result list.'
                          : ''}
                      </Alert>
                    ) : null}

                    {hasSearched && (isLoading || results.pairs.length > 0 || !searchError) ? (
                      <>
                    <Group justify="space-between">
                      <div>
                        <Title order={3}>Search results</Title>
                        {isLoading && results.pairs.length === 0 ? (
                          <Text size="sm" c="dimmed">
                            Looking up HA pairs…
                          </Text>
                        ) : results.pairs.length > 0 ? (
                          <Text size="sm" c="dimmed">
                            Showing {filteredSearchResults.length} HA pairs
                            {showSavedOnly ? ' (saved only)' : ` (${results.totalCount} total)`}
                            {isLoading ? ' — still searching…' : '.'}
                          </Text>
                        ) : null}
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

                    {isLoading && results.pairs.length === 0 ? (
                      <SearchResultsSkeleton />
                    ) : results.pairs.length === 0 ? (
                      <SearchEmptyState
                        title="No HA pairs matched"
                        description={SEARCH_EMPTY_HINTS[lastSearchKind]}
                      />
                    ) : filteredSearchResults.length === 0 ? (
                      <SearchEmptyState
                        title="No saved HA pairs in these results"
                        description="Turn off 'Show saved only' to see every match from this search."
                      />
                    ) : (
                      <>
                        <Stack gap="md">
                          {groupPairsByCustomer(paginatedSearchResults).map((group, groupIndex) => (
                            <div key={groupIndex}>
                              <CustomerHeader
                                group={group}
                                onSaveCustomer={group.customerId ? () => {
                                  const name = group.customerName || group.customerId!
                                  setCustomerMappings((current) => ({ ...current, [group.customerId!]: name }))
                                } : undefined}
                                customerAlreadySaved={
                                  group.customerId ? !!customerMappings[group.customerId] : false
                                }
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
                                    onAddCluster={clusterGroup.clusterId
                                      ? () => void handleSaveCluster(clusterGroup.clusterId!)
                                      : undefined}
                                    isAddingCluster={savingClusterId === clusterGroup.clusterId}
                                    clusterAddDisabled={
                                      savingClusterId !== null &&
                                      savingClusterId !== clusterGroup.clusterId
                                    }
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
                                          actionLabel={isSaved ? 'Update saved pair' : 'Save HA pair'}
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
                      </>
                    ) : null}
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
                      <SearchEmptyState
                        title="No saved HA pairs yet"
                        description="Search for systems, then save the HA pairs you want to organize and analyze."
                        actionLabel="Search for HA pairs"
                        onAction={() => handleTabChange('search')}
                      />
                    ) : (
                      <Stack gap="md">
                        {filteredSavedPairs.length === 0 ? (
                          <SearchEmptyState
                            title="No saved HA pairs match"
                            description="Clear the filter to see every saved HA pair."
                            actionLabel="Clear filter"
                            actionIcon={<IconX size={16} />}
                            onAction={() => setSavedSystemsFilter('')}
                          />
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

                <Tabs.Panel value="metrics" pt="md">
                  <Stack gap="lg">
                    <Group justify="space-between" align="flex-end" wrap="wrap">
                      <div>
                        <Title order={3}>Metrics</Title>
                        <Text size="sm" c="dimmed">
                          Performance and capacity for saved HA pairs. The same selection is used
                          in both views.
                        </Text>
                      </div>
                      <SegmentedControl
                        value={metricsView}
                        onChange={handleMetricsViewChange}
                        data={[
                          { value: 'graphs', label: 'Performance' },
                          { value: 'capacity', label: 'Capacity' },
                        ]}
                      />
                    </Group>

                    {savedPairs.length === 0 ? (
                      <SearchEmptyState
                        title="No HA pairs available for Metrics"
                        description="Search for systems and save at least one HA pair to view performance and capacity."
                        actionLabel="Search for HA pairs"
                        onAction={() => handleTabChange('search')}
                      />
                    ) : (
                      <div className="metrics-layout">
                        <MetricsPairLibrary
                          savedCount={savedPairs.length}
                          visiblePairs={metricsVisiblePairs}
                          tagOptions={tagOptions}
                          metricsTagFilter={metricsTagFilter}
                          selectedPairKeys={selectedPairKeys}
                          selectedPairKeySet={selectedPairKeySet}
                          onFilterChange={handleMetricsTagFilterChange}
                          onTogglePair={handleTogglePairSelection}
                          onApplyKeys={applySelectedPairKeys}
                        />

                        <div className="metrics-main">
                          {metricsView === 'graphs' ? (
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
                              <Tooltip
                                multiline
                                w={260}
                                label={
                                  canStackCurrentGraphs
                                    ? selectedPairKeys.length > 1
                                      ? 'Stacks each node on top of the others, and stacks protocol and network series within a graph.'
                                      : 'Stacks the protocol and network series inside Protocol IOPs and Network Throughput.'
                                    : 'This HA pair reports a single series per graph, so there is nothing to stack. Select another HA pair to stack nodes together.'
                                }
                              >
                                <Switch
                                  label="Stack series"
                                  checked={stackSeries && canStackCurrentGraphs}
                                  disabled={!canStackCurrentGraphs}
                                  onChange={(event) => {
                                    const stacked = event.currentTarget.checked
                                    setStackSeries(stacked)
                                    if (stacked && selectedPairKeys.length > 1) {
                                      setShowHeadroom(false)
                                    }
                                  }}
                                  size="sm"
                                  pb={8}
                                />
                              </Tooltip>
                            </Group>

                            {selectedPairKeys.length === 0 ? (
                              <Paper withBorder radius="md" p="xl">
                                <Text c="dimmed" ta="center">
                                  Select one or more HA pairs to view performance graphs
                                </Text>
                              </Paper>
                            ) : !refreshToken ? (
                              <Alert color="yellow" title="Authentication required">
                                Configure your refresh token to view performance data.
                              </Alert>
                            ) : (
                                <Stack gap="lg">
                                  {performanceError ? (
                                    <Alert color="red" title="Error loading performance data">
                                      {performanceError}
                                    </Alert>
                                  ) : null}

                                  {PERFORMANCE_GRAPHS.map((graph) => {
                                    const isSinglePair = selectedPairKeys.length === 1
                                    const supportsStacking = STACKABLE_GRAPHS.includes(graph.name)
                                    const isGraphStacked = supportsStacking && stackSeries
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
                                      const keys = collectSeriesKeys(data)
                                      
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
                                      <Paper key={graph.name} withBorder radius="md" p="md">
                                        <Stack gap="md">
                                          <Group justify="space-between" align="flex-start">
                                            <div>
                                              <Text fw={500}>{graph.label}</Text>
                                              <Text size="xs" c="dimmed">
                                                {graph.description}
                                              </Text>
                                            </div>
                                            {graph.name === 'node_headroom_cpu_utilization' ? (
                                              <Tooltip
                                                label="Unstack series to compare headroom against CPU utilization."
                                                disabled={!(stackSeries && !isSinglePair)}
                                              >
                                                <Switch
                                                  label="Show headroom"
                                                  checked={showHeadroom}
                                                  onChange={(event) => setShowHeadroom(event.currentTarget.checked)}
                                                  size="sm"
                                                  disabled={stackSeries && !isSinglePair}
                                                />
                                              </Tooltip>
                                            ) : null}
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
                                            graph.name === 'node_headroom_cpu_utilization' && stackSeries ? (
                                              <AreaChart
                                                h={250}
                                                data={chartData}
                                                dataKey="timestamp"
                                                type="stacked"
                                                strokeWidth={1}
                                                withGradient={false}
                                                series={(() => {
                                                  const keys = collectSeriesKeys(chartData).filter((key) => {
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
                                                type={isGraphStacked || (stackSeries && graph.name === 'node_avg_iops') ? 'stacked' : undefined}
                                                series={(() => {
                                                  const keys = collectSeriesKeys(chartData).filter((key) => {
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
                            )}
                          </Stack>
                          ) : (
                          <>
                          {selectedPairKeySet.size === 0 ? (
                            <Paper withBorder radius="md" p="xl">
                              <Text c="dimmed" ta="center">
                                Select one or more HA pairs to view capacity details
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
                                <Paper withBorder radius="md" p="md">
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
                                  <Paper withBorder radius="md" p="md">
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
                              <Paper withBorder radius="md" p="md">
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
                                <Paper withBorder radius="md" p="md">
                                  <VolumesTable volumes={volumeRows} />
                                </Paper>
                              ) : areWorkloadsLoading ? (
                                <VolumesPanelSkeleton showNodeColumn />
                              ) : null}
                              </Stack>
                            )
                          })()}
                          </>
                          )}
                        </div>
                      </div>
                    )}
                  </Stack>
                </Tabs.Panel>
              </Tabs>
            </Stack>
          </Container>
          )}
        </AppShell.Main>

        <AppShell.Footer hiddenFrom="sm" withBorder={false}>
          <UnstyledButton
            w="100%"
            h="100%"
            px="md"
            onClick={openVersionModal}
            aria-label={versionLabel ? `Version ${versionLabel}. Open changelog` : 'Open changelog'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text size="xs" c="dimmed" td="underline">
              {versionLabel || 'Changelog'}
            </Text>
          </UnstyledButton>
        </AppShell.Footer>
      </AppShell>
    </>
  )
}

export default App
