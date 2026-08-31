export type GroupingNode = {
  serialNumber: string
  hostName: string | null
  nagp: {
    id: string | null
    name: string | null
  } | null
  customer: {
    id: string | null
    name: string | null
  } | null
  cluster: {
    id: string | null
    name: string | null
  } | null
  site: {
    id: string | null
    name: string | null
    cmatId: string | null
  } | null
}

export type GroupingPair = {
  key: string
  node1: GroupingNode
  node2: GroupingNode | null
}

export type ClusterGroup<T extends GroupingPair = GroupingPair> = {
  key: string
  clusterId: string | null
  clusterName: string | null
  pairs: T[]
}

export type SiteGroup<T extends GroupingPair = GroupingPair> = {
  key: string
  siteId: string | null
  siteName: string | null
  clusters: ClusterGroup<T>[]
}

export type CustomerGroup<T extends GroupingPair = GroupingPair> = {
  key: string
  customerId: string | null
  customerName: string | null
  sites: SiteGroup<T>[]
}

export type NagpGroup<T extends GroupingPair = GroupingPair> = {
  key: string
  nagpId: string | null
  nagpName: string | null
  customers: CustomerGroup<T>[]
}

export type GroupTotals = {
  nagp: Record<string, number>
  customer: Record<string, number>
  site: Record<string, number>
  cluster: Record<string, number>
}

export const REVEAL_UNIT_PAIR_BUDGET = 20

export type RevealUnit = {
  kind: 'customer' | 'site' | 'cluster'
  key: string
  customerKey: string
  siteKey: string | null
  pairCount: number
}

function normalizeForGrouping(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function displayOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function compareOptional(a: string, b: string): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b)
}

function identityKey(id: string, name: string): string {
  if (id) return `id:${id}`
  if (name) return `name:${name}`
  return 'unknown'
}

function namedRef(
  pair: GroupingPair,
  pick: (node: GroupingNode) => { id: string | null; name: string | null } | null,
): { id: string | null; name: string | null } | null {
  const fromNode1 = pick(pair.node1)
  if (displayOrNull(fromNode1?.id) || displayOrNull(fromNode1?.name)) return fromNode1
  return pair.node2 ? pick(pair.node2) : fromNode1
}

function siteRef(pair: GroupingPair): GroupingNode['site'] {
  const fromNode1 = pair.node1.site
  if (displayOrNull(fromNode1?.id) || displayOrNull(fromNode1?.cmatId) || displayOrNull(fromNode1?.name)) {
    return fromNode1
  }
  return pair.node2?.site ?? fromNode1
}

function nodeName(node: GroupingNode): string {
  return node.hostName || node.serialNumber
}

function pairNodeSortKey(pair: GroupingPair): string {
  const names = [nodeName(pair.node1)]
  if (pair.node2) names.push(nodeName(pair.node2))
  names.sort((a, b) => a.localeCompare(b))
  return names.join('::')
}

function nagpRef(pair: GroupingPair) {
  return namedRef(pair, (node) => node.nagp)
}

function customerRef(pair: GroupingPair) {
  return namedRef(pair, (node) => node.customer)
}

function clusterRef(pair: GroupingPair) {
  return namedRef(pair, (node) => node.cluster)
}

function siteIdValue(site: GroupingNode['site']): string {
  return displayOrNull(site?.id) ?? displayOrNull(site?.cmatId) ?? ''
}

export function nagpGroupKey(pair: GroupingPair): string {
  const nagp = nagpRef(pair)
  return identityKey(displayOrNull(nagp?.id) ?? '', normalizeForGrouping(nagp?.name))
}

export function clientGroupKey(pair: GroupingPair): string {
  const customer = customerRef(pair)
  return identityKey(displayOrNull(customer?.id) ?? '', normalizeForGrouping(customer?.name))
}

export function siteGroupKey(pair: GroupingPair): string {
  const site = siteRef(pair)
  const id = displayOrNull(site?.id)
  if (id) return `id:${id}`
  const cmatId = displayOrNull(site?.cmatId)
  if (cmatId) return `cmat:${cmatId}`
  return identityKey('', normalizeForGrouping(site?.name))
}

export function clusterGroupKey(pair: GroupingPair): string {
  const cluster = clusterRef(pair)
  return identityKey(displayOrNull(cluster?.id) ?? '', normalizeForGrouping(cluster?.name))
}

export function scopedCustomerKey(nagpKey: string, customerKey: string): string {
  return `${nagpKey}::${customerKey}`
}

export function scopedSiteKey(nagpKey: string, customerKey: string, siteKey: string): string {
  return `${nagpKey}::${customerKey}::${siteKey}`
}

export function scopedClusterKey(
  nagpKey: string,
  customerKey: string,
  siteKey: string,
  clusterKey: string,
): string {
  return `${nagpKey}::${customerKey}::${siteKey}::${clusterKey}`
}

export function comparePairsForGrouping(a: GroupingPair, b: GroupingPair): number {
  const nagpName = compareOptional(
    normalizeForGrouping(nagpRef(a)?.name),
    normalizeForGrouping(nagpRef(b)?.name),
  )
  if (nagpName !== 0) return nagpName
  const nagpId = compareOptional(
    displayOrNull(nagpRef(a)?.id) ?? '',
    displayOrNull(nagpRef(b)?.id) ?? '',
  )
  if (nagpId !== 0) return nagpId

  const clientName = compareOptional(
    normalizeForGrouping(customerRef(a)?.name),
    normalizeForGrouping(customerRef(b)?.name),
  )
  if (clientName !== 0) return clientName
  const clientId = compareOptional(
    displayOrNull(customerRef(a)?.id) ?? '',
    displayOrNull(customerRef(b)?.id) ?? '',
  )
  if (clientId !== 0) return clientId

  const siteName = compareOptional(
    normalizeForGrouping(siteRef(a)?.name),
    normalizeForGrouping(siteRef(b)?.name),
  )
  if (siteName !== 0) return siteName
  const siteId = compareOptional(siteIdValue(siteRef(a)), siteIdValue(siteRef(b)))
  if (siteId !== 0) return siteId

  const clusterName = compareOptional(
    normalizeForGrouping(clusterRef(a)?.name),
    normalizeForGrouping(clusterRef(b)?.name),
  )
  if (clusterName !== 0) return clusterName
  const clusterId = compareOptional(
    displayOrNull(clusterRef(a)?.id) ?? '',
    displayOrNull(clusterRef(b)?.id) ?? '',
  )
  if (clusterId !== 0) return clusterId

  return pairNodeSortKey(a).localeCompare(pairNodeSortKey(b))
}

export function sortPairsForDisplay<T extends GroupingPair>(pairs: T[]): T[] {
  return [...pairs].sort(comparePairsForGrouping)
}

function groupByKey<T>(items: T[], keyFn: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const existing = groups.get(key)
    if (existing) {
      existing.push(item)
    } else {
      groups.set(key, [item])
    }
  }
  return Array.from(groups.values())
}

function nestClusters<T extends GroupingPair>(pairs: T[]): ClusterGroup<T>[] {
  return groupByKey(pairs, clusterGroupKey).map((groupPairs) => {
    const cluster = clusterRef(groupPairs[0]!)
    return {
      key: clusterGroupKey(groupPairs[0]!),
      clusterId: displayOrNull(cluster?.id),
      clusterName: displayOrNull(cluster?.name),
      pairs: groupPairs,
    }
  })
}

function nestSites<T extends GroupingPair>(pairs: T[]): SiteGroup<T>[] {
  return groupByKey(pairs, siteGroupKey).map((groupPairs) => {
    const site = siteRef(groupPairs[0]!)
    return {
      key: siteGroupKey(groupPairs[0]!),
      siteId: siteIdValue(site) || null,
      siteName: displayOrNull(site?.name),
      clusters: nestClusters(groupPairs),
    }
  })
}

function nestCustomers<T extends GroupingPair>(pairs: T[]): CustomerGroup<T>[] {
  return groupByKey(pairs, clientGroupKey).map((groupPairs) => {
    const customer = customerRef(groupPairs[0]!)
    return {
      key: clientGroupKey(groupPairs[0]!),
      customerId: displayOrNull(customer?.id),
      customerName: displayOrNull(customer?.name),
      sites: nestSites(groupPairs),
    }
  })
}

export function groupPairsByCluster<T extends GroupingPair>(pairs: T[]): ClusterGroup<T>[] {
  return nestClusters(sortPairsForDisplay(pairs))
}

export function groupPairsForDisplay<T extends GroupingPair>(pairs: T[]): NagpGroup<T>[] {
  return groupByKey(sortPairsForDisplay(pairs), nagpGroupKey).map((groupPairs) => {
    const nagp = nagpRef(groupPairs[0]!)
    return {
      key: nagpGroupKey(groupPairs[0]!),
      nagpId: displayOrNull(nagp?.id),
      nagpName: displayOrNull(nagp?.name),
      customers: nestCustomers(groupPairs),
    }
  })
}

export function sitePairCount(group: SiteGroup): number {
  return group.clusters.reduce((count, cluster) => count + cluster.pairs.length, 0)
}

export function customerPairCount(group: CustomerGroup): number {
  return group.sites.reduce((count, site) => count + sitePairCount(site), 0)
}

export function nagpPairCount(group: NagpGroup): number {
  return group.customers.reduce((count, customer) => count + customerPairCount(customer), 0)
}

export function groupPairTotals(groups: NagpGroup[]): GroupTotals {
  const totals: GroupTotals = { nagp: {}, customer: {}, site: {}, cluster: {} }
  for (const nagp of groups) {
    totals.nagp[nagp.key] = nagpPairCount(nagp)
    for (const customer of nagp.customers) {
      const customerKey = scopedCustomerKey(nagp.key, customer.key)
      totals.customer[customerKey] = customerPairCount(customer)
      for (const site of customer.sites) {
        const siteKey = scopedSiteKey(nagp.key, customer.key, site.key)
        totals.site[siteKey] = sitePairCount(site)
        for (const cluster of site.clusters) {
          totals.cluster[scopedClusterKey(nagp.key, customer.key, site.key, cluster.key)] =
            cluster.pairs.length
        }
      }
    }
  }
  return totals
}

export function planGroupReveals<T extends GroupingPair>(
  groups: NagpGroup<T>[],
  pairBudget = REVEAL_UNIT_PAIR_BUDGET,
): RevealUnit[] {
  const units: RevealUnit[] = []
  for (const nagp of groups) {
    for (const customer of nagp.customers) {
      const customerKey = scopedCustomerKey(nagp.key, customer.key)
      const customerCount = customerPairCount(customer)
      if (customerCount <= pairBudget) {
        units.push({
          kind: 'customer',
          key: customerKey,
          customerKey,
          siteKey: null,
          pairCount: customerCount,
        })
        continue
      }

      for (const site of customer.sites) {
        const siteKey = scopedSiteKey(nagp.key, customer.key, site.key)
        const siteCount = sitePairCount(site)
        if (siteCount <= pairBudget) {
          units.push({
            kind: 'site',
            key: siteKey,
            customerKey,
            siteKey,
            pairCount: siteCount,
          })
          continue
        }

        for (const cluster of site.clusters) {
          units.push({
            kind: 'cluster',
            key: scopedClusterKey(nagp.key, customer.key, site.key, cluster.key),
            customerKey,
            siteKey,
            pairCount: cluster.pairs.length,
          })
        }
      }
    }
  }
  return units
}

export function initialRevealKeys(
  units: RevealUnit[],
  pairBudget = REVEAL_UNIT_PAIR_BUDGET,
): Set<string> {
  let pairCount = 0
  const keys = new Set<string>()
  for (const unit of units) {
    if (keys.size > 0 && pairCount >= pairBudget) break
    keys.add(unit.key)
    pairCount += unit.pairCount
  }
  return keys
}

export function nextRevealKey(
  units: RevealUnit[],
  revealedKeys: ReadonlySet<string>,
  collapsedKeys: ReadonlySet<string>,
): string | null {
  for (const unit of units) {
    if (revealedKeys.has(unit.key)) continue
    const isHidden =
      collapsedKeys.has(unit.customerKey) ||
      (unit.siteKey !== null && collapsedKeys.has(unit.siteKey))
    if (!isHidden) return unit.key
  }
  return null
}

export function remapRevealedKeys(
  previousUnits: RevealUnit[],
  nextUnits: RevealUnit[],
  previousKeys: ReadonlySet<string>,
): Set<string> {
  const nextKeys = new Set(nextUnits.map((unit) => unit.key))
  const previousByKey = new Map(previousUnits.map((unit) => [unit.key, unit]))
  const remapped = new Set<string>()

  for (const key of previousKeys) {
    if (nextKeys.has(key)) {
      remapped.add(key)
      continue
    }

    const previousUnit = previousByKey.get(key)
    if (!previousUnit) continue
    for (const nextUnit of nextUnits) {
      if (
        (previousUnit.kind === 'customer' &&
          nextUnit.customerKey === previousUnit.customerKey) ||
        (previousUnit.kind === 'site' &&
          previousUnit.siteKey !== null &&
          nextUnit.siteKey === previousUnit.siteKey)
      ) {
        remapped.add(nextUnit.key)
      }
    }
  }

  return remapped.size > 0 ? remapped : initialRevealKeys(nextUnits)
}

export function visibleRevealPairCount(
  units: RevealUnit[],
  revealedKeys: ReadonlySet<string>,
): number {
  return units
    .filter((unit) => revealedKeys.has(unit.key))
    .reduce((count, unit) => count + unit.pairCount, 0)
}

export function sliceGroupsByRevealKeys<T extends GroupingPair>(
  groups: NagpGroup<T>[],
  units: RevealUnit[],
  revealedKeys: ReadonlySet<string>,
): NagpGroup<T>[] {
  const visibleUnits = units.filter((unit) => revealedKeys.has(unit.key))
  const customerKeys = new Set(
    visibleUnits.filter((unit) => unit.kind === 'customer').map((unit) => unit.key),
  )
  const siteKeys = new Set(
    visibleUnits.filter((unit) => unit.kind === 'site').map((unit) => unit.key),
  )
  const clusterKeys = new Set(
    visibleUnits.filter((unit) => unit.kind === 'cluster').map((unit) => unit.key),
  )

  return groups.flatMap((nagp) => {
    const customers = nagp.customers.flatMap((customer) => {
      const customerKey = scopedCustomerKey(nagp.key, customer.key)
      if (customerKeys.has(customerKey)) return [customer]

      const sites = customer.sites.flatMap((site) => {
        const siteKey = scopedSiteKey(nagp.key, customer.key, site.key)
        if (siteKeys.has(siteKey)) return [site]

        const clusters = site.clusters.filter((cluster) =>
          clusterKeys.has(scopedClusterKey(nagp.key, customer.key, site.key, cluster.key)),
        )
        return clusters.length > 0 ? [{ ...site, clusters }] : []
      })
      return sites.length > 0 ? [{ ...customer, sites }] : []
    })
    return customers.length > 0 ? [{ ...nagp, customers }] : []
  })
}
